<script lang="ts">
	import { onMount } from 'svelte';
	import { api, rupiah } from '$lib/api';

	let { data } = $props();

	interface PerKategori {
		kategori: string;
		total: number;
	}
	interface AnggaranPakai {
		kategori: string;
		batas: number;
		dipakai: number;
		lewat: boolean;
	}
	interface DompetSaldo {
		id: number;
		nama: string;
		saldo: number;
	}
interface Ringkasan {
	bulan: string;
	masuk: number;
	keluar: number;
	sisa: number;
	prevMasuk: number;
	prevKeluar: number;
	perKategori: PerKategori[];
	anggaran: AnggaranPakai[];
	dompet: DompetSaldo[];
}
	interface Tagihan {
		id: number;
		nama: string;
		jumlah: number;
		hari: number;
		catatan: string | null;
		kategori: string | null;
		lunas: boolean;
	}
	interface Utang {
		id: number;
		arah: string;
		pihak: string;
		jumlah: number;
		terbayar: number;
		sisa: number;
		lunas: boolean;
		tanggal: string;
		jatuhTempo: string | null;
		catatan: string | null;
	}

	function geserBulan(b: string, delta: number) {
		const [y, m] = b.split('-').map(Number);
		const d = new Date(y, m - 1 + delta, 1);
		return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
	}

	function namaBulan(b: string, pendek = false) {
		const [y, m] = b.split('-').map(Number);
		return new Date(y, m - 1, 1).toLocaleDateString('id-ID', {
			month: pendek ? 'short' : 'long',
			year: 'numeric'
		});
	}

	function mom(cur: number, prev: number | null): number | null {
		if (prev === null || prev <= 0) return null;
		return ((cur - prev) / prev) * 100;
	}

	function formatPersen(n: number) {
		return `${n >= 0 ? '+' : ''}${n.toFixed(1).replace('.', ',')}%`;
	}

	function tenor(jatuhTempo: string | null) {
		if (!jatuhTempo) return 'Tanpa jatuh tempo';
		const now = new Date();
		const jt = new Date(jatuhTempo);
		const selisih = (jt.getFullYear() - now.getFullYear()) * 12 + (jt.getMonth() - now.getMonth());
		if (selisih > 0) return `Sisa ${selisih} Bulan`;
		if (selisih === 0) return 'Bulan terakhir';
		return `Terlambat ${-selisih} bulan`;
	}

	let bulan = $state(data.bulan);
	let ringkasan = $state<Ringkasan | null>(data.ringkasan);
	let tagihan = $state<Tagihan[]>(data.tagihan);
	let utang = $state<Utang[]>(data.utang);
	let namaPengguna = $state(data.namaPengguna);
	let memuat = $state(false);
	let galat = $state('');

	const trenMasuk = $derived(mom(ringkasan?.masuk ?? 0, ringkasan?.prevMasuk ?? null));
	const trenKeluar = $derived(mom(ringkasan?.keluar ?? 0, ringkasan?.prevKeluar ?? null));
	const persenSisa = $derived(
		ringkasan && ringkasan.masuk > 0 ? Math.round((ringkasan.sisa / ringkasan.masuk) * 100) : null
	);
	const totalSaldo = $derived(ringkasan?.dompet.reduce((s, d) => s + d.saldo, 0) ?? 0);
	const jumlahLewat = $derived(ringkasan?.anggaran.filter((a) => a.lewat).length ?? 0);
	const kosong = $derived(ringkasan !== null && ringkasan.masuk === 0 && ringkasan.keluar === 0);

	function persenKategori(total: number) {
		if (!ringkasan || ringkasan.keluar <= 0) return 0;
		return Math.round((total / ringkasan.keluar) * 100);
	}

	async function muat() {
		memuat = true;
		galat = '';
		try {
			const [r, t, u] = await Promise.all([
				api<Ringkasan>(`/api/ringkasan?bulan=${encodeURIComponent(bulan)}`),
				api<Tagihan[]>(`/api/tagihan?bulan=${encodeURIComponent(bulan)}`),
				api<Utang[]>('/api/utang?status=aktif')
			]);
			ringkasan = r;
			tagihan = t;
			utang = u;
		} catch (e) {
			galat = e instanceof Error ? e.message : 'Gagal memuat dashboard.';
		} finally {
			memuat = false;
		}
	}

	function pilihBulan(b: string) {
		if (b === bulan) return;
		bulan = b;
		void muat();
	}


