<script lang="ts">
	import { selectedObjects, objectHierarchy, containerContext } from '$lib/stores/modler';
	import { Box, BoxSelect, SquareStack } from 'lucide-svelte';
	import { cn } from '$lib/utils';
	import { onMount } from 'svelte';

	// Tree expansion state
	let expandedContainers = new Set();

	// Drag and drop state
	let draggedObject = null;
	let activeDropZone = null; // { parentId: null | number, index: number }

	// Animation state
	let isLoaded = false;

	// Rename state
	let editingObjectId = null;
	let editingObjectName = '';

	onMount(() => {
		// Trigger fade-in animation after component mounts
		setTimeout(() => {
			isLoaded = true;
		}, 100);

		// Add keyboard listener for delete key and duplicate
		const handleKeyDown = (event: KeyboardEvent) => {
			// Skip if input field is focused
			if (isInputFocused(event.target)) {
				return;
			}

			// Check for Cmd+D (duplicate)
			if ((event.metaKey || event.ctrlKey) && event.code === 'KeyD') {
				// Only handle if we have selected objects
				if ($selectedObjects.length > 0) {
					event.preventDefault(); // Prevent browser bookmark dialog
					window.parent.postMessage({
						type: 'duplicate-object',
						objectId: $selectedObjects[0].id
					}, '*');
				}
				return;
			}

			// Check for Delete or Backspace key
			if (event.code === 'Delete' || event.code === 'Backspace') {
				// Only handle if we have selected objects
				if ($selectedObjects.length > 0) {
					event.preventDefault(); // Prevent browser back navigation on Backspace
					window.parent.postMessage({
						type: 'delete-object',
						objectIds: $selectedObjects.map(obj => obj.id)
					}, '*');
				}
			}
		};

		window.addEventListener('keydown', handleKeyDown);

		// Cleanup
		return () => {
			window.removeEventListener('keydown', handleKeyDown);
		};
	});

	// Helper to check if an input/textarea is focused
	function isInputFocused(target: EventTarget | null): boolean {
		if (!target || !(target instanceof HTMLElement)) return false;
		const tagName = target.tagName.toLowerCase();
		return tagName === 'input' || tagName === 'textarea' || target.isContentEditable;
	}

	// Handle both old format (array) and new format ({objects, rootChildrenOrder})
	$: hierarchyData = Array.isArray($objectHierarchy)
		? { objects: $objectHierarchy, rootChildrenOrder: [] }
		: $objectHierarchy;

	// Objects are pre-filtered by SimpleCommunication before sending to UI
	$: filteredHierarchy = hierarchyData.objects || [];

	// Build tree structure with server-side ordering
	$: treeStructure = buildTreeStructure(filteredHierarchy, hierarchyData.rootChildrenOrder || []);

	// Auto-expand all containers on initial load only
	let hasInitiallyExpanded = false;
	$: {
		if (filteredHierarchy.length > 0 && !hasInitiallyExpanded) {
			const newExpanded = new Set();
			filteredHierarchy.forEach(obj => {
				if (obj.isContainer) {
					newExpanded.add(obj.id);
				}
			});
			expandedContainers = newExpanded;
			hasInitiallyExpanded = true;
		}
	}


	// Helper to find object in tree structure (includes children arrays)
	function findObjectInTree(objectId, tree = treeStructure) {
		for (const obj of tree) {
			if (obj.id === objectId) return obj;
			if (obj.children && obj.children.length > 0) {
				const found = findObjectInTree(objectId, obj.children);
				if (found) return found;
			}
		}
		return null;
	}

	function buildTreeStructure(objects, rootChildrenOrder) {
		const objectMap = new Map();
		objects.forEach(obj => {
			objectMap.set(obj.id, { ...obj, children: [] });
		});

		const rootObjects = [];

		objects.forEach(obj => {
			const treeObj = objectMap.get(obj.id);

			if (!obj.parentContainer) {
				rootObjects.push(treeObj);
			} else {
				const parentObj = objectMap.get(obj.parentContainer);
				if (parentObj) {
					parentObj.children.push(treeObj);
				} else {
					// Add orphans to root as fallback
					rootObjects.push(treeObj);
				}
			}
		});

		// Apply server-side ordering using childrenOrder from Main
		function applyOrderingToLevel(objects, parentObj, rootOrder) {
			// Get ordering from server data:
			// - For root level: use rootChildrenOrder from hierarchyData
			// - For containers: use childrenOrder from parent object
			let order;
			if (parentObj === null) {
				// Root level - use rootChildrenOrder passed from hierarchyData
				order = rootOrder || [];
			} else if (parentObj.childrenOrder && parentObj.childrenOrder.length > 0) {
				// Container level - use childrenOrder from parent object
				order = parentObj.childrenOrder;
			}

			// Apply server ordering
			if (order && order.length > 0) {
				objects.sort((a, b) => {
					const aIndex = order.indexOf(a.id);
					const bIndex = order.indexOf(b.id);
					if (aIndex === -1 && bIndex === -1) return 0;
					if (aIndex === -1) return 1;  // Unknown items go to end
					if (bIndex === -1) return -1;
					return aIndex - bIndex;
				});
			}

			// Recursively apply to children
			objects.forEach(obj => {
				if (obj.isContainer && obj.children && obj.children.length > 0) {
					expandedContainers.add(obj.id);
					applyOrderingToLevel(obj.children, obj, rootOrder);
				}
			});
		}

		applyOrderingToLevel(rootObjects, null, rootChildrenOrder);
		expandedContainers = new Set(expandedContainers);

		return rootObjects;
	}

	function toggleContainer(containerId) {
		if (expandedContainers.has(containerId)) {
			expandedContainers.delete(containerId);
		} else {
			expandedContainers.add(containerId);
		}
		expandedContainers = new Set(expandedContainers);
	}

	// Make this function reactive by accepting selectedObjects as parameter
	// This forces Svelte to re-run when $selectedObjects changes
	function isObjectHighlighted(object, selected) {
		const isSelected = selected.some(sel => sel.id === object.id);
		const isInContext = $containerContext && $containerContext.containerId === object.id;
		return isSelected || isInContext;
	}

	function handleObjectClick(event, object) {
		window.parent.postMessage({
			type: 'object-select',
			objectId: object.id,
			isShiftClick: event.shiftKey,
			directSelection: true  // Bypass container-first logic when selecting from list
		}, '*');
	}

	function handleObjectDoubleClick(event, object) {
		event.stopPropagation();
		event.preventDefault();
		startRenaming(object);
	}

	function startRenaming(object) {
		editingObjectId = object.id;
		editingObjectName = object.name;

		// Focus input after it's rendered
		setTimeout(() => {
			const input = document.querySelector(`#rename-input-${object.id}`);
			if (input) {
				input.focus();
				input.select();
			}
		}, 0);
	}

	function finishRenaming() {
		if (editingObjectId && editingObjectName.trim()) {
			// Send rename command to 3D scene
			window.parent.postMessage({
				type: 'rename-object',
				objectId: editingObjectId,
				name: editingObjectName.trim()
			}, '*');
		}
		cancelRenaming();
	}

	function cancelRenaming() {
		editingObjectId = null;
		editingObjectName = '';
	}

	function handleRenameKeydown(event) {
		if (event.key === 'Enter') {
			event.preventDefault();
			finishRenaming();
		} else if (event.key === 'Escape') {
			event.preventDefault();
			cancelRenaming();
		}
	}

	// Drag and drop handlers
	function handleDragStart(event, object) {
		draggedObject = object;
		event.dataTransfer.effectAllowed = 'move';
		event.dataTransfer.setData('text/plain', object.id);
		event.currentTarget.style.opacity = '0.4';

		try {
			const transparentDiv = document.createElement('div');
			transparentDiv.style.width = '1px';
			transparentDiv.style.height = '1px';
			transparentDiv.style.background = 'transparent';
			transparentDiv.style.opacity = '0';
			document.body.appendChild(transparentDiv);
			event.dataTransfer.setDragImage(transparentDiv, 0, 0);
			setTimeout(() => document.body.contains(transparentDiv) && document.body.removeChild(transparentDiv), 100);
		} catch (e) {
			const canvas = document.createElement('canvas');
			canvas.width = 1;
			canvas.height = 1;
			canvas.style.opacity = '0';
			event.dataTransfer.setDragImage(canvas, 0, 0);
		}
	}

	function handleDragEnd(event) {
		event.currentTarget.style.opacity = '1';
		draggedObject = null;
		activeDropZone = null;
	}

	function handleDragOver(event, objectIndex, parentId = null) {
		if (!draggedObject) return;

		event.preventDefault();
		event.dataTransfer.dropEffect = 'move';

		const rect = event.currentTarget.getBoundingClientRect();
		const y = event.clientY - rect.top;
		const height = rect.height;

		// Top half = drop zone BEFORE this item (index)
		// Bottom half = drop zone AFTER this item (index + 1)
		if (y < height * 0.5) {
			activeDropZone = { parentId, index: objectIndex };
		} else {
			activeDropZone = { parentId, index: objectIndex + 1 };
		}
	}

	function handleDrop(event, dropZoneIndex, parentId = null) {
		if (!draggedObject || !activeDropZone) return;

		event.preventDefault();

		// Get the correct list based on parentId
		let objectList;
		if (parentId === null) {
			// Root level
			objectList = treeStructure;
		} else {
			// Container level - find the container in tree structure
			const container = findObjectInTree(parentId);
			if (!container || !container.children) return;
			objectList = container.children;
		}

		// dropZoneIndex represents the position in the list:
		// 0 = before first item
		// 1 = before second item (after first)
		// etc.

		let targetObject, position;
		if (dropZoneIndex === 0) {
			// Dropping before first item
			targetObject = objectList[0];
			position = 'before';
		} else {
			// Dropping after item at index (dropZoneIndex - 1)
			targetObject = objectList[dropZoneIndex - 1];
			position = 'after';
		}

		if (!targetObject) return;

		// Handle cross-level moves (root ↔ container)
		if (draggedObject.parentContainer !== targetObject.parentContainer) {
			// Moving between different parents - atomic move + reorder in one message
			if (targetObject.parentContainer) {
				// Moving into a container
				const targetContainer = findObjectInTree(targetObject.parentContainer);
				if (targetContainer) {
					// Validate container nesting if dragging a container
					if (draggedObject.isContainer && !isValidContainerNesting(draggedObject, targetContainer)) {
						console.warn('Invalid container nesting: Maximum depth exceeded or circular reference detected');
						draggedObject = null;
						activeDropZone = null;
						return;
					}
				}
			}

			// Single atomic message — no setTimeout race condition
			window.parent.postMessage({
				type: 'move-and-reorder',
				objectId: draggedObject.id,
				targetParentId: targetObject.parentContainer || null,
				targetId: targetObject.id,
				position: position
			}, '*');
		} else {
			// Same parent - just reorder
			reorderObject(draggedObject, targetObject, position, parentId);
		}

		draggedObject = null;
		activeDropZone = null;
	}

	function reorderObject(draggedObj, targetObj, position, parentId) {
		window.parent.postMessage({
			type: 'reorder-children',
			objectId: draggedObj.id,
			targetId: targetObj.id,
			position: position,
			parentId: parentId
		}, '*');
	}

	function isValidContainerNesting(childContainer, parentContainer) {
		if (childContainer.id === parentContainer.id) return false;
		if (isDescendantContainer(parentContainer.id, childContainer.id)) return false;

		const MAX_NESTING_DEPTH = 2; // Matches ObjectDataFormat.MAX_NESTING_DEPTH
		const currentDepth = getContainerNestingDepth(parentContainer.id);
		return currentDepth < MAX_NESTING_DEPTH;
	}

	function isDescendantContainer(potentialDescendantId, ancestorId) {
		let current = filteredHierarchy.find(obj => obj.id === potentialDescendantId);
		const visited = new Set();

		while (current && current.parentContainer) {
			if (visited.has(current.id)) return false;
			visited.add(current.id);

			if (current.parentContainer === ancestorId) return true;
			current = filteredHierarchy.find(obj => obj.id === current.parentContainer);
		}

		return false;
	}

	function getContainerNestingDepth(containerId) {
		let depth = 0;
		let current = filteredHierarchy.find(obj => obj.id === containerId);
		const visited = new Set();

		while (current && current.parentContainer) {
			if (visited.has(current.id)) break;
			visited.add(current.id);

			const parent = filteredHierarchy.find(obj => obj.id === current.parentContainer);
			if (parent && parent.isContainer) depth++;
			current = parent;
		}

		return depth;
	}
