// Modler V2 - Property Manager
// Handles property updates for objects including fill functionality

class PropertyManager {
    constructor() {
        this.initialized = false;

        // Component references
        this.sceneController = null;
        this.selectionController = null;
        this.meshSynchronizer = null;
        this.layoutEngine = null;
        this.historyManager = null;

        // Property update throttling
        this.updateThrottles = new Map();
        this.throttleDelay = 100; // ms
    }

    /**
     * Initialize with required components
     */
    initialize() {
        this.sceneController = window.modlerComponents?.sceneController;
        this.selectionController = window.modlerComponents?.selectionController;
        this.meshSynchronizer = window.modlerComponents?.meshSynchronizer;
        this.layoutEngine = window.LayoutEngine || null;
        this.historyManager = window.modlerComponents?.historyManager;

        this.initialized = true;
        console.log('✅ PropertyManager initialized');
    }

    /**
     * Update object position
     * @param {string} axis - 'x', 'y', or 'z'
     * @param {number} value - New position value
     */
    updateObjectPosition(axis, value) {
        if (!this.initialized) return;

        const selectedObjects = this.selectionController?.getSelectedObjects();
        if (!selectedObjects || selectedObjects.length === 0) return;

        selectedObjects.forEach(mesh => {
            if (mesh.position && mesh.position[axis] !== undefined) {
                mesh.position[axis] = value;

                // Sync related meshes
                if (this.meshSynchronizer) {
                    this.meshSynchronizer.syncRelatedMeshes(mesh);
                }

                // Update object data in SceneController
                if (this.sceneController && mesh.userData?.id) {
                    this.sceneController.notifyObjectModified(mesh.userData.id);
                }
            }
        });
    }

    /**
     * Update object rotation
     * @param {string} axis - 'x', 'y', or 'z'
     * @param {number} value - New rotation value in degrees
     */
    updateObjectRotation(axis, value) {
        if (!this.initialized) return;

        const selectedObjects = this.selectionController?.getSelectedObjects();
        if (!selectedObjects || selectedObjects.length === 0) return;

        const radians = (value * Math.PI) / 180;

        selectedObjects.forEach(mesh => {
            if (mesh.rotation && mesh.rotation[axis] !== undefined) {
                mesh.rotation[axis] = radians;

                // Sync related meshes
                if (this.meshSynchronizer) {
                    this.meshSynchronizer.syncRelatedMeshes(mesh);
                }

                // Update object data in SceneController
                if (this.sceneController && mesh.userData?.id) {
                    this.sceneController.notifyObjectModified(mesh.userData.id);
                }
            }
        });
    }

    /**
     * Update object geometry dimensions using CAD geometry principles
     * @param {string} axis - 'x', 'y', or 'z'
     * @param {number} value - New dimension value
     */
    updateObjectGeometryDimension(axis, value) {
        if (!this.initialized || value <= 0) return;

        const selectedObjects = this.selectionController?.getSelectedObjects();
        if (!selectedObjects || selectedObjects.length === 0) return;

        selectedObjects.forEach(mesh => {
            if (!mesh.geometry) return;

            const objectData = this.sceneController?.getObjectByMesh(mesh);
            if (!objectData) return;

            // Use geometry-based scaling (CAD geometry principles)
            this.scaleObjectGeometry(mesh, axis, value, objectData);

            // Sync related meshes
            if (this.meshSynchronizer) {
                this.meshSynchronizer.syncRelatedMeshes(mesh);
            }

            // Update object data in SceneController
            if (this.sceneController && mesh.userData?.id) {
                this.sceneController.notifyObjectModified(mesh.userData.id);
            }
        });
    }

    /**
     * Scale object geometry to specific dimension
     * @param {THREE.Mesh} mesh - The mesh to scale
     * @param {string} axis - 'x', 'y', or 'z'
     * @param {number} targetSize - Target size for the axis
     * @param {Object} objectData - Object data from SceneController
     */
    scaleObjectGeometry(mesh, axis, targetSize, objectData) {
        // Compute current bounding box
        mesh.geometry.computeBoundingBox();
        const bbox = mesh.geometry.boundingBox;
        if (!bbox) return;

        // Calculate current size on the specified axis
        const currentSize = Math.abs(bbox.max[axis] - bbox.min[axis]);
        if (currentSize === 0) return;

        // Calculate scale factor for the specified axis
        const scaleFactor = targetSize / currentSize;

        // Apply geometry-based scaling
        if (mesh.geometry.type === 'BoxGeometry') {
            // For box geometry, recreate with new dimensions
            this.recreateBoxGeometry(mesh, axis, targetSize);
        } else {
            // For other geometries, scale the geometry directly
            const scaleVector = new THREE.Vector3(1, 1, 1);
            scaleVector[axis] = scaleFactor;

            mesh.geometry.scale(scaleVector.x, scaleVector.y, scaleVector.z);
        }

        // Mark geometry as needing update
        mesh.geometry.computeBoundingBox();
        mesh.geometry.computeBoundingSphere();
    }

