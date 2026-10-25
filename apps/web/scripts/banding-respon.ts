/**
 * Rekam / bandingkan / ukur response JSON + timing.
 *
 * Pemakaian (workdir: apps/web, agar .env termuat otomatis):
 *
 *   SESSION=<token cookie session> bun scripts/banding-respon.ts simpan
 *   SESSION=<token cookie session> bun scripts/banding-respon.ts banding
 *   SESSION=<token cookie session> bun scripts/banding-respon.ts ukur
 *   SESSION=... BASE=https://keuangan-keluarga-chi.vercel.app bun scripts/banding-respon.ts ukur
 *
 * Nama target boleh diberikan setelah mode untuk membatasi (mis. saat merekam
 * baseline halaman saja tanpa menimpa baseline endpoint API):
 *
 *   bun scripts/banding-respon.ts simpan hal-dashboard hal-transaksi hal-tagihan
 *
 * Env:
 *   SESSION  token cookie `session` (wajib; berlaku 12 jam)
 *   BASE     default http://localhost:5173
 *   BULAN    default bulan berjalan (YYYY-MM)
 *
 * `simpan`  → menulis .baseline/<nama-endpoint>.json (ter-ignore; jangan sampai ter-commit)
 * `banding` → mengambil ulang lalu deep-equal (abaikan urutan kunci) terhadap baseline
 * `ukur`    → cetak ms total + header Server-Timing per endpoint, tanpa menulis file
 *
 * Target `hal-*` memakai `__data.json` SvelteKit — data `load` SSR per halaman,
 * sehingga refactor `+page.server.ts` ikut terverifikasi, bukan hanya endpoint API.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const mode = process.argv[2];
const SESSION = process.env.SESSION;
const BASE = process.env.BASE || 'http://localhost:5173';
const BULAN = process.env.BULAN || new Date().toISOString().slice(0, 7);
const DIR = join(process.cwd(), '.baseline');

if (mode !== 'simpan' && mode !== 'banding' && mode !== 'ukur') {
	console.error('Pemakaian: SESSION=<token> bun scripts/banding-respon.ts simpan|banding|ukur');
	process.exit(1);
}
if (!SESSION) {
	console.error('Env SESSION wajib diisi (nilai cookie `session`).');
	process.exit(1);
}
if (!/^[0-9]{4}-[0-9]{2}$/.test(BULAN)) {
	console.error(`BULAN tidak valid: ${BULAN} (harus YYYY-MM)`);
	process.exit(1);
}

/** Lima endpoint API + tiga halaman SSR pembanding (spesifikasi §7). */
const endpoint = [
	{ nama: 'dompet', path: '/api/dompet' },
	{ nama: 'ringkasan', path: `/api/ringkasan?bulan=${BULAN}` },
	{ nama: 'transaksi', path: '/api/transaksi?limit=500' },
	{ nama: 'tagihan', path: `/api/tagihan?bulan=${BULAN}` },
	{
		nama: 'laporan',
		path: `/api/laporan?dari=${BULAN}-01&sampai=${akhirBulan(BULAN)}`
	},
	{ nama: 'hal-dashboard', path: '/app/__data.json' },
	{ nama: 'hal-transaksi', path: '/app/transaksi/__data.json' },
	{ nama: 'hal-tagihan', path: '/app/tagihan/__data.json' }
] as const;

/** Nama target setelah argumen mode — kosong = semua. */
const pilih = process.argv.slice(3);
const takDikenal = pilih.filter((n) => !endpoint.some((e) => e.nama === n));
if (takDikenal.length) {
	console.error(`Nama tak dikenal: ${takDikenal.join(', ')}`);
	process.exit(1);
}
const daftar: readonly { nama: string; path: string }[] = pilih.length
	? endpoint.filter((e) => pilih.includes(e.nama))
	: endpoint;

/** Hari terakhir bulan `YYYY-MM` sebagai `YYYY-MM-DD`. */
function akhirBulan(b: string): string {
	const [y, m] = b.split('-').map(Number);
	const hari = new Date(y, m, 0).getDate();
	return `${b}-${String(hari).padStart(2, '0')}`;
}

