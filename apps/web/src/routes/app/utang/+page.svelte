<script lang="ts">
  import { api, rupiah } from '$lib/api';
  import { onMount } from 'svelte';
  import RupiahInput from '$lib/components/RupiahInput.svelte';

  type Utang = {
    id: number; arah: string; pihak: string; jumlah: number; terbayar: number;
    sisa: number; lunas: boolean; tanggal: string; jatuhTempo?: string | null; catatan?: string | null;
  };
  type Dompet = { id_dompet: number; nama_dompet: string; saldo: number };

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
  let bayarDompet = $state('');
  let dompets = $state<Dompet[]>([]);

  const totalUtang = $derived(semua.filter((u) => u.arah !== 'piutang' && !u.lunas).reduce((s, u) => s + u.sisa, 0));
  const countUtang = $derived(semua.filter((u) => u.arah !== 'piutang' && !u.lunas).length);
  const totalPiutang = $derived(semua.filter((u) => u.arah === 'piutang' && !u.lunas).reduce((s, u) => s + u.sisa, 0));
  const countPiutang = $derived(semua.filter((u) => u.arah === 'piutang' && !u.lunas).length);

  function pesan(e: unknown, baku: string) {
    const m = e instanceof Error ? e.message : baku;
    if (m === 'FORBIDDEN') return 'Akses ditolak.';
    if (m === 'NOT_FOUND') return 'Data tidak ditemukan.';
    if (m === 'INSUFFICIENT_BALANCE') return 'Saldo dompet tidak cukup.';
    if (m === 'INVALID_WALLET' || m === 'NO_WALLET') return 'Dompet tidak valid.';
    if (m === 'OVERPAY') return 'Jumlah bayar melebihi sisa utang.';
    return m || baku;
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
      const [list, all, dom] = await Promise.all([
        api<Utang[]>(`/api/utang${qs ? `?${qs}` : ''}`),
        api<Utang[]>('/api/utang').catch(() => [] as Utang[]),
        api<Dompet[]>('/api/dompet').catch(() => [] as Dompet[])
      ]);
      daftar = list;
      semua = all;
      dompets = dom;
      if (!dom.some((d) => String(d.id_dompet) === bayarDompet)) {
        bayarDompet = dom.length > 0 ? String(dom[0].id_dompet) : '';
      }
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
    if (dompets.length > 0 && !bayarDompet) {
      galatBayar = 'Pilih dompet sumber dana.';
      return;
    }
    try {
      await api(`/api/utang/${id}/bayar`, {
        method: 'POST',
        body: JSON.stringify({
          jumlah: bayarJumlah,
          ...(bayarTanggal ? { tanggal: bayarTanggal } : {}),
          ...(bayarDompet ? { id_dompet: Number(bayarDompet) } : {})
        })
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

<div class="mx-auto w-full max-w-2xl md:max-w-4xl">
  <h1 class="text-[26px] font-extrabold tracking-tight">Utang &amp; Piutang</h1>
  <p class="mt-1.5 text-sm text-ink-2">Pinjaman dan piutang keluarga beserta cicilannya.</p>

  <button
    type="button"
    onclick={() => (tambahBuka = !tambahBuka)}
    aria-expanded={tambahBuka}
    class="btn btn-primary mt-4 w-full sm:w-auto"
  >
    {tambahBuka ? 'Tutup formulir' : 'Tambah utang atau piutang'}
  </button>

  <!-- Formulir tambah. -->
  {#if tambahBuka}
    <section class="card mt-3 p-4 md:p-5">
      <h2 class="head">Tambah utang atau piutang</h2>
      <p class="mt-1.5 text-[13px] leading-relaxed text-ink-3">
        Catat pihak, nominal, dan tanggal. Jatuh tempo boleh dikosongkan bila tidak ada tenggat.
      </p>

      <form onsubmit={tambah} class="mt-4 flex flex-col gap-3">
        {#if galatForm}
          <p class="notice notice-alert">{galatForm}</p>
        {/if}

        <div role="group" aria-label="Jenis arah">
          <p class="label mb-2">Jenis arah</p>
          <div class="grid grid-cols-2 gap-2">
            <button
              type="button"
              aria-pressed={arah === 'utang'}
              onclick={() => (arah = 'utang')}
              class="btn {arah === 'utang' ? 'btn-primary' : ''}"
            >
              Utang
            </button>
            <button
              type="button"
              aria-pressed={arah === 'piutang'}
              onclick={() => (arah = 'piutang')}
              class="btn {arah === 'piutang' ? 'btn-primary' : ''}"
            >
              Piutang
            </button>
          </div>
          <p class="mt-2 text-[12px] leading-snug text-ink-3">
            {arah === 'utang'
              ? 'Kita berutang kepada pihak.'
              : 'Orang berutang kepada kita.'}
          </p>
        </div>

        <div>
          <label for="ut-pihak" class="label mb-1.5 block">Pihak</label>
          <input
            id="ut-pihak"
            bind:value={pihak}
            placeholder="Contoh: Toko Elektronik"
            required
            class="input"
          />
        </div>

        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label for="ut-jumlah" class="label mb-1.5 block">Jumlah</label>
            <RupiahInput
              id="ut-jumlah"
              bind:value={jumlah}
              placeholder="1.000.000"
              required
              class="input money"
            />
          </div>
          <div>
            <label for="ut-tanggal" class="label mb-1.5 block">Tanggal</label>
            <input id="ut-tanggal" type="date" bind:value={tanggal} required class="input" />
          </div>
        </div>

        <div>
          <label for="ut-tempo" class="label mb-1.5 block">Jatuh tempo (opsional)</label>
          <input id="ut-tempo" type="date" bind:value={jatuhTempo} class="input" />
        </div>

        <div>
          <label for="ut-catatan" class="label mb-1.5 block">Catatan (opsional)</label>
          <input id="ut-catatan" bind:value={catatan} placeholder="Keterangan singkat" class="input" />
        </div>

        <div class="mt-1 flex gap-2">
          <button type="button" onclick={() => (tambahBuka = false)} class="btn btn-ghost flex-1">
            Batal
          </button>
          <button type="submit" disabled={menyimpan} class="btn btn-primary flex-1">
            {menyimpan ? 'Menyimpan…' : 'Simpan'}
          </button>
        </div>
      </form>
    </section>
  {/if}

  <!-- Dua angka utama. -->
  <section class="mt-3 grid grid-cols-2 gap-3">
    <div class="card p-4">
      <p class="label">Sisa utang aktif</p>
      <p class="money mt-1 text-[19px] font-extrabold">{rupiah(totalUtang)}</p>
      <p class="money mt-0.5 text-[12px] text-ink-3">{countUtang} catatan berjalan</p>
    </div>
    <div class="card p-4">
      <p class="label">Sisa piutang aktif</p>
      <p class="money mt-1 text-[19px] font-extrabold">{rupiah(totalPiutang)}</p>
      <p class="money mt-0.5 text-[12px] text-ink-3">{countPiutang} catatan berjalan</p>
    </div>
  </section>

  <!-- Filter arah dan status. -->
  <section class="card mt-3 p-3 md:p-4">
    <div role="group" aria-label="Filter arah">
      <div class="flex items-baseline justify-between gap-3">
        <p class="label">Arah</p>
        <span class="label">{semua.length} catatan</span>
      </div>
      <div class="mt-2 grid grid-cols-3 gap-1">
        {#each [['', 'Semua'], ['utang', 'Utang'], ['piutang', 'Piutang']] as [v, nama] (v)}
          <button
            type="button"
            aria-pressed={arahFilter === v}
            onclick={() => gantiArah(v)}
            class="btn !px-2 {arahFilter === v ? 'btn-primary' : ''}"
          >
            {nama}
            <span class="opacity-70">
              {v === '' ? semua.length : v === 'piutang'
                ? semua.filter((u) => u.arah === 'piutang').length
                : semua.filter((u) => u.arah !== 'piutang').length}
            </span>
          </button>
        {/each}
      </div>
    </div>

    <div role="group" aria-label="Filter status" class="mt-4">
      <p class="label">Status</p>
      <div class="mt-2 grid grid-cols-3 gap-1">
        {#each [['aktif', 'Aktif'], ['lunas', 'Lunas'], ['', 'Semua']] as [v, nama] (v)}
          <button
            type="button"
            aria-pressed={statusFilter === v}
            onclick={() => gantiStatus(v)}
            class="btn !px-2 {statusFilter === v ? 'btn-primary' : ''}"
          >
            {nama}
            <span class="opacity-70">
              {v === '' ? semua.length : v === 'lunas'
                ? semua.filter((u) => u.lunas).length
                : semua.filter((u) => !u.lunas).length}
            </span>
          </button>
        {/each}
      </div>
    </div>
  </section>

  {#if galat}
    <div class="notice notice-alert mt-3 flex items-center justify-between gap-3">
      <span>{galat}</span>
      <button type="button" onclick={muat} class="btn btn-ghost shrink-0 !min-h-9 !px-3">
        Coba lagi
      </button>
    </div>
  {/if}

  {#if galatBayar && bayarId === null}
    <p class="notice notice-alert mt-3">{galatBayar}</p>
  {/if}

  <!-- Daftar catatan. -->
  <section class="mt-7">
    <div class="flex items-baseline justify-between gap-3">
      <h2 class="head">Catatan</h2>
      <span class="label">{daftar.length} catatan</span>
    </div>

    {#if memuat}
      <p class="label mt-3">Memuat…</p>
      <div class="card rows mt-2 px-4 md:px-5" aria-busy="true">
        {#each [1, 2, 3] as i (i)}
          <div class="row flex-col !items-stretch !gap-2.5 motion-safe:animate-pulse">
            <div class="h-4 w-1/3 rounded bg-sunk"></div>
            <div class="h-3 w-1/2 rounded bg-sunk"></div>
            <div class="h-3 w-full rounded bg-sunk"></div>
          </div>
        {/each}
      </div>
    {:else if daftar.length === 0}
      <div class="card mt-3 p-5">
        {#if semua.length === 0}
          <p class="text-[15px] font-bold">Belum ada catatan</p>
          <p class="mt-1.5 text-sm leading-relaxed text-ink-2">
            Belum ada utang atau piutang yang tercatat. Tambahkan catatan pertama untuk mulai
            melacak sisa pinjaman.
          </p>
          {#if !tambahBuka}
            <button
              type="button"
              onclick={() => (tambahBuka = true)}
              class="btn btn-primary mt-4 w-full sm:w-auto"
            >
              Tambah utang atau piutang
            </button>
          {/if}
        {:else}
          <p class="text-[15px] font-bold">Tidak ada catatan pada filter ini</p>
          <p class="mt-1.5 text-sm leading-relaxed text-ink-2">
            Ubah filter arah atau status untuk melihat catatan lain.
          </p>
        {/if}
      </div>
    {:else}
      <div class="card rows mt-3 px-4 md:px-5">
        {#each daftar as u (u.id)}
          {@const isPiutang = u.arah === 'piutang'}
          {@const tempo = tenor(u.jatuhTempo)}
          {@const lewat = !u.lunas && tempo.startsWith('lewat')}
          <div class="row flex-col !items-stretch !gap-2.5">
            <div class="flex w-full flex-wrap items-center gap-x-2 gap-y-1">
              <span class="min-w-0 truncate text-[15px] font-bold">{u.pihak}</span>
              <span class="chip chip-quiet">{labelArah(u.arah)}</span>
              {#if u.lunas}
                <span class="chip chip-accent">Lunas</span>
              {/if}
              {#if lewat}
                <span class="chip chip-alert">Terlambat {tempo.slice(6)}</span>
              {/if}
            </div>

            <p class="text-[12px] leading-snug {lewat ? 'font-semibold text-alert' : 'text-ink-3'}">
              {fmtTanggal(u.tanggal)}
              {#if u.jatuhTempo}
                · Jatuh tempo {fmtTanggal(u.jatuhTempo)}
              {/if}
              {#if tempo && !lewat}
                · {tempo}
              {/if}
            </p>

            {#if u.catatan}
              <p class="text-[12px] leading-snug text-ink-3">Catatan: {u.catatan}</p>
            {/if}

            <div class="grid grid-cols-3 gap-2">
              <div>
                <span class="label block">Total</span>
                <span class="amount money block text-[14px] font-bold">{rupiah(u.jumlah)}</span>
              </div>
              <div>
                <span class="label block">Terbayar</span>
                <span class="amount money block text-[14px] font-bold text-ink-2">
                  {rupiah(u.terbayar)}
                </span>
              </div>
              <div>
                <span class="label block">Sisa</span>
                <span
                  class="amount money block text-[14px] font-bold {u.lunas
                    ? 'text-ink-2'
                    : lewat
                      ? 'text-alert'
                      : ''}"
                >
                  {rupiah(u.sisa)}
                </span>
              </div>
            </div>

            <div class="flex flex-wrap items-center justify-end gap-2">
              {#if !u.lunas}
                <button
                  type="button"
                  onclick={() => {
                    bayarId = u.id;
                    bayarJumlah = u.sisa;
                    galatBayar = '';
                  }}
                  class="btn"
                >
                  {isPiutang ? 'Terima cicilan' : 'Bayar cicilan'}
                </button>
              {/if}
              <button
                type="button"
                onclick={() => hapus(u.id)}
                title="Hapus catatan"
                class="btn btn-danger"
              >
                Hapus
              </button>
            </div>

            {#if bayarId === u.id}
              <form
                class="flex flex-col gap-3 rounded-xl bg-sunk p-3"
                onsubmit={(e: SubmitEvent) => {
                  e.preventDefault();
                  void bayar(u.id);
                }}
              >
                <div>
                  <p class="text-[14px] font-bold">
                    {isPiutang ? 'Terima cicilan' : 'Bayar cicilan'}
                  </p>
                  <p class="mt-0.5 text-[12px] text-ink-2">
                    {isPiutang ? 'Sisa piutang' : 'Sisa utang'}
                    <span class="money font-bold">{rupiah(u.sisa)}</span>
                  </p>
                </div>

                {#if galatBayar}
                  <p class="notice notice-alert">{galatBayar}</p>
                {/if}

                <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label for="byr-jml-{u.id}" class="label mb-1.5 block">
                      {isPiutang ? 'Jumlah diterima' : 'Jumlah bayar'}
                    </label>
                    <RupiahInput
                      id="byr-jml-{u.id}"
                      bind:value={bayarJumlah}
                      placeholder="500.000"
                      class="input money"
                    />
                  </div>
                  <div>
                    <label for="byr-tgl-{u.id}" class="label mb-1.5 block">Tanggal</label>
                    <input id="byr-tgl-{u.id}" type="date" bind:value={bayarTanggal} class="input" />
                  </div>
                  {#if dompets.length > 1}
                    <div class="sm:col-span-2">
                      <label for="byr-dom-{u.id}" class="label mb-1.5 block">
                        Dompet {isPiutang ? 'tujuan' : 'sumber'}
                      </label>
                      <select id="byr-dom-{u.id}" bind:value={bayarDompet} class="input">
                        {#each dompets as d (d.id_dompet)}
                          <option value={String(d.id_dompet)}>
                            {d.nama_dompet} (saldo {rupiah(d.saldo)})
                          </option>
                        {/each}
                      </select>
                    </div>
                  {/if}
                </div>

                <div class="flex flex-wrap items-center justify-end gap-2">
                  <button type="button" onclick={() => (bayarId = null)} class="btn btn-ghost">
                    Batal
                  </button>
                  <button type="submit" class="btn btn-primary">
                    {isPiutang ? 'Simpan penerimaan' : 'Simpan pembayaran'}
                  </button>
                </div>
              </form>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  </section>
</div>
