import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { eq } from 'drizzle-orm';
import { anggaran, db } from 'db';
import { currentUser } from '../../../../lib/server/auth';

export const DELETE: RequestHandler = async ({ cookies, params }) => {
  const user = await currentUser(cookies);
  if (!user) return json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  if (user.role !== 'admin') return json({ error: 'FORBIDDEN' }, { status: 403 });
  const id = Number(params.id);
  if (!Number.isInteger(id)) return json({ error: 'NOT_FOUND' }, { status: 404 });
  const r = await db.delete(anggaran).where(eq(anggaran.id, id)).returning({ id: anggaran.id });
  if (!r[0]) return json({ error: 'NOT_FOUND' }, { status: 404 });
  return json({ ok: true });
};
