import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { and, eq, gt } from 'drizzle-orm';
import { db, sessions, users } from 'db';
import type { Cookies } from '@sveltejs/kit';

export const SESSION_MAX_AGE = 12 * 3600; // detik (12 jam)

export interface SessionUser {
  id: number;
  username: string;
  role: string;
}

/** Hash scrypt format `salt:hex` (salt acak 16 byte). */
export function hashPassword(pw: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(pw, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

/** Verifikasi hash `salt:hex` dengan perbandingan waktu-konstan. */
export function verifyPassword(pw: string, stored: string): boolean {
  const i = stored.indexOf(':');
  if (i < 0) return false;
  const salt = stored.slice(0, i);
  let expected: Buffer;
  try {
    expected = Buffer.from(stored.slice(i + 1), 'hex');
    if (expected.length === 0) return false;
  } catch {
    return false;
  }
  const actual = scryptSync(pw, salt, expected.length);
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

/** Ambil user dari cookie sesi; null bila tak ada/kedaluwarsa. */
export async function currentUser(cookies: Pick<Cookies, 'get'>): Promise<SessionUser | null> {
  const token = cookies.get('session');
  if (!token) return null;
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
  const rows = await db
    .select({ id: users.id, username: users.username, role: users.role })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.token, token), gt(sessions.expiresAt, now)));
  return (rows[0] as SessionUser | undefined) ?? null;
}
