<script lang="ts">
	import { cn } from '$lib/utils';

	interface Props {
		title: string;
		class?: string;
		collapsible?: boolean;
		collapsed?: boolean;
		align?: 'left' | 'right';
	}

	let {
		title,
		class: className = '',
		collapsible = false,
		collapsed = false,
		align = 'left',
		children,
		...restProps
	}: Props = $props();

	let isCollapsed = $state(collapsed);

	function toggleCollapse() {
		if (collapsible) {
			isCollapsed = !isCollapsed;
		}
	}
</script>

<div class={cn('property-group', className)} {...restProps}>
	<!-- Section divider line above title -->
	<div class="border-t border-[#2E2E2E] mb-4"></div>

	<div
		class={cn(
			"property-group-header mb-2",
			collapsible && "cursor-pointer select-none hover:text-foreground transition-colors pb-2 border-b border-[#2E2E2E]"
		)}
		onclick={toggleCollapse}
		role={collapsible ? "button" : undefined}
		tabindex={collapsible ? 0 : undefined}
	>
		<div class="flex items-center justify-between">
			<h3 class={cn(
				"modler-section-title w-full",
				align === 'right' ? 'text-right' : 'text-left'
			)}>{title}</h3>
			{#if collapsible}
				<span class="text-xs text-muted-foreground transition-transform" style="transform: rotate({isCollapsed ? -90 : 0}deg)">▼</span>
			{/if}
		</div>
	</div>

	{#if !isCollapsed}
		<div class="property-group-content pt-3 pb-2">
			{@render children?.()}
		</div>
	{/if}
</div>

<style>
	.property-group {
		@apply mb-3;
	}
</style>