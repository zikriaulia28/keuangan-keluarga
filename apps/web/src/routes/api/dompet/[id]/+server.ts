import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { and, eq, ne, sql } from 'drizzle-orm';
import { db, dompet } from 'db';
import { currentUser } from '$lib/server/auth';
import { header, mulai } from '$lib/server/waktu';

// 4 hop: currentUser → baca baris → batch (cek nama ∥ sisa dompet) → update.
export const PATCH: RequestHandler = async (args) => {
  const t0 = mulai();
  const res = await patch(args);
  res.headers.set('server-timing', header(t0, 4));
  return res;
};

const patch: RequestHandler = async ({ request, cookies, params }) => {
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

  // Validasi tipe murni dulu (tanpa query), persis urutan galat lama.
  let namaBaru: string | undefined;
  if (body.nama_dompet !== undefined) {
    if (typeof body.nama_dompet !== 'string') return json({ error: 'INVALID_WALLET' }, { status: 400 });
    const nama = body.nama_dompet.trim();
    if (nama.length < 1 || nama.length > 64) return json({ error: 'INVALID_WALLET' }, { status: 400 });
    if (nama !== row.nama) namaBaru = nama;
  }
  // Galat tipe `arsip` ditampilkan SETELAH cek nama bentrok — persis urutan lama
  // (WALLET_DUPLICATE lebih dulu), jadi kasus dua-galat-serentak tetap sama.
  let arsipTipeOk = true;
  let arsipBaru: boolean | undefined;
  if (body.arsip !== undefined) {
    if (typeof body.arsip !== 'boolean') arsipTipeOk = false;
    else if (body.arsip !== row.arsip) arsipBaru = body.arsip;
  }

  // Satu batch: kedua cek tidak saling bergantung (dulu 2 round trip berurutan).
  const [bentrok, sisa] = await Promise.all([
    namaBaru === undefined
      ? Promise.resolve(undefined)
      : db
          .select({ id: dompet.id })
          .from(dompet)
          .where(eq(dompet.nama, namaBaru))
          .limit(1)
          .then((r) => r[0]),
    arsipBaru === true
      ? db
          .select({ n: sql<number>`COUNT(*)` })
          .from(dompet)
          .where(and(eq(dompet.arsip, false), ne(dompet.id, row.id)))
          .then(([s]) => Number(s?.n ?? 0))
      : Promise.resolve(undefined)
  ]);
  if (bentrok) return json({ error: 'WALLET_DUPLICATE' }, { status: 409 });
  if (!arsipTipeOk) return json({ error: 'INVALID_WALLET' }, { status: 400 });
  // Form transaksi/tagihan butuh minimal satu dompet aktif.
  if (arsipBaru === true && sisa === 0) return json({ error: 'LAST_WALLET' }, { status: 400 });

  const set: { nama?: string; arsip?: boolean } = {};
  if (namaBaru !== undefined) set.nama = namaBaru;
  if (arsipBaru !== undefined) set.arsip = arsipBaru;
  if (set.nama === undefined && set.arsip === undefined) return json({ ok: true });

  try {
    await db.update(dompet).set(set).where(eq(dompet.id, row.id));
  } catch {
    return json({ error: 'WALLET_DUPLICATE' }, { status: 409 });
  }
  return json({ ok: true, nama_dompet: set.nama ?? row.nama, arsip: set.arsip ?? row.arsip });
};
