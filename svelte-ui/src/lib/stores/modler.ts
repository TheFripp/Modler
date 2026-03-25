import { writable, derived, get, type Writable } from 'svelte/store';

// UPDATED: Use centralized type definitions
import type { ObjectData, ToolState, ContainerContext } from '$lib/types/object-data';
// All type definitions are now imported from centralized types

// Core Svelte stores
export const selectedObjects: Writable<ObjectData[]> = writable([]);
export const hoveredObjectId: Writable<number | null> = writable(null);

export const objectHierarchy: Writable<ObjectData[]> = writable([]);

export const containerContext: Writable<ContainerContext | null> = writable(null);
export const contextDisplayObject: Writable<ObjectData | null> = writable(null);
export const toolState: Writable<ToolState> = writable({
	activeTool: 'select',
	snapEnabled: false
});


// Derived stores for computed values
export const selectedObject = derived(selectedObjects, ($selectedObjects) =>
	$selectedObjects.length === 1 ? $selectedObjects[0] : null
);

// Derived store for multi-selection state
export const multiSelection = derived(selectedObjects, ($selectedObjects) => {
	if ($selectedObjects.length <= 1) return null;

	// Create a merged object for multi-selection display
	const first = $selectedObjects[0];
	const mixed: ObjectData = {
		id: 'multi-selection',
		name: `${$selectedObjects.length} selected`,
		type: 'multi',
		isContainer: false,
		position: { x: 0, y: 0, z: 0 },
		rotation: { x: 0, y: 0, z: 0 },
		scale: { x: 1, y: 1, z: 1 },
		dimensions: { x: 0, y: 0, z: 0 },
		material: { color: '#ffffff', opacity: 1, transparent: false },
		autoLayout: { enabled: false, direction: null, gap: 0, padding: { width: 0, height: 0, depth: 0 }, alignment: { x: 'center', y: 'center', z: 'center' }, reversed: false },
		containerMode: null,
		layoutMode: null,
		childIds: [],
		parentContainer: null,
		selected: false,
		locked: false,
		visible: true,
		formatVersion: '1.0.0',
		lastModified: Date.now()
	};

	// Check if all objects are containers
	const allContainers = $selectedObjects.every(obj => obj.isContainer);
	const someContainers = $selectedObjects.some(obj => obj.isContainer);

	if (allContainers) {
		mixed.isContainer = true;
		mixed.type = 'container';
		// Use first object's autoLayout as template
		mixed.autoLayout = first.autoLayout;
		mixed.containerMode = first.containerMode;
	} else if (someContainers) {
		mixed.type = 'mixed';
	}

	return mixed;
});

export const hasSelection = derived(selectedObjects, ($selectedObjects) =>
	$selectedObjects.length > 0
);

export const selectedContainer = derived(selectedObject, ($selectedObject) =>
	$selectedObject?.isContainer ? $selectedObject : null
);

// Current display object: selection takes priority, context container is fallback
export const displayObject = derived(
	[selectedObject, multiSelection, contextDisplayObject],
	([$selectedObject, $multiSelection, $contextDisplayObject]) =>
		$multiSelection || $selectedObject || $contextDisplayObject
);

// Utility function to check if a property has mixed values across selected objects
export function getPropertyMixedState(property: string, objects?: ObjectData[]): { isMixed: boolean; value: any } {
	// Use provided objects (reactive) or fallback to get() for backward compatibility
	const objectsToCheck = objects || get(selectedObjects);
	if (objectsToCheck.length <= 1) return { isMixed: false, value: getNestedPropertyValue(objectsToCheck[0], property) };

	const firstValue = getNestedPropertyValue(objectsToCheck[0], property);
	const allSameValue = objectsToCheck.every(obj => {
		const objValue = getNestedPropertyValue(obj, property);
		return JSON.stringify(objValue) === JSON.stringify(firstValue);
	});

	return {
		isMixed: !allSameValue,
		value: allSameValue ? firstValue : 'Mix'
	};
}

