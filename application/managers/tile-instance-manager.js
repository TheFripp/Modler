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

        if (this.objectEventBus) {
            // Listen for hierarchy changes (autoLayout property changes emit HIERARCHY events)
            this.objectEventBus.subscribe(this.objectEventBus.EVENT_TYPES.HIERARCHY, (event) => {
                this.handleHierarchyChange(event);
            });

            // Listen for geometry/material changes to sync across tile instances
            this.objectEventBus.subscribe(this.objectEventBus.EVENT_TYPES.GEOMETRY, (event) => {
                this.handleInstanceChange(event);
            });
            this.objectEventBus.subscribe(this.objectEventBus.EVENT_TYPES.MATERIAL, (event) => {
                this.handleInstanceChange(event);
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
     * Handle geometry/material changes — sync across all tile instances
     */
    handleInstanceChange(event) {
        const { objectId, changeData } = event;

        // Skip changes originating from tile sync (prevent infinite loop)
        if (changeData?.source === 'tile-sync') return;

        if (!this.sceneController || !this.objectStateManager) return;

        const changedObj = this.sceneController.getObject(objectId);
        if (!changedObj || !changedObj.parentContainer) return;

        // Check if parent is a tiled container
        const container = this.sceneController.getObject(changedObj.parentContainer);
        if (!container?.autoLayout?.tileMode?.enabled) return;

        // Get all sibling children
        const siblings = this.sceneController.getAllObjects()
            .filter(obj => obj.parentContainer === changedObj.parentContainer && obj.id !== objectId);

        if (siblings.length === 0) return;

        // Sync geometry and material from changed object to all siblings
        for (const sibling of siblings) {
            const updates = {};

            // Sync dimensions (geometry)
            if (changedObj.dimensions) {
                // Clone geometry from changed object
                sibling.mesh.geometry.dispose();
                sibling.mesh.geometry = changedObj.mesh.geometry.clone();
                updates.dimensions = { ...changedObj.dimensions };
            }

            // Sync material
            if (changedObj.mesh.material) {
                const srcMat = changedObj.mesh.material;
                sibling.mesh.material.color.copy(srcMat.color);
                sibling.mesh.material.opacity = srcMat.opacity;
                sibling.mesh.material.transparent = srcMat.transparent;
                updates.material = {
                    color: '#' + srcMat.color.getHexString(),
                    opacity: srcMat.opacity,
                    transparent: srcMat.transparent
                };
            }

            if (Object.keys(updates).length > 0) {
                this.objectStateManager.updateObject(sibling.id, updates, {
                    source: 'tile-sync',
                    immediate: true
                });
            }
        }

        // Recalculate layout (dimensions may have changed)
        this.sceneController.updateContainer(changedObj.parentContainer);
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
            this.sceneController.updateContainer(containerId);
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

        // Sort children to ensure consistent removal (newest first via childrenOrder position)
        const sortedChildren = [...children].reverse();

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
