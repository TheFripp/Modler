// Modler V2 - Property Manager
// Handles property updates for objects including fill functionality

class PropertyManager {
    constructor() {
        this.initialized = false;

        // Component references
        this.sceneController = null;
        this.selectionController = null;
        this.layoutEngine = null;
        this.historyManager = null;

        // Property update throttling
        this.updateThrottles = new Map();
        this.throttleDelay = 100; // ms
    }

    /**
     * Initialize with required components
     */
    initialize() {
        this.sceneController = window.modlerComponents?.sceneController;
        this.selectionController = window.modlerComponents?.selectionController;
        this.layoutEngine = window.LayoutEngine || null;
        this.historyManager = window.modlerComponents?.historyManager;

        this.initialized = true;
        console.log('✅ PropertyManager initialized');
    }

    /**
     * Check if object has fill enabled for specific axis
     * @param {string} objectId - Object ID
     * @param {string} axis - 'x', 'y', or 'z'
     * @returns {boolean} True if fill is enabled
     */
    isAxisFilled(objectId, axis) {
        if (!this.sceneController) return false;

        const objectData = this.sceneController.getObject(objectId);
        if (!objectData || !objectData.layoutProperties) return false;

        const sizeProperty = `size${axis.toUpperCase()}`;
        return objectData.layoutProperties[sizeProperty] === 'fill';
    }

    /**
     * Check if object is in a layout-enabled container
     * @param {string} objectId - Object ID
     * @returns {boolean} True if in layout container
     */
    isInLayoutContainer(objectId) {
        if (!this.sceneController) return false;

        const objectData = this.sceneController.getObject(objectId);
        if (!objectData || !objectData.parentContainer) return false;

        const container = this.sceneController.getObject(objectData.parentContainer);
        return container && container.autoLayout && container.autoLayout.enabled;
    }

    /**
     * Toggle fill property for an axis
     * @param {string} axis - 'x', 'y', or 'z'
     */
    toggleFillProperty(axis) {
        if (!this.initialized) return;

        const selectedObjects = this.selectionController?.getSelectedObjects();
        if (!selectedObjects || selectedObjects.length === 0) return;

        const mesh = selectedObjects[0]; // Handle first selected object
        if (!mesh.userData?.id) return;

        const objectData = this.sceneController?.getObject(mesh.userData.id);
        if (!objectData) return;

        // Check if object is in a layout container
        if (!objectData.parentContainer) {
            console.warn('PropertyManager: Object is not in a container, cannot toggle fill');
            return;
        }

        const container = this.sceneController.getObject(objectData.parentContainer);
        if (!container || !container.autoLayout || !container.autoLayout.enabled) {
            console.warn('PropertyManager: Parent container does not have layout enabled');
            return;
        }

        // Initialize layoutProperties if needed
        if (!objectData.layoutProperties) {
            objectData.layoutProperties = {
                sizeX: 'fixed',
                sizeY: 'fixed',
                sizeZ: 'fixed'
            };
        }

        // Toggle fill state for the axis
        const sizeProperty = `size${axis.toUpperCase()}`;
        const currentState = objectData.layoutProperties[sizeProperty];
        const newState = currentState === 'fill' ? 'fixed' : 'fill';

        objectData.layoutProperties[sizeProperty] = newState;

        console.log(`PropertyManager: Toggled ${axis}-axis fill to ${newState} for object ${objectData.name}`);

        // Apply layout update
        if (this.sceneController) {
            this.sceneController.updateLayout(container.id);
        }

        // Update property panel display
        if (window.updatePropertyPanelFromObject) {
            window.updatePropertyPanelFromObject(mesh);
        }

        // Support meshes are now self-contained children - no sync needed

        // Notify SceneController
        this.sceneController.notifyObjectModified(objectData.id);

        // Trigger property panel refresh for all affected objects
        this.refreshLayoutPropertyPanels(container);
    }

    /**
     * Refresh property panels for all objects in a container when layout changes
     * @param {Object} container - Container data
     */
    refreshLayoutPropertyPanels(container) {
        if (!container || !this.sceneController) return;

        const children = this.sceneController.getChildren(container.id);
        if (!children || children.length === 0) return;

        // Refresh property panel if any child is currently selected
        const selectedObjects = this.selectionController?.getSelectedObjects();
        if (!selectedObjects || selectedObjects.length === 0) return;

        const selectedIds = selectedObjects.map(mesh => mesh.userData?.id).filter(Boolean);
        const shouldRefresh = children.some(child => selectedIds.includes(child.id));

        if (shouldRefresh) {
            // Trigger property panel update
            setTimeout(() => {
                if (window.updatePropertyPanelFromObject) {
                    window.updatePropertyPanelFromObject(selectedObjects[0]);
                }
            }, 100); // Small delay to allow layout calculations to complete
        }
    }
}

// Export for use in application
window.PropertyManager = PropertyManager;