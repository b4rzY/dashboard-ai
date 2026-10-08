'use client';

import { useState } from 'react';
import { CheckCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';

export function AlertReadButton({ disabled }: { disabled: boolean }) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function markAllRead() {
    setLoading(true);
    try {
      const response = await fetch('/api/alerts/read', { method: 'POST' });
      if (!response.ok) throw new Error('No se pudieron actualizar las alertas');
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <button className="button secondary-button" disabled={disabled || loading} onClick={markAllRead}>
      <CheckCheck size={16} />
      {loading ? 'Actualizando…' : 'Marcar todas como leídas'}
    </button>
  );
}
