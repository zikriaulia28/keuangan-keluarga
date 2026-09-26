<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { api } from '$lib/api';
	import NavIcon from '$lib/components/NavIcon.svelte';

	interface Me {
		id: number;
		username: string;
		role: string;
	}

	let { children } = $props();

	let user = $state<Me | null>(null);
	let memeriksa = $state(true);

	// Lima tujuan utama, semuanya dalam jangkauan ibu jari.
	const navBawah = [
		{ href: '/app', label: 'Ringkasan', ikon: 'ringkasan' },
		{ href: '/app/transaksi', label: 'Catat', ikon: 'catat' },
		{ href: '/app/tagihan', label: 'Tagihan', ikon: 'tagihan' },
		{ href: '/app/utang', label: 'Utang', ikon: 'utang' },
		{ href: '/app/lainnya', label: 'Lainnya', ikon: 'lainnya' }
	];

	// Di laptop semua tujuan tampil.
	const navSidebar = [
		{ href: '/app', label: 'Ringkasan', ikon: 'ringkasan' },
		{ href: '/app/transaksi', label: 'Transaksi', ikon: 'catat' },
		{ href: '/app/dompet', label: 'Dompet', ikon: 'dompet' },
		{ href: '/app/anggaran', label: 'Anggaran', ikon: 'anggaran' },
		{ href: '/app/tagihan', label: 'Tagihan', ikon: 'tagihan' },
		{ href: '/app/utang', label: 'Utang', ikon: 'utang' },
		{ href: '/app/pengguna', label: 'Pengguna', ikon: 'pengguna', admin: true },
		{ href: '/app/lainnya', label: 'Lainnya', ikon: 'lainnya' }
	];

	const sidebar = $derived(navSidebar.filter((item) => !item.admin || user?.role === 'admin'));

	function aktif(href: string) {
		const saatIni = page.url.pathname;
		if (href === '/app') return saatIni === '/app';
		if (href === '/app/lainnya') return saatIni === '/app/lainnya';
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

<div class="flex min-h-dvh flex-col bg-ground">
	<header class="sticky top-0 z-40 bg-ground/85 backdrop-blur-md">
		<div
			class="mx-auto flex h-14 w-full max-w-2xl items-center justify-between px-4 md:h-16 md:max-w-6xl md:px-8"
		>
			<a href="/app" class="flex items-center gap-2.5">
				<img src="/logo.png" alt="" class="h-7 w-auto object-contain" />
				<span class="text-[15px] font-extrabold tracking-tight">Kas Keluarga</span>
			</a>
			<div class="flex items-center gap-2">
				<span class="hidden text-sm font-semibold text-ink-2 sm:block">{user?.username ?? ''}</span>
				<button type="button" onclick={keluar} class="btn btn-ghost !min-h-9 !px-3 text-sm">
					Keluar
				</button>
			</div>
		</div>
	</header>

	<div class="mx-auto flex w-full max-w-2xl flex-1 md:max-w-6xl">
		<aside class="sticky top-16 hidden h-[calc(100dvh-4rem)] w-52 shrink-0 py-6 pr-6 md:block">
			<nav aria-label="Navigasi utama" class="flex flex-col gap-1">
				{#each sidebar as item (item.href)}
					<a
						href={item.href}
						aria-current={aktif(item.href) ? 'page' : undefined}
						class="flex min-h-11 items-center rounded-xl px-3 text-[15px] transition-colors {aktif(
							item.href
						)
							? 'bg-accent-soft font-bold text-accent-ink'
							: 'font-semibold text-ink-2 hover:bg-card'}"
					>
						{item.label}
					</a>
				{/each}
			</nav>
		</aside>

		<main class="min-w-0 flex-1 px-4 pt-4 pb-28 md:px-8 md:pt-6 md:pb-16">
			{#if memeriksa}
				<p class="label">Memeriksa sesi…</p>
			{:else if user}
				{@render children()}
			{/if}
		</main>
	</div>

	<!-- HP: ikon + label, aktif filled hijau. -->
	<nav
		aria-label="Navigasi bawah"
		class="fixed inset-x-0 bottom-0 z-40 bg-ground/90 pb-[env(safe-area-inset-bottom,0px)] backdrop-blur-md md:hidden"
	>
		<div class="mx-auto flex h-16 max-w-2xl items-stretch gap-1 px-2">
			{#each navBawah as item (item.href)}
				<a
					href={item.href}
					aria-current={aktif(item.href) ? 'page' : undefined}
					class="flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl px-0.5 transition-colors {aktif(
						item.href
					)
						? 'bg-accent-soft font-bold text-accent-ink'
						: 'font-semibold text-ink-3'}"
				>
					<NavIcon name={item.ikon} size={22} />
					<span class="w-full truncate text-center text-[10.5px] leading-none">{item.label}</span>
				</a>
			{/each}
		</div>
	</nav>
</div>
