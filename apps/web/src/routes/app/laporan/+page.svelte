<script lang="ts">
	import { angka, api, rupiah } from '$lib/api';
	import { mom, namaBulanTahun } from '$lib/format';
	import RekapKategori from '$lib/components/RekapKategori.svelte';

	type Kategori = { kategoriId: number; kategori: string; bulan: string; total: number };
	type BarisKoran = {
		tanggal: string;
		sumber: number;
		urut: number;
		id_dompet: number;
		dompet: string;
		delta: number;
		kategori: string;
		keterangan: string;
	};
	type Laporan = {
		dari: string;
		sampai: string;
		masuk: number;
		keluar: number;
		sisa: number;
		saldoAwal: number;
		saldoAkhir: number;
		sebelumnya: {
			dari: string;
			sampai: string;
			bulanPenuh: boolean;
			masuk: number;
			keluar: number;
		} | null;
		tren: { bulan: string; masuk: number; keluar: number }[];
		perKategori: Kategori[];
		perKategoriMasuk: Kategori[];
		dompet: { id: number; nama: string; awal: number; akhir: number; selisih: number }[];
		terbesar: {
			id: number;
			tanggal: string;
			jumlah: number;
			catatan: string;
			dompet: string;
			kategori: string;
			pencatat: string | null;
		}[];
		koran?: BarisKoran[];
	};

	function iso(d: Date) {
		return d.toISOString().slice(0, 10);
	}
	function geserBulan(n: number) {
		const d = new Date();
		d.setDate(1);
		d.setMonth(d.getMonth() - n);
		return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
	}

	// Default: 6 bulan terakhir. Data awal bulan ini dihitung dari tanggal 1.
	const awalBulanIni = (() => {
		const d = new Date();
		return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
	})();
	const bulanLaluAkhir = (() => {
		const d = new Date(awalBulanIni + 'T00:00:00');
		d.setDate(0);
		return iso(d);
	})();

	let dari = $state(iso(new Date(awalBulanIni + 'T00:00:00')));
	let sampai = $state(iso(new Date()));
	let laporan = $state<Laporan | null>(null);
	let memuat = $state(false);
	let galat = $state('');

	const presets = [
		{ label: 'Bulan ini', d: () => ({ dari: awalBulanIni, sampai: iso(new Date()) }) },
		{ label: '3 bulan', d: () => ({ dari: geserBulan(2) + '-01', sampai: iso(new Date()) }) },
		{ label: '6 bulan', d: () => ({ dari: geserBulan(5) + '-01', sampai: iso(new Date()) }) },
		{ label: 'Tahun ini', d: () => ({ dari: `${new Date().getFullYear()}-01-01`, sampai: iso(new Date()) }) }
	];

	function presetAktif() {
		const p = presets.find((x) => x.d().dari === dari && x.d().sampai === sampai);
		return p?.label ?? '';
	}

	const bulanLabel = $derived.by(() => {
		const fmt = (t: string, month: 'long' | 'short') =>
			new Date(`${t}T00:00:00`).toLocaleDateString('id-ID', { month, year: 'numeric' });
		return `${fmt(dari, 'long')} – ${fmt(sampai, 'long')}`;
	});

	// Tinggi batang dihitung dalam piksel terhadap area 96px, bukan persen:
	// persen di dalam flex yang tingginya ikut-isi resolve ke 0 dan batangnya hilang.
	const AREA_BATANG = 96;
	const maxTren = $derived(
		laporan ? Math.max(1, ...laporan.tren.map((t) => Math.max(t.masuk, t.keluar))) : 1
	);
	function tinggiBatang(n: number) {
		return Math.max(3, Math.round((n / maxTren) * AREA_BATANG));
	}

	// Angka ringkas untuk label di atas batang. "Rp 12.149.644" tidak muat di
	// kolom 55px pada 390px, dan aplikasi ini dipakai sambil berdiri.
	function ringkas(n: number) {
		if (n === 0) return '0';
		if (n < 1000) return String(n);
		// Batas 999.999: di atas itu "1000rb" lebih sulit dibaca daripada "1jt".
		if (n < 1000000) return `${Math.round(n / 1000)}rb`;
		const jt = n / 1000000;
		// 1 desimal hanya di bawah 10jt, supaya "12jt" tidak jadi "12,3jt" yang lc
		// meluber di kolom sempit. 10jt dan 11,9jt tetap terbaca.
		return `${jt >= 10 ? Math.round(jt) : jt.toFixed(1).replace('.0', '').replace('.', ',')}jt`;
	}

	// label = "Sep 26" untuk grafik, sisa = masuk − keluar untuk kalimat kesimpulan.
	const bulanTren = $derived.by(() =>
		(laporan?.tren ?? []).map((t) => ({
			...t,
			label: namaBulanTahun(t.bulan),
			sisa: t.masuk - t.keluar
		}))
	);

	/** '1 Sep – 30 Sep 2026' untuk rentang pembanding. */
	function bulanLabelDari(a: string, b: string) {
		return `${tglPendek(a)} – ${tglPendek(b)}`;
	}

	/**
	 * mom() mengembalikan null untuk dua kasus berbeda: tidak ada pembanding, dan
	 * pembandingnya nol. Keduanya ditampilkan "—" supaya tidak pernah tampil
	 * sebagai `Infinity%`.
	 */
	function tandaMom(p: number | null) {
		if (p === null) return '—';
		if (p === 0) return 'sama';
		return `${p > 0 ? '+' : ''}${p}%`;
	}

	// Satu kalimat kesimpulan, supaya grafiknya tidak cuma bentuk tanpa bacaan.
	const kesimpulan = $derived.by(() => {
		if (bulanTren.length === 0) return '';
		const total = bulanTren.length;
		const l = laporan!;
		const tersibuk = bulanTren.reduce((a, b) => (b.keluar > a.keluar ? b : a));
		const tenggang = bulanTren.reduce((a, b) => (b.sisa > a.sisa ? b : a));
		const selisih = l.masuk - l.keluar;
		return [
			`${selisih >= 0 ? 'Surplus' : 'Defisit'} ${rupiah(Math.abs(selisih))} selama ${total} bulan.`,
			`Rata-rata ${rupiah(Math.round(l.masuk / total))} masuk dan ${rupiah(Math.round(l.keluar / total))} keluar per bulan.`,
			`Keluar terbanyak ${tersibuk.label} (${rupiah(tersibuk.keluar)}), paling hemat ${tenggang.label} (sisa ${rupiah(tenggang.sisa)}).`
		].join(' ');
	});

	// Baris tabel = kategori, kolom = bulan. Supaya tren per kategori terbaca
	// sekilas tanpa menggulir ke samping.
	// Dikelompokkan per kategoriId, bukan per nama: nama_kategori tidak punya
	// UNIQUE dan "Lainnya" memang ada dua baris di DB.
	function rekapKategori(rows: Kategori[]) {
		const bulan = [...new Set(rows.map((r) => r.bulan))].sort();
		const kategori = [...new Map(rows.map((r) => [r.kategoriId, r.kategori])).entries()].map(
			([kategoriId, nama]) => ({
				kategoriId,
				kategori: nama,
				perBulan: bulan.map(
					(b) => rows.find((r) => r.kategoriId === kategoriId && r.bulan === b)?.total ?? 0
				),
				total: rows.filter((r) => r.kategoriId === kategoriId).reduce((a, r) => a + r.total, 0)
			})
		);
		return { bulan, kategori, total: kategori.reduce((a, k) => a + k.total, 0) };
	}
	const keluarRekap = $derived(rekapKategori(laporan?.perKategori ?? []));
	const masukRekap = $derived(rekapKategori(laporan?.perKategoriMasuk ?? []));

	// ---- Rekening koran (R4.4 - R4.7) --------------------------------------
	// Tidak ada kolom saldo running: saldo negatif sampai 22 baris (dompet-sept,
	// misalnya Khalif -554.000 setelah belanja Lactogen) tampilannya seperti
	// kesalahan padahal hanya soal urutan transaksi masuk. Invarian
	// `awal + Σmasuk - Σkeluar = akhir` sudah diperiksa di server dan berlaku,
	// jadi kolom itu tidak membawa informasi baru.
	const BARIS_PER_HALAMAN = 45;

	function tglPendek(t: string) {
		const [y, m, d] = t.split('-');
		return `${d}/${m}/${y}`;
	}

	type Blok = {
		dompet: string;
		awal: number;
		akhir: number;
		baris: {
			no: number;
			tanggal: string;
			dompet: string;
			keterangan: string;
			kategori: string;
			masuk: number;
			keluar: number;
		}[];
		pertama: boolean;
		terakhir: boolean;
		ke: number;
		dari: number;
	};

	const blokKoran = $derived.by(() => {
		const l = laporan;
		if (!l?.koran?.length) return [] as Blok[];
		const hasil: Blok[] = [];
		for (const d of l.dompet) {
			// Hanya dompet yang dicentang yang masuk PDF.
			if (!dompetPilih.includes(d.id)) continue;
			const semua = l.koran.filter((r) => r.id_dompet === d.id);
			// Nomor urut berjalan lintas blok dalam satu dompet: di buku rekening,
			// nomor baris tidak reset hanya karena ganti halaman.
			let no = 0;
			const potong = [];
			for (let i = 0; i < Math.max(semua.length, 1); i += BARIS_PER_HALAMAN) {
				potong.push(semua.slice(i, i + BARIS_PER_HALAMAN));
			}
			potong.forEach((chunk, ci) => {
				hasil.push({
					dompet: d.nama,
					awal: d.awal,
					akhir: d.akhir,
					baris: chunk.map((r) => {
						no += 1;
						return {
							no,
							tanggal: r.tanggal,
							dompet: r.dompet,
							keterangan: r.keterangan,
							kategori: r.kategori,
							masuk: r.delta > 0 ? r.delta : 0,
							keluar: r.delta < 0 ? -r.delta : 0
						};
					}),
					pertama: ci === 0,
					terakhir: ci === potong.length - 1,
					ke: ci + 1,
					dari: potong.length
				});
			});
		}
		return hasil;
	});

	let koranSiap = $state(false);
	let mengunduh = $state(false);
	/** Dompet yang akan dicetak. Default: semua, diisi ulang setiap muat(). */
	let dompetPilih = $state<number[]>([]);

	function gantiDompet(id: number, aktif: boolean) {
		dompetPilih = aktif ? [...dompetPilih, id] : dompetPilih.filter((x) => x !== id);
	}

	/** Berapa baris koran yang akan keluar untuk pilihan saat ini. */
	const barisTerpilih = $derived(blokKoran.reduce((a, b) => a + b.baris.length, 0));

	/** Kalau cuma satu dompet dipilih, namanya bisa masuk ke judul cetakan. */
	const dipilihSatu = $derived(
		dompetPilih.length === 1 ? laporan?.dompet.find((d) => d.id === dompetPilih[0]) : undefined
	);

	async function unduhPdf() {
		if (mengunduh) return;
		if (dompetPilih.length === 0) {
			galat = 'Centang minimal satu dompet untuk dicetak.';
			return;
		}
		mengunduh = true;
		try {
			if (!koranSiap) {
				const penuh = await api<Laporan>(
					`/api/laporan?dari=${dari}&sampai=${sampai}&rincian=koran`
				);
				laporan = { ...laporan!, koran: penuh.koran };
				koranSiap = true;
			}
			await new Promise((r) => setTimeout(r, 60));
			window.print();
		} catch (e) {
			galat = e instanceof Error ? e.message : 'Gagal menyiapkan PDF.';
		} finally {
			mengunduh = false;
		}
	}

	async function muat() {
		galat = '';
		if (!dari || !sampai || dari > sampai) {
			galat = 'Tanggal awal harus lebih dulu dari tanggal akhir.';
			return;
		}
		memuat = true;
		try {
			laporan = await api<Laporan>(`/api/laporan?dari=${dari}&sampai=${sampai}`);
			// Default cetak: semua dompet. Rincian koran tetap lazy — baru diambil
			// saat tombol "Cetak rekening koran" ditekan.
			dompetPilih = laporan.dompet.map((d) => d.id);
			koranSiap = false;
		} catch (e) {
			galat = e instanceof Error ? e.message : 'Gagal memuat laporan.';
		} finally {
			memuat = false;
		}
	}

	function terapkanPreset(p: (typeof presets)[number]) {
		const r = p.d();
		dari = r.dari;
		sampai = r.sampai;
		void muat();
	}
