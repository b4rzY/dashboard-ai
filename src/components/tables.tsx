import Link from 'next/link';
import { ArrowRight, SearchX } from 'lucide-react';
import { money, dateLabel } from '@/lib/money';
import type { AccountRow, TransactionPage } from '@/services/analytics';
import { filterQuery, type Filters } from '@/services/filters';
import { Status } from './status';
export function Empty({
  title = 'Sin resultados',
  detail = 'Prueba ajustar los filtros o sincronizar las conexiones.',
}: {
  title?: string;
  detail?: string;
}) {
  return (
    <div className="empty">
      <SearchX size={28} />
      <h3>{title}</h3>
      <p>{detail}</p>
    </div>
  );
}
export function AccountsTable({ rows, filters }: { rows: AccountRow[]; filters: Filters }) {
  if (!rows.length) return <Empty title="No hay cuentas para estos filtros" />;
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Banco / Cuenta</th>
            <th>Empresa</th>
            <th>Tipo</th>
            <th>Moneda</th>
            <th className="text-right">Disponible</th>
            <th>Actualización bancaria</th>
            <th>Conexión</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((a) => (
            <tr key={a.id}>
              <td>
                <strong>{a.institution.name}</strong>
                <small>
                  {a.accountNumberMasked} · {a.name}
                </small>
              </td>
              <td>
                <Link
                  href={`/companies/${a.companyId}?${filterQuery(filters, { company: a.companyId, account: '' })}`}
                >
                  {a.company.displayName}
                </Link>
              </td>
              <td>
                {a.accountType === 'checking_account'
                  ? 'Cuenta corriente'
                  : a.accountType === 'line_of_credit'
                    ? 'Línea de crédito'
                    : a.accountType}
              </td>
              <td>
                <span className="currency-tag">{a.currency}</span>
              </td>
              <td className="text-right">
                <strong>{money(a.availableBalance, a.currency)}</strong>
              </td>
              <td>
                <span className={a.stale ? 'stale' : ''}>{dateLabel(a.providerRefreshedAt)}</span>
              </td>
              <td>
                <Status status={a.connection.status} />
              </td>
              <td>
                <Link
                  className="table-open"
                  aria-label={`Ver cuenta ${a.accountNumberMasked}`}
                  href={`/accounts/${a.id}?${filterQuery(filters, { account: a.id, company: '', bank: '', currency: a.currency })}`}
                >
                  <ArrowRight size={16} />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
export function TransactionsTable({
  data,
  filters,
  compact = false,
}: {
  data: TransactionPage;
  filters: Filters;
  compact?: boolean;
}) {
  if (!data.rows.length)
    return (
      <Empty
        title="No se encontraron movimientos"
        detail="Cambia el período, la búsqueda o los filtros para ampliar los resultados."
      />
    );
  return (
    <>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Fecha</th>
              {!compact && <th>Empresa / Banco</th>}
              <th>Descripción</th>
              <th>Categoría</th>
              <th className="text-right">Ingreso</th>
              <th className="text-right">Egreso</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((t) => (
              <tr key={t.id}>
                <td>
                  {new Intl.DateTimeFormat('es-CL', {
                    dateStyle: 'medium',
                    timeZone: 'UTC',
                  }).format(new Date(t.postingDate))}
                  <small>
                    <Link
                      href={`/accounts/${t.accountId}?${filterQuery(filters, { account: t.accountId, company: '', bank: '' })}`}
                    >
                      {t.account}
                    </Link>
                  </small>
                </td>
                {!compact && (
                  <td>
                    <Link
                      href={`/companies/${t.companyId}?${filterQuery(filters, { company: t.companyId, account: '' })}`}
                    >
                      <strong>{t.company}</strong>
                    </Link>
                    <small>{t.bank}</small>
                  </td>
                )}
                <td className="description-cell">
                  {t.description}
                  <small>{t.reference || t.counterparty || 'Sin referencia'}</small>
                </td>
                <td>
                  <span className="category-tag">{t.category}</span>
                </td>
                <td className="text-right income">
                  {t.type === 'CREDIT' ? money(t.amount, t.currency) : '—'}
                </td>
                <td className="text-right">
                  {t.type === 'DEBIT' ? money(-BigInt(t.amount), t.currency) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!compact && (
        <div className="pagination">
          <span>
            {(data.page - 1) * data.pageSize + 1}–{Math.min(data.page * data.pageSize, data.count)}{' '}
            de {data.count.toLocaleString('es-CL')} movimientos
          </span>
          <div>
            {data.page > 1 && (
              <Link
                className="button button-outline button-sm"
                href={'?' + filterQuery(filters, { page: data.page - 1 })}
              >
                Anterior
              </Link>
            )}
            <span>Página {data.page}</span>
            {data.page * data.pageSize < data.count && (
              <Link
                className="button button-outline button-sm"
                href={'?' + filterQuery(filters, { page: data.page + 1 })}
              >
                Siguiente
              </Link>
            )}
          </div>
        </div>
      )}
    </>
  );
}
