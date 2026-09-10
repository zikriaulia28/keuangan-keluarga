import { env } from '$env/dynamic/public';

/** Base URL API Elysia. Isi PUBLIC_API_URL di Vercel / .env */
export const API_URL = env.PUBLIC_API_URL ?? 'http://localhost:8081';

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    ...init,
  });
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
  return body;
}

export const rupiah = (n: number) => `Rp ${Math.round(n).toLocaleString('id-ID')}`;
