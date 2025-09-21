<script lang="ts">
	import { cn } from '$lib/utils';

	interface Props {
		type?: string;
		value?: string | number;
		placeholder?: string;
		disabled?: boolean;
		class?: string;
		step?: string | number;
		min?: string | number;
		max?: string | number;
		oninput?: (event: Event) => void;
		onchange?: (event: Event) => void;
	}

	let {
		type = 'text',
		value = $bindable(),
		placeholder = '',
		disabled = false,
		class: className = '',
		step,
		min,
		max,
		oninput,
		onchange,
		...restProps
	}: Props = $props();
</script>

<input
	{type}
	bind:value
	{placeholder}
	{disabled}
	{step}
	{min}
	{max}
	{oninput}
	{onchange}
	class={cn(
		'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
		className
	)}
	{...restProps}
/>