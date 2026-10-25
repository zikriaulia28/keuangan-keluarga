/**
 * Instrumen `Server-Timing` untuk pengukuran before/after optimasi latensi.
 * Dipakai oleh semua `+page.server.ts` dan endpoint panas (spesifikasi §5.5).
 * Dua fungsi mungil ini saja — tidak ada logika lain di sini.
 */

/** Ambil awal pengukuran. Panggil sebelum query pertama. */
export function mulai(): number {
	return performance.now();
}

/**
 * Format header `Server-Timing`.
 * `header(812.4, 6)` → `total;dur=812.4;desc="6 hop"`
 *
 * @param t0 nilai `mulai()`
 * @param hop jumlah round-trip berantai (rantai `await` berurutan) pada kode saat ini
 */
export function header(t0: number, hop: number): string {
	const dur = (performance.now() - t0).toFixed(1);
	return `total;dur=${dur};desc="${hop} hop"`;
}
