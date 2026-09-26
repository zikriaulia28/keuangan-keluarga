import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { desc, eq, or } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { db, dompet, transfer, users } from 'db';
import { currentUser } from '$lib/server/auth';
import { saldoDompet } from '$lib/server/saldo';

const TGL = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;
const asal = alias(dompet, 'asal');
const tujuan = alias(dompet, 'tujuan');

export const GET: RequestHandler = async ({ cookies, url }) => {
  const user = await currentUser(cookies);
  if (!user) return json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit') ?? 50) || 50, 1), 200);
  return json(
    await db
      .select({
        id: transfer.id,
        tanggal: transfer.tanggal,
        jumlah: transfer.jumlah,
        catatan: transfer.catatan,
        id_dompet_asal: transfer.dompetAsal,
        id_dompet_tujuan: transfer.dompetTujuan,
        asal: asal.nama,
        tujuan: tujuan.nama,
        pencatat: users.username
      })
      .from(transfer)
      .innerJoin(asal, eq(transfer.dompetAsal, asal.id))
      .innerJoin(tujuan, eq(transfer.dompetTujuan, tujuan.id))
      .innerJoin(users, eq(transfer.userId, users.id))
      .orderBy(desc(transfer.tanggal), desc(transfer.id))
      .limit(limit)
  );
};

export const POST: RequestHandler = async ({ request, cookies }) => {
  const user = await currentUser(cookies);
  if (!user) return json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  if (user.role !== 'admin') return json({ error: 'FORBIDDEN' }, { status: 403 });
  let body: {
    tanggal?: unknown;
    id_dompet_asal?: unknown;
    id_dompet_tujuan?: unknown;
    jumlah?: unknown;
    catatan?: unknown;
  };
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: 'INVALID_TRANSFER' }, { status: 400 });
  }
  if (
    typeof body.tanggal !== 'string' ||
    !TGL.test(body.tanggal) ||
    typeof body.id_dompet_asal !== 'number' ||
    !Number.isInteger(body.id_dompet_asal) ||
    typeof body.id_dompet_tujuan !== 'number' ||
    !Number.isInteger(body.id_dompet_tujuan) ||
    typeof body.jumlah !== 'number' ||
    !Number.isInteger(body.jumlah) ||
    body.jumlah < 1 ||
    (body.catatan !== undefined && body.catatan !== null && typeof body.catatan !== 'string')
  ) {
    return json({ error: 'INVALID_TRANSFER' }, { status: 400 });
  }
  if (body.id_dompet_asal === body.id_dompet_tujuan) {
    return json({ error: 'SAME_WALLET' }, { status: 400 });
  }
  const cek = await db
    .select({ id: dompet.id, arsip: dompet.arsip })
    .from(dompet)
    .where(or(eq(dompet.id, body.id_dompet_asal), eq(dompet.id, body.id_dompet_tujuan)));
  if (cek.length !== 2) return json({ error: 'INVALID_WALLET' }, { status: 400 });
  if (cek.some((d) => d.arsip)) return json({ error: 'WALLET_ARCHIVED' }, { status: 400 });
  if (body.jumlah > (await saldoDompet(db, body.id_dompet_asal))) {
    return json({ error: 'INSUFFICIENT_BALANCE' }, { status: 400 });
  }
  const ins = (
    await db
      .insert(transfer)
      .values({
        tanggal: body.tanggal,
        dompetAsal: body.id_dompet_asal,
        dompetTujuan: body.id_dompet_tujuan,
        jumlah: body.jumlah,
        catatan: (body.catatan as string | null) ?? '',
        userId: user.id
      })
      .returning({ id: transfer.id })
  )[0];
  return json({ id: ins.id }, { status: 201 });
};
