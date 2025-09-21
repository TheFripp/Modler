<script lang="ts">
	import { cn } from '$lib/utils';

	interface Props {
		title: string;
		class?: string;
		collapsible?: boolean;
		collapsed?: boolean;
	}

	let {
		title,
		class: className = '',
		collapsible = false,
		collapsed = false,
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
	<div class="property-group-header mb-2">
		<h3 class="text-xs font-medium text-muted-foreground mb-2">{title}</h3>
	</div>

	{#if !isCollapsed}
		<div class="property-group-content">
			{@render children?.()}
		</div>
	{/if}
</div>

<style>
	.property-group {
		@apply mb-3;
	}
</style>