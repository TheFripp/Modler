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

                        // CRITICAL: Store WORLD position for proper restoration
                        // Local positions change when parent changes, world positions stay consistent
                        const worldPos = new THREE.Vector3();
                        obj.getWorldPosition(worldPos);
                        this.originalPositions[obj.userData.id] = worldPos;
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
                console.error('CreateContainerCommand undo: Required components not available');
                return false;
            }

            if (!this.containerId || !this.containerData) {
                console.error('CreateContainerCommand undo: No container data to undo');
                return false;
            }

            // Get the container data
            const containerData = sceneController.getObject(this.containerId);
            if (!containerData) {
                console.error(`CreateContainerCommand undo: Container not found: ${this.containerId}`);
                return false;
            }

            // Get all child objects from the container
            const children = sceneController.getChildObjects(this.containerId);

            // Restore original parent relationships and positions
            children.forEach((childData, index) => {
                try {
                    if (childData.mesh && this.originalParents[childData.id] !== undefined) {
                        const originalParent = this.originalParents[childData.id];
                        const worldPosition = this.originalPositions[childData.id];

                        // Step 1: Restore parent relationship FIRST
                        if (originalParent) {
                            sceneController.setParentContainer(childData.id, originalParent, false);
                        } else {
                            sceneController.setParentContainer(childData.id, null, false);
                        }

                        // Step 2: Convert world position to local position in new coordinate space
                        if (worldPosition) {
                            if (originalParent) {
                                // Has parent - convert world to local
                                const parentData = sceneController.getObject(originalParent);
                                if (parentData && parentData.mesh) {
                                    const parentWorldMatrix = parentData.mesh.matrixWorld;
                                    const parentWorldMatrixInverse = new THREE.Matrix4().copy(parentWorldMatrix).invert();
                                    const localPosition = worldPosition.clone().applyMatrix4(parentWorldMatrixInverse);
                                    childData.mesh.position.copy(localPosition);
                                } else {
                                    // Fallback if parent mesh not available
                                    childData.mesh.position.copy(worldPosition);
                                }
                            } else {
                                // No parent - world position IS local position
                                childData.mesh.position.copy(worldPosition);
                            }

                            childData.mesh.updateMatrixWorld(true);
                        }

                        // Step 3: Update object data using ObjectStateManager
                        const objectStateManager = window.modlerComponents?.objectStateManager;
                        if (objectStateManager) {
                            objectStateManager.updateObject(childData.id, {
                                position: {
                                    x: childData.mesh.position.x,
                                    y: childData.mesh.position.y,
                                    z: childData.mesh.position.z
                                },
                                parentContainer: originalParent
                            });
                        } else {
                            // Fallback to direct update
                            sceneController.updateObject(childData.id, {
                                position: childData.mesh.position,
                                parentContainer: originalParent
                            });
                        }
                    }
                } catch (childError) {
                    console.error(`CreateContainerCommand undo: Error restoring child ${childData.id}:`, childError);
                    // Continue with other children
                }
            });

            // Remove the container itself
            const removeSuccess = sceneController.removeObject(this.containerId);
            if (!removeSuccess) {
                console.error(`CreateContainerCommand undo: Failed to remove container: ${this.containerId}`);
                return false;
            }

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