// Modler V2 - Container Management
// Container creation, configuration, and lifecycle management
// Target: ~200 lines - focused container operations

class ContainerManager {
    constructor() {
        // ContainerManager initialized

        // Unified cache system with consistent 50ms expiration
        this.cache = new Map(); // containerId -> { type, data, timestamp }
        this.cacheExpiration = 50; // milliseconds - consistent across all cache types
        this.throttleDelay = 16; // milliseconds - 60 FPS unified with MovementUtils

        // Periodic cache cleanup to prevent memory leaks
        this.setupCacheCleanup();
    }


    /**
     * Generate cache key
     */
    getCacheKey(containerId, type) {
        return `${containerId}_${type}`;
    }

    /**
     * Get item from unified cache
     */
    getFromCache(containerId, type) {
        const cacheKey = this.getCacheKey(containerId, type);
        const cached = this.cache.get(cacheKey);

        if (!cached) return null;

        const now = Date.now();
        if (now - cached.timestamp > this.cacheExpiration) {
            this.cache.delete(cacheKey);
            return null;
        }

        return cached.data;
    }

    /**
     * Set item in unified cache
     */
    setCache(containerId, type, data) {
        const cacheKey = this.getCacheKey(containerId, type);
        this.cache.set(cacheKey, {
            type,
            data,
            timestamp: Date.now()
        });
    }

    /**
     * Validate container data and get sceneController
     */
    validateContainer(containerData, methodName) {
        const sceneController = window.modlerComponents?.sceneController;
        if (!sceneController) {
            console.error(`${methodName}: SceneController not available`);
            return { success: false };
        }
        if (!containerData || !containerData.mesh || !containerData.isContainer) {
            console.error(`${methodName}: Invalid container data`);
            return { success: false };
        }
        return { success: true, sceneController };
    }

    /**
     * Validate container and object data
     */
    validateContainerAndObject(containerData, objectData, methodName) {
        const result = this.validateContainer(containerData, methodName);
        if (!result.success) return result;

        if (!objectData || !objectData.mesh) {
            console.error(`${methodName}: Invalid object data`);
            return { success: false };
        }
        return result;
    }

    /**
     * Validate selected objects array
     */
    validateSelectedObjects(selectedObjects, methodName) {
        const sceneController = window.modlerComponents?.sceneController;
        if (!sceneController) {
            console.error(`${methodName}: SceneController not available`);
            return { success: false };
        }
        if (!Array.isArray(selectedObjects) || selectedObjects.length === 0) {
            console.error(`${methodName}: Invalid selected objects`);
            return { success: false };
        }
        return { success: true, sceneController };
    }

    /**
     * Get child meshes suitable for bounds calculation
     */
    getChildMeshesForBounds(childObjects) {
        return childObjects
            .map(child => {
                if (child.isContainer && child.mesh) {
                    const collisionMesh = child.mesh.children.find(grandchild =>
                        grandchild.userData.isContainerCollision
                    );
                    if (collisionMesh) return collisionMesh;
                }
                return child.mesh;
            })
            .filter(mesh => mesh && mesh.geometry && mesh.geometry.type !== 'EdgesGeometry');
    }

    /**
     * Calculate bounds from child objects
     */
    calculateContainerBounds(containerData, childObjects, newContainerSize = null, immediateUpdate = false) {
        if (window.LayoutEngine?.hasLayoutWithFill?.(containerData, childObjects) && newContainerSize) {
            if (window.LayoutEngine?.resizeFillObjects) {
                window.LayoutEngine.resizeFillObjects(containerData, childObjects, newContainerSize);
            }
        }
        const childMeshes = this.getChildMeshesForBounds(childObjects);
        return childMeshes.length === 0 ? null : PositionTransform.calculateObjectBounds(childMeshes, immediateUpdate);
    }

    /**
     * Setup periodic cache cleanup to prevent memory leaks
     */
    setupCacheCleanup() {
        // Clean up caches every 5 seconds
        setInterval(() => {
            this.cleanupCaches();
        }, 5000);
    }

    /**
     * Clean up expired cache entries
     */
    cleanupCaches() {
        const now = Date.now();

        // Clean up all expired cache entries (unified cache with consistent expiration)
        for (const [cacheKey, entry] of this.cache.entries()) {
            if (now - entry.timestamp > this.cacheExpiration) {
                this.cache.delete(cacheKey);
            }
        }

        // Also clean up PositionTransform bounds cache
        if (window.PositionTransform && window.PositionTransform.cleanupBoundsCache) {
            window.PositionTransform.cleanupBoundsCache();
        }
    }

