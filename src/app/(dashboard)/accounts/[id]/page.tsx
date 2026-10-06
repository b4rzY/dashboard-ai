import { notFound } from 'next/navigation';
import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { money, dateLabel } from '@/lib/money';
import { getAnalytics, getOptions, getTransactions } from '@/services/analytics';
import { parseFilters, type SearchParams } from '@/services/filters';
import { Filters } from '@/components/filters';
import { PageTitle } from '@/components/dashboard';
import { BalanceChart } from '@/components/charts';
import { TransactionsTable } from '@/components/tables';
import { TransactionFilters } from '@/components/transaction-filters';
import { Status } from '@/components/status';
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const user = await requireUser(),
    { id } = await params;
  const account = await db.bankAccount.findFirst({
    where: { id, company: { holdingId: user.holdingId } },
    include: { company: true, institution: true, connection: true },
  });
  if (!account) notFound();
  const filters = parseFilters({
    ...(await searchParams),
    account: id,
    company: '',
    bank: '',
    currency: account.currency,
  });
  const [data, options, transactions] = await Promise.all([
    getAnalytics(filters, user.holdingId),
    getOptions(user.holdingId),
    getTransactions(filters, user.holdingId),
  ]);
  return (
    <>
      <div className="breadcrumbs">
        <Link href="/companies">Empresas</Link>
        <span>/</span>
        <Link href={`/companies/${account.companyId}`}>{account.company.displayName}</Link>
        <span>/</span>
        {account.accountNumberMasked}
      </div>
      <PageTitle
        title={`${account.institution.name} · ${account.accountNumberMasked}`}
        description={`${account.company.displayName} · ${account.name} · ${account.currency}`}
        action={<Status status={account.connection.status} />}
      />
      <Filters options={options} filters={filters} lockedAccount />
      {!account.active && (
        <div className="notice">
          Esta cuenta ya no está activa. Conservamos su historial y sus últimos saldos registrados;
          no participa de la caja actual.
        </div>
      )}
      <div className="account-summary">
        <div>
          <span>{account.active ? 'Saldo disponible' : 'Último saldo disponible registrado'}</span>
          <strong>{money(account.availableBalance.toFixed(0), account.currency)}</strong>
        </div>
        <div>
          <span>{account.active ? 'Saldo actual' : 'Último saldo actual registrado'}</span>
          <strong>{money(account.currentBalance.toFixed(0), account.currency)}</strong>
        </div>
        <div>
          <span>Actualización bancaria</span>
          <strong className="date-value">{dateLabel(account.providerRefreshedAt)}</strong>
          <small>Importación: {dateLabel(account.lastSyncedAt)}</small>
        </div>
      </div>
      <section className="panel section-panel">
        <div className="panel-heading">
          <h2>Evolución del saldo disponible</h2>
        </div>
        <BalanceChart data={data.history} currency={account.currency} />
      </section>
      <section className="panel section-panel">
        <div className="panel-heading">
          <h2>Movimientos de la cuenta</h2>
        </div>
        <TransactionFilters
          options={{
            ...options,
            accounts: [
              {
                id: account.id,
                name: account.name,
                accountNumberMasked: account.accountNumberMasked,
              },
            ],
          }}
          filters={filters}
        />
        <TransactionsTable data={transactions} filters={filters} />
      </section>
    </>
  );
}
