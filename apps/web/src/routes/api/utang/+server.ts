import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { desc } from 'drizzle-orm';
import { db, utang } from 'db';
import { currentUser } from '../../../lib/server/auth';

const TGL = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;

export const GET: RequestHandler = async ({ cookies, url }) => {
  const user = await currentUser(cookies);
  if (!user) return json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  const arah = url.searchParams.get('arah');
  const status = url.searchParams.get('status');
  const rows = await db.select().from(utang).orderBy(desc(utang.tanggal), desc(utang.id));
  return json(
    rows
      .map((r) => ({ ...r, sisa: r.jumlah - r.terbayar, lunas: r.terbayar >= r.jumlah }))
      .filter((r) => {
        if (arah === 'utang' || arah === 'piutang') return r.arah === arah;
        return true;
      })
      .filter((r) => {
        if (status === 'aktif') return !r.lunas;
        if (status === 'lunas') return r.lunas;
        return true;
      }),
  );
};

export const POST: RequestHandler = async ({ cookies, request }) => {
  const user = await currentUser(cookies);
  if (!user) return json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  // Elysia: body tak sesuai skema → 422 (onError global → { error: 'INTERNAL' }).
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== 'object') return json({ error: 'INTERNAL' }, { status: 422 });
  const { arah, pihak, jumlah, tanggal, jatuh_tempo, catatan } = body;
  if (arah !== 'utang' && arah !== 'piutang') return json({ error: 'INTERNAL' }, { status: 422 });
  if (typeof pihak !== 'string' || pihak.length < 1) return json({ error: 'INTERNAL' }, { status: 422 });
  if (typeof jumlah !== 'number' || !Number.isInteger(jumlah) || jumlah < 1)
    return json({ error: 'INTERNAL' }, { status: 422 });
  if (typeof tanggal !== 'string' || !TGL.test(tanggal)) return json({ error: 'INTERNAL' }, { status: 422 });
  if (jatuh_tempo !== undefined && (typeof jatuh_tempo !== 'string' || !TGL.test(jatuh_tempo)))
    return json({ error: 'INTERNAL' }, { status: 422 });
  if (catatan !== undefined && typeof catatan !== 'string') return json({ error: 'INTERNAL' }, { status: 422 });
  const ins = (
    await db
      .insert(utang)
      .values({
        arah,
        pihak: pihak.trim(),
        jumlah,
        tanggal,
        jatuhTempo: (jatuh_tempo as string | undefined) ?? null,
        catatan: (catatan as string | undefined) ?? '',
        userId: user.id,
      })
      .returning({ id: utang.id })
  )[0];
  return json({ id: ins.id }, { status: 201 });
};
