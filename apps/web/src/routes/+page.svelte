<script lang="ts">
	import { api } from '$lib/api';
	import { goto } from '$app/navigation';

	let username = $state('');
	let password = $state('');
	let salah = $state('');
	let memproses = $state(false);

	async function masuk(e: SubmitEvent) {
		e.preventDefault();
		salah = '';
		memproses = true;
		try {
			await api('/api/login', { method: 'POST', body: JSON.stringify({ username, password }) });
			await goto('/app');
		} catch {
			salah = 'Username atau password salah.';
		} finally {
			memproses = false;
		}
	}
</script>

<main class="flex min-h-dvh items-center justify-center bg-surface px-4 py-8 font-sans">
	<div
		class="w-full max-w-sm rounded-2xl bg-lowest p-6 shadow-[0_8px_30px_-4px_rgba(37,99,235,0.12)] md:p-8"
	>
		<div class="mb-6 flex flex-col items-center text-center">
			<img src="/logo.png" alt="Logo Kas Keluarga" class="mb-3 h-14 w-auto object-contain" />
			<h1 class="text-xl font-bold text-on-surface">Kas Keluarga</h1>
			<p class="mt-1 text-sm text-on-variant">Masuk untuk mengelola keuangan keluarga</p>
		</div>
		<form onsubmit={masuk} class="flex flex-col gap-4">
			<div>
				<label for="username" class="mb-1 block text-sm font-medium text-on-variant">Username</label>
				<input
					id="username"
					bind:value={username}
					autocomplete="username"
					required
					placeholder="Nama pengguna"
					class="w-full rounded-lg bg-surface-low px-4 py-2.5 text-on-surface outline-none transition focus:ring-2 focus:ring-primary"
				/>
			</div>
			<div>
				<label for="password" class="mb-1 block text-sm font-medium text-on-variant">Password</label>
				<input
					id="password"
					type="password"
					bind:value={password}
					autocomplete="current-password"
					required
					placeholder="Kata sandi"
					class="w-full rounded-lg bg-surface-low px-4 py-2.5 text-on-surface outline-none transition focus:ring-2 focus:ring-primary"
				/>
			</div>
			{#if salah}
				<p role="alert" class="flex items-center gap-1.5 text-sm font-medium text-error">
					<span class="material-symbols-outlined text-base">error</span>
					{salah}
				</p>
			{/if}
			<button
				type="submit"
				disabled={memproses}
				class="w-full rounded-xl bg-primary py-3 text-sm font-semibold text-on-primary shadow-md transition hover:opacity-95 active:scale-95 disabled:opacity-60"
			>
				{memproses ? 'Memeriksa…' : 'Masuk'}
			</button>
		</form>
	</div>
</main>
