/**
 * State global "lihat angka": angka rupiah ringkasan di Dashboard, Dompet,
 * dan Laporan disembunyikan (`Rp ******`) secara default sampai ikon mata di
 * header ditekan. Satu state untuk ketiga halaman dan diingat di localStorage.
 *
 * File wajib `.svelte.ts` supaya `$state` boleh di level modul. Default
 * tersembunyi membuat SSR selalu me-render mask — tidak ada angka yang "kedip"
 * saat hydration; `muat()` (onMount layout) baru menerapkan pilihan tersimpan.
 */
import { rupiah } from '$lib/api';

const KUNCI = 'kas:lihat-angka';

let tampil = $state(false);

/** Sedang menampilkan angka? (dibaca template — reaktif) */
export function sedangTampil(): boolean {
	return tampil;
}

/** Balik keadaan dan simpan. localStorage yang diblokir diabaikan (state tetap hidup sesi ini). */
export function alihkan(): void {
	tampil = !tampil;
	try {
		localStorage.setItem(KUNCI, tampil ? '1' : '0');
	} catch {
		// privat mode dsb. — abaikan
	}
}

/** Panggil sekali dari onMount layout: terapkan pilihan yang tersimpan. */
export function muat(): void {
	try {
		tampil = localStorage.getItem(KUNCI) === '1';
	} catch {
		// abaikan — tetap tersembunyi
	}
}

/** `rupiah(n)` bila tampil, `Rp ******` bila tersembunyi. */
export function lihatAngka(n: number): string {
	return tampil ? rupiah(n) : 'Rp ******';
}
