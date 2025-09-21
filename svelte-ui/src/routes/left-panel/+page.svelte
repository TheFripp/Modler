<script lang="ts">
	import { onMount } from 'svelte';
	import { initializeBridge } from '$lib/bridge/threejs-bridge';
	import { selectedObjects, objectHierarchy, toolState } from '$lib/stores/modler';

	// Tab state
	let activeTab: 'objects' | 'settings' = 'objects';

	// Filter out floor grid, interactive support objects, and other utility objects from hierarchy
	$: filteredHierarchy = $objectHierarchy.filter(obj =>
		obj.name !== 'Floor Grid' &&
		obj.type !== 'grid' &&
		!obj.name?.toLowerCase().includes('grid') &&
		obj.name !== '(Interactive)' &&
		!obj.name?.toLowerCase().includes('interactive')
	);

	// Build tree structure from flat hierarchy
	$: treeStructure = buildTreeStructure(filteredHierarchy);

	// Tree expansion state
	let expandedContainers = new Set();

	function buildTreeStructure(objects) {
		// First, separate root objects (no parent) and child objects
		const rootObjects = [];
		const childObjectsMap = new Map();

		objects.forEach(obj => {
			if (!obj.parentContainer) {
				// This is a root object
				rootObjects.push({ ...obj, children: [] });
			} else {
				// This is a child object
				if (!childObjectsMap.has(obj.parentContainer)) {
					childObjectsMap.set(obj.parentContainer, []);
				}
				childObjectsMap.get(obj.parentContainer).push(obj);
			}
		});

		// Assign children to their parent containers
		rootObjects.forEach(rootObj => {
			if (rootObj.isContainer && childObjectsMap.has(rootObj.id)) {
				rootObj.children = childObjectsMap.get(rootObj.id);
			}
		});

		return rootObjects;
	}

	function toggleContainer(containerId) {
		if (expandedContainers.has(containerId)) {
			expandedContainers.delete(containerId);
		} else {
			expandedContainers.add(containerId);
		}
		expandedContainers = new Set(expandedContainers); // Trigger reactivity
	}

	// Function to select object in the scene when clicked in hierarchy
	function selectObjectInScene(objectId: string) {
		// Send message to parent window to select object
		window.parent.postMessage({
			type: 'object-select',
			data: { objectId }
		}, '*');
	}

	onMount(() => {
		// Enable dark mode
		document.documentElement.classList.add('dark');

		// Initialize the bridge with Three.js for real-time synchronization
		initializeBridge();
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
				<!-- Object Hierarchy -->
				<div>
					{#if treeStructure.length === 0}
						<div class="text-xs text-muted-foreground p-6 text-center">
							<div class="text-gray-500 mb-2">🎯</div>
							<div>Create objects to see them here</div>
							<div class="text-gray-600 text-xs mt-1">Press T to create a box</div>
						</div>
					{:else}
						<!-- Tree-like sidebar structure -->
						<div class="space-y-1">
							{#each treeStructure as object}
								<!-- Root object -->
								<div class="object-tree-item">
									<div
										class="group flex items-center gap-2 px-2 py-1.5 text-sm rounded-md hover:bg-accent hover:text-accent-foreground cursor-pointer transition-colors"
										class:bg-accent={$selectedObjects.some(sel => sel.id === object.id)}
										class:text-accent-foreground={$selectedObjects.some(sel => sel.id === object.id)}
										on:click={() => selectObjectInScene(object.id)}
										role="button"
										tabindex="0">

										<!-- Expand/collapse button for containers with children -->
										{#if object.isContainer && object.children && object.children.length > 0}
											<button
												class="flex-shrink-0 w-4 h-4 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
												on:click|stopPropagation={() => toggleContainer(object.id)}
												tabindex="-1">
												{#if expandedContainers.has(object.id)}
													<!-- Expanded chevron -->
													<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
														<path stroke-linecap="round" stroke-linejoin="round" d="M6 9l6 6 6-6"/>
													</svg>
												{:else}
													<!-- Collapsed chevron -->
													<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
														<path stroke-linecap="round" stroke-linejoin="round" d="M9 6l6 6-6 6"/>
													</svg>
												{/if}
											</button>
										{:else}
											<!-- Spacer for non-expandable items -->
											<div class="w-4 h-4"></div>
										{/if}

										<!-- Icon based on type -->
										<div class="flex-shrink-0 w-4 h-4 flex items-center justify-center">
											{#if object.isContainer}
												<!-- Container/Folder icon -->
												<svg class="w-3 h-3 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
													<path stroke-linecap="round" stroke-linejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/>
												</svg>
											{:else}
												<!-- Object/Box icon -->
												<svg class="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
													<path stroke-linecap="round" stroke-linejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10"/>
												</svg>
											{/if}
										</div>

										<!-- Object name -->
										<div class="flex-1 truncate font-medium select-none">
											{object.name || object.id}
										</div>
									</div>

									<!-- Child objects (indented) -->
									{#if object.isContainer && object.children && object.children.length > 0 && expandedContainers.has(object.id)}
										<div class="ml-4 space-y-1 mt-1">
											{#each object.children as childObject}
												<div
													class="group flex items-center gap-2 px-2 py-1.5 text-sm rounded-md hover:bg-accent hover:text-accent-foreground cursor-pointer transition-colors"
													class:bg-accent={$selectedObjects.some(sel => sel.id === childObject.id)}
													class:text-accent-foreground={$selectedObjects.some(sel => sel.id === childObject.id)}
													on:click={() => selectObjectInScene(childObject.id)}
													role="button"
													tabindex="0">

													<!-- Spacer for child indentation -->
													<div class="w-4 h-4"></div>

													<!-- Icon based on type -->
													<div class="flex-shrink-0 w-4 h-4 flex items-center justify-center">
														{#if childObject.isContainer}
															<!-- Child Container icon -->
															<svg class="w-3 h-3 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
																<path stroke-linecap="round" stroke-linejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/>
															</svg>
														{:else}
															<!-- Child Object icon -->
															<svg class="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
																<path stroke-linecap="round" stroke-linejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10"/>
															</svg>
														{/if}
													</div>

													<!-- Child object name -->
													<div class="flex-1 truncate font-medium select-none">
														{childObject.name || childObject.id}
													</div>
												</div>
											{/each}
										</div>
									{/if}
								</div>
							{/each}
						</div>
					{/if}
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