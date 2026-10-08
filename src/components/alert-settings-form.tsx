'use client';

import { useState } from 'react';
import { Save } from 'lucide-react';
import { useRouter } from 'next/navigation';

type Settings = {
  syncFailure: boolean;
  failedPayment: boolean;
  largePayment: boolean;
  unusualPayment: boolean;
  largeClp: string;
  unusualClp: string;
};

export function AlertSettingsForm({ initial }: { initial: Settings }) {
  const [settings, setSettings] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const router = useRouter();

  function toggle(key: keyof Pick<Settings, 'syncFailure' | 'failedPayment' | 'largePayment' | 'unusualPayment'>) {
    setSettings((current) => ({ ...current, [key]: !current[key] }));
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      const response = await fetch('/api/alerts/settings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(settings),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'No se pudo guardar');
      setMessage('Reglas guardadas');
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  }

  const options = [
    ['syncFailure', 'Fallas de sincronización', 'Avisa cuando Fintoc o el banco rechaza una actualización.'],
    ['failedPayment', 'Pagos fallidos', 'Detecta movimientos rechazados, cancelados o revertidos.'],
    ['largePayment', 'Pagos de monto elevado', 'Compara cada egreso con el umbral configurado.'],
    ['unusualPayment', 'Pagos inusuales', 'Avisa ante un egreso relevante a una contraparte nueva.'],
  ] as const;

  return (
    <form className="alert-settings" onSubmit={save}>
      {options.map(([key, title, description]) => (
        <label className="alert-rule" key={key}>
          <span>
            <strong>{title}</strong>
            <small>{description}</small>
          </span>
          <input type="checkbox" checked={settings[key]} onChange={() => toggle(key)} />
        </label>
      ))}
      <div className="alert-thresholds">
        <label>
          Pago elevado desde (CLP)
          <input
            type="number"
            min="1"
            step="100000"
            value={settings.largeClp}
            onChange={(event) => setSettings({ ...settings, largeClp: event.target.value })}
          />
        </label>
        <label>
          Pago inusual desde (CLP)
          <input
            type="number"
            min="1"
            step="100000"
            value={settings.unusualClp}
            onChange={(event) => setSettings({ ...settings, unusualClp: event.target.value })}
          />
        </label>
      </div>
      <div className="alert-settings-actions">
        <button className="button" disabled={saving}>
          <Save size={16} /> {saving ? 'Guardando…' : 'Guardar reglas'}
        </button>
        {message && <span>{message}</span>}
      </div>
    </form>
  );
}
