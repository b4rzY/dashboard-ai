import { getUser, validOrigin } from '@/lib/auth';
import { db } from '@/lib/db';
import { enqueueConnection, processSyncJobs } from '@/services/sync';
import { randomUUID } from 'node:crypto';
export const maxDuration = 300;
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!validOrigin(request)) return Response.json({ error: 'Origen inválido' }, { status: 403 });
  const user = await getUser();
  if (!user) return Response.json({ error: 'No autorizado' }, { status: 401 });
  if (user.role !== 'ADMIN')
    return Response.json({ error: 'Solo administradores pueden sincronizar' }, { status: 403 });
  const { id } = await params;
  const connection = await db.bankConnection.findFirst({
    where: { id, company: { holdingId: user.holdingId } },
  });
  if (!connection) return Response.json({ error: 'Conexión no encontrada' }, { status: 404 });
  if (connection.provider !== 'FINTOC')
    return Response.json(
      { error: 'Esta fuente se actualiza mediante importación manual' },
      { status: 409 },
    );
  if (process.env.DEMO_MODE === 'true')
    return Response.json(
      { error: 'La sincronización bancaria está deshabilitada en el ambiente demo' },
      { status: 409 },
    );
  if (connection.lastAttemptAt && Date.now() - connection.lastAttemptAt.getTime() < 60_000)
    return Response.json({ error: 'Espera un minuto entre intentos' }, { status: 429 });
  await db.auditLog.create({
    data: { userId: user.id, action: 'connection.sync', resourceId: id },
  });
  const job = await enqueueConnection(id, `manual:${randomUUID()}`);
  await processSyncJobs(1);
  const result = await db.syncJob.findUnique({ where: { id: job.id } });
  return Response.json({
    jobId: job.id,
    status: result?.status,
    message: result?.errorMessage || 'Sincronización solicitada',
  });
}
