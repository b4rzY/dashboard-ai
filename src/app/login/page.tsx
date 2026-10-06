import { redirect } from 'next/navigation';
import { getUser } from '@/lib/auth';
import { ShieldCheck, Landmark } from 'lucide-react';
export const dynamic = 'force-dynamic';
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await getUser();
  if (user) redirect('/');
  const { error } = await searchParams;
  return (
    <div className="login-page">
      <div className="login-story">
        <div className="brand">
          <span className="brand-mark">
            g<span>•</span>
          </span>
          <span>
            gozo<span className="brand-caption">FINANZAS</span>
          </span>
        </div>
        <div>
          <span className="eyebrow">
            <Landmark size={17} />
            TESORERÍA CORPORATIVA
          </span>
          <h1>
            Una mirada clara.
            <br />
            Todas tus empresas.
          </h1>
          <p>Saldos, movimientos y flujo de caja del holding, en un solo lugar.</p>
        </div>
        <span className="login-security">
          <ShieldCheck size={18} />
          Acceso exclusivo para el equipo Gozo
        </span>
      </div>
      <div className="login-form-wrap">
        <form method="post" action="/api/auth/login" className="login-form">
          <span className="login-icon">
            <ShieldCheck size={26} />
          </span>
          <h2>Bienvenido a Gozo</h2>
          <p>Ingresa con tu cuenta interna para acceder al dashboard.</p>
          {process.env.DEMO_MODE === 'true' && (
            <div className="notice">Ambiente demo con información simulada.</div>
          )}
          {error && (
            <div role="alert" className="form-error">
              {error === 'rate'
                ? 'Demasiados intentos. Espera 15 minutos.'
                : 'Correo o contraseña incorrectos.'}
            </div>
          )}
          <label>
            Correo corporativo
            <input
              name="email"
              type="email"
              autoComplete="username"
              required
              placeholder="nombre@empresa.cl"
              maxLength={200}
            />
          </label>
          <label>
            Contraseña
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              maxLength={200}
            />
          </label>
          <button className="button button-primary" type="submit">
            Ingresar al dashboard
          </button>
          <small>¿Necesitas acceso? Contacta al administrador del holding.</small>
        </form>
      </div>
    </div>
  );
}
