import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { db } from '@/lib/db';
import { createSession, validOrigin } from '@/lib/auth';
import { verifyPassword, hashPassword } from '@/lib/password';
const dummy = hashPassword('invalid-password-for-timing');
export async function POST(request: Request) {
  if (!validOrigin(request))
    return NextResponse.json({ error: 'Origen inválido' }, { status: 403 });
  const form = await request.formData();
  const input = z
    .object({ email: z.email().max(200), password: z.string().min(1).max(200) })
    .safeParse(Object.fromEntries(form));
  const fail = (code: string) =>
    NextResponse.redirect(
      new URL(`/login?error=${code}`, process.env.APP_URL || 'http://localhost:3000'),
      303,
    );
  if (!input.success) return fail('credentials');
  const email = input.data.email.toLowerCase();
  const key = createHash('sha256').update(email).digest('hex');
  const now = new Date();
  await db.loginAttempt.upsert({ where: { key }, create: { key }, update: {} });
  await db.loginAttempt.updateMany({
    where: { key, windowStart: { lt: new Date(Date.now() - 15 * 60_000) } },
    data: { failures: 0, windowStart: now },
  });
  const reserved = await db.loginAttempt.updateMany({
    where: { key, failures: { lt: 8 } },
    data: { failures: { increment: 1 } },
  });
  if (!reserved.count) return fail('rate');
  const user = await db.user.findUnique({ where: { email } });
  const correct = verifyPassword(input.data.password, user?.passwordHash || dummy);
  if (!user || !user.active || !correct) return fail('credentials');
  await db.loginAttempt.update({ where: { key }, data: { failures: 0 } });
  await createSession(user.id);
  return NextResponse.redirect(new URL('/', process.env.APP_URL || 'http://localhost:3000'), 303);
}
