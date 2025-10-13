<script lang="ts">
	import { onMount } from 'svelte';
	import { displayObject, toolState } from '$lib/stores/modler';
	import { propertySectionRegistry } from '$lib/services/property-section-registry';
	import Badge from '$lib/components/ui/badge.svelte';
	import TileControls from '$lib/components/TileControls.svelte';
	import PropertyGroup from '$lib/components/ui/property-group.svelte';

	// Import section components
	import TransformSection from '$lib/components/property-sections/TransformSection.svelte';
	import MaterialSection from '$lib/components/property-sections/MaterialSection.svelte';
	import LayoutSection from '$lib/components/property-sections/LayoutSection.svelte';
	import TileSection from '$lib/components/property-sections/TileSection.svelte';

	// Phase 3: Initialize store bridge for direct mounting
	import '$lib/bridge/store-bridge-init';

	// Unit system state
	let currentUnit = 'm';
	let unitConverter: any = null;

	// Tile tool state (for creating new tiled containers)
	let tileAxis: 'x' | 'y' | 'z' | null = null;
	let tileRepeat: number = 3;
	let tileGap: number = 0;

	// Update current unit from UnitConverter or unit change events
	function updateCurrentUnit() {
		if (unitConverter) {
			currentUnit = unitConverter.userUnit;
		}
	}

	// Get the appropriate object ID for property updates (multi-selection or single object)
	function getObjectIdForUpdate(): string {
		return $displayObject?.id || '';
	}

	// Determine object type for section registry
	function getObjectType(obj: any): string {
		if (!obj) return '';

		// Check for tiled container first
		if (obj.isContainer && obj.autoLayout?.tileMode?.enabled) {
			return 'tiled-container';
		}

		// Check for regular container
		if (obj.isContainer) {
			return 'container';
		}

		// Check for multi-selection
		if (obj.type === 'multi' || obj.type === 'mixed') {
			return 'multi';
		}

		// Default to box
		return 'box';
	}

	// Get sections for current object
	$: objectType = getObjectType($displayObject);
	$: sections = propertySectionRegistry.getSections(objectType);

	// Tile tool handlers
	function selectTileAxis(axis: 'x' | 'y' | 'z') {
		tileAxis = axis;
		// Auto-create when axis is selected
		createTiledContainer();
	}

	function createTiledContainer() {
		if (!tileAxis || tileRepeat < 2 || !$displayObject) return;

		// Send tile creation request to main window
		window.parent.postMessage({
			type: 'create-tiled-container',
			data: {
				objectId: $displayObject.id,
				axis: tileAxis,
				repeat: tileRepeat,
				gap: tileGap
			}
		}, '*');
	}

	// Initialize unit system on mount
	onMount(() => {
		// Get unit converter instance
		unitConverter = typeof window !== 'undefined' && window.UnitConverter ? new UnitConverter() : null;
		updateCurrentUnit();

		// Listen for unit changes from settings
		if (typeof window !== 'undefined') {
			window.addEventListener('unit-changed', updateCurrentUnit);

			return () => {
				window.removeEventListener('unit-changed', updateCurrentUnit);
			};
		}
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
				{#if $displayObject.isContainer && $displayObject.autoLayout?.tileMode?.enabled}
					<Badge variant="outline" style="background-color: hsl(var(--modler-selection) / 0.25); color: hsl(var(--modler-selection)); border-color: hsl(var(--modler-selection) / 0.3);">
						Tile
					</Badge>
				{:else if $displayObject.isContainer}
					<Badge variant="outline" style="background-color: hsl(var(--modler-container) / 0.25); color: hsl(var(--modler-container)); border-color: hsl(var(--modler-container) / 0.3);">
						Container
					</Badge>
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
			</div>
		</div>

		<!-- Render sections dynamically based on object type -->
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
			{:else if section.type === 'tile'}
				<TileSection
					displayObject={$displayObject}
					objectId={getObjectIdForUpdate()}
					{currentUnit}
				/>
			{/if}
		{/each}

		<!-- Tile Tool Section (only when tile tool is active and non-container selected) -->
		{#if $toolState.activeTool === 'tile' && !$displayObject.isContainer}
			<PropertyGroup title="Tile Configuration">
				<TileControls
					axis={tileAxis}
					bind:repeat={tileRepeat}
					bind:gap={tileGap}
					{currentUnit}
					objectId={null}
					onAxisChange={selectTileAxis}
				/>
			</PropertyGroup>
		{/if}
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
