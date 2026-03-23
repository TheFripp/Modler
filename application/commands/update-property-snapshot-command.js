/**
 * Update Property Snapshot Command
 * Undoable command for property panel changes using before/after state snapshots.
 * Supports compound updates (e.g., dimension change that also moves position).
 */
class UpdatePropertySnapshotCommand extends BaseCommand {
    /**
     * @param {string} objectId - ID of the object being modified
     * @param {Object} beforeSnapshot - State before the change (nested object matching updateObject format)
     * @param {Object} afterSnapshot - State after the change
     * @param {string} description - Human-readable description
     */
    constructor(objectId, beforeSnapshot, afterSnapshot, description = 'Update property') {
        super('update-property-snapshot', description);
        this.objectId = objectId;
        this.beforeSnapshot = beforeSnapshot;
        this.afterSnapshot = afterSnapshot;
    }

    execute() {
        // Action already happened via PropertyUpdateHandler — this is post-hoc registration
        return true;
    }

    undo() {
        const objectStateManager = window.modlerComponents?.objectStateManager;
        const sceneController = window.modlerComponents?.sceneController;

        if (!objectStateManager) {
            console.error('UpdatePropertySnapshotCommand: ObjectStateManager not available for undo');
            return false;
        }

        try {
            // Check if object still exists
            if (sceneController && !sceneController.getObject(this.objectId)) {
                console.warn('UpdatePropertySnapshotCommand: Object no longer exists:', this.objectId);
                return true; // Object deleted — nothing to undo
            }

            // Skip position/rotation restore if object is now in layout mode but wasn't before
            const snapshot = this._filterLayoutSafeSnapshot(this.beforeSnapshot, sceneController);

            objectStateManager.updateObject(this.objectId, snapshot, {
                source: 'undo',
                immediate: true
            });

            // Trigger parent container layout recalculation if needed
            this._triggerParentLayout(sceneController);

            return true;
        } catch (error) {
            console.error('UpdatePropertySnapshotCommand: Undo failed:', error);
            return false;
        }
    }

    redo() {
        const objectStateManager = window.modlerComponents?.objectStateManager;
        const sceneController = window.modlerComponents?.sceneController;

        if (!objectStateManager) {
            console.error('UpdatePropertySnapshotCommand: ObjectStateManager not available for redo');
            return false;
        }

        try {
            if (sceneController && !sceneController.getObject(this.objectId)) {
                console.warn('UpdatePropertySnapshotCommand: Object no longer exists:', this.objectId);
                return true;
            }

            const snapshot = this._filterLayoutSafeSnapshot(this.afterSnapshot, sceneController);

            objectStateManager.updateObject(this.objectId, snapshot, {
                source: 'redo',
                immediate: true
            });

            this._triggerParentLayout(sceneController);

            return true;
        } catch (error) {
            console.error('UpdatePropertySnapshotCommand: Redo failed:', error);
            return false;
        }
    }

    /**
     * Filter out position/rotation from snapshot if object is now in layout mode
     * (layout system controls position — restoring stale position would fight it)
     */
    _filterLayoutSafeSnapshot(snapshot, sceneController) {
        if (!sceneController || !snapshot) return snapshot;

        const obj = sceneController.getObject(this.objectId);
        if (!obj?.parentContainer) return snapshot;

        const parent = sceneController.getObject(obj.parentContainer);
        const inLayoutMode = parent?.containerMode === 'layout';

        if (!inLayoutMode) return snapshot;

        // Remove position/rotation from snapshot — layout system manages these
        const filtered = { ...snapshot };
        delete filtered.position;
        delete filtered.rotation;

        // If nothing left after filtering, return null to skip the update
        return Object.keys(filtered).length > 0 ? filtered : null;
    }

    /**
     * Trigger parent container layout recalculation after undo/redo
     */
    _triggerParentLayout(sceneController) {
        if (!sceneController) return;

        const obj = sceneController.getObject(this.objectId);
        if (obj?.parentContainer) {
            sceneController.updateContainer(obj.parentContainer);
        }
    }

    getDescription() {
        return this.description;
    }
}

window.UpdatePropertySnapshotCommand = UpdatePropertySnapshotCommand;