function statusTempo(t: Tagihan) {
	const now = new Date();
	now.setHours(0, 0, 0, 0);
	const [y, m] = bulan.split('-').map(Number);
	const maxHari = new Date(y, m, 0).getDate();
	const dueDay = Math.min(t.hari, maxHari);
	const due = new Date(y, m - 1, dueDay);
	const sel = Math.round((due.getTime() - now.getTime()) / 86400000);
	if (t.lunas) return { label: 'Lunas', kelas: 'bg-income-soft text-income-deep' };
	if (sel < 0) return { label: `Telat ${-sel} hari`, kelas: 'bg-expense-soft text-expense-deep' };
	if (sel === 0) return { label: 'Hari ini', kelas: 'bg-primary-bright/10 text-primary' };
	if (sel <= 3) return { label: `${sel} hari lagi`, kelas: 'bg-primary-bright/10 text-primary' };
	return null;
}

let pengingatAktif = $state(false);
let pesanPengingat = $state('');
let prosesPengingat = $state(false);

async function cekStatusPengingat() {
	if (typeof Notification === 'undefined') return;
	const perm = Notification.permission;
	if (perm === 'granted') {
		try {
			const reg = await navigator.serviceWorker.getRegistration('/sw.js');
			if (reg) {
				const sub = await reg.pushManager.getSubscription();
				if (sub) pengingatAktif = true;
			}
		} catch {
			// abaikan
		}
	}
}

async function aktifkanPengingat() {
	if (typeof Notification === 'undefined') {
		pesanPengingat = 'Browser tidak mendukung notifikasi.';
		return;
	}
	const perm = await Notification.requestPermission();
	if (perm !== 'granted') {
		pesanPengingat = 'Izin notifikasi ditolak.';
		return;
	}
	prosesPengingat = true;
	pesanPengingat = '';
	try {
		const reg = await navigator.serviceWorker.register('/sw.js');
		await navigator.serviceWorker.ready;
		const { publicKey } = await api<{ configured: boolean; publicKey: string | null }>('/api/push/vapid-public');
		if (!publicKey) throw new Error('Push tidak dikonfigurasi di server.');
		const key = new Uint8Array(
			atob(publicKey.replace(/-/g, '+').replace(/_/g, '/'))
				.split('')
				.map((c) => c.charCodeAt(0))
		);
		const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
		await api('/api/push/subscribe', { method: 'POST', body: JSON.stringify(sub.toJSON()) });
		pengingatAktif = true;
		pesanPengingat = 'Pengingat aktif — Anda akan menerima notifikasi setiap pagi.';
	} catch (e) {
		pesanPengingat = e instanceof Error ? e.message : 'Gagal mengaktifkan.';
	} finally {
		prosesPengingat = false;
	}
}

async function matikanPengingat() {
	prosesPengingat = true;
	pesanPengingat = '';
	try {
		const reg = await navigator.serviceWorker.getRegistration('/sw.js');
		if (reg) {
			const sub = await reg.pushManager.getSubscription();
			if (sub) {
				await api('/api/push/unsubscribe', { method: 'POST', body: JSON.stringify({ endpoint: sub.endpoint }) });
				await sub.unsubscribe();
			}
		}
		pengingatAktif = false;
		pesanPengingat = 'Pengingat dimatikan.';
	} catch (e) {
		pesanPengingat = e instanceof Error ? e.message : 'Gagal mematikan.';
	} finally {
		prosesPengingat = false;
	}
}

onMount(() => {
	void cekStatusPengingat();
});
</script>

