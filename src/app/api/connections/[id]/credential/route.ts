import { z } from 'zod';
import { getUser, validOrigin } from '@/lib/auth';
import { encryptCredential } from '@/lib/credential-vault';
import { db } from '@/lib/db';
import { safeSyncError, syncConnection } from '@/services/sync';

export const maxDuration = 300;

const inputSchema = z.object({
  token: z
    .string()
    .trim()
    .max(512)
    .regex(
      /^link_[A-Za-z0-9_-]+_token_[A-Za-z0-9_-]+$/,
      'El token debe tener el formato link_…_token_…',
    ),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!validOrigin(request)) return Response.json({ error: 'Origen inválido' }, { status: 403 });
  const user = await getUser();
  if (!user) return Response.json({ error: 'No autorizado' }, { status: 401 });
  if (user.role !== 'ADMIN')
    return Response.json(
      { error: 'Solo administradores pueden actualizar accesos' },
      { status: 403 },
    );
  if (process.env.DEMO_MODE === 'true')
    return Response.json(
      { error: 'No se pueden guardar accesos en el ambiente demo' },
      { status: 409 },
    );

  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return Response.json(
      { error: parsed.error.issues[0]?.message || 'Token inválido' },
      { status: 400 },
    );

  const { id } = await params;
  const connection = await db.bankConnection.findFirst({
    where: { id, company: { holdingId: user.holdingId } },
  });
  if (!connection) return Response.json({ error: 'Conexión no encontrada' }, { status: 404 });
  if (connection.provider !== 'FINTOC')
    return Response.json({ error: 'Esta conexión no utiliza Fintoc' }, { status: 409 });

  await db.$transaction([
    db.bankConnection.update({
      where: { id },
      data: {
        credentialCiphertext: encryptCredential(parsed.data.token),
        status: 'NEEDS_ATTENTION',
        errorMessage: null,
        lastAttemptAt: null,
        leaseUntil: null,
        leaseToken: null,
      },
    }),
    db.auditLog.create({
      data: { userId: user.id, action: 'connection.credential.update', resourceId: id },
    }),
  ]);

  try {
    const result = await syncConnection(id);
    if (result.skipped)
      return Response.json(
        { saved: true, error: 'Acceso guardado; la conexión ya se está sincronizando' },
        { status: 409 },
      );
    return Response.json({
      saved: true,
      message: `Acceso actualizado; ${result.processed} movimientos procesados`,
    });
  } catch (error) {
    return Response.json(
      { saved: true, error: `Acceso guardado; ${safeSyncError(error)}` },
      { status: 422 },
    );
  }
}
