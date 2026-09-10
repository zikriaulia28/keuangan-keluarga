import { Elysia, t } from 'elysia';
import { eq } from 'drizzle-orm';
import { db, users } from 'db';
import { withAuth } from './auth';

export const userRoutes = withAuth(new Elysia())
  .get('/api/users', async ({ user, set }) => {
    if (user!.role !== 'admin') {
      set.status = 403;
      return { error: 'FORBIDDEN' };
    }
    return db.select({ id: users.id, username: users.username, role: users.role, created_at: users.createdAt }).from(users).orderBy(users.username);
  })
  .post(
    '/api/users',
    async ({ body, user, set }) => {
      if (user!.role !== 'admin') {
        set.status = 403;
        return { error: 'FORBIDDEN' };
      }
      try {
        const ins = (
          await db
            .insert(users)
            .values({ username: body.username.trim(), passwordHash: await Bun.password.hash(body.password), role: body.role })
            .returning({ id: users.id })
        )[0];
        set.status = 201;
        return { id: ins.id, username: body.username.trim(), role: body.role };
      } catch {
        set.status = 409;
        return { error: 'USER_DUPLICATE' };
      }
    },
    {
      body: t.Object({
        username: t.String({ minLength: 3 }),
        password: t.String({ minLength: 6 }),
        role: t.Union([t.Literal('admin'), t.Literal('user')]),
      }),
    },
  )
  .post(
    '/api/me/password',
    async ({ body, user, set }) => {
      const row = (await db.select().from(users).where(eq(users.id, user!.id)).limit(1))[0];
      if (!row || !(await Bun.password.verify(body.lama, row.passwordHash))) {
        set.status = 400;
        return { error: 'WRONG_PASSWORD' };
      }
      await db.update(users).set({ passwordHash: await Bun.password.hash(body.baru) }).where(eq(users.id, user!.id));
      return { ok: true };
    },
    { body: t.Object({ lama: t.String(), baru: t.String({ minLength: 6 }) }) },
  )
  .delete('/api/users/:id', async ({ params, user, set }) => {
    if (user!.role !== 'admin') {
      set.status = 403;
      return { error: 'FORBIDDEN' };
    }
    const id = Number(params.id);
    if (id === user!.id) {
      set.status = 400;
      return { error: 'CANNOT_DELETE_SELF' };
    }
    const target = (await db.select().from(users).where(eq(users.id, id)).limit(1))[0];
    if (!target) {
      set.status = 404;
      return { error: 'NOT_FOUND' };
    }
    if (target.role === 'admin') {
      const admins = await db.select({ id: users.id }).from(users).where(eq(users.role, 'admin'));
      if (admins.length <= 1) {
        set.status = 400;
        return { error: 'LAST_ADMIN' };
      }
    }
    try {
      await db.delete(users).where(eq(users.id, id));
      return { ok: true };
    } catch {
      set.status = 400;
      return { error: 'USER_IN_USE' };
    }
  });
