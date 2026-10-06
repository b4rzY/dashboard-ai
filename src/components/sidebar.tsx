'use client';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  LayoutDashboard,
  Building2,
  Landmark,
  ArrowLeftRight,
  ChartNoAxesCombined,
  Plug,
  Settings,
  ChevronsUpDown,
  LogOut,
  Layers,
  CalendarClock,
  Bell,
} from 'lucide-react';
const links = [
  ['/', 'Overview', LayoutDashboard],
  ['/companies', 'Empresas', Building2],
  ['/accounts', 'Cuentas', Landmark],
  ['/transactions', 'Movimientos', ArrowLeftRight],
  ['/cashflow', 'Flujo de caja', ChartNoAxesCombined],
  ['/connections', 'Conexiones', Plug],
  ['/settings', 'Configuración', Settings],
] as const;
export function Sidebar({ name, role }: { name: string; role: string }) {
  const path = usePathname(),
    params = useSearchParams();
  const global = new URLSearchParams();
  ['company', 'bank', 'currency', 'period'].forEach((k) => {
    const v = params.get(k);
    if (v) global.set(k, v);
  });
  const query = global.toString();
  return (
    <aside className="sidebar">
      <Link href="/" className="brand">
        <span className="brand-mark">
          g<span>•</span>
        </span>
        <span>
          gozo<span className="brand-caption">FINANZAS</span>
        </span>
      </Link>
      <div className="holding-switch">
        <div className="holding-icon">G</div>
        <div>
          <strong>Holding Gozo</strong>
          <span>Tesorería corporativa</span>
        </div>
        <ChevronsUpDown size={14} />
      </div>
      <div className="nav-label">WORKSPACE</div>
      <nav>
        {links.map(([href, label, Icon]) => (
          <Link
            key={href}
            className={`nav-link ${(href === '/' ? path === '/' : path.startsWith(href)) ? 'active' : ''}`}
            href={`${href}${query ? '?' + query : ''}`}
          >
            <Icon size={19} />
            <span>{label}</span>
          </Link>
        ))}
      </nav>
      <div className="nav-label roadmap-label">PRÓXIMAMENTE</div>
      <div className="future-nav">
        <span>
          <Layers size={18} />
          Odoo
        </span>
        <span>
          <CalendarClock size={18} />
          Forecast
        </span>
        <span>
          <Bell size={18} />
          Alertas
        </span>
      </div>
      <div className="sidebar-bottom">
        <span className="avatar">{name.slice(0, 1)}</span>
        <div>
          <strong>{name}</strong>
          <small>
            {role === 'ADMIN' ? 'Administrador' : role === 'FINANCE' ? 'Finanzas' : 'Lectura'}
          </small>
        </div>
        <form action="/api/auth/logout" method="post">
          <button aria-label="Cerrar sesión" className="icon-button">
            <LogOut size={17} />
          </button>
        </form>
      </div>
    </aside>
  );
}
