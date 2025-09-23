import { writable, derived, get, type Writable } from 'svelte/store';

// Type definitions matching the Modler V2 architecture
export interface ObjectData {
	id: string;
	name: string;
	type: string;
	isContainer?: boolean;
	position: { x: number; y: number; z: number };
	rotation: { x: number; y: number; z: number };
	dimensions: { x: number; y: number; z: number };
	material?: {
		color: string;
		opacity: number;
	};
	autoLayout?: {
		enabled: boolean;
		direction: string | null;
		gap: number;
		padding: { top: number; bottom: number; left: number; right: number; front: number; back: number };
	};
	sizingMode?: 'hug' | 'fixed';
	parentContainer?: string;
}

export interface ToolState {
	activeTool: 'select' | 'move' | 'push' | 'box-creation';
	snapEnabled: boolean;
}

// Core Svelte stores
export const selectedObjects: Writable<ObjectData[]> = writable([]);
export const objectHierarchy: Writable<ObjectData[]> = writable([]);
export const toolState: Writable<ToolState> = writable({
	activeTool: 'select',
	snapEnabled: true
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

	// Multi-selection - some fields might be disabled for mixed types
	if (object.type === 'multi' || object.type === 'mixed') {
		// Could add logic here for multi-selection field restrictions
	}

	// Add more state-based field disabling rules here as needed

	return states;
}

// Derived store for field states based on current display object
export const fieldStates = derived(displayObject, ($displayObject) =>
	getFieldStates($displayObject)
);

// Initialize the bridge to Three.js components
export function initializeModlerBridge(components: any) {
	modlerComponentsBridge = components;

	// Set up initial state sync
	if (components.selectionController) {
		const initialSelection = components.selectionController.getSelectedObjects();
		selectedObjects.set(initialSelection.map(convertThreeObjectToObjectData));
	}

	if (components.sceneController) {
		const allObjects = components.sceneController.getAllObjects();
		objectHierarchy.set(allObjects);
	}
}

// Convert Three.js object to ObjectData for Svelte stores
function convertThreeObjectToObjectData(threeObject: any): ObjectData {
	const userData = threeObject.userData || {};
	const sceneController = modlerComponentsBridge?.sceneController;
	const objectData = sceneController?.getObjectByMesh?.(threeObject);

	return {
		id: userData.id || threeObject.uuid,
		name: objectData?.name || 'Object',
		type: objectData?.type || 'object',
		isContainer: objectData?.isContainer || false,
		position: {
			x: threeObject.position.x,
			y: threeObject.position.y,
			z: threeObject.position.z
		},
		rotation: {
			x: threeObject.rotation.x,
			y: threeObject.rotation.y,
			z: threeObject.rotation.z
		},
		dimensions: objectData?.dimensions || { x: 1, y: 1, z: 1 },
		material: objectData?.material || { color: '#ff0000', opacity: 1 },
		autoLayout: objectData?.autoLayout,
		sizingMode: objectData?.sizingMode,
		parentContainer: objectData?.parentContainer
	};
}

// Update Three.js from Svelte store changes
export function updateThreeJSProperty(objectId: string, property: string, value: any, source: string = 'input') {
	// Check if we're in an iframe - use PostMessage for cross-origin communication
	const isInIframe = window !== window.parent;

	if (isInIframe) {
		// Use PostMessage for iframe communication (secure)
		try {
			window.parent.postMessage({
				type: 'property-update',
				data: { objectId, property, value, source }
			}, '*');
			return;
		} catch (error) {
			console.error('❌ PostMessage property update failed:', error);
			return;
		}
	}

	// Direct access for non-iframe context
	const components = (window as any)?.modlerComponents || modlerComponentsBridge;

	if (!components) {
		console.warn('⚠️ No Three.js components available for property update:', { objectId, property, value });
		return;
	}

	const { sceneController, propertyUpdateHandler } = components;

	// Handle multi-selection updates
	if (objectId === 'multi-selection') {
		// Get current selected objects
		const currentObjects = get(selectedObjects);

		// Update all selected objects directly
		currentObjects.forEach(obj => {
			handleDirectPropertyUpdate(components, obj.id, property, value, source);
		});

		// Update the store for all objects
		selectedObjects.update(objects =>
			objects.map(obj => {
				// Create updated object with nested property support
				const updated = { ...obj };
				const propertyParts = property.split('.');

				if (propertyParts.length === 1) {
					updated[property] = value;
				} else if (propertyParts.length === 2) {
					updated[propertyParts[0]] = {
						...updated[propertyParts[0]],
						[propertyParts[1]]: value
					};
				} else if (propertyParts.length === 3) {
					updated[propertyParts[0]] = {
						...updated[propertyParts[0]],
						[propertyParts[1]]: {
							...updated[propertyParts[0]][propertyParts[1]],
							[propertyParts[2]]: value
						}
					};
				}

				return updated;
			})
		);

		return;
	}

	// Single object update - handle directly with Three.js scene
	handleDirectPropertyUpdate(components, objectId, property, value, source);

	// Update the store to reflect the change with nested property support
	selectedObjects.update(objects =>
		objects.map(obj => {
			if (obj.id !== objectId) return obj;

			// Create updated object with nested property support
			const updated = { ...obj };
			const propertyParts = property.split('.');

			if (propertyParts.length === 1) {
				updated[property] = value;
			} else if (propertyParts.length === 2) {
				updated[propertyParts[0]] = {
					...updated[propertyParts[0]],
					[propertyParts[1]]: value
				};
			} else if (propertyParts.length === 3) {
				updated[propertyParts[0]] = {
					...updated[propertyParts[0]],
					[propertyParts[1]]: {
						...updated[propertyParts[0]][propertyParts[1]],
						[propertyParts[2]]: value
					}
				};
			}

			return updated;
		})
	);
}

// Sync Three.js selection changes to Svelte stores
export function syncSelectionFromThreeJS(selectedThreeObjects: any[]) {
	const objectDataArray = selectedThreeObjects.map(convertThreeObjectToObjectData);
	selectedObjects.set(objectDataArray);
}

// Sync object hierarchy from Three.js
export function syncHierarchyFromThreeJS(allObjects: ObjectData[]) {
	objectHierarchy.set(allObjects);
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
	const meshSynchronizer = components.meshSynchronizer;

	if (meshSynchronizer) {
		meshSynchronizer.syncAllRelatedMeshes(mesh, changeType, immediateVisuals);
	} else if ((window as any).CameraMathUtils) {
		// Fallback to legacy sync method
		(window as any).CameraMathUtils.syncSelectionWireframes(mesh);
	}

	// Notify centralized system for bidirectional property panel synchronization
	if ((window as any).notifyObjectModified) {
		(window as any).notifyObjectModified(mesh, changeType);
	}
}