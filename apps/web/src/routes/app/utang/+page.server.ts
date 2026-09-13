import type { PageServerLoad } from './$types';
import { db, utang } from 'db';
import { desc } from 'drizzle-orm';

export const load: PageServerLoad = async ({ url, parent, depends }) => {
  depends('utang');
  await parent(); // Tunggu layout load (auth check)
  
  const arahFilter = url.searchParams.get('arah') || '';
  const statusFilter = url.searchParams.get('status') || 'aktif';

  // Fetch semua utang untuk summary
  const rows = await db.select().from(utang).orderBy(desc(utang.tanggal), desc(utang.id));
  
  const semua = rows.map((r) => ({ 
    ...r, 
    sisa: r.jumlah - r.terbayar, 
    lunas: r.terbayar >= r.jumlah 
  }));

  // Filter berdasarkan query param
  const daftar = semua
    .filter((r) => {
      if (arahFilter === 'utang' || arahFilter === 'piutang') return r.arah === arahFilter;
      return true;
    })
    .filter((r) => {
      if (statusFilter === 'aktif') return !r.lunas;
      if (statusFilter === 'lunas') return r.lunas;
      return true;
    });

  return {
    daftar,
    semua,
    arahFilter,
    statusFilter
  };
};
