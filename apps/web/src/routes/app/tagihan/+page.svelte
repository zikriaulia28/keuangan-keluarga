<script lang="ts">
  import { api, rupiah } from '$lib/api';
  import { onMount } from 'svelte';

  type Tagihan = {
    id: number; nama: string; jumlah: number; hari: number;
    catatan?: string | null; kategori: string; lunas: boolean;
  };
  type Kategori = { id: number; nama: string; tipe: string };
  type Dompet = { id?: number; id_dompet?: number; nama?: string; nama_dompet?: string; saldo: number };
  type Transaksi = { catatan: string; dompet: string };

  const NAMA_BULAN = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
  ];
  const NAMA_BULAN_PENDEK = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

  const sekarang = new Date();
  let bulan = $state(`${sekarang.getFullYear()}-${String(sekarang.getMonth() + 1).padStart(2, '0')}`);
  let daftar = $state<Tagihan[]>([]);
  let kategoris = $state<Kategori[]>([]);
  let dompets = $state<Dompet[]>([]);
  let via: Record<number, string> = $state({});
  let role = $state('');
  let memuat = $state(true);
  let galat = $state('');
  let galatForm = $state('');
  let galatBayar = $state('');
  let tambahBuka = $state(false);

  let nama = $state('');
  let jumlah = $state('');
  let hari = $state('10');
  let idKategori = $state('');
  let catatan = $state('');
  let menyimpan = $state(false);
  let membayarId = $state<number | null>(null);

  let dompetPilih: Record<number, string> = $state({});

  const total = $derived(daftar.reduce((s, t) => s + t.jumlah, 0));
  const lunasList = $derived(daftar.filter((t) => t.lunas));
  const belumList = $derived(daftar.filter((t) => !t.lunas));
  const totalLunas = $derived(lunasList.reduce((s, t) => s + t.jumlah, 0));
  const totalBelum = $derived(belumList.reduce((s, t) => s + t.jumlah, 0));
  const persenLunas = $derived(total > 0 ? Math.round((totalLunas / total) * 100) : 0);

  function geser(b: string, d: number) {
    const [y, m] = b.split('-').map(Number);
    const dt = new Date(y, m - 1 + d, 1);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
  }
  function labelBulan(b: string) {
    const [y, m] = b.split('-').map(Number);
    return `${NAMA_BULAN[m - 1]} ${y}`;
  }
  function labelPendek(b: string) {
    const [y, m] = b.split('-').map(Number);
    return `${NAMA_BULAN_PENDEK[m - 1]} ${y}`;
  }
  function pilih(b: string) {
    if (b === bulan) return;
    bulan = b;
    muat();
  }

  function idDompet(d: Dompet) {
    return d.id ?? d.id_dompet ?? 0;
  }
  function namaDompet(d: Dompet) {
    return d.nama ?? d.nama_dompet ?? `Dompet ${idDompet(d)}`;
  }

  function ikonTagihan(t: Tagihan) {
    const n = `${t.nama} ${t.kategori}`.toLowerCase();
    if (/listrik|pln|token/.test(n)) return 'bolt';
    if (/internet|wifi|tv|kabel|langganan/.test(n)) return 'wifi';
    if (/air|pdam/.test(n)) return 'water_drop';
    if (/kendaraan|cicilan|motor|mobil|kredit/.test(n)) return 'directions_car';
    if (/rumah|kos|kontrakan|sewa/.test(n)) return 'home';
    if (/sekolah|kuliah|pendidikan|spp/.test(n)) return 'school';
    if (/asuransi|kesehatan|bpjs/.test(n)) return 'medical_services';
    if (/pajak|pbb|retribusi/.test(n)) return 'receipt';
    return 'receipt_long';
  }

  function tglJatuhTempo(t: Tagihan) {
    const [y, m] = bulan.split('-').map(Number);
    const maxHari = new Date(y, m, 0).getDate();
    return new Date(y, m - 1, Math.min(t.hari, maxHari));
  }

  function dekat(t: Tagihan) {
    if (t.lunas) return false;
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const d = tglJatuhTempo(t);
    const sel = Math.round((d.getTime() - now.getTime()) / 86400000);
    return sel <= 5;
  }

  function labelTempo(t: Tagihan) {
    const d = tglJatuhTempo(t);
    const s = d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
    if (t.lunas || !dekat(t)) return `Jatuh tempo: ${s}`;
    return `Jatuh tempo: ${s} (Segera)`;
  }

  function pesan(e: unknown, baku: string) {
    const m = e instanceof Error ? e.message : baku;
    if (m === 'FORBIDDEN') return 'Akses ditolak.';
    if (m === 'ALREADY_PAID') return 'Tagihan ini sudah dibayar bulan ini.';
    if (m === 'INSUFFICIENT_BALANCE') return 'Saldo dompet tidak cukup.';
    if (m === 'INVALID_WALLET') return 'Dompet tidak valid.';
    if (m === 'NOT_FOUND') return 'Data tidak ditemukan.';
    return m || baku;
  }

  async function muat() {
    memuat = true;
    galat = '';
    galatBayar = '';
    try {
      const [me, list, kat, dom] = await Promise.all([
        api<{ role: string }>('/api/me'),
        api<Tagihan[]>(`/api/tagihan?bulan=${bulan}`),
        api<Kategori[]>('/api/kategori?tipe=keluar').catch(() => [] as Kategori[]),
        api<Dompet[]>('/api/dompet').catch(() => [] as Dompet[])
      ]);
      role = me.role;
      daftar = list;
      kategoris = kat;
      dompets = dom;
      for (const t of list) {
        if (!dompetPilih[t.id] && dom.length > 0) dompetPilih[t.id] = String(idDompet(dom[0]));
      }
      // Dompet sumber pembayaran: cocokkan transaksi "Tagihan <nama> <bulan>" bulan ini.
      try {
        const [y, m] = bulan.split('-').map(Number);
        const last = new Date(y, m, 0).getDate();
        const tr = await api<Transaksi[]>(
          `/api/transaksi?from=${bulan}-01&to=${bulan}-${String(last).padStart(2, '0')}&tipe=keluar&limit=500`
        );
        const map: Record<number, string> = {};
        for (const t of list) {
          if (!t.lunas) continue;
          const hit = tr.find((x) => x.catatan === `Tagihan ${t.nama} ${bulan}`);
          if (hit) map[t.id] = hit.dompet;
        }
        via = map;
      } catch {
        via = {};
      }
    } catch (e) {
      galat = pesan(e, 'Gagal memuat tagihan.');
    } finally {
      memuat = false;
    }
  }

  onMount(muat);

  async function tambah(e: SubmitEvent) {
    e.preventDefault();
    galatForm = '';
    const j = Number(jumlah);
    const h = Number(hari);
    if (!nama.trim() || !(j > 0) || !(h >= 1 && h <= 31) || !idKategori) {
      galatForm = 'Isi nama, jumlah, hari 1–31, dan kategori.';
      return;
    }
    menyimpan = true;
    try {
      await api('/api/tagihan', {
        method: 'POST',
        body: JSON.stringify({
          nama: nama.trim(), jumlah: j, hari: h, id_kategori: Number(idKategori),
          ...(catatan.trim() ? { catatan: catatan.trim() } : {})
        })
      });
      nama = ''; jumlah = ''; hari = '10'; idKategori = ''; catatan = '';
      tambahBuka = false;
      await muat();
    } catch (e2) {
      galatForm = pesan(e2, 'Gagal menambah.');
    } finally {
      menyimpan = false;
    }
  }

  async function bayar(t: Tagihan) {
    galatBayar = '';
    const idd = Number(dompetPilih[t.id]);
    if (!idd) {
      galatBayar = 'Pilih dompet dulu.';
      return;
    }
    membayarId = t.id;
    try {
      await api(`/api/tagihan/${t.id}/bayar`, {
        method: 'POST',
        body: JSON.stringify({ id_dompet: idd, bulan })
      });
      await muat();
    } catch (e) {
      galatBayar = pesan(e, 'Gagal membayar.');
    } finally {
      membayarId = null;
    }
  }

  async function hapus(id: number) {
    galat = '';
    try {
      await api(`/api/tagihan/${id}`, { method: 'DELETE' });
      daftar = daftar.filter((t) => t.id !== id);
    } catch (e) {
      galat = pesan(e, 'Gagal menghapus.');
    }
  }
