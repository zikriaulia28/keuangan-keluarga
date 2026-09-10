import { cors } from '@elysiajs/cors';
import { Elysia, t } from 'elysia';
import { and, eq, gt } from 'drizzle-orm';
import { db, sessions, users } from 'db';
import { keuanganRoutes } from './keuangan';
import { masterRoutes } from './master';
import { transaksiRoutes } from './transaksi';
import { userRoutes } from './users';

const SESSION_MAX_AGE = 12 * 3600; // detik
const isProd = process.env.NODE_ENV === 'production';

const sessionCookie = {
  httpOnly: true,
  path: '/',
  maxAge: SESSION_MAX_AGE,
  secure: isProd, // SameSite=None wajib Secure (HTTPS) saat cross-domain
  sameSite: isProd ? ('none' as const) : ('lax' as const),
};

// Ambil user dari cookie sesi. Dipakai sebagai guard di route privat.
async function me(cookie: Record<string, string | undefined>) {
  const token = cookie.session;
  if (!token) return null;
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
  const rows = await db
    .select({ id: users.id, username: users.username, role: users.role })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.token, token), gt(sessions.expiresAt, now)));
  return rows[0] ?? null;
}

export const app = new Elysia()
  .use(
    cors({
      origin: (process.env.WEB_ORIGIN ?? 'http://localhost:5173').split(','),
      credentials: true,
    }),
  )
  .onError(({ code, error }) => {
    console.error(code, error);
    return { error: 'INTERNAL' };
  })
  .get('/api/health', async () => {
    await db.execute('SELECT 1');
    return { ok: true };
  })
  .post(
    '/api/login',
    async ({ body, cookie, set }) => {
      const row = (await db.select().from(users).where(eq(users.username, body.username)).limit(1))[0];
      if (!row || !(await Bun.password.verify(body.password, row.passwordHash))) {
        set.status = 401;
        return { error: 'INVALID_CREDENTIALS' };
      }
      const token = crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().replaceAll('-', '');
      const exp = new Date(Date.now() + SESSION_MAX_AGE * 1000);
      const stamp = exp.toISOString().slice(0, 19).replace('T', ' ');
      await db.insert(sessions).values({ token, userId: row.id, expiresAt: stamp });
      cookie.session.set({ ...sessionCookie, value: token });
      return { id: row.id, username: row.username, role: row.role };
    },
    { body: t.Object({ username: t.String(), password: t.String() }) },
  )
  .post('/api/logout', async ({ cookie }) => {
    if (cookie.session.value) await db.delete(sessions).where(eq(sessions.token, cookie.session.value));
    cookie.session.remove();
    return { ok: true };
  })
  .get('/api/me', async ({ cookie, set }) => {
    const user = await me(cookie);
    if (!user) {
      set.status = 401;
      return { error: 'UNAUTHENTICATED' };
    }
    return user;
  })
  .use(transaksiRoutes)
  .use(keuanganRoutes)
  .use(masterRoutes)
  .use(userRoutes)
  .listen(process.env.PORT ?? 8081);

console.log(`api ${app.server?.hostname}:${app.server?.port}`);