type Hasil = {
	nama: string;
	path: string;
	ms: number;
	serverTiming: string | null;
	status: number;
	data: unknown;
};

async function ambil(e: { nama: string; path: string }): Promise<Hasil> {
	const t0 = performance.now();
	const r = await fetch(`${BASE}${e.path}`, {
		headers: { Cookie: `session=${SESSION}`, accept: 'application/json' }
	});
	const ms = performance.now() - t0;
	const teks = await r.text();
	let data: unknown = teks;
	try {
		data = JSON.parse(teks);
	} catch {
		/* biarkan sebagai teks — bedakan lewat status */
	}
	return {
		nama: e.nama,
		path: e.path,
		ms: Math.round(ms),
		serverTiming: r.headers.get('server-timing'),
		status: r.status,
		data
	};
}

/** Deep-equal yang mengabaikan urutan kunci objek. */
function sama(a: unknown, b: unknown): boolean {
	if (a === b) return true;
	if (Array.isArray(a) && Array.isArray(b))
		return a.length === b.length && a.every((v, i) => sama(v, b[i]));
	if (a && b && typeof a === 'object' && typeof b === 'object') {
		const ka = Object.keys(a as object).sort();
		const kb = Object.keys(b as object).sort();
		if (ka.length !== kb.length || ka.some((k, i) => k !== kb[i])) return false;
		return ka.every((k) =>
			sama((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])
		);
	}
	return false;
}

async function simpan() {
	mkdirSync(DIR, { recursive: true });
	for (const e of daftar) {
		const h = await ambil(e);
		if (h.status !== 200) {
			console.error(`GAGAL ${e.nama}: HTTP ${h.status} — ${String(h.data).slice(0, 200)}`);
			process.exit(1);
		}
		const isi = {
			meta: { bulan: BULAN, tanggal: new Date().toISOString(), path: h.path },
			status: h.status,
			data: h.data
		};
		writeFileSync(join(DIR, `${e.nama}.json`), JSON.stringify(isi, null, 2), 'utf8');
		console.log(`simpan  ${e.nama.padEnd(10)} ${String(h.ms).padStart(5)} ms  ${h.path}`);
	}
	console.log(`\nBaseline tersimpan di ${DIR} (ter-ignore, jangan sampai ter-commit).`);
}

async function banding() {
	let adaBeda = false;
	for (const e of daftar) {
		const file = join(DIR, `${e.nama}.json`);
		if (!existsSync(file)) {
			console.error(`BEDA    ${e.nama.padEnd(10)} baseline tidak ada — jalankan \`simpan\` dulu`);
			adaBeda = true;
			continue;
		}
		const base = JSON.parse(readFileSync(file, 'utf8'));
		if (base.meta?.bulan !== BULAN) {
			console.error(
				`TOLAK   ${e.nama}: baseline bulan ${base.meta?.bulan}, sekarang ${BULAN} — perbandingan lintas bulan tidak valid`
			);
			process.exit(1);
		}
		const h = await ambil(e);
		if (h.status !== base.status || !sama(h.data, base.data)) {
			console.error(`BEDA    ${e.nama.padEnd(10)} status ${h.status} vs ${base.status}`);
			adaBeda = true;
			continue;
		}
		console.log(`IDENTIK ${e.nama.padEnd(10)} ${String(h.ms).padStart(5)} ms  ${h.path}`);
	}
	process.exit(adaBeda ? 1 : 0);
}

async function ukur() {
	console.log(`BASE=${BASE}  BULAN=${BULAN}`);
	console.log('endpoint     ms  server-timing');
	for (const e of daftar) {
		const h = await ambil(e);
		console.log(
			`${e.nama.padEnd(11)} ${String(h.ms).padStart(5)}  ${h.serverTiming ?? '(tidak ada)'}  [${h.status}]`
		);
	}
}

if (mode === 'simpan') await simpan();
else if (mode === 'banding') await banding();
else await ukur();
