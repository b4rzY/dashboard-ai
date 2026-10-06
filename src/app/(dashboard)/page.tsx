import Link from 'next/link';
import { ArrowRight, Clock3 } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { getAnalytics, getOptions, getTransactions } from '@/services/analytics';
import { parseFilters, filterQuery, type SearchParams } from '@/services/filters';
import { Filters } from '@/components/filters';
import { PageTitle, Overview, CompanyCards, BankDistribution } from '@/components/dashboard';
import { TransactionsTable, Empty } from '@/components/tables';
import { dateLabel } from '@/lib/money';
export default async function Page({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireUser(),
    filters = parseFilters(await searchParams);
  const [options, data, recent] = await Promise.all([
    getOptions(user.holdingId),
    getAnalytics(filters, user.holdingId),
    getTransactions({ ...filters, page: 1 }, user.holdingId, 5),
  ]);
  return (
    <>
      <PageTitle
        title="Tu caja, en una sola vista."
        description="Visibilidad financiera de todas las empresas del holding."
        action={
          <div className="updated-label">
            <Clock3 size={14} />
            <span>
              Última importación<strong>{dateLabel(data.lastSyncedAt)}</strong>
            </span>
          </div>
        }
      />
      <Filters options={options} filters={filters} />
      {data.accountCount ? (
        <>
          <Overview data={data} filters={filters} />
          <div className="section-heading">
            <div>
              <h2>Empresas</h2>
              <p>La posición de caja de tu holding</p>
            </div>
            <Link href={'/companies?' + filterQuery(filters)}>
              Ver empresas <ArrowRight size={14} />
            </Link>
          </div>
          <CompanyCards data={data} filters={filters} />
          <div className="bottom-grid">
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>Movimientos recientes</h2>
                  <p>Última actividad en tus cuentas</p>
                </div>
                <Link href={'/transactions?' + filterQuery(filters)}>Ver todos</Link>
              </div>
              <TransactionsTable data={recent} filters={filters} compact />
            </section>
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>Caja por banco</h2>
                  <p>Concentración bancaria</p>
                </div>
              </div>
              <BankDistribution data={data} />
            </section>
          </div>
        </>
      ) : (
        <section className="panel">
          <Empty
            title="El holding está listo para conectar sus cuentas"
            detail="Configura las credenciales de las conexiones y ejecuta la primera sincronización. También puedes ampliar los filtros."
          />
          <Link className="button button-primary" href="/connections">
            Ver conexiones
          </Link>
        </section>
      )}
    </>
  );
}
