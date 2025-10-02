import {
	initializeModlerBridge,
	syncSelectionFromThreeJS,
	syncHierarchyFromThreeJS,
	syncContainerContextFromThreeJS,
	toolState
} from '$lib/stores/modler';
import { unifiedCommunication } from '$lib/services/unified-communication';

/**
 * Bridge class to connect Three.js Modler components with Svelte UI
 * Simplified version focusing only on essential functionality
 */
export class ThreeJSBridge {
	private modlerComponents: any = null;
	private initialized = false;

	/**
	 * Initialize the bridge with Three.js components
	 */
	initialize(components: any) {
		this.modlerComponents = components;
		initializeModlerBridge(components);
		this.initialized = true;
	}

	/**
	 * Get the initialized status
	 */
	isInitialized(): boolean {
		return this.initialized;
	}

	/**
	 * Get access to Three.js components
	 */
	getComponents(): any {
		return this.modlerComponents;
	}
}

// Global bridge instance
export const bridge = new ThreeJSBridge();

/**
 * Initialize the bridge for iframe-based integration
 * Sets up communication based on context (iframe vs direct)
 */
export function initializeBridge() {
	const isInIframe = window !== window.parent;

	if (isInIframe) {
		// Iframe context: use PostMessage communication only
		setupPostMessageFallback();
		return;
	}

	// Direct context: poll for component availability
	const pollInterval = setInterval(() => {
		try {
			const directComponents = (window as any)?.modlerComponents;
			if (directComponents) {
						bridge.initialize(directComponents);
				setupDirectDataSync(directComponents);
				clearInterval(pollInterval);
			}
		} catch (error) {
			// Continue polling
		}
	}, 100);

	// Stop polling after 2 seconds if components not found
	setTimeout(() => clearInterval(pollInterval), 2000);
}

/**
 * Setup PostMessage fallback for iframe communication
 * Listens for data updates from main application
 */
function setupPostMessageFallback() {
	window.addEventListener('message', (event) => {
		// Verify origin for security (allow any localhost port for development)
		// Also allow 'null' origin when parent page is loaded from file:// protocol
		if (!event.origin.startsWith('http://localhost:') && event.origin !== 'null') {
			console.warn('⚠️ PostMessage rejected - invalid origin:', event.origin);
			return;
		}

		// Handle data-update messages
		if (event.data.type === 'data-update') {
			try {
				const data = event.data.data;

				// Validate data structure
				if (!data || typeof data !== 'object') {
					console.warn('PostMessage: Invalid data structure received');
					return;
				}

				// Handle tool state updates (sent via PropertyPanelSync)
				if (data.updateType === 'tool-state-update') {
					if (data.toolState) {
						const update: any = { activeTool: data.toolState.activeTool };
						if (data.snapEnabled !== undefined) {
							update.snapEnabled = data.snapEnabled;
						}
						toolState.set(update);
					}
					return; // Done processing tool state update
				}

				// Update selected objects in store with error handling
				if (data.selectedObjects) {
					try {
						syncSelectionFromThreeJS(data.selectedObjects);
					} catch (error) {
						console.error('PostMessage: Error syncing selected objects:', error);
					}
				}

				// Update object hierarchy in store with error handling
				if (data.objectHierarchy) {
					try {
						syncHierarchyFromThreeJS(data.objectHierarchy);
					} catch (error) {
						console.error('PostMessage: Error syncing hierarchy:', error);
					}
				}

				// Update container context in store with error handling
				if (data.containerContext) {
					try {
						syncContainerContextFromThreeJS(data.containerContext);
					} catch (error) {
						console.error('PostMessage: Error syncing container context:', error);
					}
				}
			} catch (error) {
				console.error('PostMessage: Critical error processing data-update:', error);
			}
		}

		// Legacy: Handle tool state updates sent directly (backward compatibility)
		else if (event.data.type === 'tool-state-update') {
			// Tool state updates from keyboard shortcuts or direct tool switching
			if (event.data.data && event.data.data.toolState) {
				const update: any = { activeTool: event.data.data.toolState.activeTool };
				if (event.data.data.snapEnabled !== undefined) {
					update.snapEnabled = event.data.data.snapEnabled;
				}
				toolState.set(update);
			}
		}

		// Handle other message types as needed
	});
}

