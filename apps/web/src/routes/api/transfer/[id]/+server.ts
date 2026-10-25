import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { eq } from 'drizzle-orm';
import { db, transfer } from 'db';
import { currentUser } from '$lib/server/auth';
import { saldoDompet } from '$lib/server/saldo';

export const DELETE: RequestHandler = async ({ cookies, params }) => {
  const user = await currentUser(cookies);
  if (!user) return json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  if (user.role !== 'admin') return json({ error: 'FORBIDDEN' }, { status: 403 });
  const id = Number(params.id);
  if (!Number.isInteger(id)) return json({ error: 'NOT_FOUND' }, { status: 404 });
  const row = (await db.select().from(transfer).where(eq(transfer.id, id)).limit(1))[0];
  if (!row) return json({ error: 'NOT_FOUND' }, { status: 404 });
  // Membatalkan transfer menarik kembali dana tujuan; pastikan tidak jadi negatif.
  if (row.jumlah > (await saldoDompet(db, row.dompetTujuan))) {
    return json({ error: 'INSUFFICIENT_BALANCE' }, { status: 400 });
  }
  await db.delete(transfer).where(eq(transfer.id, row.id));
  return json({ ok: true });
};
