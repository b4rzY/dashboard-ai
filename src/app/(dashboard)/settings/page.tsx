import { requireUser } from '@/lib/auth';
import { PageTitle } from '@/components/dashboard';
import { ShieldCheck, Layers, CalendarClock, Bell } from 'lucide-react';
import { db } from '@/lib/db';
export default async function Page() {
  const user = await requireUser();
  const users =
    user.role === 'ADMIN'
      ? await db.user.findMany({
          where: { holdingId: user.holdingId },
          select: { email: true, name: true, role: true, active: true },
        })
      : [];
  return (
    <>
      <PageTitle
        title="Configuración"
        description="Acceso interno, fuentes de datos y próximos módulos."
      />
      <div className="settings-grid">
        <section className="panel settings-panel">
          <ShieldCheck size={23} />
          <h2>Acceso y seguridad</h2>
          <p>
            Sesiones de 8 horas, credenciales cifradas con scrypt y permisos por rol. Las cuentas y
            movimientos están limitados a tu holding.
          </p>
          <div className="settings-line">
            <span>Tu rol</span>
            <strong>{user.role}</strong>
          </div>
          <div className="settings-line">
            <span>Tu correo</span>
            <strong>{user.email}</strong>
          </div>
          {user.role === 'ADMIN' && (
            <>
              <h3>Usuarios internos</h3>
              {users.map((u) => (
                <div className="settings-line" key={u.email}>
                  <span>
                    {u.name}
                    <small>{u.email}</small>
                  </span>
                  <strong>
                    {u.role}
                    {!u.active ? ' · Inactivo' : ''}
                  </strong>
                </div>
              ))}
            </>
          )}
        </section>
        <section className="panel settings-panel">
          <Layers size={23} />
          <h2>Fuentes de datos</h2>
          <p>
            Los saldos y movimientos se almacenan en la base de Gozo. Las credenciales bancarias se
            configuran exclusivamente en el servidor.
          </p>
          <div className="settings-line">
            <span>Fintoc</span>
            <strong>
              {process.env.FINTOC_SECRET_KEY ? 'Configurado' : 'Pendiente de credenciales'}
            </strong>
          </div>
          <div className="settings-line">
            <span>Global66</span>
            <strong>Fuente manual preparada</strong>
          </div>
          <div className="settings-line">
            <span>Ambiente</span>
            <strong>{process.env.DEMO_MODE === 'true' ? 'Demo' : 'Producción'}</strong>
          </div>
        </section>
      </div>
      <div className="section-heading">
        <div>
          <h2>Próximos módulos</h2>
          <p>La arquitectura está preparada; estos módulos aún no están disponibles.</p>
        </div>
      </div>
      <div className="roadmap-grid">
        {[
          {
            title: 'Odoo',
            icon: Layers,
            text: 'Cuentas por cobrar y pagar, facturas, pagos y conciliación.',
          },
          {
            title: 'Forecast',
            icon: CalendarClock,
            text: 'Proyección de caja a 7, 30, 60 y 90 días con información del ERP.',
          },
          {
            title: 'Alertas',
            icon: Bell,
            text: 'Reglas de saldo, egresos relevantes y conexiones desactualizadas.',
          },
        ].map((m) => (
          <section className="panel settings-panel" key={m.title}>
            <m.icon size={23} />
            <h3>{m.title}</h3>
            <p>{m.text}</p>
            <span className="category-tag">En roadmap</span>
          </section>
        ))}
      </div>
    </>
  );
}
