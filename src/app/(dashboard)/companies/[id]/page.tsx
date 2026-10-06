import { notFound } from 'next/navigation';
import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { getAnalytics, getOptions, getAccounts, getTransactions } from '@/services/analytics';
import { parseFilters, filterQuery, type SearchParams } from '@/services/filters';
import { Filters } from '@/components/filters';
import { PageTitle, Overview } from '@/components/dashboard';
import { AccountsTable, TransactionsTable } from '@/components/tables';
import { BalanceChart } from '@/components/charts';
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const user = await requireUser(),
    { id } = await params;
  const company = await db.company.findFirst({ where: { id, holdingId: user.holdingId } });
  if (!company) notFound();
  const filters = parseFilters({ ...(await searchParams), company: id, account: '' });
  const [data, options, accounts, transactions] = await Promise.all([
    getAnalytics(filters, user.holdingId),
    getOptions(user.holdingId),
    getAccounts(filters, user.holdingId),
    getTransactions({ ...filters, page: 1 }, user.holdingId, 8),
  ]);
  return (
    <>
      <div className="breadcrumbs">
        <Link href="/companies">Empresas</Link>
        <span>/</span>
        {company.displayName}
      </div>
      <PageTitle
        title={company.displayName}
        description={`${company.legalName}${company.rut ? ' · RUT ' + company.rut : ''}`}
      />
      <Filters options={options} filters={filters} lockedCompany />
      <Overview data={data} filters={filters} company />
      <section className="panel section-panel">
        <div className="panel-heading">
          <div>
            <h2>Cuentas bancarias</h2>
            <p>Todas las cuentas de {company.displayName}</p>
          </div>
        </div>
        <AccountsTable rows={accounts} filters={filters} />
      </section>
      <section className="panel section-panel">
        <div className="panel-heading">
          <div>
            <h2>Evolución del saldo</h2>
            <p>Snapshots diarios con cobertura completa</p>
          </div>
        </div>
        <BalanceChart data={data.history} currency={filters.currency} />
      </section>
      <section className="panel section-panel">
        <div className="panel-heading">
          <h2>Movimientos recientes</h2>
          <Link href={'/transactions?' + filterQuery(filters)}>Ver todos</Link>
        </div>
        <TransactionsTable data={transactions} filters={filters} compact />
      </section>
    </>
  );
}
