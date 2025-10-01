<script lang="ts">
	import { onMount } from 'svelte';
	import PropertyPanel from '$lib/components/PropertyPanel.svelte';
	import { initializeBridge } from '$lib/bridge/threejs-bridge';
	import { selectedObjects, selectedObject } from '$lib/stores/modler';
	import { unifiedCommunication } from '$lib/services/unified-communication';

	onMount(() => {
		// Initialize the bridge with Three.js
		initializeBridge();

		// Handle keyboard shortcuts globally when property panel has focus
		const handleKeyDown = (event: KeyboardEvent) => {
			// Skip if typing in an input field
			const target = event.target as HTMLElement;
			if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.contentEditable === 'true') {
				return;
			}

			// Skip if modifier keys are pressed (let main app handle Cmd+Z, etc.)
			if (event.metaKey || event.ctrlKey) {
				return;
			}

			// Tool switching shortcuts
			switch (event.key.toLowerCase()) {
				case 'q':
					event.preventDefault();
					unifiedCommunication.sendToolActivation('select');
					break;
				case 'w':
					event.preventDefault();
					unifiedCommunication.sendToolActivation('move');
					break;
				case 'e':
					event.preventDefault();
					unifiedCommunication.sendToolActivation('push');
					break;
				case 'r':
					event.preventDefault();
					unifiedCommunication.sendToolActivation('box-creation');
					break;
			}
		};

		document.addEventListener('keydown', handleKeyDown);

		// Cleanup
		return () => {
			document.removeEventListener('keydown', handleKeyDown);
		};
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