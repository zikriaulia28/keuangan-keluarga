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
		if (!username.trim() || !password) {
			salah = 'Isi username dan password dulu.';
			return;
		}
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

<main class="flex min-h-dvh flex-col bg-ground px-5 py-10 md:justify-center md:py-16">
	<div class="mx-auto w-full max-w-sm">
		<div class="flex flex-col items-center text-center">
			<img src="/logo.png" alt="Logo Kas Keluarga" class="h-12 w-auto object-contain" />
			<h1 class="mt-4 text-[22px] font-extrabold tracking-tight">Kas Keluarga</h1>
			<p class="mt-1.5 text-sm text-ink-2">Pencatatan keuangan keluarga dalam satu tempat.</p>
		</div>

		<form onsubmit={masuk} class="card mt-7 flex flex-col gap-4 p-5 md:p-6">
			<div class="flex flex-col gap-1.5">
				<label for="username" class="label">Username</label>
				<input
					id="username"
					bind:value={username}
					autocomplete="username"
					required
					placeholder="Nama pengguna"
					class="input"
				/>
			</div>
			<div class="flex flex-col gap-1.5">
				<label for="password" class="label">Password</label>
				<input
					id="password"
					type="password"
					bind:value={password}
					autocomplete="current-password"
					required
					placeholder="Kata sandi"
					class="input"
				/>
			</div>

			{#if salah}
				<p role="alert" class="notice notice-alert">{salah}</p>
			{/if}

			<button type="submit" disabled={memproses} class="btn btn-primary mt-1 w-full">
				{memproses ? 'Memeriksa…' : 'Masuk'}
			</button>
		</form>

		<p class="mt-6 px-1 text-[13px] leading-relaxed text-ink-3">
			Saldo dompet tidak dapat minus. Pembayaran tagihan dan utang tercatat otomatis sebagai transaksi.
		</p>
	</div>
</main>
