import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { cekDanKirimPengingat } from '../../../../lib/server/push';

export const GET: RequestHandler = async ({ request }) => {
  const secret = process.env.VERCEL_CRON_SECRET ?? process.env.CRON_SECRET;
  const auth = request.headers.get('authorization') ?? '';
  if (!secret || auth !== `Bearer ${secret}`) {
    return json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }
  try {
    const hasil = await cekDanKirimPengingat();
    return json({ ok: true, ...hasil });
  } catch (e) {
    return json({ error: 'INTERNAL', detail: String(e) }, { status: 500 });
  }
};