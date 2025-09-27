<script lang="ts">
	import { onMount } from 'svelte';
	import { initializeBridge } from '$lib/bridge/threejs-bridge';
	import { selectedObjects, objectHierarchy, toolState, containerContext } from '$lib/stores/modler';

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



	// Build tree structure from flat hierarchy with recursive nesting
	$: treeStructure = buildTreeStructure(filteredHierarchy);

	// Tree expansion state
	let expandedContainers = new Set();

	// Drag and drop state
	let draggedObject = null;
	let dragOverTarget = null;
	let dropIndicatorPosition = null;

	// Local ordering state to handle reordering
	let customObjectOrder = new Map(); // Maps parentId to array of ordered object IDs

	function buildTreeStructure(objects) {

		// Create a map of all objects for easy lookup
		const objectMap = new Map();
		objects.forEach(obj => {
			objectMap.set(obj.id, { ...obj, children: [] });
		});

		// Build the tree structure recursively
		const rootObjects = [];

		objects.forEach(obj => {
			const treeObj = objectMap.get(obj.id);

			if (!obj.parentContainer) {
				// This is a root object
				rootObjects.push(treeObj);
			} else {
				// This is a child object - add to parent's children
				const parentObj = objectMap.get(obj.parentContainer);
				if (parentObj) {
					parentObj.children.push(treeObj);
				}
			}
		});

		// Apply custom ordering recursively
		function applyOrderingToLevel(objects, parentId) {
			const order = customObjectOrder.get(parentId || 'root');
			if (order && order.length > 0) {
				objects.sort((a, b) => {
					const aIndex = order.indexOf(a.id);
					const bIndex = order.indexOf(b.id);
					// If not in custom order, maintain original position
					if (aIndex === -1 && bIndex === -1) return 0;
					if (aIndex === -1) return 1;
					if (bIndex === -1) return -1;
					return aIndex - bIndex;
				});
			}

			// Recursively apply ordering to children and auto-expand containers
			objects.forEach(obj => {
				if (obj.isContainer) {
					if (obj.children.length > 0) {
						applyOrderingToLevel(obj.children, obj.id);
						// Auto-expand containers that have children
						expandedContainers.add(obj.id);
					}
					// Note: containers without children can still be manually expanded via toggle
				}
			});
		}

		applyOrderingToLevel(rootObjects, 'root');

		// Trigger reactivity for expanded containers
		expandedContainers = new Set(expandedContainers);

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

	// Helper function to check if an object should be highlighted
	function isObjectHighlighted(object) {
		// 1. SELECTION: Direct selection highlighting
		const isSelected = $selectedObjects.some(sel => sel.id === object.id);

		// 2. CONTAINER CONTEXT: Container context highlighting
		const isInContext = $containerContext && $containerContext.containerId === object.id;

		// Highlight if either selected OR in container context
		return isSelected || isInContext;
	}

	// Drag and drop functions
	function handleDragStart(event, object) {
		draggedObject = object;
		event.dataTransfer.effectAllowed = 'move';
		event.dataTransfer.setData('text/plain', object.id);

		// Show the current object's position indicator so user can drop it back in same place
		dragOverTarget = object;
		dropIndicatorPosition = 'before'; // Show line above current position

		// More aggressive approach to hide drag image
		try {
			// Create a transparent div element
			const transparentDiv = document.createElement('div');
			transparentDiv.style.width = '1px';
			transparentDiv.style.height = '1px';
			transparentDiv.style.background = 'transparent';
			transparentDiv.style.opacity = '0';
			document.body.appendChild(transparentDiv);

			event.dataTransfer.setDragImage(transparentDiv, 0, 0);

			// Clean up after a short delay
			setTimeout(() => {
				if (document.body.contains(transparentDiv)) {
					document.body.removeChild(transparentDiv);
				}
			}, 100);
		} catch (e) {
			// Fallback if the above doesn't work
			const canvas = document.createElement('canvas');
			canvas.width = 1;
			canvas.height = 1;
			canvas.style.opacity = '0';
			event.dataTransfer.setDragImage(canvas, 0, 0);
		}
	}

	function handleDragEnd(event) {
		draggedObject = null;
		dragOverTarget = null;
		dropIndicatorPosition = null;
	}

	function handleDragOver(event, targetObject) {
		if (!draggedObject || draggedObject.id === targetObject.id) return;

		event.preventDefault();
		event.dataTransfer.dropEffect = 'move';

		dragOverTarget = targetObject;

		// Determine drop position based on mouse position within the element
		const rect = event.currentTarget.getBoundingClientRect();
		const y = event.clientY - rect.top;
		const height = rect.height;

		// Use wider thresholds and always show a position indicator
		if (targetObject.isContainer) {
			// For containers, favor 'into' but still allow before/after
			if (y < height * 0.25) {
				dropIndicatorPosition = 'before';
			} else if (y > height * 0.75) {
				dropIndicatorPosition = 'after';
			} else {
				dropIndicatorPosition = 'into';
			}
		} else {
			// For regular objects, favor showing lines (before/after)
			if (y < height * 0.4) {
				dropIndicatorPosition = 'before';
			} else {
				// Default to 'after' to ensure we always show an indicator line
				dropIndicatorPosition = 'after';
			}
		}
	}

	function handleDragLeave(event) {
		// More conservative drag leave - only clear if leaving the entire list area
		const relatedTarget = event.relatedTarget;
		if (relatedTarget && (!event.currentTarget.contains(relatedTarget) &&
			!event.currentTarget.closest('.space-y-1')?.contains(relatedTarget))) {
			// Only clear if actually leaving the list context
			setTimeout(() => {
				// Use timeout to prevent flicker when moving between closely spaced elements
				if (!dragOverTarget || (relatedTarget && event.currentTarget.contains(relatedTarget))) return;
				dragOverTarget = null;
				dropIndicatorPosition = null;
			}, 50);
		} else if (!relatedTarget) {
			// If relatedTarget is null, we're likely leaving the window - clear drag state
			setTimeout(() => {
				dragOverTarget = null;
				dropIndicatorPosition = null;
			}, 50);
		}
	}

	function handleDrop(event, targetObject) {
		if (!draggedObject || draggedObject.id === targetObject.id) return;

		event.preventDefault();

		// Execute the drop operation based on position
		executeDrop(draggedObject, targetObject, dropIndicatorPosition);

		// Clear drag state
		draggedObject = null;
		dragOverTarget = null;
		dropIndicatorPosition = null;
	}

	function handleRootDrop(event) {
		if (!draggedObject) return;

		event.preventDefault();

		// Move object to root level (remove from container)
		moveObjectToRoot(draggedObject);

		// Clear drag state
		draggedObject = null;
		dragOverTarget = null;
		dropIndicatorPosition = null;
	}

	function executeDrop(draggedObj, targetObj, position) {
		if (position === 'into' && targetObj.isContainer) {
			// Check if this would be a valid container nesting
			if (draggedObj.isContainer && !isValidContainerNesting(draggedObj, targetObj)) {
				// Invalid nesting - show visual feedback and abort
				showInvalidNestingFeedback();
				return;
			}

			// Move object or container into target container
			moveObjectToContainer(draggedObj, targetObj);
		} else if (position === 'before' || position === 'after') {
			// Handle reordering
			if (targetObj.parentContainer) {
				// Both objects are in the same container - reorder within container
				if (draggedObj.parentContainer === targetObj.parentContainer) {
					reorderObjectInContainer(draggedObj, targetObj, position);
				} else {
					// Move to the target's container
					const targetContainer = filteredHierarchy.find(obj => obj.id === targetObj.parentContainer);
					if (targetContainer) {
						moveObjectToContainer(draggedObj, targetContainer);
					}
				}
			} else {
				// Target is at root level
				if (draggedObj.parentContainer) {
					// Move from container to root
					moveObjectToRoot(draggedObj);
				} else {
					// Both at root level - reorder at root
					reorderObjectAtRoot(draggedObj, targetObj, position);
				}
			}
		}
	}

	function moveObjectToContainer(objectToMove, targetContainer) {
		// Use different message types for objects vs containers
		const messageType = objectToMove.isContainer ?
			'container-move-to-container' :
			'object-move-to-container';

		const messageData = {
			type: messageType,
			data: {
				objectId: objectToMove.id,
				targetContainerId: targetContainer.id
			}
		};

		window.parent.postMessage(messageData, '*');
	}

	function moveObjectToRoot(objectToMove) {
		// Use postMessage to communicate with parent window
		const messageData = {
			type: 'object-move-to-root',
			data: {
				objectId: objectToMove.id
			}
		};

		window.parent.postMessage(messageData, '*');
	}

	function reorderObjectAtRoot(draggedObj, targetObj, position) {
		// Update local ordering state
		updateLocalObjectOrder('root', draggedObj.id, targetObj.id, position);

		// Use postMessage to communicate reordering at root level
		const messageData = {
			type: 'object-reorder-root',
			data: {
				draggedObjectId: draggedObj.id,
				targetObjectId: targetObj.id,
				position: position // 'before' or 'after'
			}
		};

		window.parent.postMessage(messageData, '*');
	}

	function reorderObjectInContainer(draggedObj, targetObj, position) {
		// Update local ordering state
		updateLocalObjectOrder(targetObj.parentContainer, draggedObj.id, targetObj.id, position);

		// Use postMessage to communicate reordering within container
		const messageData = {
			type: 'object-reorder-container',
			data: {
				draggedObjectId: draggedObj.id,
				targetObjectId: targetObj.id,
				containerId: targetObj.parentContainer,
				position: position // 'before' or 'after'
			}
		};

		window.parent.postMessage(messageData, '*');
	}

	/**
	 * NESTED CONTAINER SUPPORT: Validation functions for drag & drop
	 */

	function isValidContainerNesting(childContainer, parentContainer) {
		// Can't nest into itself
		if (childContainer.id === parentContainer.id) {
			return false;
		}

		// Check if parent is already a child of the container we're trying to nest
		// (This prevents circular references)
		if (isDescendantContainer(parentContainer.id, childContainer.id)) {
			return false;
		}

		// Check nesting depth - prevent overly deep hierarchies
		const currentDepth = getContainerNestingDepth(parentContainer.id);
		if (currentDepth >= 4) { // Max 5 levels (0-4)
			return false;
		}

		return true;
	}

	function isDescendantContainer(potentialDescendantId, ancestorId) {
		// Walk up the parent chain to see if ancestorId is found
		let current = filteredHierarchy.find(obj => obj.id === potentialDescendantId);
		const visited = new Set(); // Prevent infinite loops

		while (current && current.parentContainer) {
			// Prevent infinite loops in corrupted data
			if (visited.has(current.id)) {
				console.error('Circular reference detected in container hierarchy:', current.id);
				return true; // Treat as circular to prevent nesting
			}
			visited.add(current.id);

			if (current.parentContainer === ancestorId) {
				return true; // Found ancestor relationship
			}

			// Move up to parent
			current = filteredHierarchy.find(obj => obj.id === current.parentContainer);
		}

		return false;
	}

	function getContainerNestingDepth(containerId) {
		let depth = 0;
		let current = filteredHierarchy.find(obj => obj.id === containerId);
		const visited = new Set();

		while (current && current.parentContainer) {
			if (visited.has(current.id)) {
				return -1; // Error state
			}
			visited.add(current.id);

			depth++;
			current = filteredHierarchy.find(obj => obj.id === current.parentContainer);
		}

		return depth;
	}

	function showInvalidNestingFeedback() {
		// Could implement visual feedback here (e.g., red flash, tooltip)
		console.warn('Invalid container nesting attempted');
		// For now, just log - could add toast notification or visual indicator
	}

	function updateLocalObjectOrder(parentId, draggedId, targetId, position) {
		// Get current order or create new one based on current objects
		let currentOrder = customObjectOrder.get(parentId) || [];

		// If no custom order exists, create one from current hierarchy
		if (currentOrder.length === 0) {
			if (parentId === 'root') {
				currentOrder = treeStructure.map(obj => obj.id);
			} else {
				const parentContainer = treeStructure.find(obj => obj.id === parentId);
				if (parentContainer && parentContainer.children) {
					currentOrder = parentContainer.children.map(obj => obj.id);
				}
			}
		}

		// Remove dragged object from current position
		const draggedIndex = currentOrder.indexOf(draggedId);
		if (draggedIndex > -1) {
			currentOrder.splice(draggedIndex, 1);
		}

		// Find target position and insert
		const targetIndex = currentOrder.indexOf(targetId);
		if (targetIndex > -1) {
			const insertIndex = position === 'before' ? targetIndex : targetIndex + 1;
			currentOrder.splice(insertIndex, 0, draggedId);
		} else {
			// Target not found, add to end
			currentOrder.push(draggedId);
		}

		// Update the map and trigger reactivity
		customObjectOrder.set(parentId, currentOrder);
		customObjectOrder = new Map(customObjectOrder);
	}

	// Function to select object in the scene when clicked in hierarchy
	function selectObjectInScene(objectId: string) {
		// Find the object in the hierarchy to check if it has a parent container
		const selectedObject = filteredHierarchy.find(obj => obj.id === objectId);

		// Check if we're in iframe context
		const isInIframe = window !== window.parent;

		if (!isInIframe) {
			// Direct context: use NavigationController if available
			const navigationController = (window as any).modlerComponents?.navigationController;

			if (navigationController) {
				// Use NavigationController for unified navigation
				navigationController.navigateToObject(objectId);
				return;
			}
		}

		// Fallback to legacy direct methods
		if ((window as any).selectObjectInSceneDirectly) {
			// If object is a child of a container, step into the container first
			if (selectedObject?.parentContainer) {
				// Step into the parent container
				if ((window as any).stepIntoContainerById) {
					(window as any).stepIntoContainerById(selectedObject.parentContainer);
				}
			}

			const success = (window as any).selectObjectInSceneDirectly(objectId);
			if (success) return;
		}

		// Iframe context or fallback: use PostMessage
		const messageData = {
			type: 'object-select',
			data: {
				objectId,
				parentContainer: selectedObject?.parentContainer || null,
				useNavigationController: true
			}
		};

		window.parent.postMessage(messageData, '*');
	}

	onMount(() => {
		// Enable dark mode
		document.documentElement.classList.add('dark');

		// Debug: Log object hierarchy changes (only when meaningful)
		objectHierarchy.subscribe(hierarchy => {
			if (hierarchy.length > 0) {
				// Debug: Left Panel updated (removed to reduce log spam)
			}
		});

		// Initialize the bridge with Three.js for real-time synchronization
		initializeBridge();
	});

</script>

<!-- Recursive Tree Item Snippet -->
{#snippet TreeItem(object, depth)}
	<div class="object-tree-item" style="margin-left: {depth * 16}px">
		<div
			class="group flex items-center gap-2 px-2 py-1.5 text-sm rounded-md hover:bg-gray-700/50 cursor-pointer transition-colors relative"
			class:bg-accent={isObjectHighlighted(object)}
			class:text-accent-foreground={isObjectHighlighted(object)}
			draggable="true"
			on:dragstart={(e) => handleDragStart(e, object)}
			on:dragend={handleDragEnd}
			on:dragover={(e) => handleDragOver(e, object)}
			on:dragleave={handleDragLeave}
			on:drop={(e) => handleDrop(e, object)}
			on:click={() => selectObjectInScene(object.id)}
			role="button"
			tabindex="0">

			<!-- Expand/collapse button for containers (show even for empty containers) -->
			{#if object.isContainer}
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

		<!-- Drop indicator - always reserved space (shows for both before/after) -->
		<div class="h-0.5 mt-1 mx-2 rounded-full transition-colors"
			class:bg-primary={draggedObject && dragOverTarget?.id === object.id && (dropIndicatorPosition === 'before' || dropIndicatorPosition === 'after')}
			class:opacity-100={draggedObject && dragOverTarget?.id === object.id && (dropIndicatorPosition === 'before' || dropIndicatorPosition === 'after')}
			class:opacity-0={!(draggedObject && dragOverTarget?.id === object.id && (dropIndicatorPosition === 'before' || dropIndicatorPosition === 'after'))}></div>

		<!-- Children (recursively rendered if expanded) -->
		{#if object.isContainer && object.children && object.children.length > 0 && expandedContainers.has(object.id)}
			<div class="space-y-1 mt-1">
				{#each object.children as childObject}
					{@render TreeItem(childObject, depth + 1)}
				{/each}
			</div>
		{/if}
	</div>
{/snippet}

<svelte:head>
	<title>Object List & Settings</title>
</svelte:head>

<!-- Standalone Left Panel for iframe integration -->
<div class="standalone-left-panel w-full h-screen bg-background text-foreground flex flex-col">
	<!-- Horizontal Tabs -->
	<div class="flex bg-background">
		<button
			class="relative flex-1 px-6 py-4 text-sm font-medium transition-all duration-200 {activeTab === 'objects' ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'}"
			on:click={() => activeTab = 'objects'}
		>
			Objects
			{#if activeTab === 'objects'}
				<div class="absolute bottom-0 left-1/2 transform -translate-x-1/2 h-0.5 bg-blue-500 rounded-full" style="width: calc(100% - 48px);"></div>
			{/if}
		</button>
		<button
			class="relative flex-1 px-6 py-4 text-sm font-medium transition-all duration-200 {activeTab === 'settings' ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'}"
			on:click={() => activeTab = 'settings'}
		>
			Settings
			{#if activeTab === 'settings'}
				<div class="absolute bottom-0 left-1/2 transform -translate-x-1/2 h-0.5 bg-blue-500 rounded-full" style="width: calc(100% - 48px);"></div>
			{/if}
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
						<div class="space-y-1"
							 on:dragover={(e) => {
								 // Container-level dragover to maintain indicator when dragging over gaps
								 if (draggedObject) {
									 e.preventDefault();
									 e.dataTransfer.dropEffect = 'move';
									 // Don't reset the current target/position if we have one
									 // This keeps the indicator visible when dragging over spaces
								 }
							 }}>
							{#each treeStructure as object}
								<!-- Recursive tree rendering -->
								{@render TreeItem(object, 0)}
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