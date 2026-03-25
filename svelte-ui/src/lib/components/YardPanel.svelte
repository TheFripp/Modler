<script lang="ts">
	import { onMount } from 'svelte';
	import { Search, ChevronDown, ChevronRight } from 'lucide-svelte';
	import { groupedYardItems, yardSearchQuery, requestYardLibrary, showAddToYardDialog } from '$lib/stores/yard';
	import YardItemCard from './yard/YardItemCard.svelte';
	import AddToYardDialog from './yard/AddToYardDialog.svelte';

	// Track collapsed categories
	let collapsedCategories: Record<string, boolean> = $state({});
	let collapsedSubcategories: Record<string, boolean> = $state({});
	let searchValue = $state('');

	onMount(() => {
		requestYardLibrary();
	});

	function handleSearch() {
		yardSearchQuery.set(searchValue);
	}

	function toggleCategory(cat: string) {
		collapsedCategories[cat] = !collapsedCategories[cat];
	}

	function toggleSubcategory(key: string) {
		collapsedSubcategories[key] = !collapsedSubcategories[key];
	}

	function categoryItemCount(groups: Record<string, any[]>): number {
		let count = 0;
		for (const items of Object.values(groups)) {
			count += items.length;
		}
		return count;
	}
</script>

<div class="yard-panel">
	<!-- Search -->
	<div class="yard-search">
		<Search size={14} class="yard-search-icon" />
		<input
			type="text"
			placeholder="Search yard..."
			bind:value={searchValue}
			oninput={handleSearch}
			class="yard-search-input"
		/>
	</div>

	<!-- Item List -->
	<div class="yard-list">
		{#each Object.entries($groupedYardItems) as [category, subcategories]}
			<div class="yard-category">
				<button
					type="button"
					class="yard-category-header"
					onclick={() => toggleCategory(category)}
				>
					{#if collapsedCategories[category]}
						<ChevronRight size={14} />
					{:else}
						<ChevronDown size={14} />
					{/if}
					<span class="yard-category-name">{category}</span>
					<span class="yard-category-count">{categoryItemCount(subcategories)}</span>
				</button>

				{#if !collapsedCategories[category]}
					{#each Object.entries(subcategories) as [subcategory, items]}
						{@const subKey = `${category}:${subcategory}`}
						<div class="yard-subcategory">
							{#if Object.keys(subcategories).length > 1}
								<button
									type="button"
									class="yard-subcategory-header"
									onclick={() => toggleSubcategory(subKey)}
								>
									{#if collapsedSubcategories[subKey]}
										<ChevronRight size={12} />
									{:else}
										<ChevronDown size={12} />
									{/if}
									<span>{subcategory}</span>
									<span class="yard-category-count">{items.length}</span>
								</button>
							{/if}

							{#if !collapsedSubcategories[subKey]}
								<div class="yard-items">
									{#each items as item (item.id)}
										<YardItemCard {item} />
									{/each}
								</div>
							{/if}
						</div>
					{/each}
				{/if}
			</div>
		{/each}

		{#if Object.keys($groupedYardItems).length === 0}
			<div class="yard-empty">
				{#if searchValue}
					No items match "{searchValue}"
				{:else}
					Yard is empty. Right-click an object to add it.
				{/if}
			</div>
		{/if}
	</div>
</div>

{#if $showAddToYardDialog}
	<AddToYardDialog />
{/if}

<style>
	.yard-panel {
		display: flex;
		flex-direction: column;
		height: 100%;
		overflow: hidden;
	}

	.yard-search {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 8px 10px;
		border-bottom: 1px solid #2e2e2e;
	}

	:global(.yard-search-icon) {
		color: #666;
		flex-shrink: 0;
	}

	.yard-search-input {
		flex: 1;
		background: #1a1a1a;
		border: 1px solid #2e2e2e;
		border-radius: 3px;
		padding: 4px 8px;
		font-size: 11px;
		color: #e0e0e0;
		outline: none;
	}
	.yard-search-input:focus {
		border-color: #4a4a4a;
	}
	.yard-search-input::placeholder {
		color: #555;
	}

	.yard-list {
		flex: 1;
		overflow-y: auto;
		padding: 4px 0;
	}

	.yard-category {
		margin-bottom: 2px;
	}

	.yard-category-header {
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
	.yard-category-header:hover {
		color: #fff;
	}

	.yard-category-name {
		flex: 1;
	}

	.yard-category-count {
		font-size: 10px;
		color: #555;
		font-weight: 400;
	}

	.yard-subcategory {
		margin-left: 8px;
	}

	.yard-subcategory-header {
		display: flex;
		align-items: center;
		gap: 4px;
		width: 100%;
		padding: 4px 10px;
		background: none;
		border: none;
		color: #999;
		font-size: 10px;
		font-weight: 500;
		cursor: pointer;
		text-align: left;
	}
	.yard-subcategory-header:hover {
		color: #ccc;
	}

	.yard-items {
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding: 4px 10px;
	}

	.yard-empty {
		padding: 20px;
		text-align: center;
		color: #555;
		font-size: 11px;
	}
</style>
