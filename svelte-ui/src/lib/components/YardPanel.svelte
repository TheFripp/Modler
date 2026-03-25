<script lang="ts">
	import { onMount } from 'svelte';
	import { groupedYardItems, yardSearchQuery, requestYardLibrary, showAddToYardDialog } from '$lib/stores/yard';
	import YardItemCard from './yard/YardItemCard.svelte';
	import AddToYardDialog from './yard/AddToYardDialog.svelte';
	import CollapsibleCategory from '$lib/components/ui/collapsible-category.svelte';
	import SearchInput from '$lib/components/ui/search-input.svelte';
	import EmptyState from '$lib/components/ui/empty-state.svelte';

	// Track collapsed categories
	let collapsedCategories: Record<string, boolean> = $state({});
	let collapsedSubcategories: Record<string, boolean> = $state({});
	let searchValue = $state('');

	onMount(() => {
		requestYardLibrary();
	});

	function handleSearch(value: string) {
		yardSearchQuery.set(value);
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

<div class="flex flex-col h-full overflow-hidden">
	<!-- Search -->
	<SearchInput bind:value={searchValue} placeholder="Search yard..." onSearch={handleSearch} />

	<!-- Item List -->
	<div class="flex-1 overflow-y-auto py-1">
		{#each Object.entries($groupedYardItems) as [category, subcategories]}
			<CollapsibleCategory
				title={category}
				count={categoryItemCount(subcategories)}
				collapsed={collapsedCategories[category] ?? false}
				onToggle={() => toggleCategory(category)}
				class="mb-0.5"
			>
				{#each Object.entries(subcategories) as [subcategory, items]}
					{@const subKey = `${category}:${subcategory}`}
					<div class="ml-2">
						{#if Object.keys(subcategories).length > 1}
							<CollapsibleCategory
								title={subcategory}
								count={items.length}
								collapsed={collapsedSubcategories[subKey] ?? false}
								onToggle={() => toggleSubcategory(subKey)}
								variant="secondary"
							>
								<div class="flex flex-col gap-1 px-2.5 py-1">
									{#each items as item (item.id)}
										<YardItemCard {item} />
									{/each}
								</div>
							</CollapsibleCategory>
						{:else}
							{#if !(collapsedSubcategories[subKey])}
								<div class="flex flex-col gap-1 px-2.5 py-1">
									{#each items as item (item.id)}
										<YardItemCard {item} />
									{/each}
								</div>
							{/if}
						{/if}
					</div>
				{/each}
			</CollapsibleCategory>
		{/each}

		{#if Object.keys($groupedYardItems).length === 0}
			<EmptyState message={searchValue ? `No items match "${searchValue}"` : 'Yard is empty. Right-click an object to add it.'} />
		{/if}
	</div>
</div>

{#if $showAddToYardDialog}
	<AddToYardDialog />
{/if}
