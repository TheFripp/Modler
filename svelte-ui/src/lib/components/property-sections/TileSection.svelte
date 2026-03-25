<script lang="ts">
	import { onMount } from 'svelte';
	import PropertyGroup from '$lib/components/ui/property-group.svelte';
	import InlineInput from '$lib/components/ui/inline-input.svelte';

	// Props
	export let displayObject: any;
	export let objectId: string;

	// Reactive values from data
	$: repeat = displayObject.autoLayout?.tileMode?.repeat ?? 3;

	// Enforce integer values for repeat count
	function toInteger(val: number): number {
		return Math.round(val);
	}

	// Auto-focus repeat input when requested (after tile tool creates container)
	onMount(() => {
		const handleFocusRequest = (event: MessageEvent) => {
			if (event.data?.type === 'focus-tile-repeat' &&
				String(event.data.objectId) === String(objectId)) {
				const input = document.getElementById('tile-repeat-input');
				if (input) {
					input.focus();
					(input as HTMLInputElement).select();
				}
			}
		};

		window.addEventListener('message', handleFocusRequest);
		return () => window.removeEventListener('message', handleFocusRequest);
	});
</script>

<PropertyGroup title="Tile Modifier">
	<InlineInput
		id="tile-repeat-input"
		label="Repeat"
		type="number"
		value={repeat}
		{objectId}
		property="autoLayout.tileMode.repeat"
		min={2}
		max={20}
		step={1}
		convertToInternal={toInteger}
	/>
</PropertyGroup>
