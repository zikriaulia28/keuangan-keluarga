import { Elysia, t } from 'elysia';
import { and, desc, eq } from 'drizzle-orm';
import { anggaran, db, dompet, kategori, tagihan, tagihanBayar, transaksi, utang } from 'db';
import { withAuth } from './auth';
import { saldoDompet } from './transaksi';
const BULAN = /^[0-9]{4}-[0-9]{2}$/;
const TGL = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;

function admin(user: { role: string }, set: { status?: number | string }) {
  if (user.role !== 'admin') {
    set.status = 403;
    return true;
  }
  return false;
}

export const keuanganRoutes = withAuth(new Elysia())
  // ---- anggaran (tulis: admin) ----
  .get('/api/anggaran', async ({ query }) => {
    const conds = [];
    if (query.bulan && BULAN.test(query.bulan)) conds.push(eq(anggaran.bulan, query.bulan));
    return db
      .select({ id: anggaran.id, bulan: anggaran.bulan, batas: anggaran.batas, kategori: kategori.nama, id_kategori: kategori.id })
      .from(anggaran)
      .innerJoin(kategori, eq(anggaran.kategoriId, kategori.id))
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(anggaran.bulan, kategori.nama);
  })
  .post(
    '/api/anggaran',
    async ({ body, user, set }) => {
      if (admin(user!, set)) return { error: 'FORBIDDEN' };
      const k = (await db.select().from(kategori).where(eq(kategori.id, body.id_kategori)).limit(1))[0];
      if (!k || k.tipe !== 'keluar') {
        set.status = 400;
        return { error: 'INVALID_CATEGORY' };
      }
      await db
        .insert(anggaran)
        .values({ kategoriId: body.id_kategori, bulan: body.bulan, batas: body.batas })
        .onConflictDoUpdate({
          target: [anggaran.kategoriId, anggaran.bulan],
          set: { batas: body.batas },
        });
      set.status = 201;
      return { ok: true };
    },
    {
      body: t.Object({
        id_kategori: t.Integer(),
        bulan: t.String({ pattern: '^[0-9]{4}-[0-9]{2}$' }),
        batas: t.Integer({ minimum: 1 }),
      }),
    },
  )
  .delete('/api/anggaran/:id', async ({ params, user, set }) => {
    if (admin(user!, set)) return { error: 'FORBIDDEN' };
    const r = await db.delete(anggaran).where(eq(anggaran.id, Number(params.id))).returning({ id: anggaran.id });
    if (!r[0]) {
      set.status = 404;
      return { error: 'NOT_FOUND' };
    }
    return { ok: true };
  })
  // ---- utang & piutang ----
  .get('/api/utang', async ({ query }) => {
    const rows = await db.select().from(utang).orderBy(desc(utang.tanggal), desc(utang.id));
    return rows
      .map((r) => ({ ...r, sisa: r.jumlah - r.terbayar, lunas: r.terbayar >= r.jumlah }))
      .filter((r) => {
        if (query.arah === 'utang' || query.arah === 'piutang') return r.arah === query.arah;
        return true;
      })
      .filter((r) => {
        if (query.status === 'aktif') return !r.lunas;
        if (query.status === 'lunas') return r.lunas;
        return true;
      });
  })
  .post(
    '/api/utang',
    async ({ body, user, set }) => {
      const ins = (
        await db
          .insert(utang)
          .values({
            arah: body.arah,
            pihak: body.pihak.trim(),
            jumlah: body.jumlah,
            tanggal: body.tanggal,
            jatuhTempo: body.jatuh_tempo ?? null,
            catatan: body.catatan ?? '',
            userId: user!.id,
          })
          .returning({ id: utang.id })
      )[0];
      set.status = 201;
      return { id: ins.id };
    },
    {
      body: t.Object({
        arah: t.Union([t.Literal('utang'), t.Literal('piutang')]),
        pihak: t.String({ minLength: 1 }),
        jumlah: t.Integer({ minimum: 1 }),
        tanggal: t.String({ pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' }),
        jatuh_tempo: t.Optional(t.String({ pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' })),
        catatan: t.Optional(t.String()),
      }),
    },
  )
  .post(
    '/api/utang/:id/bayar',
    async ({ params, body, user, set }) => {
      const row = (await db.select().from(utang).where(eq(utang.id, Number(params.id))).limit(1))[0];
      if (!row) {
        set.status = 404;
        return { error: 'NOT_FOUND' };
      }
      const sisa = row.jumlah - row.terbayar;
      if (sisa <= 0) {
        set.status = 400;
        return { error: 'ALREADY_PAID' };
      }
      if (body.jumlah > sisa) {
        set.status = 400;
        return { error: 'OVERPAY' };
      }
      // Bayar utang = uang keluar; terima piutang = uang masuk. Catat otomatis.
      const d = (await db.select().from(dompet).orderBy(dompet.id).limit(1))[0];
      if (!d) {
        set.status = 400;
        return { error: 'NO_WALLET' };
      }
      const tipe = row.arah === 'utang' ? 'keluar' : 'masuk';
      if (tipe === 'keluar' && body.jumlah > (await saldoDompet(d.id))) {
        set.status = 400;
        return { error: 'INSUFFICIENT_BALANCE' };
      }
      const k = (
        await db.select().from(kategori).where(eq(kategori.nama, row.arah === 'utang' ? 'Bayar Utang' : 'Terima Piutang')).limit(10)
      ).find((r) => r.tipe === tipe);
      if (!k) {
        set.status = 400;
        return { error: 'MISSING_CATEGORY' };
      }
      const today = new Date().toISOString().slice(0, 10);
      await db.insert(transaksi).values({
        tanggal: body.tanggal && TGL.test(body.tanggal) ? body.tanggal : today,
        tipe,
        dompetId: d.id,
        kategoriId: k.id,
        jumlah: body.jumlah,
        catatan: `${row.arah === 'utang' ? 'Bayar utang ke' : 'Terima piutang dari'} ${row.pihak}`,
        userId: user!.id,
      });
      await db.update(utang).set({ terbayar: row.terbayar + body.jumlah }).where(eq(utang.id, row.id));
      return { ok: true, sisa: sisa - body.jumlah };
    },
    { body: t.Object({ jumlah: t.Integer({ minimum: 1 }), tanggal: t.Optional(t.String()) }) },
  )
  .delete('/api/utang/:id', async ({ params, user, set }) => {
    const row = (await db.select().from(utang).where(eq(utang.id, Number(params.id))).limit(1))[0];
    if (!row) {
      set.status = 404;
      return { error: 'NOT_FOUND' };
    }
    if (user!.role !== 'admin' && row.userId !== user!.id) {
      set.status = 403;
      return { error: 'FORBIDDEN' };
    }
    await db.delete(utang).where(eq(utang.id, row.id));
    return { ok: true };
  })
  // ---- tagihan rutin ----
  .get('/api/tagihan', async ({ query, set }) => {
    const bulan = query.bulan || new Date().toISOString().slice(0, 7);
    if (!BULAN.test(bulan)) {
      set.status = 400;
      return { error: 'INVALID_MONTH' };
    }
    const list = await db
      .select({ id: tagihan.id, nama: tagihan.nama, jumlah: tagihan.jumlah, hari: tagihan.hari, catatan: tagihan.catatan, kategori: kategori.nama })
      .from(tagihan)
      .innerJoin(kategori, eq(tagihan.kategoriId, kategori.id))
      .orderBy(tagihan.hari, tagihan.nama);
    const sudah = await db.select().from(tagihanBayar).where(eq(tagihanBayar.bulan, bulan));
    const lunasIds = new Set(sudah.map((s) => s.tagihanId));
    return list.map((r) => ({ ...r, lunas: lunasIds.has(r.id) }));
  })
  .post(
    '/api/tagihan',
    async ({ body, user, set }) => {
      if (admin(user!, set)) return { error: 'FORBIDDEN' };
      const k = (await db.select().from(kategori).where(eq(kategori.id, body.id_kategori)).limit(1))[0];
      if (!k || k.tipe !== 'keluar') {
        set.status = 400;
        return { error: 'INVALID_CATEGORY' };
      }
      try {
        const ins = (
          await db
            .insert(tagihan)
            .values({ nama: body.nama.trim(), jumlah: body.jumlah, hari: body.hari, kategoriId: body.id_kategori, catatan: body.catatan ?? '' })
            .returning({ id: tagihan.id })
        )[0];
        set.status = 201;
        return { id: ins.id };
      } catch {
        set.status = 409;
        return { error: 'BILL_DUPLICATE' };
      }
    },
    {
      body: t.Object({
        nama: t.String({ minLength: 1 }),
        jumlah: t.Integer({ minimum: 1 }),
        hari: t.Integer({ minimum: 1, maximum: 31 }),
        id_kategori: t.Integer(),
        catatan: t.Optional(t.String()),
      }),
    },
  )
  .post('/api/tagihan/:id/bayar', async ({ params, body, user, set }) => {
    if (admin(user!, set)) return { error: 'FORBIDDEN' };
    const row = (await db.select().from(tagihan).where(eq(tagihan.id, Number(params.id))).limit(1))[0];
    if (!row) {
      set.status = 404;
      return { error: 'NOT_FOUND' };
    }
    const bulan = typeof body?.bulan === 'string' && BULAN.test(body.bulan) ? body.bulan : new Date().toISOString().slice(0, 7);
    const ada = (
      await db
        .select()
        .from(tagihanBayar)
        .where(and(eq(tagihanBayar.tagihanId, row.id), eq(tagihanBayar.bulan, bulan)))
        .limit(1)
    )[0];
    if (ada) {
      set.status = 409;
      return { error: 'ALREADY_PAID' };
    }
    const idd = Number(body?.id_dompet);
    const d = (await db.select().from(dompet).where(eq(dompet.id, idd)).limit(1))[0];
    if (!d) {
      set.status = 400;
      return { error: 'INVALID_WALLET' };
    }
    if (row.jumlah > (await saldoDompet(d.id))) {
      set.status = 400;
      return { error: 'INSUFFICIENT_BALANCE' };
    }
    const today = new Date().toISOString().slice(0, 10);
    const tr = (
      await db
        .insert(transaksi)
        .values({
          tanggal: typeof body?.tanggal === 'string' && TGL.test(body.tanggal) ? body.tanggal : today,
          tipe: 'keluar',
          dompetId: d.id,
          kategoriId: row.kategoriId,
          jumlah: row.jumlah,
          catatan: `Tagihan ${row.nama} ${bulan}`,
          userId: user!.id,
        })
        .returning({ id: transaksi.id })
    )[0];
    await db.insert(tagihanBayar).values({ tagihanId: row.id, bulan, transaksiId: tr.id, dibayarOleh: user!.id });
    set.status = 201;
    return { ok: true, id_transaksi: tr.id };
  })
  .delete('/api/tagihan/:id', async ({ params, user, set }) => {
    if (admin(user!, set)) return { error: 'FORBIDDEN' };
    const r = await db.delete(tagihan).where(eq(tagihan.id, Number(params.id))).returning({ id: tagihan.id });
    if (!r[0]) {
      set.status = 404;
      return { error: 'NOT_FOUND' };
    }
    return { ok: true };
  });
