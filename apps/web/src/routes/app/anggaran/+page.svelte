<script lang="ts">
	import { api, rupiah } from '$lib/api';
	import { onMount } from 'svelte';
	import RupiahInput from '$lib/components/RupiahInput.svelte';

	type Anggaran = { id: number; bulan: string; batas: number; kategori: string; id_kategori: number };
	type Kategori = { id: number; nama: string; tipe: string };
	type Ringkasan = { anggaran: { kategori: string; batas: number; dipakai: number; lewat: boolean }[] };

	const NAMA_BULAN = [
		'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
		'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
	];

	const sekarang = new Date();
	let bulan = $state(`${sekarang.getFullYear()}-${String(sekarang.getMonth() + 1).padStart(2, '0')}`);
	let daftar = $state<Anggaran[]>([]);
	let kategoris = $state<Kategori[]>([]);
	let pakai: Record<string, { dipakai: number; lewat: boolean }> = $state({});
	let role = $state('');
	let memuat = $state(true);
	let galat = $state('');
	let galatForm = $state('');

	let idKategori = $state('');
	let batas = $state<number | null>(null);
	let menyimpan = $state(false);

	function geser(b: string, d: number) {
		const [y, m] = b.split('-').map(Number);
		const dt = new Date(y, m - 1 + d, 1);
		return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
	}
	function labelBulan(b: string) {
		const [y, m] = b.split('-').map(Number);
		return `${NAMA_BULAN[m - 1]} ${y}`;
	}
	function pilih(b: string) {
		if (b === bulan) return;
		bulan = b;
		muat();
	}

	const totalBatas = $derived(daftar.reduce((s, a) => s + a.batas, 0));
	const totalPakai = $derived(daftar.reduce((s, a) => s + (pakai[a.kategori]?.dipakai ?? 0), 0));
	const persen = $derived(totalBatas > 0 ? Math.round((totalPakai / totalBatas) * 1000) / 10 : 0);
	const sisa = $derived(totalBatas - totalPakai);

	function dipakai(a: Anggaran) {
		return pakai[a.kategori]?.dipakai ?? 0;
	}
	function persenItem(a: Anggaran) {
		return a.batas > 0 ? Math.round((dipakai(a) / a.batas) * 1000) / 10 : 0;
	}
	function lewat(a: Anggaran) {
		return pakai[a.kategori]?.lewat || persenItem(a) >= 100;
	}

	function pesan(e: unknown, baku: string) {
		const m = e instanceof Error ? e.message : baku;
		if (m === 'FORBIDDEN') return 'Akses ditolak.';
		if (m === 'NOT_FOUND') return 'Data tidak ditemukan.';
		return m || baku;
	}

	async function muat() {
		memuat = true;
		galat = '';
		try {
			const [me, list, kat] = await Promise.all([
				api<{ role: string }>('/api/me'),
				api<Anggaran[]>(`/api/anggaran?bulan=${bulan}`),
				api<Kategori[]>('/api/kategori?tipe=keluar')
			]);
			role = me.role;
			daftar = list;
			kategoris = kat;
			try {
				const ring = await api<Ringkasan>(`/api/ringkasan?bulan=${bulan}`);
				pakai = Object.fromEntries((ring.anggaran ?? []).map((a) => [a.kategori, { dipakai: a.dipakai, lewat: a.lewat }]));
			} catch {
				pakai = {};
			}
		} catch (e) {
			galat = pesan(e, 'Gagal memuat anggaran.');
		} finally {
			memuat = false;
		}
	}

	onMount(muat);

	async function simpan(e: SubmitEvent) {
		e.preventDefault();
		galatForm = '';
		const b = batas ?? 0;
		if (!idKategori || !(b > 0)) {
			galatForm = 'Pilih kategori dan isi batas lebih dari 0.';
			return;
		}
		menyimpan = true;
		try {
			await api('/api/anggaran', {
				method: 'POST',
				body: JSON.stringify({ id_kategori: Number(idKategori), bulan, batas: b })
			});
			idKategori = '';
			batas = null;
			await muat();
		} catch (e2) {
			galatForm = pesan(e2, 'Gagal menyimpan.');
		} finally {
			menyimpan = false;
		}
	}

	async function hapus(id: number) {
		galat = '';
		try {
			await api(`/api/anggaran/${id}`, { method: 'DELETE' });
			daftar = daftar.filter((a) => a.id !== id);
		} catch (e) {
			galat = pesan(e, 'Gagal menghapus.');
		}
	}
</script>

