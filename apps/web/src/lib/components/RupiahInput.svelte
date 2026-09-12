<script lang="ts">
	// Input rupiah: ketik 1000 → tampil 1.000, nilai tetap number|null.
	interface Props {
		value: number | null;
		id?: string;
		placeholder?: string;
		required?: boolean;
		disabled?: boolean;
		class?: string;
		ariaLabel?: string;
	}

	let {
		value = $bindable(),
		id,
		placeholder = '',
		required = false,
		disabled = false,
		class: cls = '',
		ariaLabel
	}: Props = $props();

	function format(n: number | null): string {
		if (n === null || !Number.isFinite(n)) return '';
		return Math.trunc(n).toLocaleString('id-ID');
	}

	function parse(s: string): number | null {
		const digits = s.replace(/[^0-9]/g, '');
		if (!digits) return null;
		return Number(digits);
	}
</script>

<input
	type="text"
	inputmode="numeric"
	autocomplete="off"
	{id}
	{placeholder}
	{required}
	{disabled}
	aria-label={ariaLabel}
	class={cls}
	value={format(value)}
	oninput={(e) => {
		value = parse(e.currentTarget.value);
	}}
/>
