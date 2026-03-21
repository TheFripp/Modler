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
            this.originalContainerMode = containerData.containerMode;

            // CRITICAL: Capture child positions BEFORE layout activation
            // This allows proper restoration when undoing layout mode
            const childIds = sceneController.getChildObjects(this.containerId);
            childIds.forEach(childData => {
                if (childData.mesh && childData.position) {
                    this.childPositionSnapshots.set(childData.id, {
                        x: childData.position.x,
                        y: childData.position.y,
                        z: childData.position.z
                    });
                }
            });

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
                this.newContainerMode = updatedContainerData.containerMode;

                console.log(`✅ UpdateLayoutPropertyCommand executed: ${this.description}`, {
                    property: this.property,
                    oldValue: this.oldValue,
                    newValue: this.newValue,
                    childrenCaptured: this.childPositionSnapshots.size
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
            const objectStateManager = window.modlerComponents?.objectStateManager;

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

            // Step 1: Restore original layout state and container mode
            if (this.originalLayoutState) {
                containerData.autoLayout = JSON.parse(JSON.stringify(this.originalLayoutState));
            }
            if (this.originalContainerMode) {
                Object.assign(containerData, ObjectStateManager.buildContainerModeUpdate(this.originalContainerMode));
            }

            // Step 2: Restore child positions if layout is being disabled
            const layoutNowEnabled = containerData.containerMode === 'layout';

            if (!layoutNowEnabled && this.childPositionSnapshots.size > 0) {
                // Layout is being disabled - restore manual positions
                console.log(`Restoring ${this.childPositionSnapshots.size} child positions (layout disabled)`);

                this.childPositionSnapshots.forEach((position, childId) => {
                    if (objectStateManager) {
                        objectStateManager.updateObject(childId, {
                            position: position
                        });
                    } else {
                        const childData = sceneController.getObject(childId);
                        if (childData && childData.mesh) {
                            childData.mesh.position.set(position.x, position.y, position.z);
                            childData.position = { ...position };
                        }
                    }
                });
            }

            // Step 3: Apply layout if it was enabled
            if (layoutNowEnabled) {
                const layoutResult = sceneController.updateContainerLayout(this.containerId);
                if (!layoutResult || !layoutResult.success) {
                    console.warn('UpdateLayoutPropertyCommand: Layout update failed during undo');
                }
            }

            // Step 4: Trigger unified state updates
            if (objectStateManager) {
                objectStateManager.updateObject(this.containerId, {
                    layout: containerData.autoLayout
                });
            }

            console.log(`↩️ UpdateLayoutPropertyCommand undone: ${this.description}`, {
                property: this.property,
                restoredValue: this.oldValue,
                childrenRestored: !layoutNowEnabled ? this.childPositionSnapshots.size : 0
            });
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

            if (!sceneController) {
                console.error('UpdateLayoutPropertyCommand: SceneController not available for redo');
                return false;
            }

            // Get container data
            const containerData = sceneController.getObject(this.containerId);
            if (!containerData || !containerData.isContainer) {
                console.error('UpdateLayoutPropertyCommand: Container not found for redo');
                return false;
            }

            // Restore the new layout state and container mode (from execute)
            if (this.newLayoutState) {
                containerData.autoLayout = JSON.parse(JSON.stringify(this.newLayoutState));
            }
            if (this.newContainerMode) {
                Object.assign(containerData, ObjectStateManager.buildContainerModeUpdate(this.newContainerMode));
            }

            // Check if layout is now enabled
            const layoutNowEnabled = containerData.containerMode === 'layout';

            // Apply layout if enabled
            if (layoutNowEnabled) {
                const layoutResult = sceneController.updateContainerLayout(this.containerId);
                if (!layoutResult || !layoutResult.success) {
                    console.warn('UpdateLayoutPropertyCommand: Layout update failed during redo');
                }
            }

            // Trigger unified state updates
            if (objectStateManager) {
                objectStateManager.updateObject(this.containerId, {
                    layout: containerData.autoLayout
                });
            }

            console.log(`↪️ UpdateLayoutPropertyCommand redone: ${this.description}`, {
                property: this.property,
                restoredValue: this.newValue
            });
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