import { z } from 'zod';
import { getUser, validOrigin } from '@/lib/auth';
import { db } from '@/lib/db';

const schema = z.object({
  syncFailure: z.boolean(),
  failedPayment: z.boolean(),
  largePayment: z.boolean(),
  unusualPayment: z.boolean(),
  largeClp: z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  unusualClp: z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER),
});

export async function POST(request: Request) {
  if (!validOrigin(request)) return Response.json({ error: 'Origen inválido' }, { status: 403 });
  const user = await getUser();
  if (!user) return Response.json({ error: 'No autorizado' }, { status: 401 });
  if (user.role !== 'ADMIN')
    return Response.json({ error: 'Solo administradores pueden cambiar las reglas' }, { status: 403 });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return Response.json({ error: 'Revisa los umbrales ingresados' }, { status: 400 });
  const input = parsed.data;
  const rules = [
    { type: 'SYNC_FAILURE', enabled: input.syncFailure, configuration: {} },
    { type: 'PAYMENT_FAILED', enabled: input.failedPayment, configuration: {} },
    {
      type: 'LARGE_PAYMENT',
      enabled: input.largePayment,
      configuration: { CLP: String(input.largeClp), USD: '1000000' },
    },
    {
      type: 'UNUSUAL_PAYMENT',
      enabled: input.unusualPayment,
      configuration: { CLP: String(input.unusualClp), USD: '200000' },
    },
  ];

  await db.$transaction(async (tx) => {
    for (const rule of rules)
      await tx.alertRule.upsert({
        where: { holdingId_type: { holdingId: user.holdingId, type: rule.type } },
        create: { holdingId: user.holdingId, ...rule },
        update: { enabled: rule.enabled, configuration: rule.configuration },
      });
    await tx.auditLog.create({
      data: { userId: user.id, action: 'alerts.settings.update', resourceId: user.holdingId },
    });
  });
  return Response.json({ ok: true });
}
