/**
 * Tile Instance Manager
 * Manages tiled object instances - adds/removes instances when repeat count changes
 * Uses simple child-count-vs-repeat comparison (no tracking state needed)
 */

class TileInstanceManager {
    constructor() {
        this.sceneController = null;
        this.objectStateManager = null;
        this.objectEventBus = null;

        // Re-entrancy guard: prevents cascading during add/remove
        this._updatingInstances = false;
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
     * Handle hierarchy changes - sync tile instances when repeat doesn't match children count
     * No tracking needed — just compare actual state every time
     */
    handleHierarchyChange(event) {
        // Guard against re-entrant calls (addObject/removeObject trigger hierarchy events)
        if (this._updatingInstances) return;

        const container = this.sceneController?.getObject(event.objectId);
        if (!container?.autoLayout?.tileMode?.enabled) return;

        const sourceObjectId = container.autoLayout.tileMode.sourceObjectId;
        if (!sourceObjectId) return;

        const targetCount = parseInt(container.autoLayout.tileMode.repeat);
        if (isNaN(targetCount) || targetCount < 1) return;

        // Get actual children count
        const children = this.sceneController.getChildObjects?.(event.objectId) ||
            this.sceneController.getAllObjects().filter(obj => obj.parentContainer === event.objectId);

        // Already in sync — nothing to do
        if (children.length === targetCount) return;

        // Sync instances to match repeat count
        this._updatingInstances = true;
        try {
            if (targetCount > children.length) {
                this.addInstances(event.objectId, sourceObjectId, targetCount - children.length);
            } else {
                this.removeInstances(event.objectId, sourceObjectId, children, children.length - targetCount);
            }
        } finally {
            this._updatingInstances = false;
        }
        // Layout recalculation is handled by the caller (PropertyUpdateHandler or undo/redo command)
    }

    /**
     * Handle geometry/material changes — sync across all tile instances.
     * INTENTIONALLY NOT wrapped in a command: this is a derivative effect.
     * When the source property change is undone, the event bus re-triggers
     * this sync automatically, so siblings revert naturally.
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

        // Sync dimensions and material from changed object to all siblings
        // Read source dimensions through DimensionManager (geometry is truth)
        const dimensionManager = window.dimensionManager;
        const sourceDims = dimensionManager?.getDimensions(changedObj.mesh);

        for (const sibling of siblings) {
            const updates = {};

            // Sync dimensions via DimensionManager (proper CAD geometry channel)
            if (sourceDims && dimensionManager) {
                dimensionManager.setDimensions(sibling.mesh, sourceDims, 'center');
                updates.dimensions = { ...sourceDims };
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
     * Add new tile instances cloned from source object
     */
    addInstances(containerId, sourceObjectId, count) {
        if (!this.sceneController) return;

        const sourceObject = this.sceneController.getObject(sourceObjectId);
        if (!sourceObject) return;

        // Copy source rotation (convert radians → degrees for addObject)
        const sourceRotation = {
            x: (sourceObject.mesh.rotation.x * 180) / Math.PI,
            y: (sourceObject.mesh.rotation.y * 180) / Math.PI,
            z: (sourceObject.mesh.rotation.z * 180) / Math.PI
        };

        for (let i = 0; i < count; i++) {
            const clonedGeometry = sourceObject.mesh.geometry.clone();
            const clonedMaterial = sourceObject.mesh.material.clone();

            this.sceneController.addObject(clonedGeometry, clonedMaterial, {
                name: sourceObject.name,
                parentContainer: containerId,
                position: { x: 0, y: 0, z: 0 },
                rotation: sourceRotation
            });
        }
    }

    /**
     * Remove tile instances — always preserves the source object
     * Removes from the end of childrenOrder for consistency
     */
    removeInstances(containerId, sourceObjectId, children, count) {
        if (!this.sceneController || count <= 0) return;

        // Never remove the source object
        const removable = children.filter(child => child.id !== sourceObjectId);
        if (removable.length === 0) return;

        // Use container's childrenOrder for consistent removal from the end
        const container = this.sceneController.getObject(containerId);
        const childrenOrder = container?.childrenOrder || [];

        // Sort by position in childrenOrder — remove highest index first (newest)
        removable.sort((a, b) => {
            const idxA = childrenOrder.indexOf(a.id);
            const idxB = childrenOrder.indexOf(b.id);
            // Items not in childrenOrder (-1) should be removed first
            if (idxA === -1 && idxB === -1) return 0;
            if (idxA === -1) return -1;
            if (idxB === -1) return 1;
            return idxB - idxA;
        });

        const toRemove = removable.slice(0, Math.min(count, removable.length));
        for (const child of toRemove) {
            this.sceneController.removeObject(child.id);
        }
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
