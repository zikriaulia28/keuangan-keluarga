/**
 * Uji negatif jalur TULIS. Hanya memakai jalur yang DITOLAK, sehingga tidak
 * pernah menulis data. Tiap kasus membandingkan jumlah baris sebelum/sesudah —
 * kalau ada satu pun baris bertambah saat validasi seharusnya menolak, itu
 * berarti urutan `validasi → insert` rusak dan invariant saldo anti-minus
 * terbukti hilang.
 *
 * Jalankan (butuh dev server jalan):
 *   SESSION=<token> bun scripts/verifikasi-tulis.ts
 *   SESSION=<token> BASE=https://... bun scripts/verifikasi-tulis.ts
 *
 * Uji ini melengkapi, bukan menggantikan, inspeksi urutan baris.
 */
import { sql } from 'drizzle-orm';
import { db, dompet, kategori, tagihan, transaksi, transfer, utang } from 'db';

const BASE = process.env.BASE || 'http://localhost:5173';
const SESSION = process.env.SESSION;
if (!SESSION) {
	console.error('Env SESSION wajib diisi.');
	process.exit(1);
}

const RAKSASA = 999_999_999;
let gagal = 0;

async function jumlahBaris() {
	const [trx, trf] = await Promise.all([
		db.select({ n: sql<number>`COUNT(*)` }).from(transaksi),
		db.select({ n: sql<number>`COUNT(*)` }).from(transfer)
	]);
	return `transaksi=${Number(trx[0]?.n ?? 0)} transfer=${Number(trf[0]?.n ?? 0)}`;
}

async function kirim(metode: string, path: string, body?: unknown) {
	const r = await fetch(`${BASE}${path}`, {
		method: metode,
		headers: {
			Cookie: `session=${SESSION}`,
			'content-type': 'application/json',
			accept: 'application/json'
		},
		body: body === undefined ? undefined : JSON.stringify(body)
	});
	const data = await r.json().catch(() => null);
	return { status: r.status, data: data as { error?: string } | null };
}

async function kasus(
	label: string,
	ekspektasi: { status: number; error: string },
	jalan: () => Promise<{ status: number; data: { error?: string } | null }>
) {
	const sebelum = await jumlahBaris();
	const hasil = await jalan();
	const sesudah = await jumlahBaris();
	const statusOk = hasil.status === ekspektasi.status;
	const errorOk = hasil.data?.error === ekspektasi.error;
	const tulisOk = sebelum === sesudah;
	if (statusOk && errorOk && tulisOk) {
		console.log(`  ok   ${label} → ${hasil.status} ${hasil.data?.error} (tidak ada baris baru)`);
	} else {
		gagal++;
		console.error(
			`  GAGAL ${label}\n` +
				`        harap : ${ekspektasi.status} ${ekspektasi.error}, baris tetap\n` +
				`        dapat: ${hasil.status} ${hasil.data?.error}\n` +
				`        baris: ${sebelum} → ${sesudah}`
		);
	}
}

const dompetAktif = (await db.select().from(dompet).orderBy(dompet.id))[0];
const kategoriKeluar = (await db.select().from(kategori).where(sql`tipe = 'keluar'`))[0];
const trxAda = (await db.select().from(transaksi).orderBy(transaksi.id).limit(1))[0];
const utangAda = (
	await db
		.select()
		.from(utang)
		.orderBy(utang.id)
		.limit(20)
		.then((r) => r.filter((u) => u.jumlah - u.terbayar > 0))
)[0];
const tagihanAda = (await db.select().from(tagihan).orderBy(tagihan.id).limit(1))[0];

if (!dompetAktif || !kategoriKeluar || !trxAda) {
	console.error('Prasyarat tidak lengkap (dompet/kategori/transaksi kosong) — dibatalkan.');
	process.exit(1);
}
const bulan = new Date().toISOString().slice(0, 7);
// Bulan depan: sengaja dipakai untuk uji tagihan supaya tidak kena 409
// ALREADY_PAID (yang muncul sebelum cek dompet) dan jalur benar-benar sampai
// ke pemeriksaan dompet.
const bulanDepan = (() => {
	const [y, m] = bulan.split('-').map(Number);
	const d = new Date(y, m, 1);
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
})();

