<script lang="ts">
	import { onMount } from 'svelte';
	import PropertyPanel from '$lib/components/PropertyPanel.svelte';
	import { initializeBridge } from '$lib/bridge/threejs-bridge';
	import { selectedObjects, selectedObject } from '$lib/stores/modler';

	onMount(() => {
		// Initialize the bridge with Three.js
		initializeBridge();
	});
</script>

<svelte:head>
	<title>Property Panel</title>
</svelte:head>

<!-- Standalone Property Panel for iframe integration -->
<div class="standalone-property-panel w-full h-screen bg-card">
	<PropertyPanel />
</div>

<style>
	:global(body) {
		margin: 0;
		padding: 0;
		overflow: hidden;
	}

	.standalone-property-panel {
		min-height: 100vh;
	}
</style>