<div class="mx-auto w-full max-w-2xl md:max-w-4xl">
	<!-- Kepala halaman: nama halaman, bulan yang sedang dibaca. -->
	<div class="flex items-start justify-between gap-3">
		<div class="min-w-0">
			<h1 class="text-[19px] font-extrabold tracking-tight">Anggaran Keluarga</h1>
			<p class="mt-0.5 truncate text-[13px] text-ink-3">Batas {labelBulan(bulan)}</p>
		</div>
		{#if memuat}
			<span class="chip chip-quiet mt-1 shrink-0">Memuat</span>
		{/if}
	</div>

	<!-- Pemilih bulan: tiga bulan dalam satu kartu, yang dipilih jadi field hijau. -->
	<section class="card mt-4 p-1.5">
		<div class="grid grid-cols-3 gap-1.5" role="group" aria-label="Pilih bulan">
			{#each [-1, 0, 1] as d}
				{@const b = geser(bulan, d)}
				<button
					type="button"
					onclick={() => pilih(b)}
					aria-current={b === bulan ? 'true' : undefined}
					class="flex min-h-11 flex-col items-center justify-center rounded-xl px-1.5 py-2 transition-colors {b ===
					bulan
						? 'bg-accent-soft font-bold text-accent-ink'
						: 'font-semibold text-ink-2 hover:bg-sunk'}"
				>
					<span class="w-full truncate text-center text-[12px] leading-tight">{labelBulan(b)}</span>
				</button>
			{/each}
		</div>
	</section>

	<!-- Galat tingkat halaman: satu baris, lalu muat lagi. -->
	{#if galat}
		<div class="notice notice-alert mt-4 flex items-center justify-between gap-3" role="alert">
			<span class="min-w-0">{galat}</span>
			<button type="button" onclick={muat} class="btn btn-ghost shrink-0">Coba lagi</button>
		</div>
	{/if}

	<!-- Kerangka: kartu jadi blok rata, isi digambar pakai warna sunk. -->
	{#if memuat && daftar.length === 0}
		<div class="mt-7" aria-busy="true">
			<div class="card animate-pulse p-5 md:p-6">
				<div class="h-3 w-32 rounded-full bg-sunk"></div>
				<div class="mt-3 h-9 w-52 rounded-full bg-sunk"></div>
				<div class="mt-5 h-1.5 w-full rounded-full bg-sunk"></div>
				<div class="mt-5 h-4 w-full rounded-full bg-sunk"></div>
				<div class="mt-3 h-4 w-3/5 rounded-full bg-sunk"></div>
			</div>
			<div class="card rows mt-3 px-4 md:px-5">
				{#each [1, 2, 3] as i (i)}
					<div class="row flex-col">
						<div class="flex w-full items-baseline justify-between gap-3">
							<div class="h-4 w-32 rounded-full bg-sunk"></div>
							<div class="h-4 w-28 rounded-full bg-sunk"></div>
						</div>
						<div class="flex w-full items-center gap-2.5">
							<div class="meter flex-1"></div>
							<div class="h-4 w-12 rounded-full bg-sunk"></div>
						</div>
					</div>
				{/each}
			</div>
			<p class="label mt-4">Memuat anggaran…</p>
		</div>
	{:else}
		<!-- Total batas anggaran: satu angka besar, meter rata, lalu dua baris. -->
		<section
			class="card mt-7 p-5 transition-opacity md:p-6 {memuat ? 'opacity-55' : ''}"
			aria-busy={memuat}
		>
			<div class="flex items-start justify-between gap-3">
				<div class="min-w-0">
					<p class="label">Total batas anggaran</p>
					<div class="figure mt-1.5 text-[clamp(2rem,10vw,3rem)] {sisa < 0 ? 'text-alert' : ''}">
						{rupiah(totalBatas)}
					</div>
				</div>
				{#if totalBatas > 0}
					<span class="chip mt-1 shrink-0 {persen >= 100 ? 'chip-alert' : 'chip-quiet'}">
						{persen}% terpakai
					</span>
				{/if}
			</div>

			{#if totalBatas > 0}
				<div
					class="meter mt-4"
					role="img"
					aria-label="{persen} persen dari total batas anggaran sudah terpakai"
				>
					<span style="width:{Math.min(persen, 100)}%" data-over={persen >= 100}></span>
				</div>
			{:else}
				<p class="notice notice-quiet mt-4">Belum ada batas yang dipasang untuk {labelBulan(bulan)}.</p>
			{/if}

			<div class="rows mt-3">
				<div class="row">
					<span class="text-sm text-ink-2">Terpakai bulan ini</span>
					<span class="amount money text-sm font-bold {sisa < 0 ? 'text-alert' : ''}">
						{rupiah(totalPakai)}
					</span>
				</div>
				<div class="row">
					<span class="text-sm text-ink-2">Sisa batas</span>
					<span class="amount money text-sm font-bold {sisa < 0 ? 'text-alert' : ''}">
						{rupiah(sisa)}
					</span>
				</div>
			</div>
		</section>

		<!-- Form khusus admin: kategori, batas, lalu simpan. -->
		{#if role === 'admin'}
			<section class="mt-8 mb-2">
				<div class="flex items-baseline justify-between gap-3">
					<h2 class="head">Atur batas anggaran</h2>
					<span class="chip chip-quiet shrink-0">Khusus admin</span>
				</div>
				<form onsubmit={simpan} class="card mt-3 p-4 md:p-5">
					<div class="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
						<div class="flex min-w-0 flex-col gap-1.5">
							<label for="agg-kat" class="label">Kategori</label>
							<select id="agg-kat" bind:value={idKategori} required class="input">
								<option value="">Pilih kategori</option>
								{#each kategoris as k (k.id)}
									<option value={k.id}>{k.nama}</option>
								{/each}
							</select>
						</div>
						<div class="flex min-w-0 flex-col gap-1.5">
							<label for="agg-batas" class="label">Batas per bulan</label>
							<RupiahInput
								id="agg-batas"
								bind:value={batas}
								placeholder="500.000"
								required
								class="input money font-bold"
							/>
						</div>
					</div>

					{#if kategoris.length === 0}
						<p class="notice notice-quiet mt-3.5">Belum ada kategori pengeluaran untuk dipilih.</p>
					{:else if galatForm}
						<p role="alert" class="notice notice-alert mt-3.5">{galatForm}</p>
					{/if}

					<button
						type="submit"
						disabled={menyimpan || kategoris.length === 0}
						class="btn btn-primary mt-4 w-full sm:w-auto"
					>
						{menyimpan ? 'Menyimpan…' : 'Simpan batas'}
					</button>
				</form>
			</section>
		{/if}

		<!-- Daftar batas per kategori: baris di dalam satu kartu. -->
		<section class="mt-8 mb-2">
			<div class="flex items-baseline justify-between gap-3">
				<h2 class="head">Batas anggaran per kategori</h2>
				<span class="label shrink-0">{daftar.length} Kategori Terdaftar</span>
			</div>

			{#if daftar.length === 0}
				<div class="card mt-3 p-5">
					<p class="text-[15px] font-bold">Belum ada anggaran bulan ini</p>
					<p class="mt-1.5 max-w-[46ch] text-sm leading-relaxed text-ink-2">
						{#if role === 'admin'}
							Admin bisa memasang batas per kategori lewat form di atas.
						{:else}
							Belum ada batas yang dipasang untuk bulan ini. Minta admin untuk menambahkannya.
						{/if}
					</p>
				</div>
			{:else}
				<div
					class="card rows mt-3 px-4 transition-opacity md:px-5 {memuat ? 'opacity-55' : ''}"
					aria-busy={memuat}
				>
					{#each daftar as a (a.id)}
						{@const p = persenItem(a)}
						{@const lewatBatas = lewat(a)}
						<div class="row flex-col">
							<div class="flex w-full items-baseline justify-between gap-3">
								<span class="min-w-0 flex-1 truncate text-sm font-semibold">{a.kategori}</span>
								<span class="amount money text-sm font-bold {lewatBatas ? 'text-alert' : ''}">
									{rupiah(dipakai(a))} <span class="font-normal text-ink-3">/ {rupiah(a.batas)}</span>
								</span>
							</div>
							<div class="flex w-full items-center gap-2.5">
								<div class="meter flex-1" role="img" aria-label="{a.kategori} memakai {p} persen dari batas">
									<span style="width:{Math.min(p, 100)}%" data-over={lewatBatas}></span>
								</div>
								<span class="money w-11 shrink-0 text-right text-[12px] text-ink-3">{p}%</span>
								<span class="chip shrink-0 {lewatBatas ? 'chip-alert' : 'chip-quiet'}">
									{lewatBatas ? 'Lewat' : 'Aman'}
								</span>
							</div>
							{#if role === 'admin'}
								<div class="flex w-full items-center justify-end">
									<button type="button" onclick={() => hapus(a.id)} class="btn btn-ghost">Hapus</button>
								</div>
							{/if}
						</div>
					{/each}
				</div>
			{/if}
		</section>
	{/if}
</div>
