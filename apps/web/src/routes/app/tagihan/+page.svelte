<script lang="ts">
  import { api, rupiah } from '$lib/api';
  import { onMount } from 'svelte';
  import RupiahInput from '$lib/components/RupiahInput.svelte';
  let { data } = $props();

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

  let bulan = $state(data.bulan);
  let daftar = $state<Tagihan[]>(data.daftar);
  let kategoris = $state<Kategori[]>(data.kategoris);
  let dompets = $state<Dompet[]>(data.dompets);
  let via: Record<number, string> = $state(data.via);
  let role = $state(data.role);
  let memuat = $state(false);
  let galat = $state('');
  let galatForm = $state('');
  let galatBayar = $state('');
  let tambahBuka = $state(false);

  let nama = $state('');
  let jumlah = $state<number | null>(null);
  let hari = $state('10');
  let idKategori = $state('');
  let catatan = $state('');
  let menyimpan = $state(false);
  let membayarId = $state<number | null>(null);
  let dompetPilih: Record<number, string> = $state(data.dompetPilih);

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

  /** True hanya kalau tagihan belum lunas dan lewat dari tanggal jatuh tempo. */
  function lewatTempo(t: Tagihan) {
    if (t.lunas) return false;
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return tglJatuhTempo(t).getTime() < now.getTime();
  }

  function labelTempo(t: Tagihan) {
    const d = tglJatuhTempo(t);
    const s = d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
    if (t.lunas) return `Jatuh tempo: ${s} (Lunas)`;
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const sel = Math.round((d.getTime() - now.getTime()) / 86400000);
    if (sel < 0) return `Jatuh tempo: ${s} (Telat ${-sel} hari)`;
    if (sel === 0) return `Jatuh tempo: ${s} (Hari ini)`;
    if (sel <= 5) return `Jatuh tempo: ${s} (${sel} hari lagi)`;
    return `Jatuh tempo: ${s}`;
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
      const [list, kat, dom] = await Promise.all([
        api<Tagihan[]>(`/api/tagihan?bulan=${bulan}`),
        api<Kategori[]>('/api/kategori?tipe=keluar').catch(() => [] as Kategori[]),
        api<Dompet[]>('/api/dompet').catch(() => [] as Dompet[])
      ]);
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

  async function tambah(e: SubmitEvent) {
    e.preventDefault();
    galatForm = '';
    const j = jumlah ?? 0;
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
      nama = ''; jumlah = null; hari = '10'; idKategori = ''; catatan = '';
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

<div class="mx-auto w-full max-w-2xl md:max-w-4xl">
  <!-- Kepala: nama halaman, status, sakelar form admin. -->
  <div class="flex items-start justify-between gap-3">
    <div class="min-w-0">
      <h1 class="text-[19px] font-extrabold tracking-tight">Tagihan</h1>
      <p class="mt-0.5 truncate text-[13px] text-ink-3">
        {memuat ? 'Memuat…' : 'Pengeluaran rutin keluarga.'}
      </p>
    </div>
    {#if role === 'admin'}
      <button
        type="button"
        onclick={() => (tambahBuka = !tambahBuka)}
        aria-expanded={tambahBuka}
        class="btn btn-primary mt-0.5 shrink-0"
      >
        {tambahBuka ? 'Batal' : 'Tambah tagihan'}
      </button>
    {/if}
  </div>

  <!-- Pemilih bulan: tiga bulan, yang dipilih jadi isian hijau. -->
  <div class="card mt-4 p-1.5">
    <div class="flex items-stretch gap-1.5" role="group" aria-label="Pilih bulan tagihan">
      {#each [-1, 0, 1] as d}
        {@const b = geser(bulan, d)}
        <button
          type="button"
          onclick={() => pilih(b)}
          aria-pressed={b === bulan}
          class="flex min-h-11 flex-1 items-center justify-center rounded-xl px-1.5 transition-colors {b === bulan
            ? 'bg-accent-soft font-bold text-accent-ink'
            : 'font-semibold text-ink-2 hover:bg-sunk'}"
        >
          <span class="truncate">{d === 0 ? labelBulan(b) : labelPendek(b)}</span>
        </button>
      {/each}
    </div>
  </div>

  <!-- Total bulan berjalan: satu angka besar, meter, lalu rincian lunas dan belum. -->
  <section class="card mt-3 p-5">
    <p class="label">Total tagihan {labelBulan(bulan)}</p>
    <div class="figure mt-1.5 text-[clamp(2rem,9vw,3rem)]">{rupiah(total)}</div>

    {#if total > 0}
      <div class="mt-4">
        <div class="flex items-baseline justify-between gap-3 text-[13px]">
          <span class="font-semibold text-ink-2">{persenLunas}% sudah lunas</span>
          <span class="font-semibold text-ink-3">{daftar.length} tagihan</span>
        </div>
        <div class="meter mt-2">
          <span style="width:{persenLunas}%"></span>
        </div>
      </div>
    {:else}
      <p class="mt-3 text-sm leading-relaxed text-ink-3">
        Belum ada tagihan yang tercatat pada bulan ini.
      </p>
    {/if}

    <div class="rows mt-4">
      <div class="row !min-h-0 !py-2.5">
        <span class="chip chip-accent shrink-0">Lunas</span>
        <span class="min-w-0 truncate text-sm text-ink-2">{lunasList.length} tagihan</span>
        <span class="amount money text-sm font-bold text-accent-ink">{rupiah(totalLunas)}</span>
      </div>
      <div class="row !min-h-0 !py-2.5">
        <span class="chip chip-quiet shrink-0">Belum</span>
        <span class="min-w-0 truncate text-sm text-ink-2">{belumList.length} tagihan</span>
        <span class="amount money text-sm font-bold">{rupiah(totalBelum)}</span>
      </div>
    </div>
  </section>

  <!-- Form admin: hanya admin, hanya saat dibuka. Kartu tersendiri, bukan di dalam daftar. -->
  {#if tambahBuka && role === 'admin'}
    <section class="card mt-3 p-5">
      <h2 class="head">Tambah tagihan rutin</h2>
      <p class="mt-1.5 text-sm leading-relaxed text-ink-2">
        Sekali ditambah, tagihan ini tercatat otomatis setiap bulan dengan nominal yang sama.
      </p>

      <form onsubmit={tambah} class="mt-4 flex flex-col gap-3.5">
        {#if galatForm}
          <p role="alert" class="notice notice-alert">{galatForm}</p>
        {/if}

        <div>
          <label for="tag-nama" class="label block">Nama tagihan</label>
          <input
            id="tag-nama"
            bind:value={nama}
            placeholder="Contoh: Listrik PLN"
            required
            class="input mt-1.5"
          />
        </div>

        <div>
          <label for="tag-jumlah" class="label block">Nominal (Rp)</label>
          <RupiahInput
            id="tag-jumlah"
            bind:value={jumlah}
            placeholder="500.000"
            required
            class="input money mt-1.5"
          />
        </div>

        <div class="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
          <div>
            <label for="tag-hari" class="label block">Jatuh tempo, hari 1–31</label>
            <input
              id="tag-hari"
              type="number"
              min="1"
              max="31"
              bind:value={hari}
              placeholder="10"
              required
              class="input money mt-1.5"
            />
          </div>
          <div>
            <label for="tag-kat" class="label block">Kategori</label>
            <select id="tag-kat" bind:value={idKategori} required class="input mt-1.5">
              <option value="">Pilih kategori</option>
              {#each kategoris as k (k.id)}
                <option value={k.id}>{k.nama}</option>
              {/each}
            </select>
          </div>
        </div>

        <div>
          <label for="tag-catatan" class="label block">Catatan</label>
          <input
            id="tag-catatan"
            bind:value={catatan}
            placeholder="Opsional"
            class="input mt-1.5"
          />
        </div>

        <div class="mt-1 flex items-center gap-2">
          <button type="button" onclick={() => (tambahBuka = false)} class="btn flex-1">Batal</button>
          <button type="submit" disabled={menyimpan} class="btn btn-primary flex-1">
            {menyimpan ? 'Menyimpan…' : 'Simpan tagihan'}
          </button>
        </div>
      </form>
    </section>
  {/if}

  {#if memuat}
    <!-- Kerangka: kartu tetap, isinya garis sunk yang berdenyut. -->
    <section class="mt-7 mb-2" aria-busy="true">
      <h2 class="head">Daftar tagihan</h2>
      <p class="label mt-1.5">Memuat…</p>
      <div class="card rows mt-3 animate-pulse px-4 md:px-5">
        {#each [1, 2, 3] as i (i)}
          <div class="row flex-col !items-stretch !gap-2.5">
            <div class="h-4 w-2/5 rounded-full bg-sunk"></div>
            <div class="h-3 w-3/5 rounded-full bg-sunk"></div>
            <div class="h-10 w-full rounded-xl bg-sunk"></div>
          </div>
        {/each}
      </div>
    </section>
  {:else}
    <section class="mt-7 mb-2">
      <div class="flex items-baseline justify-between gap-3">
        <h2 class="head">Daftar tagihan</h2>
        <span class="label">{daftar.length} tagihan</span>
      </div>

      {#if galat}
        <div class="notice notice-alert mt-3 flex items-center justify-between gap-3">
          <span role="alert">{galat}</span>
          <button type="button" onclick={muat} class="btn btn-ghost shrink-0 !min-h-9 !px-3 text-sm">
            Coba lagi
          </button>
        </div>
      {/if}
      {#if galatBayar}
        <p role="alert" class="notice notice-alert {galat ? 'mt-2' : 'mt-3'}">{galatBayar}</p>
      {/if}

      {#if daftar.length === 0}
        <div class="card mt-3 p-5">
          <p class="text-[15px] font-bold">Belum ada tagihan bulan ini</p>
          <p class="mt-1.5 text-sm leading-relaxed text-ink-2">
            {#if role === 'admin'}
              Tambahkan tagihan rutin lewat tombol Tambah tagihan. Nominal yang sama akan tercatat
              otomatis setiap bulan.
            {:else}
              Belum ada tagihan rutin yang terdaftar. Minta admin untuk menambahkannya.
            {/if}
          </p>
        </div>
      {:else}
        <div class="card rows mt-3 px-4 md:px-5">
          {#each daftar as t (t.id)}
            {@const lewat = lewatTempo(t)}
            <div class="row flex-col !items-stretch !gap-3 py-4">
              <div class="flex w-full items-start justify-between gap-3">
                <div class="min-w-0 flex-1">
                  <p class="truncate text-[15px] font-bold">{t.nama}</p>
                  <p
                    class="mt-0.5 truncate text-[12px] {lewat
                      ? 'font-semibold text-alert'
                      : dekat(t)
                        ? 'font-semibold text-ink-2'
                        : 'text-ink-3'}"
                  >
                    {labelTempo(t)}
                  </p>
                  <p class="mt-0.5 truncate text-[12px] text-ink-3">
                    {t.kategori}{#if t.catatan} · {t.catatan}{/if}
                  </p>
                </div>
                <div class="flex shrink-0 flex-col items-end gap-1.5">
                  <span class="amount money text-[15px] font-bold">{rupiah(t.jumlah)}</span>
                  <span class="chip {t.lunas ? 'chip-accent' : lewat ? 'chip-alert' : 'chip-quiet'}">
                    {t.lunas ? 'Lunas' : lewat ? 'Terlambat' : 'Belum'}
                  </span>
                </div>
              </div>

              <div class="flex w-full flex-col gap-2.5">
                {#if t.lunas}
                  <p class="min-w-0 text-[13px] leading-snug text-ink-2">
                    {via[t.id] ? `Dibayar melalui dompet ${via[t.id]}` : 'Sudah lunas bulan ini'}
                  </p>
                  {#if role === 'admin'}
                    <button type="button" onclick={() => hapus(t.id)} class="btn btn-danger self-start">
                      Hapus
                    </button>
                  {/if}
                {:else}
                  {#if dompets.length > 1}
                    <div>
                      <label class="label block" for="dompet-{t.id}">Dompet sumber</label>
                      <select id="dompet-{t.id}" bind:value={dompetPilih[t.id]} class="input mt-1.5">
                        {#each dompets as d (idDompet(d))}
                          <option value={idDompet(d)}>{namaDompet(d)}</option>
                        {/each}
                      </select>
                    </div>
                  {/if}
                  <div class="flex items-center gap-2">
                    <button
                      type="button"
                      onclick={() => bayar(t)}
                      disabled={membayarId === t.id}
                      class="btn btn-primary flex-1"
                    >
                      {membayarId === t.id ? 'Memproses…' : 'Bayar bulan ini'}
                    </button>
                    {#if role === 'admin'}
                      <button
                        type="button"
                        onclick={() => hapus(t.id)}
                        class="btn btn-danger shrink-0"
                      >
                        Hapus
                      </button>
                    {/if}
                  </div>
                {/if}
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </section>
  {/if}
</div>
