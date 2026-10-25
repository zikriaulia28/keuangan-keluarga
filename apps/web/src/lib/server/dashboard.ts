import { and, desc, eq, gte, lte, sql } from 'drizzle-orm';
import { anggaran, db, dompet, kategori, tagihan, tagihanBayar, transaksi, utang } from 'db';
import { saldoSemuaDompet } from './saldo';

/** Rentang `YYYY-MM` jadi batas tanggal, supaya index tanggal bisa dipakai. */
function antaraBulan(tanggal: any, bulan: string) {
	const [tahun, bulanNum] = bulan.split('-').map(Number);
	const akhir = new Date(tahun, bulanNum, 0).getDate();
	return and(
		gte(tanggal, `${bulan}-01`),
		lte(tanggal, `${bulan}-${String(akhir).padStart(2, '0')}`)
	);
}

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
	// Rentang tanggal, bukan substring(): substring() tidak bisa memakai index
	// transaksi_tanggal_id_idx, jadi memaksa seq scan begitu data bertambah.
	const [tahun, bulanNum] = bulan.split('-').map(Number);
	const akhir = new Date(tahun, bulanNum, 0).getDate();
	const dari = `${bulan}-01`;
	const sampai = `${bulan}-${String(akhir).padStart(2, '0')}`;
	const r = await db
		.select({ n: sql<number>`COALESCE(SUM(${transaksi.jumlah}), 0)` })
		.from(transaksi)
		.where(
			and(
				eq(transaksi.tipe, tipe),
				gte(transaksi.tanggal, dari),
				lte(transaksi.tanggal, sampai)
			)
		);
	return Number(r[0]?.n ?? 0);
}

/** Ringkasan bulan + tren bulan lalu. Semua query paralel dalam satu batch. */
export async function loadRingkasan(bulan: string) {
	const prev = geserBulan(bulan, -1);
	const [masuk, keluar, prevMasuk, prevKeluar, perKategori, daftarDompet, saldoSemua, ang] =
		await Promise.all([
			jumlahTipe('masuk', bulan),
			jumlahTipe('keluar', bulan),
			jumlahTipe('masuk', prev),
			jumlahTipe('keluar', prev),
			db
				.select({ kategori: kategori.nama, total: sql<number>`SUM(${transaksi.jumlah})` })
				.from(transaksi)
				.innerJoin(kategori, eq(transaksi.kategoriId, kategori.id))
				.where(
					and(
						eq(transaksi.tipe, 'keluar'),
						antaraBulan(transaksi.tanggal, bulan)
					)
				)
				.groupBy(kategori.nama)
				.orderBy(sql`SUM(${transaksi.jumlah}) DESC`),
			db.select().from(dompet).orderBy(dompet.nama),
			// 1 round trip untuk semua dompet, bukan satu per dompet.
			saldoSemuaDompet(db),
			db
				.select({ kategori: kategori.nama, batas: anggaran.batas })
				.from(anggaran)
				.innerJoin(kategori, eq(anggaran.kategoriId, kategori.id))
				.where(eq(anggaran.bulan, bulan))
		]);

	const pakai: Record<string, number> = {};
	for (const r of perKategori) pakai[r.kategori] = Number(r.total);
	const daftarSaldo = daftarDompet.map((d) => ({
		id: d.id,
		nama: d.nama,
		arsip: d.arsip,
		saldo: saldoSemua.get(d.id) ?? 0
	}));

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
