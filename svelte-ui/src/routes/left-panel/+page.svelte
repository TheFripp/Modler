<script lang="ts">
	import { onMount } from 'svelte';
	import { initializeBridge } from '$lib/bridge/threejs-bridge';
	import { selectedObjects, objectHierarchy, toolState, containerContext } from '$lib/stores/modler';
	import PropertyGroup from '$lib/components/ui/property-group.svelte';
	import InlineInput from '$lib/components/ui/inline-input.svelte';
	import ColorInput from '$lib/components/ui/color-input.svelte';
	import { unifiedCommunication } from '$lib/services/unified-communication';
	import { toggleSnapInScene } from '$lib/bridge/threejs-bridge';
	import { cn } from '$lib/utils';
	import { Box, BoxSelect, SquareStack } from 'lucide-svelte';

	// Tab state
	let activeTab: 'objects' | 'settings' = 'objects';

	// Loading state - hide empty state until first data load
	let hasLoadedOnce = false;

	// Watch for tab changes to settings and reload settings
	$: if (activeTab === 'settings') {
		loadSettingsFromConfig();
	}

	// Mark as loaded when we receive hierarchy data
	$: if ($objectHierarchy.length > 0 && !hasLoadedOnce) {
		hasLoadedOnce = true;
	}

	// Visual settings state
	let visualSettings = {
		selection: {
			color: '#ff6600',
			lineWidth: 2,
			opacity: 80,
			faceHighlightOpacity: 30
		},
		containers: {
			wireframeColor: '#00ff00',
			lineWidth: 1,
			opacity: 80
		}
	};

	// System settings state (from system toolbar)
	let currentUnit = 'm';
	let unitConverter: any = null;

	// CAD wireframe settings
	let cadWireframeSettings = {
		color: '#888888',
		opacity: 80,
		lineWidth: 1
	};

	// Scene settings state
	let sceneSettings = {
		backgroundColor: '#1a1a1a',
		gridMainColor: '#444444',
		gridSubColor: '#222222'
	};

	// Interface settings state
	let interfaceSettings = {
		accentColor: '#4a9eff',
		toolbarOpacity: 95
	};

	// Units list
	const units = [
		{ value: 'm', label: 'Meters (m)' },
		{ value: 'cm', label: 'Centimeters (cm)' },
		{ value: 'mm', label: 'Millimeters (mm)' },
		{ value: 'in', label: 'Inches (in)' },
		{ value: 'ft', label: 'Feet (ft)' }
	];

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

		// Apply UI-only ordering (no backend sortIndex)
		function applyOrderingToLevel(objects, parentId) {
			// Check if we have custom ordering for this level
			const order = customObjectOrder.get(parentId || 'root');
			if (order && order.length > 0) {
				objects.sort((a, b) => {
					const aIndex = order.indexOf(a.id);
					const bIndex = order.indexOf(b.id);
					// If not in custom order, maintain creation order
					if (aIndex === -1 && bIndex === -1) return 0;
					if (aIndex === -1) return 1;
					if (bIndex === -1) return -1;
					return aIndex - bIndex;
				});
			}
			// Otherwise maintain creation order (no sorting)

			// Recursively apply ordering to children and auto-expand containers
			objects.forEach(obj => {
				if (obj.isContainer && obj.children && obj.children.length > 0) {
					// Auto-expand containers that have children
					expandedContainers.add(obj.id);
					// Recursively apply ordering to children
					applyOrderingToLevel(obj.children, obj.id);
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

		// Add visual feedback to the dragged element
		event.currentTarget.style.opacity = '0.4';

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
		// Reset visual feedback
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
		const currentTarget = event.currentTarget; // Store reference before setTimeout

		if (relatedTarget && currentTarget && (!currentTarget.contains(relatedTarget) &&
			!currentTarget.closest('.space-y-1')?.contains(relatedTarget))) {
			// Only clear if actually leaving the list context
			setTimeout(() => {
				// Use timeout to prevent flicker when moving between closely spaced elements
				if (!dragOverTarget || (relatedTarget && currentTarget && currentTarget.contains(relatedTarget))) return;
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

		// Request immediate hierarchy refresh from main window
		setTimeout(() => {
			window.parent.postMessage({ type: 'request-hierarchy-refresh', data: {} }, '*');
		}, 50);
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
		// Use unified communication system instead of direct PostMessage
		const operation = objectToMove.isContainer ? 'container-move-to-container' : 'move-to-container';
		const data = {
			objectId: objectToMove.id,
			targetContainerId: targetContainer.id
		};

		unifiedCommunication.sendObjectMovement(operation, data).catch(error => {
			console.error('Failed to send object movement command:', error);
		});
	}

	function moveObjectToRoot(objectToMove) {
		// Use unified communication system instead of direct PostMessage
		const data = {
			objectId: objectToMove.id
		};

		unifiedCommunication.sendObjectMovement('move-to-root', data).catch(error => {
			console.error('Failed to send move to root command:', error);
		});
	}

	function reorderObjectAtRoot(draggedObj, targetObj, position) {
		// Send reorder command to backend
		unifiedCommunication.sendObjectMovement('reorder', {
			objectId: draggedObj.id,
			targetId: targetObj.id,
			position: position,
			parentId: null
		}).catch(error => {
			console.error('Failed to send reorder command:', error);
		});
	}

	function reorderObjectInContainer(draggedObj, targetObj, position) {
		// Send reorder command to backend
		unifiedCommunication.sendObjectMovement('reorder', {
			objectId: draggedObj.id,
			targetId: targetObj.id,
			position: position,
			parentId: targetObj.parentContainer
		}).catch(error => {
			console.error('Failed to send reorder command:', error);
		});
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
	function selectObjectInScene(objectId: string, event?: MouseEvent) {
		// Find the object in the hierarchy to check if it has a parent container
		const selectedObject = filteredHierarchy.find(obj => obj.id === objectId);

		// Check for shift-click to add to selection
		const isShiftClick = event?.shiftKey;

		// Check if we're in iframe context
		const isInIframe = window !== window.parent;

		if (!isInIframe) {
			// Direct context: use NavigationController if available
			const navigationController = (window as any).modlerComponents?.navigationController;

			if (navigationController) {
				// CONTAINER-FIRST BEHAVIOR:
				if (selectedObject?.isContainer) {
					// Case 1: Container selected → Select container in scene (stay at root level)
					const sceneController = (window as any).modlerComponents?.sceneController;
					const selectionController = (window as any).modlerComponents?.selectionController;
					if (sceneController && selectionController) {
						const containerData = sceneController.getObject(objectId);
						if (containerData && containerData.mesh) {
							if (!isShiftClick) {
								selectionController.clearSelection();
							}
							selectionController.select(containerData.mesh);
						}
					}
				} else if (selectedObject?.parentContainer) {
					// Case 2: Child object selected → Step into container and select child
					navigationController.navigateToObject(objectId); // This handles stepping in
				} else {
					// Case 3: Root-level object → Direct selection
					navigationController.navigateToObject(objectId);
				}
				return;
			}
		}

		// Fallback to legacy direct methods
		if ((window as any).selectObjectInSceneDirectly) {
			if (selectedObject?.isContainer) {
				// Container selected: select directly without stepping in
				const success = (window as any).selectObjectInSceneDirectly(objectId);
				if (success) return;
			} else if (selectedObject?.parentContainer) {
				// Child object selected: step into container first
				if ((window as any).stepIntoContainerById) {
					(window as any).stepIntoContainerById(selectedObject.parentContainer);
				}
				const success = (window as any).selectObjectInSceneDirectly(objectId);
				if (success) return;
			} else {
				// Root-level object: direct selection
				const success = (window as any).selectObjectInSceneDirectly(objectId);
				if (success) return;
			}
		}

		// Iframe context or fallback: use unified communication system
		const data: any = {
			objectId: Number(objectId),
			useNavigationController: true,
			isShiftClick: isShiftClick
		};

		// Only include parentContainer if it exists (omit if null/undefined)
		if (selectedObject?.parentContainer) {
			data.parentContainer = Number(selectedObject.parentContainer);
		}

		unifiedCommunication.sendNavigationCommand('object-select', data).catch(error => {
			console.error('Failed to send object selection command:', error);
		});
	}

	// Visual settings functions
	function updateVisualSettings(category: 'selection' | 'containers', property: string, value: any) {
		visualSettings[category][property] = value;

		// Map to proper config path
		const configPath = category === 'selection'
			? `visual.selection.${property}`
			: `visual.containers.${property}`;

		// Convert percentage to decimal for opacity properties
		const actualValue = (property === 'opacity' || property === 'faceHighlightOpacity') ? value / 100 : value;

		// Send individual setting update through unified communication system
		const settings = {
			[configPath]: actualValue
		};

		// Use unified communication system (handles both PostMessage and CustomEvents)
		unifiedCommunication.sendVisualSettings('visual', settings).catch(error => {
			console.error('Failed to send visual settings update:', error);
		});
	}

	// System toolbar functionality (consolidated)
	function handleSnapToggle() {
		try {
			toggleSnapInScene();
		} catch (error) {
			console.error('❌ Snap toggle failed:', error);
		}
	}

	function selectUnit(unit: string) {
		currentUnit = unit;
		if (unitConverter) {
			unitConverter.setUserUnit(unit);
			// Trigger property panel refresh
			window.dispatchEvent(new CustomEvent('unit-changed', { detail: { unit } }));
		}
	}

	function updateCadWireframeSettings(property: string, value: any) {
		cadWireframeSettings[property] = value;

		// Map property to proper config path
		const configPath = `visual.cad.wireframe.${property}`;

		// Convert percentage to decimal for opacity
		const actualValue = property === 'opacity' ? value / 100 : value;

		// Send individual setting update through unified communication system
		const settings = {
			[configPath]: actualValue
		};

		// Use unified communication system (handles both PostMessage and CustomEvents)
		unifiedCommunication.sendVisualSettings('cad-wireframe', settings).catch(error => {
			console.error('Failed to send CAD wireframe settings update:', error);
		});
	}

	function updateSceneSettings(property: string, value: any) {
		sceneSettings[property] = value;

		// Map property to proper config path
		const configPath = `scene.${property}`;

		// Send individual setting update through unified communication system
		const settings = {
			[configPath]: value
		};

		// Use unified communication system (handles both PostMessage and CustomEvents)
		unifiedCommunication.sendVisualSettings('scene', settings).catch(error => {
			console.error('Failed to send scene settings update:', error);
		});
	}

	function updateInterfaceSettings(property: string, value: any) {
		interfaceSettings[property] = value;
		// Map property to proper config path
		const configPath = `interface.${property}`;

		// Convert percentage to decimal for toolbarOpacity
		const actualValue = property === 'toolbarOpacity' ? value / 100 : value;

		// Send individual setting update through unified communication system
		const settings = {
			[configPath]: actualValue
		};
		// Use unified communication system for interface settings
		unifiedCommunication.sendVisualSettings('interface', settings).catch(error => {
			console.error('Failed to send interface settings update:', error);
		});
	}

	// Settings response handler (defined once, reused)
	function handleSettingsResponse(event: MessageEvent) {
		if (event.data.type === 'visual-settings-response') {
			const settings = event.data.settings;
			visualSettings = {
				selection: {
					color: settings.selection.color,
					lineWidth: settings.selection.lineWidth,
					opacity: settings.selection.opacity * 100,
					faceHighlightOpacity: (settings.selection.faceHighlightOpacity || 0.3) * 100
				},
				containers: {
					wireframeColor: settings.containers.wireframeColor,
					lineWidth: settings.containers.lineWidth,
					opacity: settings.containers.opacity * 100
				}
			};
		} else if (event.data.type === 'cad-wireframe-settings-response') {
			const settings = event.data.settings;
			cadWireframeSettings = {
				color: settings.color,
				lineWidth: settings.lineWidth,
				opacity: settings.opacity * 100
			};
		} else if (event.data.type === 'scene-settings-response') {
			const settings = event.data.settings;
			sceneSettings = {
				backgroundColor: settings.backgroundColor,
				gridMainColor: settings.gridMainColor,
				gridSubColor: settings.gridSubColor
			};
		} else if (event.data.type === 'interface-settings-response') {
			const settings = event.data.settings;
			interfaceSettings = {
				accentColor: settings.accentColor,
				toolbarOpacity: settings.toolbarOpacity * 100
			};
		}
	}

	function loadSettingsFromConfig() {
		// Send requests for all setting types (handler is registered in onMount)
		window.parent.postMessage({ type: 'get-visual-settings' }, '*');
		window.parent.postMessage({ type: 'get-cad-wireframe-settings' }, '*');
		window.parent.postMessage({ type: 'get-scene-settings' }, '*');
		window.parent.postMessage({ type: 'get-interface-settings' }, '*');
	}

	onMount(() => {
		// Enable dark mode
		document.documentElement.classList.add('dark');

		// Initialize the bridge with Three.js for real-time synchronization
		// MUST be called before anything else to set up PostMessage listener
		initializeBridge();

		// Register settings response handler (only once)
		window.addEventListener('message', handleSettingsResponse);

		// Load settings from ConfigurationManager (may fail in iframe due to CORS)
		try {
			loadSettingsFromConfig();
		} catch (error) {
			console.warn('Failed to load settings from ConfigurationManager:', error);
		}

		// Notify main app that left panel is ready to receive data
		window.parent.postMessage({ type: 'left-panel-ready' }, '*');

		// Get unit converter instance
		unitConverter = (window as any).UnitConverter ? new (window as any).UnitConverter() : null;
		if (unitConverter) {
			currentUnit = unitConverter.userUnit;
		}

		// Handle keyboard shortcuts globally when left panel has focus
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
			window.removeEventListener('message', handleSettingsResponse);
		};
	});

</script>

<!-- Recursive Tree Item Snippet -->
{#snippet TreeItem(object, depth)}
	<div class="object-tree-item flex items-center relative" style="padding-left: {depth * 8}px;">
		<!-- Drop indicator line (absolutely positioned so it doesn't affect layout) -->
		{#if draggedObject && dragOverTarget?.id === object.id && dropIndicatorPosition === 'before'}
			<div class="absolute top-0 left-0 right-0 h-0.5 bg-blue-500 z-10"></div>
		{/if}
		{#if draggedObject && dragOverTarget?.id === object.id && dropIndicatorPosition === 'after'}
			<div class="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500 z-10"></div>
		{/if}

		<!-- Expand/collapse button for containers (outside highlight) -->
		<!-- Don't show expand/collapse for tiled containers -->
		{#if object.isContainer && !object.autoLayout?.tileMode?.enabled}
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
			<!-- Spacer for non-expandable items or tiled containers -->
			<div class="w-4 h-4"></div>
		{/if}

		<!-- Highlightable content -->
		<div
			class="group flex items-center gap-2 px-2 py-2 text-sm rounded-md hover:bg-gray-700/50 cursor-pointer transition-all relative text-muted-foreground flex-1 focus:outline-none"
			class:opacity-40={draggedObject && draggedObject.id === object.id}
			class:cursor-move={draggedObject}
			class:bg-accent={isObjectHighlighted(object)}
			draggable="true"
			on:dragstart={(e) => handleDragStart(e, object)}
			on:dragend={handleDragEnd}
			on:dragover={(e) => handleDragOver(e, object)}
			on:dragleave={handleDragLeave}
			on:drop={(e) => handleDrop(e, object)}
			on:click={(e) => selectObjectInScene(object.id, e)}
			role="button"
			tabindex="0">

			<!-- Icon based on type -->
			<div class="flex-shrink-0 w-5 h-5 flex items-center justify-center">
				{#if object.isContainer && object.autoLayout?.tileMode?.enabled}
					<!-- Tiled container icon -->
					<SquareStack class="w-5 h-5 text-[#10B981]" strokeWidth={1.5} />
				{:else if object.isContainer}
					<!-- Regular container icon -->
					<BoxSelect class="w-5 h-5 text-muted-foreground" strokeWidth={1.5} />
				{:else}
					<!-- Object/Box icon -->
					<Box class="w-5 h-5 text-muted-foreground" strokeWidth={1.5} />
				{/if}
			</div>

			<!-- Object name -->
			<div class="flex-1 truncate font-medium select-none">
				{object.name || object.id}
			</div>

			<!-- Tile badge for tiled containers -->
			{#if object.isContainer && object.autoLayout?.tileMode?.enabled}
				<div class="flex-shrink-0 px-1.5 py-0.5 text-[10px] font-medium bg-[#10B981]/20 text-[#10B981] rounded">
					×{object.autoLayout.tileMode.repeat}
				</div>
			{/if}
		</div>

	</div>

	<!-- Children (recursively rendered if expanded) - as siblings, not nested -->
	<!-- Hide children for tiled containers (they're instances, not individual objects) -->
	{#if object.isContainer && object.children && object.children.length > 0 && expandedContainers.has(object.id) && !object.autoLayout?.tileMode?.enabled}
		{#each object.children as childObject}
			{@render TreeItem(childObject, depth + 1)}
		{/each}
	{/if}
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
	<div class="flex-1 px-2 py-4 overflow-y-auto min-w-0">
		{#if activeTab === 'objects'}
			<!-- Objects Tab Content -->
			<div class="space-y-4">

				<!-- Object Hierarchy -->
				<div>
					{#if treeStructure.length === 0}
						{#if hasLoadedOnce}
							<div class="text-xs text-muted-foreground p-6 text-center">
								<div class="text-gray-500 mb-2">🎯</div>
								<div>Create objects to see them here</div>
								<div class="text-gray-600 text-xs mt-1">Press T to create a box</div>
							</div>
						{/if}
					{:else}
						<!-- Tree-like sidebar structure -->
						<div class="space-y-0.5"
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
			<div class="space-y-3 sm:space-y-4 min-w-0">

				<!-- Visual Settings Accordion -->
				<PropertyGroup title="Visuals" collapsible={true} collapsed={false}>
					<div class="space-y-4">
						<!-- Selection Sub-group -->
						<div class="space-y-2">
							<h4 class="text-xs font-medium text-foreground/80 uppercase tracking-wide text-left">Selection</h4>
							<div class="space-y-2">
								<ColorInput
									label="Color"
									value={visualSettings.selection.color}
									onchange={(value) => updateVisualSettings('selection', 'color', value)}
								/>
								<div class="grid grid-cols-2 gap-2">
									<InlineInput
										label="Line"
										type="number"
										bind:value={visualSettings.selection.lineWidth}
										onchange={() => updateVisualSettings('selection', 'lineWidth', visualSettings.selection.lineWidth)}
										min={1}
										max={10}
										step={1}
									/>
									<InlineInput
										label="Opacity"
										type="number"
										bind:value={visualSettings.selection.opacity}
										onchange={() => updateVisualSettings('selection', 'opacity', visualSettings.selection.opacity)}
										min={0}
										max={100}
									/>
								</div>
								<InlineInput
									label="Face highlight"
									type="number"
									bind:value={visualSettings.selection.faceHighlightOpacity}
									onchange={() => updateVisualSettings('selection', 'faceHighlightOpacity', visualSettings.selection.faceHighlightOpacity)}
									min={0}
									max={100}
									step={1}
								/>
							</div>
						</div>

						<!-- Container Sub-group -->
						<div class="space-y-2">
							<h4 class="text-xs font-medium text-foreground/80 uppercase tracking-wide text-left">Containers</h4>
							<div class="space-y-2">
								<ColorInput
									label="Color"
									value={visualSettings.containers.wireframeColor}
									onchange={(value) => updateVisualSettings('containers', 'wireframeColor', value)}
								/>
								<div class="grid grid-cols-2 gap-2">
									<InlineInput
										label="Line"
										type="number"
										bind:value={visualSettings.containers.lineWidth}
										onchange={() => updateVisualSettings('containers', 'lineWidth', visualSettings.containers.lineWidth)}
										min={1}
										max={10}
										step={1}
									/>
									<InlineInput
										label="Opacity"
										type="number"
										bind:value={visualSettings.containers.opacity}
										onchange={() => updateVisualSettings('containers', 'opacity', visualSettings.containers.opacity)}
										min={0}
										max={100}
									/>
								</div>
							</div>
						</div>

						<!-- Snapping Sub-group -->
						<div class="space-y-2">
							<h4 class="text-xs font-medium text-foreground/80 uppercase tracking-wide text-left">Snapping</h4>
							<div class="space-y-2">
								<ColorInput
									label="Color"
									value="#ffffff"
									onchange={(value) => console.log('Snapping color:', value)}
								/>
								<InlineInput
									label="Corner Size"
									type="number"
									value={0.1}
									onchange={() => console.log('Corner size changed')}
								/>
							</div>
						</div>

						<!-- CAD Wireframes Sub-group -->
						<div class="space-y-2">
							<h4 class="text-xs font-medium text-foreground/80 uppercase tracking-wide text-left">CAD Wireframes</h4>
							<div class="space-y-2">
								<ColorInput
									label="Color"
									value={cadWireframeSettings.color}
									onchange={(value) => updateCadWireframeSettings('color', value)}
								/>
								<div class="grid grid-cols-2 gap-2">
									<InlineInput
										label="Thickness"
										type="number"
										bind:value={cadWireframeSettings.lineWidth}
										onchange={() => updateCadWireframeSettings('lineWidth', cadWireframeSettings.lineWidth)}
										min={1}
										max={10}
										step={1}
									/>
									<InlineInput
										label="Opacity"
										type="number"
										bind:value={cadWireframeSettings.opacity}
										onchange={() => updateCadWireframeSettings('opacity', cadWireframeSettings.opacity)}
										min={0}
										max={100}
									/>
								</div>
							</div>
						</div>
					</div>
				</PropertyGroup>

				<!-- Scene Settings Accordion -->
				<PropertyGroup title="Scene" collapsible={true} collapsed={false}>
					<div class="space-y-2">
						<ColorInput
							label="Background"
							value={sceneSettings.backgroundColor}
							onchange={(value) => updateSceneSettings('backgroundColor', value)}
						/>
						<ColorInput
							label="Grid Main"
							value={sceneSettings.gridMainColor}
							onchange={(value) => updateSceneSettings('gridMainColor', value)}
						/>
						<ColorInput
							label="Grid Sub"
							value={sceneSettings.gridSubColor}
							onchange={(value) => updateSceneSettings('gridSubColor', value)}
						/>
						<ColorInput
							label="Accent Color"
							value={interfaceSettings.accentColor}
							onchange={(value) => updateInterfaceSettings('accentColor', value)}
						/>
						<InlineInput
							label="Toolbar Opacity"
							type="number"
							bind:value={interfaceSettings.toolbarOpacity}
							onchange={() => updateInterfaceSettings('toolbarOpacity', interfaceSettings.toolbarOpacity)}
							min={0}
							max={100}
						/>
					</div>
				</PropertyGroup>

				<!-- Units Settings Accordion -->
				<PropertyGroup title="Units" collapsible={true} collapsed={false}>
					<div class="space-y-2">
						<select
							class="w-full bg-[#212121]/50 border border-[#2E2E2E]/50 rounded-md px-3 py-2 text-xs text-foreground focus:border-[#6b7280] transition-colors cursor-pointer"
							bind:value={currentUnit}
							on:change={() => selectUnit(currentUnit)}
						>
							{#each units as unit}
								<option value={unit.value}>{unit.label}</option>
							{/each}
						</select>
					</div>
				</PropertyGroup>
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