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
		// Check if we're in iframe context
		const isInIframe = window !== window.parent;

		if (!isInIframe && (window as any).selectObjectInSceneDirectly) {
			// Direct context: use direct communication
			const success = (window as any).selectObjectInSceneDirectly(objectId);
			if (success) return;
		}

		// Iframe context or fallback: use PostMessage
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
				<h3 class="text-sm font-medium text-foreground mb-4">Application Settings</h3>

				<!-- Visual Settings -->
				<div class="space-y-3">
					<h4 class="text-xs font-medium text-foreground border-b border-border pb-2">Visual</h4>

					<!-- Selection Settings -->
					<div class="space-y-2">
						<h5 class="text-xs font-medium text-muted-foreground">Selection</h5>
						<div class="space-y-2 pl-2">
							<div class="flex items-center justify-between">
								<label class="text-xs text-foreground">Color</label>
								<input type="color" class="w-8 h-6 rounded border border-border" value="#ff6600" />
							</div>
							<div class="flex items-center justify-between">
								<label class="text-xs text-foreground">Line Width</label>
								<div class="flex items-center gap-2">
									<input type="range" min="1" max="5" step="1" value="2" class="w-16 h-1" />
									<span class="text-xs text-muted-foreground w-6">2</span>
								</div>
							</div>
							<div class="flex items-center justify-between">
								<label class="text-xs text-foreground">Opacity</label>
								<div class="flex items-center gap-2">
									<input type="range" min="0.1" max="1.0" step="0.1" value="0.8" class="w-16 h-1" />
									<span class="text-xs text-muted-foreground w-6">0.8</span>
								</div>
							</div>
						</div>
					</div>

					<!-- Container Settings -->
					<div class="space-y-2">
						<h5 class="text-xs font-medium text-muted-foreground">Containers</h5>
						<div class="space-y-2 pl-2">
							<div class="flex items-center justify-between">
								<label class="text-xs text-foreground">Color</label>
								<input type="color" class="w-8 h-6 rounded border border-border" value="#00ff00" />
							</div>
							<div class="flex items-center justify-between">
								<label class="text-xs text-foreground">Line Width</label>
								<div class="flex items-center gap-2">
									<input type="range" min="1" max="5" step="1" value="1" class="w-16 h-1" />
									<span class="text-xs text-muted-foreground w-6">1</span>
								</div>
							</div>
							<div class="flex items-center justify-between">
								<label class="text-xs text-foreground">Opacity</label>
								<div class="flex items-center gap-2">
									<input type="range" min="0.1" max="1.0" step="0.1" value="0.8" class="w-16 h-1" />
									<span class="text-xs text-muted-foreground w-6">0.8</span>
								</div>
							</div>
						</div>
					</div>

					<!-- Snapping Settings -->
					<div class="space-y-2">
						<h5 class="text-xs font-medium text-muted-foreground">Snapping</h5>
						<div class="space-y-2 pl-2">
							<div class="flex items-center justify-between">
								<label class="text-xs text-foreground">Color</label>
								<input type="color" class="w-8 h-6 rounded border border-border" value="#ffffff" />
							</div>
							<div class="flex items-center justify-between">
								<label class="text-xs text-foreground">Corner Size</label>
								<div class="flex items-center gap-2">
									<input type="range" min="0.05" max="0.3" step="0.05" value="0.1" class="w-16 h-1" />
									<span class="text-xs text-muted-foreground w-6">0.1</span>
								</div>
							</div>
						</div>
					</div>
				</div>

				<!-- Scene Settings -->
				<div class="space-y-3">
					<h4 class="text-xs font-medium text-foreground border-b border-border pb-2">Scene</h4>
					<div class="space-y-2 pl-2">
						<div class="flex items-center justify-between">
							<label class="text-xs text-foreground">Background</label>
							<input type="color" class="w-8 h-6 rounded border border-border" value="#1a1a1a" />
						</div>
						<div class="flex items-center justify-between">
							<label class="text-xs text-foreground">Grid Main</label>
							<input type="color" class="w-8 h-6 rounded border border-border" value="#444444" />
						</div>
						<div class="flex items-center justify-between">
							<label class="text-xs text-foreground">Grid Sub</label>
							<input type="color" class="w-8 h-6 rounded border border-border" value="#222222" />
						</div>
					</div>
				</div>

				<!-- Interface Settings -->
				<div class="space-y-3">
					<h4 class="text-xs font-medium text-foreground border-b border-border pb-2">Interface</h4>
					<div class="space-y-2 pl-2">
						<div class="flex items-center justify-between">
							<label class="text-xs text-foreground">Accent Color</label>
							<input type="color" class="w-8 h-6 rounded border border-border" value="#4a9eff" />
						</div>
						<div class="flex items-center justify-between">
							<label class="text-xs text-foreground">Toolbar Opacity</label>
							<div class="flex items-center gap-2">
								<input type="range" min="0.5" max="1.0" step="0.05" value="0.95" class="w-16 h-1" />
								<span class="text-xs text-muted-foreground w-8">0.95</span>
							</div>
						</div>
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