    /**
     * Create auto layout container from selected objects
     * @param {Array} selectedObjects - Array of selected mesh objects
     * @returns {boolean} True if container was successfully created
     */
    createContainerFromSelection(selectedObjects) {
        const validation = this.validateSelectedObjects(selectedObjects, 'createContainerFromSelection');
        if (!validation.success) return false;

        const sceneController = validation.sceneController;
        const bounds = LayoutGeometry.calculateSelectionBounds(selectedObjects);

        // Create and register container
        const containerObject = this.createAndRegisterContainer(sceneController, bounds);
        if (!containerObject) return false;

        // Move objects into container
        const success = this.moveObjectsIntoContainer(selectedObjects, containerObject, sceneController);
        if (!success) return false;

        // Finalize container
        this.finalizeContainerCreation(containerObject, bounds);

        return containerObject;
    }

    /**
     * Create and register a new container
     * @param {Object} sceneController - Scene controller instance
     * @param {Object} bounds - Bounds object with size and center
     * @returns {Object|null} Container object or null if failed
     */
    createAndRegisterContainer(sceneController, bounds) {
        const containerData = LayoutGeometry.createContainerGeometry(bounds.size);
        const edgeContainer = containerData.mesh;

        const containerObject = sceneController.addObject(edgeContainer, null, {
            name: sceneController.generateContainerName(),
            type: 'container',
            position: bounds.center.clone(),
            isContainer: true,
            selectable: false,
            sizingMode: 'hug'
        });

        if (!containerObject) {
            console.error('Failed to create container object');
            return null;
        }

        const unifiedContainerManager = window.modlerComponents?.unifiedContainerManager;
        if (unifiedContainerManager) {
            unifiedContainerManager.registerContainer(containerObject);
        }

        return containerObject;
    }

    /**
     * Move selected objects into container
     * @param {Array} selectedObjects - Objects to move
     * @param {Object} containerObject - Target container
     * @param {Object} sceneController - Scene controller instance
     * @returns {boolean} Success status
     */
    moveObjectsIntoContainer(selectedObjects, containerObject, sceneController) {
        const objectsToMove = [];
        selectedObjects.forEach(obj => {
            const objectData = sceneController.getObjectByMesh(obj);
            if (objectData) {
                objectsToMove.push(obj);
            }
        });

        const success = PositionTransform.preserveWorldPositions(objectsToMove, containerObject.mesh);
        if (!success) {
            console.error('Failed to preserve world positions during container creation');
            return false;
        }

        selectedObjects.forEach(obj => {
            const objectData = sceneController.getObjectByMesh(obj);
            if (objectData) {
                if (!objectData.isContainer) {
                    sceneController.setParentContainer(objectData.id, containerObject.id, false);
                } else {
                    objectData.parentContainer = containerObject.id;
                    if (obj.visible === false) {
                        obj.visible = true;
                    }
                }
            }
        });

        return true;
    }

    /**
     * Finalize container creation with sizing and selection
     * @param {Object} containerObject - Container to finalize
     * @param {Object} bounds - Bounds object with size
     */
    finalizeContainerCreation(containerObject, bounds) {
        this.resizeContainerGeometry(containerObject, bounds.size);

        const selectionController = window.modlerComponents?.selectionController;
        if (selectionController) {
            selectionController.clearSelection('container-creation');
            selectionController.select(containerObject.mesh);
        }
    }
    
    /**
     * Create new empty container at specific position
     * @param {THREE.Vector3} position - Container position
     * @returns {Object|null} Created container object or null if failed
     */
    createEmptyContainer(position = new THREE.Vector3(0, 0, 0)) {
        const sceneController = window.modlerComponents?.sceneController;
        if (!sceneController) return null;
        
        const size = new THREE.Vector3(0.5, 0.5, 0.5);
        const containerData = LayoutGeometry.createContainerGeometry(size);
        const edgeContainer = containerData.mesh;
        
        const containerObject = sceneController.addObject(edgeContainer, null, {
            name: sceneController.generateContainerName(),
            type: 'container',
            position,
            isContainer: true,
            selectable: false, // WIREFRAME IS NOT SELECTABLE - only interactive mesh should be selectable
            sizingMode: 'hug' // Default container sizing mode - automatically resizes to fit children
        });

        // Register container with unified ContainerManager (new architecture)
        const unifiedContainerManager = window.modlerComponents?.unifiedContainerManager;
        if (unifiedContainerManager && containerObject) {
            unifiedContainerManager.registerContainer(containerObject);
        }

        // LEGACY MANAGERS REMOVED: Only UnifiedContainerManager handles containers now
        // Legacy containerSupportManager registration removed to prevent conflicts

        return containerObject;
    }
    
