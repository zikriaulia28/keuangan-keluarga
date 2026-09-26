import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { and, eq, ne, sql } from 'drizzle-orm';
import { db, dompet } from 'db';
import { currentUser } from '$lib/server/auth';

export const PATCH: RequestHandler = async ({ request, cookies, params }) => {
  const user = await currentUser(cookies);
  if (!user) return json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  if (user.role !== 'admin') return json({ error: 'FORBIDDEN' }, { status: 403 });
  const id = Number(params.id);
  if (!Number.isInteger(id)) return json({ error: 'NOT_FOUND' }, { status: 404 });
  const row = (await db.select().from(dompet).where(eq(dompet.id, id)).limit(1))[0];
  if (!row) return json({ error: 'NOT_FOUND' }, { status: 404 });

  let body: { nama_dompet?: unknown; arsip?: unknown };
  try {
    body = (await request.json()) as { nama_dompet?: unknown; arsip?: unknown };
  } catch {
    return json({ error: 'INVALID_WALLET' }, { status: 400 });
  }
  const set: { nama?: string; arsip?: boolean } = {};
  if (body.nama_dompet !== undefined) {
    if (typeof body.nama_dompet !== 'string') return json({ error: 'INVALID_WALLET' }, { status: 400 });
    const nama = body.nama_dompet.trim();
    if (nama.length < 1 || nama.length > 64) return json({ error: 'INVALID_WALLET' }, { status: 400 });
    if (nama !== row.nama) {
      const bentrok = (
        await db.select({ id: dompet.id }).from(dompet).where(eq(dompet.nama, nama)).limit(1)
      )[0];
      if (bentrok) return json({ error: 'WALLET_DUPLICATE' }, { status: 409 });
      set.nama = nama;
    }
  }
  if (body.arsip !== undefined) {
    if (typeof body.arsip !== 'boolean') return json({ error: 'INVALID_WALLET' }, { status: 400 });
    if (body.arsip !== row.arsip) {
      // Form transaksi/tagihan butuh minimal satu dompet aktif.
      if (body.arsip) {
        const [sisa] = await db
          .select({ n: sql<number>`COUNT(*)` })
          .from(dompet)
          .where(and(eq(dompet.arsip, false), ne(dompet.id, row.id)));
        if (Number(sisa?.n ?? 0) === 0) return json({ error: 'LAST_WALLET' }, { status: 400 });
      }
      set.arsip = body.arsip;
    }
  }
  if (set.nama === undefined && set.arsip === undefined) return json({ ok: true });

  try {
    await db.update(dompet).set(set).where(eq(dompet.id, row.id));
  } catch {
    return json({ error: 'WALLET_DUPLICATE' }, { status: 409 });
  }
  return json({ ok: true, nama_dompet: set.nama ?? row.nama, arsip: set.arsip ?? row.arsip });
};
