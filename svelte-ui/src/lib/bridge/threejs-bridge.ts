import {
	initializeModlerBridge,
	syncSelectionFromThreeJS,
	syncHierarchyFromThreeJS,
	syncContainerContextFromThreeJS,
	toolState
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
	if (components.sceneController) {
		// Listen to SceneController events for object creation/deletion
		components.sceneController.on('objectAdded', (objectData: any) => {
			syncHierarchyFromSceneController(components.sceneController);
		});

		components.sceneController.on('objectRemoved', (objectData: any) => {
			syncHierarchyFromSceneController(components.sceneController);
		});

		// Hook into existing notification methods for backward compatibility
		const originalNotifyHierarchyChanged = (window as any).notifyObjectHierarchyChanged;
		(window as any).notifyObjectHierarchyChanged = () => {
			if (originalNotifyHierarchyChanged) {
				originalNotifyHierarchyChanged();
			}
			syncHierarchyFromSceneController(components.sceneController);
		};

		// Initial sync
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
	// For iframe context, use PostMessage
	const isInIframe = window !== window.parent;

	if (isInIframe) {
		try {
			window.parent.postMessage({
				type: 'tool-activation',
				data: { toolName }
			}, '*');
		} catch (error) {
			console.error('❌ Tool activation PostMessage failed:', error);
		}
		return;
	}

	// Non-iframe mode: try direct access
	try {
		if ((window as any)?.activateTool) {
			(window as any).activateTool(toolName);
			return;
		}
	} catch (error) {
		console.error('❌ Direct tool activation failed:', error);
	}

	console.error('❌ No tool activation method available');
}

/**
 * Send snap toggle command to main application
 */
export function toggleSnapInScene() {
	// For iframe context, use PostMessage
	const isInIframe = window !== window.parent;

	if (isInIframe) {
		try {
			window.parent.postMessage({
				type: 'snap-toggle',
				data: {}
			}, '*');
		} catch (error) {
			console.error('❌ Snap toggle PostMessage failed:', error);
		}
		return;
	}

	// Non-iframe mode: try direct access
	try {
		if ((window as any)?.toggleSnapping) {
			(window as any).toggleSnapping();
			return;
		}
	} catch (error) {
		console.error('❌ Direct snap toggle failed:', error);
	}

	console.error('❌ No snap toggle method available');
}

/**
 * Setup PostMessage fallback for iframe communication
 */
function setupPostMessageFallback() {
	window.addEventListener('message', (event) => {
		// PostMessage received from main application

		// Verify origin for security (allow any localhost port for development)
		if (!event.origin.startsWith('http://localhost:')) {
			return;
		}

		// Handle both old and new message formats
		if (event.data && event.data.type) {

			try {
				if (event.data.type === 'data-update') {
					// New integration format - data is in event.data.data
					// Handling data-update message
					handleDataUpdate(event.data.data);
				} else if (event.data.type === 'modler-data') {
					// Legacy format - data is in event.data.data
					// Handling modler-data message
					handleModlerData(event.data.data);
				} else if (event.data.type === 'tool-state-update') {
					// Direct tool state update message
					syncToolStateFromIframe(event.data.data.toolState);
				}
			} catch (error) {
				console.error('❌ Error processing message:', error);
			}
		} else {
			// Message has no type or data
		}
	});
}

/**
 * Handle data update from new integration system
 */
function handleDataUpdate(data: any) {
	// Processing data update from main application

	// Update selection store
	if (data.selectedObjects) {
		// Syncing selection with objects
		syncSelectionFromIframe(data.selectedObjects);
	}

	// Update hierarchy store - for scene-objects updates, use selectedObjects as hierarchy
	if (data.updateType === 'scene-objects' && data.selectedObjects) {
		// Syncing hierarchy (scene-objects)
		syncHierarchyFromIframe(data.selectedObjects);
	}

	// Also sync hierarchy for manual-test updates
	if (data.updateType === 'manual-test' && data.selectedObjects) {
		// Syncing hierarchy (manual-test)
		syncHierarchyFromIframe(data.selectedObjects);
	}

	// Handle communication test
	if (data.updateType === 'communication-test' && data.selectedObjects) {
		// Communication test successful
		syncHierarchyFromIframe(data.selectedObjects);
	}

	// Update container context
	if (data.hasOwnProperty('containerContext')) {
		syncContainerContextFromIframe(data.containerContext);
	}

	// Update tool state
	if (data.toolState) {
		syncToolStateFromIframe(data.toolState);
	}
}

/**
 * Handle data received from the main application (legacy format)
 */
function handleModlerData(data: any) {
	// Process modler data silently

	if (data.type === 'selection-change' || data.type === 'initial-state' || data.type === 'object-modified' || data.type === 'data-update' || data.type === 'periodic-update' || data.type === 'panel-ready') {
		// Handle selection updates
		if (data.selectedObjects) {
			syncSelectionFromIframe(data.selectedObjects);
		}

		// Handle hierarchy updates (now included in unified data)
		if (data.objectHierarchy) {
			syncHierarchyFromIframe(data.objectHierarchy);
		}

		// Handle tool state updates (included in unified data)
		if (data.toolState) {
			syncToolStateFromIframe(data.toolState);
		}

		// Handle container context updates (included in unified data)
		if (data.hasOwnProperty('containerContext')) {
			syncContainerContextFromIframe(data.containerContext);
		}
	} else if (data.type === 'hierarchy-changed') {
		// Handle standalone hierarchy updates
		syncHierarchyFromIframe(data.objectHierarchy || []);
	} else if (data.type === 'tool-state-update') {
		// Handle standalone tool state updates
		console.log('🔧 Bridge: Received tool-state-update message:', data);
		syncToolStateFromIframe(data.toolState);
	}
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
	// Updating hierarchy store
	// Import and update the object hierarchy store
	import('$lib/stores/modler').then(({ objectHierarchy }) => {
		objectHierarchy.set(hierarchyObjects);
		// Hierarchy store updated successfully
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