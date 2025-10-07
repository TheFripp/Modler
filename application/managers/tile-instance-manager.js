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

        // Listen for hierarchy changes (autoLayout property changes emit HIERARCHY events)
        if (this.objectEventBus) {
            this.objectEventBus.subscribe(this.objectEventBus.EVENT_TYPES.HIERARCHY, (event) => {
                this.handleHierarchyChange(event);
            });
        }
    }

    /**
     * Handle hierarchy changes - watch for tileMode.repeat changes
     */
    handleHierarchyChange(event) {
        const { objectId, changeData } = event;

        // Get the container object to check for tileMode changes
        const container = this.sceneController?.getObject(objectId);
        if (!container || !container.autoLayout?.tileMode?.enabled) {
            return;
        }

        // Check if repeat count changed by comparing with tracked state
        const currentRepeat = container.autoLayout.tileMode.repeat;
        const trackedRepeat = this.trackedRepeats?.get(objectId);

        if (trackedRepeat !== undefined && currentRepeat !== trackedRepeat) {
            this.updateTileInstances(objectId, currentRepeat, trackedRepeat);
        }

        // Track current repeat count for future comparisons
        if (!this.trackedRepeats) {
            this.trackedRepeats = new Map();
        }
        this.trackedRepeats.set(objectId, currentRepeat);
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
        if (this.sceneController) {
            this.sceneController.updateLayout(containerId);
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
