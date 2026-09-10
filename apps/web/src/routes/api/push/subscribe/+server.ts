import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { currentUser } from '../../../../lib/server/auth';
import { simpanSubscription } from '../../../../lib/server/push';

export const POST: RequestHandler = async ({ request, cookies }) => {
  const user = await currentUser(cookies);
  if (!user) return json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  try {
    const sub = (await request.json()) as PushSubscriptionJSON;
    await simpanSubscription(user.id, sub);
    return json({ ok: true });
  } catch (e) {
    return json({ error: String(e) }, { status: 400 });
  }
};