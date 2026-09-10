import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { eq } from 'drizzle-orm';
import { db, dompet, kategori, transaksi, utang } from 'db';
import { currentUser } from '../../../../../lib/server/auth';
import { saldoDompet } from '../../../../../lib/server/saldo';
const TGL = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;

export const POST: RequestHandler = async ({ cookies, request, params }) => {
  const user = await currentUser(cookies);
  if (!user) return json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  // Elysia memvalidasi body SEBELUM handler → cek struktur dulu.
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== 'object') return json({ error: 'INTERNAL' }, { status: 422 });
  const { jumlah, tanggal } = body;
  if (typeof jumlah !== 'number' || !Number.isInteger(jumlah) || jumlah < 1)
    return json({ error: 'INTERNAL' }, { status: 422 });
  if (tanggal !== undefined && typeof tanggal !== 'string')
    return json({ error: 'INTERNAL' }, { status: 422 });
  const id = Number(params.id);
  const row = Number.isInteger(id)
    ? (await db.select().from(utang).where(eq(utang.id, id)).limit(1))[0]
    : undefined;
  if (!row) return json({ error: 'NOT_FOUND' }, { status: 404 });
  const sisa = row.jumlah - row.terbayar;
  if (sisa <= 0) return json({ error: 'ALREADY_PAID' }, { status: 400 });
  if (jumlah > sisa) return json({ error: 'OVERPAY' }, { status: 400 });
  // Bayar utang = uang keluar; terima piutang = uang masuk. Catat otomatis.
  const d = (await db.select().from(dompet).orderBy(dompet.id).limit(1))[0];
  if (!d) return json({ error: 'NO_WALLET' }, { status: 400 });
  const tipe = row.arah === 'utang' ? 'keluar' : 'masuk';
  if (tipe === 'keluar' && jumlah > (await saldoDompet(db, d.id)))
    return json({ error: 'INSUFFICIENT_BALANCE' }, { status: 400 });
  const k = (
    await db
      .select()
      .from(kategori)
      .where(eq(kategori.nama, row.arah === 'utang' ? 'Bayar Utang' : 'Terima Piutang'))
      .limit(10)
  ).find((r) => r.tipe === tipe);
  if (!k) return json({ error: 'MISSING_CATEGORY' }, { status: 400 });
  const today = new Date().toISOString().slice(0, 10);
  await db.insert(transaksi).values({
    tanggal: typeof tanggal === 'string' && TGL.test(tanggal) ? tanggal : today,
    tipe,
    dompetId: d.id,
    kategoriId: k.id,
    jumlah,
    catatan: `${row.arah === 'utang' ? 'Bayar utang ke' : 'Terima piutang dari'} ${row.pihak}`,
    userId: user.id,
  });
  await db.update(utang).set({ terbayar: row.terbayar + jumlah }).where(eq(utang.id, row.id));
  return json({ ok: true, sisa: sisa - jumlah });
};
