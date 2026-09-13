import { eq, sql } from 'drizzle-orm';
import { db as defaultDb, transaksi } from 'db';

type Db = typeof defaultDb;

/** Saldo dompet = total masuk − total keluar. */
export async function saldoDompet(database: Db, id: number): Promise<number> {
  const rows = await database
    .select({
      saldo: sql<number>`COALESCE(SUM(CASE WHEN ${transaksi.tipe} = 'masuk' THEN ${transaksi.jumlah} ELSE -${transaksi.jumlah} END), 0)`,
    })
    .from(transaksi)
    .where(eq(transaksi.dompetId, id));
  return Number(rows[0]?.saldo ?? 0);
}

/** Saldo semua dompet dalam 1 query (GROUP BY). Return map: id_dompet -> saldo. */
export async function saldoSemuaDompet(database: Db): Promise<Map<number, number>> {
  const rows = await database
    .select({
      idDompet: transaksi.dompetId,
      saldo: sql<number>`SUM(CASE WHEN ${transaksi.tipe} = 'masuk' THEN ${transaksi.jumlah} ELSE -${transaksi.jumlah} END)`,
    })
    .from(transaksi)
    .groupBy(transaksi.dompetId);
  
  const map = new Map<number, number>();
  for (const r of rows) {
    map.set(r.idDompet, Number(r.saldo ?? 0));
  }
  return map;
}
