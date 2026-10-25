/**
 * Ukur latensi jalur TULIS tanpa pernah menulis data.
 *
 * Semua permintaan memakai jalur yang DITOLAK validasi (sama seperti
 * `verifikasi-tulis.ts`) sehingga aman dijalankan berulang — termasuk terhadap
 * produksi. Yang diukur adalah rangkaian `currentUser → (baca baris) → batch
 * validasi`, yaitu persis bagian yang diparalelkan; langkah `insert` yang
 * konstan pada kedua versi tidak ikut terukur di sini.
 *
 * Jalankan (workdir apps/web, agar .env termuat otomatis):
 *   SESSION=<token> bun scripts/ukur-tulis.ts            # 6 putaran, localhost
 *   SESSION=<token> BASE=https://... bun scripts/ukur-tulis.ts 8
 *
 * Output per kasus: ms total (dari mesin ini → server) dan dur dari header
 * `Server-Timing` (waktu handler di server) — pemisahan ongkos jaringan vs
 * ongkos query.
 */
import { sql } from 'drizzle-orm';
import { db, dompet, kategori, tagihan, transaksi, utang } from 'db';

const BASE = process.env.BASE || 'http://localhost:5173';
const SESSION = process.env.SESSION;
const PUTARAN = Math.max(1, Number(process.argv[2] || 6));
const RAKSASA = 999_999_999;

if (!SESSION) {
	console.error('Env SESSION wajib diisi (nilai cookie `session`).');
	process.exit(1);
}

const bulan = new Date().toISOString().slice(0, 7);
const bulanDepan = (() => {
	const [y, m] = bulan.split('-').map(Number);
	const d = new Date(y, m, 1);
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
})();

async function kirim(metode: string, path: string, body: unknown): Promise<{ ms: number; dur: number | null; status: number }> {
	const t0 = performance.now();
	const r = await fetch(`${BASE}${path}`, {
		method: metode,
		headers: {
			Cookie: `session=${SESSION}`,
			'content-type': 'application/json',
			accept: 'application/json'
		},
		body: JSON.stringify(body)
	});
	const ms = performance.now() - t0;
	await r.arrayBuffer();
	const st = r.headers.get('server-timing');
	const m = st && /dur=([0-9.]+)/.exec(st);
	return { ms: Math.round(ms), dur: m ? Math.round(Number(m[1])) : null, status: r.status };
}

function statistik(n: number[]): string {
	const s = [...n].sort((a, b) => a - b);
	return `min=${s[0]} median=${s[Math.floor(s.length / 2)]} max=${s[s.length - 1]}`;
}

// Prasyarat diambil dari DB yang sama (lokal maupun produksi memakai satu DB).
const dompetAktif = (await db.select().from(dompet).where(sql`arsip = false`).orderBy(dompet.id))[0];
const kategoriKeluar = (await db.select().from(kategori).where(sql`tipe = 'keluar'`))[0];
const trxAda = (await db.select().from(transaksi).orderBy(transaksi.id).limit(1))[0];
const utangAda = (
	await db.select().from(utang).orderBy(utang.id).limit(50).then((r) => r.filter((u) => u.jumlah - u.terbayar > 0))
)[0];
const tagihanAda = (await db.select().from(tagihan).orderBy(tagihan.id).limit(1))[0];
const dompetLain = (await db.select().from(dompet).orderBy(dompet.id))[1];

if (!dompetAktif || !kategoriKeluar || !trxAda) {
	console.error('Prasyarat tidak lengkap (dompet/kategori/transaksi kosong) — dibatalkan.');
	process.exit(1);
}

type Kasus = { nama: string; jalan: () => Promise<{ ms: number; dur: number | null; status: number }> };

const kasus: Kasus[] = [
	{
		nama: 'POST /api/transaksi (tolak saldo)',
		jalan: () =>
			kirim('POST', '/api/transaksi', {
				tanggal: `${bulan}-01`,
				tipe: 'keluar',
				id_dompet: dompetAktif.id,
				id_kategori: kategoriKeluar.id,
				jumlah: RAKSASA,
				catatan: 'ukur-tulis'
			})
	},
	{
		nama: 'PATCH /api/transaksi/[id] (tolak dompet)',
		jalan: () =>
			kirim('PATCH', `/api/transaksi/${trxAda.id}`, {
				tanggal: `${bulan}-01`,
				tipe: trxAda.tipe,
				id_dompet: 999_999,
				id_kategori: trxAda.kategoriId,
				jumlah: trxAda.jumlah,
				catatan: trxAda.catatan
			})
	},
	{
		nama: 'POST /api/transfer (tolak saldo asal)',
		jalan: () =>
			kirim('POST', '/api/transfer', {
				tanggal: `${bulan}-01`,
				id_dompet_asal: dompetAktif.id,
				id_dompet_tujuan: (dompetLain ?? dompetAktif).id,
				jumlah: RAKSASA,
				catatan: 'ukur-tulis'
			})
	}
];

if (utangAda) {
	kasus.push({
		nama: 'POST /api/utang/[id]/bayar (tolak OVERPAY)',
		jalan: () =>
			kirim('POST', `/api/utang/${utangAda.id}/bayar`, {
				jumlah: utangAda.jumlah - utangAda.terbayar + 1,
				id_dompet: dompetAktif.id
			})
	});
}
if (tagihanAda) {
	kasus.push({
		nama: 'POST /api/tagihan/[id]/bayar (tolak dompet)',
		jalan: () =>
			kirim('POST', `/api/tagihan/${tagihanAda.id}/bayar`, { bulan: bulanDepan, id_dompet: 999_999 })
	});
}
if (dompetLain) {
	kasus.push({
		nama: 'PATCH /api/dompet/[id] (tolak nama bentrok)',
		jalan: () => kirim('PATCH', `/api/dompet/${dompetLain.id}`, { nama_dompet: dompetAktif.nama })
	});
}

console.log(`BASE=${BASE}  putaran=${PUTARAN}  (semua permintaan DITOLAK — nol tulisan)`);
for (const k of kasus) {
	const total: number[] = [];
	const dur: number[] = [];
	let status = 0;
	for (let i = 0; i < PUTARAN; i++) {
		const h = await k.jalan();
		total.push(h.ms);
		if (h.dur !== null) dur.push(h.dur);
		status = h.status;
	}
	const d = dur.length ? `  dur: ${statistik(dur)} ms` : '  dur: (tanpa Server-Timing)';
	console.log(`${k.nama}\n    total: ${statistik(total)} ms${d}  [${status}]`);
}
process.exit(0);
