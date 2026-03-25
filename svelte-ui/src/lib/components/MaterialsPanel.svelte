<script lang="ts">
	import { onMount } from 'svelte';
	import { yardMaterialsList, requestMaterialsList } from '$lib/stores/yard';
	import type { MaterialsListItem } from '$lib/stores/yard';
	import { toDisplayValue, currentUnit } from '$lib/stores/units';
	import CollapsibleCategory from '$lib/components/ui/collapsible-category.svelte';
	import EmptyState from '$lib/components/ui/empty-state.svelte';

	let collapsedCategories: Record<string, boolean> = $state({});

	onMount(() => {
		requestMaterialsList();
	});

	function toggleCategory(cat: string) {
		collapsedCategories[cat] = !collapsedCategories[cat];
	}

	function formatDim(value: number): string {
		return String(toDisplayValue(value));
	}

	// Group materials by category
	function groupByCategory(items: MaterialsListItem[]): Record<string, MaterialsListItem[]> {
		const groups: Record<string, MaterialsListItem[]> = {};
		for (const item of items) {
			const cat = item.category || 'Uncategorized';
			if (!groups[cat]) groups[cat] = [];
			groups[cat].push(item);
		}
		return groups;
	}

	let grouped = $derived(groupByCategory($yardMaterialsList));
	let totalCount = $derived($yardMaterialsList.reduce((sum: number, item: MaterialsListItem) => sum + item.count, 0));
	let unit = $derived($currentUnit);
</script>

<div class="flex flex-col h-full overflow-hidden">
	{#if $yardMaterialsList.length > 0}
		<!-- Summary -->
		<div class="flex items-center justify-between px-3.5 py-2.5 border-b border-[#2E2E2E]">
			<span class="text-[11px] text-[#999] uppercase tracking-wide font-semibold">Total items</span>
			<span class="text-[13px] text-[#e0e0e0] font-semibold">{totalCount}</span>
		</div>

		<!-- Materials list grouped by category -->
		<div class="flex-1 overflow-y-auto py-1">
			{#each Object.entries(grouped) as [category, items]}
				<CollapsibleCategory
					title={category}
					count={items.reduce((s, i) => s + i.count, 0)}
					collapsed={collapsedCategories[category] ?? false}
					onToggle={() => toggleCategory(category)}
					class="mb-0.5"
				>
					<div class="flex flex-col gap-0.5 px-2.5 pl-[22px] py-0.5">
						{#each items as item (item.yardItemId)}
							<div class="flex items-center justify-between p-1.5 px-2 bg-[#1e1e1e] rounded border border-[#2a2a2a]">
								<div class="flex flex-col gap-0.5 min-w-0">
									<span class="text-[11px] text-[#e0e0e0] font-medium">{item.name}</span>
									<span class="text-[10px] text-[#666]">
										{formatDim(item.dimensions.x)} x {formatDim(item.dimensions.z)} x {formatDim(item.dimensions.y)}
									</span>
								</div>
								<span class="text-[13px] text-[#9b59b6] font-bold shrink-0 ml-2">x{item.count}</span>
							</div>
						{/each}
					</div>
				</CollapsibleCategory>
			{/each}
		</div>
	{:else}
		<EmptyState message="No yard materials in scene.">
			<br /><br />
			Place items from the Yard tab to track materials used.
		</EmptyState>
	{/if}
</div>
