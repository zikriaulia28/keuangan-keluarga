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

  function ikonKategori(nama: string) {
    const n = nama.toLowerCase();
    if (/belanja|pasar|grocery|dapur|sembako/.test(n)) return 'shopping_cart';
    if (/tagihan|listrik|utilitas|air|pulsa/.test(n)) return 'bolt';
    if (/transport|bensin|kendaraan|ojek|parkir/.test(n)) return 'directions_car';
    if (/hiburan|rekreasi|film|wisata|game/.test(n)) return 'movie';
    if (/sehat|kesehatan|obat|dokter|klinik/.test(n)) return 'medical_services';
    if (/didik|sekolah|kuliah|kursus|buku/.test(n)) return 'school';
    if (/rumah|kontrak|kos|sewa/.test(n)) return 'home';
    if (/makan|minum|kuliner|resto|kafe/.test(n)) return 'restaurant';
    return 'category';
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

<div class="mx-auto w-full max-w-5xl px-4 pb-24 font-sans md:px-8">
  <div class="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
    <div>
      <h1 class="text-2xl font-bold text-on-surface">Anggaran Keluarga</h1>
      <p class="text-sm text-on-variant">Pantau batas pengeluaran bulanan agar keuangan tetap sehat.</p>
    </div>
    <div class="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
      {#each [-1, 0, 1] as d}
        {@const b = geser(bulan, d)}
        <button
          onclick={() => pilih(b)}
          class="shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-all {b === bulan
            ? 'bg-primary text-on-primary shadow-sm'
            : 'bg-surface-container text-on-variant hover:bg-surface-high'}"
        >
          {labelBulan(b)}
        </button>
      {/each}
    </div>
  </div>

  {#if memuat}
    <div class="animate-pulse rounded-xl bg-lowest p-6 shadow-sm">
      <div class="h-6 w-1/3 rounded bg-surface-container"></div>
      <div class="mt-3 h-8 w-1/2 rounded bg-surface-container"></div>
      <div class="mt-4 h-3 w-full rounded-full bg-surface-container"></div>
    </div>
    <p class="mt-3 text-sm text-on-variant">Memuat…</p>
  {:else}
    {#if galat}<p class="mb-3 rounded-xl bg-expense-soft px-4 py-3 text-sm text-error">{galat}</p>{/if}

    <section class="flex flex-col gap-4 rounded-xl bg-lowest p-6 shadow-sm md:flex-row md:items-center md:justify-between">
      <div class="flex items-center gap-4">
        <div class="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary text-on-primary">
          <span class="material-symbols-outlined text-[28px]">pie_chart</span>
        </div>
        <div>
          <span class="text-xs font-medium uppercase tracking-wider text-on-variant">Total Anggaran Bulan Ini</span>
          <div class="text-2xl font-semibold text-on-surface">{rupiah(totalBatas)}</div>
          <p class="text-sm font-medium text-income-deep">Terpakai {rupiah(totalPakai)} ({persen}%)</p>
        </div>
      </div>
      <div class="flex w-full flex-col gap-1 md:w-64">
        <div class="flex justify-between text-sm">
          <span class="text-on-variant">Sisa Anggaran</span>
          <span class="font-semibold text-on-surface">{rupiah(sisa)}</span>
        </div>
        <div class="h-3 w-full overflow-hidden rounded-full bg-surface-container">
          <div
            class="h-full rounded-full transition-all duration-500 {persen >= 100 ? 'bg-expense' : 'bg-income'}"
            style="width: {Math.min(persen, 100)}%;"
          ></div>
        </div>
      </div>
    </section>

    {#if role === 'admin'}
      <section class="mt-4 flex flex-col gap-4 rounded-xl bg-lowest p-6 shadow-sm">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <div class="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-on-primary">
              <span class="material-symbols-outlined text-[18px]">edit_note</span>
            </div>
            <h2 class="text-lg font-semibold text-on-surface">Form Atur Batas Anggaran</h2>
          </div>
          <span class="rounded-full bg-primary px-2 py-1 text-xs font-medium text-on-primary-container">Khusus Admin</span>
        </div>
        <form onsubmit={simpan} class="grid grid-cols-1 items-end gap-4 sm:grid-cols-3">
          <div class="flex flex-col gap-1">
            <label for="agg-kat" class="text-sm font-medium text-on-variant">Kategori</label>
            <select
              id="agg-kat"
              bind:value={idKategori}
              required
              class="rounded-lg bg-surface-low px-4 py-3 text-sm text-on-surface outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">— pilih —</option>
              {#each kategoris as k}
                <option value={k.id}>{k.nama}</option>
              {/each}
            </select>
          </div>
          <div class="flex flex-col gap-1">
            <label for="agg-batas" class="text-sm font-medium text-on-variant">Batas Maksimal (Rp)</label>
            <RupiahInput
              id="agg-batas"
              bind:value={batas}
              placeholder="500.000"
              required
              class="rounded-lg bg-surface-low px-4 py-3 text-sm text-on-surface outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <div>
            <button
              type="submit"
              disabled={menyimpan}
              class="flex w-full items-center justify-center gap-1 rounded-lg bg-primary px-4 py-3 text-sm font-medium text-on-primary shadow-md transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-60"
            >
              <span class="material-symbols-outlined text-[18px]">save</span>
              {menyimpan ? 'Menyimpan…' : 'Simpan Anggaran'}
            </button>
          </div>
        </form>
        {#if galatForm}<p class="rounded-xl bg-expense-soft px-4 py-2 text-sm text-error">{galatForm}</p>{/if}
      </section>
    {/if}

    <section class="mt-6 flex flex-col gap-4">
      <div class="flex items-center justify-between">
        <h2 class="text-lg font-semibold text-on-surface">Daftar Batas Anggaran Kategori</h2>
        <span class="text-sm text-on-variant">{daftar.length} Kategori Terdaftar</span>
      </div>
      {#if daftar.length === 0}
        <div class="flex flex-col items-center gap-2 rounded-xl bg-lowest p-8 text-center shadow-sm">
          <span class="material-symbols-outlined text-[32px] text-outline">savings</span>
          <p class="font-medium text-on-surface">Belum ada anggaran bulan ini</p>
          <p class="text-sm text-on-variant">Admin bisa menambahkan batas per kategori lewat form di atas.</p>
        </div>
      {:else}
        <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
          {#each daftar as a}
            {@const p = persenItem(a)}
            {@const isLewat = lewat(a)}
            <div class="flex flex-col gap-3 rounded-xl bg-lowest p-6 shadow-sm">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-3">
                  <div
                    class="flex h-10 w-10 items-center justify-center rounded-xl {isLewat
                      ? 'bg-expense-soft text-expense-deep'
                      : 'bg-primary text-on-primary'}"
                  >
                    <span class="material-symbols-outlined text-[20px]">{ikonKategori(a.kategori)}</span>
                  </div>
                  <div>
                    <h3 class="font-semibold text-on-surface">{a.kategori}</h3>
                    <p class="text-sm text-on-variant">Terpakai {rupiah(dipakai(a))} dari</p>
                  </div>
                </div>
                <div class="flex items-center gap-2">
                  <span
                    class="rounded-full px-2 py-1 text-xs font-semibold {isLewat
                      ? 'bg-expense-soft text-expense-deep'
                      : 'bg-income-soft text-income-deep'}"
                  >
                    {isLewat ? 'LEWAT' : 'Aman'}
                  </span>
                  {#if role === 'admin'}
                    <button
                      onclick={() => hapus(a.id)}
                      title="Hapus"
                      class="rounded-lg p-2 text-on-variant transition-colors hover:bg-surface-container hover:text-expense"
                    >
                      <span class="material-symbols-outlined text-[18px]">delete</span>
                    </button>
                  {/if}
                </div>
              </div>
              <div class="flex items-center justify-between text-sm font-medium">
                <span class="text-on-variant">{rupiah(a.batas)}</span>
                <span class="font-bold {isLewat ? 'text-error' : 'text-income-deep'}">{p}%</span>
              </div>
              <div class="h-2.5 w-full overflow-hidden rounded-full bg-surface-container">
                <div
                  class="h-full rounded-full {isLewat ? 'bg-expense' : 'bg-income'}"
                  style="width: {Math.min(p, 100)}%;"
                ></div>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </section>
  {/if}
</div>
