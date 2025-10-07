<script lang="ts">
	import { selectedObjects, objectHierarchy, containerContext } from '$lib/stores/modler';
	import { unifiedCommunication } from '$lib/services/unified-communication';
	import { Box, BoxSelect, SquareStack } from 'lucide-svelte';
	import { cn } from '$lib/utils';

	// Tree expansion state
	let expandedContainers = new Set();

	// Drag and drop state
	let draggedObject = null;
	let dragOverTarget = null;
	let dropIndicatorPosition = null;

	// Local ordering state (UI-only, not persisted)
	let customObjectOrder = new Map();

	// Filter out utility objects and temporary preview objects from hierarchy
	$: filteredHierarchy = $objectHierarchy.filter(obj =>
		obj.name !== 'Floor Grid' &&
		obj.type !== 'grid' &&
		!obj.name?.toLowerCase().includes('grid') &&
		obj.name !== '(Interactive)' &&
		!obj.name?.toLowerCase().includes('interactive') &&
		!obj.isTemporary &&
		!obj.isPreview
	);

	// Build tree structure
	$: treeStructure = buildTreeStructure(filteredHierarchy);

	function buildTreeStructure(objects) {
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
				}
			}
		});

		function applyOrderingToLevel(objects, parentId) {
			const order = customObjectOrder.get(parentId || 'root');
			if (order && order.length > 0) {
				objects.sort((a, b) => {
					const aIndex = order.indexOf(a.id);
					const bIndex = order.indexOf(b.id);
					if (aIndex === -1 && bIndex === -1) return 0;
					if (aIndex === -1) return 1;
					if (bIndex === -1) return -1;
					return aIndex - bIndex;
				});
			}

			objects.forEach(obj => {
				if (obj.isContainer && obj.children && obj.children.length > 0) {
					expandedContainers.add(obj.id);
					applyOrderingToLevel(obj.children, obj.id);
				}
			});
		}

		applyOrderingToLevel(rootObjects, 'root');
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

	function isObjectHighlighted(object) {
		const isSelected = $selectedObjects.some(sel => sel.id === object.id);
		const isInContext = $containerContext && $containerContext.containerId === object.id;
		return isSelected || isInContext;
	}

	function handleObjectClick(event, object) {
		unifiedCommunication.sendSelectionChange(object.id, event.shiftKey).catch(console.error);
	}

	// Drag and drop handlers
	function handleDragStart(event, object) {
		draggedObject = object;
		event.dataTransfer.effectAllowed = 'move';
		event.dataTransfer.setData('text/plain', object.id);
		event.currentTarget.style.opacity = '0.4';

		dragOverTarget = object;
		dropIndicatorPosition = 'before';

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
		dragOverTarget = null;
		dropIndicatorPosition = null;
	}

	function handleDragOver(event, targetObject) {
		if (!draggedObject || draggedObject.id === targetObject.id) return;

		event.preventDefault();
		event.dataTransfer.dropEffect = 'move';
		dragOverTarget = targetObject;

		const rect = event.currentTarget.getBoundingClientRect();
		const y = event.clientY - rect.top;
		const height = rect.height;

		if (targetObject.isContainer) {
			// For containers, check if hovering on top half (before) or bottom half (after)
			// This will show a line indicator for positioning relative to the container
			dropIndicatorPosition = y < height * 0.5 ? 'before' : 'after';
		} else {
			// For regular objects, always show line below (after)
			dropIndicatorPosition = 'after';
		}
	}

	function handleDragLeave(event) {
		const relatedTarget = event.relatedTarget;
		const currentTarget = event.currentTarget;

		if (relatedTarget && currentTarget && (!currentTarget.contains(relatedTarget) &&
			!currentTarget.closest('.space-y-1')?.contains(relatedTarget))) {
			setTimeout(() => {
				if (!dragOverTarget || (relatedTarget && currentTarget && currentTarget.contains(relatedTarget))) return;
				dragOverTarget = null;
				dropIndicatorPosition = null;
			}, 50);
		} else if (!relatedTarget) {
			setTimeout(() => {
				dragOverTarget = null;
				dropIndicatorPosition = null;
			}, 50);
		}
	}

	function handleDrop(event, targetObject) {
		if (!draggedObject || draggedObject.id === targetObject.id) return;

		event.preventDefault();
		executeDrop(draggedObject, targetObject, dropIndicatorPosition);

		draggedObject = null;
		dragOverTarget = null;
		dropIndicatorPosition = null;

		setTimeout(() => {
			window.parent.postMessage({ type: 'request-hierarchy-refresh', data: {} }, '*');
		}, 50);
	}

	function handleRootDrop(event) {
		if (!draggedObject) return;
		event.preventDefault();
		moveObjectToRoot(draggedObject);
		draggedObject = null;
		dragOverTarget = null;
		dropIndicatorPosition = null;
	}

	function executeDrop(draggedObj, targetObj, position) {
		// Handle dropping on containers - always treat as moving into container
		if (targetObj.isContainer && (position === 'before' || position === 'after')) {
			if (draggedObj.isContainer && !isValidContainerNesting(draggedObj, targetObj)) {
				return;
			}
			moveObjectToContainer(draggedObj, targetObj);
			return;
		}

		// Handle dropping between regular objects
		if (position === 'before' || position === 'after') {
			if (targetObj.parentContainer) {
				// Target is inside a container
				if (draggedObj.parentContainer === targetObj.parentContainer) {
					// Same container - reorder
					reorderObjectInContainer(draggedObj, targetObj, position);
				} else {
					// Different container - move to target's container
					const targetContainer = filteredHierarchy.find(obj => obj.id === targetObj.parentContainer);
					if (targetContainer) moveObjectToContainer(draggedObj, targetContainer);
				}
			} else {
				// Target is at root level - always reorder to position relative to target
				// This handles both: moving from container to root, and reordering within root
				reorderObjectAtRoot(draggedObj, targetObj, position);
			}
		}
	}

	function moveObjectToContainer(objectToMove, targetContainer) {
		const operation = objectToMove.isContainer ? 'container-move-to-container' : 'move-to-container';
		unifiedCommunication.sendObjectMovement(operation, {
			objectId: objectToMove.id,
			targetContainerId: targetContainer.id
		}).catch(console.error);
	}

	function moveObjectToRoot(objectToMove) {
		unifiedCommunication.sendObjectMovement('move-to-root', {
			objectId: objectToMove.id
		}).catch(console.error);
	}

	function reorderObjectAtRoot(draggedObj, targetObj, position) {
		console.log('🔄 reorderObjectAtRoot:', {
			draggedId: draggedObj.id,
			draggedParent: draggedObj.parentContainer,
			targetId: targetObj.id,
			position,
			parentId: null
		});
		unifiedCommunication.sendObjectMovement('reorder', {
			objectId: draggedObj.id,
			targetId: targetObj.id,
			position: position,
			parentId: null
		}).catch(console.error);
	}

	function reorderObjectInContainer(draggedObj, targetObj, position) {
		unifiedCommunication.sendObjectMovement('reorder', {
			objectId: draggedObj.id,
			targetId: targetObj.id,
			position: position,
			parentId: targetObj.parentContainer
		}).catch(console.error);
	}

	function isValidContainerNesting(childContainer, parentContainer) {
		if (childContainer.id === parentContainer.id) return false;
		if (isDescendantContainer(parentContainer.id, childContainer.id)) return false;

		const currentDepth = getContainerNestingDepth(parentContainer.id);
		return currentDepth < 2;
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

{#snippet TreeItem(object, depth = 0)}
	<div
		class="relative"
		draggable="true"
		ondragstart={(e) => handleDragStart(e, object)}
		ondragend={handleDragEnd}
		ondragover={(e) => handleDragOver(e, object)}
		ondragleave={handleDragLeave}
		ondrop={(e) => handleDrop(e, object)}
	>
		{#if dragOverTarget?.id === object.id && dropIndicatorPosition === 'before'}
			<div class="absolute top-0 left-0 right-0 h-0.5 bg-blue-500 z-10"></div>
		{/if}

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

			<button
				type="button"
				onclick={(e) => handleObjectClick(e, object)}
				class={cn(
					'flex items-center gap-2 px-2 py-2 rounded-md flex-1 min-w-0 transition-colors',
					'text-foreground/70 hover:text-foreground hover:bg-white/5',
					'focus:outline-none',
					isObjectHighlighted(object) && 'bg-white/10'
				)}
			>
				{#if object.isContainer && object.autoLayout?.tileMode?.enabled}
					<SquareStack
						class={cn(
							"w-4 h-4 shrink-0",
							isObjectHighlighted(object) ? "text-[#10B981]" : "text-foreground/50"
						)}
						strokeWidth={1.5}
					/>
				{:else if object.isContainer}
					<BoxSelect
						class={cn(
							"w-4 h-4 shrink-0",
							isObjectHighlighted(object) ? "text-blue-400" : "text-foreground/50"
						)}
						strokeWidth={1.5}
					/>
				{:else}
					<Box
						class={cn(
							"w-4 h-4 shrink-0",
							isObjectHighlighted(object) ? "text-blue-400" : "text-foreground/50"
						)}
						strokeWidth={1.5}
					/>
				{/if}

				<span class="truncate text-xs">{object.name}</span>

				{#if object.isContainer && object.autoLayout?.tileMode?.enabled}
					<span class="text-xs text-[#10B981] font-mono shrink-0">×{object.autoLayout.tileMode.repeat}</span>
				{/if}
			</button>
		</div>

		{#if dragOverTarget?.id === object.id && dropIndicatorPosition === 'after'}
			<div class="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500 z-10"></div>
		{/if}
	</div>

	{#if object.isContainer && expandedContainers.has(object.id) && object.children && object.children.length > 0 && !object.autoLayout?.tileMode?.enabled}
		<div class="ml-4 space-y-0.5">
			{#each object.children as child}
				{@render TreeItem(child, depth + 1)}
			{/each}
		</div>
	{/if}
{/snippet}

<div
	class="h-full overflow-y-auto px-4 py-4"
>
	<div class="space-y-0.5">
		<!-- Top drop zone - allows dropping at the very top of the list -->
		<!-- Always reserve space to prevent layout shift -->
		<div
			class="relative py-2"
			ondragover={(e) => {
				if (!draggedObject || treeStructure.length === 0) return;
				e.preventDefault();
				e.dataTransfer.dropEffect = 'move';
				dragOverTarget = { id: 'top-drop-zone', isTopZone: true };
				dropIndicatorPosition = 'before';
			}}
			ondragleave={(e) => {
				const relatedTarget = e.relatedTarget;
				const currentTarget = e.currentTarget;

				// Only clear if we're actually leaving the element (not just entering a child)
				if (dragOverTarget?.isTopZone && relatedTarget && currentTarget && !currentTarget.contains(relatedTarget)) {
					setTimeout(() => {
						// Double-check we're still outside
						if (dragOverTarget?.isTopZone) {
							dragOverTarget = null;
							dropIndicatorPosition = null;
						}
					}, 50);
				}
			}}
			ondrop={(e) => {
				e.preventDefault();
				if (draggedObject && treeStructure.length > 0) {
					// Drop before the first object in the list
					const firstObject = treeStructure[0];
					reorderObjectAtRoot(draggedObject, firstObject, 'before');
					draggedObject = null;
					dragOverTarget = null;
					dropIndicatorPosition = null;
					setTimeout(() => {
						window.parent.postMessage({ type: 'request-hierarchy-refresh', data: {} }, '*');
					}, 50);
				}
			}}
		>
			{#if dragOverTarget?.isTopZone && draggedObject}
				<div class="absolute top-1 left-0 right-0 h-0.5 bg-blue-500"></div>
			{/if}
		</div>

		{#each treeStructure as object}
			{@render TreeItem(object, 0)}
		{/each}
	</div>
</div>