    /**
     * Toggle container state for an object
     * @param {Object} objectData - Object data from SceneController
     * @returns {boolean} New container state
     */
    toggleContainerState(objectData) {
        const sceneController = window.modlerComponents?.sceneController;
        if (!sceneController) return false;
        
        if (objectData.isContainer) {
            // Disable container and auto layout
            objectData.isContainer = false;
            if (objectData.autoLayout) {
                sceneController.disableAutoLayout(objectData.id);
            }
            // Container removed
            return false;
        } else {
            // Enable container
            objectData.isContainer = true;
            objectData.sizingMode = 'hug'; // Default container sizing mode
            // Object converted to container
            return true;
        }
    }
    
    /**
     * Add object to container
     * @param {Object} objectData - Object to add
     * @param {Object} containerData - Target container
     * @returns {boolean} Success status
     */
    addObjectToContainer(objectData, containerData) {
        const validation = this.validateContainerAndObject(containerData, objectData, 'addObjectToContainer');
        if (!validation.success) return false;

        const sceneController = validation.sceneController;
        const obj = objectData.mesh;
        const containerMesh = containerData.mesh;

        if (!PositionTransform.preserveWorldPosition(obj, containerMesh)) {
            console.error('Failed to preserve world position during container addition');
            return false;
        }

        sceneController.setParentContainer(objectData.id, containerData.id, false);
        this.resizeContainer(containerData, { mode: 'fit-children' });

        const meshSynchronizer = window.modlerComponents?.meshSynchronizer;
        if (meshSynchronizer) {
            meshSynchronizer.syncAllRelatedMeshes(obj, 'transform');
        }

        if (window.populateObjectList) {
            setTimeout(() => {
                window.populateObjectList();
            }, 10);
        }
        
        return true;
    }
    
    /**
     * Remove object from container
     * @param {Object} objectData - Object to remove from container
     * @returns {boolean} Success status
     */
    removeObjectFromContainer(objectData) {
        const sceneController = window.modlerComponents?.sceneController;
        if (!sceneController) {
            console.error('removeObjectFromContainer: SceneController not available');
            return false;
        }
        if (!objectData || !objectData.mesh) {
            console.error('removeObjectFromContainer: Invalid object data');
            return false;
        }

        if (!objectData.parentContainer) {
            console.error('removeObjectFromContainer: Object is not in a container');
            return false;
        }
        
        const parentContainer = sceneController.getObject(objectData.parentContainer);
        const obj = objectData.mesh;

        if (obj && parentContainer && obj.parent !== parentContainer.mesh) {
            console.error(`Hierarchy inconsistency: ${objectData.name} metadata vs Three.js parent mismatch`);
        }

        if (obj && obj.parent && parentContainer) {
            if (!PositionTransform.preserveWorldPosition(obj, sceneController.scene)) {
                console.error('Failed to preserve world position during container removal');
                return false;
            }
        }

        sceneController.setParentContainer(objectData.id, null);

        if (parentContainer) {
            this.resizeContainer(parentContainer, { mode: 'fit-children' });
        }
        
        return true;
    }
    
    /**
     * Update container bounds based on current child positions (used during real-time dragging)
     * @param {string} containerId - Container ID to update
     * @returns {boolean} Success status
     */
    updateContainerBounds(containerId) {
        const sceneController = window.modlerComponents?.sceneController;
        if (!sceneController) {
            console.error('updateContainerBounds: SceneController not available');
            return false;
        }

        if (!containerId) {
            console.error('updateContainerBounds: Container ID is required');
            return false;
        }
        const containerData = sceneController.getObject(containerId);

        if (!containerData || !containerData.isContainer) {
            console.error('updateContainerBounds: Invalid container ID or object is not a container');
            return false;
        }
        
        // Use the simplified resize method for real-time updates
        return this.resizeContainerToFitChildren(containerData);
    }
    
