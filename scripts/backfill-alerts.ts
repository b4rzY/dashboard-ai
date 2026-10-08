import { db } from '../src/lib/db';
import { createSyncFailureAlert, createTransactionAlerts } from '../src/services/alerts';

const since = new Date(Date.now() - 30 * 86400_000);

const failedConnections = await db.bankConnection.findMany({
  where: { status: { in: ['ERROR', 'NEEDS_ATTENTION'] } },
  include: { company: true, institution: true },
});

for (const connection of failedConnections) {
  await db.$transaction((tx) =>
    createSyncFailureAlert(tx, {
      holdingId: connection.company.holdingId,
      companyId: connection.companyId,
      companyName: connection.company.displayName,
      connectionId: connection.id,
      bankName: connection.institution.name,
      message: connection.errorMessage || 'La conexión requiere atención',
    }),
  );
}

const accounts = await db.bankAccount.findMany({
  where: { active: true },
  include: {
    company: true,
    institution: true,
    transactions: { where: { postingDate: { gte: since } }, orderBy: { postingDate: 'asc' } },
  },
});

let created = 0;
for (const account of accounts) {
  created += await db.$transaction((tx) =>
    createTransactionAlerts(
      tx,
      {
        holdingId: account.company.holdingId,
        companyId: account.companyId,
        companyName: account.company.displayName,
        connectionId: account.connectionId,
        bankName: account.institution.name,
        accountId: account.id,
      },
      account.transactions.map((transaction) => ({
        id: transaction.providerTransactionId,
        transactionDate: transaction.transactionDate,
        postingDate: transaction.postingDate,
        description: transaction.description,
        normalizedDescription: transaction.normalizedDescription,
        amount: transaction.amount.toFixed(0),
        currency: transaction.currency,
        transactionType: transaction.transactionType,
        reference: transaction.reference,
        counterparty: transaction.counterparty,
        providerStatus: transaction.providerStatus,
        rawMetadata: { type: 'backfill', pending: false },
      })),
    ),
  );
}

console.info(
  JSON.stringify({ failedConnections: failedConnections.length, transactionAlertsCreated: created }),
);
await db.$disconnect();
