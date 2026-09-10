import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { eq } from 'drizzle-orm';
import { db, utang } from 'db';
import { currentUser } from '../../../../lib/server/auth';

export const DELETE: RequestHandler = async ({ cookies, params }) => {
  const user = await currentUser(cookies);
  if (!user) return json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  const id = Number(params.id);
  const row = Number.isInteger(id)
    ? (await db.select().from(utang).where(eq(utang.id, id)).limit(1))[0]
    : undefined;
  if (!row) return json({ error: 'NOT_FOUND' }, { status: 404 });
  if (user.role !== 'admin' && row.userId !== user.id) return json({ error: 'FORBIDDEN' }, { status: 403 });
  await db.delete(utang).where(eq(utang.id, row.id));
  return json({ ok: true });
};
