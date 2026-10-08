import { getUser, validOrigin } from '@/lib/auth';
import { db } from '@/lib/db';
import { safeSyncError, syncConnection } from '@/services/sync';

export const maxDuration = 300;

export async function POST(request: Request) {
  if (!validOrigin(request)) return Response.json({ error: 'Origen inválido' }, { status: 403 });
  const user = await getUser();
  if (!user) return Response.json({ error: 'No autorizado' }, { status: 401 });
  if (user.role !== 'ADMIN')
    return Response.json({ error: 'Solo administradores pueden sincronizar' }, { status: 403 });
  if (process.env.DEMO_MODE === 'true')
    return Response.json(
      { error: 'La sincronización bancaria está deshabilitada en el ambiente demo' },
      { status: 409 },
    );

  const connections = await db.bankConnection.findMany({
    where: { provider: 'FINTOC', company: { holdingId: user.holdingId, active: true } },
    select: { id: true },
    orderBy: { id: 'asc' },
  });
  await db.auditLog.create({
    data: { userId: user.id, action: 'connections.sync_all', resourceId: user.holdingId },
  });

  const results: { id: string; success: boolean; skipped: boolean; error?: string }[] = [];
  for (const connection of connections) {
    try {
      const result = await syncConnection(connection.id);
      results.push({ id: connection.id, success: !result.skipped, skipped: result.skipped });
    } catch (error) {
      results.push({
        id: connection.id,
        success: false,
        skipped: false,
        error: safeSyncError(error),
      });
    }
  }

  const completed = results.filter((result) => result.success).length;
  const skipped = results.filter((result) => result.skipped).length;
  const failed = results.length - completed - skipped;
  return Response.json({
    total: results.length,
    completed,
    skipped,
    failed,
    message: `${completed} sincronizadas · ${failed} requieren atención${skipped ? ` · ${skipped} ya estaban en curso` : ''}`,
  });
}
