<script lang="ts">
	import PropertyGroup from '$lib/components/ui/property-group.svelte';
	import InlineInput from '$lib/components/ui/inline-input.svelte';

	// Props
	export let displayObject: any;
	export let objectId: string;

	// Reactive repeat value from data
	$: repeat = displayObject.autoLayout?.tileMode?.repeat ?? 3;

	// Enforce integer values for repeat count
	function toInteger(val: number): number {
		return Math.round(val);
	}
</script>

<PropertyGroup title="Tile Modifier">
	<div class="space-y-2">
		<InlineInput
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
	</div>
</PropertyGroup>
