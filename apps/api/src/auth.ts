import { Elysia } from 'elysia';
import { and, eq, gt } from 'drizzle-orm';
import { db, sessions, users } from 'db';

export interface SessionUser {
  id: number;
  username: string;
  role: string;
}

export async function currentUser(cookie: Record<string, string | undefined>): Promise<SessionUser | null> {
  const token = cookie.session;
  if (!token) return null;
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
  const rows = await db
    .select({ id: users.id, username: users.username, role: users.role })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.token, token), gt(sessions.expiresAt, now)));
  return (rows[0] as SessionUser | undefined) ?? null;
}

/**
 * Pasang auth pada instance yang SAMA dengan route (hook lintas instance
 * via .use(plugin) tidak diwariskan — guard harus inline agar jalan).
 */
export function withAuth<const T extends Elysia<'', {}, {}, {}, {}, {}, {}, false>>(app: T): T {
  return app
    .derive(async ({ cookie }) => ({ user: await currentUser(cookie) }))
    .onBeforeHandle(({ user, set }) => {
      if (!user) {
        set.status = 401;
        return { error: 'UNAUTHENTICATED' };
      }
    }) as T;
}
