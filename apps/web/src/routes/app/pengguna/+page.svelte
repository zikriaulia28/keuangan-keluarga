<script lang="ts">
	import { api } from '$lib/api';

	let { data } = $props();

	type User = { id: number; username: string; role: string; created_at: string };

	let saya = $state(data.saya.username);
	let sayaId = $state(data.saya.id);
	let role = $state(data.saya.role);
	let daftar = $state<User[]>(data.daftar);
	let memuat = $state(false);
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

	// Dua ketukan untuk hapus: ketukan pertama membuka konfirmasi di dalam baris.
	let konfirmasiHapus = $state<number | null>(null);
	// Kolom konfirmasi password baru, diperiksa sebelum ganti() berjalan.
	let konfirmasi = $state('');

	function pesan(e: unknown, baku: string) {
		const m = e instanceof Error ? e.message : baku;
		if (m === 'FORBIDDEN') return 'Akses ditolak.';
		if (m === 'LAST_ADMIN') return 'Tidak bisa menghapus admin terakhir.';
		if (m === 'NOT_FOUND') return 'Data tidak ditemukan.';
		if (m === 'CANNOT_DELETE_SELF') return 'Tidak bisa menghapus akun sendiri.';
		if (m === 'USER_IN_USE') return 'Pengguna masih memiliki catatan.';
		if (m === 'USER_DUPLICATE') return 'Username sudah dipakai.';
		if (m === 'INVALID_USER') return 'Username minimal 3 karakter dan password minimal 6 karakter.';
		if (m === 'WRONG_PASSWORD') return 'Password lama salah.';
		return m || baku;
	}

	function fmtTanggal(tgl: string) {
		const d = new Date(tgl);
		if (isNaN(d.getTime())) return tgl;
		return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
	}

	function labelRole(r: string) {
		return r === 'admin' ? 'Admin' : 'Pengguna';
	}

	async function muatUlang() {
		galat = '';
		try {
			daftar = await api<User[]>('/api/users');
		} catch (e) {
			galat = pesan(e, 'Gagal memuat.');
		}
	}

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
			await muatUlang();
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