    /**
     * Recreate box geometry with new dimensions
     * @param {THREE.Mesh} mesh - The mesh with box geometry
     * @param {string} axis - 'x', 'y', or 'z'
     * @param {number} newSize - New size for the axis
     */
    recreateBoxGeometry(mesh, axis, newSize) {
        const geometry = mesh.geometry;
        geometry.computeBoundingBox();
        const bbox = geometry.boundingBox;

        // Get current dimensions
        const currentDimensions = {
            x: Math.abs(bbox.max.x - bbox.min.x),
            y: Math.abs(bbox.max.y - bbox.min.y),
            z: Math.abs(bbox.max.z - bbox.min.z)
        };

        // Set new dimension
        currentDimensions[axis] = newSize;

        // Dispose old geometry
        geometry.dispose();

        // Create new box geometry
        mesh.geometry = new THREE.BoxGeometry(
            currentDimensions.x,
            currentDimensions.y,
            currentDimensions.z
        );
    }

    /**
     * Update material property
     * @param {string} propertyType - 'color' or 'opacity'
     * @param {any} value - New property value
     */
    updateMaterialProperty(propertyType, value) {
        if (!this.initialized) return;

        const selectedObjects = this.selectionController?.getSelectedObjects();
        if (!selectedObjects || selectedObjects.length === 0) return;

        selectedObjects.forEach(mesh => {
            if (!mesh.material) return;

            switch (propertyType) {
                case 'color':
                    if (typeof value === 'string') {
                        // Store original color for selection system
                        const colorHex = parseInt(value.replace('#', ''), 16);
                        mesh.material.userData.originalColor = colorHex;
                        mesh.material.color.setHex(colorHex);
                    }
                    break;

                case 'opacity':
                    if (typeof value === 'number' && value >= 0 && value <= 1) {
                        mesh.material.opacity = value;
                        mesh.material.transparent = value < 1;
                    }
                    break;
            }

            mesh.material.needsUpdate = true;

            // Update object data in SceneController
            if (this.sceneController && mesh.userData?.id) {
                this.sceneController.notifyObjectModified(mesh.userData.id);
            }
        });
    }

    /**
     * Toggle fill property for an axis
     * @param {string} axis - 'x', 'y', or 'z'
     */
    toggleFillProperty(axis) {
        if (!this.initialized) return;

        const selectedObjects = this.selectionController?.getSelectedObjects();
        if (!selectedObjects || selectedObjects.length === 0) return;

        const mesh = selectedObjects[0]; // Handle first selected object
        if (!mesh.userData?.id) return;

        const objectData = this.sceneController?.getObject(mesh.userData.id);
        if (!objectData) return;

        // Check if object is in a layout container
        if (!objectData.parentContainer) {
            console.warn('PropertyManager: Object is not in a container, cannot toggle fill');
            return;
        }

        const container = this.sceneController.getObject(objectData.parentContainer);
        if (!container || !container.autoLayout || !container.autoLayout.enabled) {
            console.warn('PropertyManager: Parent container does not have layout enabled');
            return;
        }

        // Initialize layoutProperties if needed
        if (!objectData.layoutProperties) {
            objectData.layoutProperties = {
                sizeX: 'fixed',
                sizeY: 'fixed',
                sizeZ: 'fixed'
            };
        }

        // Toggle fill state for the axis
        const sizeProperty = `size${axis.toUpperCase()}`;
        const currentState = objectData.layoutProperties[sizeProperty];
        const newState = currentState === 'fill' ? 'fixed' : 'fill';

        objectData.layoutProperties[sizeProperty] = newState;

        console.log(`PropertyManager: Toggled ${axis}-axis fill to ${newState} for object ${objectData.name}`);

        // Apply layout update
        if (this.sceneController) {
            this.sceneController.updateLayout(container.id);
        }

        // Update property panel display
        if (window.updatePropertyPanelFromObject) {
            window.updatePropertyPanelFromObject(mesh);
        }

        // Sync related meshes
        if (this.meshSynchronizer) {
            this.meshSynchronizer.syncRelatedMeshes(mesh);
        }

        // Notify SceneController
        this.sceneController.notifyObjectModified(objectData.id);

        // Trigger property panel refresh for all affected objects
        this.refreshLayoutPropertyPanels(container);
    }