</script>

<div class="mx-auto w-full max-w-5xl px-4 pb-24 font-sans md:px-8">
  <div class="mb-4 flex flex-col gap-4">
    <div class="flex items-center justify-between gap-2">
      <div>
        <h1 class="text-2xl font-bold text-on-surface">Tagihan Bulanan</h1>
        <p class="text-sm text-on-variant">Kelola pengeluaran rutin keluarga tepat waktu</p>
      </div>
      {#if role === 'admin'}
        <button
          onclick={() => (tambahBuka = !tambahBuka)}
          class="flex shrink-0 items-center gap-1 rounded-xl bg-primary-bright px-4 py-2 text-sm font-medium text-on-primary shadow-sm transition-opacity hover:opacity-90"
        >
          <span class="material-symbols-outlined text-[20px]">{tambahBuka ? 'close' : 'add'}</span>
          <span>Tambah Master</span>
        </button>
      {/if}
    </div>
    <div class="flex items-center gap-2 overflow-x-auto py-1">
      {#each [-1, 0, 1] as d}
        {@const b = geser(bulan, d)}
        <button
          onclick={() => pilih(b)}
          class="shrink-0 rounded-xl px-4 py-2 text-sm font-medium transition-colors {b === bulan
            ? 'bg-primary text-on-primary shadow-sm'
            : 'bg-surface-container text-on-variant'}"
        >
          {d === 0 ? labelBulan(b) : labelPendek(b)}
        </button>
      {/each}
    </div>

    {#if tambahBuka && role === 'admin'}
      <section class="rounded-2xl bg-lowest p-6 shadow-sm">
        <h2 class="mb-4 text-lg font-semibold text-on-surface">Tambah Tagihan Master</h2>
        <form onsubmit={tambah} class="flex flex-col gap-4">
          {#if galatForm}<p class="rounded-xl bg-expense-soft px-4 py-2 text-sm text-error">{galatForm}</p>{/if}
          <div>
            <label for="tag-nama" class="mb-1 block text-sm font-medium text-on-surface">Nama Tagihan</label>
            <input
              id="tag-nama"
              bind:value={nama}
              placeholder="Contoh: Cicilan Rumah, Asuransi Kesehatan"
              required
              class="w-full rounded-xl bg-surface-container p-3 text-sm text-on-surface outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label for="tag-jumlah" class="mb-1 block text-sm font-medium text-on-surface">Nominal Perkiraan (Rp)</label>
              <input
                id="tag-jumlah"
                type="number"
                min="1"
                bind:value={jumlah}
                placeholder="500000"
                required
                class="w-full rounded-xl bg-surface-container p-3 text-sm text-on-surface outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label for="tag-hari" class="mb-1 block text-sm font-medium text-on-surface">Tanggal Jatuh Tempo Bulanan</label>
              <input
                id="tag-hari"
                type="number"
                min="1"
                max="31"
                bind:value={hari}
                placeholder="10"
                required
                class="w-full rounded-xl bg-surface-container p-3 text-sm text-on-surface outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>
          <div>
            <label for="tag-kat" class="mb-1 block text-sm font-medium text-on-surface">Kategori</label>
            <select
              id="tag-kat"
              bind:value={idKategori}
              required
              class="w-full rounded-xl bg-surface-container p-3 text-sm text-on-surface outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">— pilih —</option>
              {#each kategoris as k}
                <option value={k.id}>{k.nama}</option>
              {/each}
            </select>
          </div>
          <div>
            <label for="tag-catatan" class="mb-1 block text-sm font-medium text-on-surface">Catatan</label>
            <input
              id="tag-catatan"
              bind:value={catatan}
              placeholder="Opsional"
              class="w-full rounded-xl bg-surface-container p-3 text-sm text-on-surface outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <div class="flex items-center gap-2 pt-1">
            <button
              type="button"
              onclick={() => (tambahBuka = false)}
              class="flex-1 rounded-xl bg-surface-container py-3 text-sm font-medium text-on-variant"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={menyimpan}
              class="flex-1 rounded-xl bg-primary py-3 text-sm font-medium text-on-primary shadow-sm disabled:opacity-60"
            >
              {menyimpan ? 'Menyimpan…' : 'Simpan Master'}
            </button>
          </div>
        </form>
      </section>
    {/if}

    <section class="flex flex-col gap-3 rounded-xl bg-lowest p-6 shadow-sm">
      <div class="flex items-center justify-between">
        <div>
          <span class="text-sm text-on-variant">Total Tagihan {labelBulan(bulan)}</span>
          <h2 class="text-2xl font-semibold text-on-surface">{rupiah(total)}</h2>
        </div>
        <div class="flex h-12 w-12 items-center justify-center rounded-full bg-income-soft text-income-deep">
          <span class="material-symbols-outlined text-[24px]">payments</span>
        </div>
      </div>
      <div class="h-2 w-full overflow-hidden rounded-full bg-surface-container">
        <div class="h-full bg-income" style="width: {persenLunas}%;"></div>
      </div>
      <div class="flex justify-between text-sm text-on-variant">
        <span class="flex items-center gap-1">
          <span class="h-2 w-2 rounded-full bg-income"></span>
          Lunas: {rupiah(totalLunas)} ({lunasList.length})
        </span>
        <span class="flex items-center gap-1">
          <span class="h-2 w-2 rounded-full bg-surface-high"></span>
          Belum: {rupiah(totalBelum)} ({belumList.length})
        </span>
      </div>
    </section>
  </div>

  {#if memuat}
    <div class="flex flex-col gap-4">
      {#each [1, 2, 3] as _}
        <div class="animate-pulse rounded-xl bg-lowest p-4 shadow-sm">
          <div class="h-5 w-1/3 rounded bg-surface-container"></div>
          <div class="mt-3 h-8 rounded-lg bg-surface-container"></div>
        </div>
      {/each}
    </div>
    <p class="mt-3 text-sm text-on-variant">Memuat…</p>
  {:else}
    {#if galat}<p class="mb-3 rounded-xl bg-expense-soft px-4 py-3 text-sm text-error">{galat}</p>{/if}
    {#if galatBayar}<p class="mb-3 rounded-xl bg-expense-soft px-4 py-3 text-sm text-error">{galatBayar}</p>{/if}

    <div class="flex flex-col gap-4">
      <div class="flex items-center justify-between">
        <h3 class="text-lg font-semibold text-on-surface">Daftar Tagihan Rutin</h3>
        <span class="text-xs text-on-variant">{daftar.length} Tagihan Aktif</span>
      </div>
      {#if daftar.length === 0}
        <div class="flex flex-col items-center gap-2 rounded-xl bg-lowest p-8 text-center shadow-sm">
          <span class="material-symbols-outlined text-[32px] text-outline">receipt_long</span>
          <p class="font-medium text-on-surface">Tidak ada tagihan bulan ini</p>
          <p class="text-sm text-on-variant">Admin bisa menambah tagihan master lewat tombol di atas.</p>
        </div>
      {:else}
        {#each daftar as t}
          {@const isDekat = dekat(t)}
          <div class="flex flex-col gap-3 rounded-xl bg-lowest p-4 shadow-sm">
            <div class="flex items-start justify-between gap-2">
              <div class="flex items-center gap-3">
                <div
                  class="flex h-10 w-10 items-center justify-center rounded-xl {!t.lunas && isDekat
                    ? 'bg-expense-soft text-error'
                    : 'bg-surface-container text-primary'}"
                >
                  <span class="material-symbols-outlined text-[20px]">{ikonTagihan(t)}</span>
                </div>
                <div>
                  <h4 class="text-sm font-medium text-on-surface">{t.nama}</h4>
                  <p class="text-sm {isDekat ? 'font-medium text-expense' : 'text-on-variant'}">{labelTempo(t)}</p>
                  {#if t.catatan}<p class="text-xs text-on-variant">{t.catatan}</p>{/if}
                </div>
              </div>
              <div class="flex shrink-0 items-center gap-1">
                <span
                  class="rounded-full px-2 py-1 text-xs font-semibold {t.lunas
                    ? 'bg-income-soft text-income-deep'
                    : 'bg-expense-soft text-error'}"
                >
                  {t.lunas ? 'Lunas' : 'Belum'}
                </span>
                {#if role === 'admin'}
                  <button
                    onclick={() => hapus(t.id)}
                    title="Hapus"
                    class="rounded-lg p-2 text-on-variant transition-colors hover:text-expense"
                  >
                    <span class="material-symbols-outlined text-[18px]">delete</span>
                  </button>
                {/if}
              </div>
            </div>
            <div class="flex items-center justify-between border-t border-surface-container pt-3">
              <div>
                <span class="text-sm text-on-variant">Nominal</span>
                <p class="text-sm font-medium text-on-surface">{rupiah(t.jumlah)}</p>
              </div>
              {#if t.lunas}
                <div class="flex items-center gap-1 text-sm font-medium text-income">
                  <span class="material-symbols-outlined text-[16px]">check_circle</span>
                  <span>{via[t.id] ? `Dibayar via ${via[t.id]}` : 'Lunas bulan ini'}</span>
                </div>
              {:else}
                <div class="flex items-center gap-2">
                  {#if dompets.length > 1}
                    <select
                      bind:value={dompetPilih[t.id]}
                      aria-label="Dompet sumber"
                      class="max-w-32 rounded-xl bg-surface-container px-2 py-2 text-sm text-on-surface outline-none focus:ring-2 focus:ring-primary"
                    >
                      {#each dompets as d}
                        <option value={idDompet(d)}>{namaDompet(d)}</option>
                      {/each}
                    </select>
                  {/if}
                  <button
                    onclick={() => bayar(t)}
                    disabled={membayarId === t.id}
                    class="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-on-primary shadow-sm transition-opacity hover:opacity-90 disabled:opacity-60"
                  >
                    {membayarId === t.id ? 'Memproses…' : 'Bayar Bulan Ini'}
                  </button>
                </div>
              {/if}
            </div>
          </div>
        {/each}
      {/if}
    </div>
  {/if}
</div>
