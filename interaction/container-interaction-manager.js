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
     */
    createContainerEdgeHighlight(object) {
        if (!object || !object.geometry) return;

        try {
            // Use centralized wireframe creation to prevent triangulation artifacts
            const visualEffects = window.modlerComponents?.visualEffects;
            let edgeMesh;

            if (visualEffects) {
                // Extract dimensions from container geometry for centralized wireframe creation
                // Use geometry bounds instead of world bounds to avoid double positioning
                const geometry = object.geometry;
                geometry.computeBoundingBox();
                const box = geometry.boundingBox;
                const size = box.getSize(new THREE.Vector3());

                // Get container color from configuration (same as regular container selection)
                const configManager = window.modlerComponents?.configurationManager;
                const containerConfig = configManager ?
                    configManager.get('visual.containers') :
                    { wireframeColor: '#00ff00' };

                const containerColorHex = parseInt(containerConfig.wireframeColor.replace('#', ''), 16);

                // Use centralized VisualEffects wireframe creation (prevents triangles)
                edgeMesh = visualEffects.createPreviewBox(
                    size.x, size.y, size.z,
                    new THREE.Vector3(0, 0, 0), // Position will be set below using object's position
                    containerColorHex, // Use configured container color
                    0.25 // 25% opacity for container context as specified
                );

                // Override the material opacity to match containerEdgeMaterial
                edgeMesh.material.opacity = 0.25;
            } else {
                // Fallback to manual creation if VisualEffects not available
                console.warn('VisualEffects not available, using fallback container edge creation');

                // Get container material from VisualizationManager
                const visualizationManager = window.modlerComponents?.visualizationManager;
                const containerMaterial = visualizationManager?.containerVisualizer?.containerMaterial ||
                    new THREE.LineBasicMaterial({
                        color: 0x00ff00,
                        transparent: true,
                        opacity: 0.25,
                        renderOrder: 998
                    });

                // Use the same geometry-based approach for consistency
                const edgeGeometry = new THREE.EdgesGeometry(object.geometry);
                edgeMesh = new THREE.LineSegments(edgeGeometry, containerMaterial);
            }

            // Make edge highlights non-raycastable
            edgeMesh.raycast = () => {};

            // Position and orient the edge highlight to match the object
            edgeMesh.position.copy(object.position);
            edgeMesh.rotation.copy(object.rotation);
            edgeMesh.scale.copy(object.scale);
            edgeMesh.updateMatrix();

            // Add to scene
            const scene = window.modlerComponents?.sceneFoundation?.scene;
            if (scene) {
                scene.add(edgeMesh);
                this.containerEdgeHighlight = edgeMesh;
            }

        } catch (error) {
            console.error('Error creating container edge highlight:', error);
        }
    }

    /**
     * Update container edge highlight when container is resized
     */
    updateContainerEdgeHighlight() {
        if (this.containerContext && this.containerEdgeHighlight) {
            // Remove old highlight
            if (this.containerEdgeHighlight.parent) {
                this.containerEdgeHighlight.parent.remove(this.containerEdgeHighlight);
            }
            if (this.containerEdgeHighlight.geometry) {
                this.containerEdgeHighlight.geometry.dispose();
            }

            // Create new highlight with updated geometry
            this.createContainerEdgeHighlight(this.containerContext);
        }
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
     */
    cleanupEdgeHighlights() {
        if (this.containerEdgeHighlight) {
            if (this.containerEdgeHighlight.parent) {
                this.containerEdgeHighlight.parent.remove(this.containerEdgeHighlight);
            }
            if (this.containerEdgeHighlight.geometry) {
                this.containerEdgeHighlight.geometry.dispose();
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