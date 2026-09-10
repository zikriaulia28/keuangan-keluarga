import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { and, desc, eq, gte, lte } from 'drizzle-orm';
import { db, dompet, kategori, transaksi, users } from 'db';
import { currentUser } from '$lib/server/auth';
import { saldoDompet } from '$lib/server/saldo';

const TGL = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;

export const GET: RequestHandler = async ({ cookies, url }) => {
  const user = await currentUser(cookies);
  if (!user) return json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  const conds = [];
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  const idDompet = url.searchParams.get('id_dompet');
  const tipe = url.searchParams.get('tipe');
  if (from && TGL.test(from)) conds.push(gte(transaksi.tanggal, from));
  if (to && TGL.test(to)) conds.push(lte(transaksi.tanggal, to));
  if (idDompet) conds.push(eq(transaksi.dompetId, Number(idDompet)));
  if (tipe === 'masuk' || tipe === 'keluar') conds.push(eq(transaksi.tipe, tipe));
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit') ?? 100) || 100, 1), 500);
  const offset = Math.max(Number(url.searchParams.get('offset') ?? 0) || 0, 0);
  return json(
    await db
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
      .offset(offset),
  );
};

export const POST: RequestHandler = async ({ request, cookies }) => {
  const user = await currentUser(cookies);
  if (!user) return json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  let body: {
    tanggal?: unknown;
    tipe?: unknown;
    id_dompet?: unknown;
    id_kategori?: unknown;
    jumlah?: unknown;
    catatan?: unknown;
  };
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: 'INVALID_TRANSACTION' }, { status: 400 });
  }
  if (
    typeof body.tanggal !== 'string' ||
    !TGL.test(body.tanggal) ||
    (body.tipe !== 'masuk' && body.tipe !== 'keluar') ||
    typeof body.id_dompet !== 'number' ||
    !Number.isInteger(body.id_dompet) ||
    typeof body.id_kategori !== 'number' ||
    !Number.isInteger(body.id_kategori) ||
    typeof body.jumlah !== 'number' ||
    !Number.isInteger(body.jumlah) ||
    body.jumlah < 1 ||
    (body.catatan !== undefined && typeof body.catatan !== 'string')
  ) {
    return json({ error: 'INVALID_TRANSACTION' }, { status: 400 });
  }
  const d = await db.select().from(dompet).where(eq(dompet.id, body.id_dompet)).limit(1);
  if (!d[0]) return json({ error: 'INVALID_WALLET' }, { status: 400 });
  const k = await db.select().from(kategori).where(eq(kategori.id, body.id_kategori)).limit(1);
  if (!k[0] || k[0].tipe !== body.tipe) return json({ error: 'INVALID_CATEGORY' }, { status: 400 });
  if (body.tipe === 'keluar' && body.jumlah > (await saldoDompet(db, body.id_dompet))) {
    return json({ error: 'INSUFFICIENT_BALANCE' }, { status: 400 });
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
        userId: user.id,
      })
      .returning({ id: transaksi.id })
  )[0];
  return json({ id: ins.id }, { status: 201 });
};
