import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { currentUser } from '$lib/server/auth';

export const GET: RequestHandler = async ({ cookies }) => {
  const user = await currentUser(cookies);
  if (!user) return json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  return json(user);
};
