import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { eq } from 'drizzle-orm';
import { db, kategori } from 'db';
import { currentUser } from '$lib/server/auth';

export const DELETE: RequestHandler = async ({ cookies, params }) => {
  const user = await currentUser(cookies);
  if (!user) return json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  if (user.role !== 'admin') return json({ error: 'FORBIDDEN' }, { status: 403 });
  try {
    const r = await db.delete(kategori).where(eq(kategori.id, Number(params.id))).returning({ id: kategori.id });
    if (!r[0]) return json({ error: 'NOT_FOUND' }, { status: 404 });
    return json({ ok: true });
  } catch {
    return json({ error: 'CATEGORY_IN_USE' }, { status: 400 });
  }
};
