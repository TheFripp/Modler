import { writable, derived, get, type Writable } from 'svelte/store';

// UPDATED: Use centralized type definitions
import type { ObjectData, ToolState, ContainerContext } from '$lib/types/object-data';
// Dynamic import for unifiedCommunication to avoid SSR issues

// All type definitions are now imported from centralized types

// Core Svelte stores
export const selectedObjects: Writable<ObjectData[]> = writable([]);

export const objectHierarchy: Writable<ObjectData[]> = writable([]);

export const containerContext: Writable<ContainerContext | null> = writable(null);
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
		isContainer: false, // Will determine mixed container state below
		position: { x: 0, y: 0, z: 0 },
		rotation: { x: 0, y: 0, z: 0 },
		dimensions: { x: 0, y: 0, z: 0 },
		material: { color: '#ffffff', opacity: 1 },
		autoLayout: undefined,
		sizingMode: undefined,
		parentContainer: undefined
	};

	// Check if all objects are containers
	const allContainers = $selectedObjects.every(obj => obj.isContainer);
	const someContainers = $selectedObjects.some(obj => obj.isContainer);

	if (allContainers) {
		mixed.isContainer = true;
		mixed.type = 'container';
		// Use first object's autoLayout as template
		mixed.autoLayout = first.autoLayout;
		mixed.sizingMode = first.sizingMode;
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

// Current display object (single selection or multi-selection merged object)
export const displayObject = derived([selectedObject, multiSelection], ([$selectedObject, $multiSelection]) =>
	$multiSelection || $selectedObject
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
	if (object.isContainer && object.sizingMode === 'hug') {
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

	const objectStateManager = components.objectStateManager;
	if (objectStateManager) {
		// Set up initial state sync from ObjectStateManager (one-time only)
		const initialHierarchy = objectStateManager.getHierarchy();
		objectHierarchy.set(initialHierarchy);

		const initialSelection = objectStateManager.getSelection();
		const initialSelectedObjects = initialSelection.map((objectId: string) =>
			objectStateManager.getObject(objectId)
		).filter(Boolean);
		selectedObjects.set(initialSelectedObjects);
	} else {
		// Fallback to legacy sync methods if ObjectStateManager not available
		if (components.selectionController) {
			const initialSelection = components.selectionController.getSelectedObjects();
			selectedObjects.set(initialSelection.map(convertThreeObjectToObjectData));
		}

		if (components.sceneController) {
			const allObjects = components.sceneController.getAllObjects();
			objectHierarchy.set(allObjects);
		}
	}
}

// SIMPLIFIED: Expect standard format data from ObjectStateManager
function validateAndNormalizeObjectData(objectData: any): ObjectData {
	// Data should already be in standard format from ObjectStateManager
	// This function just validates and provides fallbacks for edge cases

	if (!objectData || typeof objectData !== 'object') {
		console.warn('validateAndNormalizeObjectData: Invalid object data, creating fallback');
		return createFallbackObjectData();
	}

	// Check if data is already in standard format
	if (objectData.formatVersion === '1.0.0' ||
		(objectData.position && typeof objectData.position === 'object' &&
		 objectData.rotation && typeof objectData.rotation === 'object')) {
		return objectData as ObjectData;
	}

	// Handle legacy flat format as fallback (should not happen with new system)
	if (objectData.hasOwnProperty('position.x')) {
		console.warn('validateAndNormalizeObjectData: Received legacy flat format, converting');
		return convertLegacyFlatFormat(objectData);
	}

	// If format is unknown, try to normalize
	return normalizeUnknownFormat(objectData);
}

// Helper: Convert legacy flat format (fallback only)
function convertLegacyFlatFormat(flatObj: any): ObjectData {
	return {
		id: flatObj.id || 'unknown',
		name: flatObj.name || 'Object',
		type: flatObj.type || 'object',

		parentContainer: flatObj.parentContainer || null,
		childIds: flatObj.childIds || [],

		position: {
			x: flatObj['position.x'] || flatObj.position?.x || 0,
			y: flatObj['position.y'] || flatObj.position?.y || 0,
			z: flatObj['position.z'] || flatObj.position?.z || 0
		},
		rotation: {
			x: flatObj['rotation.x'] || flatObj.rotation?.x || 0,
			y: flatObj['rotation.y'] || flatObj.rotation?.y || 0,
			z: flatObj['rotation.z'] || flatObj.rotation?.z || 0
		},
		scale: {
			x: flatObj['scale.x'] || flatObj.scale?.x || 1,
			y: flatObj['scale.y'] || flatObj.scale?.y || 1,
			z: flatObj['scale.z'] || flatObj.scale?.z || 1
		},
		dimensions: {
			x: flatObj['dimensions.x'] || flatObj.dimensions?.x || 1,
			y: flatObj['dimensions.y'] || flatObj.dimensions?.y || 1,
			z: flatObj['dimensions.z'] || flatObj.dimensions?.z || 1
		},
		material: {
			color: flatObj['material.color'] || flatObj.material?.color || '#888888',
			opacity: flatObj['material.opacity'] || flatObj.material?.opacity || 1,
			transparent: flatObj['material.transparent'] || flatObj.material?.transparent || false
		},

		isContainer: flatObj.isContainer || false,
		layoutMode: flatObj.layoutMode || null,
		autoLayout: {
			enabled: flatObj['autoLayout.enabled'] || flatObj.autoLayout?.enabled || false,
			direction: flatObj['autoLayout.direction'] || flatObj.autoLayout?.direction || null,
			gap: flatObj['autoLayout.gap'] || flatObj.autoLayout?.gap || 0,
			padding: flatObj['autoLayout.padding'] || flatObj.autoLayout?.padding || { top: 0, bottom: 0, left: 0, right: 0, front: 0, back: 0 }
		},

		selected: flatObj.selected || false,
		locked: flatObj.locked || false,
		visible: flatObj.visible !== false,

		formatVersion: '1.0.0',
		lastModified: Date.now()
	};
}

// Helper: Normalize unknown format (fallback)
function normalizeUnknownFormat(obj: any): ObjectData {
	return {
		id: obj.id || obj.uuid || 'unknown',
		name: obj.name || 'Object',
		type: obj.type || 'object',

		parentContainer: obj.parentContainer || null,
		childIds: obj.childIds || obj.children || [],

		position: obj.position || { x: 0, y: 0, z: 0 },
		rotation: obj.rotation || { x: 0, y: 0, z: 0 },
		scale: obj.scale || { x: 1, y: 1, z: 1 },
		dimensions: obj.dimensions || { x: 1, y: 1, z: 1 },

		material: obj.material || { color: '#888888', opacity: 1, transparent: false },

		isContainer: !!obj.isContainer,
		layoutMode: obj.layoutMode || null,
		autoLayout: obj.autoLayout || { enabled: false, direction: null, gap: 0, padding: { top: 0, bottom: 0, left: 0, right: 0, front: 0, back: 0 } },

		selected: !!obj.selected,
		locked: !!obj.locked,
		visible: obj.visible !== false,

		formatVersion: '1.0.0',
		lastModified: Date.now()
	};
}

// Helper: Create fallback object when data is corrupted
function createFallbackObjectData(id?: string): ObjectData {
	return {
		id: id || `fallback-${Date.now()}`,
		name: 'Unknown Object',
		type: 'object',

		parentContainer: null,
		childIds: [],

		position: { x: 0, y: 0, z: 0 },
		rotation: { x: 0, y: 0, z: 0 },
		scale: { x: 1, y: 1, z: 1 },
		dimensions: { x: 1, y: 1, z: 1 },

		material: { color: '#ff0000', opacity: 1, transparent: false },

		isContainer: false,
		layoutMode: null,
		autoLayout: { enabled: false, direction: null, gap: 0, padding: { top: 0, bottom: 0, left: 0, right: 0, front: 0, back: 0 } },

		selected: false,
		locked: false,
		visible: true,

		formatVersion: '1.0.0',
		lastModified: Date.now()
	};
}

// Update Three.js from Svelte store changes using ObjectStateManager
export function updateThreeJSProperty(objectId: string, property: string, value: any, source: string = 'input') {
	// Check if we're in an iframe - use PostMessage for cross-origin communication
	const isInIframe = window !== window.parent;

	if (isInIframe) {
		// Use unified communication system instead of direct PostMessage
		try {
			// Dynamic import to avoid SSR issues
			import('$lib/services/unified-communication').then(({ unifiedCommunication }) => {
				// Send property update through unified communication system
				// Note: This could be expanded to use a dedicated property update method if needed
				unifiedCommunication.sendNavigationCommand('property-update', { objectId, property, value, source }).catch(error => {
					console.error('❌ Unified communication property update failed:', error);
				});
			}).catch(error => {
				console.error('❌ Failed to load unified communication:', error);
			});
			return;
		} catch (error) {
			console.error('❌ Unified communication property update failed:', error);
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
	try {
		// Handle null/undefined input
		if (!Array.isArray(selectedObjectsData)) {
			console.warn('syncSelectionFromThreeJS: Invalid input, expected array');
			selectedObjects.set([]);
			return;
		}

		// Data should already be in standard format from ObjectStateManager
		// Just validate and normalize if needed
		const objectDataArray = selectedObjectsData
			.filter(obj => obj != null) // Remove null/undefined objects
			.map(obj => {
				try {
					return validateAndNormalizeObjectData(obj);
				} catch (error) {
					console.error('syncSelectionFromThreeJS: Error validating object:', error);
					return createFallbackObjectData(obj?.id);
				}
			})
			.filter(obj => obj != null); // Remove any failed validations

		selectedObjects.set(objectDataArray);
	} catch (error) {
		console.error('syncSelectionFromThreeJS: Critical error:', error);
		selectedObjects.set([]); // Fallback to empty selection
	}
}

// Sync object hierarchy from Three.js
export function syncHierarchyFromThreeJS(allObjects: ObjectData[]) {
	objectHierarchy.set(allObjects);
}

// Sync container context from Three.js
export function syncContainerContextFromThreeJS(context: ContainerContext | null) {
	containerContext.set(context);
}

/**
 * Handle property updates directly with Three.js scene
 * Replaces iframe PostMessage communication with direct function calls
 */
function handleDirectPropertyUpdate(components: any, objectId: string, property: string, value: any, source: string = 'input') {
	if (!components?.sceneController) {
		console.warn('⚠️ SceneController not available for property update');
		return;
	}

	const { sceneController } = components;

	// Get the object from SceneController
	const objectData = sceneController.getObject(objectId);
	if (!objectData) {
		console.warn('⚠️ Object not found:', objectId);
		return;
	}

	const mesh = objectData.mesh;
	if (!mesh) {
		console.warn('⚠️ Mesh not found for object:', objectId);
		return;
	}

	// Route property updates through centralized PropertyUpdateHandler
	const { propertyUpdateHandler } = components;

	if (propertyUpdateHandler) {
		// Use centralized property handling for consistency
		const success = propertyUpdateHandler.handlePropertyChange(objectId, property, value);

		if (success) {
			// PropertyUpdateHandler handled the update, including notifications
			return;
		}

		// If PropertyUpdateHandler didn't handle it, fall back to direct handling
		console.warn('PropertyUpdateHandler failed, falling back to direct handling:', { property, value });
	}

	// Fallback: Handle different property types directly (for properties not yet centralized)
	if (property.startsWith('position.')) {
		const axis = property.split('.')[1] as 'x' | 'y' | 'z';
		if (mesh.position && ['x', 'y', 'z'].includes(axis)) {
			mesh.position[axis] = value;
			completeObjectModification(components, mesh, 'transform', true);
		}
	} else if (property.startsWith('rotation.')) {
		const axis = property.split('.')[1] as 'x' | 'y' | 'z';
		if (mesh.rotation && ['x', 'y', 'z'].includes(axis)) {
			// Convert degrees to radians
			mesh.rotation[axis] = value * Math.PI / 180;
			completeObjectModification(components, mesh, 'transform', true);
		}
	} else if (property.startsWith('dimensions.')) {
		const axis = property.split('.')[1] as 'x' | 'y' | 'z';
		if (['x', 'y', 'z'].includes(axis)) {
			// Use SceneController for geometry modifications if available
			if (sceneController.updateObjectDimensions) {
				sceneController.updateObjectDimensions(objectId, axis, value);
			} else {
				// Fallback: Geometry-based dimension changes (CAD-style)
				const geometry = mesh.geometry;
				if (geometry) {
					try {
						// Force geometry bounds recalculation
						geometry.computeBoundingBox();
						const bbox = geometry.boundingBox;

						// Calculate current dimension and scale factor
						const axisIndex = { x: 0, y: 1, z: 2 }[axis];
						const currentDimension = bbox.max[axis] - bbox.min[axis];
						const scaleFactor = value / currentDimension;
						const center = (bbox.max[axis] + bbox.min[axis]) * 0.5;

						// Modify vertices directly for true CAD behavior
						const positions = geometry.getAttribute('position');
						const vertices = positions.array;

						for (let i = 0; i < vertices.length; i += 3) {
							const vertexIndex = i + axisIndex;
							const distanceFromCenter = vertices[vertexIndex] - center;
							vertices[vertexIndex] = center + (distanceFromCenter * scaleFactor);
						}

						// Update geometry
						positions.needsUpdate = true;
						geometry.computeBoundingBox();

						// Update support mesh geometries to match new main geometry
						const geometryUtils = (window as any).GeometryUtils;
						if (geometryUtils) {
							geometryUtils.updateSupportMeshGeometries(mesh);
						}

						// Update userData for dimension tracking
						if (!mesh.userData.dimensions) mesh.userData.dimensions = { x: 1, y: 1, z: 1 };
						mesh.userData.dimensions[axis] = value;

					} catch (error) {
						console.error('Fallback dimension update failed:', error);
						// Final fallback to simple scaling if geometry manipulation fails
						mesh.scale[axis] = value;
					}
				} else {
					// No geometry available, use simple scaling
					mesh.scale[axis] = value;
				}
			}
			completeObjectModification(components, mesh, 'geometry', true);
		}
	} else {
		// All other properties should be handled by PropertyUpdateHandler
		// This fallback should rarely be reached now that we have centralized handling
		console.warn('Property not handled by PropertyUpdateHandler fallback:', { property, value });
	}
}

/**
 * Complete object modification using the same pattern as move tool
 * Ensures selection boxes stay synchronized during real-time updates
 */
function completeObjectModification(components: any, mesh: any, changeType: string = 'transform', immediateVisuals: boolean = false) {
	// Use centralized GeometryUtils for support mesh synchronization
	const geometryUtils = (window as any).GeometryUtils;
	if (geometryUtils) {
		geometryUtils.updateSupportMeshGeometries(mesh);
	} else if ((window as any).CameraMathUtils) {
		// Fallback to legacy sync method
		(window as any).CameraMathUtils.syncSelectionWireframes(mesh);
	}

	// Notify centralized system for bidirectional property panel synchronization
	if ((window as any).notifyObjectModified) {
		(window as any).notifyObjectModified(mesh, changeType);
	}
}