// Helper function to get nested property values (e.g., "position.x", "autoLayout.enabled")
function getNestedPropertyValue(obj: any, property: string): any {
	if (!obj) return undefined;

	const parts = property.split('.');
	let value = obj;

	for (const part of parts) {
		value = value?.[part];
		if (value === undefined) break;
	}

	return value;
}

// Bridge reference - will be set when Three.js integration is initialized
export let modlerComponentsBridge: any = null;

// Field state management for UI disabling based on object state
export interface FieldState {
	disabled: boolean;
	reason?: string;
	tooltip?: string;
}

export interface FieldStates {
	[fieldPath: string]: FieldState;
}

// Calculate field states based on object properties
export function getFieldStates(object: ObjectData | null): FieldStates {
	const states: FieldStates = {};

	if (!object) return states;

	// Container in hug mode - dimensions should be disabled
	if (object.isContainer && object.containerMode === 'hug') {
		states['dimensions.x'] = {
			disabled: true,
			reason: 'hug-mode',
			tooltip: 'Dimensions are automatically calculated in hug mode'
		};
		states['dimensions.y'] = {
			disabled: true,
			reason: 'hug-mode',
			tooltip: 'Dimensions are automatically calculated in hug mode'
		};
		states['dimensions.z'] = {
			disabled: true,
			reason: 'hug-mode',
			tooltip: 'Dimensions are automatically calculated in hug mode'
		};
	}

	// Parametric constraints - check for locked properties
	if (object.constraints) {
		for (const [property, constraint] of Object.entries(object.constraints)) {
			if (constraint === 'locked') {
				states[property] = {
					disabled: true,
					reason: 'parametric-locked',
					tooltip: `${property} is locked by parametric constraints`
				};
			} else if (constraint === 'formula') {
				states[property] = {
					disabled: true,
					reason: 'parametric-formula',
					tooltip: `${property} is controlled by a parametric formula`
				};
			}
		}
	}

	// Component instance restrictions
	if (object.instance && !object.instance.canModify) {
		// Instance cannot be modified - disable most properties
		const restrictedProperties = ['dimensions.x', 'dimensions.y', 'dimensions.z', 'material.color'];
		restrictedProperties.forEach(prop => {
			if (!object.instance?.inheritedProperties.includes(prop)) {
				states[prop] = {
					disabled: true,
					reason: 'instance-restricted',
					tooltip: 'This property is inherited from the master component'
				};
			}
		});
	}

	// Yard template - fixed dimensions cannot be edited
	if (object.yardFixed) {
		const axes = ['x', 'y', 'z'] as const;
		for (const axis of axes) {
			if (object.yardFixed[axis]) {
				states[`dimensions.${axis}`] = {
					disabled: true,
					reason: 'yard-fixed',
					tooltip: 'Fixed by Yard template'
				};
			}
		}
	}

	// Multi-selection - some fields might be disabled for mixed types
	if (object.type === 'multi' || object.type === 'mixed') {
		// Could add logic here for multi-selection field restrictions
	}

	return states;
}

// Derived store for field states based on current display object
export const fieldStates = derived(displayObject, ($displayObject) =>
	getFieldStates($displayObject)
);

// Initialize the bridge to Three.js components
export function initializeModlerBridge(components: any) {
	modlerComponentsBridge = components;

	// UNIFIED COMMUNICATION: All UI updates now flow through PropertyPanelSync → PostMessage
	// Direct ObjectStateManager listeners removed to eliminate race conditions
	// Selection and hierarchy updates handled by threejs-bridge.ts via PostMessage

	// Set up initial state sync
	if (components.sceneController) {
		// Get initial hierarchy from SceneController (single source of truth)
		const allObjects = components.sceneController.getAllObjects();
		objectHierarchy.set(allObjects);
	}

	const objectStateManager = components.objectStateManager;
	if (objectStateManager) {
		// Get initial selection from ObjectStateManager
		const initialSelection = objectStateManager.getSelection();
		const initialSelectedObjects = initialSelection.map((objectId: string) =>
			objectStateManager.getObject(objectId)
		).filter(Boolean);
		selectedObjects.set(initialSelectedObjects);
	} else if (components.selectionController) {
		// Fallback to SelectionController if ObjectStateManager not available
		const initialSelection = components.selectionController.getSelectedObjects();
		selectedObjects.set(initialSelection.map((obj: any) => ({ ...obj })));
	}
}

