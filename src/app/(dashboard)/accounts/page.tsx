import { requireUser } from '@/lib/auth';
import { getAccounts, getOptions } from '@/services/analytics';
import { parseFilters, type SearchParams } from '@/services/filters';
import { Filters } from '@/components/filters';
import { PageTitle } from '@/components/dashboard';
import { AccountsTable } from '@/components/tables';
export default async function Page({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireUser(),
    filters = parseFilters(await searchParams);
  const [accounts, options] = await Promise.all([
    getAccounts(filters, user.holdingId),
    getOptions(user.holdingId),
  ]);
  return (
    <>
      <PageTitle
        title="Cuentas bancarias"
        description="Saldos y estado de las cuentas de tu holding."
      />
      <Filters options={options} filters={filters} />
      <form className="inline-filter" method="get">
        {Object.entries(filters)
          .filter(([k]) => k !== 'status')
          .map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}
        <label>
          Estado{' '}
          <select name="status" defaultValue={filters.status}>
            <option value="">Todos los estados</option>
            <option value="CONNECTED">Conectada</option>
            <option value="SYNCING">Sincronizando</option>
            <option value="NEEDS_ATTENTION">Requiere atención</option>
            <option value="ERROR">Error</option>
          </select>
        </label>
        <button className="button button-outline button-sm">Aplicar</button>
      </form>
      <section className="panel">
        <div className="panel-heading">
          <h2>
            {accounts.length} cuentas · {filters.currency}
          </h2>
        </div>
        <AccountsTable rows={accounts} filters={filters} />
      </section>
    </>
  );
}
