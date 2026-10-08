import { Suspense } from 'react';
import { requireUser } from '@/lib/auth';
import { Sidebar } from '@/components/sidebar';
import Link from 'next/link';
import { Bell } from 'lucide-react';
import { db } from '@/lib/db';
export const dynamic = 'force-dynamic';
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const unreadAlerts = await db.alertEvent.count({
    where: { holdingId: user.holdingId, readAt: null },
  });
  return (
    <div className="app-shell">
      <Suspense>
        <Sidebar name={user.name} role={user.role} />
      </Suspense>
      <div className="main-shell">
        <header className="topbar">
          <span>
            Dashboard Bancario <span className="topbar-divider">/</span>
            <strong>Holding Gozo</strong>
          </span>
          <div className="topbar-actions">
            <Link
              href="/alerts"
              className="alert-bell"
              aria-label={`${unreadAlerts} alertas sin leer`}
              title="Alertas"
            >
              <Bell size={18} />
              {unreadAlerts > 0 && (
                <span className="alert-badge">{unreadAlerts > 99 ? '99+' : unreadAlerts}</span>
              )}
            </Link>
            <span className="internal-tag">Workspace interno</span>
          </div>
        </header>
        {process.env.DEMO_MODE === 'true' && (
          <div className="demo-banner">
            AMBIENTE DEMO · Saldos y movimientos simulados. No representa información bancaria real.
          </div>
        )}
        <main>{children}</main>
        <footer className="app-footer">
          Gozo · Tesorería corporativa
          <span>Valores expresados en la moneda seleccionada · Sin conversión de divisas</span>
        </footer>
      </div>
    </div>
  );
}
