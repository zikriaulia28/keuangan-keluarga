import { Elysia, t } from 'elysia';
import { eq } from 'drizzle-orm';
import { db, dompet, kategori } from 'db';
import { withAuth } from './auth';
import { saldoDompet } from './transaksi';

export const masterRoutes = withAuth(new Elysia())
  .get('/api/dompet', async () => {
    const list = await db.select().from(dompet).orderBy(dompet.nama);
    const out = [];
    for (const d of list) out.push({ id_dompet: d.id, nama_dompet: d.nama, saldo: await saldoDompet(d.id) });
    return out;
  })
  .get('/api/kategori', async ({ query }) => {
    if (query.tipe === 'masuk' || query.tipe === 'keluar') {
      return db.select().from(kategori).where(eq(kategori.tipe, query.tipe)).orderBy(kategori.nama);
    }
    return db.select().from(kategori).orderBy(kategori.tipe, kategori.nama);
  })
  .post(
    '/api/kategori',
    async ({ body, user, set }) => {
      if (user!.role !== 'admin') {
        set.status = 403;
        return { error: 'FORBIDDEN' };
      }
      try {
        const ins = (
          await db.insert(kategori).values({ nama: body.nama_kategori.trim(), tipe: body.tipe }).returning({ id: kategori.id })
        )[0];
        set.status = 201;
        return { id_kategori: ins.id, nama_kategori: body.nama_kategori.trim(), tipe: body.tipe };
      } catch {
        set.status = 409;
        return { error: 'CATEGORY_DUPLICATE' };
      }
    },
    { body: t.Object({ nama_kategori: t.String({ minLength: 1 }), tipe: t.Union([t.Literal('masuk'), t.Literal('keluar')]) }) },
  )
  .delete('/api/kategori/:id', async ({ params, user, set }) => {
    if (user!.role !== 'admin') {
      set.status = 403;
      return { error: 'FORBIDDEN' };
    }
    try {
      const r = await db.delete(kategori).where(eq(kategori.id, Number(params.id))).returning({ id: kategori.id });
      if (!r[0]) {
        set.status = 404;
        return { error: 'NOT_FOUND' };
      }
      return { ok: true };
    } catch {
      set.status = 400;
      return { error: 'CATEGORY_IN_USE' };
    }
  });
