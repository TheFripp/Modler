import { get } from 'svelte/store';
import {
	initializeModlerBridge,
	syncSelectionFromThreeJS,
	syncHierarchyFromThreeJS,
	addObjectToHierarchy,
	removeObjectFromHierarchy,
	toolState,
	selectedObjects
} from '$lib/stores/modler';
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

	// Direct context: poll for component availability at 60fps
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
	}, 16); // 60fps polling (16ms)

	// Stop polling after 500ms if components not found (reduced from 2s)
	setTimeout(() => clearInterval(pollInterval), 500);
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

		const messageType = event.data.type;
		const data = event.data.data; // SimpleCommunication sends { type: 'foo', data: {...} }

		// SimpleCommunication: Handle specific message types
		switch (messageType) {
			case 'selection-changed':
				// SimpleCommunication sends complete selected objects data
				try {
					if (data && data.selectedObjects) {
						syncSelectionFromThreeJS(data.selectedObjects);
					}
				} catch (error) {
					console.error('PostMessage: Error syncing selection:', error);
				}
				break;

			case 'hierarchy-changed':
				// SimpleCommunication sends complete hierarchy tree
				try {
					if (data && data.hierarchy) {
						syncHierarchyFromThreeJS(data.hierarchy);
					}
				} catch (error) {
					console.error('PostMessage: Error syncing hierarchy:', error);
				}
				break;

			case 'hierarchy-object-added':
				try {
					if (data && data.object) {
						addObjectToHierarchy(data.object, data.rootChildrenOrder);
					}
				} catch (error) {
					console.error('PostMessage: Error adding object to hierarchy:', error);
				}
				break;

			case 'hierarchy-object-removed':
				try {
					if (data && data.objectId) {
						removeObjectFromHierarchy(data.objectId);
					}
				} catch (error) {
					console.error('PostMessage: Error removing object from hierarchy:', error);
				}
				break;

			case 'object-changed':
				// SimpleCommunication sends individual object updates
				// Trigger selection re-sync to update property panel
				try {
					if (data && data.object) {
						const currentSelection = get(selectedObjects);
						if (currentSelection.some((obj: any) => obj.id === data.objectId)) {
							// Updated object is selected, refresh selection to update UI
							const updatedSelection = currentSelection.map((obj: any) =>
								obj.id === data.objectId ? data.object : obj
							);
							syncSelectionFromThreeJS(updatedSelection);
						}
					}
				} catch (error) {
					console.error('PostMessage: Error syncing object change:', error);
				}
				break;

			case 'objects-batch-changed':
				// Batched object updates — apply all at once to minimize Svelte re-renders
				try {
					if (data && data.changes) {
						const currentSelection = get(selectedObjects);
						let selectionDirty = false;
						let updatedSelection = [...currentSelection];

						for (const change of data.changes) {
							if (change.object) {
								const idx = updatedSelection.findIndex((obj: any) => obj.id === change.objectId);
								if (idx !== -1) {
									updatedSelection[idx] = change.object;
									selectionDirty = true;
								}
							}
						}

						if (selectionDirty) {
							syncSelectionFromThreeJS(updatedSelection);
						}
					}
				} catch (error) {
					console.error('PostMessage: Error syncing batched object changes:', error);
				}
				break;

			case 'tool-changed':
				// SimpleCommunication sends tool state changes
				try {
					if (data) {
						const update: any = {};
						if (data.toolName) update.activeTool = data.toolName;
						if (data.toolState?.snapEnabled !== undefined) update.snapEnabled = data.toolState.snapEnabled;
						if (Object.keys(update).length > 0) {
							toolState.set(update);
						}
					}
				} catch (error) {
					console.error('PostMessage: Error syncing tool state:', error);
				}
				break;

			default:
				// Ignore unknown message types
				break;
		}
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
 * Sync object hierarchy from SceneController (initial sync for direct mode)
 * Filtering is handled by SimpleCommunication for iframe mode
 */
function syncHierarchyFromSceneController(sceneController: any) {
	try {
		const allObjects = sceneController.getAllObjects();
		syncHierarchyFromThreeJS(allObjects);
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
	if (window.parent && window.parent !== window) {
		window.parent.postMessage({ type: 'activate-tool', toolId: toolName }, '*');
	}
}

/**
 * Send snap toggle command to main application
 */
export function toggleSnapInScene() {
	if (window.parent && window.parent !== window) {
		window.parent.postMessage({ type: 'snap-toggle' }, '*');
	}
}

/**
 * Send wrap-selection-in-container command to main application
 */
export function wrapSelectionInContainer() {
	if (window.parent && window.parent !== window) {
		window.parent.postMessage({ type: 'wrap-selection-in-container' }, '*');
	}
}


