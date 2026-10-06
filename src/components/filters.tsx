'use client';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';
import { Select } from './ui/select';
import type { Options } from '@/services/analytics';
import type { Filters as FilterValues } from '@/services/filters';
import { SlidersHorizontal } from 'lucide-react';
export function Filters({
  options,
  filters,
  lockedCompany = false,
  lockedAccount = false,
}: {
  options: Options;
  filters: FilterValues;
  lockedCompany?: boolean;
  lockedAccount?: boolean;
}) {
  const router = useRouter(),
    path = usePathname(),
    search = useSearchParams();
  const [pending, start] = useTransition();
  function update(key: string, value: string) {
    const params = new URLSearchParams(search);
    if (value) params.set(key, value);
    else params.delete(key);
    params.delete('page');
    if (key === 'period') {
      params.delete('from');
      params.delete('to');
    }
    start(() => router.push(`${path}?${params}`));
  }
  return (
    <div className={`global-filters ${pending ? 'pending' : ''}`}>
      <span className="filter-icon">
        <SlidersHorizontal size={17} />
      </span>
      <Select
        label="Holding"
        value={options.holding.id}
        options={[{ value: options.holding.id, label: options.holding.name }]}
        onChange={() => {}}
      />
      {!lockedCompany && !lockedAccount && (
        <Select
          label="Empresa"
          value={filters.company}
          options={[
            { value: '', label: 'Todas las empresas' },
            ...options.companies.map((c) => ({ value: c.id, label: c.displayName })),
          ]}
          onChange={(v) => update('company', v)}
        />
      )}
      {!lockedAccount && (
        <>
          <Select
            label="Banco"
            value={filters.bank}
            options={[
              { value: '', label: 'Todos los bancos' },
              ...options.banks.map((b) => ({ value: b.id, label: b.name })),
            ]}
            onChange={(v) => update('bank', v)}
          />
          <Select
            label="Moneda"
            value={filters.currency}
            options={(options.currencies.length ? options.currencies : ['CLP']).map((c) => ({
              value: c,
              label: c,
            }))}
            onChange={(v) => update('currency', v)}
          />
        </>
      )}
      {lockedAccount && <span className="currency-tag">{filters.currency}</span>}
      <div className="filter-spacer" />
      <Select
        label="Período"
        value={filters.period}
        options={[
          { value: '7', label: 'Últimos 7 días' },
          { value: '30', label: 'Últimos 30 días' },
          { value: '90', label: 'Últimos 90 días' },
          { value: '365', label: 'Últimos 12 meses' },
        ]}
        onChange={(v) => update('period', v)}
      />
      {pending && <span className="filter-loading">Actualizando…</span>}
    </div>
  );
}
