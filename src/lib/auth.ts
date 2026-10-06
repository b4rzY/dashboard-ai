import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { db } from './db';
export const sessionHash = (token: string) => createHash('sha256').update(token).digest('hex');
export async function getUser() {
  const token = (await cookies()).get('gozo_session')?.value;
  if (!token) return null;
  const session = await db.session.findUnique({
    where: { id: sessionHash(token) },
    include: { user: true },
  });
  return session && session.expiresAt > new Date() && session.user.active ? session.user : null;
}
export async function requireUser() {
  const user = await getUser();
  if (!user) redirect('/login');
  return user;
}
export async function createSession(userId: string) {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + 8 * 3600_000);
  await db.session.create({ data: { id: sessionHash(token), userId, expiresAt } });
  (await cookies()).set('gozo_session', token, {
    httpOnly: true,
    secure: process.env.APP_URL?.startsWith('https://') ?? false,
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  });
}
export function validOrigin(request: Request) {
  return (
    request.headers.get('origin') === new URL(process.env.APP_URL || 'http://localhost:3000').origin
  );
}
export function validCron(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 32) return false;
  const value = Buffer.from(request.headers.get('authorization') || '');
  const expected = Buffer.from(`Bearer ${secret}`);
  return value.length === expected.length && timingSafeEqual(value, expected);
}