console.log(`BASE=${BASE}`);
console.log(`dompet=${dompetAktif.id} kategori=${kategoriKeluar.id} transaksi=${trxAda.id}`);

console.log('\nPOST /api/transaksi:');
await kasus('saldo kurang ditolak', { status: 400, error: 'INSUFFICIENT_BALANCE' }, () =>
	kirim('POST', '/api/transaksi', {
		tanggal: `${bulan}-01`,
		tipe: 'keluar',
		id_dompet: dompetAktif.id,
		id_kategori: kategoriKeluar.id,
		jumlah: RAKSASA,
		catatan: 'uji-negatif'
	})
);
await kasus('dompet tak dikenal ditolak', { status: 400, error: 'INVALID_WALLET' }, () =>
	kirim('POST', '/api/transaksi', {
		tanggal: `${bulan}-01`,
		tipe: 'keluar',
		id_dompet: 999_999,
		id_kategori: kategoriKeluar.id,
		jumlah: 1,
		catatan: 'uji-negatif'
	})
);

console.log('\nPATCH /api/transaksi/[id]:');
await kasus('dompet tujuan tak dikenal ditolak', { status: 400, error: 'INVALID_WALLET' }, () =>
	kirim('PATCH', `/api/transaksi/${trxAda.id}`, {
		tanggal: `${bulan}-01`,
		tipe: trxAda.tipe,
		id_dompet: 999_999,
		id_kategori: trxAda.kategoriId,
		jumlah: trxAda.jumlah,
		catatan: trxAda.catatan
	})
);

console.log('\nPOST /api/transfer:');
const dompetKedua = (await db.select().from(dompet).orderBy(dompet.id))[1];
if (dompetKedua) {
	await kasus('saldo asal kurang ditolak', { status: 400, error: 'INSUFFICIENT_BALANCE' }, () =>
		kirim('POST', '/api/transfer', {
			tanggal: `${bulan}-01`,
			id_dompet_asal: dompetAktif.id,
			id_dompet_tujuan: dompetKedua.id,
			jumlah: RAKSASA,
			catatan: 'uji-negatif'
		})
	);
	await kasus('dompet asal = tujuan ditolak', { status: 400, error: 'SAME_WALLET' }, () =>
		kirim('POST', '/api/transfer', {
			tanggal: `${bulan}-01`,
			id_dompet_asal: dompetAktif.id,
			id_dompet_tujuan: dompetAktif.id,
			jumlah: 1
		})
	);
} else {
	console.log('  lewati (hanya satu dompet)');
}

console.log('\nPOST /api/utang/[id]/bayar:');
if (utangAda) {
	const sisa = utangAda.jumlah - utangAda.terbayar;
	await kasus('melebihi sisa ditolak', { status: 400, error: 'OVERPAY' }, () =>
		kirim('POST', `/api/utang/${utangAda.id}/bayar`, { jumlah: sisa + 1, id_dompet: dompetAktif.id })
	);
} else {
	console.log('  lewati (tidak ada utang aktif)');
}

console.log('\nPOST /api/tagihan/[id]/bayar:');
if (tagihanAda) {
	await kasus('dompet tak dikenal ditolak', { status: 400, error: 'INVALID_WALLET' }, () =>
		kirim('POST', `/api/tagihan/${tagihanAda.id}/bayar`, { bulan: bulanDepan, id_dompet: 999_999 })
	);
} else {
	console.log('  lewati (tidak ada tagihan)');
}

console.log(
	gagal === 0
		? '\nPASS — semua jalur penolak menolak TANPA menulis satu baris pun.'
		: `\nFAIL — ${gagal} kasus melanggar urutan validasi → insert.`
);
process.exit(gagal === 0 ? 0 : 1);
