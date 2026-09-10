import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { currentUser } from '../../../../lib/server/auth';
import { hapusSubscription } from '../../../../lib/server/push';

export const POST: RequestHandler = async ({ request, cookies }) => {
  const user = await currentUser(cookies);
  if (!user) return json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  try {
    const { endpoint } = (await request.json()) as { endpoint?: string };
    if (!endpoint) return json({ error: 'MISSING_ENDPOINT' }, { status: 400 });
    await hapusSubscription(endpoint);
    return json({ ok: true });
  } catch (e) {
    return json({ error: String(e) }, { status: 400 });
  }
};