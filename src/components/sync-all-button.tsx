'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw } from 'lucide-react';
import { Button } from './ui/button';

export function SyncAllButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');

  async function syncAll() {
    setPending(true);
    setMessage('');
    try {
      const response = await fetch('/api/connections/sync-all', { method: 'POST' });
      const data: { message?: string; error?: string } = await response.json();
      setMessage(data.error || data.message || 'Sincronización finalizada');
      router.refresh();
    } catch {
      setMessage('No se pudo sincronizar el holding');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="sync-all-control">
      <Button disabled={pending} onClick={syncAll}>
        <RefreshCw size={15} className={pending ? 'spin' : ''} />
        {pending ? 'Sincronizando todo…' : 'Sincronizar todo'}
      </Button>
      {message && <small role="status">{message}</small>}
    </div>
  );
}