/**
 * Setup direct data synchronization with Three.js components
 * Creates centralized event hub for Scene ↔ UI communication
 */
function setupDirectDataSync(components: any) {
	// === SCENE → UI: Selection Changes ===
	if (components.selectionController) {
		const originalCallback = components.selectionController.selectionChangeCallback;

		components.selectionController.selectionChangeCallback = (selectedObjects: any[]) => {
			// Call original callback if it exists
			if (originalCallback) {
				originalCallback(selectedObjects);
			}

			// Update Svelte stores directly
			syncSelectionFromThreeJS(selectedObjects);
		};
	}

	// === SCENE → UI: Object Hierarchy Changes ===
	// NOTE: LIFECYCLE events (objectAdded/objectRemoved) are now handled by PropertyPanelSync
	// This eliminates duplicate hierarchy syncing
	if (components.sceneController) {
		// Initial sync only
		syncHierarchyFromSceneController(components.sceneController);
	}

	// === UI → SCENE: Object Selection Setup ===
	setupUIToSceneActions(components);
}

/**
 * Sync object hierarchy from SceneController with proper filtering
 */
function syncHierarchyFromSceneController(sceneController: any) {
	try {
		const allObjects = sceneController.getAllObjects();

		// Filter out utility objects (same logic as left panel)
		const filteredObjects = allObjects.filter((obj: any) =>
			obj.name !== 'Floor Grid' &&
			obj.type !== 'grid' &&
			!obj.name?.toLowerCase().includes('grid') &&
			obj.name !== '(Interactive)' &&
			!obj.name?.toLowerCase().includes('interactive')
		);

		syncHierarchyFromThreeJS(filteredObjects);
	} catch (error) {
		console.error('❌ Error syncing hierarchy:', error);
	}
}

/**
 * Setup UI → Scene action handlers for direct communication
 */
function setupUIToSceneActions(components: any) {
	// Make scene selection function globally available for UI
	(window as any).selectObjectInSceneDirectly = (objectId: string) => {
			if (!components.sceneController || !components.selectionController) {
			console.error('❌ Components not available for object selection');
			return false;
		}

		try {
			// Get object from scene
			const objectData = components.sceneController.getObject(objectId);
			if (!objectData) {
				console.error('❌ Object not found:', objectId);
				return false;
			}

			// Clear current selection and select the new object
			components.selectionController.clearSelection();
			components.selectionController.select(objectData.mesh);

			return true;
		} catch (error) {
			console.error('❌ Error selecting object:', error);
			return false;
		}
	};
}

/**
 * Send tool activation command to main application
 */
export function activateToolInScene(toolName: string) {
	// Use unified communication system instead of direct PostMessage
	unifiedCommunication.sendToolActivation(toolName).catch(error => {
		console.error('❌ Tool activation failed:', error);

		// Fallback to direct access if unified communication fails
		try {
			if ((window as any)?.activateTool) {
				(window as any).activateTool(toolName);
				return;
			}
		} catch (fallbackError) {
			console.error('❌ Direct tool activation fallback failed:', fallbackError);
		}
	});
}

/**
 * Send snap toggle command to main application
 */
export function toggleSnapInScene() {
	// Use unified communication system instead of direct PostMessage
	unifiedCommunication.sendSnapToggle().catch(error => {
		console.error('❌ Snap toggle failed:', error);

		// Fallback to direct access if unified communication fails
		try {
			if ((window as any)?.toggleSnapping) {
				(window as any).toggleSnapping();
				return;
			}
		} catch (fallbackError) {
			console.error('❌ Direct snap toggle fallback failed:', fallbackError);
		}
	});
}


