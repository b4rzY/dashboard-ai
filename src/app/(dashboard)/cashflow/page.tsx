import { requireUser } from '@/lib/auth';
import { getAnalytics, getOptions } from '@/services/analytics';
import { parseFilters, type SearchParams } from '@/services/filters';
import { Filters } from '@/components/filters';
import { PageTitle, Metrics, BankDistribution } from '@/components/dashboard';
import { CashflowChart, BalanceChart, DistributionChart } from '@/components/charts';
export default async function Page({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireUser(),
    filters = parseFilters(await searchParams);
  const [data, options] = await Promise.all([
    getAnalytics(filters, user.holdingId),
    getOptions(user.holdingId),
  ]);
  return (
    <>
      <PageTitle
        title="Flujo de caja"
        description="Entiende las entradas, salidas y concentración de tu caja."
      />
      <Filters options={options} filters={filters} />
      <Metrics data={data} period={filters.period} />
      <section className="panel section-panel">
        <div className="panel-heading">
          <div>
            <h2>Ingresos vs. egresos</h2>
            <p>
              {filters.period === '365' ? 'Agregado por mes' : 'Agregado por día'} · Movimientos
              confirmados
            </p>
          </div>
          <div className="chart-key">
            <span>
              <i />
              Ingresos
            </span>
            <span>
              <i />
              Egresos
            </span>
          </div>
        </div>
        <CashflowChart data={data.series} currency={filters.currency} />
      </section>
      <section className="panel section-panel">
        <div className="panel-heading">
          <div>
            <h2>Evolución de caja consolidada</h2>
            <p>Solo fechas con saldos registrados para todas las cuentas seleccionadas</p>
          </div>
        </div>
        <BalanceChart data={data.history} currency={filters.currency} />
      </section>
      <div className="chart-grid">
        <section className="panel">
          <div className="panel-heading">
            <h2>Concentración por empresa</h2>
          </div>
          <DistributionChart rows={data.companies} currency={filters.currency} />
        </section>
        <section className="panel">
          <div className="panel-heading">
            <h2>Concentración por banco</h2>
          </div>
          <BankDistribution data={data} />
        </section>
      </div>
    </>
  );
}
