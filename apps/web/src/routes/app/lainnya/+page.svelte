<script lang="ts">
	import { goto } from '$app/navigation';
	import { api } from '$lib/api';

	interface Me {
		id: number;
		username: string;
		role: string;
	}

	let role = $state('');
	let nama = $state('');
	let memuat = $state(true);
	let galat = $state('');

	const semua = [
		{ href: '/app/dompet', label: 'Dompet', etwa: 'Pisahkan dana per dompet dan alokasikan antar dompet.' },
		{ href: '/app/anggaran', label: 'Anggaran', etwa: 'Batas pengeluaran per kategori setiap bulan.' },
		{ href: '/app/pengguna', label: 'Pengguna', etwa: 'Kelola anggota keluarga dan hak aksesnya.' }
	];

	const daftar = $derived(semua.filter((item) => item.label !== 'Pengguna' || role === 'admin'));

	async function muat() {
		memuat = true;
		galat = '';
		try {
			const me = await api<Me>('/api/me');
			role = me.role;
			nama = me.username;
		} catch (e) {
			galat = e instanceof Error ? e.message : 'Gagal memuat data.';
		} finally {
			memuat = false;
		}
	}

	$effect(() => {
		void muat();
	});
</script>

<div class="mx-auto w-full max-w-2xl">
	<h1 class="text-[26px] font-extrabold tracking-tight">Lainnya</h1>
	<p class="mt-1.5 text-sm text-ink-2">
		Menu tambahan. Seluruh data dan riwayat tetap tersedia.
	</p>

	{#if memuat}
		<p class="label mt-6">Memuat…</p>
	{:else}
		{#if galat}
			<p class="notice notice-alert mt-5">{galat}</p>
		{/if}

		<div class="card rows mt-5 px-4 md:px-5">
			{#each daftar as item (item.href)}
				<a href={item.href} class="row group">
					<span class="min-w-0 flex-1">
						<span class="block text-[15px] font-bold">{item.label}</span>
						<span class="mt-0.5 block text-[13px] leading-snug text-ink-3">{item.etwa}</span>
					</span>
					<span
						class="text-lg leading-none text-ink-3 transition-transform group-hover:translate-x-0.5"
						aria-hidden="true"
						>&#8250;</span
					>
				</a>
			{/each}
		</div>

		<div class="card mt-4 flex items-center justify-between gap-3 px-4 py-4 md:px-5">
			<div>
				<p class="label">Masuk sebagai</p>
				<p class="money mt-0.5 text-[15px] font-bold">{nama || '—'}</p>
			</div>
			<button type="button" onclick={() => goto('/')} class="btn btn-ghost">Keluar</button>
		</div>
	{/if}
</div>
