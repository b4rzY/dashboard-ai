import { requireUser } from '@/lib/auth';
import { getAnalytics, getOptions } from '@/services/analytics';
import { parseFilters, type SearchParams } from '@/services/filters';
import { Filters } from '@/components/filters';
import { PageTitle, CompanyCards } from '@/components/dashboard';
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
        title="Empresas"
        description="Saldos, actividad y flujo de cada empresa del holding."
      />
      <Filters options={options} filters={filters} />
      <CompanyCards data={data} filters={filters} />
    </>
  );
}
