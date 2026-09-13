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

	let daftar = $state<Transaksi[]>(data.daftar);
	let dompet = $state<Dompet[]>(data.dompet);
	let kategoriMasuk = $state<Kategori[]>(data.kategoriMasuk);
	let kategoriKeluar = $state<Kategori[]>(data.kategoriKeluar);
	let statMasuk = $state(data.statMasuk);
	let statKeluar = $state(data.statKeluar);
	let memuat = $state(false);
	let galat = $state('');
	let galatHapus = $state('');
	let hapusId = $state<number | null>(null);
	let menghapus = $state(false);
	let editId = $state<number | null>(null);

	const kategoriAktif = $derived(tipe === 'masuk' ? kategoriMasuk : kategoriKeluar);
	const totalSaldo = $derived(dompet.reduce((s, d) => s + d.saldo, 0));
	const dompetAktif = $derived(dompet.find((d) => d.id_dompet === id_dompet) ?? null);
	const transaksiAwal = $derived(editId === null ? null : (daftar.find((t) => t.id === editId) ?? null));
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

	async function muatDaftar() {
		const q = new URLSearchParams();
		if (dari) q.set('from', dari);
		if (sampai) q.set('to', sampai);
		if (filterTipe) q.set('tipe', filterTipe);
		if (cari.trim()) q.set('q', cari.trim());
		q.set('limit', '100');
		daftar = await api<Transaksi[]>(`/api/transaksi?${q.toString()}`);
	}

	async function terapkanFilter() {
		galat = '';
		try {
			await muatDaftar();
		} catch (e) {
			galat = pesan(e, 'Gagal memuat transaksi.');
		}
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

<div class="flex flex-col gap-4 md:gap-6">
	<div class="mb-1 flex items-center justify-between">
		<div>
			<h1 class="text-2xl font-bold text-on-surface">Pencatatan & Riwayat Kas</h1>
			<p class="mt-0.5 text-sm text-on-variant">Kelola arus kas keluar masuk keluarga dengan transparan</p>
		</div>
		<button
			type="button"
			onclick={catatBaru}
			class="flex items-center gap-1 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-on-primary shadow-md transition hover:opacity-95 active:scale-95"
		>
			<span class="material-symbols-outlined text-xl">add_circle</span>
			<span class="hidden sm:inline">Catat Baru</span>
		</button>
	</div>

	<div class="grid grid-cols-1 gap-3 sm:grid-cols-3 md:gap-4">
		<div
			class="flex items-center gap-3 rounded-xl bg-lowest p-4 shadow-[0_4px_20px_-2px_rgba(37,99,235,0.08)]"
		>
			<div
				class="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary-bright/10 text-primary"
			>
				<span class="material-symbols-outlined text-2xl">account_balance_wallet</span>
			</div>
			<div class="min-w-0">
				<span class="block text-xs text-on-variant">Total Saldo Dompet</span>
				<strong class="block truncate text-lg font-semibold">{rupiah(totalSaldo)}</strong>
			</div>
		</div>
		<div
			class="flex items-center gap-3 rounded-xl bg-lowest p-4 shadow-[0_4px_20px_-2px_rgba(37,99,235,0.08)]"
		>
			<div
				class="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-income-soft text-income-deep"
			>
				<span class="material-symbols-outlined text-2xl">arrow_downward</span>
			</div>
			<div class="min-w-0">
				<span class="block text-xs text-on-variant">Total Masuk (Bulan Ini)</span>
				<strong class="block truncate text-lg font-semibold text-income">{rupiah(statMasuk)}</strong>
			</div>
		</div>
		<div
			class="flex items-center gap-3 rounded-xl bg-lowest p-4 shadow-[0_4px_20px_-2px_rgba(37,99,235,0.08)]"
		>
			<div
				class="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-expense-soft text-expense-deep"
			>
				<span class="material-symbols-outlined text-2xl">arrow_upward</span>
			</div>
			<div class="min-w-0">
				<span class="block text-xs text-on-variant">Total Keluar (Bulan Ini)</span>
				<strong class="block truncate text-lg font-semibold text-error">{rupiah(statKeluar)}</strong>
			</div>
		</div>
	</div>

	<section
		id="form-transaksi"
		class="scroll-mt-20 rounded-2xl bg-lowest p-4 shadow-[0_4px_20px_-2px_rgba(37,99,235,0.08)] md:p-6"
	>
		<div class="mb-4 flex items-center justify-between">
			<div class="flex items-center gap-2">
				<div
					class="flex h-8 w-8 items-center justify-center rounded-full bg-primary-bright/10 text-primary"
				>
					<span class="material-symbols-outlined text-lg">edit_note</span>
				</div>
				<h2 class="text-lg font-semibold">{editId === null ? 'Form Pencatatan Transaksi' : 'Ubah Transaksi'}</h2>
			</div>
			<span class="rounded-full bg-primary-bright/10 px-2.5 py-1 text-xs font-medium text-primary">
				{editId === null ? 'Real-time Validation' : 'Mode Ubah'}
			</span>
		</div>
		<form onsubmit={simpan} class="flex flex-col gap-4">
			<div class="flex gap-1 rounded-xl bg-surface-container p-1" role="group" aria-label="Tipe transaksi">
				<button
					type="button"
					onclick={() => gantiTipe('keluar')}
					class="flex flex-1 items-center justify-center gap-1 rounded-lg py-2 text-sm font-semibold transition {tipe ===
					'keluar'
						? 'bg-expense text-on-primary shadow-sm'
						: 'text-on-variant'}"
				>
					<span class="material-symbols-outlined text-lg">remove</span>
					<span>Pengeluaran (Keluar)</span>
				</button>
				<button
					type="button"
					onclick={() => gantiTipe('masuk')}
					class="flex flex-1 items-center justify-center gap-1 rounded-lg py-2 text-sm font-semibold transition {tipe ===
					'masuk'
						? 'bg-income text-on-primary shadow-sm'
						: 'text-on-variant'}"
				>
					<span class="material-symbols-outlined text-lg">add</span>
					<span>Pemasukan (Masuk)</span>
				</button>
			</div>
			<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
				<div>
					<label for="trx-tanggal" class="mb-1 block text-sm font-medium text-on-variant">
						Tanggal Transaksi
					</label>
					<input
						id="trx-tanggal"
						type="date"
						bind:value={tanggal}
						required
						class="w-full rounded-xl bg-surface-low px-4 py-2.5 text-on-surface outline-none transition focus:ring-2 focus:ring-primary"
					/>
				</div>
				<div>
					<label for="trx-dompet" class="mb-1 block text-sm font-medium text-on-variant">
						Pilih Dompet / Akun
					</label>
					<select
						id="trx-dompet"
						bind:value={id_dompet}
						required
						class="w-full rounded-xl bg-surface-low px-4 py-2.5 text-on-surface outline-none transition focus:ring-2 focus:ring-primary"
					>
						<option value={null} disabled>Pilih dompet</option>
						{#each dompet as d (d.id_dompet)}
							<option value={d.id_dompet}>{d.nama_dompet} (Saldo: {rupiah(d.saldo)})</option>
						{/each}
					</select>
					{#if dompetAktif}
						<p class="mt-1 text-xs text-on-variant">
							Saldo tersedia: <span class="font-medium text-on-surface">{rupiah(dompetAktif.saldo)}</span>
						</p>
					{/if}
				</div>
			</div>
			<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
				<div>
					<label for="trx-kategori" class="mb-1 block text-sm font-medium text-on-variant">
						Kategori
					</label>
					<select
						id="trx-kategori"
						bind:value={id_kategori}
						required
						class="w-full rounded-xl bg-surface-low px-4 py-2.5 text-on-surface outline-none transition focus:ring-2 focus:ring-primary"
					>
						<option value={null} disabled>Pilih kategori</option>
						{#each kategoriAktif as k (k.id)}
							<option value={k.id}>{k.nama}</option>
						{/each}
					</select>
				</div>
				<div>
					<label for="trx-jumlah" class="mb-1 block text-sm font-medium text-on-variant">
						Jumlah (Rp)
					</label>
					<div class="relative flex items-center">
						<span class="absolute left-4 font-medium text-on-variant">Rp</span>
						<RupiahInput
							id="trx-jumlah"
							bind:value={jumlah}
							placeholder="Contoh: 150.000"
							required
							class="w-full rounded-xl bg-surface-low py-2.5 pr-4 pl-11 text-on-surface outline-none transition focus:ring-2 focus:ring-primary"
						/>
					</div>
					{#if saldoKurang}
						<p class="mt-1 flex items-center gap-1 text-xs font-medium text-error">
							<span class="material-symbols-outlined text-base">error</span>
							<span>Saldo dompet tidak mencukupi untuk transaksi ini!</span>
						</p>
					{/if}
				</div>
			</div>
			<div>
				<label for="trx-catatan" class="mb-1 block text-sm font-medium text-on-variant">
					Catatan Tambahan (Opsional)
				</label>
				<input
					id="trx-catatan"
					bind:value={catatan}
					placeholder="Misal: Belanja sayur segar di pasar tradisional"
					maxlength="200"
					class="w-full rounded-xl bg-surface-low px-4 py-2.5 text-on-surface outline-none transition focus:ring-2 focus:ring-primary"
				/>
			</div>
			{#if galatForm}
				<p role="alert" class="flex items-center gap-1.5 text-sm font-medium text-error">
					<span class="material-symbols-outlined text-base">error</span>
					{galatForm}
				</p>
			{/if}
			<div class="flex justify-end gap-2 pt-1">
				{#if editId !== null}
					<button
						type="button"
						onclick={batalUbah}
						disabled={menyimpan}
						class="flex w-full items-center justify-center gap-2 rounded-xl bg-surface-container px-6 py-3 text-sm font-medium transition hover:bg-surface-high disabled:opacity-60 md:w-auto"
					>
						<span class="material-symbols-outlined text-xl">close</span>
						<span>Batal</span>
					</button>
				{/if}
				<button
					type="submit"
					disabled={menyimpan}
					class="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-medium text-on-primary shadow-md transition hover:opacity-95 active:scale-95 disabled:opacity-60 md:w-auto"
				>
					<span class="material-symbols-outlined text-xl">save</span>
					<span>
						{menyimpan ? 'Menyimpan…' : editId === null ? 'Simpan Transaksi' : 'Simpan Perubahan'}
					</span>
				</button>
			</div>
		</form>
	</section>

	<section class="rounded-2xl bg-lowest p-4 shadow-[0_4px_20px_-2px_rgba(37,99,235,0.08)] md:p-6">
		<div class="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
			<div class="flex items-center gap-2">
				<div
					class="flex h-8 w-8 items-center justify-center rounded-full bg-income-soft text-income-deep"
				>
					<span class="material-symbols-outlined text-lg">filter_list</span>
				</div>
				<h2 class="text-lg font-semibold">Daftar Transaksi</h2>
			</div>
			<div class="flex flex-wrap items-center gap-2">
				<label class="flex items-center gap-1.5 rounded-xl bg-surface-low px-3 py-1.5 text-xs">
					<span class="text-on-variant">Dari:</span>
					<input type="date" bind:value={dari} class="bg-transparent text-on-surface outline-none" />
				</label>
				<label class="flex items-center gap-1.5 rounded-xl bg-surface-low px-3 py-1.5 text-xs">
					<span class="text-on-variant">Sampai:</span>
					<input type="date" bind:value={sampai} class="bg-transparent text-on-surface outline-none" />
				</label>
				<select
					bind:value={filterTipe}
					aria-label="Filter tipe"
					class="rounded-xl bg-surface-low px-4 py-1.5 text-sm text-on-surface outline-none"
				>
					<option value="">Semua Tipe</option>
					<option value="masuk">Masuk Saja</option>
					<option value="keluar">Keluar Saja</option>
				</select>
				<button
					type="button"
					onclick={terapkanFilter}
					class="rounded-xl bg-primary px-4 py-1.5 text-sm font-medium text-on-primary transition hover:opacity-95"
				>
					Terapkan
				</button>
			</div>
		</div>

		{#if galat}
			<p role="alert" class="py-2 text-sm font-medium text-error">{galat}</p>
		{:else if memuat}
			<p class="py-2 text-sm text-on-variant">Memuat transaksi…</p>
		{:else if daftar.length === 0}
			<div class="py-12 text-center">
				<div
					class="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-surface-container text-on-variant"
				>
					<span class="material-symbols-outlined text-4xl">receipt_long</span>
				</div>
				<h3 class="text-lg font-semibold">Tidak ada transaksi ditemukan</h3>
				<p class="mt-1 text-sm text-on-variant">Coba ubah rentang tanggal atau filter tipe transaksi Anda.</p>
			</div>
		{:else}
			{#if galatHapus}
				<p role="alert" class="mb-2 text-sm font-medium text-error">{galatHapus}</p>
			{/if}
			<div class="flex flex-col gap-3">
				{#each daftar as t (t.id)}
					<div
						class="flex flex-col gap-3 rounded-xl bg-surface-low p-3 transition hover:bg-surface-container sm:flex-row sm:items-center sm:justify-between"
					>
						<div class="flex items-center gap-3">
							<div
								class="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl {t.tipe ===
								'masuk'
									? 'bg-income-soft text-income-deep'
									: 'bg-expense-soft text-expense-deep'}"
							>
								<span class="material-symbols-outlined text-2xl">
									{t.tipe === 'masuk' ? 'arrow_downward' : 'arrow_upward'}
								</span>
							</div>
							<div class="min-w-0">
			<div class="flex flex-wrap items-center gap-2">
				<label class="flex items-center gap-1.5 rounded-xl bg-surface-low px-3 py-1.5 text-xs">
					<span class="material-symbols-outlined text-base text-on-variant">search</span>
					<input
						type="search"
						bind:value={cari}
						placeholder="Cari catatan, kategori, nominal…"
						aria-label="Cari transaksi"
						onkeydown={(e) => {
							if (e.key === 'Enter') {
								e.preventDefault();
								terapkanFilter();
							}
						}}
						class="w-44 bg-transparent text-sm text-on-surface outline-none placeholder:text-on-variant"
					/>
				</label>
									<strong class="text-base">{t.kategori}</strong>
									<span
										class="rounded-full px-2 py-0.5 text-xs font-medium {t.tipe === 'masuk'
											? 'bg-income-soft/50 text-income'
											: 'bg-expense-soft/50 text-error'}"
									>
										{t.tipe === 'masuk' ? 'Masuk' : 'Keluar'}
									</span>
								</div>
								<p class="mt-0.5 text-xs text-on-variant">
									{t.dompet} • {formatTanggal(t.tanggal)} • {t.pencatat}
								</p>
								{#if t.catatan}
									<p class="mt-0.5 truncate text-xs text-on-variant">{t.catatan}</p>
								{/if}
							</div>
						</div>
						<div class="flex items-center justify-between gap-4 sm:w-auto sm:justify-end">
							<strong class="text-base {t.tipe === 'masuk' ? 'text-income' : 'text-error'}">
								{t.tipe === 'masuk' ? '+' : '−'}{rupiah(t.jumlah)}
							</strong>
							<div class="relative">
								{#if hapusId === t.id}
									<div
										class="flex items-center gap-2 rounded-xl border border-surface-container bg-lowest p-2 shadow-xl"
									>
										<span class="text-xs font-medium">Hapus item?</span>
										<button
											type="button"
											disabled={menghapus}
											onclick={() => hapus(t.id)}
											class="rounded-lg bg-error px-2.5 py-1 text-xs font-medium text-on-primary disabled:opacity-60"
										>
											{menghapus ? 'Menghapus…' : 'Ya'}
										</button>
										<button
											type="button"
											disabled={menghapus}
											onclick={() => (hapusId = null)}
											class="rounded-lg bg-surface-container px-2.5 py-1 text-xs"
										>
											Batal
										</button>
									</div>
								{:else}
									<div class="flex items-center gap-1.5">
										<button
											type="button"
											onclick={() => mulaiUbah(t)}
											aria-label={`Ubah transaksi ${t.kategori} ${rupiah(t.jumlah)}`}
											class="flex h-9 w-9 items-center justify-center rounded-xl bg-surface-container text-on-variant transition hover:bg-surface-high"
										>
											<span class="material-symbols-outlined text-xl">edit</span>
										</button>
										<button
											type="button"
											onclick={() => (hapusId = t.id)}
											aria-label={`Hapus transaksi ${t.kategori} ${rupiah(t.jumlah)}`}
											class="flex h-9 w-9 items-center justify-center rounded-xl bg-surface-container text-on-variant transition hover:bg-surface-high"
										>
											<span class="material-symbols-outlined text-xl">delete</span>
										</button>
									</div>
								{/if}
							</div>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</section>
</div>
