import { z } from 'zod';
import { db } from '@/lib/db';
import { verifyWebhook } from '@/services/webhook-signature';
const schema = z.object({
  id: z.string().max(100),
  type: z.string().max(100),
  data: z.record(z.string(), z.unknown()),
});
export async function POST(request: Request) {
  const secret = process.env.FINTOC_WEBHOOK_SECRET;
  if (!secret) return Response.json({ error: 'Webhook no configurado' }, { status: 503 });
  if (Number(request.headers.get('content-length') || 0) > 1_000_000)
    return new Response(null, { status: 413 });
  const payload = await request.text();
  if (Buffer.byteLength(payload) > 1_000_000) return new Response(null, { status: 413 });
  if (!verifyWebhook(payload, request.headers.get('fintoc-signature') || '', secret))
    return Response.json({ error: 'Firma inválida' }, { status: 400 });
  let input;
  try {
    input = schema.parse(JSON.parse(payload));
  } catch {
    return Response.json({ error: 'Evento inválido' }, { status: 400 });
  }
  if (process.env.DEMO_MODE === 'true') return Response.json({ received: true, skipped: true });
  try {
    await db.$transaction(async (tx) => {
      const inserted = await tx.webhookEvent.createMany({
        data: [{ id: input.id, type: input.type }],
        skipDuplicates: true,
      });
      if (!inserted.count) return;
      if (!input.type.startsWith('account.') && !input.type.startsWith('link.')) return;
      const accountId = typeof input.data.account_id === 'string' ? input.data.account_id : null;
      const linkId =
        typeof input.data.link_id === 'string'
          ? input.data.link_id
          : typeof input.data.id === 'string' && input.type.startsWith('link.')
            ? input.data.id
            : null;
      const connections = await tx.bankConnection.findMany({
        where: {
          provider: 'FINTOC',
          OR: [
            ...(accountId ? [{ accounts: { some: { providerAccountId: accountId } } }] : []),
            ...(linkId ? [{ providerConnectionId: linkId }] : []),
          ],
        },
        select: { id: true },
      });
      for (const c of connections)
        await tx.syncJob.upsert({
          where: { dedupeKey: `webhook:${input.id}:${c.id}` },
          create: { connectionId: c.id, dedupeKey: `webhook:${input.id}:${c.id}` },
          update: {},
        });
    });
    return Response.json({ received: true });
  } catch {
    return Response.json({ error: 'No se pudo guardar el evento; reintentar' }, { status: 500 });
  }
}