    /**
     * Resize container to fit its child objects with fill-aware layout support
     */
    resizeContainerToFitChildren(containerData, newContainerSize = null, preservePosition = false, immediateUpdate = false) {
        const validation = this.validateContainer(containerData, 'resizeContainerToFitChildren');
        if (!validation.success) return false;

        const sceneController = validation.sceneController;

        // Check sizing mode constraints
        if (containerData.sizingMode === 'fixed' && !newContainerSize) {
            return false;
        }
        if (!containerData.sizingMode) {
            containerData.sizingMode = 'hug';
        }

        // Apply throttling
        if (!immediateUpdate) {
            const lastResize = this.getFromCache(containerData.id, 'throttle');
            if (lastResize && (Date.now() - lastResize) < this.throttleDelay) {
                return false;
            }
            this.setCache(containerData.id, 'throttle', Date.now());
        }

        const childObjects = sceneController.getChildObjects(containerData.id);
        if (childObjects.length === 0) return false;

        const bounds = this.calculateContainerBounds(containerData, childObjects, newContainerSize, immediateUpdate);
        if (!bounds) return false;

        const targetPosition = preservePosition ? containerData.mesh.position : bounds.center;
        const success = LayoutGeometry.updateContainerGeometry(
            containerData.mesh,
            bounds.size,
            targetPosition,
            !preservePosition
        );

        if (success) {
            if (!preservePosition) {
                sceneController.updateObject(containerData.id, { position: targetPosition });
            }
            this.handleContainerVisibilityAfterResize(containerData, immediateUpdate);
        }

        return success;
    }

    /**
     * Resize container to match layout-calculated bounds
     */
    resizeContainerToLayoutBounds(containerData, layoutBounds) {
        const validation = this.validateContainer(containerData, 'resizeContainerToLayoutBounds');
        if (!validation.success) return false;

        if (!layoutBounds || !layoutBounds.size) {
            console.error('resizeContainerToLayoutBounds: layoutBounds is required');
            return false;
        }

        const sceneController = validation.sceneController;
        const success = LayoutGeometry.updateContainerGeometry(
            containerData.mesh,
            layoutBounds.size,
            layoutBounds.center,
            true
        );

        if (success) {
            sceneController.updateObject(containerData.id, { position: layoutBounds.center });
        }

        return success;
    }

    /**
     * Resize container geometry without repositioning
     */
    resizeContainerGeometry(containerData, size) {
        const validation = this.validateContainer(containerData, 'resizeContainerGeometry');
        if (!validation.success) return false;

        if (!size) {
            console.error('resizeContainerGeometry: size is required');
            return false;
        }

        return LayoutGeometry.updateContainerGeometry(
            containerData.mesh,
            size,
            containerData.mesh.position,
            false
        );
    }


    /**
     * Handle container visibility restoration after resize
     * @param {Object} containerData - Container object data
     * @param {boolean} immediateUpdate - If true, force update
     */
    handleContainerVisibilityAfterResize(containerData, immediateUpdate) {
        const unifiedContainerManager = window.modlerComponents?.unifiedContainerManager;
        if (!unifiedContainerManager) return;

        // Delegate complex visibility logic to UnifiedContainerManager
        // Check if container should be visible based on selection state
        const containerState = unifiedContainerManager.containerStates?.get(containerData.id);
        const selectionController = window.modlerComponents?.selectionController;
        const sceneController = window.modlerComponents?.sceneController;

        let hasSelectedChildren = false;
        if (selectionController && sceneController) {
            const childObjects = sceneController.getChildObjects(containerData.id);
            hasSelectedChildren = childObjects.some(childData =>
                selectionController.isSelected(childData.mesh)
            );
        }

        const shouldBeVisible = (containerState && containerState.isSelected) || hasSelectedChildren;

        // Use UnifiedContainerManager's debouncing system instead of cache
        if (shouldBeVisible || immediateUpdate) {
            // Use UnifiedContainerManager's comprehensive visibility management
            unifiedContainerManager.showContainer(containerData.id, true);
        }
    }


    /**
     * Clean up container resources
     * @param {Object} containerData - Container object data
     * @returns {boolean} Success status
     */
    cleanupContainer(containerData) {
        if (!containerData || !containerData.mesh) return false;

        // Use UnifiedContainerManager for comprehensive cleanup
        const unifiedContainerManager = window.modlerComponents?.unifiedContainerManager;
        if (unifiedContainerManager) {
            unifiedContainerManager.removeContainer(containerData.id);
        }

        // Dispose geometry to prevent memory leaks
        if (containerData.mesh.geometry) {
            containerData.mesh.geometry.dispose();
        }

        // Dispose material
        if (containerData.mesh.material) {
            containerData.mesh.material.dispose();
        }

        return true;
    }
}

// Export for use in main application
window.ContainerManager = ContainerManager;