// Update Three.js from Svelte store changes using ObjectStateManager
export function updateThreeJSProperty(objectId: string, property: string, value: any, source: string = 'input') {
	// Check if we're in an iframe - use PostMessage for cross-origin communication
	const isInIframe = window !== window.parent;

	if (isInIframe) {
		// SimpleCommunication: Use direct postMessage to CommandRouter
		try {
			window.parent.postMessage({
				type: 'update-property',
				objectId,
				property,
				value,
				source
			}, '*');
			return;
		} catch (error) {
			console.error('❌ Property update postMessage failed:', error);
			return;
		}
	}

	// Direct access for non-iframe context - use ObjectStateManager
	const components = (window as any)?.modlerComponents || modlerComponentsBridge;
	const objectStateManager = components?.objectStateManager;

	if (!objectStateManager) {
		console.warn('⚠️ ObjectStateManager not available for property update:', { objectId, property, value });
		return;
	}

	// Handle multi-selection updates
	if (objectId === 'multi-selection') {
		// Get current selected objects
		const currentObjects = get(selectedObjects);

		// Update all selected objects through ObjectStateManager
		currentObjects.forEach(obj => {
			updateSingleObjectViaStateManager(objectStateManager, obj.id, property, value);
		});

		return;
	}

	// Single object update through ObjectStateManager
	updateSingleObjectViaStateManager(objectStateManager, objectId, property, value);
}

// Helper to update object via ObjectStateManager
function updateSingleObjectViaStateManager(objectStateManager: any, objectId: string, property: string, value: any) {
	// Convert property path to nested update object
	const updates: any = {};
	if (property.includes('.')) {
		const [parent, child] = property.split('.');
		updates[parent] = { [child]: parseFloat(value) || value };
	} else {
		updates[property] = parseFloat(value) || value;
	}

	// Handle special cases
	if (property === 'autoLayout.enabled' && value) {
		const currentObject = objectStateManager.getObject(objectId);
		if (currentObject?.isContainer && !currentObject.autoLayout?.direction) {
			updates.autoLayout.direction = 'x'; // Default direction
		}
	}

	// SINGLE CALL DOES EVERYTHING: Updates 3D scene, triggers layout, notifies UI
	objectStateManager.updateObject(objectId, updates);
}

// Sync selection changes from ObjectStateManager (already in standard format)
export function syncSelectionFromThreeJS(selectedObjectsData: any[]) {
	if (!Array.isArray(selectedObjectsData)) {
		selectedObjects.set([]);
		return;
	}

	// Data is in standard format from DataExtractor — create new references for Svelte reactivity
	const objectDataArray = selectedObjectsData
		.filter(obj => obj != null)
		.map(obj => ({ ...obj }));

	// Only update if selection actually changed (prevents input flickering)
	const currentSelection = get(selectedObjects);
	if (selectionChanged(currentSelection, objectDataArray)) {
		selectedObjects.set(objectDataArray);
	}
}

/**
 * Check if selection has actually changed
 * Compares IDs and modification timestamps
 */
