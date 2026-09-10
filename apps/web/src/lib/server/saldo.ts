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
