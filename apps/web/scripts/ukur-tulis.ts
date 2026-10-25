/**
 * Ukur latensi jalur TULIS tanpa pernah menulis data.
 *
 * Semua permintaan memakai jalur yang DITOLAK validasi (sama seperti
 * `verifikasi-tulis.ts`) sehingga aman dijalankan berulang — termasuk terhadap
 * produksi. Dua lapis pengaman, jangan dihapus:
 *   1. `jumlah` diturunkan dari saldo segar (`saldo + 1`, minimal 1) sehingga
 *      penolakan dijamin terjadi — tidak ada angka tetap besar yang bisa lolos
 *      bila saldo suatu hari melampaui angka itu;
 *   2. status tiap respons wajib cocok dengan yang diharapkan — kalau tidak,
 *      skrip keluar 1 dan menandai kemungkinan tulisan tak terencana.
 * Yang diukur adalah rangkaian `currentUser → (baca baris) → batch
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
import { saldoDompet } from '../src/lib/server/saldo';

const BASE = process.env.BASE || 'http://localhost:5173';
const SESSION = process.env.SESSION;
const PUTARAN = Math.max(1, Number(process.argv[2] || 6));

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
// Dijamin ditolak: jumlah > saldo selamanya (saldo + 1, minimal 1 supaya lolos
// validasi `jumlah >= 1` pun tetap melebihi saldo yang bisa negatif).
const saldoAktif = await saldoDompet(db, dompetAktif.id);
const jumlahTolak = Math.max(1, saldoAktif + 1);

type Kasus = {
	nama: string;
	/** Status wajib; selain itu berarti tulisan tak terencana mungkin terjadi. */
	hap: number;
	jalan: () => Promise<{ ms: number; dur: number | null; status: number }>;
};

const kasus: Kasus[] = [
	{
		nama: 'POST /api/transaksi (tolak saldo)',
		hap: 400,
		jalan: () =>
			kirim('POST', '/api/transaksi', {
				tanggal: `${bulan}-01`,
				tipe: 'keluar',
				id_dompet: dompetAktif.id,
				id_kategori: kategoriKeluar.id,
				jumlah: jumlahTolak,
				catatan: 'ukur-tulis'
			})
	},
	{
		nama: 'PATCH /api/transaksi/[id] (tolak dompet)',
		hap: 400,
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
		hap: 400,
		jalan: () =>
			kirim('POST', '/api/transfer', {
				tanggal: `${bulan}-01`,
				id_dompet_asal: dompetAktif.id,
				id_dompet_tujuan: (dompetLain ?? dompetAktif).id,
				jumlah: jumlahTolak,
				catatan: 'ukur-tulis'
			})
	}
];

if (utangAda) {
	kasus.push({
		nama: 'POST /api/utang/[id]/bayar (tolak OVERPAY)',
		hap: 400,
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
		hap: 400,
		jalan: () =>
			kirim('POST', `/api/tagihan/${tagihanAda.id}/bayar`, { bulan: bulanDepan, id_dompet: 999_999 })
	});
}
if (dompetLain) {
	kasus.push({
		nama: 'PATCH /api/dompet/[id] (tolak nama bentrok)',
		hap: 409,
		jalan: () => kirim('PATCH', `/api/dompet/${dompetLain.id}`, { nama_dompet: dompetAktif.nama })
	});
}

console.log(`BASE=${BASE}  putaran=${PUTARAN}  (semua permintaan DITOLAK — nol tulisan)`);
let gagal = 0;
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
	if (status !== k.hap) {
		gagal++;
		console.error(
			`    GAGAL — status ${status}, seharusnya ${k.hap}` +
				(status >= 200 && status < 300
					? '  <<< 2xx: tulisan mungkin terjadi, PERIKSA DATA!'
					: '')
		);
	}
}
if (gagal) {
	console.error(`\nFAIL — ${gagal} kasus berstatus tak terduga.`);
	process.exit(1);
}
console.log('\nPASS — semua permintaan ditolak sesuai harapan (nol tulisan).');
process.exit(0);
