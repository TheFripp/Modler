<script lang="ts">
	import { onMount } from 'svelte';
	import { displayObject } from '$lib/stores/modler';
	import { propertySectionRegistry } from '$lib/services/property-section-registry';
	import { currentUnit as storeUnit } from '$lib/stores/units';
	import Badge from '$lib/components/ui/badge.svelte';

	// Import section components
	import TransformSection from '$lib/components/property-sections/TransformSection.svelte';
	import MaterialSection from '$lib/components/property-sections/MaterialSection.svelte';
	import LayoutSection from '$lib/components/property-sections/LayoutSection.svelte';
	import TileSection from '$lib/components/property-sections/TileSection.svelte';

	// SimpleCommunication: No bridge initialization needed

	// Unit from centralized store (updated via postMessage from main window)
	$: currentUnit = $storeUnit;

	// Get the appropriate object ID for property updates (multi-selection or single object)
	function getObjectIdForUpdate(): string {
		return $displayObject?.id || '';
	}

	// Determine base object type for section registry
	function getObjectType(obj: any): string {
		if (!obj) return '';
		if (obj.isContainer) return 'container';
		if (obj.type === 'multi' || obj.type === 'mixed') return 'multi';
		return 'box';
	}

	// Detect active modifiers on the container
	// Modifiers add extra sections below the base Layout section
	function getModifiers(obj: any): string[] {
		if (!obj?.isContainer) return [];
		const mods: string[] = [];
		if (obj.autoLayout?.tileMode?.enabled) mods.push('tile');
		// Future modifiers: mirror, pattern, array, etc.
		return mods;
	}

	// Get sections for current object
	$: objectType = getObjectType($displayObject);
	$: sections = propertySectionRegistry.getSections(objectType);
	$: modifiers = getModifiers($displayObject);

	onMount(() => {
		// Forward Tab key to parent window when not in an input
		const handleTabKey = (event: KeyboardEvent) => {
			if (event.key === 'Tab') {
				const activeElement = document.activeElement;
				const isInputFocused = activeElement && (
					activeElement.tagName === 'INPUT' ||
					activeElement.tagName === 'TEXTAREA' ||
					activeElement instanceof HTMLElement && activeElement.isContentEditable
				);

				if (!isInputFocused) {
					event.preventDefault();
					window.parent.postMessage({
						type: 'keyboard-event',
						key: 'Tab',
						code: 'Tab'
					}, '*');
				}
			}
		};

		window.addEventListener('keydown', handleTabKey);

		return () => {
			window.removeEventListener('keydown', handleTabKey);
		};
	});
</script>

<div class="property-panel h-full bg-[#171717] border-l border-[#2E2E2E] overflow-y-scroll">
	<div class="pl-4 py-4" style="padding-right: 1.5rem;">

	{#if $displayObject}
		{#key $displayObject.id}
		<!-- Object Name and Type -->
		<div class="flex items-center justify-between mb-6">
			<h3 class="modler-object-name">{$displayObject.name}</h3>
			<div class="flex items-center gap-2">
				{#if $displayObject.isContainer}
					<Badge variant="outline" style="background-color: hsl(var(--modler-container) / 0.25); color: hsl(var(--modler-container)); border-color: hsl(var(--modler-container) / 0.3);">
						Container
					</Badge>
					{#each modifiers as mod}
						<Badge variant="outline" style="background-color: hsl(var(--modler-selection) / 0.25); color: hsl(var(--modler-selection)); border-color: hsl(var(--modler-selection) / 0.3);">
							{mod.charAt(0).toUpperCase() + mod.slice(1)}
						</Badge>
					{/each}
				{:else if $displayObject.type === 'multi'}
					<Badge variant="outline" style="background-color: hsl(var(--modler-selection) / 0.25); color: hsl(var(--modler-selection)); border-color: hsl(var(--modler-selection) / 0.3);">
						Mixed
					</Badge>
				{:else if $displayObject.type === 'mixed'}
					<Badge variant="outline" style="background-color: hsl(var(--modler-selection) / 0.25); color: hsl(var(--modler-selection)); border-color: hsl(var(--modler-selection) / 0.3);">
						Mixed Types
					</Badge>
				{:else}
					<Badge variant="outline" style="background-color: hsl(var(--modler-object) / 0.25); color: hsl(var(--modler-object)); border-color: hsl(var(--modler-object) / 0.3);">
						{$displayObject.type}
					</Badge>
				{/if}
				{#if $displayObject.yardItemId}
					<Badge variant="outline" style="background-color: rgba(155, 89, 182, 0.25); color: #9b59b6; border-color: rgba(155, 89, 182, 0.3);">
						Yard
					</Badge>
				{/if}
			</div>
		</div>

		<!-- Render base sections from registry -->
		{#each sections as section}
			{#if section.type === 'transform'}
				<TransformSection
					displayObject={$displayObject}
					objectId={getObjectIdForUpdate()}
					{currentUnit}
					features={section.features ?? {}}
				/>
			{:else if section.type === 'material'}
				<MaterialSection
					displayObject={$displayObject}
					objectId={getObjectIdForUpdate()}
				/>
			{:else if section.type === 'layout'}
				<LayoutSection
					displayObject={$displayObject}
					objectId={getObjectIdForUpdate()}
					{currentUnit}
				/>
			{/if}
		{/each}

		<!-- Render modifier sections (additive, below base sections) -->
		{#each modifiers as modifier}
			{#if modifier === 'tile'}
				<TileSection
					displayObject={$displayObject}
					objectId={getObjectIdForUpdate()}
				/>
			{/if}
		{/each}

		{/key}
	{:else}
		<!-- Empty state: Show header and disabled transform section -->
		<div class="flex items-center justify-between mb-6">
			<h3 class="modler-object-name opacity-40">No Selection</h3>
		</div>

		<TransformSection
			displayObject={null}
			objectId=""
			{currentUnit}
			features={{}}
		/>
	{/if}

	</div>
</div>

<style>
	.property-panel {
		/* Ensure padding is not affected by scrollbar */
		scrollbar-gutter: stable;
	}
</style>
