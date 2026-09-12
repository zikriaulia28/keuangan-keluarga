import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { db, users } from 'db';
import { currentUser } from '$lib/server/auth';

export const load: PageServerLoad = async ({ cookies }) => {
	const user = await currentUser(cookies);
	if (!user) redirect(302, '/');
	if (user.role !== 'admin') error(403, 'Akses ditolak.');

	const daftar = await db
		.select({ id: users.id, username: users.username, role: users.role, created_at: users.createdAt })
		.from(users)
		.orderBy(users.username);

	return { saya: { id: user.id, username: user.username, role: user.role }, daftar };
};
