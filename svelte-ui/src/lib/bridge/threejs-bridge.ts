import {
	initializeModlerBridge,
	syncSelectionFromThreeJS,
	syncHierarchyFromThreeJS,
	toolState
} from '$lib/stores/modler';

/**
 * Bridge class to connect Three.js Modler components with Svelte UI
 * Handles bidirectional communication and state synchronization
 */
export class ThreeJSBridge {
	private modlerComponents: any = null;
	private initialized = false;

	/**
	 * Initialize the bridge with Three.js components
	 */
	initialize(components: any) {
		this.modlerComponents = components;
		this.setupEventListeners();
		initializeModlerBridge(components);
		this.initialized = true;
	}

	/**
	 * Set up event listeners for Three.js events
	 */
	private setupEventListeners() {
		if (!this.modlerComponents) return;

		// Listen for selection changes
		if (this.modlerComponents.selectionController) {
			// Set the callback property (not a method call)
			this.modlerComponents.selectionController.selectionChangeCallback = (selectedObjects: any[]) => {
				// Sync to Svelte stores
				syncSelectionFromThreeJS(selectedObjects);
			};
		}

		// Listen for tool changes
		if (this.modlerComponents.toolController) {
			const originalSetActiveTool = this.modlerComponents.toolController.setActiveTool;

			this.modlerComponents.toolController.setActiveTool = (toolName: string) => {
				// Call original handler first
				if (originalSetActiveTool) {
					originalSetActiveTool.call(this.modlerComponents.toolController, toolName);
				}

				// Update Svelte store
				toolState.update(state => ({
					...state,
					activeTool: toolName as any
				}));
			};
		}

		// Listen for snap toggle changes
		if (this.modlerComponents.snapController) {
			const originalToggleSnap = this.modlerComponents.snapController.toggle;

			this.modlerComponents.snapController.toggle = () => {
				// Call original handler first
				if (originalToggleSnap) {
					originalToggleSnap.call(this.modlerComponents.snapController);
				}

				// Update Svelte store
				toolState.update(state => ({
					...state,
					snapEnabled: this.modlerComponents.snapController.enabled
				}));
			};
		}

		// Listen for object hierarchy changes
		if (this.modlerComponents.sceneController) {
			const originalNotifyObjectAdded = this.modlerComponents.sceneController.notifyObjectAdded;
			const originalNotifyObjectRemoved = this.modlerComponents.sceneController.notifyObjectRemoved;

			this.modlerComponents.sceneController.notifyObjectAdded = (objectData: any) => {
				// Call original handler first
				if (originalNotifyObjectAdded) {
					originalNotifyObjectAdded.call(this.modlerComponents.sceneController, objectData);
				}

				// Sync hierarchy to Svelte
				this.syncHierarchy();
			};

			this.modlerComponents.sceneController.notifyObjectRemoved = (objectId: string) => {
				// Call original handler first
				if (originalNotifyObjectRemoved) {
					originalNotifyObjectRemoved.call(this.modlerComponents.sceneController, objectId);
				}

				// Sync hierarchy to Svelte
				this.syncHierarchy();
			};
		}
	}

	/**
	 * Sync the object hierarchy from Three.js to Svelte
	 */
	private syncHierarchy() {
		if (!this.modlerComponents?.sceneController) return;

		const allObjects = this.modlerComponents.sceneController.getAllObjects();
		syncHierarchyFromThreeJS(allObjects);
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
 * Listens for postMessage data from the parent window
 */
export function initializeBridge() {
	// Check if we're in an iframe
	const isInIframe = window !== window.parent;

	if (isInIframe) {

		// Listen for messages from parent window
		window.addEventListener('message', (event) => {
			// Verify origin for security (allow any localhost port for development)
			if (!event.origin.startsWith('http://localhost:')) {
				return;
			}

			if (event.data && event.data.type === 'modler-data') {
				handleModlerData(event.data.data);
			}
		});

	} else {
		const checkComponents = () => {
			if (typeof window !== 'undefined' && (window as any).modlerComponents) {
				bridge.initialize((window as any).modlerComponents);
				return true;
			}
			return false;
		};

		// Try immediately
		if (checkComponents()) {
			return;
		}

		// Poll for components if not immediately available
		const pollInterval = setInterval(() => {
			if (checkComponents()) {
				clearInterval(pollInterval);
			}
		}, 100);

		// Stop polling after 10 seconds
		setTimeout(() => {
			clearInterval(pollInterval);
		}, 10000);
	}
}

/**
 * Handle data received from the main application
 */
function handleModlerData(data: any) {
	if (data.type === 'selection-change' || data.type === 'initial-state' || data.type === 'object-modified' || data.type === 'data-update') {
		// Handle selection updates
		if (data.selectedObjects) {
			syncSelectionFromIframe(data.selectedObjects);
		}

		// Handle hierarchy updates (now included in unified data)
		if (data.objectHierarchy) {
			syncHierarchyFromIframe(data.objectHierarchy);
		}
	} else if (data.type === 'hierarchy-changed') {
		// Handle standalone hierarchy updates
		syncHierarchyFromIframe(data.objectHierarchy || []);
	}
}

/**
 * Sync selection data that's already serialized from iframe integration
 */
function syncSelectionFromIframe(serializedObjects: any[]) {
	// Import and update the store
	import('$lib/stores/modler').then(({ selectedObjects }) => {
		selectedObjects.set(serializedObjects);
	}).catch(error => {
		// Store import failed
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
		// Hierarchy store import failed
	});
}