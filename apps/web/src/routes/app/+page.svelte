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
		if (!jatuhTempo) return 'tanpa jatuh tempo';
		const now = new Date();
		const jt = new Date(jatuhTempo);
		const selisih = (jt.getFullYear() - now.getFullYear()) * 12 + (jt.getMonth() - now.getMonth());
		if (selisih > 0) return `sisa ${selisih} bulan`;
		if (selisih === 0) return 'bulan terakhir';
		return `terlambat ${-selisih} bulan`;
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
	const totalSaldo = $derived(ringkasan?.dompet.reduce((s, d) => s + d.saldo, 0) ?? 0);
	const jumlahLewat = $derived(ringkasan?.anggaran.filter((a) => a.lewat).length ?? 0);
	const kosong = $derived(ringkasan !== null && ringkasan.masuk === 0 && ringkasan.keluar === 0);
	const persenKeluar = $derived(
		ringkasan && ringkasan.masuk > 0
			? Math.min(100, Math.round((ringkasan.keluar / ringkasan.masuk) * 100))
			: 0
	);

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
		if (t.lunas) return { label: 'Lunas', nada: 'chip-accent' };
		if (sel < 0) return { label: `Telat ${-sel} hari`, nada: 'chip-alert' };
		if (sel === 0) return { label: 'Hari ini', nada: 'chip-quiet' };
		if (sel <= 3) return { label: `${sel} hari lagi`, nada: 'chip-quiet' };
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
			const { publicKey } = await api<{ configured: boolean; publicKey: string | null }>(
				'/api/push/vapid-public'
			);
			if (!publicKey) throw new Error('Push tidak dikonfigurasi di server.');
			const key = new Uint8Array(
				atob(publicKey.replace(/-/g, '+').replace(/_/g, '/'))
					.split('')
					.map((c) => c.charCodeAt(0))
			);
			const sub = await reg.pushManager.subscribe({
				userVisibleOnly: true,
				applicationServerKey: key
			});
			await api('/api/push/subscribe', { method: 'POST', body: JSON.stringify(sub.toJSON()) });
			pengingatAktif = true;
			pesanPengingat = 'Pengingat aktif. Anda akan menerima notifikasi setiap pagi.';
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
					await api('/api/push/unsubscribe', {
						method: 'POST',
						body: JSON.stringify({ endpoint: sub.endpoint })
					});
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

