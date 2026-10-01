/** API se-host (SvelteKit server routes). */

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    ...init,
  });
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
  return body;
}

// Formatter dibuat sekali, bukan tiap panggilan: rekening koran memanggil ini
// ~340 kali untuk satu render, dan `toLocaleString` membangun ulang formatter
// di setiap call.
const nf = new Intl.NumberFormat('id-ID');

/** Angka polos tanpa "Rp" — untuk kolom tabel yang judulnya sudah menyebut rupiah. */
export const angka = (n: number) => nf.format(Math.round(n));

export const rupiah = (n: number) => `Rp ${angka(n)}`;
