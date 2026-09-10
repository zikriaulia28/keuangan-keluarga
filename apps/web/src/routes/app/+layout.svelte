<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { api } from '$lib/api';

	interface Me {
		id: number;
		username: string;
		role: string;
	}

	let { children } = $props();

	let user = $state<Me | null>(null);
	let memeriksa = $state(true);

	const navSemua = [
		{ href: '/app', label: 'Dashboard', ikon: 'dashboard' },
		{ href: '/app/transaksi', label: 'Transaksi', ikon: 'receipt_long' },
		{ href: '/app/anggaran', label: 'Anggaran', ikon: 'account_balance_wallet' },
		{ href: '/app/utang', label: 'Utang', ikon: 'handshake' },
		{ href: '/app/tagihan', label: 'Tagihan', ikon: 'payments' },
		{ href: '/app/pengguna', label: 'Pengguna', ikon: 'group', admin: true }
	];

	const nav = $derived(navSemua.filter((item) => !item.admin || user?.role === 'admin'));
	const inisial = $derived(user ? user.username.charAt(0).toUpperCase() : '?');

	function aktif(href: string) {
		const saatIni = page.url.pathname;
		if (href === '/app') return saatIni === '/app';
		return saatIni.startsWith(href);
	}

	async function keluar() {
		try {
			await api('/api/logout', { method: 'POST' });
		} catch {
			// abaikan, tetap kembali ke login
		}
		await goto('/');
	}

	onMount(async () => {
		try {
			user = await api<Me>('/api/me');
		} catch {
			await goto('/');
			return;
		} finally {
			memeriksa = false;
		}
	});
</script>

<div class="flex min-h-dvh flex-col bg-surface font-sans text-on-surface">
	<header class="sticky top-0 z-40 bg-surface/80 backdrop-blur-xl shadow-[0_1px_8px_rgba(0,0,0,0.04)]">
		<div class="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 md:px-8">
			<div class="flex items-center gap-2">
				<img src="/logo.png" alt="Logo Kas Keluarga" class="h-8 w-auto object-contain" />
				<span class="text-base font-bold">Kas Keluarga</span>
			</div>
			<div class="flex items-center gap-2.5">
				{#if user}
					<span
						class="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-bold text-on-primary"
						title={user.username}
					>
						{inisial}
					</span>
					<span class="hidden text-sm font-medium sm:block">{user.username}</span>
				{/if}
				<button
					type="button"
					onclick={keluar}
					class="flex items-center gap-1 rounded-lg bg-surface-container px-3 py-2 text-sm font-medium transition hover:bg-surface-high"
				>
					<span class="material-symbols-outlined text-lg">logout</span>
					<span class="hidden sm:inline">Keluar</span>
				</button>
			</div>
		</div>
	</header>

	<div class="mx-auto flex w-full max-w-6xl flex-1 gap-6 px-4 md:px-8">
		<aside class="sticky top-16 hidden h-[calc(100dvh-4rem)] w-60 shrink-0 flex-col gap-1 py-6 md:flex">
			<nav aria-label="Navigasi utama" class="flex flex-col gap-1">
				{#each nav as item (item.href)}
					<a
						href={item.href}
						aria-current={aktif(item.href) ? 'page' : undefined}
						class="flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-medium transition {aktif(
							item.href
						)
							? 'bg-primary font-semibold text-on-primary shadow-sm'
							: 'text-on-variant hover:bg-surface-container'}"
					>
						<span class="material-symbols-outlined text-xl" aria-hidden="true">{item.ikon}</span>
						{item.label}
					</a>
				{/each}
			</nav>
		</aside>

		<main class="w-full min-w-0 flex-1 py-4 pb-24 md:py-6 md:pb-12">
			{#if memeriksa}
				<p class="text-sm text-on-variant">Memeriksa sesi…</p>
			{:else if user}
				{@render children()}
			{/if}
		</main>
	</div>

	<nav
		aria-label="Navigasi bawah"
		class="fixed inset-x-0 bottom-0 z-40 bg-surface/90 pb-[env(safe-area-inset-bottom,0px)] backdrop-blur-xl shadow-[0_-1px_8px_rgba(0,0,0,0.04)] md:hidden"
	>
		<div class="flex h-16 items-center justify-around px-1">
			{#each nav as item (item.href)}
				<a
					href={item.href}
					aria-current={aktif(item.href) ? 'page' : undefined}
					class="flex h-12 w-12 flex-col items-center justify-center gap-0.5 {aktif(item.href)
						? 'font-semibold text-primary'
						: 'text-on-variant'}"
				>
					<span class="material-symbols-outlined text-xl" aria-hidden="true">{item.ikon}</span>
					<span class="text-xs">{item.label}</span>
				</a>
			{/each}
		</div>
	</nav>
</div>
