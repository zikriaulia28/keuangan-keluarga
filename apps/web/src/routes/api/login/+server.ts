import { randomUUID } from 'node:crypto';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { eq } from 'drizzle-orm';
import { db, sessions, users } from 'db';
import { SESSION_MAX_AGE, verifyPassword } from '$lib/server/auth';

const isProd = process.env.NODE_ENV === 'production';

export const POST: RequestHandler = async ({ request, cookies }) => {
  let body: { username?: unknown; password?: unknown };
  try {
    body = (await request.json()) as { username?: unknown; password?: unknown };
  } catch {
    return json({ error: 'INVALID_CREDENTIALS' }, { status: 401 });
  }
  if (typeof body.username !== 'string' || typeof body.password !== 'string') {
    return json({ error: 'INVALID_CREDENTIALS' }, { status: 401 });
  }
  const row = (await db.select().from(users).where(eq(users.username, body.username)).limit(1))[0];
  if (!row || !verifyPassword(body.password, row.passwordHash)) {
    return json({ error: 'INVALID_CREDENTIALS' }, { status: 401 });
  }
  const token = randomUUID().replaceAll('-', '') + randomUUID().replaceAll('-', '');
  const exp = new Date(Date.now() + SESSION_MAX_AGE * 1000);
  const stamp = exp.toISOString().slice(0, 19).replace('T', ' ');
  await db.insert(sessions).values({ token, userId: row.id, expiresAt: stamp });
  cookies.set('session', token, {
    httpOnly: true,
    path: '/',
    maxAge: SESSION_MAX_AGE,
    secure: isProd,
    sameSite: 'lax',
  });
  return json({ id: row.id, username: row.username, role: row.role });
};
