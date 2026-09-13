import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { desc, eq, sql, and } from 'drizzle-orm';
import { db, dompet, kategori, transaksi, users } from 'db';
import { currentUser } from '$lib/server/auth';
import { saldoDompet } from '$lib/server/saldo';

export const load: PageServerLoad = async ({ cookies }) => {
	const user = await currentUser(cookies);
	if (!user) redirect(302, '/');

	const now = new Date();
	const bulan = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

	const [daftarDompet, katMasuk, katKeluar, rows] = await Promise.all([
		db.select().from(dompet).orderBy(dompet.nama),
		db.select().from(kategori).where(eq(kategori.tipe, 'masuk')).orderBy(kategori.nama),
		db.select().from(kategori).where(eq(kategori.tipe, 'keluar')).orderBy(kategori.nama),
		db
			.select({
				id: transaksi.id,
				tanggal: transaksi.tanggal,
				tipe: transaksi.tipe,
				jumlah: transaksi.jumlah,
				catatan: transaksi.catatan,
				id_dompet: transaksi.dompetId,
				id_kategori: transaksi.kategoriId,
				dompet: dompet.nama,
				kategori: kategori.nama,
				pencatat: users.username
			})
			.from(transaksi)
			.innerJoin(dompet, eq(transaksi.dompetId, dompet.id))
			.innerJoin(kategori, eq(transaksi.kategoriId, kategori.id))
			.innerJoin(users, eq(transaksi.userId, users.id))
			.orderBy(desc(transaksi.tanggal), desc(transaksi.id))
			.limit(100)
	]);
	const daftar = rows.map((r) => ({ ...r, tipe: r.tipe as 'masuk' | 'keluar' }));

	const dompetOut = [];
	for (const d of daftarDompet) {
		dompetOut.push({ id_dompet: d.id, nama_dompet: d.nama, saldo: await saldoDompet(db, d.id) });
	}

	const sum = async (tipe: 'masuk' | 'keluar') => {
		const r = await db
			.select({ n: sql<number>`COALESCE(SUM(${transaksi.jumlah}), 0)` })
			.from(transaksi)
			.where(and(eq(transaksi.tipe, tipe), sql`substring(${transaksi.tanggal} from 1 for 7) = ${bulan}`));
		return Number(r[0]?.n ?? 0);
	};
	const [statMasuk, statKeluar] = await Promise.all([sum('masuk'), sum('keluar')]);

	return { dompet: dompetOut, kategoriMasuk: katMasuk, kategoriKeluar: katKeluar, daftar, statMasuk, statKeluar };
};
