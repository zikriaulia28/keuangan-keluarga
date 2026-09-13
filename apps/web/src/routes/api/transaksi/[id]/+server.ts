import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { eq } from 'drizzle-orm';
import { db, dompet, kategori, transaksi } from 'db';
import { currentUser } from '$lib/server/auth';
import { saldoDompet } from '$lib/server/saldo';

const TGL = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;
const efek = (tipe: string, jumlah: number) => (tipe === 'masuk' ? jumlah : -jumlah);

export const DELETE: RequestHandler = async ({ cookies, params }) => {
  const user = await currentUser(cookies);
  if (!user) return json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  const row = (await db.select().from(transaksi).where(eq(transaksi.id, Number(params.id))).limit(1))[0];
  if (!row) return json({ error: 'NOT_FOUND' }, { status: 404 });
  if (user.role !== 'admin' && row.userId !== user.id) {
    return json({ error: 'FORBIDDEN' }, { status: 403 });
  }
  await db.delete(transaksi).where(eq(transaksi.id, row.id));
  return json({ ok: true });
};
export const PATCH: RequestHandler = async ({ request, cookies, params }) => {
	const user = await currentUser(cookies);
	if (!user) return json({ error: 'UNAUTHENTICATED' }, { status: 401 });
	const id = Number(params.id);
	if (!Number.isInteger(id)) return json({ error: 'NOT_FOUND' }, { status: 404 });
	const lama = (await db.select().from(transaksi).where(eq(transaksi.id, id)).limit(1))[0];
	if (!lama) return json({ error: 'NOT_FOUND' }, { status: 404 });
	if (user.role !== 'admin' && lama.userId !== user.id) {
		return json({ error: 'FORBIDDEN' }, { status: 403 });
	}
	let body: {
		tanggal?: unknown;
		tipe?: unknown;
		id_dompet?: unknown;
		id_kategori?: unknown;
		jumlah?: unknown;
		catatan?: unknown;
	};
	try {
		body = (await request.json()) as Record<string, unknown>;
	} catch {
		return json({ error: 'INVALID_TRANSACTION' }, { status: 400 });
	}
	if (
		typeof body.tanggal !== 'string' ||
		!TGL.test(body.tanggal) ||
		(body.tipe !== 'masuk' && body.tipe !== 'keluar') ||
		typeof body.id_dompet !== 'number' ||
		!Number.isInteger(body.id_dompet) ||
		typeof body.id_kategori !== 'number' ||
		!Number.isInteger(body.id_kategori) ||
		typeof body.jumlah !== 'number' ||
		!Number.isInteger(body.jumlah) ||
		body.jumlah < 1 ||
		(body.catatan !== undefined && body.catatan !== null && typeof body.catatan !== 'string')
	) {
		return json({ error: 'INVALID_TRANSACTION' }, { status: 400 });
	}
	const d = await db.select().from(dompet).where(eq(dompet.id, body.id_dompet)).limit(1);
	if (!d[0]) return json({ error: 'INVALID_WALLET' }, { status: 400 });
	const k = await db.select().from(kategori).where(eq(kategori.id, body.id_kategori)).limit(1);
	if (!k[0] || k[0].tipe !== body.tipe) return json({ error: 'INVALID_CATEGORY' }, { status: 400 });
	const saldoBaru =
		(await saldoDompet(db, body.id_dompet)) -
		(lama.dompetId === body.id_dompet ? efek(lama.tipe, lama.jumlah) : 0) +
		efek(body.tipe, body.jumlah);
	if (saldoBaru < 0) return json({ error: 'INSUFFICIENT_BALANCE' }, { status: 400 });
	if (lama.dompetId !== body.id_dompet) {
		const saldoAsal = (await saldoDompet(db, lama.dompetId)) - efek(lama.tipe, lama.jumlah);
		if (saldoAsal < 0) return json({ error: 'INSUFFICIENT_BALANCE' }, { status: 400 });
	}
	await db
		.update(transaksi)
		.set({
			tanggal: body.tanggal,
			tipe: body.tipe,
			dompetId: body.id_dompet,
			kategoriId: body.id_kategori,
			jumlah: body.jumlah,
			catatan: (body.catatan as string | null) ?? ''
		})
		.where(eq(transaksi.id, lama.id));
	return json({ ok: true });
};
