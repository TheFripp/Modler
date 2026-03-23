// Modler V2 - Update Layout Property Command
// Command pattern implementation for container layout property changes with undo/redo support

class UpdateLayoutPropertyCommand extends BaseCommand {
    constructor(containerId, property, newValue, oldValue) {
        super('update-layout-property', `Update ${property} for container`);

        this.containerId = containerId;
        this.property = property;
        this.newValue = newValue;
        this.oldValue = oldValue;

        // Store original layout state for complex undo scenarios
        this.originalLayoutState = null;
        this.newLayoutState = null;
        this.originalContainerMode = null;
        this.newContainerMode = null;

        // Store child positions before layout changes (for undo)
        this.childPositionSnapshots = new Map();
    }

    /**
     * Execute the layout property change
     * Post-hoc registration: the change already happened via PropertyUpdateHandler.
     * Snapshots (originalLayoutState, newLayoutState, childPositionSnapshots) are
     * populated by CommandRouter before calling historyManager.executeCommand().
     */
    execute() {
        return true;
    }

    /**
     * Undo the layout property change
     */
    undo() {
        try {
            const sceneController = window.modlerComponents?.sceneController;
            const objectStateManager = window.modlerComponents?.objectStateManager;

            if (!sceneController || !objectStateManager) {
                console.error('UpdateLayoutPropertyCommand: Required components not available for undo');
                return false;
            }

            const containerData = sceneController.getObject(this.containerId);
            if (!containerData || !containerData.isContainer) {
                console.error('UpdateLayoutPropertyCommand: Container not found for undo');
                return false;
            }

            // Step 1: Restore original layout state and container mode via ObjectStateManager
            const updates = {};
            if (this.originalLayoutState) {
                updates.autoLayout = JSON.parse(JSON.stringify(this.originalLayoutState));
            }
            if (this.originalContainerMode) {
                Object.assign(updates, ObjectStateManager.buildContainerModeUpdate(this.originalContainerMode));
            }

            objectStateManager.updateObject(this.containerId, updates, {
                source: 'undo',
                immediate: true
            });

            // Step 2: Restore child positions if layout is being disabled
            const layoutNowEnabled = this.originalContainerMode === 'layout';

            if (!layoutNowEnabled && this.childPositionSnapshots.size > 0) {
                this.childPositionSnapshots.forEach((position, childId) => {
                    objectStateManager.updateObject(childId, { position }, {
                        source: 'undo',
                        immediate: true
                    });
                });
            }

            // Step 3: Apply layout if it was enabled
            if (layoutNowEnabled) {
                sceneController.updateContainer(this.containerId);
            }

            return true;

        } catch (error) {
            console.error('UpdateLayoutPropertyCommand undo error:', error);
            return false;
        }
    }

    /**
     * Redo the layout property change
     */
    redo() {
        try {
            const sceneController = window.modlerComponents?.sceneController;
            const objectStateManager = window.modlerComponents?.objectStateManager;

            if (!sceneController || !objectStateManager) {
                console.error('UpdateLayoutPropertyCommand: Required components not available for redo');
                return false;
            }

            const containerData = sceneController.getObject(this.containerId);
            if (!containerData || !containerData.isContainer) {
                console.error('UpdateLayoutPropertyCommand: Container not found for redo');
                return false;
            }

            // Restore new layout state and container mode via ObjectStateManager
            const updates = {};
            if (this.newLayoutState) {
                updates.autoLayout = JSON.parse(JSON.stringify(this.newLayoutState));
            }
            if (this.newContainerMode) {
                Object.assign(updates, ObjectStateManager.buildContainerModeUpdate(this.newContainerMode));
            }

            objectStateManager.updateObject(this.containerId, updates, {
                source: 'redo',
                immediate: true
            });

            // Apply layout if now enabled
            const layoutNowEnabled = this.newContainerMode === 'layout';
            if (layoutNowEnabled) {
                sceneController.updateContainer(this.containerId);
            }

            return true;

        } catch (error) {
            console.error('UpdateLayoutPropertyCommand redo error:', error);
            return false;
        }
    }

    /**
     * Check if this command can be undone
     */
    canUndo() {
        const sceneController = window.modlerComponents?.sceneController;
        if (!sceneController || !this.containerId) {
            return false;
        }

        // Check if container still exists
        const containerData = sceneController.getObject(this.containerId);
        return containerData && containerData.isContainer;
    }

    /**
     * Clean up resources when command is removed from history
     */
    cleanup() {
        this.originalLayoutState = null;
        this.newLayoutState = null;
        this.childPositionSnapshots.clear();
    }
}

// Export for use in main application
window.UpdateLayoutPropertyCommand = UpdateLayoutPropertyCommand;