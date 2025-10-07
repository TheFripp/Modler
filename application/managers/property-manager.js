// Modler V2 - Property Manager
// LEGACY: Delegates to PropertyUpdateHandler for all fill functionality
// Kept for backward compatibility with existing code

class PropertyManager {
    constructor() {
        this.initialized = false;
    }

    /**
     * Initialize with required components
     */
    initialize() {
        this.initialized = true;
    }

    /**
     * Check if object has fill enabled for specific axis
     * DELEGATES to PropertyUpdateHandler
     */
    isAxisFilled(objectId, axis) {
        const propertyUpdateHandler = window.modlerComponents?.propertyUpdateHandler;
        if (!propertyUpdateHandler) {
            console.warn('PropertyManager: PropertyUpdateHandler not available');
            return false;
        }
        return propertyUpdateHandler.isAxisFilled(objectId, axis);
    }

    /**
     * Check if object is in a layout-enabled container
     * DELEGATES to PropertyUpdateHandler
     */
    isInLayoutContainer(objectId) {
        const propertyUpdateHandler = window.modlerComponents?.propertyUpdateHandler;
        if (!propertyUpdateHandler) {
            console.warn('PropertyManager: PropertyUpdateHandler not available');
            return false;
        }
        return propertyUpdateHandler.isInLayoutContainer(objectId);
    }

    /**
     * Toggle fill property for an axis
     * DELEGATES to PropertyUpdateHandler
     */
    toggleFillProperty(axis) {
        const propertyUpdateHandler = window.modlerComponents?.propertyUpdateHandler;
        if (!propertyUpdateHandler) {
            console.warn('PropertyManager: PropertyUpdateHandler not available');
            return;
        }
        propertyUpdateHandler.toggleFillProperty(axis);
    }
}

// Export for use in application
window.PropertyManager = PropertyManager;