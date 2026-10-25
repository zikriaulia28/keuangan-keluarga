<script lang="ts">
	import { api, rupiah } from '$lib/api';
	import RupiahInput from '$lib/components/RupiahInput.svelte';

	let { data } = $props();
	interface Transaksi {
		id: number;
		tanggal: string;
		tipe: 'masuk' | 'keluar';
		jumlah: number;
		catatan: string | null;
		id_dompet: number;
		id_kategori: number | null;
		dompet: string;
		kategori: string;
		pencatat: string;
	}
	interface Dompet {
		id_dompet: number;
		nama_dompet: string;
		saldo: number;
	}
	interface Kategori {
		id: number;
		nama: string;
		tipe: string;
	}
	interface Ringkasan {
		bulan: string;
		masuk: number;
		keluar: number;
		sisa: number;
	}

	function hariIni() {
		const d = new Date();
		return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
	}

	function formatTanggal(t: string) {
		const d = new Date(t);
		if (Number.isNaN(d.getTime())) return t;
		return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
	}

	// Bentuk pendek untuk ringkasan filter, mis. "1 Sep".
	function formatTanggalPendek(t: string) {
		const d = new Date(`${t}T00:00:00`);
		if (Number.isNaN(d.getTime())) return t;
		return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
	}

	// Form tambah
	let tanggal = $state(hariIni());
	let tipe = $state<'masuk' | 'keluar'>('keluar');
	let id_dompet = $state<number | null>(data.dompet[0]?.id_dompet ?? null);
	let id_kategori = $state<number | null>(null);
	let jumlah = $state<number | null>(null);
	let catatan = $state('');
	let galatForm = $state('');
	let menyimpan = $state(false);

	// Filter daftar
	let dari = $state('');
	let sampai = $state('');
	let filterTipe = $state('');
	let cari = $state('');
	// Panel pencarian disembunyikan dulu: daftar transaksi adalah isi utama halaman
	// ini, dan panel yang selalu terbuka mendorong daftar ke bawah lipatan.
	// Halaman ini selalu memuat daftar tanpa filter, jadi kondisi awal selalu tertutup.
	let filterBuka = $state(false);

	let daftar = $state<Transaksi[]>(data.daftar);
	let dompet = $state<Dompet[]>(data.dompet);
	let kategoriMasuk = $state<Kategori[]>(data.kategoriMasuk);
	let kategoriKeluar = $state<Kategori[]>(data.kategoriKeluar);
	let statMasuk = $state(data.statMasuk);
	let statKeluar = $state(data.statKeluar);
	let memuat = $state(false);
	let adaLagi = $state(data.daftar.length === 100);
	let galat = $state('');
	let galatHapus = $state('');
	let hapusId = $state<number | null>(null);
	let menghapus = $state(false);
	let editId = $state<number | null>(null);

	const kategoriAktif = $derived(tipe === 'masuk' ? kategoriMasuk : kategoriKeluar);
	const totalSaldo = $derived(dompet.reduce((s, d) => s + d.saldo, 0));
	const dompetAktif = $derived(dompet.find((d) => d.id_dompet === id_dompet) ?? null);
	const transaksiAwal = $derived(editId === null ? null : (daftar.find((t) => t.id === editId) ?? null));

	// Ringkasan filter untuk panel yang tertutup, supaya pengguna tidak lupa
	// bahwa daftar sedang tersaring.
	const filterDipakai = $derived(
		[dari, sampai, filterTipe, cari.trim()].filter((x) => x !== '').length
	);
	const ringkasFilter = $derived.by(() => {
		const bagian: string[] = [];
		if (dari || sampai) {
			bagian.push(`${dari ? formatTanggalPendek(dari) : 'awal'} – ${sampai ? formatTanggalPendek(sampai) : 'akhir'}`);
		}
		if (filterTipe) bagian.push(filterTipe === 'masuk' ? 'Masuk saja' : 'Keluar saja');
		if (cari.trim()) bagian.push(`"${cari.trim()}"`);
		return bagian.join(' · ');
	});
	// Saldo tampilan sudah termasuk baris lama, jadi keluarkan dulu efeknya sebelum menilai nilai baru.
	const saldoKurang = $derived.by(() => {
		if (jumlah === null || jumlah <= 0 || !dompetAktif || !id_dompet) return false;
		const efekBaru = tipe === 'masuk' ? jumlah : -jumlah;
		let saldoBaru = dompetAktif.saldo + efekBaru;
		if (transaksiAwal && transaksiAwal.id_dompet === id_dompet) {
			saldoBaru -= transaksiAwal.tipe === 'masuk' ? transaksiAwal.jumlah : -transaksiAwal.jumlah;
		}
		if (saldoBaru < 0) return true;
		if (transaksiAwal && transaksiAwal.id_dompet !== id_dompet) {
			const asal = dompet.find((d) => d.id_dompet === transaksiAwal.id_dompet);
			if (asal && asal.saldo - (transaksiAwal.tipe === 'masuk' ? transaksiAwal.jumlah : -transaksiAwal.jumlah) < 0)
				return true;
		}
		return false;
	});
	function pesan(e: unknown, baku: string) {
		return e instanceof Error ? e.message : baku;
	}

	function catatBaru() {
		document.getElementById('form-transaksi')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
	}

	async function muatStat() {
		try {
			const r = await api<Ringkasan>(`/api/ringkasan?bulan=${encodeURIComponent(hariIni().slice(0, 7))}`);
			statMasuk = r.masuk;
			statKeluar = r.keluar;
		} catch {
			// statistik boleh kosong bila ringkasan gagal dimuat
		}
	}

	async function muatDaftar(tambah = false) {
		const q = new URLSearchParams();
		if (dari) q.set('from', dari);
		if (sampai) q.set('to', sampai);
		if (filterTipe) q.set('tipe', filterTipe);
		if (cari.trim()) q.set('q', cari.trim());
		q.set('limit', '100');
		if (tambah && daftar.length > 0) {
			const akhir = daftar[daftar.length - 1];
			q.set('cursor', `${akhir.tanggal.slice(0, 10)}:${akhir.id}`);
		}
		const halaman = await api<Transaksi[]>(`/api/transaksi?${q.toString()}`);
		daftar = tambah ? [...daftar, ...halaman] : halaman;
		adaLagi = halaman.length === 100;
	}

	async function terapkanFilter(tambah = false) {
		galat = '';
		memuat = true;
		try {
			await muatDaftar(tambah);
		} catch (e) {
			galat = pesan(e, 'Gagal memuat transaksi.');
		} finally {
			memuat = false;
		}
	}

	async function bersihkanFilter() {
		dari = '';
		sampai = '';
		filterTipe = '';
		cari = '';
		await terapkanFilter();
	}

	function gantiTipe(t: 'masuk' | 'keluar') {
		tipe = t;
		id_kategori = null;
	}

	function mulaiUbah(t: Transaksi) {
		hapusId = null;
		galatForm = '';
		galatHapus = '';
		editId = t.id;
		tanggal = t.tanggal.slice(0, 10);
		tipe = t.tipe;
		id_dompet = t.id_dompet;
		id_kategori = t.id_kategori;
		jumlah = t.jumlah;
		catatan = t.catatan ?? '';
		document.getElementById('form-transaksi')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
	}

	function batalUbah() {
		editId = null;
		galatForm = '';
		tanggal = hariIni();
		tipe = 'keluar';
		id_kategori = null;
		jumlah = null;
		catatan = '';
	}

	async function simpan(e: SubmitEvent) {
		e.preventDefault();
		galatForm = '';
		if (!jumlah || jumlah <= 0) {
			galatForm = 'Jumlah harus lebih dari 0.';
			return;
		}
		if (!id_dompet) {
			galatForm = 'Pilih dompet.';
			return;
		}
		if (!id_kategori) {
			galatForm = 'Pilih kategori.';
			return;
		}
		menyimpan = true;
		try {
			const payload = JSON.stringify({
				tanggal,
				tipe,
				id_dompet,
				id_kategori,
				jumlah,
				catatan: catatan.trim() ? catatan.trim() : null
			});
			if (editId === null) {
				await api('/api/transaksi', { method: 'POST', body: payload });
			} else {
				await api(`/api/transaksi/${editId}`, { method: 'PATCH', body: payload });
			}
			batalUbah();
			const [d] = await Promise.all([api<Dompet[]>('/api/dompet'), muatDaftar(), muatStat()]);
			dompet = d;
		} catch (e) {
			galatForm = pesan(e, editId === null ? 'Gagal menambah transaksi.' : 'Gagal menyimpan perubahan.');
		} finally {
			menyimpan = false;
		}
	}

	async function hapus(id: number) {
		galatHapus = '';
		menghapus = true;
		try {
			await api(`/api/transaksi/${id}`, { method: 'DELETE' });
			hapusId = null;
			if (id === editId) batalUbah();
			const [d] = await Promise.all([api<Dompet[]>('/api/dompet'), muatDaftar(), muatStat()]);
			dompet = d;
		} catch (e) {
			galatHapus = pesan(e, 'Gagal menghapus transaksi.');
		} finally {
			menghapus = false;
		}
	}
