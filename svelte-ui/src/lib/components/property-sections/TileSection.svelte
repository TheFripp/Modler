<script lang="ts">
	import PropertyGroup from '$lib/components/ui/property-group.svelte';
	import TileControls from '$lib/components/TileControls.svelte';
	import { updateThreeJSProperty } from '$lib/stores/modler';

	// Props
	export let displayObject: any;
	export let objectId: string;
	export let currentUnit: string = 'm';

	// Reactive values
	$: layoutDirection = displayObject.autoLayout?.direction ?? '';
	$: gapValue = displayObject.calculatedGap !== undefined
		? displayObject.calculatedGap
		: (displayObject.autoLayout?.gap ?? 0);

	// Handle layout axis selection (NO toggle for tiled containers - always change direction)
	function selectLayoutAxis(axis: string) {
		if (!axis || !['x', 'y', 'z'].includes(axis)) {
			console.error('❌ Invalid layout axis:', axis);
			return;
		}

		// For tiled containers, just change the direction (no toggle)
		// Build complete autoLayout object
		const autoLayout = {
			enabled: true, // Always keep enabled for tiled containers
			direction: axis, // Set new direction
			gap: displayObject.autoLayout?.gap ?? 0,
			padding: displayObject.autoLayout?.padding ?? {
				width: 0, height: 0, depth: 0
			},
			alignment: displayObject.autoLayout?.alignment ?? { x: 'center', y: 'center', z: 'center' },
			tileMode: displayObject.autoLayout?.tileMode
		};

		updateThreeJSProperty(objectId, 'autoLayout', autoLayout, 'property-panel');
	}

	// Handle alignment changes
	function handleAlignmentChange(axis: string, value: string) {
		const currentAlignment = displayObject.autoLayout?.alignment ?? { x: 'center', y: 'center', z: 'center' };
		const newAlignment = { ...currentAlignment, [axis]: value };

		const autoLayout = {
			enabled: true,
			direction: displayObject.autoLayout?.direction,
			gap: displayObject.autoLayout?.gap ?? 0,
			padding: displayObject.autoLayout?.padding ?? {
				width: 0, height: 0, depth: 0
			},
			alignment: newAlignment,
			tileMode: displayObject.autoLayout?.tileMode
		};

		updateThreeJSProperty(objectId, 'autoLayout', autoLayout, 'property-panel');
	}
</script>

<PropertyGroup title="Tile">
	<TileControls
		axis={layoutDirection}
		repeat={displayObject.autoLayout?.tileMode?.repeat ?? 3}
		gap={gapValue}
		alignment={displayObject.autoLayout?.alignment}
		{currentUnit}
		{objectId}
		onAxisChange={selectLayoutAxis}
		onAlignmentChange={handleAlignmentChange}
	/>
</PropertyGroup>
