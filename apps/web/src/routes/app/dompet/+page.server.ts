import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { desc, eq } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { db, dompet, transfer, users } from 'db';
import { currentUser } from '$lib/server/auth';
import { saldoSemuaDompet } from '$lib/server/saldo';

const asal = alias(dompet, 'asal');
const tujuan = alias(dompet, 'tujuan');

export const load: PageServerLoad = async ({ cookies }) => {
  const user = await currentUser(cookies);
  if (!user) redirect(302, '/');

	const [daftarDompet, riwayat, saldoSemua] = await Promise.all([
		db.select().from(dompet).orderBy(dompet.nama),
		db
			.select({
				id: transfer.id,
				tanggal: transfer.tanggal,
				jumlah: transfer.jumlah,
				catatan: transfer.catatan,
				asal: asal.nama,
				tujuan: tujuan.nama,
				pencatat: users.username
			})
			.from(transfer)
			.innerJoin(asal, eq(transfer.dompetAsal, asal.id))
			.innerJoin(tujuan, eq(transfer.dompetTujuan, tujuan.id))
			.innerJoin(users, eq(transfer.userId, users.id))
			.orderBy(desc(transfer.tanggal), desc(transfer.id))
			.limit(20),
		// 1 round trip untuk semua dompet, bukan satu per dompet.
		saldoSemuaDompet(db)
	]);

	// Semua dompet ikut termuat (arsip pun) supaya total saldo tetap utuh.
	const dompetOut = daftarDompet.map((d) => ({
		id_dompet: d.id,
		nama_dompet: d.nama,
		arsip: d.arsip,
		saldo: saldoSemua.get(d.id) ?? 0
	}));

	return { role: user.role, dompet: dompetOut, transfer: riwayat };
};

