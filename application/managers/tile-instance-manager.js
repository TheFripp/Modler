/**
 * Tile Instance Manager
 * Manages tiled object instances - adds/removes instances when repeat count changes
 */

class TileInstanceManager {
    constructor() {
        this.sceneController = null;
        this.objectStateManager = null;
        this.objectEventBus = null;

        // Track instances by container ID
        this.tileInstances = new Map(); // containerId -> [instanceIds...]
    }

    initialize() {
        this.sceneController = window.modlerComponents?.sceneController;
        this.objectStateManager = window.modlerComponents?.objectStateManager;
        this.objectEventBus = window.objectEventBus;

        // Listen for property changes
        if (this.objectEventBus) {
            this.objectEventBus.subscribe('object:property-change', (event) => {
                this.handlePropertyChange(event.data);
            });
        }
    }

    /**
     * Handle property changes - watch for tileMode.repeat changes
     */
    handlePropertyChange(data) {
        const { objectId, property, value, oldValue } = data;

        // Check if this is a repeat count change for a tiled container
        if (property === 'autoLayout.tileMode.repeat') {
            this.updateTileInstances(objectId, value, oldValue);
        }
    }

    /**
     * Update tile instances when repeat count changes
     */
    updateTileInstances(containerId, newRepeat, oldRepeat) {
        if (!this.sceneController) return;

        const container = this.sceneController.getObject(containerId);
        if (!container || !container.autoLayout?.tileMode?.enabled) {
            return;
        }

        const sourceObjectId = container.autoLayout.tileMode.sourceObjectId;
        if (!sourceObjectId) return;

        // Get all children of the container
        const children = this.sceneController.getAllObjects()
            .filter(obj => obj.parentContainer === containerId);

        const currentCount = children.length;
        const targetCount = parseInt(newRepeat);

        if (targetCount > currentCount) {
            // Add more instances
            this.addInstances(containerId, sourceObjectId, targetCount - currentCount);
        } else if (targetCount < currentCount) {
            // Remove instances (keep the first one, remove from the end)
            this.removeInstances(children, currentCount - targetCount);
        }

        // Trigger layout recalculation
        if (this.objectStateManager) {
            this.objectStateManager.notifyLayoutChange(containerId);
        }
    }

    /**
     * Add new tile instances
     */
    addInstances(containerId, sourceObjectId, count) {
        if (!this.sceneController) return;

        const sourceObject = this.sceneController.getObject(sourceObjectId);
        if (!sourceObject) return;

        for (let i = 0; i < count; i++) {
            // Clone geometry and material
            const clonedGeometry = sourceObject.mesh.geometry.clone();
            const clonedMaterial = sourceObject.mesh.material.clone();

            // Create new instance
            this.sceneController.addObject(clonedGeometry, clonedMaterial, {
                name: sourceObject.name,
                parentContainer: containerId,
                position: { x: 0, y: 0, z: 0 }
            });
        }
    }

    /**
     * Remove tile instances from the end
     */
    removeInstances(children, count) {
        if (!this.sceneController || count <= 0) return;

        // Sort children to ensure consistent removal (by ID or creation order)
        const sortedChildren = children.sort((a, b) => {
            if (typeof a.id === 'number' && typeof b.id === 'number') {
                return b.id - a.id; // Remove highest IDs first (newest)
            }
            return 0;
        });

        // Remove from the end, but keep at least the first child (master)
        const toRemove = sortedChildren.slice(0, Math.min(count, children.length - 1));

        toRemove.forEach(child => {
            this.sceneController.removeObject(child.id);
        });
    }
}

// Create singleton instance
const tileInstanceManager = new TileInstanceManager();

// Make available globally
window.TileInstanceManager = TileInstanceManager;
window.tileInstanceManager = tileInstanceManager;

// Register with modlerComponents if available
if (window.modlerComponents) {
    window.modlerComponents.tileInstanceManager = tileInstanceManager;
}
