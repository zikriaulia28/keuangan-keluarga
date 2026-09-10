import { Elysia, t } from 'elysia';
import { and, desc, eq, gte, lte, sql } from 'drizzle-orm';
import { anggaran, db, dompet, kategori, transaksi, users } from 'db';
import { withAuth } from './auth';

const TGL = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;
const BULAN = /^[0-9]{4}-[0-9]{2}$/;
export async function saldoDompet(id: number): Promise<number> {
  const rows = await db
    .select({
      saldo: sql<number>`COALESCE(SUM(CASE WHEN ${transaksi.tipe} = 'masuk' THEN ${transaksi.jumlah} ELSE -${transaksi.jumlah} END), 0)`,
    })
    .from(transaksi)
    .where(eq(transaksi.dompetId, id));
  return Number(rows[0]?.saldo ?? 0);
}

const bodyTransaksi = t.Object({
  tanggal: t.String({ pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' }),
  tipe: t.Union([t.Literal('masuk'), t.Literal('keluar')]),
  id_dompet: t.Integer(),
  id_kategori: t.Integer(),
  jumlah: t.Integer({ minimum: 1 }),
  catatan: t.Optional(t.String()),
});

export const transaksiRoutes = withAuth(new Elysia())
  .get('/api/transaksi', async ({ query }) => {
    const conds = [];
    if (query.from && TGL.test(query.from)) conds.push(gte(transaksi.tanggal, query.from));
    if (query.to && TGL.test(query.to)) conds.push(lte(transaksi.tanggal, query.to));
    if (query.id_dompet) conds.push(eq(transaksi.dompetId, Number(query.id_dompet)));
    if (query.tipe === 'masuk' || query.tipe === 'keluar') conds.push(eq(transaksi.tipe, query.tipe));
    const limit = Math.min(Math.max(Number(query.limit ?? 100) || 100, 1), 500);
    const offset = Math.max(Number(query.offset ?? 0) || 0, 0);
    return db
      .select({
        id: transaksi.id,
        tanggal: transaksi.tanggal,
        tipe: transaksi.tipe,
        jumlah: transaksi.jumlah,
        catatan: transaksi.catatan,
        dompet: dompet.nama,
        kategori: kategori.nama,
        pencatat: users.username,
      })
      .from(transaksi)
      .innerJoin(dompet, eq(transaksi.dompetId, dompet.id))
      .innerJoin(kategori, eq(transaksi.kategoriId, kategori.id))
      .innerJoin(users, eq(transaksi.userId, users.id))
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(desc(transaksi.tanggal), desc(transaksi.id))
      .limit(limit)
      .offset(offset);
  })
  .post('/api/transaksi', async ({ body, user, set }) => {
    const d = await db.select().from(dompet).where(eq(dompet.id, body.id_dompet)).limit(1);
    if (!d[0]) {
      set.status = 400;
      return { error: 'INVALID_WALLET' };
    }
    const k = await db.select().from(kategori).where(eq(kategori.id, body.id_kategori)).limit(1);
    if (!k[0] || k[0].tipe !== body.tipe) {
      set.status = 400;
      return { error: 'INVALID_CATEGORY' };
    }
    if (body.tipe === 'keluar' && body.jumlah > (await saldoDompet(body.id_dompet))) {
      set.status = 400;
      return { error: 'INSUFFICIENT_BALANCE' };
    }
    const ins = (
      await db
        .insert(transaksi)
        .values({
          tanggal: body.tanggal,
          tipe: body.tipe,
          dompetId: body.id_dompet,
          kategoriId: body.id_kategori,
          jumlah: body.jumlah,
          catatan: body.catatan ?? '',
          userId: user!.id,
        })
        .returning({ id: transaksi.id })
    )[0];
    set.status = 201;
    return { id: ins.id };
  }, { body: bodyTransaksi })
  .delete('/api/transaksi/:id', async ({ params, user, set }) => {
    const row = (await db.select().from(transaksi).where(eq(transaksi.id, Number(params.id))).limit(1))[0];
    if (!row) {
      set.status = 404;
      return { error: 'NOT_FOUND' };
    }
    if (user!.role !== 'admin' && row.userId !== user!.id) {
      set.status = 403;
      return { error: 'FORBIDDEN' };
    }
    await db.delete(transaksi).where(eq(transaksi.id, row.id));
    return { ok: true };
  })
  .get('/api/ringkasan', async ({ query, set }) => {
    const bulan = query.bulan || new Date().toISOString().slice(0, 7);
    if (!BULAN.test(bulan)) {
      set.status = 400;
      return { error: 'INVALID_MONTH' };
    }
    const like = `${bulan}-%`;
    const sum = async (tipe: 'masuk' | 'keluar') => {
      const r = await db
        .select({ n: sql<number>`COALESCE(SUM(${transaksi.jumlah}), 0)` })
        .from(transaksi)
        .where(and(eq(transaksi.tipe, tipe), sql`substring(${transaksi.tanggal} from 1 for 7) = ${bulan}`));
      return Number(r[0]?.n ?? 0);
    };
    const masuk = await sum('masuk');
    const keluar = await sum('keluar');
    const perKategori = await db
      .select({ kategori: kategori.nama, total: sql<number>`SUM(${transaksi.jumlah})` })
      .from(transaksi)
      .innerJoin(kategori, eq(transaksi.kategoriId, kategori.id))
      .where(and(eq(transaksi.tipe, 'keluar'), sql`substring(${transaksi.tanggal} from 1 for 7) = ${bulan}`))
      .groupBy(kategori.nama)
      .orderBy(sql`SUM(${transaksi.jumlah}) DESC`);
    const pakai: Record<string, number> = {};
    for (const r of perKategori) pakai[r.kategori] = Number(r.total);
    const daftarDompet = await db.select().from(dompet).orderBy(dompet.nama);
    const daftarSaldo = [];
    for (const d of daftarDompet) daftarSaldo.push({ id: d.id, nama: d.nama, saldo: await saldoDompet(d.id) });
    const ang = await db
      .select({ kategori: kategori.nama, batas: anggaran.batas })
      .from(anggaran)
      .innerJoin(kategori, eq(anggaran.kategoriId, kategori.id))
      .where(eq(anggaran.bulan, bulan));
    void like;
    return {
      bulan,
      masuk,
      keluar,
      sisa: masuk - keluar,
      perKategori: perKategori.map((r) => ({ kategori: r.kategori, total: Number(r.total) })),
      anggaran: ang.map((a) => {
        const dipakai = pakai[a.kategori] ?? 0;
        return { kategori: a.kategori, batas: a.batas, dipakai, lewat: dipakai > a.batas };
      }),
      dompet: daftarSaldo,
    };
  });
