/**
 * Format tampilan bersama. Dipisah dari `$lib/api.ts` karena ini murni format,
 * bukan pemanggilan API.
 *
 * Catatan: TIKET.md T6 menyebut nama file `$lib/format.svelte`, tapi `mom` dan
 * `namaBulan` tidak punya markup sama sekali — 파일 `.svelte` akan menipu karena
 * SvelteKit mengira itu komponen. Karena itu `.ts`.
 */

const NAV_BULAN = new Intl.DateTimeFormat('id-ID', { month: 'short' });
const NAV_BULAN_TAHUN = new Intl.DateTimeFormat('id-ID', { month: 'short', year: '2-digit' });

/** 'Sep' dari '2026-09' */
export const namaBulan = (ym: string) => NAV_BULAN.format(new Date(`${ym}-01T00:00:00`));

/** 'Sep 26' dari '2026-09' */
export const namaBulanTahun = (ym: string) =>
	NAV_BULAN_TAHUN.format(new Date(`${ym}-01T00:00:00`));

/** Persen perubahan dari periode sebelumnya. `null` kalau tidak ada pembanding. */
export function mom(sekarang: number, sebelumnya: number | null): number | null {
	if (sebelumnya === null) return null;
	if (sebelumnya === 0) return sekarang === 0 ? 0 : null;
	return Math.round(((sekarang - sebelumnya) / Math.abs(sebelumnya)) * 100);
}