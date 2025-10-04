<script lang="ts">
	import PropertyGroup from '$lib/components/ui/property-group.svelte';
	import MaterialInput from '$lib/components/ui/material-input.svelte';

	// Props
	export let displayObject: any;
	export let objectId: string;
</script>

{#if displayObject.material}
	<PropertyGroup title="Material">
		<MaterialInput
			color={displayObject.material.color}
			opacity={displayObject.material.opacity}
			{objectId}
		/>
	</PropertyGroup>
{/if}
