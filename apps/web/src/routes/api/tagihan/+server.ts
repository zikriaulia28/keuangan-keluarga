import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { eq } from 'drizzle-orm';
import { db, kategori, tagihan, tagihanBayar } from 'db';
import { currentUser } from '../../../lib/server/auth';

const BULAN = /^[0-9]{4}-[0-9]{2}$/;

export const GET: RequestHandler = async ({ cookies, url }) => {
  const user = await currentUser(cookies);
  if (!user) return json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  const bulan = url.searchParams.get('bulan') || new Date().toISOString().slice(0, 7);
  if (!BULAN.test(bulan)) return json({ error: 'INVALID_MONTH' }, { status: 400 });
  const list = await db
    .select({
      id: tagihan.id,
      nama: tagihan.nama,
      jumlah: tagihan.jumlah,
      hari: tagihan.hari,
      catatan: tagihan.catatan,
      kategori: kategori.nama,
    })
    .from(tagihan)
    .innerJoin(kategori, eq(tagihan.kategoriId, kategori.id))
    .orderBy(tagihan.hari, tagihan.nama);
  const sudah = await db.select().from(tagihanBayar).where(eq(tagihanBayar.bulan, bulan));
  const lunas: Record<number, true> = {};
  for (const s of sudah) lunas[s.tagihanId] = true;
  return json(list.map((r) => ({ ...r, lunas: lunas[r.id] === true })));
};

export const POST: RequestHandler = async ({ cookies, request }) => {
  const user = await currentUser(cookies);
  if (!user) return json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  if (user.role !== 'admin') return json({ error: 'FORBIDDEN' }, { status: 403 });
  // Elysia: body tak sesuai skema → 422 (onError global → { error: 'INTERNAL' }).
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== 'object') return json({ error: 'INTERNAL' }, { status: 422 });
  const { nama, jumlah, hari, id_kategori, catatan } = body;
  if (typeof nama !== 'string' || nama.length < 1) return json({ error: 'INTERNAL' }, { status: 422 });
  if (typeof jumlah !== 'number' || !Number.isInteger(jumlah) || jumlah < 1)
    return json({ error: 'INTERNAL' }, { status: 422 });
  if (typeof hari !== 'number' || !Number.isInteger(hari) || hari < 1 || hari > 31)
    return json({ error: 'INTERNAL' }, { status: 422 });
  if (typeof id_kategori !== 'number' || !Number.isInteger(id_kategori))
    return json({ error: 'INVALID_CATEGORY' }, { status: 400 });
  if (catatan !== undefined && typeof catatan !== 'string')
    return json({ error: 'INTERNAL' }, { status: 422 });
  const k = (await db.select().from(kategori).where(eq(kategori.id, id_kategori)).limit(1))[0];
  if (!k || k.tipe !== 'keluar') return json({ error: 'INVALID_CATEGORY' }, { status: 400 });
  try {
    const ins = (
      await db
        .insert(tagihan)
        .values({
          nama: nama.trim(),
          jumlah,
          hari,
          kategoriId: id_kategori,
          catatan: (catatan as string | undefined) ?? '',
        })
        .returning({ id: tagihan.id })
    )[0];
    return json({ id: ins.id }, { status: 201 });
  } catch {
    return json({ error: 'BILL_DUPLICATE' }, { status: 409 });
  }
};