<div class="mx-auto w-full max-w-2xl md:max-w-4xl">
	<h1 class="text-[26px] font-extrabold tracking-tight">Pengguna</h1>
	<p class="mt-1.5 text-sm leading-relaxed text-ink-2">
		Atur siapa saja yang memiliki akses ke dompet bersama. Admin dapat menambah pengguna, mengubah role, dan
		menghapus akun. Pengguna hanya dapat mencatat dan melihat.
	</p>

	{#if role === 'admin'}
		<!-- Daftar pengguna. Satu baris = satu akun. -->
		<section class="mt-8">
			<div class="flex items-center justify-between gap-3">
				<h2 class="head">Daftar pengguna</h2>
				<span class="chip chip-quiet shrink-0">{daftar.length} pengguna</span>
			</div>

			{#if memuat}
				<div class="card mt-3 flex flex-col gap-4 p-5" aria-hidden="true">
					{#each [0, 1, 2] as i (i)}
						<div class="flex flex-col gap-2">
							<div class="h-4 w-32 rounded-full bg-sunk"></div>
							<div class="h-3 w-24 rounded-full bg-sunk"></div>
						</div>
					{/each}
				</div>
				<p class="label mt-3">Memuat daftar pengguna…</p>
			{:else}
				{#if galat}
					<div class="notice notice-alert mt-3 flex items-start justify-between gap-3">
						<span>{galat}</span>
						<button
							type="button"
							class="btn btn-ghost shrink-0 !min-h-11 !px-3 text-sm"
							onclick={async () => {
								memuat = true;
								await muatUlang();
								memuat = false;
							}}
						>
							Muat ulang
						</button>
					</div>
				{/if}

				{#if daftar.length === 0}
					<div class="card mt-3 p-5">
						<p class="text-[15px] font-bold">Belum ada pengguna</p>
						<p class="mt-1.5 text-sm leading-relaxed text-ink-2">
							Daftar pengguna masih kosong. Tambahkan pengguna di bawah agar mereka bisa ikut memantau kas
							keluarga.
						</p>
					</div>
				{:else}
					<div class="card rows mt-3 px-4 md:px-5">
						{#each daftar as u (u.id)}
							{@const diri = u.id === sayaId || u.username === saya}
							{@const admin = u.role === 'admin'}
							<div class="row {konfirmasiHapus === u.id ? 'flex-col !items-stretch !gap-3' : ''}">
								{#if konfirmasiHapus === u.id}
									<p class="text-sm leading-relaxed text-ink-2">
										Hapus pengguna {u.username}? Aksesnya ke dompet bersama langsung dicabut dan tidak
										dapat dikembalikan.
									</p>
									<div class="flex flex-col gap-2 sm:flex-row">
										<button
											type="button"
											class="btn btn-danger flex-1"
											onclick={() => hapus(u.id, u.username)}
										>
											Ya, hapus
										</button>
										<button
											type="button"
											class="btn flex-1"
											onclick={() => (konfirmasiHapus = null)}
										>
											Batal
										</button>
									</div>
								{:else}
									<span class="min-w-0 flex-1">
										<span class="flex flex-wrap items-center gap-x-2 gap-y-1">
											<span class="truncate text-[15px] font-bold">{u.username}</span>
											{#if diri}<span class="chip chip-quiet shrink-0">Anda</span>{/if}
											<span class="chip shrink-0 {admin ? 'chip-accent' : 'chip-quiet'}">
												{admin ? 'Admin' : 'Pengguna'}
											</span>
										</span>
										<span class="mt-1 block text-[12px] text-ink-3">
											Dibuat {fmtTanggal(u.created_at)}
										</span>
									</span>

									{#if diri}
										<button
											type="button"
											disabled
											title="Tidak dapat menghapus akun sendiri"
											class="btn shrink-0"
										>
											Hapus
										</button>
									{:else}
										<button
											type="button"
											class="btn btn-danger shrink-0"
											onclick={() => (konfirmasiHapus = u.id)}
										>
											Hapus
										</button>
									{/if}
								{/if}
							</div>
						{/each}
					</div>
				{/if}
			{/if}
		</section>

		<!-- Tambah pengguna. -->
		<section class="mt-8">
			<h2 class="head">Tambah pengguna</h2>
			<form onsubmit={tambah} class="card mt-3 flex flex-col gap-4 p-5 md:p-6">
				{#if galatTambah}
					<p role="alert" class="notice notice-alert">{galatTambah}</p>
				{/if}

				<div class="flex flex-col gap-1.5">
					<label for="pg-username" class="label">Username</label>
					<input
						id="pg-username"
						bind:value={username}
						autocomplete="off"
						placeholder="Contoh: NenekKas"
						minlength={3}
						required
						class="input"
					/>
					<p class="text-[12px] text-ink-3">Minimal 3 karakter.</p>
				</div>

				<div class="flex flex-col gap-1.5">
					<label for="pg-password" class="label">Password</label>
					<input
						id="pg-password"
						type="password"
						bind:value={password}
						autocomplete="new-password"
						placeholder="Kata sandi"
						minlength={6}
						required
						class="input"
					/>
					<p class="text-[12px] text-ink-3">Minimal 6 karakter.</p>
				</div>

				<div class="flex flex-col gap-1.5">
					<label for="pg-peran" class="label">Role</label>
					<select id="pg-peran" bind:value={peran} class="input">
						<option value="user">Pengguna · catat dan lihat</option>
						<option value="admin">Admin · akses penuh</option>
					</select>
					<p class="text-[12px] text-ink-3">Peran: {labelRole(peran)}.</p>
				</div>

				<p class="text-[13px] leading-relaxed text-ink-2">
					Bagikan akun hanya kepada anggota keluarga. Admin dapat menghapus pengguna lain, tetapi tidak dapat
					menghapus akun sendiri atau admin terakhir.
				</p>

				<button type="submit" disabled={menyimpan} class="btn btn-primary w-full">
					{menyimpan ? 'Menyimpan…' : 'Simpan pengguna'}
				</button>
			</form>
		</section>
	{:else}
		<div class="card mt-5 p-5">
			<p class="text-[15px] font-bold">Halaman khusus admin</p>
			<p class="mt-1.5 text-sm leading-relaxed text-ink-2">
				Halaman daftar pengguna khusus admin. Hubungi admin keluarga untuk menambah pengguna atau mengubah role.
			</p>
		</div>
	{/if}

	<!-- Password akun sendiri, terbuka untuk semua role. -->
	<section class="mt-8">
		<h2 class="head">Ganti Password Saya</h2>
		<form
			onsubmit={(e) => {
				if (konfirmasi !== baru) {
					e.preventDefault();
					galatSandi = 'Konfirmasi password tidak sama.';
					return;
				}
				void ganti(e);
			}}
			class="card mt-3 flex flex-col gap-4 p-5 md:p-6"
		>
			{#if galatSandi}
				<p role="alert" class="notice notice-alert">
					{galatSandi === 'WRONG_PASSWORD'
						? 'Password lama salah, atau password baru kurang dari 6 karakter.'
						: galatSandi}
				</p>
			{/if}
			{#if infoSandi}
				<p role="status" class="notice notice-quiet">{infoSandi}</p>
			{/if}

			<div class="flex flex-col gap-1.5">
				<label for="pg-lama" class="label">Password Lama</label>
				<input
					id="pg-lama"
					type="password"
					bind:value={lama}
					autocomplete="current-password"
					placeholder="Kata sandi"
					required
					class="input"
				/>
			</div>

			<div class="flex flex-col gap-1.5">
				<label for="pg-baru" class="label">Password Baru</label>
				<input
					id="pg-baru"
					type="password"
					bind:value={baru}
					autocomplete="new-password"
					placeholder="Minimal 6 karakter"
					minlength={6}
					required
					class="input"
				/>
			</div>

			<div class="flex flex-col gap-1.5">
				<label for="pg-konfirmasi" class="label">Konfirmasi Password Baru</label>
				<input
					id="pg-konfirmasi"
					type="password"
					bind:value={konfirmasi}
					autocomplete="new-password"
					placeholder="Ulangi password baru"
					required
					class="input"
				/>
			</div>

			<button type="submit" disabled={gantiLoading} class="btn w-full">
				{gantiLoading ? 'Menyimpan…' : 'Perbarui password'}
			</button>
		</form>
	</section>
</div>
