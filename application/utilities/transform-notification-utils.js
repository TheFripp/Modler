// Modler V2 - Transform Notification Utilities
// Standardized notification patterns after transform operations
//
// Part of Transform Utilities trio - see TransformationManager for overview.
// This utility provides consistent notification patterns used across tools.
//
// USE THIS FOR:
// - Standardized workflows after modifying objects
// - Container update notifications
// - Mesh synchronization after changes

class TransformNotificationUtils {

    /**
     * Complete object modification workflow with container updates and mesh synchronization
     * @param {THREE.Mesh} mesh - Object mesh that was modified
     * @param {string} modificationType - Type of modification ('transform', 'geometry', 'material')
     * @param {boolean} isRealTime - Whether this is a real-time update (false) or final update (true)
     * @param {Object} options - Additional options
     * @param {boolean} options.updateContainers - Whether to update parent containers (default: true)
     * @param {boolean} options.syncMeshes - Whether to sync related meshes (default: true)
     * @param {boolean} options.suppressContainerWireframes - Whether to suppress container wireframes (default: false)
     */
    static completeObjectModification(mesh, modificationType = 'transform', isRealTime = true, options = {}) {
        const {
            updateContainers = true,
            syncMeshes = true,
            suppressContainerWireframes = false
        } = options;

        if (!mesh) {
            console.warn('TransformNotificationUtils: Invalid mesh');
            return;
        }

        // Update parent containers if enabled and object has parent
        if (updateContainers && mesh.userData?.parentContainer) {
            const containerCrudManager = window.modlerComponents?.containerCrudManager;
            if (containerCrudManager) {
                // UNIFIED API: Generic transform notification
                containerCrudManager.resizeContainer(mesh.userData.parentContainer, {
                    reason: 'child-transformed',
                    immediate: isRealTime
                });
            }
        }

        // Sync support meshes (wireframes, highlights, etc.) if enabled
        if (syncMeshes) {
            const geometryUtils = window.GeometryUtils;
            if (geometryUtils) {
                // Check container context suppression
                if (suppressContainerWireframes && this.shouldSuppressContainerWireframes(mesh)) {
                    return;
                }

                geometryUtils.updateSupportMeshGeometries(mesh);
            }
        }
    }

    /**
     * Notify object transform changed using Scene Controller method
     * @param {string} objectId - ID of the object that changed
     */
    static notifyObjectTransformChanged(objectId) {
        const sceneController = window.modlerComponents?.sceneController;
        if (sceneController && sceneController.notifyObjectTransformChanged) {
            sceneController.notifyObjectTransformChanged(objectId);
        } else {
            console.warn('TransformNotificationUtils: Scene Controller not available for transform notification');
        }
    }

    // REMOVED: updateParentContainers() - use ContainerCrudManager.resizeContainer() directly
    // All callers should now use the unified API with semantic reason parameters

    /**
     * Sync all related meshes (wireframes, highlights, etc.)
     * @param {THREE.Mesh} mesh - Primary mesh
     * @param {string} modificationType - Type of modification
     * @param {boolean} suppressContainerWireframes - Whether to suppress container wireframes
     */
    static syncRelatedMeshes(mesh, modificationType = 'transform', suppressContainerWireframes = false) {
        if (!mesh) return;

        const geometryUtils = window.GeometryUtils;
        if (geometryUtils) {
            // Check container context suppression
            if (suppressContainerWireframes && this.shouldSuppressContainerWireframes(mesh)) {
                return;
            }

            geometryUtils.updateSupportMeshGeometries(mesh);
        }
    }

    /**
     * Check if container wireframes should be suppressed for this mesh
     * @param {THREE.Mesh} mesh - Mesh to check
     * @returns {boolean} True if wireframes should be suppressed
     */
    static shouldSuppressContainerWireframes(mesh) {
        if (!mesh) return false;

        // Check if we're in container context and this is the container we're stepped into
        const navigationController = window.modlerComponents?.navigationController;
        if (!navigationController) return false;

        const isInContainerContext = navigationController.isInContainerContext() || false;
        const containerContext = navigationController.getCurrentContainer()?.mesh;

        // Get object data to check if this is a container
        const sceneController = window.modlerComponents?.sceneController;
        if (!sceneController) return false;

        const objectData = sceneController.getObjectByMesh(mesh);
        if (!objectData) return false;

        return isInContainerContext && objectData.isContainer && mesh === containerContext;
    }

    /**
     * Standardized object modification completion pattern
     * Used consistently across tools and handlers
     * @param {THREE.Mesh} mesh - Modified mesh
     * @param {string} modificationType - Type of modification
     * @param {boolean} isFinalUpdate - Whether this is the final update in a sequence
     */
    static completeModification(mesh, modificationType = 'transform', isFinalUpdate = true) {
        this.completeObjectModification(mesh, modificationType, isFinalUpdate, {
            updateContainers: true,
            syncMeshes: true,
            suppressContainerWireframes: false
        });
    }

    /**
     * Dimension change completion pattern
     * Specifically for geometry modifications that affect dimensions
     * @param {THREE.Mesh} mesh - Modified mesh
     * @param {string} axis - Axis that was modified ('x', 'y', 'z') or null for all
     */
    static completeDimensionChange(mesh, axis = null) {
        this.completeObjectModification(mesh, 'geometry', true, {
            updateContainers: true,
            syncMeshes: true,
            suppressContainerWireframes: false
        });
    }

    /**
     * Material change completion pattern
     * For material property modifications
     * @param {THREE.Mesh} mesh - Modified mesh
     */
    static completeMaterialChange(mesh) {
        this.completeObjectModification(mesh, 'material', true, {
            updateContainers: false, // Material changes don't affect containers
            syncMeshes: true,
            suppressContainerWireframes: false
        });
    }
}

// Export for use in main application
window.TransformNotificationUtils = TransformNotificationUtils;