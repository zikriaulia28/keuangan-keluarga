import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { currentUser } from '$lib/server/auth';
import { bulanBerjalan, listTagihan, listUtangAktif, loadRingkasan } from '$lib/server/dashboard';

const BULAN = /^[0-9]{4}-[0-9]{2}$/;

export const load: PageServerLoad = async ({ cookies, url }) => {
	const user = await currentUser(cookies);
	if (!user) redirect(302, '/');

	const param = url.searchParams.get('bulan');
	const bulan = param && BULAN.test(param) ? param : bulanBerjalan();

	const [ringkasan, tagihan, utang] = await Promise.all([
		loadRingkasan(bulan),
		listTagihan(bulan),
		listUtangAktif()
	]);

	return { bulan, ringkasan, tagihan, utang, namaPengguna: user.username };
};
