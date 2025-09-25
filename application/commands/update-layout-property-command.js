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
    }

    /**
     * Execute the layout property change
     */
    execute() {
        try {
            const sceneController = window.modlerComponents?.sceneController;
            const propertyUpdateHandler = window.modlerComponents?.propertyUpdateHandler;

            if (!sceneController || !propertyUpdateHandler) {
                console.error('UpdateLayoutPropertyCommand: Required components not available');
                return false;
            }

            // Get container data
            const containerData = sceneController.getObject(this.containerId);
            if (!containerData || !containerData.isContainer) {
                console.error('UpdateLayoutPropertyCommand: Invalid container');
                return false;
            }

            // Store original layout state before change
            this.originalLayoutState = JSON.parse(JSON.stringify(containerData.autoLayout || {}));

            // Execute the property change using existing handler
            const success = propertyUpdateHandler.handleContainerLayoutPropertyChange(
                this.containerId,
                this.property,
                this.newValue
            );

            if (success) {
                // Store new layout state after change
                const updatedContainerData = sceneController.getObject(this.containerId);
                this.newLayoutState = JSON.parse(JSON.stringify(updatedContainerData.autoLayout || {}));

                console.log(`✅ UpdateLayoutPropertyCommand executed: ${this.description}`, {
                    property: this.property,
                    oldValue: this.oldValue,
                    newValue: this.newValue
                });
                return true;
            } else {
                console.error('UpdateLayoutPropertyCommand: Failed to update layout property');
                return false;
            }

        } catch (error) {
            console.error('UpdateLayoutPropertyCommand execute error:', error);
            return false;
        }
    }

    /**
     * Undo the layout property change
     */
    undo() {
        try {
            const sceneController = window.modlerComponents?.sceneController;

            if (!sceneController) {
                console.error('UpdateLayoutPropertyCommand: SceneController not available for undo');
                return false;
            }

            // Get container data
            const containerData = sceneController.getObject(this.containerId);
            if (!containerData || !containerData.isContainer) {
                console.error('UpdateLayoutPropertyCommand: Container not found for undo');
                return false;
            }

            // Restore original layout state
            if (this.originalLayoutState) {
                containerData.autoLayout = JSON.parse(JSON.stringify(this.originalLayoutState));
            }

            // Apply the restored layout (if layout was enabled)
            if (containerData.autoLayout && containerData.autoLayout.enabled) {
                const layoutResult = sceneController.updateContainerLayout(this.containerId);
                if (!layoutResult || !layoutResult.success) {
                    console.warn('UpdateLayoutPropertyCommand: Layout update failed during undo');
                }
            }

            // Trigger UI updates
            if (window.modlerComponents?.propertyManager) {
                window.modlerComponents.propertyManager.notifyObjectModified(containerData);
            }

            console.log(`↩️ UpdateLayoutPropertyCommand undone: ${this.description}`, {
                property: this.property,
                restoredValue: this.oldValue
            });
            return true;

        } catch (error) {
            console.error('UpdateLayoutPropertyCommand undo error:', error);
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
    }
}

// Export for use in main application
window.UpdateLayoutPropertyCommand = UpdateLayoutPropertyCommand;