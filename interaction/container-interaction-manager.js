// Modler V2 - Container Interaction State Management
// Handles container step-in/out logic, interaction context, and visual feedback
// Target: ~200 lines - pure interaction state management

class ContainerInteractionManager {
    constructor() {
        // DEPRECATED: Container context state - NavigationController manages this now
        this.containerContext = null; // UNUSED - NavigationController is authoritative
        this.containerEdgeHighlight = null; // Visual state only
    }

    /**
     * REMOVED: Container navigation - NavigationController is the single authority
     * ContainerInteractionManager is now a passive responder only
     */
    stepIntoContainer(containerObject) {
        console.warn('ContainerInteractionManager.stepIntoContainer: Use NavigationController instead');
        // This method is deprecated - use NavigationController.navigateToContainer() directly
        return false;
    }

    /**
     * REMOVED: Container navigation - NavigationController is the single authority
     * ContainerInteractionManager is now a passive responder only
     */
    stepOutOfContainer() {
        console.warn('ContainerInteractionManager.stepOutOfContainer: Use NavigationController instead');
        // This method is deprecated - use NavigationController.navigateUp() directly
        return false;
    }

    /**
     * Check if we're currently inside a container context
     * Delegates to NavigationController as single source of truth
     */
    isInContainerContext() {
        // Primary source: NavigationController
        const navigationController = window.modlerComponents?.navigationController;
        if (navigationController) {
            return navigationController.isInContainerContext();
        }

        // Fallback to local state if NavigationController unavailable
        return this.containerContext !== null;
    }

    /**
     * Get the current container context
     * Delegates to NavigationController as single source of truth
     */
    getContainerContext() {
        // Primary source: NavigationController
        const navigationController = window.modlerComponents?.navigationController;
        if (navigationController) {
            const currentContainer = navigationController.getCurrentContainer();
            return currentContainer ? currentContainer.mesh : null;
        }

        // Fallback to local state if NavigationController unavailable
        return this.containerContext;
    }

    /**
     * Create faded edge highlight for container context
     * Delegates to SupportMeshFactory - uses pre-created support meshes (no duplicate creation)
     */
    createContainerEdgeHighlight(object) {
        if (!object) return;

        const supportMeshFactory = window.modlerComponents?.supportMeshFactory;
        if (supportMeshFactory) {
            supportMeshFactory.showContainerWireframe(object);
            supportMeshFactory.setContainerWireframeOpacity(object, 0.25);
        }

        // Track the object for cleanup (no separate mesh to track anymore)
        this.containerEdgeHighlight = object;
    }

    /**
     * Update container edge highlight when container is resized
     * No-op since we use pre-created support meshes that auto-update with geometry
     */
    updateContainerEdgeHighlight() {
        // Support meshes are children of the main mesh - they inherit transforms automatically
        // Geometry updates are handled by SupportMeshFactory.updateSupportMeshGeometries()
    }

    /**
     * Commit current object positions to avoid position jumps
     */
    commitObjectPositions() {
        const sceneController = window.modlerComponents?.sceneController;
        const selectionController = window.modlerComponents?.selectionController;
        if (!sceneController || !selectionController) return;

        // For all currently selected objects, ensure their positions are committed
        const selectedObjects = selectionController.getSelectedObjects();
        selectedObjects.forEach(object => {
            const objectData = sceneController.getObjectByMesh(object);
            if (objectData) {
                // ARCHITECTURAL FIX: Simplified position commitment using world positions
                // Always save world position for consistency - eliminates coordinate space confusion
                objectData.position = object.getWorldPosition(new THREE.Vector3());

                // Notify scene controller of the position change
                sceneController.notifyObjectTransformChanged(objectData.id);
            }
        });
    }

    /**
     * Handle container context during selection clearing
     * SIMPLIFIED: Now respects NavigationController authority
     */
    handleSelectionClear(reason = 'normal') {
        // SIMPLIFICATION: Check NavigationController authority first
        const navigationController = window.modlerComponents?.navigationController;
        if (navigationController?.isNavigating) {
            return;
        }

        // SIMPLIFIED LOGIC: Only step out for empty space clicks
        // Everything else preserves container context
        const shouldStepOut = this.isInContainerContext() && reason === 'empty-space';

        if (shouldStepOut) {
            this.stepOutOfContainer();
        }
    }

    /**
     * Disable container collision meshes to prevent accidental interaction during drill-down
     * Only disables OTHER containers, not the current container context
     */
    disableContainerCollisionMeshes() {
        const scene = window.modlerComponents?.sceneFoundation?.scene;
        if (!scene || !this.containerContext) return;

        // Find all container collision meshes EXCEPT the current container context
        scene.traverse((object) => {
            if (object.userData.isContainerCollision || object.userData.isContainerInteractive) {
                // Check if this collision mesh belongs to the current container context
                const isCurrentContainer = object.parent === this.containerContext;

                if (!isCurrentContainer) {
                    // Store original raycast function if it exists
                    if (!object.userData.originalRaycast) {
                        object.userData.originalRaycast = object.raycast || null;
                    }
                    // Disable raycasting by replacing with empty function
                    object.raycast = () => {};
                }
            }
        });
    }

    /**
     * Re-enable container collision meshes when stepping out of container context
     */
    enableContainerCollisionMeshes() {
        const scene = window.modlerComponents?.sceneFoundation?.scene;
        if (!scene) return;

        // Find all container collision meshes and restore raycasting
        scene.traverse((object) => {
            if (object.userData.isContainerCollision || object.userData.isContainerInteractive) {
                // Restore original raycast function
                if (object.userData.originalRaycast !== undefined) {
                    if (object.userData.originalRaycast === null) {
                        // Remove the custom raycast function to restore default behavior
                        delete object.raycast;
                    } else {
                        // Restore the original custom raycast function
                        object.raycast = object.userData.originalRaycast;
                    }
                    // Clean up the stored reference
                    delete object.userData.originalRaycast;
                }
            }
        });
    }

    /**
     * Clear selection wireframe to prevent dual wireframe conflict
     * Called before creating container context wireframe
     */
    clearSelectionWireframe() {
        const visualizationManager = window.modlerComponents?.visualizationManager;
        if (visualizationManager && this.containerContext) {
            // Temporarily hide the selection wireframe for the container
            visualizationManager.setState(this.containerContext, 'normal');
        }
    }

    /**
     * Restore selection wireframe when stepping out of container context
     * @param {THREE.Object3D} containerObject - Container to restore wireframe for
     */
    restoreSelectionWireframe(containerObject) {
        if (!containerObject) return;

        const selectionController = window.modlerComponents?.selectionController;
        const visualizationManager = window.modlerComponents?.visualizationManager;

        // Check if the container is still selected and restore its wireframe
        if (selectionController && visualizationManager &&
            selectionController.isSelected(containerObject)) {
            visualizationManager.setState(containerObject, 'selected');
        }
    }

    /**
     * Clean up container edge highlights (called by NavigationController)
     * Hides the pre-created support mesh wireframe
     */
    cleanupEdgeHighlights() {
        if (this.containerEdgeHighlight) {
            const supportMeshFactory = window.modlerComponents?.supportMeshFactory;
            if (supportMeshFactory) {
                supportMeshFactory.hideContainerWireframe(this.containerEdgeHighlight);
            }
            this.containerEdgeHighlight = null;
        }
    }

    /**
     * Clean up container context
     */
    destroy() {
        this.cleanupEdgeHighlights();
        // stepOutOfContainer() is deprecated - cleanup handled elsewhere
    }
}

// Export for use in main application
window.ContainerInteractionManager = ContainerInteractionManager;