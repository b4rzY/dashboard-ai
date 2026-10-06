import type { Options } from '@/services/analytics';
import type { Filters } from '@/services/filters';
import { Search } from 'lucide-react';
export function TransactionFilters({ options, filters }: { options: Options; filters: Filters }) {
  return (
    <form className="transaction-filters" method="get">
      {['holding', 'company', 'bank', 'currency', 'period', 'status'].map((k) => (
        <input key={k} type="hidden" name={k} value={String(filters[k as keyof Filters])} />
      ))}
      <label className="search-field">
        <Search size={17} />
        <input
          name="q"
          defaultValue={filters.q}
          placeholder="Buscar descripción, cliente, referencia o monto"
          aria-label="Buscar movimientos"
          maxLength={200}
        />
      </label>
      <div className="transaction-filter-row">
        <label>
          Cuenta
          <select name="account" defaultValue={filters.account}>
            <option value="">Todas las cuentas</option>
            {options.accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.accountNumberMasked} · {a.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Tipo
          <select name="type" defaultValue={filters.type}>
            <option value="">Ingresos y egresos</option>
            <option value="CREDIT">Ingresos</option>
            <option value="DEBIT">Egresos</option>
          </select>
        </label>
        <label>
          Categoría
          <select name="category" defaultValue={filters.category}>
            <option value="">Todas</option>
            {options.categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label>
          Desde
          <input type="date" name="from" defaultValue={filters.from} />
        </label>
        <label>
          Hasta
          <input type="date" name="to" defaultValue={filters.to} />
        </label>
        <label>
          Monto mín.
          <input
            type="number"
            min="0"
            step="1"
            name="min"
            defaultValue={filters.min}
            placeholder="0"
          />
        </label>
        <label>
          Monto máx.
          <input
            type="number"
            min="0"
            step="1"
            name="max"
            defaultValue={filters.max}
            placeholder="Sin límite"
          />
        </label>
        <button className="button button-outline" type="submit">
          Aplicar
        </button>
      </div>
      <small>
        Montos en unidad mínima: pesos para CLP, centavos para USD. Las fechas filtran la fecha
        contable.
      </small>
    </form>
  );
}
