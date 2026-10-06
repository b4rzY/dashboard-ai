'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw } from 'lucide-react';
import { Button } from './ui/button';
export function SyncButton({ id, disabled = false }: { id: string; disabled?: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false),
    [message, setMessage] = useState('');
  return (
    <div className="sync-control">
      <Button
        variant="outline"
        size="sm"
        disabled={disabled || pending}
        onClick={async () => {
          setPending(true);
          setMessage('');
          try {
            const r = await fetch(`/api/connections/${id}/sync`, { method: 'POST' });
            const data: { message?: string; error?: string } = await r.json();
            setMessage(data.error || data.message || 'Solicitud registrada');
            router.refresh();
          } catch {
            setMessage('No se pudo solicitar la sincronización');
          } finally {
            setPending(false);
          }
        }}
      >
        <RefreshCw size={14} className={pending ? 'spin' : ''} />
        {pending ? 'Sincronizando…' : 'Sincronizar ahora'}
      </Button>
      {message && <small role="status">{message}</small>}
    </div>
  );
}
