import Link from 'next/link';
import { AlertTriangle, Bell, CircleDollarSign, RefreshCcw, ShieldAlert } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { dateLabel } from '@/lib/money';
import { PageTitle } from '@/components/dashboard';
import { AlertReadButton } from '@/components/alert-read-button';
import { AlertSettingsForm } from '@/components/alert-settings-form';
import { alertDefaults } from '@/services/alerts';

function configValue(value: unknown, currency: string, fallback: bigint) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const raw = (value as Record<string, unknown>)[currency];
    if (typeof raw === 'string' && /^\d+$/.test(raw)) return raw;
  }
  return fallback.toString();
}

const iconByType = {
  SYNC_FAILURE: RefreshCcw,
  PAYMENT_FAILED: ShieldAlert,
  LARGE_PAYMENT: CircleDollarSign,
  UNUSUAL_PAYMENT: AlertTriangle,
} as const;

export default async function AlertsPage() {
  const user = await requireUser();
  const [alerts, rules] = await Promise.all([
    db.alertEvent.findMany({
      where: { holdingId: user.holdingId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
    db.alertRule.findMany({ where: { holdingId: user.holdingId } }),
  ]);
  const byType = new Map(rules.map((rule) => [rule.type, rule]));
  const unread = alerts.filter((alert) => !alert.readAt).length;
  const critical = alerts.filter((alert) => alert.severity === 'CRITICAL' && !alert.readAt).length;
  const warning = alerts.filter((alert) => alert.severity === 'WARNING' && !alert.readAt).length;

  return (
    <>
      <PageTitle
        title="Alertas"
        description="Fallas bancarias y movimientos que requieren revisión."
        action={<AlertReadButton disabled={unread === 0} />}
      />
      <div className="alert-summary">
        <div className="panel"><Bell size={19} /><span>Sin leer</span><strong>{unread}</strong></div>
        <div className="panel critical"><ShieldAlert size={19} /><span>Críticas</span><strong>{critical}</strong></div>
        <div className="panel warning"><AlertTriangle size={19} /><span>Advertencias</span><strong>{warning}</strong></div>
      </div>

      <div className="alerts-layout">
        <section className="panel alerts-panel">
          <div className="panel-heading">
            <div><h2>Centro de notificaciones</h2><p>Últimas 100 alertas detectadas automáticamente</p></div>
          </div>
          {alerts.length ? (
            <div className="alert-list">
              {alerts.map((alert) => {
                const Icon = iconByType[alert.type as keyof typeof iconByType] || Bell;
                const body = (
                  <>
                    <span className={`alert-event-icon ${alert.severity.toLowerCase()}`}><Icon size={18} /></span>
                    <span className="alert-event-copy">
                      <span className="alert-event-title">
                        <strong>{alert.title}</strong>
                        {!alert.readAt && <i>Nueva</i>}
                      </span>
                      <span>{alert.message}</span>
                      <small>{dateLabel(alert.createdAt)}</small>
                    </span>
                  </>
                );
                return alert.resourceUrl ? (
                  <Link className={`alert-event ${!alert.readAt ? 'unread' : ''}`} href={alert.resourceUrl} key={alert.id}>{body}</Link>
                ) : (
                  <div className={`alert-event ${!alert.readAt ? 'unread' : ''}`} key={alert.id}>{body}</div>
                );
              })}
            </div>
          ) : (
            <div className="empty"><Bell size={28} /><h3>No hay alertas</h3><p>Las fallas de sincronización y los movimientos anómalos aparecerán aquí.</p></div>
          )}
        </section>

        {user.role === 'ADMIN' && (
          <section className="panel alert-config-panel">
            <div className="panel-heading"><div><h2>Reglas activas</h2><p>Elige qué eventos generan una alerta</p></div></div>
            <AlertSettingsForm
              initial={{
                syncFailure: byType.get('SYNC_FAILURE')?.enabled ?? alertDefaults.syncFailure,
                failedPayment: byType.get('PAYMENT_FAILED')?.enabled ?? alertDefaults.failedPayment,
                largePayment: byType.get('LARGE_PAYMENT')?.enabled ?? alertDefaults.largePayment,
                unusualPayment: byType.get('UNUSUAL_PAYMENT')?.enabled ?? alertDefaults.unusualPayment,
                largeClp: configValue(byType.get('LARGE_PAYMENT')?.configuration, 'CLP', alertDefaults.largeClp),
                unusualClp: configValue(byType.get('UNUSUAL_PAYMENT')?.configuration, 'CLP', alertDefaults.unusualClp),
              }}
            />
          </section>
        )}
      </div>
    </>
  );
}
