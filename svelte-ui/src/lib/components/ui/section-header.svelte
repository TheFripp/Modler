<script lang="ts">
	import { cn } from '$lib/utils';

	interface Props {
		label: string;
		align?: 'left' | 'right';
		unit?: string;
		class?: string;
	}

	let {
		label,
		align = 'right',
		unit,
		class: className = '',
	}: Props = $props();
</script>

<div class={cn('flex items-center gap-2 mb-2', className)}>
	{#if align === 'left'}
		<h4 class="modler-property-label opacity-70 whitespace-nowrap">{label}{#if unit} <span class="text-muted-foreground opacity-60">({unit})</span>{/if}</h4>
		<div class="flex-1 border-t border-[#2E2E2E]/50"></div>
	{:else}
		<div class="flex-1 border-t border-[#2E2E2E]/50"></div>
		<h4 class="modler-property-label text-right whitespace-nowrap">{label}{#if unit} <span class="text-muted-foreground opacity-60">({unit})</span>{/if}</h4>
	{/if}
</div>
