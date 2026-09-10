<script lang="ts">
  import { api } from '$lib/api';
  import { onMount } from 'svelte';

  type User = { id: number; username: string; role: string; created_at: string };

  let saya = $state('');
  let sayaId = $state(0);
  let role = $state('');
  let daftar = $state<User[]>([]);
  let memuat = $state(true);
  let galat = $state('');
  let galatTambah = $state('');
  let galatSandi = $state('');
  let infoSandi = $state('');

  let username = $state('');
  let password = $state('');
  let peran = $state('user');
  let menyimpan = $state(false);

  let lama = $state('');
  let baru = $state('');
  let gantiLoading = $state(false);

  const AVATAR = ['bg-primary text-on-primary', 'bg-income text-on-primary', 'bg-expense text-on-primary'];

  function pesan(e: unknown, baku: string) {
    const m = e instanceof Error ? e.message : baku;
    if (m === 'FORBIDDEN') return 'Akses ditolak.';
    if (m === 'LAST_ADMIN') return 'Tidak bisa menghapus admin terakhir.';
    if (m === 'NOT_FOUND') return 'Data tidak ditemukan.';
    return m || baku;
  }

  function inisial(nama: string) {
    return nama.trim().slice(0, 2).toUpperCase() || '?';
  }

  function fmtTanggal(tgl: string) {
    const d = new Date(tgl);
    if (isNaN(d.getTime())) return tgl;
    return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function labelRole(r: string) {
    return r === 'admin' ? 'Admin' : 'User';
  }

  async function muat() {
    memuat = true;
    galat = '';
    try {
      const me = await api<{ id: number; username: string; role: string }>('/api/me');
      saya = me.username;
      sayaId = me.id;
      role = me.role;
      if (role === 'admin') {
        daftar = await api<User[]>('/api/users');
      }
    } catch (e) {
      galat = pesan(e, 'Gagal memuat.');
    } finally {
      memuat = false;
    }
  }

  onMount(muat);

  async function tambah(e: SubmitEvent) {
    e.preventDefault();
    galatTambah = '';
    if (!username.trim() || !password) {
      galatTambah = 'Isi username dan password.';
      return;
    }
    menyimpan = true;
    try {
      await api('/api/users', {
        method: 'POST',
        body: JSON.stringify({ username: username.trim(), password, role: peran })
      });
      username = ''; password = ''; peran = 'user';
      daftar = await api<User[]>('/api/users');
    } catch (e2) {
      galatTambah = pesan(e2, 'Gagal menambah.');
    } finally {
      menyimpan = false;
    }
  }

  async function hapus(id: number, nama: string) {
    galat = '';
    try {
      await api(`/api/users/${id}`, { method: 'DELETE' });
      daftar = daftar.filter((u) => u.id !== id);
    } catch (e) {
      galat = `Gagal menghapus ${nama}: ${pesan(e, 'error')}`;
    }
  }

  async function ganti(e: SubmitEvent) {
    e.preventDefault();
    galatSandi = '';
    infoSandi = '';
    if (!lama || !baru) {
      galatSandi = 'Isi password lama dan baru.';
      return;
    }
    gantiLoading = true;
    try {
      await api('/api/me/password', {
        method: 'POST',
        body: JSON.stringify({ lama, baru })
      });
      lama = ''; baru = '';
      infoSandi = 'Password berhasil diganti.';
    } catch (e) {
      galatSandi = pesan(e, 'Gagal mengganti password.');
    } finally {
      gantiLoading = false;
    }
  }
</script>

<div class="mx-auto w-full max-w-5xl px-4 pb-24 font-sans md:px-8">
  <div class="relative mb-6 flex flex-col justify-between gap-4 overflow-hidden rounded-xl bg-primary p-6 text-on-primary shadow-sm">
    <div class="pointer-events-none absolute -bottom-10 -right-10 h-40 w-40 rounded-full bg-primary-bright opacity-40"></div>
    <div class="relative z-10 flex items-center justify-between">
      <div>
        <span class="text-xs font-medium uppercase tracking-wider text-on-primary-container">Manajemen Pengguna</span>
        <h2 class="mt-1 text-2xl font-bold">Kelola Anggota Keluarga</h2>
      </div>
      <div class="flex h-12 w-12 items-center justify-center rounded-full bg-lowest/20 backdrop-blur-md">
        <span class="material-symbols-outlined text-[24px]">group</span>
      </div>
    </div>
    <p class="relative z-10 max-w-xl text-sm text-on-primary-container">
      Atur siapa saja yang memiliki akses ke dompet bersama. Lindungi keamanan kas keluarga dengan pembagian peran yang jelas.
    </p>
  </div>

  {#if memuat}
    <div class="animate-pulse rounded-xl bg-lowest p-6 shadow-sm">
      <div class="h-6 w-1/3 rounded bg-surface-container"></div>
      <div class="mt-4 h-12 rounded-lg bg-surface-container"></div>
      <div class="mt-2 h-12 rounded-lg bg-surface-container"></div>
    </div>
    <p class="mt-3 text-sm text-on-variant">Memuat…</p>
  {:else}
    {#if galat}<p class="mb-3 rounded-xl bg-expense-soft px-4 py-3 text-sm text-error">{galat}</p>{/if}

    <div class="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div class="flex flex-col gap-6 lg:col-span-2">
        {#if role === 'admin'}
          <section class="flex flex-col rounded-xl bg-lowest p-6 shadow-sm">
            <div class="mb-4 flex items-center justify-between">
              <div class="flex items-center gap-2">
                <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-on-primary">
                  <span class="material-symbols-outlined text-[18px]">badge</span>
                </div>
                <h3 class="text-lg font-semibold text-on-surface">Daftar Pengguna Aktif</h3>
              </div>
              <span class="rounded-full bg-surface-high px-2 py-1 text-xs text-on-variant">{daftar.length} Anggota</span>
            </div>
            {#if daftar.length === 0}
              <div class="flex flex-col items-center justify-center gap-2 py-10 text-center">
                <div class="flex h-16 w-16 items-center justify-center rounded-full bg-surface-high text-on-variant">
                  <span class="material-symbols-outlined text-[32px]">person_off</span>
                </div>
                <h4 class="font-semibold text-on-surface">Belum ada pengguna lain</h4>
                <p class="max-w-xs text-sm text-on-variant">Tambahkan anggota keluarga di form samping agar mereka bisa ikut memantau kas.</p>
              </div>
            {:else}
              <div class="overflow-x-auto">
                <table class="w-full border-collapse text-left text-sm">
                  <thead>
                    <tr class="bg-surface-low text-xs text-on-variant">
                      <th class="rounded-l-lg p-4 font-medium">Pengguna</th>
                      <th class="p-4 font-medium">Peran</th>
                      <th class="hidden p-4 font-medium sm:table-cell">Dibuat</th>
                      <th class="rounded-r-lg p-4 text-right font-medium">Aksi</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-surface-container">
                    {#each daftar as u}
                      {@const diri = u.id === sayaId || u.username === saya}
                      <tr class="transition-colors hover:bg-surface-container/50">
                        <td class="p-4">
                          <div class="flex items-center gap-2">
                            <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-bold {AVATAR[u.id % AVATAR.length]}">
                              {inisial(u.username)}
                            </div>
                            <div>
                              <div class="flex items-center gap-2 font-medium text-on-surface">
                                {u.username}
                                {#if diri}
                                  <span class="rounded-full bg-primary px-2 py-0.5 text-xs text-on-primary-container">Anda</span>
                                {/if}
                              </div>
                              <div class="text-xs text-on-variant sm:hidden">{fmtTanggal(u.created_at)}</div>
                            </div>
                          </div>
                        </td>
                        <td class="p-4">
                          {#if u.role === 'admin'}
                            <span class="inline-flex items-center gap-1 rounded-full bg-income-soft px-2.5 py-1 text-xs font-medium text-income-deep">
                              <span class="material-symbols-outlined text-[14px]">shield</span> Admin
                            </span>
                          {:else}
                            <span class="inline-flex items-center gap-1 rounded-full bg-surface-container px-2.5 py-1 text-xs font-medium text-on-surface">
                              <span class="material-symbols-outlined text-[14px]">person</span> User
                            </span>
                          {/if}
                        </td>
                        <td class="hidden p-4 text-xs text-on-variant sm:table-cell">{fmtTanggal(u.created_at)}</td>
                        <td class="p-4 text-right">
                          {#if diri}
                            <button
                              disabled
                              title="Tidak dapat menghapus diri sendiri"
                              class="inline-flex cursor-not-allowed items-center gap-1 rounded-lg bg-surface-high p-2 text-xs text-on-variant opacity-40"
                            >
                              <span class="material-symbols-outlined text-[16px]">lock</span> Hapus
                            </button>
                          {:else}
                            <button
                              onclick={() => hapus(u.id, u.username)}
                              class="inline-flex items-center gap-1 rounded-lg p-2 text-xs text-expense transition-colors hover:bg-expense-soft/30"
                            >
                              <span class="material-symbols-outlined text-[16px]">delete</span> Hapus
                            </button>
                          {/if}
                        </td>
                      </tr>
                    {/each}
                  </tbody>
                </table>
              </div>
            {/if}
          </section>
        {:else}
          <p class="rounded-xl bg-lowest p-6 text-sm text-on-variant shadow-sm">Halaman daftar pengguna khusus admin.</p>
        {/if}
      </div>

      <div class="flex flex-col gap-6 lg:col-span-1">
        {#if role === 'admin'}
          <section class="rounded-xl bg-lowest p-6 shadow-sm">
            <div class="mb-4 flex items-center gap-2">
              <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-income-soft text-income-deep">
                <span class="material-symbols-outlined text-[18px]">person_add</span>
              </div>
              <h3 class="text-lg font-semibold text-on-surface">Tambah Pengguna Baru</h3>
            </div>
            <form onsubmit={tambah} class="flex flex-col gap-4">
              {#if galatTambah}<p class="rounded-xl bg-expense-soft px-4 py-2 text-sm text-error">{galatTambah}</p>{/if}
              <div>
                <label for="pg-username" class="mb-1 block text-sm font-medium text-on-variant">Username</label>
                <input
                  id="pg-username"
                  bind:value={username}
                  autocomplete="off"
                  placeholder="Contoh: NenekKas"
                  required
                  class="w-full rounded-lg bg-surface-low px-4 py-2.5 text-sm text-on-surface outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div>
                <label for="pg-peran" class="mb-1 block text-sm font-medium text-on-variant">Peran (Role)</label>
                <select
                  id="pg-peran"
                  bind:value={peran}
                  class="w-full rounded-lg bg-surface-low px-4 py-2.5 text-sm text-on-surface outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="user">User (Catat & Lihat)</option>
                  <option value="admin">Admin (Akses Penuh)</option>
                </select>
              </div>
              <div>
                <label for="pg-password" class="mb-1 block text-sm font-medium text-on-variant">Password Sementara</label>
                <input
                  id="pg-password"
                  type="password"
                  bind:value={password}
                  autocomplete="new-password"
                  placeholder="••••••••"
                  required
                  class="w-full rounded-lg bg-surface-low px-4 py-2.5 text-sm text-on-surface outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <button
                type="submit"
                disabled={menyimpan}
                class="mt-1 flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-3 font-medium text-on-primary shadow-sm transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-60"
              >
                <span class="material-symbols-outlined text-[18px]">add</span>
                {menyimpan ? 'Menyimpan…' : 'Simpan Pengguna'}
              </button>
            </form>
            <p class="mt-2 text-xs text-on-variant">Peran: {labelRole(peran)}.</p>
          </section>
        {/if}

        <section class="rounded-xl bg-lowest p-6 shadow-sm">
          <div class="mb-4 flex items-center gap-2">
            <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-on-primary">
              <span class="material-symbols-outlined text-[18px]">lock_reset</span>
            </div>
            <h3 class="text-lg font-semibold text-on-surface">Ganti Password Saya</h3>
          </div>
          <form onsubmit={ganti} class="flex flex-col gap-4">
            {#if galatSandi}<p class="rounded-xl bg-expense-soft px-4 py-2 text-sm text-error">{galatSandi}</p>{/if}
            {#if infoSandi}<p class="rounded-xl bg-income-soft px-4 py-2 text-sm text-income-deep">{infoSandi}</p>{/if}
            <div>
              <label for="pg-lama" class="mb-1 block text-sm font-medium text-on-variant">Password Lama</label>
              <input
                id="pg-lama"
                type="password"
                bind:value={lama}
                autocomplete="current-password"
                placeholder="••••••••"
                required
                class="w-full rounded-lg bg-surface-low px-4 py-2.5 text-sm text-on-surface outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label for="pg-baru" class="mb-1 block text-sm font-medium text-on-variant">Password Baru</label>
              <input
                id="pg-baru"
                type="password"
                bind:value={baru}
                autocomplete="new-password"
                placeholder="••••••••"
                required
                class="w-full rounded-lg bg-surface-low px-4 py-2.5 text-sm text-on-surface outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <button
              type="submit"
              disabled={gantiLoading}
              class="mt-1 flex w-full items-center justify-center gap-2 rounded-lg bg-surface-high py-3 font-medium text-on-surface transition-all hover:bg-surface-container active:scale-[0.98] disabled:opacity-60"
            >
              <span class="material-symbols-outlined text-[18px]">key</span>
              {gantiLoading ? 'Menyimpan…' : 'Perbarui Password'}
            </button>
          </form>
        </section>
      </div>
    </div>
  {/if}
</div>