</script>

<div class="mx-auto w-full max-w-2xl md:max-w-4xl">
	<!-- Kepala halaman: satu jalan masuk ke form, bukan tombol utama. -->
	<div class="flex items-center justify-between gap-3">
		<div class="min-w-0">
			<h1 class="text-[19px] font-extrabold tracking-tight">Transaksi</h1>
			<p class="mt-0.5 truncate text-[13px] text-ink-3">Masuk dan keluar kas keluarga.</p>
		</div>
		<button
			type="button"
			onclick={catatBaru}
			class="btn btn-ghost !min-h-11 shrink-0 !px-3 text-[13px]"
		>
			Catat transaksi
		</button>
	</div>

	<!-- Saldo gabungan seluruh dompet. -->
	<section class="card mt-4 p-5 md:p-6">
		<div class="flex items-baseline justify-between gap-3">
			<p class="label">Total Saldo Dompet</p>
			{#if totalSaldo < 0}
				<span class="chip chip-alert">Saldo minus</span>
			{/if}
		</div>
		<div class="figure mt-1.5 text-[clamp(2.25rem,10vw,3.25rem)] {totalSaldo < 0 ? 'text-alert' : ''}">
			{rupiah(totalSaldo)}
		</div>
		<p class="mt-1.5 text-[12px] text-ink-3">{dompet.length} dompet</p>
	</section>

	<!-- Dua angka bulan ini. Kata Masuk dan Keluar sudah tertulis pada label,
	     dan warnanya mengikuti arah dana: hijau untuk masuk, merah untuk keluar. -->
	<section class="mt-3 grid grid-cols-2 gap-3">
		<div class="card p-4">
			<p class="label">Masuk bulan ini</p>
			<p class="money mt-1 text-[19px] font-extrabold text-accent-ink">{rupiah(statMasuk)}</p>
		</div>
		<div class="card p-4">
			<p class="label">Keluar bulan ini</p>
			<p class="money mt-1 text-[19px] font-extrabold text-alert">{rupiah(statKeluar)}</p>
		</div>
	</section>

	<!-- Form. Satu kartu putih, isi turun ke bawah. -->
	<section id="form-transaksi" class="mt-8 scroll-mt-20">
		<div class="flex items-center justify-between gap-3">
			<h2 class="head">{editId === null ? 'Catat transaksi' : 'Ubah transaksi'}</h2>
			{#if editId !== null}
				<span class="chip chip-accent shrink-0">Sedang diubah</span>
			{/if}
		</div>

		<form onsubmit={simpan} class="card mt-3 flex flex-col gap-4 p-4 md:p-5">
			{#if dompet.length === 0}
				<p class="notice notice-quiet">
					Belum ada dompet. Tambahkan dompet terlebih dahulu sebelum mencatat transaksi.
				</p>
			{/if}

			<!-- Tipe transaksi: dua kata, aktif filled hijau. -->
			<div class="grid grid-cols-2 gap-2" role="group" aria-label="Tipe transaksi">
				<button
					type="button"
					onclick={() => gantiTipe('keluar')}
					aria-pressed={tipe === 'keluar'}
					class="btn !px-2 text-sm {tipe === 'keluar' ? 'btn-primary' : ''}"
				>
					Keluar
				</button>
				<button
					type="button"
					onclick={() => gantiTipe('masuk')}
					aria-pressed={tipe === 'masuk'}
					class="btn !px-2 text-sm {tipe === 'masuk' ? 'btn-primary' : ''}"
				>
					Masuk
				</button>
			</div>

			<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
				<div>
					<label for="trx-tanggal" class="label block">Tanggal</label>
					<input id="trx-tanggal" type="date" bind:value={tanggal} required class="input mt-1.5" />
				</div>
				<div>
					<label for="trx-dompet" class="label block">Dompet</label>
					<select id="trx-dompet" bind:value={id_dompet} required class="input mt-1.5">
						<option value={null} disabled>Pilih dompet</option>
						{#each dompet as d (d.id_dompet)}
							<option value={d.id_dompet}>{d.nama_dompet} · {rupiah(d.saldo)}</option>
						{/each}
					</select>
					{#if dompetAktif}
						<div class="mt-1.5 flex items-center justify-between gap-3">
							<span class="label">Saldo dompet ini</span>
							<span class="flex items-center gap-2">
								{#if dompetAktif.saldo < 0}
									<span class="chip chip-alert">Minus</span>
								{/if}
								<span class="money text-sm font-bold {dompetAktif.saldo < 0 ? 'text-alert' : ''}">
									{rupiah(dompetAktif.saldo)}
								</span>
							</span>
						</div>
					{/if}
				</div>
			</div>

			<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
				<div>
					<label for="trx-kategori" class="label block">Kategori</label>
					<select id="trx-kategori" bind:value={id_kategori} required class="input mt-1.5">
						<option value={null} disabled>Pilih kategori</option>
						{#each kategoriAktif as k (k.id)}
							<option value={k.id}>{k.nama}</option>
						{/each}
					</select>
					{#if kategoriAktif.length === 0}
						<p class="label mt-1.5">Belum ada kategori untuk tipe ini.</p>
					{/if}
				</div>
				<div>
					<label for="trx-jumlah" class="label block">Jumlah (Rp)</label>
					<div class="relative mt-1.5">
						<span
							class="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-sm font-semibold text-ink-3"
							aria-hidden="true"
						>
							Rp
						</span>
						<RupiahInput
							id="trx-jumlah"
							bind:value={jumlah}
							placeholder="Contoh: 150.000"
							required
							class="input money !pl-9"
						/>
					</div>
					<!-- Peringatan saldo: kata yang jelas, menempel pada nominal. -->
					{#if saldoKurang}
						<div class="notice notice-alert mt-2" role="alert">
							<p class="font-bold">Saldo dompet tidak mencukupi</p>
							<p class="mt-0.5">
								Saldo dompet akan menjadi minus setelah transaksi ini disimpan.
							</p>
						</div>
					{/if}
				</div>
			</div>

			<div>
				<label for="trx-catatan" class="label block">Catatan (opsional)</label>
				<input
					id="trx-catatan"
					bind:value={catatan}
					placeholder="Misal: Belanja sayur di pasar"
					maxlength="200"
					class="input mt-1.5"
				/>
			</div>

			{#if galatForm}
				<p class="notice notice-alert" role="alert">{galatForm}</p>
			{/if}

			<!-- Aksi utama di ujung form, bukan di tepi atas halaman. -->
			<div class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
				{#if editId !== null}
					<button type="button" onclick={batalUbah} disabled={menyimpan} class="btn btn-ghost !min-h-11 w-full sm:w-auto">
						Batal
					</button>
				{/if}
				<button type="submit" disabled={menyimpan} class="btn btn-primary !min-h-11 w-full sm:w-auto">
					{menyimpan ? 'Menyimpan…' : editId === null ? 'Simpan transaksi' : 'Simpan perubahan'}
				</button>
			</div>
		</form>
	</section>

	<!-- Riwayat: penyaring di kartu, lalu daftar di kartu lain. -->
	<section class="mt-8">
		<div class="flex items-center justify-between gap-3">
			<h2 class="head">Daftar transaksi</h2>
			<span class="chip chip-quiet shrink-0">{daftar.length} transaksi</span>
		</div>

		<div class="card mt-3 overflow-hidden">
			{#if filterBuka}
				<div class="flex items-center justify-between gap-3 border-b border-line px-4 pt-3 md:px-5">
					<h2 class="head">Cari &amp; filter</h2>
					<button
						type="button"
						onclick={() => (filterBuka = false)}
						class="btn btn-ghost !min-h-11 shrink-0 !px-3 text-[13px]"
					>
						Sembunyikan
					</button>
				</div>

				<div class="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 md:grid-cols-4 md:p-5">
					<div>
						<label for="trx-dari" class="label block">Dari</label>
						<input id="trx-dari" type="date" bind:value={dari} class="input mt-1.5" />
					</div>
					<div>
						<label for="trx-sampai" class="label block">Sampai</label>
						<input id="trx-sampai" type="date" bind:value={sampai} class="input mt-1.5" />
					</div>
					<div>
						<label for="trx-filter-tipe" class="label block">Tipe</label>
						<select id="trx-filter-tipe" bind:value={filterTipe} class="input mt-1.5">
							<option value="">Semua tipe</option>
							<option value="masuk">Masuk saja</option>
							<option value="keluar">Keluar saja</option>
						</select>
					</div>
					<div>
						<label for="trx-cari" class="label block">Cari</label>
						<input
							id="trx-cari"
							type="search"
							bind:value={cari}
							placeholder="Catatan, kategori, nominal"
							onkeydown={(e) => {
								if (e.key === 'Enter') {
									e.preventDefault();
									terapkanFilter();
								}
							}}
							class="input mt-1.5"
						/>
					</div>
				</div>

				<div class="flex flex-wrap items-center gap-2 px-4 pb-4 md:px-5 md:pb-5">
					<button
						type="button"
						onclick={() => terapkanFilter()}
						disabled={memuat}
						class="btn btn-primary w-full sm:w-auto"
					>
						{memuat ? 'Memproses…' : 'Terapkan'}
					</button>
					{#if filterDipakai > 0}
						<button
							type="button"
							onclick={bersihkanFilter}
							disabled={memuat}
							class="btn btn-ghost w-full sm:w-auto"
						>
							Bersihkan
						</button>
					{/if}
				</div>
			{:else}
				<button
					type="button"
					onclick={() => (filterBuka = true)}
					aria-expanded="false"
					class="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-sunk md:px-5"
				>
					<span class="min-w-0 flex-1">
						<span class="block text-[15px] font-bold">Cari &amp; filter</span>
						{#if filterDipakai > 0}
							<span class="mt-0.5 block truncate text-[13px] text-ink-2">
								{ringkasFilter} · {daftar.length} transaksi
							</span>
						{:else}
							<span class="mt-0.5 block text-[13px] text-ink-2">
								Menampilkan {daftar.length} transaksi terbaru
							</span>
						{/if}
					</span>
					{#if filterDipakai > 0}
						<span class="chip chip-accent shrink-0">{filterDipakai} aktif</span>
					{/if}
					<span class="shrink-0 text-lg leading-none text-ink-3" aria-hidden="true">&#8250;</span>
				</button>
			{/if}
		</div>

		{#if galat}
			<div class="notice notice-alert mt-4 flex items-center justify-between gap-3" role="alert">
				<span>{galat}</span>
				<button
					type="button"
					onclick={() => terapkanFilter()}
					disabled={memuat}
					class="btn btn-ghost !min-h-11 shrink-0 !px-3 text-[13px]"
				>
					Coba lagi
				</button>
			</div>
		{/if}

		{#if galatHapus}
			<p class="notice notice-alert mt-4" role="alert">{galatHapus}</p>
		{/if}

		{#if memuat && daftar.length === 0}
			<div class="card mt-4 p-5" role="status">
				<p class="label">Memuat transaksi…</p>
				<div class="mt-3 flex flex-col gap-3" aria-hidden="true">
					<div class="h-3 w-2/3 animate-pulse rounded-full bg-sunk"></div>
					<div class="h-3 w-1/2 animate-pulse rounded-full bg-sunk"></div>
					<div class="h-3 w-3/5 animate-pulse rounded-full bg-sunk"></div>
				</div>
			</div>
		{:else if daftar.length === 0}
			<div class="card mt-4 p-5">
				<p class="text-[15px] font-bold">Belum ada transaksi</p>
				<p class="mt-1.5 text-sm leading-relaxed text-ink-2">
					Belum ada transaksi yang cocok dengan filter. Ubah rentang tanggal atau tipe, lalu tekan Terapkan.
				</p>
				<button type="button" onclick={catatBaru} class="btn btn-primary mt-4 w-full sm:w-auto">
					Catat transaksi
				</button>
			</div>
		{:else}
			<div class="card rows mt-4 px-4 md:px-5">
				{#each daftar as t (t.id)}
					<div class="row flex-col !items-stretch !gap-2">
						<div class="flex w-full items-start gap-3">
							<div class="min-w-0 flex-1">
								<p class="truncate text-sm font-semibold">{t.kategori}</p>
								<p class="mt-0.5 text-[12px] text-ink-3">
									{formatTanggal(t.tanggal)} · {t.dompet} · {t.pencatat}
								</p>
								{#if t.catatan}
									<p class="mt-1 truncate text-[12px] leading-relaxed text-ink-2" title={t.catatan}>
										{t.catatan}
									</p>
								{/if}
							</div>
							<span class="amount flex shrink-0 flex-col items-end gap-1">
								<span class="money text-sm font-bold {t.tipe === 'masuk' ? 'text-accent-ink' : 'text-alert'}">
									{rupiah(t.jumlah)}
								</span>
								<span class="chip {t.tipe === 'masuk' ? 'chip-accent' : 'chip-quiet'}">
									{t.tipe === 'masuk' ? 'Masuk' : 'Keluar'}
								</span>
							</span>
						</div>

						<!-- Aksi baris: ubah, dan hapus dua ketukan. -->
						<div class="flex flex-wrap items-center gap-1.5">
							{#if editId === t.id}
								<span class="chip chip-accent">Sedang diubah</span>
							{/if}
							<button
								type="button"
								onclick={() => mulaiUbah(t)}
								aria-label="Ubah transaksi {t.kategori} {rupiah(t.jumlah)}"
								class="btn btn-ghost !min-h-11 !px-3 text-[13px]"
							>
								Ubah
							</button>
							{#if hapusId === t.id}
								<span class="text-[13px] text-ink-2">Hapus transaksi ini?</span>
								<button
									type="button"
									disabled={menghapus}
									onclick={() => hapus(t.id)}
									class="btn btn-danger !min-h-11 !px-3 text-[13px]"
								>
									{menghapus ? 'Menghapus…' : 'Ya, hapus'}
								</button>
								<button
									type="button"
									disabled={menghapus}
									onclick={() => (hapusId = null)}
									class="btn btn-ghost !min-h-11 !px-3 text-[13px]"
								>
									Batal
								</button>
							{:else}
								<button
									type="button"
									onclick={() => (hapusId = t.id)}
									aria-label="Hapus transaksi {t.kategori} {rupiah(t.jumlah)}"
									class="btn btn-ghost !min-h-11 !px-3 text-[13px]"
								>
									Hapus
								</button>
							{/if}
						</div>
					</div>
				{/each}
			</div>

			{#if adaLagi}
				<button
					type="button"
					onclick={() => terapkanFilter(true)}
					disabled={memuat}
					class="btn mt-3 w-full"
				>
					{memuat ? 'Memuat…' : 'Muat lebih banyak'}
				</button>
			{/if}
		{/if}
	</section>
</div>
