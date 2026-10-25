<script lang="ts">
	import { rupiah } from '$lib/api';
	import { namaBulan } from '$lib/format';

	type Baris = {
		kategoriId: number;
		kategori: string;
		perBulan: number[];
		total: number;
	};

	let {
		judul,
		bulan,
		baris,
		total,
		kalimat
	}: {
		judul: string;
		bulan: string[];
		baris: Baris[];
		total: number;
		kalimat?: string;
	} = $props();
</script>

<!-- Satu komponen untuk sisi masuk dan sisi keluar: keduanya tabel yang sama,
     supaya markup tidak ditulis dua kali. -->
<section class="mt-6">
	<div class="flex items-baseline justify-between gap-3">
		<h2 class="head">{judul}</h2>
		<span class="text-[13px] text-ink-2">Total {rupiah(total)}</span>
	</div>
	{#if kalimat}
		<p class="mt-0.5 text-[13px] text-ink-3">{kalimat}</p>
	{/if}
	<div class="card mt-3 overflow-x-auto">
		<table class="w-full min-w-[420px] text-sm">
			<thead>
				<tr class="border-b border-line">
					<th scope="col" class="px-4 py-2.5 text-left text-[12px] font-semibold text-ink-3">
						Kategori
					</th>
					{#each bulan as b}
						<th scope="col" class="px-2 py-2.5 text-right text-[12px] font-semibold text-ink-3">
							{namaBulan(b)}
						</th>
					{/each}
					<th scope="col" class="px-4 py-2.5 text-right text-[12px] font-semibold text-ink-3">
						Total
					</th>
				</tr>
			</thead>
			<tbody>
				{#each baris as k (k.kategoriId)}
					<tr class="border-b border-line last:border-0">
						<th scope="row" class="px-4 py-2.5 text-left font-semibold">{k.kategori}</th>
						{#each k.perBulan as n}
							<td class="money px-2 py-2.5 text-right {n === 0 ? 'text-ink-3' : ''}">
								{n === 0 ? '—' : rupiah(n)}
							</td>
						{/each}
						<td class="money px-4 py-2.5 text-right font-bold">{rupiah(k.total)}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</section>