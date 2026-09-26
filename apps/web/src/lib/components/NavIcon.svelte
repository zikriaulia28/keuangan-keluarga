<script lang="ts">
	/** Ikon garis untuk navigasi. Semua digambar dengan ketebalan sama (stroke 2),
	 *  viewBox 24, dan memakai currentColor supaya warna aktif mengikuti induknya. */
	interface Props {
		name: string;
		size?: number;
		class?: string;
	}

	let { name, size = 22, class: cls = '' }: Props = $props();
</script>

<svg
	xmlns="http://www.w3.org/2000/svg"
	width={size}
	height={size}
	viewBox="0 0 24 24"
	fill="none"
	stroke="currentColor"
	stroke-width="2"
	stroke-linecap="round"
	stroke-linejoin="round"
	aria-hidden="true"
	class={cls}
>
	{#if name === 'ringkasan'}
		<rect x="3" y="3" width="7.5" height="7.5" rx="1.5" />
		<rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" />
		<rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" />
		<rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5" />
	{:else if name === 'catat'}
		<path d="M12 20h9" />
		<path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
	{:else if name === 'tagihan'}
		<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
		<path d="M14 2v6h6" />
		<path d="M8.5 13h7" />
		<path d="M8.5 17h4.5" />
	{:else if name === 'utang'}
		<path d="M8 4 4 8l4 4" />
		<path d="M4 8h16" />
		<path d="m16 16 4 4-4 4" />
		<path d="M20 20H4" />
	{:else if name === 'dompet'}
		<path d="M20 9V6a2 2 0 0 0-2-2H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v9a2 2 0 0 1-1 1H5a2 2 0 0 1-2-2V6" />
		<circle cx="16.5" cy="13.5" r="1.25" fill="currentColor" stroke="none" />
	{:else if name === 'anggaran'}
		<path d="M12 3a9 9 0 1 0 9 9h-9Z" />
		<path d="M15 3.6A9 9 0 0 1 20.4 9H15Z" />
	{:else if name === 'pengguna'}
		<circle cx="9.5" cy="7.5" r="3.75" />
		<path d="M2.5 20.5v-1.75A4.75 4.75 0 0 1 7.25 14h4.5a4.75 4.75 0 0 1 4.75 4.75v1.75" />
		<path d="M16.5 4.4a3.75 3.75 0 0 1 0 6.2" />
		<path d="M18.5 14.4a4.75 4.75 0 0 1 3 4.35v1.75" />
	{:else if name === 'lainnya'}
		<circle cx="5" cy="12" r="1.6" fill="currentColor" stroke="none" />
		<circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
		<circle cx="19" cy="12" r="1.6" fill="currentColor" stroke="none" />
	{/if}
</svg>
