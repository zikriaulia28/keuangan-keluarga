import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { and, eq } from 'drizzle-orm';
import { db, dompet, tagihan, tagihanBayar, transaksi } from 'db';
import { currentUser } from '../../../../../lib/server/auth';
import { saldoDompet } from '../../../../../lib/server/saldo';
const BULAN = /^[0-9]{4}-[0-9]{2}$/;
const TGL = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;

export const POST: RequestHandler = async ({ cookies, request, params }) => {
  const user = await currentUser(cookies);
  if (!user) return json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  if (user.role !== 'admin') return json({ error: 'FORBIDDEN' }, { status: 403 });
  const id = Number(params.id);
  const row = Number.isInteger(id)
    ? (await db.select().from(tagihan).where(eq(tagihan.id, id)).limit(1))[0]
    : undefined;
  if (!row) return json({ error: 'NOT_FOUND' }, { status: 404 });
  // Elysia: tanpa skema body → baca lenient (body?.bulan, body?.id_dompet).
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const bulan =
    typeof body?.bulan === 'string' && BULAN.test(body.bulan)
      ? body.bulan
      : new Date().toISOString().slice(0, 7);
  const ada = (
    await db
      .select()
      .from(tagihanBayar)
      .where(and(eq(tagihanBayar.tagihanId, row.id), eq(tagihanBayar.bulan, bulan)))
      .limit(1)
  )[0];
  if (ada) return json({ error: 'ALREADY_PAID' }, { status: 409 });
  const d = (
    await db.select().from(dompet).where(eq(dompet.id, Number(body?.id_dompet))).limit(1)
  )[0];
  if (!d) return json({ error: 'INVALID_WALLET' }, { status: 400 });
  if (row.jumlah > (await saldoDompet(db, d.id)))
    return json({ error: 'INSUFFICIENT_BALANCE' }, { status: 400 });
  const today = new Date().toISOString().slice(0, 10);
  const tr = (
    await db
      .insert(transaksi)
      .values({
        tanggal:
          typeof body?.tanggal === 'string' && TGL.test(body.tanggal) ? body.tanggal : today,
        tipe: 'keluar',
        dompetId: d.id,
        kategoriId: row.kategoriId,
        jumlah: row.jumlah,
        catatan: `Tagihan ${row.nama} ${bulan}`,
        userId: user.id,
      })
      .returning({ id: transaksi.id })
  )[0];
  await db.insert(tagihanBayar).values({ tagihanId: row.id, bulan, transaksiId: tr.id, dibayarOleh: user.id });
  return json({ ok: true, id_transaksi: tr.id }, { status: 201 });
};
