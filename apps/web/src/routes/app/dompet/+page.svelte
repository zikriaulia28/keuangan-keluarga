<script lang="ts">
	import { api, rupiah } from '$lib/api';
	import RupiahInput from '$lib/components/RupiahInput.svelte';
	let { data } = $props();

	type Dompet = { id_dompet: number; nama_dompet: string; arsip: boolean; saldo: number };
	type Transfer = {
		id: number; tanggal: string; jumlah: number; catatan: string;
		asal: string; tujuan: string; pencatat: string;
	};

	let role = $state(data.role);
	let daftar = $state<Dompet[]>(data.dompet);
	let riwayat = $state<Transfer[]>(data.transfer);
	let memuat = $state(false);
	let galat = $state('');
	let galatAlokasi = $state('');
	let galatTambah = $state('');

	let idDari = $state('');
	let idKe = $state('');
	let jumlah = $state<number | null>(null);
	let tanggal = $state(new Date().toISOString().slice(0, 10));
	let catatan = $state('');
	let mengalokasikan = $state(false);

	let namaBaru = $state('');
	let menyimpan = $state(false);

	let editId = $state<number | null>(null);
	let editNama = $state('');
	let konfirmasiHapus = $state<number | null>(null);

	const admin = $derived(role === 'admin');
	const aktif = $derived(daftar.filter((d) => !d.arsip));
	const totalSaldo = $derived(daftar.reduce((s, d) => s + d.saldo, 0));
	const totalArsip = $derived(daftar.filter((d) => d.arsip).length);
	const asal = $derived(aktif.find((d) => String(d.id_dompet) === idDari));
	const saldoKurang = $derived(asal !== undefined && (jumlah ?? 0) > asal.saldo);

	function pesan(e: unknown, baku: string) {
		const m = e instanceof Error ? e.message : baku;
		if (m === 'FORBIDDEN') return 'Akses ditolak.';
		if (m === 'NOT_FOUND') return 'Data tidak ditemukan.';
		if (m === 'WALLET_DUPLICATE') return 'Nama dompet sudah dipakai.';
		if (m === 'LAST_WALLET') return 'Minimal harus ada satu dompet aktif.';
		if (m === 'WALLET_ARCHIVED') return 'Dompet terarsip tidak bisa dipakai. Aktifkan dulu.';
		if (m === 'SAME_WALLET') return 'Dompet asal dan tujuan tidak boleh sama.';
		if (m === 'INVALID_WALLET') return 'Dompet tidak valid.';
		if (m === 'INVALID_TRANSFER') return 'Isi tanggal, dompet asal & tujuan, dan jumlah lebih dari 0.';
		if (m === 'INSUFFICIENT_BALANCE') return 'Saldo dompet asal tidak mencukupi.';
		return m || baku;
	}

	function fmtTanggal(tgl: string) {
		const d = new Date(`${tgl}T00:00:00`);
		if (isNaN(d.getTime())) return tgl;
		return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
	}

	function pilihDefault() {
		if (aktif.length === 0) return;
		if (!aktif.some((d) => String(d.id_dompet) === idDari)) idDari = String(aktif[0].id_dompet);
		if (!aktif.some((d) => String(d.id_dompet) === idKe)) {
			idKe = String((aktif.find((d) => String(d.id_dompet) !== idDari) ?? aktif[0]).id_dompet);
		}
	}

	// Render pertama: select alokasi harus langsung terisi, bukan kosong.
	pilihDefault();

	async function muat() {
		memuat = true;
		galat = '';
		try {
			const [dom, tr] = await Promise.all([
				api<Dompet[]>('/api/dompet?semua=1'),
				api<Transfer[]>('/api/transfer?limit=20')
			]);
			daftar = dom;
			riwayat = tr;
			pilihDefault();
		} catch (e) {
			galat = pesan(e, 'Gagal memuat dompet.');
		} finally {
			memuat = false;
		}
	}

	async function alokasi(e: SubmitEvent) {
		e.preventDefault();
		galatAlokasi = '';
		const j = jumlah ?? 0;
		if (!idDari || !idKe || idDari === idKe || !(j > 0) || !tanggal) {
			galatAlokasi = 'Pilih dompet asal & tujuan yang berbeda, isi jumlah, dan tanggal.';
			return;
		}
		mengalokasikan = true;
		try {
			await api('/api/transfer', {
				method: 'POST',
				body: JSON.stringify({
					tanggal,
					id_dompet_asal: Number(idDari),
					id_dompet_tujuan: Number(idKe),
					jumlah: j,
					...(catatan.trim() ? { catatan: catatan.trim() } : {})
				})
			});
			jumlah = null;
			catatan = '';
			await muat();
		} catch (err) {
			galatAlokasi = pesan(err, 'Gagal mengalokasikan dana.');
		} finally {
			mengalokasikan = false;
		}
	}

	async function tambahDompet(e: SubmitEvent) {
		e.preventDefault();
		galatTambah = '';
		const nama = namaBaru.trim();
		if (!nama) {
			galatTambah = 'Isi nama dompet.';
			return;
		}
		menyimpan = true;
		try {
			await api('/api/dompet', { method: 'POST', body: JSON.stringify({ nama_dompet: nama }) });
			namaBaru = '';
			await muat();
		} catch (err) {
			galatTambah = pesan(err, 'Gagal menambah dompet.');
		} finally {
			menyimpan = false;
		}
	}

	async function simpanRename(id: number) {
		galat = '';
		const nama = editNama.trim();
		if (!nama) {
			galat = 'Nama dompet tidak boleh kosong.';
			return;
		}
		try {
			await api(`/api/dompet/${id}`, { method: 'PATCH', body: JSON.stringify({ nama_dompet: nama }) });
			editId = null;
			await muat();
		} catch (e) {
			galat = pesan(e, 'Gagal mengubah nama dompet.');
		}
	}

	async function toggleArsip(d: Dompet) {
		galat = '';
		try {
			await api(`/api/dompet/${d.id_dompet}`, {
				method: 'PATCH',
				body: JSON.stringify({ arsip: !d.arsip })
			});
			await muat();
		} catch (e) {
			galat = pesan(e, 'Gagal mengubah status dompet.');
		}
	}

	async function hapusTransfer(id: number) {
		galat = '';
		if (konfirmasiHapus !== id) {
			konfirmasiHapus = id;
			return;
		}
		konfirmasiHapus = null;
		try {
			await api(`/api/transfer/${id}`, { method: 'DELETE' });
			await muat();
		} catch (e) {
			galat = pesan(e, 'Gagal membatalkan alokasi.');
		}
	}