/**
 * Handle data update from integration system
 *
 * SIMPLIFIED ARCHITECTURE: Consolidated from 9+ update types to 3 core categories:
 * 1. SELECTION UPDATES - Only affect selectedObjects store, never hierarchy
 * 2. HIERARCHY UPDATES - Only affect objectHierarchy store, never selection
 * 3. TOOL STATE UPDATES - Only affect toolState store
 *
 * This prevents competing updates and ensures single source of truth.
 * Field naming is consistent throughout: always 'parentContainer' not 'parent'.
 */
function handleDataUpdate(data: any) {
	// === CORE UPDATE TYPE 1: SELECTION UPDATES ===
	// Only affects selectedObjects store, never hierarchy
	if (isSelectionUpdate(data.updateType)) {
		syncSelectionFromIframe(data.selectedObjects || []);
		return;
	}

	// === CORE UPDATE TYPE 2: HIERARCHY UPDATES ===
	// Only affects objectHierarchy store, never selection
	if (isHierarchyUpdate(data.updateType)) {
		// Use proper hierarchy data if available, otherwise empty array
		const hierarchyData = data.objectHierarchy || data.selectedObjects || [];
		syncHierarchyFromIframe(hierarchyData);
		return;
	}

	// === CORE UPDATE TYPE 3: TOOL STATE UPDATES ===
	if (data.updateType === 'tool-state-update' && data.toolState) {
		syncToolStateFromIframe(data.toolState);
		return;
	}

	// === ADDITIONAL CONTEXT UPDATES ===
	// Update container context (separate from core types)
	if (data.hasOwnProperty('containerContext')) {
		syncContainerContextFromIframe(data.containerContext);
	}

	// Update tool state (fallback for legacy format)
	if (data.toolState && data.updateType !== 'tool-state-update') {
		syncToolStateFromIframe(data.toolState);
	}
}

/**
 * Determine if update type should only affect selection
 */
function isSelectionUpdate(updateType: string): boolean {
	return [
		'selection-change',
		'legacy-selection',
		'legacy-clear-selection',
		'property-refresh',
		'hierarchy-change-selection' // This should only update selection
	].includes(updateType);
}

/**
 * Determine if update type should only affect hierarchy
 */
function isHierarchyUpdate(updateType: string): boolean {
	return [
		'hierarchy-changed',
		'hierarchy-update',
		// Legacy types being consolidated:
		'scene-objects',
		'manual-test',
		'communication-test',
		'object-list-populate',
		'object-list-clear',
		'initial-sync'
	].includes(updateType);
}


/**
 * Sync selection data that's already serialized from iframe integration
 */
function syncSelectionFromIframe(serializedObjects: any[]) {
	// Updating selection store
	// Import and update the store
	import('$lib/stores/modler').then(({ selectedObjects }) => {
		selectedObjects.set(serializedObjects);
		// Selection store updated successfully
	}).catch(error => {
		console.error('❌ Failed to update selection store:', error);
	});
}

/**
 * Sync object hierarchy data for the left panel
 */
function syncHierarchyFromIframe(hierarchyObjects: any[]) {
	// Import and update the object hierarchy store
	import('$lib/stores/modler').then(({ objectHierarchy }) => {
		objectHierarchy.set(hierarchyObjects);
	}).catch(error => {
		console.error('❌ Failed to update hierarchy store:', error);
	});
}

/**
 * Sync tool state from main application to Svelte store
 */
function syncToolStateFromIframe(toolStateData: any) {
	// Import and update the tool state store
	import('$lib/stores/modler').then(({ toolState }) => {
		toolState.set(toolStateData);
	}).catch(error => {
		console.error('❌ Failed to update tool state store:', error);
	});
}

/**
 * Sync container context from main application to Svelte store
 */
function syncContainerContextFromIframe(containerContextData: any) {
	// Import and update the container context store
	import('$lib/stores/modler').then(({ containerContext }) => {
		containerContext.set(containerContextData);
	}).catch(error => {
		console.error('❌ Failed to update container context store:', error);
	});
}