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
     * Check if container visibility state has changed since cache
     * @param {string} containerId - Container ID
     * @param {boolean} currentVisibility - Current visibility state
     * @param {boolean} currentHasSelectedChildren - Current selection state
     * @param {boolean} forceUpdate - If true, bypass cache check
     * @returns {boolean} True if state has changed
     */
    hasVisibilityStateChanged(containerId, currentVisibility, currentHasSelectedChildren, forceUpdate = false) {
        if (forceUpdate) return true;

        const cached = this.getFromCache(containerId, 'visibility');
        if (!cached) return true;

        return cached.isVisible !== currentVisibility || cached.hasSelectedChildren !== currentHasSelectedChildren;
    }

    /**
     * Update visibility cache for container
     * @param {string} containerId - Container ID
     * @param {boolean} isVisible - Current visibility state
     * @param {boolean} hasSelectedChildren - Current selection state
     */
    updateVisibilityCache(containerId, isVisible, hasSelectedChildren) {
        this.setCache(containerId, 'visibility', {
            isVisible,
            hasSelectedChildren
        });
    }

    /**
     * Get item from unified cache
     * @param {string} containerId - Container ID
     * @param {string} type - Cache type ('visibility', 'throttle')
     * @returns {*} Cached data or null if expired/missing
     */
    getFromCache(containerId, type) {
        const cacheKey = `${containerId}_${type}`;
        const cached = this.cache.get(cacheKey);

        if (!cached) return null;

        // Check if cache is still valid
        const now = Date.now();
        if (now - cached.timestamp > this.cacheExpiration) {
            this.cache.delete(cacheKey);
            return null;
        }

        return cached.data;
    }

    /**
     * Set item in unified cache
     * @param {string} containerId - Container ID
     * @param {string} type - Cache type ('visibility', 'throttle')
     * @param {*} data - Data to cache
     */
    setCache(containerId, type, data) {
        const cacheKey = `${containerId}_${type}`;
        this.cache.set(cacheKey, {
            type,
            data,
            timestamp: Date.now()
        });
    }

    /**
     * Standardized input validation helper
     */
    validateInputs(params = {}) {
        const { requireSceneController = true, containerData = null, objectData = null,
                selectedObjects = null, methodName = 'ContainerManager method' } = params;

        if (requireSceneController) {
            const sceneController = window.modlerComponents?.sceneController;
            if (!sceneController) {
                console.error(`${methodName}: SceneController not available`);
                return { success: false };
            }
            if (containerData && (!containerData || !containerData.mesh || !containerData.isContainer)) {
                console.error(`${methodName}: Invalid container data`);
                return { success: false };
            }
            if (objectData && (!objectData || !objectData.mesh)) {
                console.error(`${methodName}: Invalid object data`);
                return { success: false };
            }
            if (selectedObjects && (!Array.isArray(selectedObjects) || selectedObjects.length === 0)) {
                console.error(`${methodName}: Invalid selected objects`);
                return { success: false };
            }
            return { success: true, sceneController };
        }
        return { success: true };
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
        if (this.checkContainerHasLayoutWithFill(containerData, childObjects) && newContainerSize) {
            this.resizeFillObjectsForNewContainerSize(containerData, childObjects, newContainerSize);
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
        // Standardized input validation
        const validation = this.validateInputs({
            requireSceneController: true,
            selectedObjects,
            methodName: 'createContainerFromSelection'
        });
        if (!validation.success) return false;

        const sceneController = validation.sceneController;
        
        const bounds = LayoutGeometry.calculateSelectionBounds(selectedObjects);
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
            return false;
        }
        
        const unifiedContainerManager = window.modlerComponents?.unifiedContainerManager;
        if (unifiedContainerManager) {
            unifiedContainerManager.registerContainer(containerObject);
        }
        
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
        
        this.resizeContainer(containerObject, {
            mode: 'geometry-only',
            size: bounds.size
        });

        const selectionController = window.modlerComponents?.selectionController;
        if (selectionController) {
            selectionController.clearSelection('container-creation');
            selectionController.select(containerObject.mesh);
        }
        
        return containerObject;
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
        // Standardized input validation
        const validation = this.validateInputs({
            requireSceneController: true,
            objectData,
            containerData,
            methodName: 'addObjectToContainer'
        });
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
        // Standardized input validation
        const validation = this.validateInputs({
            requireSceneController: true,
            objectData,
            methodName: 'removeObjectFromContainer'
        });
        if (!validation.success) return false;

        if (!objectData.parentContainer) {
            console.error('removeObjectFromContainer: Object is not in a container');
            return false;
        }

        const sceneController = validation.sceneController;
        
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
        // Standardized input validation
        const validation = this.validateInputs({
            requireSceneController: true,
            methodName: 'updateContainerBounds'
        });
        if (!validation.success) return false;

        if (!containerId) {
            console.error('updateContainerBounds: Container ID is required');
            return false;
        }

        const sceneController = validation.sceneController;
        const containerData = sceneController.getObject(containerId);

        if (!containerData || !containerData.isContainer) {
            console.error('updateContainerBounds: Invalid container ID or object is not a container');
            return false;
        }
        
        // Use the simplified resize method for real-time updates
        return this.resizeContainer(containerData, { mode: 'fit-children' });
    }
    
    /**
     * Unified container resize method - handles all resize scenarios
     * Consolidates resizeContainerToFitChildren, resizeContainerToLayoutBounds, and resizeContainerGeometry
     * @param {Object} containerData - Container object data from SceneController
     * @param {Object} options - Resize options object
     * @param {string} options.mode - 'fit-children' | 'layout-bounds' | 'geometry-only'
     * @param {THREE.Vector3} options.size - Target size (required for geometry-only mode)
     * @param {Object} options.layoutBounds - Layout bounds {center, size} (required for layout-bounds mode)
     * @param {THREE.Vector3} options.newContainerSize - New container size for fill calculations (fit-children mode)
     * @param {boolean} options.preservePosition - If true, keep container position and only resize
     * @param {boolean} options.immediateUpdate - If true, bypass throttling for immediate visual feedback
     * @param {boolean} options.enableThrottling - If true, apply throttling (default: true for fit-children mode)
     * @returns {boolean} Success status
     */
    resizeContainer(containerData, options = {}) {
        // Standardized input validation
        const validation = this.validateInputs({
            requireSceneController: true,
            containerData,
            methodName: 'resizeContainer'
        });
        if (!validation.success) return false;

        const sceneController = validation.sceneController;

        // Default options
        const {
            mode = 'fit-children',
            size = null,
            layoutBounds = null,
            newContainerSize = null,
            preservePosition = false,
            immediateUpdate = false,
            enableThrottling = mode === 'fit-children'
        } = options;

        // Mode-specific validation
        if (mode === 'geometry-only' && !size) {
            console.error('resizeContainer: size is required for geometry-only mode');
            return false;
        }
        if (mode === 'layout-bounds' && (!layoutBounds || !layoutBounds.size)) {
            console.error('resizeContainer: layoutBounds is required for layout-bounds mode');
            return false;
        }

        // Check sizing mode constraints (only for fit-children mode)
        if (mode === 'fit-children') {
            if (containerData.sizingMode === 'fixed' && !newContainerSize) {
                console.log('📏 CONTAINER RESIZE: Skipping fixed-size container:', containerData.name);
                return false;
            }
            // Ensure sizingMode is set for legacy containers
            if (!containerData.sizingMode) {
                containerData.sizingMode = 'hug';
            }
        }

        // Apply throttling if enabled
        if (enableThrottling && !immediateUpdate) {
            const lastResize = this.getFromCache(containerData.id, 'throttle');
            if (lastResize && (Date.now() - lastResize) < this.throttleDelay) {
                return false;
            }
            this.setCache(containerData.id, 'throttle', Date.now());
        }

        let targetSize, targetPosition;

        // Mode-specific size and position calculation
        switch (mode) {
            case 'fit-children':
                const result = this.calculateFitChildrenBounds(containerData, newContainerSize, immediateUpdate);
                if (!result) return false;
                targetSize = result.size;
                targetPosition = preservePosition ? containerData.mesh.position : result.center;
                break;

            case 'layout-bounds':
                targetSize = layoutBounds.size;
                targetPosition = layoutBounds.center;
                break;

            case 'geometry-only':
                targetSize = size;
                targetPosition = containerData.mesh.position; // Keep current position
                break;

            default:
                console.error('resizeContainer: Invalid mode:', mode);
                return false;
        }

        // Update container geometry
        const shouldReposition = mode === 'layout-bounds' || (mode === 'fit-children' && !preservePosition);
        const success = LayoutGeometry.updateContainerGeometry(
            containerData.mesh,
            targetSize,
            targetPosition,
            shouldReposition
        );

        if (success) {
            // Update SceneController metadata if position changed
            if (shouldReposition) {
                sceneController.updateObject(containerData.id, {
                    position: targetPosition
                });
            }

            // Handle visibility restoration (only for fit-children mode)
            if (mode === 'fit-children') {
                this.handleContainerVisibilityAfterResize(containerData, immediateUpdate);
            }
        }

        return success;
    }

    /**
     * Calculate bounds for fit-children mode
     * @param {Object} containerData - Container object data
     * @param {THREE.Vector3} newContainerSize - Optional new container size for fill calculations
     * @param {boolean} immediateUpdate - If true, bypass caching
     * @returns {Object|null} Bounds object with size and center, or null if failed
     */
    calculateFitChildrenBounds(containerData, newContainerSize, immediateUpdate) {
        const sceneController = window.modlerComponents?.sceneController;
        if (!sceneController) return null;

        // Get all child objects
        const childObjects = sceneController.getChildObjects(containerData.id);
        if (childObjects.length === 0) return null;

        // Use consolidated bounds calculation helper
        return this.calculateContainerBounds(containerData, childObjects, newContainerSize, immediateUpdate);
    }

    /**
     * Handle container visibility restoration after resize
     * @param {Object} containerData - Container object data
     * @param {boolean} immediateUpdate - If true, force update
     */
    handleContainerVisibilityAfterResize(containerData, immediateUpdate) {
        const unifiedContainerManager = window.modlerComponents?.unifiedContainerManager;
        if (!unifiedContainerManager) return;

        const containerState = unifiedContainerManager.containerStates?.get(containerData.id);
        const selectionController = window.modlerComponents?.selectionController;
        const sceneController = window.modlerComponents?.sceneController;

        // Check if any child objects are currently selected
        let hasSelectedChildren = false;
        if (selectionController && sceneController) {
            const childObjects = sceneController.getChildObjects(containerData.id);
            hasSelectedChildren = childObjects.some(childData =>
                selectionController.isSelected(childData.mesh)
            );
        }

        const shouldBeVisible = (containerState && containerState.isSelected) || hasSelectedChildren;

        // Only update visibility if state has changed
        if (this.hasVisibilityStateChanged(containerData.id, shouldBeVisible, hasSelectedChildren, immediateUpdate)) {
            this.updateVisibilityCache(containerData.id, shouldBeVisible, hasSelectedChildren);

            if (shouldBeVisible) {
                // Check if we're in container context (drill-down mode)
                const isInContainerContext = selectionController?.isInContainerContext() &&
                                           selectionController?.getContainerContext() === containerData.mesh;

                if (!isInContainerContext) {
                    // Restore visibility
                    containerData.mesh.visible = true;

                    // Restore wireframe visibility
                    containerData.mesh.traverse((child) => {
                        const isContainerWireframe = (child === containerData.mesh ||
                                                    (child.type === 'LineSegments' && child.name === containerData.name));
                        if (isContainerWireframe) {
                            child.visible = true;
                            delete child.raycast;
                        }
                    });

                    // Handle padding visualization
                    if (containerData.autoLayout?.enabled && unifiedContainerManager.hasNonZeroPadding && unifiedContainerManager.hasNonZeroPadding(containerData)) {
                        unifiedContainerManager.updatePaddingVisualization(containerData.id);
                    } else {
                        unifiedContainerManager.hidePaddingVisualization(containerData.id);
                    }
                }
            }
        }
    }

    /**
     * Legacy method: Resize container to fit its child objects
     * @deprecated Use resizeContainer with mode: 'fit-children' instead
     */
    resizeContainerToFitChildren(containerData, newContainerSize = null, preservePosition = false, immediateUpdate = false) {
        return this.resizeContainer(containerData, {
            mode: 'fit-children',
            newContainerSize,
            preservePosition,
            immediateUpdate
        });
    }
    
    /**
     * Check if container has layout enabled with fill objects
     * @deprecated Delegated to LayoutEngine
     */
    checkContainerHasLayoutWithFill(containerData, childObjects) {
        return window.LayoutEngine?.hasLayoutWithFill?.(containerData, childObjects) || false;
    }

    /**
     * Resize fill objects based on new container size
     * @deprecated Delegated to LayoutEngine
     */
    resizeFillObjectsForNewContainerSize(containerData, childObjects, newContainerSize) {
        if (window.LayoutEngine?.resizeFillObjects) {
            window.LayoutEngine.resizeFillObjects(containerData, childObjects, newContainerSize);
        }
    }

    /**
     * Legacy method: Resize container to match layout-calculated bounds
     * @deprecated Use resizeContainer with mode: 'layout-bounds' instead
     */
    resizeContainerToLayoutBounds(containerData, layoutBounds) {
        return this.resizeContainer(containerData, {
            mode: 'layout-bounds',
            layoutBounds
        });
    }

    /**
     * Legacy method: Resize container geometry without repositioning
     * @deprecated Use resizeContainer with mode: 'geometry-only' instead
     */
    resizeContainerGeometry(containerData, size) {
        return this.resizeContainer(containerData, {
            mode: 'geometry-only',
            size
        });
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