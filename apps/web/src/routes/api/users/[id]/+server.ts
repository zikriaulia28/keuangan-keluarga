import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { eq } from 'drizzle-orm';
import { db, users } from 'db';
import { currentUser } from '$lib/server/auth';

export const DELETE: RequestHandler = async ({ cookies, params }) => {
  const user = await currentUser(cookies);
  if (!user) return json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  if (user.role !== 'admin') return json({ error: 'FORBIDDEN' }, { status: 403 });
  const id = Number(params.id);
  if (id === user.id) return json({ error: 'CANNOT_DELETE_SELF' }, { status: 400 });
  const target = (await db.select().from(users).where(eq(users.id, id)).limit(1))[0];
  if (!target) return json({ error: 'NOT_FOUND' }, { status: 404 });
  if (target.role === 'admin') {
    const admins = await db.select({ id: users.id }).from(users).where(eq(users.role, 'admin'));
    if (admins.length <= 1) return json({ error: 'LAST_ADMIN' }, { status: 400 });
  }
  try {
    await db.delete(users).where(eq(users.id, id));
    return json({ ok: true });
  } catch {
    return json({ error: 'USER_IN_USE' }, { status: 400 });
  }
};
