import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { and, desc, eq, gte, lte } from 'drizzle-orm';
import { db, dompet, kategori, tagihan, tagihanBayar, transaksi, users } from 'db';
import { currentUser } from '$lib/server/auth';
import { saldoDompet } from '$lib/server/saldo';

const BULAN = /^[0-9]{4}-[0-9]{2}$/;

function bulanBerjalan(): string {
	const now = new Date();
	return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export const load: PageServerLoad = async ({ cookies, url }) => {
	const user = await currentUser(cookies);
	if (!user) redirect(302, '/');

	const param = url.searchParams.get('bulan');
	const bulan = param && BULAN.test(param) ? param : bulanBerjalan();
	const [y, m] = bulan.split('-').map(Number);
	const last = new Date(y, m, 0).getDate();
	const dari = `${bulan}-01`;
	const sampai = `${bulan}-${String(last).padStart(2, '0')}`;

	const [list, kat, daftarDompet, tr] = await Promise.all([
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
		db.select().from(dompet).orderBy(dompet.nama),
		db
			.select({ catatan: transaksi.catatan, dompet: dompet.nama })
			.from(transaksi)
			.innerJoin(dompet, eq(transaksi.dompetId, dompet.id))
			.innerJoin(kategori, eq(transaksi.kategoriId, kategori.id))
			.innerJoin(users, eq(transaksi.userId, users.id))
			.where(
				and(gte(transaksi.tanggal, dari), lte(transaksi.tanggal, sampai), eq(transaksi.tipe, 'keluar'))
			)
			.orderBy(desc(transaksi.tanggal), desc(transaksi.id))
			.limit(500)
	]);

	const sudah = await db.select().from(tagihanBayar).where(eq(tagihanBayar.bulan, bulan));
	const lunas: Record<number, true> = {};
	for (const s of sudah) lunas[s.tagihanId] = true;
	const daftar = list.map((r) => ({ ...r, lunas: lunas[r.id] === true }));

	const dompets = [];
	for (const d of daftarDompet) {
		dompets.push({ id_dompet: d.id, nama_dompet: d.nama, saldo: await saldoDompet(db, d.id) });
	}

	// Dompet sumber pembayaran: cocokkan transaksi "Tagihan <nama> <bulan>".
	const via: Record<number, string> = {};
	for (const t of daftar) {
		if (!t.lunas) continue;
		const hit = tr.find((x) => x.catatan === `Tagihan ${t.nama} ${bulan}`);
		if (hit) via[t.id] = hit.dompet;
	}
	const dompetPilih: Record<number, string> = {};
	if (dompets.length > 0) {
		for (const t of daftar) dompetPilih[t.id] = String(dompets[0].id_dompet);
	}

	return { bulan, role: user.role, daftar, kategoris: kat, dompets, dompetPilih, via };
};
