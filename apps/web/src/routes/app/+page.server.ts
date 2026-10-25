import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { currentUser } from '$lib/server/auth';
import { bulanBerjalan, listTagihan, listUtangAktif, loadRingkasan } from '$lib/server/dashboard';
import { header, mulai } from '$lib/server/waktu';

const BULAN = /^[0-9]{4}-[0-9]{2}$/;

export const load: PageServerLoad = async ({ cookies, url, setHeaders }) => {
	const t0 = mulai();
	const user = await currentUser(cookies);
	if (!user) redirect(302, '/');

	const param = url.searchParams.get('bulan');
	const bulan = param && BULAN.test(param) ? param : bulanBerjalan();

	const [ringkasan, tagihan, utang] = await Promise.all([
		loadRingkasan(bulan),
		listTagihan(bulan),
		listUtangAktif()
	]);

	// 2 hop: currentUser → satu batch; seluruh query di dalamnya paralel.
	setHeaders({ 'server-timing': header(t0, 2) });

	return { bulan, ringkasan, tagihan, utang, namaPengguna: user.username };
};
