<script lang="ts">
  import { api, rupiah } from '$lib/api';
  import { onMount } from 'svelte';
  import RupiahInput from '$lib/components/RupiahInput.svelte';

  type Utang = {
    id: number; arah: string; pihak: string; jumlah: number; terbayar: number;
    sisa: number; lunas: boolean; tanggal: string; jatuhTempo?: string | null; catatan?: string | null;
  };

  let daftar = $state<Utang[]>([]);
  let semua = $state<Utang[]>([]);
  let memuat = $state(true);
  let galat = $state('');
  let galatForm = $state('');
  let galatBayar = $state('');

  let arahFilter = $state('');
  let statusFilter = $state('aktif');
  let tambahBuka = $state(false);

  let arah = $state('utang');
  let pihak = $state('');
  let jumlah = $state<number | null>(null);
  let tanggal = $state(new Date().toISOString().slice(0, 10));
  let jatuhTempo = $state('');
  let catatan = $state('');
  let menyimpan = $state(false);

  let bayarId = $state<number | null>(null);
  let bayarJumlah = $state<number | null>(null);
  let bayarTanggal = $state(new Date().toISOString().slice(0, 10));

  const totalUtang = $derived(semua.filter((u) => u.arah !== 'piutang' && !u.lunas).reduce((s, u) => s + u.sisa, 0));
  const countUtang = $derived(semua.filter((u) => u.arah !== 'piutang' && !u.lunas).length);
  const totalPiutang = $derived(semua.filter((u) => u.arah === 'piutang' && !u.lunas).reduce((s, u) => s + u.sisa, 0));
  const countPiutang = $derived(semua.filter((u) => u.arah === 'piutang' && !u.lunas).length);

  function pesan(e: unknown, baku: string) {
    const m = e instanceof Error ? e.message : baku;
    if (m === 'FORBIDDEN') return 'Akses ditolak.';
    if (m === 'NOT_FOUND') return 'Data tidak ditemukan.';
    return m || baku;
  }

  function inisial(nama: string) {
    return nama.trim().slice(0, 1).toUpperCase() || '?';
  }

  function tenor(jt?: string | null) {
    if (!jt) return '';
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const d = new Date(`${jt}T00:00:00`);
    if (isNaN(d.getTime())) return jt;
    const sel = Math.round((d.getTime() - now.getTime()) / 86400000);
    if (sel > 0) return `${sel} hari lagi`;
    if (sel === 0) return 'hari ini';
    return `lewat ${-sel} hari`;
  }

  function fmtTanggal(tgl: string) {
    const d = new Date(`${tgl}T00:00:00`);
    if (isNaN(d.getTime())) return tgl;
    return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  async function muat() {
    memuat = true;
    galat = '';
    try {
      const q = new URLSearchParams();
      if (arahFilter) q.set('arah', arahFilter);
      if (statusFilter) q.set('status', statusFilter);
      const qs = q.toString();
      const [list, all] = await Promise.all([
        api<Utang[]>(`/api/utang${qs ? `?${qs}` : ''}`),
        api<Utang[]>('/api/utang').catch(() => [] as Utang[])
      ]);
      daftar = list;
      semua = all;
    } catch (e) {
      galat = pesan(e, 'Gagal memuat utang.');
    } finally {
      memuat = false;
    }
  }

  onMount(muat);

  function gantiArah(v: string) {
    arahFilter = v;
    muat();
  }
  function gantiStatus(v: string) {
    statusFilter = v;
    muat();
  }

  async function tambah(e: SubmitEvent) {
    e.preventDefault();
    galatForm = '';
    if (!pihak.trim() || jumlah === null || !(jumlah > 0) || !tanggal) {
      galatForm = 'Isi pihak, jumlah, dan tanggal.';
      return;
    }
    menyimpan = true;
    try {
      await api('/api/utang', {
        method: 'POST',
        body: JSON.stringify({
          arah, pihak: pihak.trim(), jumlah, tanggal,
          ...(jatuhTempo ? { jatuh_tempo: jatuhTempo } : {}),
          ...(catatan.trim() ? { catatan: catatan.trim() } : {})
        })
      });
      pihak = ''; jumlah = null; jatuhTempo = ''; catatan = '';
      tambahBuka = false;
      await muat();
    } catch (e2) {
      galatForm = pesan(e2, 'Gagal menambah.');
    } finally {
      menyimpan = false;
    }
  }

  async function bayar(id: number) {
    galatBayar = '';
    if (bayarJumlah === null || !(bayarJumlah > 0)) {
      galatBayar = 'Isi jumlah bayar lebih dari 0.';
      return;
    }
    try {
      await api(`/api/utang/${id}/bayar`, {
        method: 'POST',
        body: JSON.stringify({ jumlah: bayarJumlah, ...(bayarTanggal ? { tanggal: bayarTanggal } : {}) })
      });
      bayarId = null;
      bayarJumlah = null;
      await muat();
    } catch (e) {
      galatBayar = pesan(e, 'Gagal membayar.');
    }
  }

  async function hapus(id: number) {
    galat = '';
    try {
      await api(`/api/utang/${id}`, { method: 'DELETE' });
      daftar = daftar.filter((u) => u.id !== id);
      semua = semua.filter((u) => u.id !== id);
    } catch (e) {
      galat = pesan(e, 'Gagal menghapus.');
    }
  }

  function labelArah(a: string) {
    return a === 'piutang' ? 'Piutang' : 'Utang';
  }
</script>

<div class="mx-auto w-full max-w-5xl px-4 pb-24 font-sans md:px-8">
  <div class="mb-4 flex flex-col gap-1">
    <h1 class="text-2xl font-bold text-on-surface">Catatan Utang & Piutang</h1>
    <p class="text-sm text-on-variant">Kelola pinjaman keluarga, cicilan, dan piutang dengan transparan.</p>
  </div>

  <button
    onclick={() => (tambahBuka = !tambahBuka)}
    class="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-medium text-on-primary shadow-sm transition-transform active:scale-95 hover:opacity-90"
  >
    <span class="material-symbols-outlined text-[20px]">{tambahBuka ? 'close' : 'add_circle'}</span>
    <span>{tambahBuka ? 'Tutup Form' : 'Tambah Utang/Piutang'}</span>
  </button>

  {#if tambahBuka}
    <section class="mt-4 rounded-2xl bg-lowest p-6 shadow-sm">
      <h2 class="mb-4 text-lg font-semibold text-on-surface">Tambah Utang atau Piutang</h2>
      <form onsubmit={tambah} class="flex flex-col gap-4">
        {#if galatForm}<p class="rounded-xl bg-expense-soft px-4 py-2 text-sm text-error">{galatForm}</p>{/if}
        <div>
          <span class="mb-1 block text-sm text-on-variant">Tipe Transaksi</span>
          <div class="grid grid-cols-2 gap-2">
            <button
              type="button"
              onclick={() => (arah = 'utang')}
              class="rounded-xl border px-4 py-2.5 text-center text-sm font-medium {arah === 'utang'
                ? 'border-primary bg-primary px-4 text-on-primary'
                : 'border-outline text-on-variant'}"
            >
              Utang (Pinjam)
            </button>
            <button
              type="button"
              onclick={() => (arah = 'piutang')}
              class="rounded-xl border px-4 py-2.5 text-center text-sm font-medium {arah === 'piutang'
                ? 'border-primary bg-primary text-on-primary'
                : 'border-outline text-on-variant'}"
            >
              Piutang (Dipinjamkan)
            </button>
          </div>
        </div>
        <div>
          <label for="ut-pihak" class="mb-1 block text-sm text-on-variant">Nama Pemberi / Peminjam</label>
          <input
            id="ut-pihak"
            bind:value={pihak}
            placeholder="Contoh: Toko Elektronik / Teman"
            required
            class="w-full rounded-xl bg-surface-container px-3 py-2 text-sm text-on-surface outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label for="ut-jumlah" class="mb-1 block text-sm text-on-variant">Total Nominal (Rp)</label>
            <RupiahInput
              id="ut-jumlah"
              bind:value={jumlah}
              placeholder="1.000.000"
              required
              class="w-full rounded-xl bg-surface-container px-3 py-2 text-sm text-on-surface outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <div>
            <label for="ut-tanggal" class="mb-1 block text-sm text-on-variant">Tanggal</label>
            <input
              id="ut-tanggal"
              type="date"
              bind:value={tanggal}
              required
              class="w-full rounded-xl bg-surface-container px-3 py-2 text-sm text-on-surface outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
        </div>
        <div>
          <label for="ut-tempo" class="mb-1 block text-sm text-on-variant">Jatuh Tempo</label>
          <input
            id="ut-tempo"
            type="date"
            bind:value={jatuhTempo}
            class="w-full rounded-xl bg-surface-container px-3 py-2 text-sm text-on-surface outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <div>
          <label for="ut-catatan" class="mb-1 block text-sm text-on-variant">Catatan Tambahan</label>
          <input
            id="ut-catatan"
            bind:value={catatan}
            placeholder="Catatan opsional…"
            class="w-full rounded-xl bg-surface-container px-3 py-2 text-sm text-on-surface outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <div class="flex justify-end gap-2">
          <button
            type="button"
            onclick={() => (tambahBuka = false)}
            class="rounded-xl px-4 py-2 text-sm text-on-variant hover:bg-surface-container"
          >
            Batal
          </button>
          <button
            type="submit"
            disabled={menyimpan}
            class="rounded-xl bg-primary px-6 py-2 text-sm font-medium text-on-primary shadow-sm disabled:opacity-60"
          >
            {menyimpan ? 'Menyimpan…' : 'Simpan'}
          </button>
        </div>
      </form>
    </section>
  {/if}

  <div class="mt-4 grid grid-cols-2 gap-4">
    <div class="flex flex-col justify-between rounded-xl bg-lowest p-4 shadow-sm">
      <div class="mb-2 flex items-center justify-between">
        <span class="text-xs font-medium text-on-variant">Total Utang Aktif</span>
        <div class="flex h-8 w-8 items-center justify-center rounded-full bg-expense-soft text-expense-deep">
          <span class="material-symbols-outlined text-[18px]">trending_down</span>
        </div>
      </div>
      <span class="text-lg font-semibold text-expense">{rupiah(totalUtang)}</span>
      <span class="mt-1 text-xs text-on-variant">{countUtang} pinjaman berjalan</span>
    </div>
    <div class="flex flex-col justify-between rounded-xl bg-lowest p-4 shadow-sm">
      <div class="mb-2 flex items-center justify-between">
        <span class="text-xs font-medium text-on-variant">Total Piutang Aktif</span>
        <div class="flex h-8 w-8 items-center justify-center rounded-full bg-income-soft text-income-deep">
          <span class="material-symbols-outlined text-[18px]">trending_up</span>
        </div>
      </div>
      <span class="text-lg font-semibold text-income">{rupiah(totalPiutang)}</span>
      <span class="mt-1 text-xs text-on-variant">{countPiutang} piutang berjalan</span>
    </div>
  </div>

  <div class="mt-4 flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
    <div class="flex gap-1 overflow-x-auto rounded-xl bg-surface-high p-1">
      {#each [['', 'Semua'], ['utang', 'Utang'], ['piutang', 'Piutang']] as [v, label]}
        <button
          onclick={() => gantiArah(v)}
          class="rounded-lg px-4 py-1.5 text-sm font-medium transition-all {arahFilter === v
            ? 'bg-lowest text-primary shadow-sm'
            : 'text-on-variant'}"
        >
          {label}
        </button>
      {/each}
    </div>
    <div class="flex gap-1 rounded-xl bg-surface-high p-1">
      {#each [['aktif', 'Aktif'], ['lunas', 'Lunas'], ['', 'Semua']] as [v, label]}
        <button
          onclick={() => gantiStatus(v)}
          class="rounded-lg px-4 py-1.5 text-sm font-medium transition-all {statusFilter === v
            ? 'bg-lowest text-on-surface shadow-sm'
            : 'text-on-variant'}"
        >
          {label}
        </button>
      {/each}
    </div>
  </div>

  {#if memuat}
    <div class="mt-4 flex flex-col gap-4">
      {#each [1, 2] as _}
        <div class="animate-pulse rounded-xl bg-lowest p-4 shadow-sm">
          <div class="h-5 w-1/2 rounded bg-surface-container"></div>
          <div class="mt-3 h-12 rounded-lg bg-surface-container"></div>
        </div>
      {/each}
    </div>
    <p class="mt-3 text-sm text-on-variant">Memuat…</p>
  {:else}
    {#if galat}<p class="mt-4 rounded-xl bg-expense-soft px-4 py-3 text-sm text-error">{galat}</p>{/if}
    {#if galatBayar}<p class="mt-4 rounded-xl bg-expense-soft px-4 py-3 text-sm text-error">{galatBayar}</p>{/if}
    {#if daftar.length === 0}
      <div class="mt-4 flex flex-col items-center gap-2 rounded-xl bg-lowest p-8 text-center shadow-sm">
        <span class="material-symbols-outlined text-[32px] text-outline">handshake</span>
        <p class="font-medium text-on-surface">Tidak ada data</p>
        <p class="text-sm text-on-variant">Belum ada catatan utang atau piutang pada filter ini.</p>
      </div>
    {:else}
      <div class="mt-4 flex flex-col gap-4">
        {#each daftar as u}
          {@const isPiutang = u.arah === 'piutang'}
          <div class="flex flex-col gap-4 rounded-xl bg-lowest p-4 shadow-sm {u.lunas ? 'opacity-80' : ''}">
            <div class="flex items-start justify-between gap-2">
              <div class="flex items-center gap-3">
                <div
                  class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg font-bold {u.lunas
                    ? 'bg-surface-high text-on-variant'
                    : isPiutang
                      ? 'bg-income-soft text-income-deep'
                      : 'bg-expense-soft text-expense-deep'}"
                >
                  {#if u.lunas}
                    <span class="material-symbols-outlined text-[20px]">check_circle</span>
                  {:else}
                    {inisial(u.pihak)}
                  {/if}
                </div>
                <div>
                  <div class="flex flex-wrap items-center gap-2">
                    <h3 class="font-semibold text-on-surface {u.lunas ? 'line-through' : ''}">{u.pihak}</h3>
                    <span
                      class="rounded-full px-2 py-0.5 text-xs font-medium {isPiutang
                        ? 'bg-income-soft text-income-deep'
                        : 'bg-expense-soft text-expense-deep'}"
                    >
                      {labelArah(u.arah)}
                    </span>
                    {#if u.lunas}
                      <span class="flex items-center gap-1 rounded-full bg-income-soft px-2.5 py-0.5 text-xs font-bold text-income-deep">
                        <span class="material-symbols-outlined text-[14px]">done_all</span> Lunas
                      </span>
                    {/if}
                  </div>
                  <p class="text-xs text-on-variant">
                    {fmtTanggal(u.tanggal)}
                    {#if u.jatuhTempo} · Jatuh tempo {fmtTanggal(u.jatuhTempo)} ({tenor(u.jatuhTempo)}){/if}
                    {#if u.catatan} · {u.catatan}{/if}
                  </p>
                </div>
              </div>
              <div class="flex shrink-0 items-center gap-1">
                {#if !u.lunas}
                  <button
                    onclick={() => {
                      bayarId = u.id;
                      bayarJumlah = u.sisa;
                      galatBayar = '';
                    }}
                    title={isPiutang ? 'Terima Cicilan' : 'Bayar Cicilan'}
                    class="rounded-lg bg-primary p-2 text-on-primary transition-colors hover:opacity-90"
                  >
                    <span class="material-symbols-outlined text-[18px]">payments</span>
                  </button>
                {/if}
                <button
                  onclick={() => hapus(u.id)}
                  title="Hapus"
                  class="rounded-lg bg-surface-high p-2 text-on-variant transition-colors hover:text-expense"
                >
                  <span class="material-symbols-outlined text-[18px]">delete</span>
                </button>
              </div>
            </div>

            <div class="grid grid-cols-3 gap-2 rounded-lg bg-surface-container p-2 text-center">
              <div>
                <span class="block text-xs text-on-variant">Total</span>
                <span class="text-sm font-medium text-on-surface">{rupiah(u.jumlah)}</span>
              </div>
              <div>
                <span class="block text-xs text-on-variant">Terbayar</span>
                <span class="text-sm font-medium text-income">{rupiah(u.terbayar)}</span>
              </div>
              <div>
                <span class="block text-xs text-on-variant">Sisa</span>
                <span class="text-sm font-bold {u.lunas ? 'text-on-variant' : 'text-expense'}">{rupiah(u.sisa)}</span>
              </div>
            </div>

            {#if bayarId === u.id}
              <div class="flex flex-col gap-2 rounded-lg border-l-2 border-primary bg-surface-low p-2">
                <span class="text-xs font-medium text-on-surface">
                  {isPiutang ? 'Form Terima Pembayaran Piutang' : 'Form Pembayaran Cicilan'}
                </span>
                <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div>
                    <label for="byr-jml-{u.id}" class="mb-1 block text-xs text-on-variant">
                      {isPiutang ? 'Jumlah Diterima (Rp)' : 'Jumlah Bayar (Rp)'}
                    </label>
                    <RupiahInput
                      id="byr-jml-{u.id}"
                      bind:value={bayarJumlah}
                      placeholder="500.000"
                      class="w-full rounded-lg bg-lowest px-3 py-2 text-sm text-on-surface outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                  <div>
                    <label for="byr-tgl-{u.id}" class="mb-1 block text-xs text-on-variant">Tanggal Bayar</label>
                    <input
                      id="byr-tgl-{u.id}"
                      type="date"
                      bind:value={bayarTanggal}
                      class="w-full rounded-lg bg-lowest px-3 py-2 text-sm text-on-surface outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                </div>
                <div class="mt-1 flex justify-end gap-2">
                  <button onclick={() => (bayarId = null)} class="rounded-lg px-4 py-1.5 text-sm text-on-variant hover:bg-surface-container">
                    Batal
                  </button>
                  <button
                    onclick={() => bayar(u.id)}
                    class="rounded-lg bg-primary px-4 py-1.5 text-sm font-medium text-on-primary"
                  >
                    {isPiutang ? 'Simpan Penerimaan' : 'Simpan Pembayaran'}
                  </button>
                </div>
              </div>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  {/if}
</div>
