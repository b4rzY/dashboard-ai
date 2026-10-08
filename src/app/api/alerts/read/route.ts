import { getUser, validOrigin } from '@/lib/auth';
import { db } from '@/lib/db';

export async function POST(request: Request) {
  if (!validOrigin(request)) return Response.json({ error: 'Origen inválido' }, { status: 403 });
  const user = await getUser();
  if (!user) return Response.json({ error: 'No autorizado' }, { status: 401 });

  const updated = await db.alertEvent.updateMany({
    where: { holdingId: user.holdingId, readAt: null },
    data: { readAt: new Date() },
  });
  await db.auditLog.create({
    data: { userId: user.id, action: 'alerts.mark_all_read', resourceId: user.holdingId },
  });
  return Response.json({ updated: updated.count });
}
