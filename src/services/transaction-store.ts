import { Prisma } from '@prisma/client';
import type { ProviderTransaction } from '@/providers/banking';
export async function persistTransactions(
  tx: Prisma.TransactionClient,
  accountId: string,
  rows: ProviderTransaction[],
) {
  let inserted = 0;
  const insertedProviderIds: string[] = [];
  for (let offset = 0; offset < rows.length; offset += 500) {
    const payload = rows
      .slice(offset, offset + 500)
      .map(({ id, ...r }) => ({
        ...r,
        providerTransactionId: id,
        transactionDate: r.transactionDate.toISOString(),
        postingDate: r.postingDate.toISOString(),
      }));
    const changes = await tx.$queryRaw<{ providerTransactionId: string; inserted: boolean }[]>(Prisma.sql`
      INSERT INTO "Transaction" (id,"bankAccountId","providerTransactionId","transactionDate","postingDate",description,"normalizedDescription",amount,currency,"transactionType",category,counterparty,reference,"providerStatus","rawMetadata","createdAt","updatedAt")
      SELECT gen_random_uuid()::text,${accountId},r."providerTransactionId",r."transactionDate"::timestamp,r."postingDate"::timestamp,r.description,r."normalizedDescription",r.amount::numeric,r.currency,r."transactionType"::"TransactionType",'Sin categorizar',r.counterparty,r.reference,r."providerStatus",r."rawMetadata",NOW() AT TIME ZONE 'UTC',NOW() AT TIME ZONE 'UTC'
      FROM jsonb_to_recordset(${JSON.stringify(payload)}::jsonb) AS r("providerTransactionId" text,"transactionDate" text,"postingDate" text,description text,"normalizedDescription" text,amount text,currency text,"transactionType" text,counterparty text,reference text,"providerStatus" text,"rawMetadata" jsonb)
      ON CONFLICT ("bankAccountId","providerTransactionId") DO UPDATE SET
        "transactionDate"=EXCLUDED."transactionDate","postingDate"=EXCLUDED."postingDate",description=EXCLUDED.description,"normalizedDescription"=EXCLUDED."normalizedDescription",amount=EXCLUDED.amount,currency=EXCLUDED.currency,"transactionType"=EXCLUDED."transactionType",counterparty=EXCLUDED.counterparty,reference=EXCLUDED.reference,"providerStatus"=EXCLUDED."providerStatus","rawMetadata"=EXCLUDED."rawMetadata","updatedAt"=EXCLUDED."updatedAt"
      RETURNING "providerTransactionId",(xmax=0) AS inserted
    `);
    inserted += changes.filter((r) => r.inserted).length;
    insertedProviderIds.push(...changes.filter((r) => r.inserted).map((r) => r.providerTransactionId));
  }
  return { inserted, insertedProviderIds };
}
