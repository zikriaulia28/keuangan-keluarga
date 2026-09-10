import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { eq } from 'drizzle-orm';
import { db, transaksi } from 'db';
import { currentUser } from '$lib/server/auth';

export const DELETE: RequestHandler = async ({ cookies, params }) => {
  const user = await currentUser(cookies);
  if (!user) return json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  const row = (await db.select().from(transaksi).where(eq(transaksi.id, Number(params.id))).limit(1))[0];
  if (!row) return json({ error: 'NOT_FOUND' }, { status: 404 });
  if (user.role !== 'admin' && row.userId !== user.id) {
    return json({ error: 'FORBIDDEN' }, { status: 403 });
  }
  await db.delete(transaksi).where(eq(transaksi.id, row.id));
  return json({ ok: true });
};
