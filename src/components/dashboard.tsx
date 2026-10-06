import Link from 'next/link';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Wallet,
  Building2,
  Landmark,
  Activity,
  ArrowRight,
  Clock3,
} from 'lucide-react';
import type { Analytics } from '@/services/analytics';
import type { Filters } from '@/services/filters';
import { filterQuery } from '@/services/filters';
import { money, dateLabel } from '@/lib/money';
import { CashflowChart, DistributionChart } from './charts';
export function PageTitle({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="page-title">
      <div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </div>
  );
}
export function Metrics({ data, period }: { data: Analytics; period: string }) {
  const metrics = [
    {
      label: `Ingresos · ${period === '365' ? '12 meses' : period + ' días'}`,
      value: data.credit,
      icon: ArrowDownLeft,
      kind: 'income',
      hint: 'Abonos confirmados',
    },
    {
      label: `Egresos · ${period === '365' ? '12 meses' : period + ' días'}`,
      value: data.debit,
      icon: ArrowUpRight,
      kind: 'expense',
      hint: 'Cargos confirmados',
    },
    {
      label: 'Flujo neto',
      value: data.net,
      icon: Activity,
      kind: BigInt(data.net) >= 0n ? 'income' : 'expense',
      hint: 'Ingresos menos egresos',
    },
    {
      label: 'Cuentas conectadas',
      value: null,
      icon: Landmark,
      kind: 'neutral',
      hint: `${data.companies.length} ${data.companies.length === 1 ? 'empresa' : 'empresas'} en el holding`,
    },
  ];
  return (
    <div className="metrics">
      {metrics.map((m) => (
        <div className="metric" key={m.label}>
          <div className="metric-label">
            {m.label}
            <m.icon size={17} />
          </div>
          <strong className={m.kind}>
            {m.value !== null ? (
              money(m.value, data.currency)
            ) : (
              <>
                {data.connectedCount}
                <span className="metric-denominator"> / {data.accountCount}</span>
              </>
            )}
          </strong>
          <small>{m.hint}</small>
        </div>
      ))}
    </div>
  );
}
export function Overview({
  data,
  filters,
  company = false,
}: {
  data: Analytics;
  filters: Filters;
  company?: boolean;
}) {
  return (
    <>
      <section className="cash-hero">
        <div>
          <div className="eyebrow">
            <Wallet size={16} />
            CAJA {company ? 'DE LA EMPRESA' : 'TOTAL CONSOLIDADA'}
            <span>{data.currency}</span>
          </div>
          <div className="cash-value">{money(data.balance, data.currency)}</div>
          <div className="cash-context">
            {data.change !== null ? (
              <span className="change-badge">
                {data.change >= 0 ? '+' : ''}
                {data.change.toFixed(1)}%
              </span>
            ) : (
              <span className="history-note">Sin comparación histórica suficiente</span>
            )}
            {data.change !== null && <span>desde el inicio del período</span>}
          </div>
        </div>
        <div className="cash-meta">
          <span className="cash-icon">
            <Building2 size={27} />
          </span>
          <strong>
            {data.companies.length} {data.companies.length === 1 ? 'empresa' : 'empresas'}
          </strong>
          <span>
            {data.accountCount} cuentas · {data.banks.length} bancos
          </span>
          <div>
            <Clock3 size={13} />
            {dateLabel(data.lastSyncedAt)}
          </div>
        </div>
      </section>
      <Metrics data={data} period={filters.period} />
      {data.staleCount > 0 && (
        <div className="notice">
          <Clock3 size={16} />
          {data.staleCount} {data.staleCount === 1 ? 'cuenta tiene' : 'cuentas tienen'} datos
          bancarios con más de 8 horas de antigüedad.
          <Link href={'/connections?' + filterQuery(filters)}>Revisar conexiones</Link>
        </div>
      )}
      <div className="chart-grid">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Flujo de caja</h2>
              <p>Ingresos y egresos del período</p>
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
          <CashflowChart data={data.series} currency={data.currency} />
          <div className="chart-footer">
            Movimientos confirmados · {data.currency}
            <Link href={'/cashflow?' + filterQuery(filters)}>
              Ver detalle <ArrowRight size={13} />
            </Link>
          </div>
        </section>
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>{company ? 'Distribución por banco' : 'Caja por empresa'}</h2>
              <p>Distribución de saldos disponibles</p>
            </div>
          </div>
          {company ? (
            <BankDistribution data={data} />
          ) : (
            <DistributionChart rows={data.companies} currency={data.currency} />
          )}
        </section>
      </div>
    </>
  );
}
export function CompanyCards({ data, filters }: { data: Analytics; filters: Filters }) {
  return (
    <div className="company-grid">
      {data.companies.map((c, i) => (
        <Link
          className="company-card"
          key={c.id}
          href={`/companies/${c.id}?${filterQuery(filters, { company: c.id, account: '' })}`}
        >
          <div className="company-card-top">
            <span className={`company-avatar color-${i % 4}`}>
              {c.name
                .split(' ')
                .map((s) => s[0])
                .slice(0, 2)
                .join('')}
            </span>
            <div>
              <h3>{c.name}</h3>
              <small>{c.count} cuentas bancarias</small>
            </div>
            <ArrowRight size={15} />
          </div>
          <div className="company-balance">{money(c.balance, data.currency)}</div>
          <div className="company-flow">
            <span>Flujo neto del período</span>
            <strong className={BigInt(c.net) >= 0n ? 'income' : 'expense'}>
              {BigInt(c.net) >= 0n ? '+' : ''}
              {money(c.net, data.currency)}
            </strong>
          </div>
          <div className="company-details">
            <span>
              Ingresos <strong>{money(c.credit, data.currency, true)}</strong>
            </span>
            <span>
              Egresos <strong>{money(c.debit, data.currency, true)}</strong>
            </span>
          </div>
        </Link>
      ))}
    </div>
  );
}
export function BankDistribution({ data }: { data: Analytics }) {
  const total = data.banks.reduce((s, b) => s + (Number(b.balance) > 0 ? Number(b.balance) : 0), 0);
  return (
    <div className="bank-list">
      {data.banks.map((b) => (
        <div key={b.id}>
          <div className="bank-row">
            <span className="bank-logo">
              <Landmark size={17} />
            </span>
            <span>
              {b.name}
              <small>
                {b.count} {b.count === 1 ? 'cuenta' : 'cuentas'}
              </small>
            </span>
            <strong>{money(b.balance, data.currency)}</strong>
          </div>
          <div className="bank-bar">
            <span
              style={{ width: `${total ? (Math.max(0, Number(b.balance)) / total) * 100 : 0}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
