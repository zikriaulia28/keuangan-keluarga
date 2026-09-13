import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { currentUser } from '$lib/server/auth';

export const load: LayoutServerLoad = async ({ cookies }) => {
  const user = await currentUser(cookies);
  if (!user) {
    throw redirect(302, '/');
  }
  return { user };
};
