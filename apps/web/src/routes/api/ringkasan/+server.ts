import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { currentUser } from '$lib/server/auth';
import { loadRingkasan } from '$lib/server/dashboard';
import { header, mulai } from '$lib/server/waktu';

const BULAN = /^[0-9]{4}-[0-9]{2}$/;

export const GET: RequestHandler = async ({ cookies, url }) => {
	const t0 = mulai();
	const user = await currentUser(cookies);
	if (!user) return json({ error: 'UNAUTHENTICATED' }, { status: 401 });
	const bulan = url.searchParams.get('bulan') || new Date().toISOString().slice(0, 7);
	if (!BULAN.test(bulan)) return json({ error: 'INVALID_MONTH' }, { status: 400 });
	// 2 hop: currentUser → satu batch loadRingkasan.
	return json(await loadRingkasan(bulan), { headers: { 'server-timing': header(t0, 2) } });
};
