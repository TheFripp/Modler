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

	// Handle layout axis selection with toggle behavior
	function selectLayoutAxis(axis: string) {
		if (!axis || !['x', 'y', 'z'].includes(axis)) {
			console.error('❌ Invalid layout axis:', axis);
			return;
		}

		const currentDirection = displayObject.autoLayout?.direction;
		const isCurrentlyEnabled = displayObject.autoLayout?.enabled;

		// Build complete autoLayout object
		const autoLayout = {
			enabled: !(currentDirection === axis && isCurrentlyEnabled),
			direction: (currentDirection === axis && isCurrentlyEnabled) ? '' : axis,
			gap: displayObject.autoLayout?.gap ?? 0,
			padding: displayObject.autoLayout?.padding ?? {
				width: 0, height: 0, depth: 0
			},
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
		{currentUnit}
		{objectId}
		onAxisChange={selectLayoutAxis}
	/>
</PropertyGroup>
