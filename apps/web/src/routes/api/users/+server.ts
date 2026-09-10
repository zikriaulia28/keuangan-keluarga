import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db, users } from 'db';
import { currentUser, hashPassword } from '$lib/server/auth';

export const GET: RequestHandler = async ({ cookies }) => {
  const user = await currentUser(cookies);
  if (!user) return json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  if (user.role !== 'admin') return json({ error: 'FORBIDDEN' }, { status: 403 });
  return json(
    await db
      .select({ id: users.id, username: users.username, role: users.role, created_at: users.createdAt })
      .from(users)
      .orderBy(users.username),
  );
};

export const POST: RequestHandler = async ({ request, cookies }) => {
  const user = await currentUser(cookies);
  if (!user) return json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  if (user.role !== 'admin') return json({ error: 'FORBIDDEN' }, { status: 403 });
  let body: { username?: unknown; password?: unknown; role?: unknown };
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: 'INVALID_USER' }, { status: 400 });
  }
  if (
    typeof body.username !== 'string' ||
    body.username.trim().length < 3 ||
    typeof body.password !== 'string' ||
    body.password.length < 6 ||
    (body.role !== 'admin' && body.role !== 'user')
  ) {
    return json({ error: 'INVALID_USER' }, { status: 400 });
  }
  try {
    const ins = (
      await db
        .insert(users)
        .values({ username: body.username.trim(), passwordHash: hashPassword(body.password), role: body.role })
        .returning({ id: users.id })
    )[0];
    return json({ id: ins.id, username: body.username.trim(), role: body.role }, { status: 201 });
  } catch {
    return json({ error: 'USER_DUPLICATE' }, { status: 409 });
  }
};
