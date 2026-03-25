<script lang="ts">
	import { cn } from '$lib/utils';
	import { ChevronDown, ChevronRight } from 'lucide-svelte';
	import type { Snippet } from 'svelte';

	interface Props {
		title: string;
		count?: number;
		collapsed?: boolean;
		onToggle?: () => void;
		variant?: 'primary' | 'secondary';
		class?: string;
		children?: Snippet;
	}

	let {
		title,
		count,
		collapsed = false,
		onToggle,
		variant = 'primary',
		class: className = '',
		children
	}: Props = $props();

	// Use external collapsed state if onToggle is provided, otherwise manage internally
	let internalCollapsed = $state(collapsed);

	let isCollapsed = $derived(onToggle ? collapsed : internalCollapsed);

	function handleToggle() {
		if (onToggle) {
			onToggle();
		} else {
			internalCollapsed = !internalCollapsed;
		}
	}

	const isPrimary = $derived(variant === 'primary');
</script>

<div class={cn('', className)}>
	<button
		type="button"
		onclick={handleToggle}
		class={cn(
			'flex items-center gap-1 w-full text-left cursor-pointer transition-colors',
			isPrimary
				? 'py-1.5 px-2.5 text-[11px] font-semibold uppercase tracking-wide text-foreground/80 hover:text-foreground'
				: 'py-1 px-2.5 text-[10px] font-medium text-foreground/60 hover:text-foreground/80'
		)}
	>
		{#if isCollapsed}
			<ChevronRight size={isPrimary ? 14 : 12} />
		{:else}
			<ChevronDown size={isPrimary ? 14 : 12} />
		{/if}
		<span class="flex-1">{title}</span>
		{#if count !== undefined}
			<span class="text-[10px] text-muted-foreground/60 font-normal">{count}</span>
		{/if}
	</button>

	{#if !isCollapsed && children}
		{@render children()}
	{/if}
</div>