    /**
     * Refresh property panels for all objects in a container when layout changes
     * @param {Object} container - Container data
     */
    refreshLayoutPropertyPanels(container) {
        if (!container || !this.sceneController) return;

        const children = this.sceneController.getChildren(container.id);
        if (!children || children.length === 0) return;

        // Refresh property panel if any child is currently selected
        const selectedObjects = this.selectionController?.getSelectedObjects();
        if (!selectedObjects || selectedObjects.length === 0) return;

        const selectedIds = selectedObjects.map(mesh => mesh.userData?.id).filter(Boolean);
        const shouldRefresh = children.some(child => selectedIds.includes(child.id));

        if (shouldRefresh) {
            // Trigger property panel update
            setTimeout(() => {
                if (window.updatePropertyPanelFromObject) {
                    window.updatePropertyPanelFromObject(selectedObjects[0]);
                }
            }, 100); // Small delay to allow layout calculations to complete
        }
    }

    /**
     * Check if object has fill enabled for specific axis
     * @param {string} objectId - Object ID
     * @param {string} axis - 'x', 'y', or 'z'
     * @returns {boolean} True if fill is enabled
     */
    isAxisFilled(objectId, axis) {
        if (!this.sceneController) return false;

        const objectData = this.sceneController.getObject(objectId);
        if (!objectData || !objectData.layoutProperties) return false;

        const sizeProperty = `size${axis.toUpperCase()}`;
        return objectData.layoutProperties[sizeProperty] === 'fill';
    }

    /**
     * Check if object is in a layout-enabled container
     * @param {string} objectId - Object ID
     * @returns {boolean} True if in layout container
     */
    isInLayoutContainer(objectId) {
        if (!this.sceneController) return false;

        const objectData = this.sceneController.getObject(objectId);
        if (!objectData || !objectData.parentContainer) return false;

        const container = this.sceneController.getObject(objectData.parentContainer);
        return container && container.autoLayout && container.autoLayout.enabled;
    }

    /**
     * Handle container size changes and update all fill objects
     * This should be called when a container's dimensions change
     * @param {string} containerId - Container ID that changed size
     */
    handleContainerSizeChange(containerId) {
        if (!this.sceneController || !this.layoutEngine) return;

        const container = this.sceneController.getObject(containerId);
        if (!container || !container.autoLayout || !container.autoLayout.enabled) return;

        // Get all children of the container
        const children = this.sceneController.getChildren(containerId);
        if (!children || children.length === 0) return;

        // Apply layout to update all fill objects via SceneController
        if (this.sceneController) {
            this.sceneController.updateLayout(container.id);
        }

        // Refresh property panels for any selected objects
        this.refreshLayoutPropertyPanels(container);
    }

    /**
     * Update object dimension and handle cascading effects for containers
     * Enhanced version that handles container resize effects on fill children
     * @param {string} axis - 'x', 'y', or 'z'
     * @param {number} value - New dimension value
     */
    updateObjectGeometryDimensionWithFillUpdate(axis, value) {
        // First apply the normal geometry update
        this.updateObjectGeometryDimension(axis, value);

        // Then check if this object is a container and update its fill children
        const selectedObjects = this.selectionController?.getSelectedObjects();
        if (!selectedObjects || selectedObjects.length === 0) return;

        const mesh = selectedObjects[0];
        if (!mesh.userData?.id) return;

        const objectData = this.sceneController?.getObject(mesh.userData.id);
        if (objectData && objectData.isContainer && objectData.autoLayout && objectData.autoLayout.enabled) {
            // Container was resized, update all fill children
            this.handleContainerSizeChange(objectData.id);
        }
    }

    /**
     * Throttle property updates to prevent excessive calls
     * @param {string} key - Throttle key
     * @param {Function} callback - Function to throttle
     */
    throttleUpdate(key, callback) {
        const now = Date.now();
        const lastUpdate = this.updateThrottles.get(key);

        if (!lastUpdate || now - lastUpdate > this.throttleDelay) {
            this.updateThrottles.set(key, now);
            callback();
        }
    }

    /**
     * Get debug information
     */
    getDebugInfo() {
        return {
            initialized: this.initialized,
            hasSceneController: !!this.sceneController,
            hasSelectionController: !!this.selectionController,
            hasMeshSynchronizer: !!this.meshSynchronizer,
            hasLayoutEngine: !!this.layoutEngine,
            throttleCount: this.updateThrottles.size
        };
    }
}

// Export for use in main application
window.PropertyManager = PropertyManager;
console.log('✅ PropertyManager class loaded and exported to window');