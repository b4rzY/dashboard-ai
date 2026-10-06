import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, it, expect } from 'vitest';
import { db } from '../src/lib/db';
import { syncConnection, enqueueConnection } from '../src/services/sync';
import { normalizeMovement, ProviderError } from '../src/providers/fintoc';
import type { BankingProvider, ProviderConnection } from '../src/providers/banking';
import { getAnalytics, getTransactions } from '../src/services/analytics';
import { parseFilters } from '../src/services/filters';
const prefix = `integration-${randomUUID()}`;
const holdingId = prefix,
  companyId = prefix + '-company',
  bankId = prefix + '-bank',
  connectionId = prefix + '-connection';
let amount = 1000;
let fail = false;
let movementStatus = 'confirmed';
const remote: ProviderConnection = {
  id: prefix + '-link',
  institution: { id: bankId, code: bankId, name: 'Test Bank' },
  status: 'CONNECTED',
  accounts: [
    {
      id: prefix + '-acc',
      numberMasked: '•••• 1234',
      name: 'Test',
      type: 'checking_account',
      currency: 'CLP',
      currentBalance: '5000',
      availableBalance: '4500',
      active: true,
      refreshedAt: new Date(),
    },
  ],
};
const provider: BankingProvider = {
  getConnections: async () => [],
  getConnection: async () => {
    if (fail) throw new ProviderError(503, 'Fintoc respondió HTTP 503');
    return remote;
  },
  getAccounts: async () => remote.accounts,
  getBalances: async () => remote.accounts,
  getTransactions: async () => [
    normalizeMovement({
      id: 'mov_1',
      amount,
      currency: 'CLP',
      description: 'Ingreso test',
      post_date: new Date().toISOString(),
      type: 'transfer',
      status: movementStatus,
    }),
    normalizeMovement({
      id: 'mov_2',
      amount: -400,
      currency: 'CLP',
      description: 'Egreso test',
      post_date: new Date().toISOString(),
      type: 'transfer',
      status: 'confirmed',
    }),
  ],
};
beforeAll(async () => {
  if (!process.env.DATABASE_URL?.includes('127.0.0.1:55432'))
    throw new Error('Integration tests require the dedicated local PostgreSQL, not production.');
  await db.holding.create({ data: { id: holdingId, name: 'Integration test only' } });
  await db.company.create({
    data: { id: companyId, holdingId, displayName: 'Test Company', legalName: 'Test' },
  });
  await db.bankInstitution.create({
    data: { id: bankId, code: bankId, name: 'Test Bank', providerInstitutionId: bankId },
  });
  await db.bankConnection.create({
    data: { id: connectionId, companyId, institutionId: bankId, provider: 'FINTOC' },
  });
});
afterAll(async () => {
  if (!holdingId.startsWith('integration-')) throw new Error('Invalid test scope');
  await db.$transaction(async (tx) => {
    const scope = { bankAccount: { companyId } };
    await tx.balanceSnapshot.deleteMany({ where: scope });
    await tx.transaction.deleteMany({ where: scope });
    await tx.bankAccount.deleteMany({ where: { companyId } });
    await tx.syncJob.deleteMany({ where: { connectionId } });
    await tx.syncRun.deleteMany({ where: { connectionId } });
    await tx.bankConnection.deleteMany({ where: { id: connectionId } });
    await tx.company.deleteMany({ where: { id: companyId } });
    await tx.bankInstitution.deleteMany({ where: { id: bankId } });
    await tx.holding.deleteMany({ where: { id: holdingId } });
  });
  await db.$disconnect();
});
it('persiste cuentas, saldos y movimientos reales del adaptador', async () => {
  const result = await syncConnection(connectionId, provider);
  expect(result.processed).toBe(2);
  expect(await db.transaction.count({ where: { bankAccount: { companyId } } })).toBe(2);
  const account = await db.bankAccount.findFirstOrThrow({ where: { companyId } });
  expect(account.availableBalance.toFixed(0)).toBe('4500');
  expect(account.accountNumberMasked).toBe('•••• 1234');
});
it('la segunda sincronización es idempotente', async () => {
  const result = await syncConnection(connectionId, provider);
  expect(result.processed).toBe(0);
  expect(await db.transaction.count({ where: { bankAccount: { companyId } } })).toBe(2);
  expect(await db.balanceSnapshot.count({ where: { bankAccount: { companyId } } })).toBe(1);
});
it('actualiza movimientos modificados sin duplicarlos', async () => {
  amount = 1500;
  await syncConnection(connectionId, provider);
  const row = await db.transaction.findFirstOrThrow({
    where: { bankAccount: { companyId }, providerTransactionId: 'mov_1' },
  });
  expect(row.amount.toFixed(0)).toBe('1500');
  expect(await db.transaction.count({ where: { bankAccount: { companyId } } })).toBe(2);
});
it('agrega ingresos egresos y flujo desde PostgreSQL', async () => {
  const data = await getAnalytics(parseFilters({}), holdingId);
  expect(data.balance).toBe('4500');
  expect(data.credit).toBe('1500');
  expect(data.debit).toBe('400');
  expect(data.net).toBe('1100');
  expect(data.change).toBeNull();
  expect(data.series.reduce((s, r) => s + r.credit, 0)).toBe(1500);
  expect(data.series.reduce((s, r) => s + r.debit, 0)).toBe(400);
});
it('aísla holding y moneda en las consultas', async () => {
  const other = await getAnalytics(parseFilters({ currency: 'USD' }), holdingId);
  expect(other.balance).toBe('0');
  expect(other.credit).toBe('0');
  expect((await getTransactions(parseFilters({}), 'holding-does-not-exist')).count).toBe(0);
});
it('filtra movimientos por descripción, tipo y monto', async () => {
  const result = await getTransactions(
    parseFilters({ q: 'Ingreso', type: 'CREDIT', min: '1000', max: '2000' }),
    holdingId,
  );
  expect(result.count).toBe(1);
  expect(result.rows[0].amount).toBe('1500');
  const debit = await getTransactions(
    parseFilters({ type: 'DEBIT', min: '300', max: '500' }),
    holdingId,
  );
  expect(debit.count).toBe(1);
});
it('conserva historia y saldos ante fallos temporales', async () => {
  fail = true;
  await expect(syncConnection(connectionId, provider)).rejects.toThrow('HTTP 503');
  expect(await db.transaction.count({ where: { bankAccount: { companyId } } })).toBe(2);
  const account = await db.bankAccount.findFirstOrThrow({ where: { companyId } });
  expect(account.availableBalance.toFixed(0)).toBe('4500');
  const connection = await db.bankConnection.findUniqueOrThrow({ where: { id: connectionId } });
  expect(connection.status).toBe('ERROR');
  expect(connection.lastSuccessfulSyncAt).not.toBeNull();
  fail = false;
});
it('evita dos sincronizaciones concurrentes con lease', async () => {
  await db.bankConnection.update({
    where: { id: connectionId },
    data: { leaseUntil: new Date(Date.now() + 60_000), leaseToken: 'test-running' },
  });
  expect((await syncConnection(connectionId, provider)).skipped).toBe(true);
  await db.bankConnection.update({
    where: { id: connectionId },
    data: { leaseUntil: null, leaseToken: null },
  });
});
it('deduplica trabajos persistentes', async () => {
  const key = prefix + '-event';
  await enqueueConnection(connectionId, key);
  await enqueueConnection(connectionId, key);
  expect(await db.syncJob.count({ where: { connectionId, dedupeKey: key } })).toBe(1);
});
it('excluye reversiones de reportes sin borrar el movimiento', async () => {
  movementStatus = 'reversed';
  await syncConnection(connectionId, provider);
  const data = await getAnalytics(parseFilters({}), holdingId);
  expect(data.credit).toBe('0');
  expect(data.net).toBe('-400');
  expect(await db.transaction.count({ where: { bankAccount: { companyId } } })).toBe(2);
  movementStatus = 'confirmed';
  await syncConnection(connectionId, provider);
});
it('conserva movimientos históricos de cuentas removidas sin sumar su caja actual', async () => {
  remote.accounts[0].active = false;
  await syncConnection(connectionId, provider);
  const data = await getAnalytics(parseFilters({}), holdingId);
  expect(data.balance).toBe('0');
  expect(data.credit).toBe('1500');
  expect(data.debit).toBe('400');
  expect((await getTransactions(parseFilters({}), holdingId)).count).toBe(2);
});
