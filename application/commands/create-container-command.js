// Modler V2 - Create Container Command
// Command pattern implementation for container creation with undo/redo support

class CreateContainerCommand extends BaseCommand {
    constructor(selectedObjects, containerData = null) {
        super('create-container', 'Create container from selection');

        // Store the objects that were selected for container creation
        this.selectedObjects = selectedObjects.slice(); // Copy array
        this.selectedObjectIds = selectedObjects.map(obj => obj.userData?.id).filter(Boolean);

        // Container data - will be populated during execute()
        this.containerData = containerData;
        this.containerId = null;

        // Store original parent relationships for undo
        this.originalParents = {};
        this.originalPositions = {};

        // Store original selection state
        this.originalSelection = selectedObjects.slice();
    }

    /**
     * Execute the container creation
     */
    execute() {
        try {
            const sceneController = window.modlerComponents?.sceneController;
            const containerCrudManager = window.modlerComponents?.containerCrudManager;
            const selectionController = window.modlerComponents?.selectionController;

            if (!sceneController || !containerCrudManager || !selectionController) {
                console.error('CreateContainerCommand: Required components not available');
                return false;
            }

            // Store original parent relationships and positions for undo
            this.selectedObjects.forEach(obj => {
                if (obj.userData?.id) {
                    const objectData = sceneController.getObjectByMesh(obj);
                    if (objectData) {
                        this.originalParents[obj.userData.id] = objectData.parentContainer;
                        this.originalPositions[obj.userData.id] = obj.position.clone();
                    }
                }
            });

            // Create the container using the existing logic
            const containerObject = containerCrudManager.createContainerFromSelection(this.selectedObjects);

            if (containerObject && containerObject.id) {
                this.containerData = containerObject;
                this.containerId = containerObject.id;

                // Select the newly created container
                if (containerObject.mesh) {
                    selectionController.clearSelection();
                    selectionController.select(containerObject.mesh);
                }

                console.log(`✅ CreateContainerCommand executed: ${this.description}`);
                return true;
            } else {
                console.error('CreateContainerCommand: Failed to create container');
                return false;
            }

        } catch (error) {
            console.error('CreateContainerCommand execute error:', error);
            return false;
        }
    }

    /**
     * Undo the container creation
     */
    undo() {
        try {
            const sceneController = window.modlerComponents?.sceneController;
            const selectionController = window.modlerComponents?.selectionController;

            if (!sceneController || !selectionController) {
                console.error('CreateContainerCommand: Required components not available for undo');
                return false;
            }

            if (!this.containerId || !this.containerData) {
                console.error('CreateContainerCommand: No container data to undo');
                return false;
            }

            // Get the container data
            const containerData = sceneController.getObject(this.containerId);
            if (!containerData) {
                console.error('CreateContainerCommand: Container not found for undo');
                return false;
            }

            // Get all child objects from the container
            const children = sceneController.getChildObjects(this.containerId);

            // Restore original parent relationships and positions
            children.forEach(childData => {
                if (childData.mesh && this.originalParents[childData.id] !== undefined) {
                    // CRITICAL: Restore parent relationship FIRST to get back to correct coordinate system
                    const originalParent = this.originalParents[childData.id];
                    if (originalParent) {
                        // Move object back to original parent
                        sceneController.setParentContainer(childData.id, originalParent, false); // Skip layout update
                    } else {
                        // Move object back to root (no parent)
                        sceneController.setParentContainer(childData.id, null, false); // Skip layout update
                    }

                    // THEN restore original world position (now that coordinate system is correct)
                    if (this.originalPositions[childData.id]) {
                        childData.mesh.position.copy(this.originalPositions[childData.id]);
                    }

                    // Update object data with final state
                    sceneController.updateObject(childData.id, {
                        position: childData.mesh.position,
                        parentContainer: originalParent
                    });
                }
            });

            // Remove the container itself
            sceneController.removeObject(this.containerId);

            // Restore original selection
            selectionController.clearSelection();
            this.originalSelection.forEach(obj => {
                if (obj && obj.userData?.id) {
                    // Check if object still exists
                    const objectData = sceneController.getObject(obj.userData.id);
                    if (objectData && objectData.mesh) {
                        selectionController.select(objectData.mesh);
                    }
                }
            });

            console.log(`↩️ CreateContainerCommand undone: ${this.description}`);
            return true;

        } catch (error) {
            console.error('CreateContainerCommand undo error:', error);
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
        return !!containerData;
    }

    /**
     * Clean up resources when command is removed from history
     */
    cleanup() {
        this.selectedObjects = null;
        this.originalParents = null;
        this.originalPositions = null;
        this.originalSelection = null;
        this.containerData = null;
    }
}

// Export for use in main application
window.CreateContainerCommand = CreateContainerCommand;