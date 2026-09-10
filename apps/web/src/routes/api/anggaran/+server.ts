import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { and, eq } from 'drizzle-orm';
import { anggaran, db, kategori } from 'db';
import { currentUser } from '../../../lib/server/auth';

const BULAN = /^[0-9]{4}-[0-9]{2}$/;

export const GET: RequestHandler = async ({ cookies, url }) => {
  const user = await currentUser(cookies);
  if (!user) return json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  const bulan = url.searchParams.get('bulan');
  const conds = [];
  if (bulan && BULAN.test(bulan)) conds.push(eq(anggaran.bulan, bulan));
  return json(
    await db
      .select({
        id: anggaran.id,
        bulan: anggaran.bulan,
        batas: anggaran.batas,
        kategori: kategori.nama,
        id_kategori: kategori.id,
      })
      .from(anggaran)
      .innerJoin(kategori, eq(anggaran.kategoriId, kategori.id))
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(anggaran.bulan, kategori.nama),
  );
};

export const POST: RequestHandler = async ({ cookies, request }) => {
  const user = await currentUser(cookies);
  if (!user) return json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  if (user.role !== 'admin') return json({ error: 'FORBIDDEN' }, { status: 403 });
  // Elysia: body tak sesuai skema → 422 (onError global → { error: 'INTERNAL' }).
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== 'object') return json({ error: 'INTERNAL' }, { status: 422 });
  const { id_kategori, bulan, batas } = body;
  if (typeof id_kategori !== 'number' || !Number.isInteger(id_kategori))
    return json({ error: 'INVALID_CATEGORY' }, { status: 400 });
  if (typeof bulan !== 'string' || !BULAN.test(bulan)) return json({ error: 'INVALID_MONTH' }, { status: 400 });
  if (typeof batas !== 'number' || !Number.isInteger(batas) || batas < 1)
    return json({ error: 'INTERNAL' }, { status: 422 });
  const k = (await db.select().from(kategori).where(eq(kategori.id, id_kategori)).limit(1))[0];
  if (!k || k.tipe !== 'keluar') return json({ error: 'INVALID_CATEGORY' }, { status: 400 });
  await db
    .insert(anggaran)
    .values({ kategoriId: id_kategori, bulan, batas })
    .onConflictDoUpdate({
      target: [anggaran.kategoriId, anggaran.bulan],
      set: { batas },
    });
  return json({ ok: true }, { status: 201 });
};
