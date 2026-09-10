import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { eq } from 'drizzle-orm';
import { db, kategori } from 'db';
import { currentUser } from '$lib/server/auth';

export const GET: RequestHandler = async ({ cookies, url }) => {
  const user = await currentUser(cookies);
  if (!user) return json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  const tipe = url.searchParams.get('tipe');
  if (tipe === 'masuk' || tipe === 'keluar') {
    return json(await db.select().from(kategori).where(eq(kategori.tipe, tipe)).orderBy(kategori.nama));
  }
  return json(await db.select().from(kategori).orderBy(kategori.tipe, kategori.nama));
};

export const POST: RequestHandler = async ({ request, cookies }) => {
  const user = await currentUser(cookies);
  if (!user) return json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  if (user.role !== 'admin') return json({ error: 'FORBIDDEN' }, { status: 403 });
  let body: { nama_kategori?: unknown; tipe?: unknown };
  try {
    body = (await request.json()) as { nama_kategori?: unknown; tipe?: unknown };
  } catch {
    return json({ error: 'INVALID_CATEGORY' }, { status: 400 });
  }
  if (typeof body.nama_kategori !== 'string' || body.nama_kategori.trim().length < 1) {
    return json({ error: 'INVALID_CATEGORY' }, { status: 400 });
  }
  if (body.tipe !== 'masuk' && body.tipe !== 'keluar') {
    return json({ error: 'INVALID_CATEGORY' }, { status: 400 });
  }
  try {
    const ins = (
      await db
        .insert(kategori)
        .values({ nama: body.nama_kategori.trim(), tipe: body.tipe })
        .returning({ id: kategori.id })
    )[0];
    return json({ id_kategori: ins.id, nama_kategori: body.nama_kategori.trim(), tipe: body.tipe }, { status: 201 });
  } catch {
    return json({ error: 'CATEGORY_DUPLICATE' }, { status: 409 });
  }
};
