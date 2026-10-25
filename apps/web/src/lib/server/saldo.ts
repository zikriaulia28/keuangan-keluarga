import { sql } from 'drizzle-orm';
import { db as defaultDb, transaksi, transfer } from 'db';

type Db = typeof defaultDb;

/** Saldo satu dompet = (transaksi masuk − keluar) + (transfer masuk − keluar). */
export async function saldoDompet(database: Db, id: number): Promise<number> {
	const rows = await database.execute<{ saldo: number }>(sql`
		SELECT COALESCE(SUM(delta), 0)::int AS saldo FROM (
			SELECT CASE WHEN ${transaksi.tipe} = 'masuk' THEN ${transaksi.jumlah} ELSE -${transaksi.jumlah} END AS delta
				FROM ${transaksi} WHERE ${transaksi.dompetId} = ${id}
			UNION ALL
			SELECT CASE WHEN ${transfer.dompetTujuan} = ${id} THEN ${transfer.jumlah} ELSE -${transfer.jumlah} END AS delta
				FROM ${transfer} WHERE ${transfer.dompetAsal} = ${id} OR ${transfer.dompetTujuan} = ${id}
		) s
	`);
	return Number(rows[0]?.saldo ?? 0);
}

/**
 * Saldo semua dompet dalam SATU round trip. Dipakai setiap halaman yang memuat
 * daftar dompet: 4 dompet = 4× latensi Neon bila dipanggil satu per satu.
 *
 * PENTING: transaksi dan transfer dijumlahkan di subquery terpisah lalu
 * digabung. Kalau keduanya di-JOIN langsung ke `dompet`, Conditions
 * `OR` pada transfer memunculkan produk kartesian dan saldo terhitung ganda.
 */
export async function saldoSemuaDompet(database: Db): Promise<Map<number, number>> {
	const rows = await database.execute<{ id_dompet: number; saldo: number }>(sql`
		SELECT d.id_dompet::int AS id_dompet,
			(COALESCE(trx.s, 0) + COALESCE(trf.s, 0))::int AS saldo
		FROM dompet d
		LEFT JOIN (
			SELECT id_dompet, SUM(CASE WHEN tipe = 'masuk' THEN jumlah ELSE -jumlah END)::int AS s
				FROM transaksi GROUP BY id_dompet
		) trx ON trx.id_dompet = d.id_dompet
		LEFT JOIN (
			SELECT id_dompet, SUM(delta)::int AS s FROM (
				SELECT id_dompet_asal AS id_dompet, -jumlah AS delta FROM transfer
				UNION ALL
				SELECT id_dompet_tujuan AS id_dompet, jumlah AS delta FROM transfer
			) x GROUP BY id_dompet
		) trf ON trf.id_dompet = d.id_dompet
	`);
	return new Map(rows.map((r) => [Number(r.id_dompet), Number(r.saldo)]));
}
