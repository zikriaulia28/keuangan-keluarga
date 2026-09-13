import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { and, eq, sql } from 'drizzle-orm';
import { anggaran, db, dompet, kategori, transaksi } from 'db';
import { currentUser } from '$lib/server/auth';
import { saldoSemuaDompet } from '$lib/server/saldo';

const BULAN = /^[0-9]{4}-[0-9]{2}$/;

export const GET: RequestHandler = async ({ cookies, url }) => {
  const user = await currentUser(cookies);
  if (!user) return json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  const bulan = url.searchParams.get('bulan') || new Date().toISOString().slice(0, 7);
  if (!BULAN.test(bulan)) return json({ error: 'INVALID_MONTH' }, { status: 400 });
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
  const saldoMap = await saldoSemuaDompet(db);
  const daftarSaldo = daftarDompet.map((d) => ({ id: d.id, nama: d.nama, saldo: saldoMap.get(d.id) ?? 0 }));
  const ang = await db
    .select({ kategori: kategori.nama, batas: anggaran.batas })
    .from(anggaran)
    .innerJoin(kategori, eq(anggaran.kategoriId, kategori.id))
    .where(eq(anggaran.bulan, bulan));
  return json({
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
  });
};
