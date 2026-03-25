<script lang="ts">
	import { cn } from '$lib/utils';
	import type { Snippet } from 'svelte';

	interface Props {
		message: string;
		class?: string;
		children?: Snippet;
	}

	let {
		message,
		class: className = '',
		children
	}: Props = $props();
</script>

<div class={cn('p-5 text-center text-[#555] text-[11px] leading-relaxed', className)}>
	{message}
	{#if children}
		{@render children()}
	{/if}
</div>
