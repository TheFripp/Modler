<script lang="ts">
	import { onMount } from 'svelte';
	import { initializeBridge } from '$lib/bridge/threejs-bridge';
	import { selectedObjects, objectHierarchy, toolState } from '$lib/stores/modler';

	// Tab state
	let activeTab: 'objects' | 'settings' = 'objects';

	// Demo mode for development/testing
	let demoMode = true;

	onMount(() => {
		// Enable dark mode
		document.documentElement.classList.add('dark');

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
	<title>Object List & Settings</title>
</svelte:head>

<!-- Standalone Left Panel for iframe integration -->
<div class="standalone-left-panel w-full h-screen bg-background text-foreground flex flex-col">
	<!-- Horizontal Tabs -->
	<div class="flex border-b border-border bg-card">
		<button
			class="flex-1 px-4 py-3 text-sm font-medium transition-colors {activeTab === 'objects' ? 'bg-background text-foreground border-b-2 border-primary' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'}"
			on:click={() => activeTab = 'objects'}
		>
			Objects
		</button>
		<button
			class="flex-1 px-4 py-3 text-sm font-medium transition-colors {activeTab === 'settings' ? 'bg-background text-foreground border-b-2 border-primary' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'}"
			on:click={() => activeTab = 'settings'}
		>
			Settings
		</button>
	</div>

	<!-- Tab Content -->
	<div class="flex-1 p-4 overflow-y-auto">
		{#if activeTab === 'objects'}
			<!-- Objects Tab Content -->
			<div class="space-y-4">
				<!-- Demo Status -->
				<div class="pb-4 border-b border-border">
					<h3 class="text-sm font-medium mb-2 text-foreground">Status</h3>
					<div class="text-xs space-y-1">
						<div class="flex justify-between">
							<span class="text-muted-foreground">Demo Mode:</span>
							<span class="text-green-400">{demoMode ? 'Active' : 'Inactive'}</span>
						</div>
						<div class="flex justify-between">
							<span class="text-muted-foreground">Selected Objects:</span>
							<span class="text-muted-foreground">{$selectedObjects.length}</span>
						</div>
						<div class="flex justify-between">
							<span class="text-muted-foreground">Total Objects:</span>
							<span class="text-muted-foreground">{$objectHierarchy.length}</span>
						</div>
						<div class="flex justify-between">
							<span class="text-muted-foreground">Active Tool:</span>
							<span class="text-muted-foreground">{$toolState.activeTool}</span>
						</div>
					</div>
				</div>

				<!-- Object Hierarchy -->
				<div>
					<h3 class="text-sm font-medium mb-2 text-foreground">Object Hierarchy</h3>
					<div class="space-y-1">
						{#each $objectHierarchy as object}
							<div class="text-xs p-2 bg-card border border-border rounded">
								<div class="font-medium text-card-foreground">{object.name}</div>
								<div class="text-muted-foreground">{object.type}</div>
							</div>
						{/each}
					</div>
				</div>
			</div>
		{:else if activeTab === 'settings'}
			<!-- Settings Tab Content -->
			<div class="space-y-4">
				<h3 class="text-sm font-medium text-foreground">Application Settings</h3>

				<!-- Tool Settings -->
				<div class="pb-4 border-b border-border">
					<h4 class="text-xs font-medium mb-2 text-foreground">Tools</h4>
					<div class="space-y-2">
						<div class="flex items-center justify-between">
							<span class="text-xs text-muted-foreground">Snap Enabled:</span>
							<span class="text-xs text-muted-foreground">{$toolState.snapEnabled ? 'Yes' : 'No'}</span>
						</div>
						<div class="flex items-center justify-between">
							<span class="text-xs text-muted-foreground">Active Tool:</span>
							<span class="text-xs text-muted-foreground">{$toolState.activeTool}</span>
						</div>
					</div>
				</div>

				<!-- Integration Info -->
				<div>
					<h4 class="text-xs font-medium mb-2 text-foreground">Integration</h4>
					<div class="text-xs text-muted-foreground space-y-1">
						<p>Svelte-based object list and settings panel.</p>
						<p>Real-time synchronization with Three.js Modler application.</p>
					</div>
				</div>
			</div>
		{/if}
	</div>
</div>

<style>
	:global(body) {
		margin: 0;
		padding: 0;
		overflow: hidden;
	}

	.standalone-left-panel {
		min-height: 100vh;
		overflow-y: auto;
	}
</style>