</script>

<div class="mx-auto w-full max-w-2xl md:max-w-4xl">
	<div>
		<h1 class="text-[19px] font-extrabold tracking-tight">Dompet</h1>
		<p class="mt-0.5 text-[13px] text-ink-3">
			{memuat ? 'Memuat…' : `${daftar.length} dompet · ${aktif.length} aktif`}
		</p>
	</div>

	<!-- Satu angka untuk seluruh keluarga. Alokasi hanya memindahkan, tidak menambah. -->
	<section class="card mt-4 p-5 md:p-6">
		<p class="label">Total saldo semua dompet</p>
		<div class="figure mt-1.5 text-[clamp(2.25rem,11vw,3.25rem)] {totalSaldo < 0 ? 'text-alert' : 'text-ink'}">
			{rupiah(totalSaldo)}
		</div>

		<div class="mt-4 flex flex-wrap items-center gap-2">
			{#if totalSaldo < 0}
				<span class="chip chip-alert">Saldo minus</span>
			{/if}
			<span class="chip chip-quiet">{aktif.length} aktif</span>
			{#if totalArsip > 0}
				<span class="chip chip-quiet">{totalArsip} arsip</span>
			{/if}
		</div>

		<p class="mt-4 max-w-[46ch] text-sm leading-relaxed text-ink-2">
			Alokasi hanya memindahkan dana antar dompet, tidak menambah atau mengurangi saldo keluarga.
		</p>
	</section>

	<!-- Galat tingkat halaman: muat ulang, atau perubahan status dompet yang gagal. -->
	{#if galat}
		<div class="notice notice-alert mt-4 flex items-center justify-between gap-3">
			<span>{galat}</span>
			<button type="button" onclick={muat} class="btn btn-ghost shrink-0 !min-h-9 !px-3 text-sm">
				Muat ulang
			</button>
		</div>
	{/if}

	{#if admin}
		<section class="mt-8">
			<div class="flex items-baseline justify-between gap-3">
				<h2 class="head">Alokasi Dana Antar Dompet</h2>
				<span class="chip chip-quiet shrink-0">Admin</span>
			</div>

			<div class="card mt-3 p-4 md:p-5">
				{#if aktif.length < 2}
					<p class="notice notice-quiet">
						Butuh minimal dua dompet aktif untuk mengalokasikan dana. Tambah dompet dulu lewat form di
						bawah.
					</p>
				{:else}
					<form onsubmit={alokasi} class="flex flex-col gap-3.5">
						<div class="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
							<div class="flex min-w-0 flex-col gap-1.5">
								<label for="alok-asal" class="label">Dari dompet</label>
								<select id="alok-asal" bind:value={idDari} class="input">
									{#each aktif as d (d.id_dompet)}
										<option value={String(d.id_dompet)}>{d.nama_dompet} · saldo {rupiah(d.saldo)}</option>
									{/each}
								</select>
							</div>
							<div class="flex min-w-0 flex-col gap-1.5">
								<label for="alok-ke" class="label">Ke dompet</label>
								<select id="alok-ke" bind:value={idKe} class="input">
									{#each aktif.filter((d) => String(d.id_dompet) !== idDari) as d (d.id_dompet)}
										<option value={String(d.id_dompet)}>{d.nama_dompet} · saldo {rupiah(d.saldo)}</option>
									{/each}
								</select>
							</div>
						</div>

						<div class="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
							<div class="flex min-w-0 flex-col gap-1.5">
								<label for="alok-jml" class="label">Jumlah alokasi</label>
								<RupiahInput id="alok-jml" bind:value={jumlah} placeholder="500.000" class="input money" />
							</div>
							<div class="flex min-w-0 flex-col gap-1.5">
								<label for="alok-tgl" class="label">Tanggal</label>
								<input id="alok-tgl" type="date" bind:value={tanggal} class="input" />
							</div>
						</div>

						<div class="flex min-w-0 flex-col gap-1.5">
							<label for="alok-cat" class="label">Catatan (opsional)</label>
							<input
								id="alok-cat"
								type="text"
								bind:value={catatan}
								placeholder="Contoh: sisih dana darurat"
								class="input"
							/>
						</div>

						{#if saldoKurang}
							<div class="notice notice-alert">
								<span class="chip chip-alert">Kurang saldo</span>
								<p class="mt-2">
									Saldo <span class="money font-bold">{rupiah(asal?.saldo ?? 0)}</span> pada
									<span class="font-bold">{asal?.nama_dompet}</span> tidak mencukupi untuk jumlah ini.
								</p>
							</div>
						{:else if galatAlokasi}
							<p role="alert" class="notice notice-alert">{galatAlokasi}</p>
						{/if}

						<button
							type="submit"
							disabled={mengalokasikan || saldoKurang}
							class="btn btn-primary mt-1 w-full sm:w-auto sm:self-start"
						>
							{mengalokasikan ? 'Mengalokasikan…' : 'Alokasikan dana'}
						</button>
					</form>
				{/if}
			</div>
		</section>

		<section class="mt-8">
			<h2 class="head">Tambah Dompet</h2>
			<form onsubmit={tambahDompet} class="card mt-3 p-4 md:p-5">
				<div class="flex min-w-0 flex-col gap-1.5">
					<label for="dom-baru" class="label">Nama dompet</label>
					<input
						id="dom-baru"
						type="text"
						bind:value={namaBaru}
						maxlength="64"
						placeholder="Contoh: Tabungan Bersama"
						class="input"
					/>
				</div>

				{#if galatTambah}
					<p role="alert" class="notice notice-alert mt-3.5">{galatTambah}</p>
				{/if}

				<button type="submit" disabled={menyimpan} class="btn btn-primary mt-3.5 w-full sm:w-auto sm:self-start">
					{menyimpan ? 'Menyimpan…' : 'Tambah dompet'}
				</button>
			</form>
		</section>
	{/if}

	<!-- Daftar dompet: kartu datar, dua kolom di layar lebar. -->
	<section class="mt-8">
		<div class="flex items-baseline justify-between gap-3">
			<h2 class="head">Daftar dompet</h2>
			<span class="label shrink-0">{memuat ? 'Memuat' : `${daftar.length} dompet`}</span>
		</div>

		{#if daftar.length === 0}
			<div class="card mt-3 p-5">
				<p class="text-[15px] font-bold">Belum ada dompet</p>
				<p class="mt-1.5 max-w-[46ch] text-sm leading-relaxed text-ink-2">
					{#if admin}
						Tambah dompet pertama lewat form di atas, lalu alokasikan dana dari dompet itu ke dompet lain.
					{:else}
						Admin belum membuat dompet. Alokasi antar dompet akan tampil di sini.
					{/if}
				</p>
			</div>
		{:else}
			<div
				class="mt-3 grid grid-cols-1 gap-3 transition-opacity md:grid-cols-2 {memuat ? 'opacity-60' : ''}"
				aria-busy={memuat}
			>
				{#each daftar as d (d.id_dompet)}
					<div class="card flex flex-col p-4">
						<div class="flex items-start justify-between gap-3">
							<div class="min-w-0 flex-1">
								{#if editId === d.id_dompet}
									<input
										type="text"
										bind:value={editNama}
										maxlength="64"
										aria-label="Nama dompet"
										placeholder="Nama dompet"
										onkeydown={(e) => {
											if (e.key === 'Enter') {
												e.preventDefault();
												simpanRename(d.id_dompet);
											}
											if (e.key === 'Escape') editId = null;
										}}
										class="input text-[15px] font-semibold"
									/>
								{:else}
									<p class="truncate text-[15px] font-semibold {d.arsip ? 'text-ink-2' : ''}">
										{d.nama_dompet}
									</p>
								{/if}
							</div>
							<span class="chip {d.arsip ? 'chip-quiet' : 'chip-accent'} shrink-0">
								{d.arsip ? 'Arsip' : 'Aktif'}
							</span>
						</div>

						<div class="mt-3 flex items-end justify-between gap-3">
							<div class="min-w-0">
								<p class="label">Saldo</p>
								{#if d.saldo < 0}
									<span class="chip chip-alert mt-1.5">Saldo minus</span>
								{/if}
							</div>
							<p class="amount money text-[19px] font-extrabold {d.saldo < 0 ? 'text-alert' : ''}">
								{rupiah(d.saldo)}
							</p>
						</div>

						{#if admin}
							<div class="mt-3 flex flex-wrap items-center gap-2">
								{#if editId === d.id_dompet}
									<button type="button" onclick={() => simpanRename(d.id_dompet)} class="btn btn-primary">
										Simpan
									</button>
									<button type="button" onclick={() => (editId = null)} class="btn btn-ghost !min-h-11">
										Batal
									</button>
								{:else}
									<button
										type="button"
										onclick={() => {
											editId = d.id_dompet;
											editNama = d.nama_dompet;
										}}
										class="btn btn-ghost !min-h-11"
									>
										Ubah nama
									</button>
									<button type="button" onclick={() => toggleArsip(d)} class="btn">
										{d.arsip ? 'Aktifkan' : 'Arsipkan'}
									</button>
								{/if}
							</div>
						{/if}
					</div>
				{/each}
			</div>
		{/if}
	</section>

	<!-- Riwayat alokasi: asal ke tujuan, dicatat siapa. -->
	<section class="mt-8">
		<div class="flex items-baseline justify-between gap-3">
			<h2 class="head">Riwayat Alokasi</h2>
			<span class="label shrink-0">{memuat ? 'Memuat' : `${riwayat.length} alokasi`}</span>
		</div>

		{#if riwayat.length === 0}
			<div class="card mt-3 p-5">
				<p class="text-[15px] font-bold">Belum ada alokasi dana</p>
				<p class="mt-1.5 max-w-[46ch] text-sm leading-relaxed text-ink-2">
					{#if admin}
						Pindahkan dana antar dompet lewat form di atas; saldo total keluarga tidak berubah.
					{:else}
						Belum ada dana yang dipindahkan antar dompet. Riwayatnya akan tampil di sini.
					{/if}
				</p>
			</div>
		{:else}
			<div
				class="card rows mt-3 px-4 transition-opacity md:px-5 {memuat ? 'opacity-60' : ''}"
				aria-busy={memuat}
			>
				{#each riwayat as t (t.id)}
					<div class="row flex-col !items-stretch !gap-2">
						<div class="flex w-full items-baseline justify-between gap-3">
							<span class="min-w-0 truncate text-sm font-semibold">
								{t.asal} <span class="font-normal text-ink-3">ke</span> {t.tujuan}
							</span>
							<span class="amount money text-sm font-bold">{rupiah(t.jumlah)}</span>
						</div>
						<p class="w-full text-[12px] text-ink-3">
							{fmtTanggal(t.tanggal)} · oleh {t.pencatat}
						</p>
						{#if t.catatan}
							<p class="w-full text-[12px] leading-snug text-ink-2">{t.catatan}</p>
						{/if}

						{#if admin}
							{#if konfirmasiHapus === t.id}
								<div class="notice notice-quiet mt-1 w-full">
									<p>
										Batalkan alokasi <span class="money font-bold">{rupiah(t.jumlah)}</span> dari
										<span class="font-bold">{t.asal}</span> ke <span class="font-bold">{t.tujuan}</span>
										tanggal {fmtTanggal(t.tanggal)}? Saldo langsung kembali ke {t.asal}.
									</p>
									<div class="mt-3 flex flex-col gap-2 sm:flex-row">
										<button
											type="button"
											onclick={() => hapusTransfer(t.id)}
											class="btn btn-danger flex-1"
										>
											Ya, batalkan
										</button>
										<button
											type="button"
											onclick={() => (konfirmasiHapus = null)}
											class="btn btn-ghost !min-h-11 flex-1"
										>
											Batal
										</button>
									</div>
								</div>
							{:else}
								<button
									type="button"
									onclick={() => hapusTransfer(t.id)}
									class="btn btn-danger mt-1 w-full sm:w-auto sm:self-end"
								>
									Batalkan alokasi
								</button>
							{/if}
						{/if}
					</div>
				{/each}
			</div>
		{/if}
	</section>
</div>