<div class="mx-auto w-full max-w-2xl md:max-w-4xl">
	<div class="flex items-center justify-between gap-3">
		<div class="min-w-0">
			<h1 class="text-[19px] font-extrabold tracking-tight">{namaBulan(bulan)}</h1>
			<p class="mt-0.5 truncate text-[13px] text-ink-3">
				{memuat ? 'Memuat…' : namaPengguna ? `Ringkasan untuk ${namaPengguna}` : 'Ringkasan bulanan'}
			</p>
		</div>
		<div class="flex items-center gap-1">
			<button
				type="button"
				onclick={() => pilihBulan(geserBulan(bulan, -1))}
				aria-label="Bulan sebelumnya"
				class="btn btn-ghost !min-h-10 !w-10 !px-0 text-lg"
			>
				&#8249;</button
			>
			<button
				type="button"
				onclick={() => pilihBulan(geserBulan(bulan, 1))}
				aria-label="Bulan berikutnya"
				class="btn btn-ghost !min-h-10 !w-10 !px-0 text-lg"
			>
				&#8250;</button
			>
		</div>
	</div>

	{#if galat}
		<div class="notice notice-alert mt-4 flex items-center justify-between gap-3">
			<span>{galat}</span>
			<button type="button" onclick={muat} class="btn btn-ghost shrink-0 !min-h-9 !px-3 text-sm">
				Coba lagi
			</button>
		</div>
	{/if}

	{#if ringkasan}
		<!-- Kartu utama: satu angka besar, sisa bulan ini. -->
		<section class="card mt-4 p-5 md:p-6">
			<p class="label">Sisa bulan ini</p>
			<div class="figure mt-1.5 text-[clamp(2.25rem,11vw,3.5rem)] {ringkasan.sisa < 0 ? 'text-alert' : 'text-ink'}">
				{rupiah(ringkasan.sisa)}
			</div>

			{#if ringkasan.masuk > 0}
				<div class="mt-4">
					<div class="flex items-baseline justify-between gap-3 text-[13px]">
						<span class="font-semibold text-ink-2">{persenKeluar}% sudah keluar</span>
						<span class="money font-semibold text-ink-3">dari {rupiah(ringkasan.masuk)}</span>
					</div>
					<div class="meter mt-2">
						<span style="width:{persenKeluar}%" data-over={persenKeluar >= 100}></span>
					</div>
				</div>
			{:else}
				<p class="mt-3 text-sm leading-relaxed text-ink-3">
					Belum ada pemasukan tercatat pada bulan ini.
				</p>
			{/if}
		</section>

		<!-- Tiga angka pendukung. -->
		<section class="mt-3 grid grid-cols-2 gap-3">
			<div class="card p-4">
				<p class="label">Masuk</p>
				<p class="money mt-1 text-[19px] font-extrabold">{rupiah(ringkasan.masuk)}</p>
				{#if trenMasuk !== null}
					<p class="money mt-0.5 text-[12px] text-ink-3">{formatPersen(trenMasuk)} dari bulan lalu</p>
				{/if}
			</div>
			<div class="card p-4">
				<p class="label">Keluar</p>
				<p class="money mt-1 text-[19px] font-extrabold text-alert">{rupiah(ringkasan.keluar)}</p>
				{#if trenKeluar !== null}
					<p class="money mt-0.5 text-[12px] text-ink-3">{formatPersen(trenKeluar)} dari bulan lalu</p>
				{/if}
			</div>
		</section>

		<!-- Saldo gabungan semua dompet, termasuk yang terarsip. -->
		<section class="card mt-3 flex items-center justify-between gap-3 p-4">
			<div>
				<p class="label">Saldo semua dompet</p>
				<p class="mt-0.5 text-[12px] text-ink-3">{ringkasan.dompet.length} dompet</p>
			</div>
			<p class="money text-[19px] font-extrabold">{rupiah(totalSaldo)}</p>
		</section>

		{#if kosong}
			<div class="card mt-3 p-5">
				<p class="text-[15px] font-bold">Belum ada transaksi bulan ini</p>
				<p class="mt-1.5 text-sm leading-relaxed text-ink-2">
					Belum ada transaksi yang tercatat pada bulan ini.
				</p>
				<a href="/app/transaksi" class="btn btn-primary mt-4 w-full sm:w-auto">Catat transaksi</a>
			</div>
		{/if}

		<!-- Pengeluaran per kategori. -->
		{#if ringkasan.perKategori.length > 0}
			<section class="mt-7">
				<div class="flex items-baseline justify-between gap-3">
					<h2 class="head">Pengeluaran per kategori</h2>
					<a href="/app/transaksi" class="text-[13px] font-semibold text-accent hover:underline">
						Lihat semua
					</a>
				</div>
				<div class="card rows mt-3 px-4 md:px-5">
					{#each ringkasan.perKategori as k (k.kategori)}
						{@const p = persenKategori(k.total)}
						<div class="row flex-col !items-stretch !gap-2">
							<div class="flex w-full items-baseline justify-between gap-3">
								<span class="truncate text-sm font-semibold">{k.kategori}</span>
								<span class="amount money text-sm font-bold">{rupiah(k.total)}</span>
							</div>
							<div class="flex w-full items-center gap-2.5">
								<div class="meter flex-1">
									<span style="width:{p}%" data-over="true"></span>
								</div>
								<span class="money w-9 shrink-0 text-right text-[12px] text-ink-3">{p}%</span>
							</div>
						</div>
					{/each}
				</div>
			</section>
		{/if}

		<!-- Anggaran. -->
		{#if ringkasan.anggaran.length > 0}
			<section class="mt-7">
				<div class="flex items-center justify-between gap-3">
					<h2 class="head">Anggaran bulan ini</h2>
					{#if jumlahLewat > 0}
						<span class="chip chip-alert">{jumlahLewat} lewat</span>
					{:else}
						<span class="chip chip-accent">Semua aman</span>
					{/if}
				</div>
				<div class="card rows mt-3 px-4 md:px-5">
					{#each ringkasan.anggaran as a (a.kategori)}
						{@const p = a.batas > 0 ? Math.round((a.dipakai / a.batas) * 100) : 0}
						<div class="row flex-col !items-stretch !gap-2">
							<div class="flex w-full items-baseline justify-between gap-3">
								<span class="truncate text-sm font-semibold">{a.kategori}</span>
								<span class="amount money text-sm">
									{rupiah(a.dipakai)} <span class="text-ink-3">/ {rupiah(a.batas)}</span>
								</span>
							</div>
							<div class="flex w-full items-center gap-2.5">
								<div class="meter flex-1">
									<span style="width:{Math.min(p, 100)}%" data-over={a.lewat}></span>
								</div>
								<span class="chip {a.lewat ? 'chip-alert' : 'chip-quiet'} shrink-0">
									{a.lewat ? 'Lewat' : 'Aman'}
								</span>
							</div>
						</div>
					{/each}
				</div>
			</section>
		{/if}

		<!-- Tagihan bulan ini. -->
		<section class="mt-7">
			<div class="flex items-baseline justify-between gap-3">
				<h2 class="head">Tagihan bulan ini</h2>
				<a href="/app/tagihan" class="text-[13px] font-semibold text-accent hover:underline">Kelola</a>
			</div>
			{#if tagihan.length === 0}
				<div class="card mt-3 p-4 text-sm text-ink-2">Belum ada tagihan yang terdaftar.</div>
			{:else}
				<div class="card rows mt-3 px-4 md:px-5">
					{#each tagihan as t (t.id)}
						{@const st = statusTempo(t)}
						<a href="/app/tagihan" class="row">
							<span class="min-w-0 flex-1">
								<span class="block truncate text-sm font-semibold">{t.nama}</span>
								<span class="mt-0.5 block text-[12px] text-ink-3">
									tanggal {t.hari} · {t.kategori ?? 'tanpa kategori'}
								</span>
							</span>
							<span class="amount flex flex-col items-end gap-1">
								<span class="money text-sm font-bold">{rupiah(t.jumlah)}</span>
								{#if st}
									<span class="chip {st.nada}">{st.label}</span>
								{:else}
									<span class="chip chip-quiet">Belum</span>
								{/if}
							</span>
						</a>
					{/each}
				</div>
			{/if}
		</section>

		<!-- Utang & piutang aktif. -->
		<section class="mt-7">
			<div class="flex items-baseline justify-between gap-3">
				<h2 class="head">Utang & piutang aktif</h2>
				<a href="/app/utang" class="text-[13px] font-semibold text-accent hover:underline">Kelola</a>
			</div>
			{#if utang.length === 0}
				<div class="card mt-3 p-4 text-sm text-ink-2">
					Tidak ada utang atau piutang yang belum lunas.
				</div>
			{:else}
				<div class="card rows mt-3 px-4 md:px-5">
					{#each utang as u (u.id)}
						{@const lewatTempo = u.arah === 'utang' && tenor(u.jatuhTempo).startsWith('terlambat')}
						<a href="/app/utang" class="row">
							<span class="min-w-0 flex-1">
								<span class="block truncate text-sm font-semibold">{u.pihak}</span>
								<span class="mt-0.5 block text-[12px] {lewatTempo ? 'font-semibold text-alert' : 'text-ink-3'}">
									{u.arah === 'utang' ? 'Kita berutang' : 'Orang berutang'} · {tenor(u.jatuhTempo)}
								</span>
							</span>
							<span class="amount money text-sm font-bold {lewatTempo ? 'text-alert' : ''}">
								{rupiah(u.sisa)}
							</span>
						</a>
					{/each}
				</div>
			{/if}
		</section>

		<!-- Pengingat harian. -->
		<section class="card mt-7 mb-2 p-5">
			<h2 class="head">Pengingat tagihan</h2>
			<p class="mt-1.5 text-sm leading-relaxed text-ink-2">
				Notifikasi setiap pagi apabila ada tagihan yang jatuh tempo dalam 3 hari atau sudah terlambat.
			</p>
			{#if pesanPengingat}
				<p class="notice notice-quiet mt-3">{pesanPengingat}</p>
			{/if}
			<button
				type="button"
				onclick={pengingatAktif ? matikanPengingat : aktifkanPengingat}
				disabled={prosesPengingat}
				class="btn btn-ghost mt-3 w-full sm:w-auto"
			>
				{prosesPengingat ? 'Memproses…' : pengingatAktif ? 'Matikan pengingat' : 'Aktifkan pengingat'}
			</button>
		</section>
	{/if}
</div>
