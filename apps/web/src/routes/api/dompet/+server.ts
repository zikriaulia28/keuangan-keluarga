import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db, dompet } from 'db';
import { currentUser } from '$lib/server/auth';
import { saldoDompet } from '$lib/server/saldo';

export const GET: RequestHandler = async ({ cookies }) => {
  const user = await currentUser(cookies);
  if (!user) return json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  const list = await db.select().from(dompet).orderBy(dompet.nama);
  const out = [];
  for (const d of list) out.push({ id_dompet: d.id, nama_dompet: d.nama, saldo: await saldoDompet(db, d.id) });
  return json(out);
};
