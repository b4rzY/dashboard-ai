import 'server-only';
import { db } from '@/lib/db';
import { Prisma } from '@prisma/client';
import { accountWhere, transactionWhere, periodRange, type Filters } from './filters';
export async function getOptions(holdingId: string) {
  const [holding, companies, banks, accounts, currencies, categories] = await Promise.all([
    db.holding.findUniqueOrThrow({ where: { id: holdingId }, select: { id: true, name: true } }),
    db.company.findMany({
      where: { holdingId, active: true },
      orderBy: { displayName: 'asc' },
      select: { id: true, displayName: true },
    }),
    db.bankInstitution.findMany({
      where: { accounts: { some: { company: { holdingId } } } },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
    db.bankAccount.findMany({
      where: { company: { holdingId }, active: true },
      select: { id: true, name: true, accountNumberMasked: true },
    }),
    db.bankAccount.findMany({
      where: { company: { holdingId }, active: true },
      distinct: ['currency'],
      select: { currency: true },
    }),
    db.transaction.findMany({
      where: { bankAccount: { company: { holdingId } } },
      distinct: ['category'],
      select: { category: true },
    }),
  ]);
  return {
    holding,
    companies,
    banks,
    accounts,
    currencies: currencies.map((c) => c.currency),
    categories: categories.map((c) => c.category),
  };
}
export type Options = Awaited<ReturnType<typeof getOptions>>;
export async function getAccounts(f: Filters, holdingId: string) {
  const accounts = await db.bankAccount.findMany({
    where: accountWhere(f, holdingId),
    include: {
      company: { select: { displayName: true } },
      institution: { select: { name: true } },
      connection: { select: { status: true, errorMessage: true } },
    },
    orderBy: [{ company: { displayName: 'asc' } }, { availableBalance: 'desc' }],
  });
  return accounts.map((a) => ({
    ...a,
    currentBalance: a.currentBalance.toFixed(0),
    availableBalance: a.availableBalance.toFixed(0),
    lastSyncedAt: a.lastSyncedAt?.toISOString() ?? null,
    providerRefreshedAt: a.providerRefreshedAt?.toISOString() ?? null,
    stale: !a.providerRefreshedAt || Date.now() - a.providerRefreshedAt.getTime() > 8 * 3600_000,
  }));
}
export type AccountRow = Awaited<ReturnType<typeof getAccounts>>[number];
export async function getTransactions(f: Filters, holdingId: string, pageSize = 30) {
  const where = transactionWhere(f, holdingId);
  const [count, rows] = await db.$transaction([
    db.transaction.count({ where }),
    db.transaction.findMany({
      where,
      skip: (f.page - 1) * pageSize,
      take: pageSize,
      orderBy: [{ postingDate: 'desc' }, { id: 'desc' }],
      include: {
        bankAccount: {
          select: {
            id: true,
            accountNumberMasked: true,
            company: { select: { id: true, displayName: true } },
            institution: { select: { name: true } },
          },
        },
      },
    }),
  ]);
  return {
    count,
    page: f.page,
    pageSize,
    rows: rows.map((r) => ({
      id: r.id,
      accountId: r.bankAccount.id,
      companyId: r.bankAccount.company.id,
      company: r.bankAccount.company.displayName,
      bank: r.bankAccount.institution.name,
      account: r.bankAccount.accountNumberMasked,
      postingDate: r.postingDate.toISOString(),
      description: r.description,
      reference: r.reference,
      counterparty: r.counterparty,
      category: r.category,
      amount: r.amount.toFixed(0),
      currency: r.currency,
      type: r.transactionType,
    })),
  };
}
export type TransactionPage = Awaited<ReturnType<typeof getTransactions>>;
export async function getAnalytics(f: Filters, holdingId: string) {
  const txWhere = transactionWhere(f, holdingId);
  const [accounts, flows, byAccount, last, companies, historicalAccounts] = await Promise.all([
    getAccounts(f, holdingId),
    db.transaction.groupBy({ by: ['transactionType'], where: txWhere, _sum: { amount: true } }),
    db.transaction.groupBy({
      by: ['bankAccountId', 'transactionType'],
      where: txWhere,
      _sum: { amount: true },
    }),
    db.bankConnection.aggregate({
      where: {
        company: { holdingId, active: true },
        ...(f.company ? { companyId: f.company } : {}),
        ...(f.bank ? { institutionId: f.bank } : {}),
      },
      _max: { lastSuccessfulSyncAt: true },
    }),
    db.company.findMany({
      where: { holdingId, active: true, ...(f.company ? { id: f.company } : {}) },
      select: { id: true, displayName: true },
    }),
    db.bankAccount.findMany({
      where: { ...accountWhere(f, holdingId), active: undefined },
      select: { id: true, companyId: true },
    }),
  ]);
  const credit = BigInt(
    flows.find((r) => r.transactionType === 'CREDIT')?._sum.amount?.toFixed(0) || '0',
  );
  const debit = -BigInt(
    flows.find((r) => r.transactionType === 'DEBIT')?._sum.amount?.toFixed(0) || '0',
  );
  const balance = accounts.reduce((s, a) => s + BigInt(a.availableBalance), 0n);
  const groups = new Map<
    string,
    { id: string; name: string; balance: bigint; credit: bigint; debit: bigint; count: number }
  >();
  companies.forEach((c) =>
    groups.set(c.id, {
      id: c.id,
      name: c.displayName,
      balance: 0n,
      credit: 0n,
      debit: 0n,
      count: 0,
    }),
  );
  const banks = new Map<string, { id: string; name: string; balance: bigint; count: number }>();
  for (const a of accounts) {
    const company = groups.get(a.companyId)!;
    company.balance += BigInt(a.availableBalance);
    company.count++;
    const bank = banks.get(a.institutionId) ?? {
      id: a.institutionId,
      name: a.institution.name,
      balance: 0n,
      count: 0,
    };
    bank.balance += BigInt(a.availableBalance);
    bank.count++;
    banks.set(a.institutionId, bank);
  }
  const accountCompanies = new Map(historicalAccounts.map((a) => [a.id, a.companyId]));
  for (const flow of byAccount) {
    const companyId = accountCompanies.get(flow.bankAccountId);
    const company = companyId ? groups.get(companyId) : null;
    if (!company) continue;
    if (flow.transactionType === 'CREDIT')
      company.credit += BigInt(flow._sum.amount?.toFixed(0) || '0');
    else company.debit -= BigInt(flow._sum.amount?.toFixed(0) || '0');
  }
  const ids = accounts.map((a) => a.id);
  const { start, end } = periodRange(f);
  type Daily = { date: Date; credit: Prisma.Decimal; debit: Prisma.Decimal };
  const historicalIds = historicalAccounts.map((a) => a.id);
  const predicates: Prisma.Sql[] = [
    Prisma.sql`currency=${f.currency}`,
    Prisma.sql`"providerStatus"='confirmed'`,
    Prisma.sql`"postingDate">=CAST(${start.toISOString()} AS timestamp)`,
    Prisma.sql`"postingDate"<=CAST(${end.toISOString()} AS timestamp)`,
  ];
  if (f.type) predicates.push(Prisma.sql`"transactionType"::text=${f.type}`);
  if (f.category) predicates.push(Prisma.sql`category=${f.category}`);
  if (f.min) predicates.push(Prisma.sql`ABS(amount)>=CAST(${f.min} AS numeric)`);
  if (f.max) predicates.push(Prisma.sql`ABS(amount)<=CAST(${f.max} AS numeric)`);
  if (f.q) {
    const q = f.q.toLowerCase(),
      normalized = f.q
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
    const searches = [
      Prisma.sql`POSITION(${q} IN lower(description))>0`,
      Prisma.sql`POSITION(${normalized} IN "normalizedDescription")>0`,
      Prisma.sql`POSITION(${q} IN lower(COALESCE(reference,'')))>0`,
      Prisma.sql`POSITION(${q} IN lower(COALESCE(counterparty,'')))>0`,
    ];
    if (/^\d+$/.test(f.q)) searches.push(Prisma.sql`ABS(amount)=CAST(${f.q} AS numeric)`);
    predicates.push(Prisma.sql`(${Prisma.join(searches, ' OR ')})`);
  }
  // Prisma DateTime columns store UTC in timestamp without time zone. Cast ISO strings
  // explicitly, so a PostgreSQL server timezone cannot move the reporting window.
  const daily = historicalIds.length
    ? await db.$queryRaw<Daily[]>(
        Prisma.sql`SELECT date_trunc('day', "postingDate") AS date, COALESCE(SUM(CASE WHEN "transactionType"='CREDIT' THEN amount ELSE 0 END),0) AS credit, COALESCE(SUM(CASE WHEN "transactionType"='DEBIT' THEN -amount ELSE 0 END),0) AS debit FROM "Transaction" WHERE "bankAccountId" IN (${Prisma.join(historicalIds)}) AND ${Prisma.join(predicates, ' AND ')} GROUP BY 1 ORDER BY 1`,
      )
    : [];
  const points = new Map(daily.map((r) => [r.date.toISOString().slice(0, 10), r]));
  const series = [];
  for (
    let day = new Date(start.toISOString().slice(0, 10));
    day <= end;
    day = new Date(day.getTime() + 86400_000)
  ) {
    const key = day.toISOString().slice(0, 10);
    const row = points.get(key);
    series.push({ date: key, credit: Number(row?.credit || 0), debit: Number(row?.debit || 0) });
  }
  const snapshotIds = ids.length ? ids : f.account ? historicalIds : [];
  const snapshots = snapshotIds.length
    ? await db.balanceSnapshot.groupBy({
        by: ['date'],
        where: {
          bankAccountId: { in: snapshotIds },
          date: { gte: new Date(start.toISOString().slice(0, 10)), lte: end },
        },
        _sum: { availableBalance: true },
        _count: { bankAccountId: true },
        orderBy: { date: 'asc' },
      })
    : [];
  const history = snapshots
    .filter((s) => s._count.bankAccountId === snapshotIds.length)
    .map((s) => ({
      date: s.date.toISOString().slice(0, 10),
      balance: Number(s._sum.availableBalance || 0),
    }));
  const prior = ids.length
    ? await db.balanceSnapshot.groupBy({
        by: ['date'],
        where: { bankAccountId: { in: ids }, date: new Date(start.toISOString().slice(0, 10)) },
        _sum: { availableBalance: true },
        _count: { bankAccountId: true },
      })
    : [];
  const previous =
    prior[0]?._count.bankAccountId === ids.length
      ? BigInt(prior[0]._sum.availableBalance?.toFixed(0) || '0')
      : null;
  const change =
    previous !== null && previous > 0n
      ? Number(((balance - previous) * 10000n) / previous) / 100
      : null;
  return {
    balance: balance.toString(),
    credit: credit.toString(),
    debit: debit.toString(),
    net: (credit - debit).toString(),
    change,
    currency: f.currency,
    companies: [...groups.values()]
      .map((c) => ({
        ...c,
        balance: c.balance.toString(),
        credit: c.credit.toString(),
        debit: c.debit.toString(),
        net: (c.credit - c.debit).toString(),
      }))
      .sort((a, b) => Number(b.balance) - Number(a.balance)),
    banks: [...banks.values()]
      .map((b) => ({ ...b, balance: b.balance.toString() }))
      .sort((a, b) => Number(b.balance) - Number(a.balance)),
    accountCount: accounts.length,
    connectedCount: accounts.filter((a) =>
      ['CONNECTED', 'SYNCING'].includes(a.connection.status),
    ).length,
    staleCount: accounts.filter((a) => a.stale).length,
    lastSyncedAt: last._max.lastSuccessfulSyncAt?.toISOString() ?? null,
    series,
    history,
  };
}
export type Analytics = Awaited<ReturnType<typeof getAnalytics>>;
