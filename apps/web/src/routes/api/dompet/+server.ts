import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { eq } from 'drizzle-orm';
import { db, dompet } from 'db';
import { currentUser } from '$lib/server/auth';
import { saldoSemuaDompet } from '$lib/server/saldo';

export const GET: RequestHandler = async ({ cookies, url }) => {
  const user = await currentUser(cookies);
  if (!user) return json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  // Default hanya dompet aktif supaya form transaksi/tagihan tak pernah
  // menawarkan dompet terarsip. `?semua=1` untuk halaman pengelolaan dompet.
  const semua = url.searchParams.get('semua') === '1';
  const [list, saldo] = await Promise.all([
    semua
      ? db.select().from(dompet).orderBy(dompet.nama)
      : db.select().from(dompet).where(eq(dompet.arsip, false)).orderBy(dompet.nama),
    saldoSemuaDompet(db)
  ]);
  return json(
    list.map((d) => ({
      id_dompet: d.id,
      nama_dompet: d.nama,
      arsip: d.arsip,
      saldo: saldo.get(d.id) ?? 0
    }))
  );
};

export const POST: RequestHandler = async ({ request, cookies }) => {
  const user = await currentUser(cookies);
  if (!user) return json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  if (user.role !== 'admin') return json({ error: 'FORBIDDEN' }, { status: 403 });
  let body: { nama_dompet?: unknown };
  try {
    body = (await request.json()) as { nama_dompet?: unknown };
  } catch {
    return json({ error: 'INVALID_WALLET' }, { status: 400 });
  }
  const nama = typeof body.nama_dompet === 'string' ? body.nama_dompet.trim() : '';
  if (nama.length < 1 || nama.length > 64) return json({ error: 'INVALID_WALLET' }, { status: 400 });
  try {
    const ins = (
      await db
        .insert(dompet)
        .values({ nama })
        .returning({ id: dompet.id, nama: dompet.nama })
    )[0];
    return json({ id_dompet: ins.id, nama_dompet: ins.nama, arsip: false, saldo: 0 }, { status: 201 });
  } catch {
    return json({ error: 'WALLET_DUPLICATE' }, { status: 409 });
  }
};
