import { Suspense } from 'react';
import { requireUser } from '@/lib/auth';
import { Sidebar } from '@/components/sidebar';
export const dynamic = 'force-dynamic';
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
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
          <span className="internal-tag">Workspace interno</span>
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
