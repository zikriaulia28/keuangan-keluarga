import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { eq } from 'drizzle-orm';
import { db, users } from 'db';
import { currentUser, hashPassword, verifyPassword } from '$lib/server/auth';

export const POST: RequestHandler = async ({ request, cookies }) => {
  const user = await currentUser(cookies);
  if (!user) return json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  let body: { lama?: unknown; baru?: unknown };
  try {
    body = (await request.json()) as { lama?: unknown; baru?: unknown };
  } catch {
    return json({ error: 'WRONG_PASSWORD' }, { status: 400 });
  }
  if (typeof body.lama !== 'string' || typeof body.baru !== 'string' || body.baru.length < 6) {
    return json({ error: 'WRONG_PASSWORD' }, { status: 400 });
  }
  const row = (await db.select().from(users).where(eq(users.id, user.id)).limit(1))[0];
  if (!row || !verifyPassword(body.lama, row.passwordHash)) {
    return json({ error: 'WRONG_PASSWORD' }, { status: 400 });
  }
  await db.update(users).set({ passwordHash: hashPassword(body.baru) }).where(eq(users.id, user.id));
  return json({ ok: true });
};