<div class="flex flex-col gap-4 md:gap-6">
	<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
		<div>
			<h1 class="text-2xl font-bold text-on-surface">Dashboard Keuangan</h1>
			<p class="mt-0.5 text-sm text-on-variant">
				Halo{namaPengguna ? ` ${namaPengguna}` : ''}! Keuangan keluarga bulan ini terkendali dengan
				baik.
			</p>
		</div>
		<div
			class="flex items-center gap-1 self-start rounded-xl bg-lowest p-1 shadow-sm sm:self-auto"
			role="group"
			aria-label="Pilih bulan"
		>
			<button
				type="button"
				onclick={() => pilihBulan(geserBulan(bulan, -1))}
				class="flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium text-on-variant transition hover:bg-surface-container-high"
			>
				<span class="material-symbols-outlined text-lg">chevron_left</span>
				<span>{namaBulan(geserBulan(bulan, -1), true)}</span>
			</button>
			<span
				class="flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-on-primary shadow-sm"
				aria-current="true"
			>
				<span class="material-symbols-outlined text-lg">calendar_month</span>
				<span>{namaBulan(bulan)}</span>
			</span>
			<button
				type="button"
				onclick={() => pilihBulan(geserBulan(bulan, 1))}
				class="flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium text-on-variant transition hover:bg-surface-container-high"
			>
				<span>{namaBulan(geserBulan(bulan, 1), true)}</span>
				<span class="material-symbols-outlined text-lg">chevron_right</span>
			</button>
		</div>
	</div>

	{#if galat}
		<div class="rounded-xl bg-lowest p-4 shadow-sm">
			<p role="alert" class="text-sm font-medium text-error">{galat}</p>
			<button
				type="button"
				onclick={muat}
				class="mt-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary"
			>
				Coba lagi
			</button>
		</div>
	{:else if memuat}
		<p class="text-sm text-on-variant">Memuat ringkasan…</p>
	{:else if ringkasan}
		<div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 md:gap-4">
			<div
				class="flex flex-col justify-between gap-3 rounded-xl bg-lowest p-4 shadow-[0_4px_20px_-2px_rgba(37,99,235,0.06)] transition hover:-translate-y-0.5 md:p-6"
			>
				<div class="flex items-center justify-between">
					<span class="text-sm font-medium text-on-variant">Total Pemasukan</span>
					<div
						class="flex h-10 w-10 items-center justify-center rounded-full bg-income-soft text-income-deep"
					>
						<span class="material-symbols-outlined text-xl">arrow_downward</span>
					</div>
				</div>
				<div>
					<div class="text-2xl font-semibold text-on-surface">{rupiah(ringkasan.masuk)}</div>
					{#if trenMasuk !== null}
						<div class="mt-1 flex items-center gap-1 text-xs font-semibold text-income">
							<span class="material-symbols-outlined text-sm">
								{trenMasuk >= 0 ? 'trending_up' : 'trending_down'}
							</span>
							<span>{formatPersen(trenMasuk)} dari bulan lalu</span>
						</div>
					{/if}
				</div>
			</div>
			<div
				class="flex flex-col justify-between gap-3 rounded-xl bg-lowest p-4 shadow-[0_4px_20px_-2px_rgba(37,99,235,0.06)] transition hover:-translate-y-0.5 md:p-6"
			>
				<div class="flex items-center justify-between">
					<span class="text-sm font-medium text-on-variant">Total Pengeluaran</span>
					<div
						class="flex h-10 w-10 items-center justify-center rounded-full bg-expense-soft text-expense-deep"
					>
						<span class="material-symbols-outlined text-xl">arrow_upward</span>
					</div>
				</div>
				<div>
					<div class="text-2xl font-semibold text-on-surface">{rupiah(ringkasan.keluar)}</div>
					{#if trenKeluar !== null}
						<div class="mt-1 flex items-center gap-1 text-xs font-semibold text-expense">
							<span class="material-symbols-outlined text-sm">
								{trenKeluar >= 0 ? 'trending_up' : 'trending_down'}
							</span>
							<span>{formatPersen(trenKeluar)} dari bulan lalu</span>
						</div>
					{/if}
				</div>
			</div>
			<div
				class="flex flex-col justify-between gap-3 rounded-xl bg-lowest p-4 shadow-[0_4px_20px_-2px_rgba(37,99,235,0.06)] transition hover:-translate-y-0.5 md:p-6"
			>
				<div class="flex items-center justify-between">
					<span class="text-sm font-medium text-on-variant">Sisa Bulan Ini</span>
					<div
						class="flex h-10 w-10 items-center justify-center rounded-full bg-primary-bright/10 text-primary"
					>
						<span class="material-symbols-outlined text-xl">account_balance_wallet</span>
					</div>
				</div>
				<div>
					<div class="text-2xl font-semibold text-on-surface">{rupiah(ringkasan.sisa)}</div>
					{#if persenSisa !== null}
						<div class="mt-1 text-xs font-semibold text-primary">
							{persenSisa}% dari pemasukan
						</div>
					{/if}
				</div>
			</div>
			<div
				class="relative flex flex-col justify-between gap-3 overflow-hidden rounded-xl bg-primary p-4 text-on-primary shadow-[0_8px_30px_-4px_rgba(37,99,235,0.2)] transition hover:-translate-y-0.5 md:p-6"
			>
				<div class="pointer-events-none absolute -right-6 -bottom-6 h-32 w-32 rounded-full bg-white/10"></div>
				<div class="flex items-center justify-between">
					<span class="text-sm font-medium text-on-primary/80">Saldo Kas Keluarga</span>
					<div class="flex h-10 w-10 items-center justify-center rounded-full bg-white/20">
						<span class="material-symbols-outlined text-xl">savings</span>
					</div>
				</div>
				<div>
					<div class="text-2xl font-semibold">{rupiah(totalSaldo)}</div>
					<div class="mt-1 text-xs text-on-primary/80">Total tabungan & dompet</div>
				</div>
			</div>
		</div>

		<div class="grid grid-cols-1 gap-4 md:gap-6 lg:grid-cols-3">
			<div class="flex flex-col gap-4 md:gap-6 lg:col-span-2">
				<section class="rounded-xl bg-lowest p-4 shadow-[0_4px_20px_-2px_rgba(37,99,235,0.06)] md:p-6">
					<div class="mb-3 flex items-center justify-between">
						<div>
							<h2 class="text-lg font-semibold">Pengeluaran per Kategori</h2>
							<p class="text-xs text-on-variant">Distribusi pengeluaran rumah tangga bulan ini</p>
						</div>
						<a
							href="/app/transaksi"
							class="flex items-center gap-0.5 text-sm font-semibold text-primary hover:underline"
						>
							<span>Lihat Semua</span>
							<span class="material-symbols-outlined text-base">chevron_right</span>
						</a>
					</div>
					{#if ringkasan.perKategori.length === 0}
						<p class="py-2 text-sm text-on-variant">Belum ada transaksi bulan ini.</p>
					{:else}
						<div class="mt-2 flex flex-col gap-3">
							{#each ringkasan.perKategori as k (k.kategori)}
								<div class="flex flex-col gap-1">
									<div class="flex justify-between text-sm">
										<span class="font-medium">{k.kategori}</span>
										<span class="font-semibold">
											{rupiah(k.total)}
											<span class="font-normal text-on-variant">({persenKategori(k.total)}%)</span>
										</span>
									</div>
									<div class="h-3 w-full overflow-hidden rounded-full bg-surface-container">
										<div
											class="h-full rounded-full bg-primary transition-all"
											style={`width: ${persenKategori(k.total)}%;`}
										></div>
									</div>
								</div>
							{/each}
						</div>
					{/if}
				</section>

				<section class="rounded-xl bg-lowest p-4 shadow-[0_4px_20px_-2px_rgba(37,99,235,0.06)] md:p-6">
					<div class="mb-3 flex items-center justify-between gap-2">
						<div>
							<h2 class="text-lg font-semibold">Progress Anggaran Keluarga</h2>
							<p class="text-xs text-on-variant">Batas pengeluaran per pos anggaran bulan ini</p>
						</div>
						{#if jumlahLewat > 0}
							<span
								class="shrink-0 rounded-full bg-expense-soft px-2.5 py-1 text-xs font-semibold text-expense-deep"
							>
								{jumlahLewat} Pos Lewat Anggaran
							</span>
						{:else}
							<span
								class="shrink-0 rounded-full bg-income-soft px-2.5 py-1 text-xs font-semibold text-income-deep"
							>
								Semua Aman
							</span>
						{/if}
					</div>
					{#if ringkasan.anggaran.length === 0}
						<p class="py-2 text-sm text-on-variant">Belum ada anggaran bulan ini.</p>
					{:else}
						<div class="mt-2 grid grid-cols-1 gap-3 md:grid-cols-2">
							{#each ringkasan.anggaran as a (a.kategori)}
								<div
									class="flex flex-col gap-1.5 rounded-xl p-3 {a.lewat
										? 'bg-expense-soft/30'
										: 'bg-surface-low'}"
								>
									<div class="flex items-center justify-between">
										<span class="font-semibold">{a.kategori}</span>
										{#if a.lewat}
											<span
												class="rounded-full bg-expense px-2 py-0.5 text-[10px] font-bold tracking-wider text-on-primary uppercase"
											>
												Lewat
											</span>
										{:else}
											<span class="text-xs font-medium text-income-deep">Aman</span>
										{/if}
									</div>
									<div class="flex justify-between text-xs text-on-variant">
										<span class={a.lewat ? 'font-semibold text-expense' : ''}>
											Terpakai: {rupiah(a.dipakai)}
										</span>
										<span>Batas: {rupiah(a.batas)}</span>
									</div>
									<div class="h-2.5 w-full overflow-hidden rounded-full bg-surface-container">
										<div
											class="h-full rounded-full {a.lewat ? 'bg-expense' : 'bg-income'}"
											style={`width: ${a.batas > 0 ? Math.min(100, Math.round((a.dipakai / a.batas) * 100)) : 0}%;`}
										></div>
									</div>
								</div>
							{/each}
						</div>
					{/if}
				</section>
			</div>

			<div class="flex flex-col gap-4 md:gap-6">
				<section class="rounded-xl bg-lowest p-4 shadow-[0_4px_20px_-2px_rgba(37,99,235,0.06)] md:p-6">
					<div class="mb-3 flex items-center justify-between">
						<h2 class="text-lg font-semibold">Tagihan Bulan Ini</h2>
						<span class="material-symbols-outlined text-xl text-on-variant">payments</span>
					</div>
					{#if tagihan.length === 0}
						<p class="py-2 text-sm text-on-variant">Tidak ada tagihan bulan ini.</p>
					{:else}
						<div class="flex flex-col gap-2.5">
							{#each tagihan as t (t.id)}
								{@const st = statusTempo(t)}
								<div class="flex items-center justify-between rounded-lg bg-surface-low p-3">
									<div>
										<div class="text-sm font-semibold">{t.nama}</div>
										<div class="flex items-center gap-1.5 text-xs text-on-variant">
											<span>Jatuh tempo: tgl {t.hari}</span>
											{#if st}
												<span class="rounded-full px-2 py-0.5 text-[10px] font-bold {st.kelas}">{st.label}</span>
											{/if}
										</div>
									</div>
									<div class="flex flex-col items-end gap-1">
										<span class="text-sm font-semibold">{rupiah(t.jumlah)}</span>
										{#if t.lunas}
											<span
												class="rounded-full bg-income-soft px-2 py-0.5 text-[10px] font-bold text-income-deep"
											>
												Lunas
											</span>
										{:else}
											<span
												class="rounded-full bg-expense-soft px-2 py-0.5 text-[10px] font-bold text-expense-deep"
											>
												Belum
											</span>
										{/if}
									</div>
								</div>
							{/each}
						</div>
					{/if}
					<a
						href="/app/tagihan"
						class="mt-3 block w-full rounded-lg bg-surface-container py-2 text-center text-sm font-medium transition hover:bg-surface-high"
					>
						Kelola Semua Tagihan
					</a>
				</section>

				<section class="rounded-xl bg-lowest p-4 shadow-[0_4px_20px_-2px_rgba(37,99,235,0.06)] md:p-6">
					<div class="mb-3 flex items-center justify-between">
						<h2 class="text-lg font-semibold">Pengingat Tagihan</h2>
						<span class="material-symbols-outlined text-xl text-on-variant">notifications</span>
					</div>
					{#if pengingatAktif}
						<p class="mb-2 text-sm text-on-variant">Aktif — notifikasi harian pukul 08.00 untuk tagihan yang jatuh tempo ≤ 3 hari atau sudah lewat.</p>
						<button
							type="button"
							onclick={matikanPengingat}
							disabled={prosesPengingat}
							class="w-full rounded-lg bg-expense-soft px-4 py-2 text-sm font-medium text-expense-deep transition hover:bg-expense disabled:opacity-50"
						>
							{prosesPengingat ? 'Memproses…' : 'Matikan Pengingat'}
						</button>
					{:else}
						<p class="mb-2 text-sm text-on-variant">Dapatkan notifikasi di perangkat ini saat tagihan mendekati jatuh tempo.</p>
						<button
							type="button"
							onclick={aktifkanPengingat}
							disabled={prosesPengingat}
							class="w-full rounded-lg bg-primary px-4 py-2 text-sm font-medium text-on-primary transition hover:opacity-95 disabled:opacity-50"
						>
							{prosesPengingat ? 'Mengaktifkan…' : 'Aktifkan Pengingat'}
						</button>
					{/if}
					{#if pesanPengingat}
						<p class="mt-2 text-xs {pengingatAktif ? 'text-income-deep' : 'text-error'}">{pesanPengingat}</p>
					{/if}
				</section>

				<section class="rounded-xl bg-lowest p-4 shadow-[0_4px_20px_-2px_rgba(37,99,235,0.06)] md:p-6">
					<div class="mb-3 flex items-center justify-between">
						<h2 class="text-lg font-semibold">Utang Aktif</h2>
						<span class="material-symbols-outlined text-xl text-on-variant"
							>account_balance_wallet</span
						>
					</div>
					{#if utang.length === 0}
						<p class="py-2 text-sm text-on-variant">Tidak ada utang aktif.</p>
					{:else}
						<div class="flex flex-col gap-2.5">
							{#each utang as h (h.id)}
								<div class="flex flex-col gap-1.5 rounded-lg bg-surface-low p-3">
									<div class="flex items-center justify-between">
										<span class="text-sm font-semibold">
											{h.arah === 'piutang' ? 'Piutang' : 'Utang'} · {h.pihak}
										</span>
										<span class="text-xs font-medium text-primary">{tenor(h.jatuhTempo)}</span>
									</div>
									<div class="flex justify-between text-xs text-on-variant">
										<span>Sisa: {rupiah(h.sisa)}</span>
										<span>Total: {rupiah(h.jumlah)}</span>
									</div>
									<div class="h-2 w-full overflow-hidden rounded-full bg-surface-container">
										<div
											class="h-full rounded-full bg-primary"
											style={`width: ${h.jumlah > 0 ? Math.min(100, Math.round((h.terbayar / h.jumlah) * 100)) : 0}%;`}
										></div>
									</div>
								</div>
							{/each}
						</div>
					{/if}
				</section>
			</div>
		</div>

		{#if kosong}
			<section
				class="mt-2 flex flex-col items-center gap-3 rounded-xl bg-lowest p-6 text-center shadow-[0_4px_20px_-2px_rgba(37,99,235,0.06)]"
			>
				<div
					class="flex h-16 w-16 items-center justify-center rounded-full bg-primary-bright/10 text-primary"
				>
					<span class="material-symbols-outlined text-4xl">receipt_long</span>
				</div>
				<div class="max-w-md">
					<h3 class="text-lg font-semibold">Belum ada transaksi di periode baru?</h3>
					<p class="mt-1 text-sm text-on-variant">
						Catat pemasukan atau pengeluaran pertama keluarga Anda untuk mulai melihat analisis
						grafik dan ringkasan keuangan secara otomatis.
					</p>
				</div>
				<div class="mt-2 flex items-center gap-2">
					<a
						href="/app/transaksi"
						class="flex items-center gap-1 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-on-primary shadow-sm transition hover:opacity-95"
					>
						<span class="material-symbols-outlined text-lg">add</span>
						<span>Tambah Transaksi Baru</span>
					</a>
				</div>
			</section>
		{/if}
	{/if}
</div>
