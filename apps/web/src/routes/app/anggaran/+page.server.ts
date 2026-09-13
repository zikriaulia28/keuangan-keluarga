import type { PageServerLoad } from './$types';
import { db, anggaran, kategori, transaksi } from 'db';
import { and, eq, sql } from 'drizzle-orm';

const BULAN = /^[0-9]{4}-[0-9]{2}$/;

export const load: PageServerLoad = async ({ url, parent, depends }) => {
  depends('anggaran');
  await parent(); // Tunggu layout load (auth check)
  
  const bulanParam = url.searchParams.get('bulan');
  const sekarang = new Date();
  const bulan = bulanParam && BULAN.test(bulanParam) 
    ? bulanParam 
    : `${sekarang.getFullYear()}-${String(sekarang.getMonth() + 1).padStart(2, '0')}`;

  // Fetch anggaran + kategori
  const [daftarAnggaran, kategoris] = await Promise.all([
    db
      .select({
        id: anggaran.id,
        bulan: anggaran.bulan,
        batas: anggaran.batas,
        kategori: kategori.nama,
        id_kategori: kategori.id,
      })
      .from(anggaran)
      .innerJoin(kategori, eq(anggaran.kategoriId, kategori.id))
      .where(eq(anggaran.bulan, bulan))
      .orderBy(kategori.nama),
    db.select().from(kategori).where(eq(kategori.tipe, 'keluar')).orderBy(kategori.nama)
  ]);

  // Fetch dipakai per kategori dari transaksi (reuse logic dari ringkasan)
  const perKategori = await db
    .select({ 
      kategori: kategori.nama, 
      total: sql<number>`SUM(${transaksi.jumlah})` 
    })
    .from(transaksi)
    .innerJoin(kategori, eq(transaksi.kategoriId, kategori.id))
    .where(
      and(
        eq(transaksi.tipe, 'keluar'), 
        sql`substring(${transaksi.tanggal} from 1 for 7) = ${bulan}`
      )
    )
    .groupBy(kategori.nama);

  const pakai: Record<string, { dipakai: number; lewat: boolean }> = {};
  for (const r of perKategori) {
    const dipakai = Number(r.total);
    const item = daftarAnggaran.find(a => a.kategori === r.kategori);
    pakai[r.kategori] = { 
      dipakai, 
      lewat: item ? dipakai > item.batas : false 
    };
  }

  return {
    bulan,
    daftar: daftarAnggaran,
    kategoris,
    pakai
  };
};
