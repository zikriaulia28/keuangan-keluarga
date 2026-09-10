import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { eq } from 'drizzle-orm';
import { db, sessions } from 'db';

export const POST: RequestHandler = async ({ cookies }) => {
  const token = cookies.get('session');
  if (token) await db.delete(sessions).where(eq(sessions.token, token));
  cookies.delete('session', { path: '/' });
  return json({ ok: true });
};
