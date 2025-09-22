<script lang="ts">
	import { onMount } from 'svelte';
	import PropertyPanel from '$lib/components/PropertyPanel.svelte';
	import { initializeBridge } from '$lib/bridge/threejs-bridge';
	import { selectedObjects, objectHierarchy, toolState } from '$lib/stores/modler';

	// Demo data for development/testing
	let demoMode = true;

	onMount(() => {
		// Try to initialize the bridge with Three.js
		initializeBridge();

		// Set up demo data for development
		if (demoMode) {
			selectedObjects.set([
				{
					id: 'demo-container-1',
					name: 'Layout Container',
					type: 'container',
					isContainer: true,
					position: { x: 0, y: 0, z: 0 },
					rotation: { x: 0, y: 0, z: 0 },
					dimensions: { x: 4, y: 2, z: 1 },
					autoLayout: {
						enabled: true,
						direction: 'x',
						gap: 0.2,
						padding: { top: 0.1, bottom: 0.1, left: 0.1, right: 0.1, front: 0.1, back: 0.1 }
					},
					sizingMode: 'fixed'
				}
			]);

			objectHierarchy.set([
				{
					id: 'demo-container-1',
					name: 'Layout Container',
					type: 'container',
					isContainer: true,
					position: { x: 0, y: 0, z: 0 },
					rotation: { x: 0, y: 0, z: 0 },
					dimensions: { x: 4, y: 2, z: 1 },
					autoLayout: {
						enabled: true,
						direction: 'x',
						gap: 0.2,
						padding: { top: 0.1, bottom: 0.1, left: 0.1, right: 0.1, front: 0.1, back: 0.1 }
					},
					sizingMode: 'fixed'
				},
				{
					id: 'demo-object-1',
					name: 'Cube Object',
					type: 'object',
					position: { x: 1, y: 0, z: 0 },
					rotation: { x: 0, y: 45, z: 0 },
					dimensions: { x: 1, y: 1, z: 1 },
					material: { color: '#4a9eff', opacity: 1.0 },
					parentContainer: 'demo-container-1'
				}
			]);
		}
	});
</script>

<svelte:head>
	<title>Modler V2 - Svelte UI Demo</title>
</svelte:head>

<div class="app-container w-full h-screen bg-gray-900 text-gray-200 flex">
	<!-- Demo Sidebar -->
	<div class="w-64 bg-gray-800 border-r border-gray-600 p-4">
		<h2 class="text-lg font-semibold mb-4">Modler V2 - Svelte UI</h2>

		<!-- Demo Status -->
		<div class="mb-6">
			<h3 class="text-sm font-medium mb-2">Status</h3>
			<div class="text-xs space-y-1">
				<div class="flex justify-between">
					<span class="text-gray-400">Demo Mode:</span>
					<span class="text-green-400">{demoMode ? 'Active' : 'Inactive'}</span>
				</div>
				<div class="flex justify-between">
					<span class="text-gray-400">Selected Objects:</span>
					<span class="text-blue-400">{$selectedObjects.length}</span>
				</div>
				<div class="flex justify-between">
					<span class="text-gray-400">Total Objects:</span>
					<span class="text-blue-400">{$objectHierarchy.length}</span>
				</div>
				<div class="flex justify-between">
					<span class="text-gray-400">Active Tool:</span>
					<span class="text-blue-400">{$toolState.activeTool}</span>
				</div>
			</div>
		</div>

		<!-- Object Hierarchy Preview -->
		<div class="mb-6">
			<h3 class="text-sm font-medium mb-2">Object Hierarchy</h3>
			<div class="space-y-1">
				{#each $objectHierarchy as object}
					<div class="text-xs p-2 bg-gray-700 rounded border border-gray-600">
						<div class="font-medium">{object.name}</div>
						<div class="text-gray-400">{object.type}</div>
					</div>
				{/each}
			</div>
		</div>

		<!-- Integration Info -->
		<div class="text-xs text-gray-400">
			<p class="mb-2">This Svelte UI will integrate with the existing Three.js Modler application.</p>
			<p>The property panel on the right demonstrates real-time property editing with the same functionality as the vanilla JS version.</p>
		</div>
	</div>

	<!-- Three.js Viewport (placeholder) -->
	<div class="flex-1 bg-gray-900 relative">
		<div class="absolute inset-0 flex items-center justify-center">
			<div class="text-center">
				<div class="text-6xl text-gray-400 mb-4">🎲</div>
				<div class="text-xl text-gray-400 mb-2">Three.js Viewport</div>
				<div class="text-sm text-gray-400">
					This area will contain the existing Three.js canvas
				</div>
			</div>
		</div>
	</div>

	<!-- Property Panel -->
	<div class="w-80">
		<PropertyPanel />
	</div>
</div>