</script>

<div class="mx-auto w-full max-w-2xl md:max-w-4xl">
	<h1 class="print:hidden text-[26px] font-extrabold tracking-tight">Laporan</h1>
	<p class="print:hidden mt-1.5 text-sm text-ink-2">
		Ringkasan periode, tren per bulan, dan pergerakan saldo tiap dompet.
	</p>

	<!-- Pemilih periode: native date input + preset, tanpa pustaka kalender.
	     print:hidden — kontrol layar tidak ada artinya di kertas. -->
	<div class="card mt-5 p-4 print:hidden md:p-5">
		<div class="flex flex-wrap gap-1.5">
			{#each presets as p}
				<button
					type="button"
					onclick={() => terapkanPreset(p)}
					class="btn !min-h-9 !px-3 text-[13px] {presetAktif() === p.label
						? 'btn-primary'
						: 'btn-ghost'}"
				>
					{p.label}
				</button>
			{/each}
		</div>
		<div class="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
			<div>
				<label for="lap-dari" class="label block">Dari tanggal</label>
				<input id="lap-dari" type="date" bind:value={dari} class="input mt-1.5" />
			</div>
			<div>
				<label for="lap-sampai" class="label block">Sampai tanggal</label>
				<input id="lap-sampai" type="date" bind:value={sampai} class="input mt-1.5" />
			</div>
		</div>
		<button
			type="button"
			onclick={muat}
			disabled={memuat}
			class="btn btn-primary mt-4 w-full sm:w-auto"
		>
			{memuat ? 'Memuat…' : 'Tampilkan Laporan'}
		</button>
	</div>

	<!-- Pemilih dompet untuk cetak. PDF hanya berisi rekening koran, jadi
	     pengguna boleh mencetak satu dompet saja. -->
	{#if galat}
		<p class="notice notice-alert mt-4 print:hidden" role="alert">{galat}</p>
	{/if}

	{#if laporan}
		<div class="card mt-3 p-4 print:hidden md:p-5">
			<div class="flex items-baseline justify-between gap-3">
				<span class="label">Dompet yang dicetak</span>
				<span class="text-[12px] text-ink-3">
					{dompetPilih.length} dari {laporan.dompet.length} dipilih
				</span>
			</div>
			<div class="mt-2.5 flex flex-wrap gap-1.5">
				{#each laporan.dompet as d (d.id)}
					{@const n = koranSiap ? laporan.koran?.filter((r) => r.id_dompet === d.id).length : null}
					<label
						class="btn !min-h-9 !cursor-pointer items-center !px-3 text-[13px] {dompetPilih.includes(
							d.id
						)
							? 'btn-primary'
							: 'btn-ghost'}"
					>
						<input
							type="checkbox"
							class="sr-only"
							checked={dompetPilih.includes(d.id)}
							onchange={(e) => gantiDompet(d.id, e.currentTarget.checked)}
						/>
						{d.nama}{#if n !== null}&nbsp;<span class="opacity-70">{n}</span>{/if}
					</label>
				{/each}
			</div>
			<div class="mt-4 flex flex-wrap items-center gap-2">
				<button
					type="button"
					onclick={unduhPdf}
					disabled={mengunduh || dompetPilih.length === 0}
					class="btn btn-primary !px-4"
				>
					{mengunduh ? 'Menyiapkan…' : 'Cetak rekening koran'}
				</button>
				<button
					type="button"
					onclick={() => (dompetPilih = laporan!.dompet.map((d) => d.id))}
					class="btn btn-ghost !px-3 !text-[13px]"
				>
					Pilih semua
				</button>
			</div>
			{#if koranSiap && barisTerpilih > 0}
				<p class="mt-2.5 text-[12px] text-ink-3">
					{barisTerpilih} baris transaksi dari {dompetPilih.length} dompet, belum termasuk baris saldo
					awal dan saldo akhir.
				</p>
			{/if}
		</div>
	{/if}

	{#if laporan}
		<!-- Header khusus cetak. PDF hanya berisi rekening koran, jadi header ini
		     bukan lagi "halaman ringkasan". -->
		<header class="mb-4 hidden print:block">
			<h1 class="text-[15px] font-extrabold">
				Rekening Koran{dipilihSatu ? ` — ${dipilihSatu.nama}` : ''}
			</h1>
			<p class="mt-0.5 text-[10px]">
				Periode {bulanLabel} &middot; Dicetak {tglPendek(iso(new Date()))}
				{#if !dipilihSatu}
					&middot; {dompetPilih.length} dompet
				{/if}
			</p>
		</header>
		<!-- Empat angka periode. -->
		<section class="print:hidden mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
			<div class="card p-4">
				<p class="label">Saldo awal</p>
				<p class="money mt-1 text-[17px] font-extrabold">{rupiah(laporan.saldoAwal)}</p>
			</div>
			<div class="card p-4">
				<p class="label">Masuk</p>
				<p class="money mt-1 text-[17px] font-extrabold text-accent-ink">{rupiah(laporan.masuk)}</p>
			</div>
			<div class="card p-4">
				<p class="label">Keluar</p>
				<p class="money mt-1 text-[17px] font-extrabold text-alert">{rupiah(laporan.keluar)}</p>
			</div>
			<div class="card p-4">
				<p class="label">Saldo akhir</p>
				<p class="money mt-1 text-[17px] font-extrabold">{rupiah(laporan.saldoAkhir)}</p>
			</div>
		</section>

		<!-- R3: pembanding periode sebelumnya. Hanya untuk bulan kalender penuh —
		     untuk rentang 6 bulan, label "vs sebelumnya" hanya membingungkan. -->
		{#if laporan.sebelumnya?.bulanPenuh}
			{@const pm = mom(laporan.masuk, laporan.sebelumnya.masuk)}
			{@const pk = mom(laporan.keluar, laporan.sebelumnya.keluar)}
			<div class="print:hidden mt-3 flex flex-wrap gap-x-6 gap-y-1 text-[13px] text-ink-2">
				<span>
					Masuk {tandaMom(pm)} <span class="text-ink-3">vs {rupiah(laporan.sebelumnya.masuk)}</span>
				</span>
				<span>
					Keluar {tandaMom(pk)} <span class="text-ink-3">vs {rupiah(laporan.sebelumnya.keluar)}</span>
				</span>
				<span class="w-full text-ink-3 sm:w-auto">
					periode pembanding {bulanLabelDari(laporan.sebelumnya.dari, laporan.sebelumnya.sampai)}
				</span>
			</div>
		{/if}

		{#if laporan.tren.length === 0}
			<div class="print:hidden card mt-4 p-5">
				<p class="text-[15px] font-bold">Tidak ada transaksi di periode ini</p>
				<p class="print:hidden mt-1.5 text-sm text-ink-2">Pilih rentang tanggal lain, lalu tampilkan lagi.</p>
			</div>
		{:else}
			<!-- Tren per bulan. Angka selalu terlihat, bukan hanya saat hover:
			     di HP tidak ada hover, dan aplikasi ini dipakai sambil berdiri. -->
			<section class="print:hidden mt-6">
				<h2 class="head">Tren per bulan</h2>
				<p class="mt-0.5 text-[13px] text-ink-3">{bulanLabel}</p>
				<div class="card mt-3 p-4 md:p-5">
					<div class="flex items-stretch justify-between gap-1" style="height:168px">
						{#each bulanTren as t (t.bulan)}
							<div class="flex min-w-0 flex-1 flex-col items-center gap-1">
								<div class="flex w-full flex-1 items-end justify-center gap-0.5">
									<div class="flex w-full max-w-6 flex-col justify-end">
										<span
											class="money mb-0.5 block text-center text-[10px] leading-none font-semibold text-accent-ink"
										>
											{ringkas(t.masuk)}
										</span>
										<div
											class="rounded-t bg-accent"
											style="height:{tinggiBatang(t.masuk)}px"
										></div>
									</div>
									<div class="flex w-full max-w-6 flex-col justify-end">
										<span
											class="money mb-0.5 block text-center text-[10px] leading-none font-semibold text-alert"
										>
											{ringkas(t.keluar)}
										</span>
										<div
											class="rounded-t bg-alert"
											style="height:{tinggiBatang(t.keluar)}px"
										></div>
									</div>
								</div>
								<span class="money w-full truncate text-center text-[11px] text-ink-3">
									{t.label}
								</span>
							</div>
						{/each}
					</div>
					<div class="mt-3 flex flex-wrap gap-4 border-t border-line pt-3 text-[12px]">
						<span class="flex items-center gap-1.5">
							<span class="h-2.5 w-2.5 rounded-sm bg-accent" aria-hidden="true"></span>Masuk
						</span>
						<span class="flex items-center gap-1.5">
							<span class="h-2.5 w-2.5 rounded-sm bg-alert" aria-hidden="true"></span>Keluar
						</span>
					</div>
				</div>
				<p class="mt-3 text-sm leading-relaxed text-ink-2">{kesimpulan}</p>
			</section>

			<!-- Pengeluaran dan pemasukan per kategori memakai komponen yang sama.
			     PDF hanya berisi rekening koran, jadi seluruh ringkasan ini tidak dicetak. -->
			<div class="print:hidden">
				<RekapKategori
					judul="Pengeluaran per kategori"
					bulan={keluarRekap.bulan}
					baris={keluarRekap.kategori}
					total={keluarRekap.total}
				/>

				<!-- R1: pemasukan per kategori. Dikelompokkan per kategoriId, bukan per
				     nama, karena nama_kategori tidak punya UNIQUE. -->
				{#if masukRekap.kategori.length > 0}
					<RekapKategori
						judul="Pemasukan per kategori"
						bulan={masukRekap.bulan}
						baris={masukRekap.kategori}
						total={masukRekap.total}
						kalimat="Transfer antar dompet tidak dihitung di sini — itu perpindahan, bukan pemasukan."
					/>
				{/if}
			</div>

			<!-- R2: pengeluaran terbesar di periode ini. -->
			{#if laporan.terbesar.length > 0}
				<section class="print:hidden mt-6">
					<div class="flex items-baseline justify-between gap-3">
						<h2 class="head">Transaksi terbesar</h2>
						<span class="text-[13px] text-ink-2">10 pengeluaran terbesar</span>
					</div>
					<div class="card rows mt-3 px-4 md:px-5">
						{#each laporan.terbesar as t (t.id)}
							<div class="row">
								<span class="min-w-0 flex-1">
									<span class="block truncate text-sm font-semibold">
										{t.catatan || t.kategori}
									</span>
									<span class="mt-0.5 block text-[12px] text-ink-3">
										{tglPendek(t.tanggal)} &middot; {t.kategori} &middot; {t.dompet}
									</span>
								</span>
								<span class="amount">
									<span class="money block text-sm font-bold text-alert">
										-{rupiah(t.jumlah)}
									</span>
								</span>
							</div>
						{/each}
					</div>
				</section>
			{/if}

			<!-- Pergerakan saldo tiap dompet di dalam periode. -->
			<section class="print:hidden mt-6">
				<h2 class="head">Pergerakan saldo per dompet</h2>
				<p class="mt-0.5 text-[13px] text-ink-3">
					Alokasi dana muncul di sini sebagai perpindahan, bukan pemasukan.
				</p>
				<div class="card rows mt-3 px-4 md:px-5">
					{#each laporan.dompet as d (d.id)}
						<div class="row">
							<span class="min-w-0 flex-1">
								<span class="block truncate text-sm font-semibold">{d.nama}</span>
								<span class="money mt-0.5 block text-[12px] text-ink-3">
									{rupiah(d.awal)} &rarr; {rupiah(d.akhir)}
								</span>
							</span>
							<span class="amount">
								<span
									class="money block text-sm font-bold {d.selisih > 0
										? 'text-accent-ink'
										: d.selisih < 0
											? 'text-alert'
											: 'text-ink-3'}"
								>
									{d.selisih > 0 ? '+' : ''}{rupiah(d.selisih)}
								</span>
								<span class="mt-0.5 block text-[11px] text-ink-3">
									{d.selisih === 0 ? 'tidak berubah' : d.selisih > 0 ? 'bertambah' : 'berkurang'}
								</span>
							</span>
						</div>
					{/each}
				</div>
			</section>

			<p class="print:hidden mt-4 text-center text-[12px] text-ink-3">
				Saldo awal {rupiah(laporan.saldoAwal)} + masuk {rupiah(laporan.masuk)} &minus; keluar
				{rupiah(laporan.keluar)} = saldo akhir {rupiah(laporan.saldoAkhir)}
			</p>
		{/if}

		<!-- Rekening koran. Hanya untuk cetak: di layar tidak ditampilkan supaya
		     halaman tetap ringan, dan tabel ini tidak perlu interaksi apa pun. -->
		{#if blokKoran.length > 0}
			<section class="koran hidden print:block print:mt-0">
				{#each blokKoran as b, bi (bi)}
					<div
						class="koran-hal"
						class:koran-hal-pisah={bi < blokKoran.length - 1}
					>
						<div class="koran-kepala">
							<span class="font-bold">Rekening: {b.dompet}</span>
							{#if b.dari > 1}
								<span class="text-ink-3">Bagian {b.ke} dari {b.dari}</span>
							{/if}
						</div>
						<table class="koran-tabel">
							<thead>
								<tr>
									<th class="k-no">No</th>
									<th class="k-tgl">Tanggal</th>
									<th class="k-dompet">Dompet</th>
									<th class="k-ket">Keterangan</th>
									<th class="k-kat">Kategori</th>
									<th class="k-angka">Masuk</th>
									<th class="k-angka">Keluar</th>
								</tr>
							</thead>
							<tbody>
								{#if b.pertama}
									<tr class="koran-total">
										<td colspan="5">SALDO AWAL</td>
										<td colspan="2" class="k-angka">{angka(b.awal)}</td>
									</tr>
								{/if}
								{#each b.baris as r (r.no)}
									<tr>
										<td class="k-no">{r.no}</td>
										<td class="k-tgl">{tglPendek(r.tanggal)}</td>
										<td class="k-dompet">{r.dompet}</td>
										<td class="k-ket">{r.keterangan}</td>
										<td class="k-kat">{r.kategori}</td>
										<td class="k-angka">{r.masuk ? angka(r.masuk) : ''}</td>
										<td class="k-angka">{r.keluar ? angka(r.keluar) : ''}</td>
									</tr>
								{/each}
								{#if b.terakhir}
									<tr class="koran-total">
										<td colspan="5">SALDO AKHIR</td>
										<td colspan="2" class="k-angka">{angka(b.akhir)}</td>
									</tr>
								{/if}
							</tbody>
						</table>
					</div>
				{/each}
			</section>
		{/if}
	{/if}
</div>
