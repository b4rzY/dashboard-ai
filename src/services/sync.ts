import 'server-only';
import { randomUUID } from 'node:crypto';
import { db } from '@/lib/db';
import { FintocBankingProvider, ProviderError } from '@/providers/fintoc';
import type { BankingProvider, ProviderTransaction, ProviderAccount } from '@/providers/banking';
import { Prisma } from '@prisma/client';
import { persistTransactions } from './transaction-store';
export function safeSyncError(error: unknown) {
  return error instanceof ProviderError
    ? error.message
    : error instanceof Prisma.PrismaClientKnownRequestError
      ? `Error de persistencia (${error.code})`
      : 'No se pudo completar la sincronización';
}
export function deduplicate(rows: ProviderTransaction[]) {
  return [...new Map(rows.map((r) => [r.id, r])).values()];
}
export async function syncConnection(
  connectionId: string,
  providerOverride?: BankingProvider,
  accountId?: string,
) {
  const connection = await db.bankConnection.findUniqueOrThrow({ where: { id: connectionId } });
  if (connection.provider === 'MANUAL' && !providerOverride) return { skipped: true, processed: 0 };
  if (connection.provider !== 'FINTOC' && !providerOverride)
    throw new ProviderError(0, 'Proveedor aún no implementado');
  const credential = connection.credentialKey ? process.env[connection.credentialKey] : undefined;
  if (!credential && !providerOverride) {
    await db.bankConnection.update({
      where: { id: connectionId },
      data: {
        status: 'NEEDS_ATTENTION',
        errorMessage: 'Falta la credencial de esta conexión en el servidor',
        lastAttemptAt: new Date(),
      },
    });
    return { skipped: true, processed: 0 };
  }
  const leaseToken = randomUUID();
  const now = new Date();
  const acquired = await db.bankConnection.updateMany({
    where: { id: connectionId, OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }] },
    data: {
      status: 'SYNCING',
      lastAttemptAt: now,
      leaseUntil: new Date(Date.now() + 15 * 60_000),
      leaseToken,
    },
  });
  if (!acquired.count) return { skipped: true, processed: 0 };
  const run = await db.syncRun.create({ data: { connectionId } });
  try {
    const provider = providerOverride ?? new FintocBankingProvider();
    const remote = await provider.getConnection(credential || 'test-only');
    if (connection.institutionId) {
      const institution = await db.bankInstitution.findUniqueOrThrow({
        where: { id: connection.institutionId },
      });
      if (
        institution.providerInstitutionId &&
        institution.providerInstitutionId !== remote.institution.id
      )
        throw new ProviderError(0, 'La institución no corresponde a la conexión configurada');
    }
    const since = new Date(process.env.FINTOC_HISTORY_SINCE || '1970-01-01');
    if (Number.isNaN(since.getTime()))
      throw new ProviderError(0, 'FINTOC_HISTORY_SINCE debe ser una fecha ISO válida');
    const updatedSince = connection.lastSuccessfulSyncAt
      ? new Date(connection.lastSuccessfulSyncAt.getTime() - 2 * 86400_000)
      : undefined;
    const accounts = remote.accounts.filter((a) => !accountId || a.id === accountId);
    if (accountId && !accounts.length)
      throw new ProviderError(404, 'La cuenta ya no está disponible en la conexión');
    const bundles: { account: ProviderAccount; transactions: ProviderTransaction[] }[] = [];
    for (const account of accounts) {
      const transactions = account.active
        ? deduplicate(
            await provider.getTransactions(
              credential || 'test-only',
              account.id,
              since,
              now,
              updatedSince,
            ),
          )
        : [];
      if (transactions.some((t) => t.currency !== account.currency))
        throw new ProviderError(0, 'Moneda inconsistente en los movimientos');
      bundles.push({ account, transactions });
    }
    let processed = 0;
    await db.$transaction(
      async (tx) => {
        // Row lock and fencing token prevent an expired worker from overwriting newer data.
        await tx.$queryRaw`SELECT id FROM "BankConnection" WHERE id=${connectionId} FOR UPDATE`;
        const lock = await tx.bankConnection.findUniqueOrThrow({ where: { id: connectionId } });
        if (lock.leaseToken !== leaseToken)
          throw new ProviderError(0, 'La sincronización fue reemplazada por otro proceso');
        for (const { account, transactions } of bundles) {
          const data = {
            companyId: connection.companyId,
            institutionId: connection.institutionId,
            accountNumberMasked: account.numberMasked,
            accountType: account.type,
            currency: account.currency,
            name: account.name,
            currentBalance: account.currentBalance,
            availableBalance: account.availableBalance,
            active: account.active,
            lastSyncedAt: now,
            providerRefreshedAt: account.refreshedAt,
          };
          const stored = await tx.bankAccount.upsert({
            where: {
              connectionId_providerAccountId: { connectionId, providerAccountId: account.id },
            },
            create: { ...data, connectionId, providerAccountId: account.id },
            update: data,
          });
          processed += await persistTransactions(tx, stored.id, transactions);
          // A current import is not evidence of a fresh bank balance.
          if (account.refreshedAt && account.active) {
            const day = new Date(account.refreshedAt.toISOString().slice(0, 10));
            await tx.balanceSnapshot.upsert({
              where: { bankAccountId_date: { bankAccountId: stored.id, date: day } },
              create: {
                bankAccountId: stored.id,
                date: day,
                currentBalance: account.currentBalance,
                availableBalance: account.availableBalance,
                sourceRefreshedAt: account.refreshedAt,
              },
              update: {
                currentBalance: account.currentBalance,
                availableBalance: account.availableBalance,
                sourceRefreshedAt: account.refreshedAt,
              },
            });
          }
        }
        const status = remote.status === 'SYNCING' ? 'NEEDS_ATTENTION' : remote.status;
        await tx.bankConnection.update({
          where: { id: connectionId },
          data: {
            providerConnectionId: remote.id,
            status,
            lastSuccessfulSyncAt: now,
            errorMessage:
              remote.status === 'CONNECTED'
                ? null
                : remote.status === 'SYNCING'
                  ? 'El banco está actualizando la conexión'
                  : 'Fintoc requiere atención en esta conexión',
            leaseUntil: null,
            leaseToken: null,
          },
        });
        await tx.syncRun.update({
          where: { id: run.id },
          data: { success: true, finishedAt: new Date(), transactionsProcessed: processed },
        });
      },
      { timeout: 120_000 },
    );
    console.info(JSON.stringify({ event: 'bank_sync_complete', connectionId, processed }));
    return { skipped: false, processed };
  } catch (error) {
    const message = safeSyncError(error);
    await db.bankConnection.updateMany({
      where: { id: connectionId, leaseToken },
      data: {
        status:
          error instanceof ProviderError && [401, 403].includes(error.status)
            ? 'NEEDS_ATTENTION'
            : 'ERROR',
        errorMessage: message,
        leaseUntil: null,
        leaseToken: null,
      },
    });
    await db.syncRun.update({
      where: { id: run.id },
      data: { finishedAt: new Date(), errorMessage: message },
    });
    console.error(JSON.stringify({ event: 'bank_sync_failed', connectionId, error: message }));
    throw new ProviderError(error instanceof ProviderError ? error.status : 0, message);
  }
}
export async function syncAccount(accountId: string) {
  const account = await db.bankAccount.findUniqueOrThrow({ where: { id: accountId } });
  return syncConnection(account.connectionId, undefined, account.providerAccountId);
}
export async function enqueueConnection(connectionId: string, key: string) {
  return db.syncJob.upsert({
    where: { dedupeKey: key },
    create: { connectionId, dedupeKey: key },
    update: {},
  });
}
export async function syncAllBankConnections() {
  const connections = await db.bankConnection.findMany({
    where: { provider: 'FINTOC', company: { active: true } },
  });
  const cycle = Math.floor(Date.now() / (4 * 3600_000));
  for (const connection of connections)
    await enqueueConnection(connection.id, `periodic:${cycle}:${connection.id}`);
  return processSyncJobs();
}
export async function processSyncJobs(limit = 2) {
  await db.syncJob.updateMany({
    where: { status: 'RUNNING', startedAt: { lt: new Date(Date.now() - 20 * 60_000) } },
    data: { status: 'PENDING', nextAttemptAt: new Date() },
  });
  const results = [];
  for (let i = 0; i < limit; i++) {
    const jobs = await db.$queryRaw<
      { id: string }[]
    >`UPDATE "SyncJob" SET status='RUNNING', "startedAt"=NOW(), attempts=attempts+1 WHERE id=(SELECT id FROM "SyncJob" WHERE status IN ('PENDING','FAILED') AND attempts<5 AND "nextAttemptAt"<=NOW() ORDER BY "createdAt" FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING id`;
    if (!jobs.length) break;
    const job = await db.syncJob.findUniqueOrThrow({ where: { id: jobs[0].id } });
    try {
      const result = await syncConnection(job.connectionId);
      if (result.skipped) {
        await db.syncJob.update({
          where: { id: job.id },
          data: {
            status: 'FAILED',
            errorMessage: 'Sincronización no ejecutada: credencial ausente o conexión ocupada',
            nextAttemptAt: new Date(Date.now() + 15 * 60_000),
          },
        });
        results.push({ id: job.id, success: false });
        continue;
      }
      await db.syncJob.update({
        where: { id: job.id },
        data: { status: 'COMPLETED', errorMessage: null },
      });
      results.push({ id: job.id, success: true });
    } catch (error) {
      await db.syncJob.update({
        where: { id: job.id },
        data: {
          status: 'FAILED',
          errorMessage: safeSyncError(error),
          nextAttemptAt: new Date(Date.now() + Math.min(2 ** job.attempts * 60_000, 4 * 3600_000)),
        },
      });
      results.push({ id: job.id, success: false });
    }
  }
  return results;
}
