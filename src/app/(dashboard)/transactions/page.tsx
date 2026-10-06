import { Download } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { getOptions, getTransactions } from '@/services/analytics';
import { parseFilters, filterQuery, type SearchParams } from '@/services/filters';
import { Filters } from '@/components/filters';
import { PageTitle } from '@/components/dashboard';
import { TransactionsTable } from '@/components/tables';
import { TransactionFilters } from '@/components/transaction-filters';
export default async function Page({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireUser(),
    filters = parseFilters(await searchParams);
  const [options, data] = await Promise.all([
    getOptions(user.holdingId),
    getTransactions(filters, user.holdingId),
  ]);
  return (
    <>
      <PageTitle
        title="Movimientos"
        description="Busca, analiza y exporta la actividad bancaria del holding."
        action={
          user.role !== 'VIEWER' && (
            <a
              className="button button-outline"
              href={'/api/transactions/export?' + filterQuery(filters)}
            >
              <Download size={16} />
              Exportar CSV
            </a>
          )
        }
      />
      <Filters options={options} filters={filters} />
      <section className="panel">
        <TransactionFilters options={options} filters={filters} />
        <TransactionsTable data={data} filters={filters} />
      </section>
    </>
  );
}
