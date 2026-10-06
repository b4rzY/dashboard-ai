'use client';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { money } from '@/lib/money';
import type { Analytics } from '@/services/analytics';
const palette = [
  '#176f5b',
  '#51a990',
  '#a2d7bd',
  '#395b75',
  '#839bac',
  '#ccd8df',
  '#7c8f54',
  '#bcce88',
  '#54685a',
];
export function CashflowChart({ data, currency }: { data: Analytics['series']; currency: string }) {
  const grouped =
    data.length > 90
      ? Object.values(
          data.reduce<Record<string, { date: string; credit: number; debit: number }>>((acc, r) => {
            const key = r.date.slice(0, 7);
            const group = acc[key] ?? { date: key + '-01', credit: 0, debit: 0 };
            group.credit += r.credit;
            group.debit += r.debit;
            acc[key] = group;
            return acc;
          }, {}),
        )
      : data;
  return (
    <div className="chart" aria-label="Gráfico de ingresos y egresos">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={grouped} barGap={2} margin={{ left: 0, right: 5, top: 18, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="#eaf0ee" />
          <XAxis
            dataKey="date"
            axisLine={false}
            tickLine={false}
            minTickGap={34}
            tick={{ fontSize: 12, fill: '#81908c' }}
            tickFormatter={(v) =>
              new Intl.DateTimeFormat('es-CL', {
                day: 'numeric',
                month: 'short',
                timeZone: 'UTC',
              }).format(new Date(v))
            }
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            width={68}
            tick={{ fontSize: 12, fill: '#81908c' }}
            tickFormatter={(v) => money(v, currency, true)}
          />
          <Tooltip
            cursor={{ fill: '#f4f8f6' }}
            contentStyle={{ border: '1px solid #e3eae7', borderRadius: 12, fontSize: 13 }}
            labelFormatter={(v) => String(v)}
            formatter={(v, name) => [
              money(Number(v), currency),
              name === 'credit' ? 'Ingresos' : 'Egresos',
            ]}
          />
          <Bar
            isAnimationActive={false}
            dataKey="credit"
            name="credit"
            fill="#267c65"
            radius={[3, 3, 0, 0]}
          />
          <Bar
            isAnimationActive={false}
            dataKey="debit"
            name="debit"
            fill="#c8ded4"
            radius={[3, 3, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
export function BalanceChart({ data, currency }: { data: Analytics['history']; currency: string }) {
  return data.length < 2 ? (
    <div className="chart-empty">
      La evolución aparecerá cuando existan al menos dos días de saldos registrados.
    </div>
  ) : (
    <div className="chart">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          <defs>
            <linearGradient id="balanceFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#3c9f7d" stopOpacity={0.22} />
              <stop offset="1" stopColor="#3c9f7d" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="#eaf0ee" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            minTickGap={40}
          />
          <YAxis
            tickFormatter={(v) => money(v, currency, true)}
            tick={{ fontSize: 12 }}
            width={75}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip formatter={(v) => [money(Number(v), currency), 'Saldo disponible']} />
          <Area
            isAnimationActive={false}
            type="monotone"
            dataKey="balance"
            stroke="#267c65"
            strokeWidth={2}
            fill="url(#balanceFill)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
export function DistributionChart({
  rows,
  currency,
}: {
  rows: { id: string; name: string; balance: string }[];
  currency: string;
}) {
  const positive = rows.filter((r) => BigInt(r.balance) > 0n);
  const total = positive.reduce((s, r) => s + Number(r.balance), 0);
  if (!positive.length)
    return <div className="chart-empty">Sin saldos positivos para distribuir.</div>;
  return (
    <div className="distribution">
      <div className="donut">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              isAnimationActive={false}
              data={positive.map((r) => ({ ...r, value: Number(r.balance) }))}
              innerRadius="67%"
              outerRadius="90%"
              paddingAngle={3}
              dataKey="value"
              stroke="none"
            >
              {positive.map((r, i) => (
                <Cell key={r.id} fill={palette[i % palette.length]} />
              ))}
            </Pie>
            <Tooltip formatter={(v) => money(Number(v), currency)} />
          </PieChart>
        </ResponsiveContainer>
        <div className="donut-center">
          <strong>{positive.length}</strong>
          <span>{positive.length === 1 ? 'empresa' : 'empresas'}</span>
        </div>
      </div>
      <div className="distribution-legend">
        {positive.slice(0, 6).map((r, i) => (
          <div key={r.id}>
            <span className="legend-dot" style={{ background: palette[i % palette.length] }} />
            <span>{r.name}</span>
            <strong>{((Number(r.balance) / total) * 100).toFixed(1)}%</strong>
          </div>
        ))}
        {positive.length > 6 && <small>+ {positive.length - 6} empresas en el consolidado</small>}
      </div>
    </div>
  );
}