</script>

{#snippet TreeItem(object, depth = 0, index = 0, parentId = null)}
	<div
		class="relative"
		class:opacity-0={!isLoaded}
		class:translate-y-[-10px]={!isLoaded}
		style="transition: opacity 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) {index * 30}ms, transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) {index * 30}ms;"
		draggable="true"
		ondragstart={(e) => handleDragStart(e, object)}
		ondragend={handleDragEnd}
		ondragover={(e) => handleDragOver(e, index, parentId)}
	>
		<div class="flex items-center gap-1 py-0.5">
			{#if object.isContainer && !object.autoLayout?.tileMode?.enabled}
				<button
					type="button"
					onclick={() => toggleContainer(object.id)}
					class="w-4 h-4 flex items-center justify-center hover:bg-white/10 rounded shrink-0"
				>
					{#if expandedContainers.has(object.id)}
						<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
						</svg>
					{:else}
						<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
						</svg>
					{/if}
				</button>
			{:else}
				<div class="w-4"></div>
			{/if}

			{#if editingObjectId === object.id}
				<!-- Rename input mode -->
				<div class="flex items-center gap-2 px-2 py-2 rounded-md flex-1 min-w-0 bg-[#212121]/50 border border-blue-400">
					{#if object.isContainer && object.autoLayout?.tileMode?.enabled}
						<SquareStack
							class="w-4 h-4 shrink-0 text-blue-400"
							strokeWidth={1.5}
						/>
					{:else if object.isContainer}
						<BoxSelect
							class="w-4 h-4 shrink-0 text-blue-400"
							strokeWidth={1.5}
						/>
					{:else}
						<Box
							class="w-4 h-4 shrink-0 text-blue-400"
							strokeWidth={1.5}
						/>
					{/if}

					<input
						id="rename-input-{object.id}"
						type="text"
						bind:value={editingObjectName}
						onkeydown={handleRenameKeydown}
						onblur={finishRenaming}
						class="flex-1 min-w-0 bg-transparent border-none text-sm text-foreground focus:outline-none placeholder:text-foreground/30"
						placeholder="Object name"
					/>
				</div>
			{:else}
				<!-- Normal display mode -->
				<button
					type="button"
					onclick={(e) => handleObjectClick(e, object)}
					ondblclick={(e) => handleObjectDoubleClick(e, object)}
					class={cn(
						'flex items-center gap-2 px-2 py-2 rounded-md flex-1 min-w-0 transition-colors',
						'text-foreground/70 hover:text-foreground hover:bg-white/5',
						'focus:outline-none',
						isObjectHighlighted(object, $selectedObjects) && 'bg-[#212121]/50'
					)}
				>
					{#if object.isContainer && object.autoLayout?.tileMode?.enabled}
						<SquareStack
							class={cn(
								"w-4 h-4 shrink-0",
								isObjectHighlighted(object, $selectedObjects) ? "text-blue-400" : "text-foreground/50"
							)}
							strokeWidth={1.5}
						/>
					{:else if object.isContainer}
						<BoxSelect
							class={cn(
								"w-4 h-4 shrink-0",
								isObjectHighlighted(object, $selectedObjects) ? "text-blue-400" : "text-foreground/50"
							)}
							strokeWidth={1.5}
						/>
					{:else}
						<Box
							class={cn(
								"w-4 h-4 shrink-0",
								isObjectHighlighted(object, $selectedObjects) ? "text-blue-400" : "text-foreground/50"
							)}
							strokeWidth={1.5}
						/>
					{/if}

					<span class="truncate text-sm">{object.name}</span>

					{#if object.isContainer && object.autoLayout?.tileMode?.enabled}
						<span class="text-sm text-[#10B981] font-mono shrink-0">×{object.autoLayout.tileMode.repeat}</span>
					{/if}
				</button>
			{/if}
		</div>
	</div>

	{#if object.isContainer && expandedContainers.has(object.id) && object.children && object.children.length > 0 && !object.autoLayout?.tileMode?.enabled}
		<div class="ml-4 space-y-0.5">
			{#each object.children as child, childIndex}
				<!-- Drop zone line BEFORE this child -->
				<div
					class="relative h-3 -my-1.5"
					ondragover={(e) => {
						if (!draggedObject) return;
						e.preventDefault();
						e.dataTransfer.dropEffect = 'move';
						activeDropZone = { parentId: object.id, index: childIndex };
					}}
					ondrop={(e) => handleDrop(e, childIndex, object.id)}
				>
					{#if activeDropZone?.parentId === object.id && activeDropZone?.index === childIndex && draggedObject}
						<div class="absolute left-0 right-0 h-0.5 bg-blue-500 z-10 top-1/2 -translate-y-1/2"></div>
					{/if}
				</div>

				{@render TreeItem(child, depth + 1, childIndex, object.id)}

				<!-- Drop zone line AFTER the last child -->
				{#if childIndex === object.children.length - 1}
					<div
						class="relative h-3 -my-1.5"
						ondragover={(e) => {
							if (!draggedObject) return;
							e.preventDefault();
							e.dataTransfer.dropEffect = 'move';
							activeDropZone = { parentId: object.id, index: childIndex + 1 };
						}}
						ondrop={(e) => handleDrop(e, childIndex + 1, object.id)}
					>
						{#if activeDropZone?.parentId === object.id && activeDropZone?.index === childIndex + 1 && draggedObject}
							<div class="absolute left-0 right-0 h-0.5 bg-blue-500 z-10 top-1/2 -translate-y-1/2"></div>
						{/if}
					</div>
				{/if}
			{/each}
		</div>
	{/if}
{/snippet}

<div
	class="h-full overflow-y-auto px-4 py-4"
	ondragleave={(e) => {
		// Clear drop zone when leaving the entire list area
		if (!e.currentTarget.contains(e.relatedTarget)) {
			activeDropZone = null;
		}
	}}
>
	<div class="space-y-0.5">
		{#each treeStructure as object, index}
			<!-- Drop zone line BEFORE this item -->
			<div
				class="relative h-3 -my-1.5"
				ondragover={(e) => {
					if (!draggedObject) return;
					e.preventDefault();
					e.dataTransfer.dropEffect = 'move';
					activeDropZone = { parentId: null, index };
				}}
				ondrop={(e) => handleDrop(e, index, null)}
			>
				{#if activeDropZone?.parentId === null && activeDropZone?.index === index && draggedObject}
					<div class="absolute left-0 right-0 h-0.5 bg-blue-500 z-10 top-1/2 -translate-y-1/2"></div>
				{/if}
			</div>

			{@render TreeItem(object, 0, index, null)}

			<!-- Drop zone line AFTER the last item -->
			{#if index === treeStructure.length - 1}
				<div
					class="relative h-3 -my-1.5"
					ondragover={(e) => {
						if (!draggedObject) return;
						e.preventDefault();
						e.dataTransfer.dropEffect = 'move';
						activeDropZone = { parentId: null, index: index + 1 };
					}}
					ondrop={(e) => handleDrop(e, index + 1, null)}
				>
					{#if activeDropZone?.parentId === null && activeDropZone?.index === index + 1 && draggedObject}
						<div class="absolute left-0 right-0 h-0.5 bg-blue-500 z-10 top-1/2 -translate-y-1/2"></div>
					{/if}
				</div>
			{/if}
		{/each}
	</div>
</div>
