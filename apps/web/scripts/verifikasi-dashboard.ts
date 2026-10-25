/**
 * Jepitan perilaku untuk refactor `dashboard.ts` dan halaman `app/*`.
 * Hanya-SELECT, tidak menulis apa pun.
 *
 * Jalankan:
 *   BULAN=2026-10 bun scripts/verifikasi-dashboard.ts    # default bulan berjalan
 *
 * Kerja dua arah:
 *   - sebelum refactor: wajib PASS (bila gagal, orakelnya yang salah — bukan kodenya)
 *   - sesudah refactor: wajib PASS dengan angka yang sama persis
 *
 * Orakel sengaja memakai metode berbeda dari kode produksi (predicate
 * substring() alih-alih rentang tanggal) supaya benar-benar independen.
 */
import { and, eq, sql } from 'drizzle-orm';
import { anggaran, db, dompet, kategori, tagihan as tagihanTabel, tagihanBayar, transaksi } from 'db';
import { listTagihan, loadRingkasan } from '../src/lib/server/dashboard';
import { saldoDompet } from '../src/lib/server/saldo';

const BULAN = process.env.BULAN || new Date().toISOString().slice(0, 7);
const bulanSebelum = (() => {
	const [y, m] = BULAN.split('-').map(Number);
	const d = new Date(y, m - 2, 1);
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
})();

let gagal = 0;
function cek(label: string, kiri: unknown, kanan: unknown) {
	const a = JSON.stringify(kiri);
	const b = JSON.stringify(kanan);
	if (a === b) {
		console.log(`  ok   ${label}`);
	} else {
		gagal++;
		console.error(`  BEDA ${label}\n       dapat : ${a}\n       orakel: ${b}`);
	}
}

async function jumlahTipeOrakel(tipe: 'masuk' | 'keluar', bulan: string): Promise<number> {
	const r = await db
		.select({ n: sql<number>`COALESCE(SUM(${transaksi.jumlah}), 0)` })
		.from(transaksi)
		.where(and(eq(transaksi.tipe, tipe), sql`substring(${transaksi.tanggal} from 1 for 7) = ${bulan}`));
	return Number(r[0]?.n ?? 0);
}

async function perKategoriOrakel(bulan: string): Promise<{ kategori: string; total: number }[]> {
	const rows = await db
		.select({ kategori: kategori.nama, total: sql<number>`SUM(${transaksi.jumlah})` })
		.from(transaksi)
		.innerJoin(kategori, eq(transaksi.kategoriId, kategori.id))
		.where(and(eq(transaksi.tipe, 'keluar'), sql`substring(${transaksi.tanggal} from 1 for 7) = ${bulan}`))
		.groupBy(kategori.nama);
	return rows
		.map((r) => ({ kategori: r.kategori, total: Number(r.total) }))
		.sort((a, b) => a.kategori.localeCompare(b.kategori));
}

console.log(`BULAN=${BULAN}  (bulan lalu: ${bulanSebelum})`);

const ringkasan = await loadRingkasan(BULAN);
const orakelMasuk = await jumlahTipeOrakel('masuk', BULAN);
const orakelKeluar = await jumlahTipeOrakel('keluar', BULAN);
const orakelPrevMasuk = await jumlahTipeOrakel('masuk', bulanSebelum);
const orakelPrevKeluar = await jumlahTipeOrakel('keluar', bulanSebelum);
const orakelPerKategori = await perKategoriOrakel(BULAN);

console.log('\nloadRingkasan:');
cek('masuk', ringkasan.masuk, orakelMasuk);
cek('keluar', ringkasan.keluar, orakelKeluar);
cek('sisa', ringkasan.sisa, orakelMasuk - orakelKeluar);
cek('prevMasuk', ringkasan.prevMasuk, orakelPrevMasuk);
cek('prevKeluar', ringkasan.prevKeluar, orakelPrevKeluar);
cek(
	'perKategori (urut)',
	[...ringkasan.perKategori].sort((a, b) => a.kategori.localeCompare(b.kategori)),
	orakelPerKategori
);

// Dompet: jumlah, urutan, nama, dan saldo — saldo lewat `saldoDompet` per id.
const dompetResmi = await db.select().from(dompet).orderBy(dompet.nama);
cek(
	'dompet: jumlah + urutan id',
	ringkasan.dompet.map((d) => d.id),
	dompetResmi.map((d) => d.id)
);
cek(
	'dompet: nama + arsip',
	ringkasan.dompet.map((d) => [d.nama, d.arsip]),
	dompetResmi.map((d) => [d.nama, d.arsip])
);
for (const d of dompetResmi) {
	const dariHasil = ringkasan.dompet.find((x) => x.id === d.id)?.saldo;
	const dariOrakel = await saldoDompet(db, d.id);
	cek(`saldo dompet "${d.nama}"`, dariHasil, dariOrakel);
}

// Anggaran.dipakai = total belanja per kategori bulan itu.
const daftarAnggaran = await db
	.select({ kategori: kategori.nama, batas: anggaran.batas })
	.from(anggaran)
	.innerJoin(kategori, eq(anggaran.kategoriId, kategori.id))
	.where(eq(anggaran.bulan, BULAN));
cek('anggaran: jumlah', ringkasan.anggaran.length, daftarAnggaran.length);
for (const a of daftarAnggaran) {
	const ada = ringkasan.anggaran.find((x) => x.kategori === a.kategori);
	const orakelDipakai =
		orakelPerKategori.find((x) => x.kategori === a.kategori)?.total ?? 0;
	cek(`anggaran "${a.kategori}": dipakai`, ada?.dipakai, orakelDipakai);
	cek(`anggaran "${a.kategori}": lewat`, ada?.lewat, orakelDipakai > a.batas);
}

console.log('\nlistTagihan:');
const tagihan = await listTagihan(BULAN);
const jumlahTagihan = await db
	.select({ id: tagihanTabel.id })
	.from(tagihanTabel)
	.orderBy(tagihanTabel.hari, tagihanTabel.nama);
cek('jumlah baris + urutan id', tagihan.map((t) => t.id), jumlahTagihan.map((t) => t.id));
for (const t of tagihan) {
	const sudah = await db
		.select({ id: tagihanBayar.tagihanId })
		.from(tagihanBayar)
		.where(and(eq(tagihanBayar.tagihanId, t.id), eq(tagihanBayar.bulan, BULAN)))
		.limit(1);
	cek(`lunas tagihan "${t.nama}"`, t.lunas, sudah.length > 0);
}

console.log(gagal === 0 ? '\nPASS — semua angka identik.' : `\nFAIL — ${gagal} selisih.`);
process.exit(gagal === 0 ? 0 : 1);
