/**
 * Update Tile Repeat Command
 * Undoable command for tile repeat count changes that add/remove child objects.
 * Stores child deltas so undo can reverse instance creation/removal.
 */
class UpdateTileRepeatCommand extends BaseCommand {
    /**
     * @param {Object} params
     * @param {string} params.containerId - Container ID
     * @param {number} params.oldRepeat - Previous repeat count
     * @param {number} params.newRepeat - New repeat count
     * @param {string[]} params.addedChildIds - IDs of children that were added (empty if repeat decreased)
     * @param {Object[]} params.removedChildSnapshots - Snapshots of children that were removed (empty if repeat increased)
     * @param {Object} params.oldAutoLayout - Deep clone of autoLayout before change
     * @param {Object} params.newAutoLayout - Deep clone of autoLayout after change
     */
    constructor(params) {
        super('update-tile-repeat', `Change tile repeat: ${params.oldRepeat} → ${params.newRepeat}`);
        this.containerId = params.containerId;
        this.oldRepeat = params.oldRepeat;
        this.newRepeat = params.newRepeat;
        this.addedChildIds = params.addedChildIds || [];
        this.removedChildSnapshots = params.removedChildSnapshots || [];
        this.oldAutoLayout = params.oldAutoLayout;
        this.newAutoLayout = params.newAutoLayout;
    }

    execute() {
        // Change already happened via PropertyUpdateHandler + TileInstanceManager — post-hoc
        return true;
    }

    undo() {
        try {
            const sceneController = window.modlerComponents?.sceneController;
            const objectStateManager = window.modlerComponents?.objectStateManager;

            if (!sceneController) {
                console.error('UpdateTileRepeatCommand: SceneController not available for undo');
                return false;
            }

            const container = sceneController.getObject(this.containerId);
            if (!container) {
                console.warn('UpdateTileRepeatCommand: Container no longer exists');
                return true;
            }

            // Step 1: If repeat increased, remove the added children
            for (const childId of this.addedChildIds) {
                if (sceneController.getObject(childId)) {
                    sceneController.removeObject(childId);
                }
            }

            // Step 2: If repeat decreased, re-create removed children
            for (const snapshot of this.removedChildSnapshots) {
                this._restoreChild(sceneController, snapshot);
            }

            // Step 3: Restore old autoLayout (with old repeat count)
            if (this.oldAutoLayout && objectStateManager) {
                objectStateManager.updateObject(this.containerId, {
                    autoLayout: JSON.parse(JSON.stringify(this.oldAutoLayout))
                }, { source: 'undo', immediate: true });
            }

            // Step 4: Recalculate layout
            sceneController.updateContainer(this.containerId);

            return true;
        } catch (error) {
            console.error('UpdateTileRepeatCommand: Undo failed:', error);
            return false;
        }
    }

    redo() {
        try {
            const sceneController = window.modlerComponents?.sceneController;
            const objectStateManager = window.modlerComponents?.objectStateManager;

            if (!sceneController) {
                console.error('UpdateTileRepeatCommand: SceneController not available for redo');
                return false;
            }

            const container = sceneController.getObject(this.containerId);
            if (!container) {
                console.warn('UpdateTileRepeatCommand: Container no longer exists');
                return true;
            }

            // Step 1: If repeat decreased (undo re-added children), remove them again
            for (const snapshot of this.removedChildSnapshots) {
                if (sceneController.getObject(snapshot.id)) {
                    sceneController.removeObject(snapshot.id);
                }
            }

            // Step 2: If repeat increased (undo removed children), re-add them
            const sourceObjectId = container.autoLayout?.tileMode?.sourceObjectId;
            const sourceObject = sourceObjectId ? sceneController.getObject(sourceObjectId) : null;

            if (this.addedChildIds.length > 0 && sourceObject) {
                const sourceRotation = {
                    x: (sourceObject.mesh.rotation.x * 180) / Math.PI,
                    y: (sourceObject.mesh.rotation.y * 180) / Math.PI,
                    z: (sourceObject.mesh.rotation.z * 180) / Math.PI
                };

                // Re-create the same number of instances
                const newAddedIds = [];
                for (let i = 0; i < this.addedChildIds.length; i++) {
                    const clonedGeometry = sourceObject.mesh.geometry.clone();
                    const clonedMaterial = sourceObject.mesh.material.clone();

                    const instance = sceneController.addObject(clonedGeometry, clonedMaterial, {
                        name: sourceObject.name,
                        parentContainer: this.containerId,
                        position: { x: 0, y: 0, z: 0 },
                        rotation: sourceRotation
                    });
                    newAddedIds.push(instance.id);
                }
                // Update stored IDs for future undo/redo cycles
                this.addedChildIds = newAddedIds;
            }

            // Step 3: Restore new autoLayout (with new repeat count)
            if (this.newAutoLayout && objectStateManager) {
                objectStateManager.updateObject(this.containerId, {
                    autoLayout: JSON.parse(JSON.stringify(this.newAutoLayout))
                }, { source: 'redo', immediate: true });
            }

            // Step 4: Recalculate layout
            sceneController.updateContainer(this.containerId);

            return true;
        } catch (error) {
            console.error('UpdateTileRepeatCommand: Redo failed:', error);
            return false;
        }
    }

    /**
     * Restore a child from snapshot
     */
    _restoreChild(sceneController, snapshot) {
        if (!snapshot || !snapshot.dimensions) return;

        const sourceObjectId = snapshot.sourceObjectId;
        const sourceObject = sourceObjectId ? sceneController.getObject(sourceObjectId) : null;

        if (sourceObject) {
            const clonedGeometry = sourceObject.mesh.geometry.clone();
            const clonedMaterial = sourceObject.mesh.material.clone();
            const sourceRotation = {
                x: (sourceObject.mesh.rotation.x * 180) / Math.PI,
                y: (sourceObject.mesh.rotation.y * 180) / Math.PI,
                z: (sourceObject.mesh.rotation.z * 180) / Math.PI
            };

            sceneController.addObject(clonedGeometry, clonedMaterial, {
                name: snapshot.name || sourceObject.name,
                parentContainer: this.containerId,
                position: { x: 0, y: 0, z: 0 },
                rotation: sourceRotation
            });
        }
    }

}

window.UpdateTileRepeatCommand = UpdateTileRepeatCommand;
