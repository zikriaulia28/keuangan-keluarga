import { and, desc, eq, sql } from 'drizzle-orm';
import { anggaran, db, dompet, kategori, tagihan, tagihanBayar, transaksi, utang } from 'db';
import { saldoDompet } from './saldo';

/** Bulan berjalan kalender lokal `YYYY-MM`. */
export function bulanBerjalan(): string {
	const now = new Date();
	return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/** Geser `YYYY-MM` sejauh delta bulan. */
export function geserBulan(b: string, delta: number): string {
	const [y, m] = b.split('-').map(Number);
	const d = new Date(y, m - 1 + delta, 1);
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

async function jumlahTipe(tipe: 'masuk' | 'keluar', bulan: string): Promise<number> {
	const r = await db
		.select({ n: sql<number>`COALESCE(SUM(${transaksi.jumlah}), 0)` })
		.from(transaksi)
		.where(and(eq(transaksi.tipe, tipe), sql`substring(${transaksi.tanggal} from 1 for 7) = ${bulan}`));
	return Number(r[0]?.n ?? 0);
}

/** Ringkasan bulan + tren bulan lalu (satu handler, agregat ganda). */
export async function loadRingkasan(bulan: string) {
	const prev = geserBulan(bulan, -1);
	const [masuk, keluar, prevMasuk, prevKeluar] = await Promise.all([
		jumlahTipe('masuk', bulan),
		jumlahTipe('keluar', bulan),
		jumlahTipe('masuk', prev),
		jumlahTipe('keluar', prev)
	]);
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
	const daftarSaldo = [];
	for (const d of daftarDompet) daftarSaldo.push({ id: d.id, nama: d.nama, saldo: await saldoDompet(db, d.id) });
	const ang = await db
		.select({ kategori: kategori.nama, batas: anggaran.batas })
		.from(anggaran)
		.innerJoin(kategori, eq(anggaran.kategoriId, kategori.id))
		.where(eq(anggaran.bulan, bulan));
	return {
		bulan,
		masuk,
		keluar,
		sisa: masuk - keluar,
		prevMasuk,
		prevKeluar,
		perKategori: perKategori.map((r) => ({ kategori: r.kategori, total: Number(r.total) })),
		anggaran: ang.map((a) => {
			const dipakai = pakai[a.kategori] ?? 0;
			return { kategori: a.kategori, batas: a.batas, dipakai, lewat: dipakai > a.batas };
		}),
		dompet: daftarSaldo
	};
}

/** Daftar tagihan + status lunas bulan berjalan. */
export async function listTagihan(bulan: string) {
	const list = await db
		.select({
			id: tagihan.id,
			nama: tagihan.nama,
			jumlah: tagihan.jumlah,
			hari: tagihan.hari,
			catatan: tagihan.catatan,
			kategori: kategori.nama
		})
		.from(tagihan)
		.innerJoin(kategori, eq(tagihan.kategoriId, kategori.id))
		.orderBy(tagihan.hari, tagihan.nama);
	const sudah = await db.select().from(tagihanBayar).where(eq(tagihanBayar.bulan, bulan));
	const lunas: Record<number, true> = {};
	for (const s of sudah) lunas[s.tagihanId] = true;
	return list.map((r) => ({ ...r, lunas: lunas[r.id] === true }));
}

/** Utang/piutang aktif (belum lunas). */
export async function listUtangAktif() {
	const rows = await db.select().from(utang).orderBy(desc(utang.tanggal), desc(utang.id));
	return rows
		.map((r) => ({ ...r, sisa: r.jumlah - r.terbayar, lunas: r.terbayar >= r.jumlah }))
		.filter((r) => !r.lunas)
		.map(({ userId: _userId, ...r }) => r);
}
