<script lang="ts">
	import { onMount } from 'svelte';
	import { ChevronDown, ChevronRight } from 'lucide-svelte';
	import { yardMaterialsList, requestMaterialsList } from '$lib/stores/yard';
	import type { MaterialsListItem } from '$lib/stores/yard';
	import { toDisplayValue, currentUnit } from '$lib/stores/units';

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

<div class="materials-panel">
	{#if $yardMaterialsList.length > 0}
		<!-- Summary -->
		<div class="materials-summary">
			<span class="materials-summary-label">Total items</span>
			<span class="materials-summary-count">{totalCount}</span>
		</div>

		<!-- Materials list grouped by category -->
		<div class="materials-list">
			{#each Object.entries(grouped) as [category, items]}
				<div class="materials-category">
					<button
						type="button"
						class="materials-category-header"
						onclick={() => toggleCategory(category)}
					>
						{#if collapsedCategories[category]}
							<ChevronRight size={14} />
						{:else}
							<ChevronDown size={14} />
						{/if}
						<span class="materials-category-name">{category}</span>
						<span class="materials-category-count">{items.reduce((s, i) => s + i.count, 0)}</span>
					</button>

					{#if !collapsedCategories[category]}
						<div class="materials-items">
							{#each items as item (item.yardItemId)}
								<div class="materials-item">
									<div class="materials-item-info">
										<span class="materials-item-name">{item.name}</span>
										<span class="materials-item-dims">
											{formatDim(item.dimensions.x)} x {formatDim(item.dimensions.y)} x {formatDim(item.dimensions.z)}
										</span>
									</div>
									<span class="materials-item-count">x{item.count}</span>
								</div>
							{/each}
						</div>
					{/if}
				</div>
			{/each}
		</div>
	{:else}
		<div class="materials-empty">
			No yard materials in scene.
			<br /><br />
			Place items from the Yard tab to track materials used.
		</div>
	{/if}
</div>

<style>
	.materials-panel {
		display: flex;
		flex-direction: column;
		height: 100%;
		overflow: hidden;
	}

	.materials-summary {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 10px 14px;
		border-bottom: 1px solid #2e2e2e;
	}

	.materials-summary-label {
		font-size: 11px;
		color: #999;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		font-weight: 600;
	}

	.materials-summary-count {
		font-size: 13px;
		color: #e0e0e0;
		font-weight: 600;
	}

	.materials-list {
		flex: 1;
		overflow-y: auto;
		padding: 4px 0;
	}

	.materials-category {
		margin-bottom: 2px;
	}

	.materials-category-header {
		display: flex;
		align-items: center;
		gap: 4px;
		width: 100%;
		padding: 6px 10px;
		background: none;
		border: none;
		color: #ccc;
		font-size: 11px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		cursor: pointer;
		text-align: left;
	}
	.materials-category-header:hover {
		color: #fff;
	}

	.materials-category-name {
		flex: 1;
	}

	.materials-category-count {
		font-size: 10px;
		color: #555;
		font-weight: 400;
	}

	.materials-items {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 2px 10px 2px 22px;
	}

	.materials-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 6px 8px;
		background: #1e1e1e;
		border-radius: 3px;
		border: 1px solid #2a2a2a;
	}

	.materials-item-info {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}

	.materials-item-name {
		font-size: 11px;
		color: #e0e0e0;
		font-weight: 500;
	}

	.materials-item-dims {
		font-size: 10px;
		color: #666;
	}

	.materials-item-count {
		font-size: 13px;
		color: #9b59b6;
		font-weight: 700;
		flex-shrink: 0;
		margin-left: 8px;
	}

	.materials-empty {
		padding: 20px;
		text-align: center;
		color: #555;
		font-size: 11px;
		line-height: 1.5;
	}
</style>
