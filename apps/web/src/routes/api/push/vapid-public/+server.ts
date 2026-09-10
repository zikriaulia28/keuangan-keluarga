import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { vapidConfigured, vapidPublicKey } from '../../../../lib/server/push';

export const GET: RequestHandler = async () => {
  if (!vapidConfigured()) {
    return json({ configured: false, publicKey: null }, { status: 503 });
  }
  return json({ configured: true, publicKey: vapidPublicKey() });
};