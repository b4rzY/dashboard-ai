import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { validOrigin, sessionHash } from '@/lib/auth';
import { db } from '@/lib/db';
export async function POST(request: Request) {
  if (!validOrigin(request))
    return NextResponse.json({ error: 'Origen inválido' }, { status: 403 });
  const jar = await cookies();
  const token = jar.get('gozo_session')?.value;
  if (token) await db.session.deleteMany({ where: { id: sessionHash(token) } });
  jar.delete('gozo_session');
  return NextResponse.redirect(
    new URL('/login', process.env.APP_URL || 'http://localhost:3000'),
    303,
  );
}
