import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { eq } from 'drizzle-orm';
import { db, dompet, kategori, tagihan, tagihanBayar, transaksi } from 'db';
import { currentUser } from '$lib/server/auth';
import { saldoSemuaDompet } from '$lib/server/saldo';
import { bulanBerjalan } from '$lib/server/dashboard';

const BULAN = /^[0-9]{4}-[0-9]{2}$/;

export const load: PageServerLoad = async ({ cookies, url }) => {
	const user = await currentUser(cookies);
	if (!user) redirect(302, '/');

	const param = url.searchParams.get('bulan');
	const bulan = param && BULAN.test(param) ? param : bulanBerjalan();

	const [list, kat, daftarDompet, sudah] = await Promise.all([
		db
			.select({
				id: tagihan.id,
				nama: tagihan.nama,
				jumlah: tagihan.jumlah,
				hari: tagihan.hari,
				catatan: tagihan.catatan,
				kategori: kategori.nama
			})
			.from(tagihan)
			.innerJoin(kategori, eq(tagihan.kategoriId, kategori.id))
			.orderBy(tagihan.hari, tagihan.nama),
		db.select().from(kategori).where(eq(kategori.tipe, 'keluar')).orderBy(kategori.nama),
		db.select().from(dompet).where(eq(dompet.arsip, false)).orderBy(dompet.nama),
		// Dompet pembayar diambil lewat relasi tagihan_bayar → transaksi, bukan lewat
		// pencocokan teks `catatan`. Tidak perlu menarik ratusan baris transaksi.
		db
			.select({ tagihanId: tagihanBayar.tagihanId, dompet: dompet.nama })
			.from(tagihanBayar)
			.innerJoin(transaksi, eq(tagihanBayar.transaksiId, transaksi.id))
			.innerJoin(dompet, eq(transaksi.dompetId, dompet.id))
			.where(eq(tagihanBayar.bulan, bulan))
	]);

	const lunas: Record<number, true> = {};
	const via: Record<number, string> = {};
	for (const s of sudah) {
		lunas[s.tagihanId] = true;
		via[s.tagihanId] = s.dompet;
	}
	const daftar = list.map((r) => ({ ...r, lunas: lunas[r.id] === true }));

	const [saldoSemua] = await Promise.all([saldoSemuaDompet(db)]);
	const dompets = daftarDompet.map((d) => ({
		id_dompet: d.id,
		nama_dompet: d.nama,
		saldo: saldoSemua.get(d.id) ?? 0
	}));

	const dompetPilih: Record<number, string> = {};
	if (dompets.length > 0) {
		for (const t of daftar) dompetPilih[t.id] = String(dompets[0].id_dompet);
	}

	return { bulan, role: user.role, daftar, kategoris: kat, dompets, dompetPilih, via };
};
