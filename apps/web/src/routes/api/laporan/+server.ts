import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { and, desc, eq, gte, lte, sql } from 'drizzle-orm';
import { db, dompet, kategori, transfer, transaksi, users } from 'db';
import { currentUser } from '$lib/server/auth';

const TGL = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;

/** Tanggal lokal sebagai YYYY-MM-DD. `toISOString` memakai UTC dan bisa geser
 *  satu hari untuk zona waktu di belakang Greenwich. */
function iso(d: Date) {
	const p = (n: number) => String(n).padStart(2, '0');
	return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * Saldo kumulatif per dompet sampai tanggal tertentu. Transaksi dan transfer
 * dijumlahkan di subquery terpisah: kalau di-JOIN langsung ke dompet, kondisi
 * OR pada transfer menimbulkan produk kartesian dan saldo terhitung ganda.
 */
const SALDO_Sampai = (sampai: string) => sql`
	SELECT d.id_dompet::int AS id,
		(COALESCE(trx.s, 0) + COALESCE(trf.s, 0))::int AS saldo
	FROM dompet d
	LEFT JOIN (
		SELECT id_dompet, SUM(CASE WHEN tipe = 'masuk' THEN jumlah ELSE -jumlah END)::int AS s
		FROM transaksi WHERE tanggal <= ${sampai} GROUP BY id_dompet
	) trx ON trx.id_dompet = d.id_dompet
	LEFT JOIN (
		SELECT id_dompet, SUM(delta)::int AS s FROM (
			SELECT id_dompet_asal AS id_dompet, -jumlah AS delta FROM transfer WHERE tanggal <= ${sampai}
			UNION ALL
			SELECT id_dompet_tujuan AS id_dompet, jumlah AS delta FROM transfer WHERE tanggal <= ${sampai}
		) x GROUP BY id_dompet
	) trf ON trf.id_dompet = d.id_dompet`;

/**
 * Arus rekening koran: transaksi dan transfer digabung jadi SATU stream.
 *
 * Transfer sengaja dipecah jadi dua baris — keluar di dompet asal, masuk di
 * dompet tujuan — supaya rumus delta per dompet identik dengan SALDO_Sampai di
 * atas. Kalau transfer disembunyikan atau cuma satu baris, saldo baris terakhir
 * tidak akan cocok dengan kartu "Saldo akhir" di layar.
 *
* Kolom `sumber` (1=transaksi, 2=transfer) dipakai sebagai tiebreak urutan:
 * 23 transaksi jatuh di tanggal yang sama, dan tanpa tiebreak deterministik
 * running balance di PDF bisa melompat-lompat antar render.
 *
 * Di dalam literal sql`` Drizzle hanya memetakan kolom yang di-interpolasi;
 * teks SQL yang ditulis tangan dikirim apa adanya. Jadi di siniWAJIB pakai nama
 * kolom asli (`nama_kategori`, `nama_dompet`), bukan nama properti Drizzle
 * (`kategori.nama`, `dompet.nama`) — yang akan ditolak Postgres.
 */
const ARUS = (dari: string, sampai: string) => sql`
	SELECT a.tanggal, a.sumber, a.urut, a.id_dompet, d.nama_dompet AS dompet,
		a.delta, a.kategori,
		CASE
			WHEN a.sumber = 1 THEN COALESCE(a.catatan, a.kategori)
			WHEN a.catatan IS NULL THEN a.keterangan
			ELSE a.keterangan || ' - ' || a.catatan
		END AS keterangan
	FROM (
		SELECT t.tanggal, 1 AS sumber, t.id AS urut, t.id_dompet,
			(CASE WHEN t.tipe = 'masuk' THEN t.jumlah ELSE -t.jumlah END)::int AS delta,
			COALESCE(k.nama_kategori, 'Tanpa kategori') AS kategori,
			NULLIF(t.catatan, '') AS catatan,
			NULL::text AS keterangan
		FROM transaksi t
		LEFT JOIN kategori k ON k.id_kategori = t.id_kategori
		WHERE t.tanggal BETWEEN ${dari} AND ${sampai}
		UNION ALL
		SELECT f.tanggal, 2, f.id, f.id_dompet_asal,
			(-f.jumlah)::int,
			'Transfer'::text,
			NULLIF(f.catatan, ''),
			'Transfer ke ' || dt.nama_dompet
		FROM transfer f
		JOIN dompet dt ON dt.id_dompet = f.id_dompet_tujuan
		WHERE f.tanggal BETWEEN ${dari} AND ${sampai}
		UNION ALL
		SELECT f.tanggal, 2, f.id, f.id_dompet_tujuan,
			f.jumlah::int,
			'Transfer'::text,
			NULLIF(f.catatan, ''),
			'Transfer dari ' || da.nama_dompet
		FROM transfer f
		JOIN dompet da ON da.id_dompet = f.id_dompet_asal
		WHERE f.tanggal BETWEEN ${dari} AND ${sampai}
	) a
	JOIN dompet d ON d.id_dompet = a.id_dompet
	ORDER BY a.tanggal, a.sumber, a.urut, a.id_dompet`;

export const GET: RequestHandler = async ({ cookies, url }) => {
	const user = await currentUser(cookies);
	if (!user) return json({ error: 'UNAUTHENTICATED' }, { status: 401 });

	const dari = url.searchParams.get('dari') ?? '';
	const sampai = url.searchParams.get('sampai') ?? '';
	if (!TGL.test(dari) || !TGL.test(sampai) || dari > sampai) {
		return json({ error: 'INVALID_MONTH' }, { status: 400 });
	}
	// Rincian rekening koran hanya diambil kalau diminta, supaya halaman utama
	// tidak ikut membawa ~113 baris extra setiap muat.
	const mauKoran = url.searchParams.get('rincian') === 'koran';

	// Periode pembanding (R3). Dua aturan, dan ini disengaja:
	//  - Periode satu bulan kalender penuh -> bandingkan dengan bulan kalender
	//    sebelumnya, supaya angkanya sama dengan kartu pembanding di dashboard.
	//  - Selain itu -> rentang sepanjang N hari tepat sebelum `dari`.
	// "6 bulan lalu" tidak punya padanan bulan kalender, jadi tidak boleh
	// disamarkan jadi satu bulan.
	const lalu = (() => {
		const a = new Date(`${dari}T00:00:00`);
		const b = new Date(`${sampai}T00:00:00`);
		const akhirBln = new Date(b.getFullYear(), b.getMonth() + 1, 0);
		// Syarat bulan kalender penuh: tanggal awal tepat tanggal 1, tanggal akhir
		// tepat akhir bulan, DAN keduanya di bulan yang sama. Tanpa syarat ketiga,
		// rentang 2026-08-01..2026-09-01 terira "bulan penuh" padahal 32 hari.
		const bulanPenuh =
			a.getDate() === 1 &&
			b.getDate() === akhirBln.getDate() &&
			a.getMonth() === b.getMonth() &&
			a.getFullYear() === b.getFullYear();
		if (bulanPenuh) {
			const awal = new Date(a.getFullYear(), a.getMonth() - 1, 1);
			const akhir = new Date(awal.getFullYear(), awal.getMonth() + 1, 0);
			return { dari: iso(awal), sampai: iso(akhir), bulanPenuh: true };
		}
		const panjang = Math.round((b.getTime() - a.getTime()) / 86_400_000) + 1;
		const akhir = new Date(a);
		akhir.setDate(akhir.getDate() - 1);
		const mulai = new Date(akhir);
		mulai.setDate(mulai.getDate() - panjang + 1);
		return { dari: iso(mulai), sampai: iso(akhir), bulanPenuh: false };
	})();

	// Saldo awal = posisi jual hari sebelum `dari`, jadi transfer di dalam periode
	// terhitung sebagai perpindahan dompet, bukan pemasukan.
	const sebelum = new Date(`${dari}T00:00:00`);
	sebelum.setDate(sebelum.getDate() - 1);
	const akhirSebelum = sebelum.toISOString().slice(0, 10);

	const dalam = and(gte(transaksi.tanggal, dari), lte(transaksi.tanggal, sampai));

	const [masuk, keluar, tren, perKategori, perKategoriMasuk, daftarDompet, saldoAwal, saldoAkhir, koran, terbesar] =
		await Promise.all([
		db
			.select({ n: sql<number>`COALESCE(SUM(${transaksi.jumlah}), 0)` })
			.from(transaksi)
			.where(and(dalam, eq(transaksi.tipe, 'masuk'))),
		db
			.select({ n: sql<number>`COALESCE(SUM(${transaksi.jumlah}), 0)` })
			.from(transaksi)
			.where(and(dalam, eq(transaksi.tipe, 'keluar'))),
		db
			.select({
				bulan: sql<string>`substring(${transaksi.tanggal} from 1 for 7)`,
				masuk: sql<number>`COALESCE(SUM(CASE WHEN ${transaksi.tipe} = 'masuk' THEN ${transaksi.jumlah} ELSE 0 END), 0)`,
				keluar: sql<number>`COALESCE(SUM(CASE WHEN ${transaksi.tipe} = 'keluar' THEN ${transaksi.jumlah} ELSE 0 END), 0)`
			})
			.from(transaksi)
			.where(dalam)
			.groupBy(sql`substring(${transaksi.tanggal} from 1 for 7)`)
			.orderBy(sql`substring(${transaksi.tanggal} from 1 for 7)`),
		db
			.select({
				kategoriId: kategori.id,
				kategori: kategori.nama,
				bulan: sql<string>`substring(${transaksi.tanggal} from 1 for 7)`,
				total: sql<number>`COALESCE(SUM(${transaksi.jumlah}), 0)`
			})
			.from(transaksi)
			// leftJoin, bukan innerJoin: id_kategori nullable, dan innerJoin
			// membuang transaksi tanpa kategori tanpa memberi tahu pemanggil.
			.leftJoin(kategori, eq(transaksi.kategoriId, kategori.id))
			.where(and(dalam, eq(transaksi.tipe, 'keluar')))
			// Group by id, bukan nama: nama_kategori tidak punya UNIQUE, dan
			// "Lainnya" memang ada dua baris di DB.
			.groupBy(kategori.id, kategori.nama, sql`substring(${transaksi.tanggal} from 1 for 7)`),
		db
			.select({
				kategoriId: kategori.id,
				kategori: kategori.nama,
				bulan: sql<string>`substring(${transaksi.tanggal} from 1 for 7)`,
				total: sql<number>`COALESCE(SUM(${transaksi.jumlah}), 0)`
			})
			.from(transaksi)
			.leftJoin(kategori, eq(transaksi.kategoriId, kategori.id))
			.where(and(dalam, eq(transaksi.tipe, 'masuk')))
			.groupBy(kategori.id, kategori.nama, sql`substring(${transaksi.tanggal} from 1 for 7)`),
		db.select().from(dompet).orderBy(dompet.nama),
		db.execute(sql`${SALDO_Sampai(akhirSebelum)}`),
		db.execute(sql`${SALDO_Sampai(sampai)}`),
		mauKoran ? db.execute(sql`${ARUS(dari, sampai)}`) : Promise.resolve([]),
		// Transaksi terbesar (R2). Angka diambil tanpa JOIN; hanya labelnya yang
		// perlu JOIN, jadi ketiganya leftJoin supaya transaksi tanpa kategori
		// tidak hilang diam-diam. `jumlah` tidak punya index (B6) — ini top-N
		// sort di atas range scan, bukanustersan index.
		db
			.select({
				id: transaksi.id,
				tanggal: transaksi.tanggal,
				jumlah: transaksi.jumlah,
				catatan: transaksi.catatan,
				dompet: dompet.nama,
				kategori: kategori.nama,
				pencatat: users.username
			})
			.from(transaksi)
			.leftJoin(kategori, eq(transaksi.kategoriId, kategori.id))
			.leftJoin(dompet, eq(transaksi.dompetId, dompet.id))
			.leftJoin(users, eq(transaksi.userId, users.id))
			.where(and(dalam, eq(transaksi.tipe, 'keluar')))
			.orderBy(desc(transaksi.jumlah))
			.limit(10)
	]);

	const totalMasuk = Number(masuk[0]?.n ?? 0);
	const totalKeluar = Number(keluar[0]?.n ?? 0);
	const petaAwal = new Map(saldoAwal.map((r) => [Number((r as { id: number }).id), Number((r as { saldo: number }).saldo)]));
	const petaAkhir = new Map(saldoAkhir.map((r) => [Number((r as { id: number }).id), Number((r as { saldo: number }).saldo)]));
	const saldoAwalTotal = [...petaAwal.values()].reduce((a, b) => a + b, 0);
	const saldoAkhirTotal = [...petaAkhir.values()].reduce((a, b) => a + b, 0);

	const dalamLalu = and(gte(transaksi.tanggal, lalu.dari), lte(transaksi.tanggal, lalu.sampai));
	const [jumlahLaluMasuk, jumlahLaluKeluar] = await Promise.all([
		db
			.select({ n: sql<number>`COALESCE(SUM(${transaksi.jumlah}), 0)` })
			.from(transaksi)
			.where(and(dalamLalu, eq(transaksi.tipe, 'masuk'))),
		db
			.select({ n: sql<number>`COALESCE(SUM(${transaksi.jumlah}), 0)` })
			.from(transaksi)
			.where(and(dalamLalu, eq(transaksi.tipe, 'keluar')))
	]);

	return json({
		dari,
		sampai,
		masuk: totalMasuk,
		keluar: totalKeluar,
		sisa: totalMasuk - totalKeluar,
		saldoAwal: saldoAwalTotal,
		saldoAkhir: saldoAkhirTotal,
		sebelumnya: {
			dari: lalu.dari,
			sampai: lalu.sampai,
			bulanPenuh: lalu.bulanPenuh,
			masuk: Number(jumlahLaluMasuk[0]?.n ?? 0),
			keluar: Number(jumlahLaluKeluar[0]?.n ?? 0)
		},
		tren: tren.map((t) => ({
			bulan: t.bulan,
			masuk: Number(t.masuk),
			keluar: Number(t.keluar)
		})),
		perKategori: perKategori.map((r) => ({
			kategoriId: r.kategoriId,
			kategori: r.kategori ?? 'Tanpa kategori',
			bulan: r.bulan,
			total: Number(r.total)
		})),
		perKategoriMasuk: perKategoriMasuk.map((r) => ({
			kategoriId: r.kategoriId,
			kategori: r.kategori ?? 'Tanpa kategori',
			bulan: r.bulan,
			total: Number(r.total)
		})),
		dompet: daftarDompet.map((d) => {
			const awal = petaAwal.get(d.id) ?? 0;
			const akhir = petaAkhir.get(d.id) ?? 0;
			return { id: d.id, nama: d.nama, awal, akhir, selisih: akhir - awal };
		}),
		terbesar: terbesar.map((r) => ({
			id: r.id,
			tanggal: r.tanggal,
			jumlah: Number(r.jumlah),
			catatan: r.catatan,
			dompet: r.dompet,
			kategori: r.kategori ?? 'Tanpa kategori',
			pencatat: r.pencatat
		})),
		...(mauKoran ? { koran } : {})
	});
};