function selectionChanged(current: ObjectData[], incoming: ObjectData[]): boolean {
	// Different count = changed
	if (current.length !== incoming.length) return true;

	// Empty selection - no change
	if (current.length === 0) return false;

	// Compare IDs in order (selection order matters)
	for (let i = 0; i < current.length; i++) {
		if (current[i].id !== incoming[i].id) return true;
	}

	// Same objects selected - check if properties changed
	// Only update if property values actually changed to prevent input flicker
	for (let i = 0; i < current.length; i++) {
		const curr = current[i];
		const inc = incoming[i];

		// Check critical properties that affect UI inputs
		if (curr.name !== inc.name) return true; // Name changes should update property panel
		if (JSON.stringify(curr.position) !== JSON.stringify(inc.position)) return true;
		if (JSON.stringify(curr.rotation) !== JSON.stringify(inc.rotation)) return true;
		if (JSON.stringify(curr.dimensions) !== JSON.stringify(inc.dimensions)) return true;
		if (JSON.stringify(curr.material) !== JSON.stringify(inc.material)) return true;
		if (JSON.stringify(curr.autoLayout) !== JSON.stringify(inc.autoLayout)) return true;
		if (curr.containerMode !== inc.containerMode) return true;
		if (curr.locked !== inc.locked) return true;
		if (curr.visible !== inc.visible) return true;
	}

	// No changes detected
	return false;
}

// Sync object hierarchy from Three.js
// Selection and hierarchy are separate concerns — selection updates come via 'selection-changed'
// and 'object-changed' events, not hierarchy events
export function syncHierarchyFromThreeJS(hierarchyData: ObjectData[] | { objects: ObjectData[], rootChildrenOrder: number[] }) {
	objectHierarchy.set(hierarchyData);
}

// Incremental hierarchy updates — add/remove single objects without full rebuild
export function addObjectToHierarchy(objectData: any, rootChildrenOrder?: any[]) {
	const current = get(objectHierarchy) as any;
	const isNewFormat = current && !Array.isArray(current) && current.objects;
	if (isNewFormat) {
		// Dedup: skip if object with same ID already exists
		const exists = current.objects.some((obj: any) => obj.id === objectData.id);
		if (exists) return;
		(objectHierarchy as any).set({
			objects: [...current.objects, objectData],
			rootChildrenOrder: rootChildrenOrder || current.rootChildrenOrder || []
		});
	} else {
		const arr = Array.isArray(current) ? current : [];
		// Dedup: skip if object with same ID already exists
		if (arr.some((obj: any) => obj.id === objectData.id)) return;
		(objectHierarchy as any).set([...arr, objectData]);
	}
}

export function removeObjectFromHierarchy(objectId: any) {
	const current = get(objectHierarchy) as any;
	const isNewFormat = current && !Array.isArray(current) && current.objects;
	// Filter out the object (children are removed via their own events)
	const filterById = (obj: any) => obj.id !== objectId;
	if (isNewFormat) {
		(objectHierarchy as any).set({
			objects: current.objects.filter(filterById),
			rootChildrenOrder: (current.rootChildrenOrder || []).filter((id: any) => id !== objectId)
		});
	} else {
		const arr = Array.isArray(current) ? current : [];
		(objectHierarchy as any).set(arr.filter(filterById));
	}
}

// Sync container context from Three.js
export function syncContainerContextFromThreeJS(context: ContainerContext | null) {
	containerContext.set(context);
	if (!context) {
		contextDisplayObject.set(null);
	}
}

// Sync context container display data (full object data for PropertyPanel fallback)
export function syncContextDisplayFromThreeJS(objectData: ObjectData | null) {
	contextDisplayObject.set(objectData ? { ...objectData } : null);
}

// Batch all selection-related store updates from a single selection-changed event
export function syncSelectionEventFromThreeJS(data: {
	selectedObjects: ObjectData[],
	containerContext: ContainerContext | null,
	contextContainerData: ObjectData | null
}) {
	syncSelectionFromThreeJS(data.selectedObjects);
	syncContainerContextFromThreeJS(data.containerContext);
	syncContextDisplayFromThreeJS(data.contextContainerData);
}

// Sync hover state from Three.js (bidirectional: 3D hover highlights tree item)
export function syncHoverFromThreeJS(objectId: number | null) {
	hoveredObjectId.set(objectId);
}

// Make syncSelectionFromThreeJS globally available for ObjectStateManager
if (typeof window !== 'undefined') {
	(window as any).syncSelectionFromThreeJS = syncSelectionFromThreeJS;
}

