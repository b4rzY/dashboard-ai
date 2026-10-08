'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { KeyRound, X } from 'lucide-react';
import { Button } from './ui/button';

export function CredentialButton({ id, configured }: { id: string; configured: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState('');
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setMessage('');
    try {
      const response = await fetch(`/api/connections/${id}/credential`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const data: { message?: string; error?: string; saved?: boolean } = await response.json();
      setMessage(data.error || data.message || 'Acceso actualizado');
      if (data.saved) {
        setToken('');
        setOpen(false);
      }
      router.refresh();
    } catch {
      setMessage('No se pudo actualizar el acceso');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="credential-control">
      <Button variant="ghost" size="sm" onClick={() => setOpen((value) => !value)}>
        {open ? <X size={14} /> : <KeyRound size={14} />}
        {configured ? 'Cambiar acceso' : 'Agregar acceso'}
      </Button>
      {open && (
        <form className="credential-form" onSubmit={submit}>
          <label htmlFor={`credential-${id}`}>Token de conexión Fintoc</label>
          <input
            id={`credential-${id}`}
            type="password"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            placeholder="link_…_token_…"
            autoComplete="off"
            spellCheck={false}
            required
          />
          <small>Se cifra antes de guardarse y nunca se vuelve a mostrar.</small>
          <Button type="submit" size="sm" disabled={pending || !token.trim()}>
            {pending ? 'Guardando y sincronizando…' : 'Guardar y sincronizar'}
          </Button>
        </form>
      )}
      {message && <small role="status">{message}</small>}
    </div>
  );
}
