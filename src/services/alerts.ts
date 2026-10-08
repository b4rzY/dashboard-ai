import 'server-only';
import { Prisma } from '@prisma/client';
import type { ProviderTransaction } from '@/providers/banking';
import { money } from '@/lib/money';

export const alertDefaults = {
  syncFailure: true,
  failedPayment: true,
  largePayment: true,
  unusualPayment: true,
  largeClp: 10_000_000n,
  largeUsd: 1_000_000n,
  unusualClp: 2_000_000n,
  unusualUsd: 200_000n,
};

type AlertSettings = typeof alertDefaults;

function objectValue(value: Prisma.JsonValue | undefined): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function booleanValue(value: unknown, fallback: boolean) {
  return typeof value === 'boolean' ? value : fallback;
}

function bigintValue(value: unknown, fallback: bigint) {
  try {
    return typeof value === 'string' || typeof value === 'number' ? BigInt(value) : fallback;
  } catch {
    return fallback;
  }
}

export async function getAlertSettings(tx: Prisma.TransactionClient, holdingId: string) {
  const rules = await tx.alertRule.findMany({ where: { holdingId } });
  const byType = new Map(rules.map((rule) => [rule.type, rule]));
  const large = objectValue(byType.get('LARGE_PAYMENT')?.configuration);
  const unusual = objectValue(byType.get('UNUSUAL_PAYMENT')?.configuration);
  return {
    syncFailure: booleanValue(byType.get('SYNC_FAILURE')?.enabled, alertDefaults.syncFailure),
    failedPayment: booleanValue(
      byType.get('PAYMENT_FAILED')?.enabled,
      alertDefaults.failedPayment,
    ),
    largePayment: booleanValue(byType.get('LARGE_PAYMENT')?.enabled, alertDefaults.largePayment),
    unusualPayment: booleanValue(
      byType.get('UNUSUAL_PAYMENT')?.enabled,
      alertDefaults.unusualPayment,
    ),
    largeClp: bigintValue(large.CLP, alertDefaults.largeClp),
    largeUsd: bigintValue(large.USD, alertDefaults.largeUsd),
    unusualClp: bigintValue(unusual.CLP, alertDefaults.unusualClp),
    unusualUsd: bigintValue(unusual.USD, alertDefaults.unusualUsd),
  } satisfies AlertSettings;
}

function threshold(settings: AlertSettings, currency: string, kind: 'large' | 'unusual') {
  if (currency === 'USD') return kind === 'large' ? settings.largeUsd : settings.unusualUsd;
  return kind === 'large' ? settings.largeClp : settings.unusualClp;
}

export function detectTransactionAlertTypes(
  row: ProviderTransaction,
  settings: AlertSettings,
  firstCounterparty: boolean,
) {
  const result: ('PAYMENT_FAILED' | 'LARGE_PAYMENT' | 'UNUSUAL_PAYMENT')[] = [];
  const debit = row.transactionType === 'DEBIT';
  const amount = BigInt(row.amount) < 0n ? -BigInt(row.amount) : BigInt(row.amount);
  if (settings.failedPayment && /fail|reject|declin|cancel|revers/i.test(row.providerStatus))
    result.push('PAYMENT_FAILED');
  if (settings.largePayment && debit && amount >= threshold(settings, row.currency, 'large'))
    result.push('LARGE_PAYMENT');
  if (
    settings.unusualPayment &&
    debit &&
    firstCounterparty &&
    amount >= threshold(settings, row.currency, 'unusual')
  )
    result.push('UNUSUAL_PAYMENT');
  return result;
}

export async function createTransactionAlerts(
  tx: Prisma.TransactionClient,
  context: {
    holdingId: string;
    companyId: string;
    companyName: string;
    connectionId: string;
    bankName: string;
    accountId: string;
  },
  rows: ProviderTransaction[],
) {
  if (!rows.length) return 0;
  const settings = await getAlertSettings(tx, context.holdingId);
  const alerts: Prisma.AlertEventCreateManyInput[] = [];
  for (const row of rows) {
    const amount = BigInt(row.amount) < 0n ? -BigInt(row.amount) : BigInt(row.amount);
    const needsCounterpartyCheck =
      settings.unusualPayment &&
      row.transactionType === 'DEBIT' &&
      Boolean(row.counterparty) &&
      amount >= threshold(settings, row.currency, 'unusual');
    const previous = needsCounterpartyCheck
      ? await tx.transaction.count({
          where: {
            bankAccountId: context.accountId,
            counterparty: row.counterparty,
            providerTransactionId: { not: row.id },
            postingDate: { lt: row.postingDate },
          },
        })
      : 1;
    for (const type of detectTransactionAlertTypes(row, settings, previous === 0)) {
      const label = money(amount, row.currency);
      const counterparty = row.counterparty || row.description;
      const shared = {
        holdingId: context.holdingId,
        companyId: context.companyId,
        connectionId: context.connectionId,
        transactionId: row.id,
        resourceUrl: `/accounts/${context.accountId}`,
        fingerprint: `${type}:${context.accountId}:${row.id}`,
      };
      if (type === 'PAYMENT_FAILED')
        alerts.push({
          ...shared,
          type,
          severity: 'CRITICAL',
          title: 'Pago fallido o rechazado',
          message: `${context.companyName} · ${context.bankName} · ${counterparty} · ${label}`,
        });
      else if (type === 'LARGE_PAYMENT')
        alerts.push({
          ...shared,
          type,
          severity: 'WARNING',
          title: 'Pago de monto elevado',
          message: `${context.companyName} · ${context.bankName} · ${counterparty} · ${label}`,
        });
      else
        alerts.push({
          ...shared,
          type,
          severity: 'WARNING',
          title: 'Pago inusual a contraparte nueva',
          message: `${context.companyName} · ${context.bankName} · ${counterparty} · ${label}`,
        });
    }
  }
  if (!alerts.length) return 0;
  return (await tx.alertEvent.createMany({ data: alerts, skipDuplicates: true })).count;
}

export async function createSyncFailureAlert(
  tx: Prisma.TransactionClient,
  input: {
    holdingId: string;
    companyId: string;
    companyName: string;
    connectionId: string;
    bankName: string;
    message: string;
  },
) {
  const settings = await getAlertSettings(tx, input.holdingId);
  if (!settings.syncFailure) return;
  const hour = new Date().toISOString().slice(0, 13);
  await tx.alertEvent.createMany({
    data: [
      {
        holdingId: input.holdingId,
        companyId: input.companyId,
        connectionId: input.connectionId,
        type: 'SYNC_FAILURE',
        severity: 'CRITICAL',
        title: 'Falló una sincronización bancaria',
        message: `${input.companyName} · ${input.bankName} · ${input.message}`,
        resourceUrl: '/connections',
        fingerprint: `SYNC_FAILURE:${input.connectionId}:${hour}`,
      },
    ],
    skipDuplicates: true,
  });
}
