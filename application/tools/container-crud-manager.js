// Modler V2 - Container CRUD Operations
// Container creation, configuration, and lifecycle management (Create, Read, Update, Delete)
// Target: ~400 lines - focused container operations only

class ContainerCrudManager {
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
     * Get geometry factory and material manager instances
     */
    getFactories() {
        return {
            geometryFactory: window.modlerComponents?.geometryFactory,
            materialManager: window.modlerComponents?.materialManager
        };
    }

    /**
     * Centralized container geometry creation
     */
    createContainerGeometryWithFactories(size) {
        const { geometryFactory, materialManager } = this.getFactories();
        return LayoutGeometry.createContainerGeometry(size, geometryFactory, materialManager);
    }

    /**
     * Centralized container geometry update with factory handling
     */
    updateContainerGeometryWithFactories(containerData, size, newCenter = null, shouldReposition = true) {
        const { geometryFactory, materialManager } = this.getFactories();

        // Get layout direction for wireframe visualization
        const layoutDirection = containerData.autoLayout?.enabled && containerData.autoLayout?.direction ?
            containerData.autoLayout.direction : null;

        return LayoutGeometry.updateContainerGeometry(
            containerData.mesh,
            size,
            newCenter || containerData.mesh.position,
            shouldReposition,
            layoutDirection,
            geometryFactory,
            materialManager
        );
    }

    /**
     * Create container geometry at specific position with factory handling
     * Used by delete-object-command.js and position-transform.js
     * @param {THREE.Vector3} size - Container size
     * @param {THREE.Vector3|object} transform - Position vector or transform object with {position, rotation, scale}
     */
    createContainerGeometryAtPosition(size, transform) {
        const containerData = this.createContainerGeometryWithFactories(size);

        if (containerData && containerData.mesh) {
            if (transform.x !== undefined) {
                // Simple position vector
                containerData.mesh.position.copy(transform);
            } else {
                // Transform object with position, rotation, scale
                if (transform.position) {
                    containerData.mesh.position.copy(transform.position);
                }
                if (transform.rotation) {
                    containerData.mesh.rotation.copy(transform.rotation);
                }
                if (transform.scale) {
                    containerData.mesh.scale.copy(transform.scale);
                }
            }
            containerData.mesh.updateMatrixWorld(true);
        }

        return containerData;
    }

    /**
     * Update container geometry for push tool operations with factory handling
     * Used by push-tool.js for container resizing during push operations
     */
    updateContainerForPushTool(containerMesh, newSize) {
        if (!containerMesh) {
            console.error('updateContainerForPushTool: Container mesh is required');
            return false;
        }

        const { geometryFactory, materialManager } = this.getFactories();

        // Push tool operations don't need layout direction visualization
        return LayoutGeometry.updateContainerGeometry(
            containerMesh,
            newSize,
            containerMesh.position,
            false, // Don't reposition during push operations
            null, // No layout direction visualization during push operations
            geometryFactory,
            materialManager
        );
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
        const containerData = this.createContainerGeometryWithFactories(bounds.size);
        const edgeContainer = containerData.mesh;

        // DEBUG: Log container creation positioning
        console.log('ContainerCrudManager.createAndRegisterContainer - Creating container:', {
            boundsCenter: bounds.center.clone(),
            containerMeshPosition: edgeContainer.position.clone(),
            boundsSizeInfo: bounds.size
        });

        const containerObject = sceneController.addObject(edgeContainer, null, {
            name: sceneController.generateObjectName('container'),
            type: 'container',
            position: bounds.center.clone(),
            isContainer: true,
            selectable: false,
            sizingMode: 'hug',
            originalBounds: bounds // Store original bounds for interactive mesh creation
        });

        // DEBUG: Log container after addObject
        if (containerObject && containerObject.mesh) {
            console.log('ContainerCrudManager.createAndRegisterContainer - After addObject:', {
                containerMeshPosition: containerObject.mesh.position.clone(),
                hasInteractiveMesh: !!containerObject.mesh.userData?.supportMeshes?.interactiveMesh
            });
        }

        if (!containerObject) {
            console.error('Failed to create container object');
            return null;
        }

        // const unifiedContainerManager = window.modlerComponents?.unifiedContainerManager;
        // if (unifiedContainerManager) {
        //     unifiedContainerManager.registerContainer(containerObject);
        // }

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
                    // For containers, we need to preserve their position AND their children's positions
                    // First, preserve the container's world position relative to its new parent
                    if (!PositionTransform.preserveNestedContainerPosition(obj, containerObject.mesh)) {
                        console.error('Failed to preserve nested container position during container creation');
                        return;
                    }

                    // Set parent relationship after position is preserved
                    sceneController.setParentContainer(objectData.id, containerObject.id, false);

                    // Ensure container visibility
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

            // Make container temporarily selectable for selection, then restore
            const wasSelectable = containerObject.selectable;
            containerObject.selectable = true;
            selectionController.select(containerObject.mesh);

            // Force visualization update to show container highlight
            const visualizationManager = window.modlerComponents?.visualizationManager;
            if (visualizationManager) {
                visualizationManager.setState(containerObject.mesh, 'selected');
            }
        }

        // Trigger hierarchy update to refresh the object list
        if (window.notifyObjectHierarchyChanged) {
            window.notifyObjectHierarchyChanged();
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
        const containerData = this.createContainerGeometryWithFactories(size);
        const edgeContainer = containerData.mesh;
        
        const containerObject = sceneController.addObject(edgeContainer, null, {
            name: sceneController.generateObjectName('container'),
            type: 'container',
            position,
            isContainer: true,
            selectable: false, // WIREFRAME IS NOT SELECTABLE - only interactive mesh should be selectable
            sizingMode: 'hug' // Default container sizing mode - automatically resizes to fit children
        });

        // Register container with unified ContainerManager (new architecture)
        // const unifiedContainerManager = window.modlerComponents?.unifiedContainerManager;
        // if (unifiedContainerManager && containerObject) {
        //     unifiedContainerManager.registerContainer(containerObject);
        // }

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
        // When adding objects to container, preserve container position to avoid moving child objects
        this.resizeContainerToFitChildren(containerData, null, true);

        // Legacy meshSynchronizer removed - support meshes now self-contained children

        // Trigger hierarchy update for new Svelte UI
        if (window.notifyObjectHierarchyChanged) {
            window.notifyObjectHierarchyChanged();
        }

        // Legacy support for old object list
        if (window.populateObjectList) {
            setTimeout(() => {
                window.populateObjectList();
            }, 10);
        }

        return true;
    }

    /**
     * NESTED CONTAINER SUPPORT: Add container to another container
     * @param {Object} childContainerData - Container to be nested
     * @param {Object} parentContainerData - Parent container to nest into
     * @returns {boolean} Success status
     */
    addContainerToContainer(childContainerData, parentContainerData) {
        const sceneController = window.modlerComponents?.sceneController;
        if (!sceneController) {
            console.error('addContainerToContainer: SceneController not available');
            return false;
        }

        // Validate both containers
        if (!childContainerData || !childContainerData.isContainer || !childContainerData.mesh) {
            console.error('addContainerToContainer: Invalid child container data');
            return false;
        }

        if (!parentContainerData || !parentContainerData.isContainer || !parentContainerData.mesh) {
            console.error('addContainerToContainer: Invalid parent container data');
            return false;
        }

        // Check for circular references
        if (sceneController.wouldCreateCircularReference(childContainerData.id, parentContainerData.id)) {
            console.error('addContainerToContainer: Would create circular reference');
            return false;
        }

        // Check nesting depth limit (prevent overly complex hierarchies)
        const currentDepth = sceneController.getContainerNestingDepth(parentContainerData.id);
        if (currentDepth >= 5) { // Max 5 levels deep
            console.error('addContainerToContainer: Maximum nesting depth reached (5 levels)');
            return false;
        }

        const childMesh = childContainerData.mesh;
        const parentMesh = parentContainerData.mesh;

        // Use specialized nested container positioning
        if (!PositionTransform.preserveNestedContainerPosition(childMesh, parentMesh)) {
            console.error('Failed to preserve nested container position');
            return false;
        }

        // Update the data structure
        sceneController.setParentContainer(childContainerData.id, parentContainerData.id, false);

        // Resize parent container to fit the new child container
        // Preserve parent position to avoid moving all child objects
        this.resizeContainerToFitChildren(parentContainerData, null, true);

        // If the child container also has children, we may need cascading updates
        const childChildren = sceneController.getChildObjects(childContainerData.id);
        if (childChildren.length > 0) {
            // The child container may also need to resize after coordinate space changes
            this.resizeContainerToFitChildren(childContainerData, null, true);
        }

        // Legacy meshSynchronizer removed - support meshes now self-contained children

        // Update UI hierarchies
        if (window.notifyObjectHierarchyChanged) {
            window.notifyObjectHierarchyChanged();
        }

        // Legacy support for old object list
        if (window.populateObjectList) {
            setTimeout(() => {
                window.populateObjectList();
            }, 10);
        }

        return true;
    }

    /**
     * Enhanced addObjectToContainer that supports both objects and containers
     * @param {Object} objectData - Object or container to add
     * @param {Object} containerData - Target container
     * @returns {boolean} Success status
     */
    addObjectOrContainerToContainer(objectData, containerData) {
        // If the object is a container, use specialized container nesting
        if (objectData.isContainer) {
            return this.addContainerToContainer(objectData, containerData);
        } else {
            // Use existing logic for regular objects
            return this.addObjectToContainer(objectData, containerData);
        }
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
            // When removing objects from container, preserve container position to avoid moving remaining child objects
            this.resizeContainerToFitChildren(parentContainer, null, true);
        }

        // Trigger hierarchy update for new Svelte UI
        if (window.notifyObjectHierarchyChanged) {
            window.notifyObjectHierarchyChanged();
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

        /**
         * SIMPLIFIED CONTAINER EXPANSION:
         * Use LayoutEngine's unified bounds calculation instead of custom local bounds calculation
         * This eliminates duplicate geometry logic and leverages the centralized bounds system
         */

        // Use LayoutEngine's unified bounds calculation for consistency
        const childMeshes = childObjects.map(child => child.mesh);
        const localBounds = window.LayoutEngine.calculateUnifiedBounds(childMeshes, {
            type: 'layout',
            useWorldSpace: false  // Local space calculation
        });

        if (!localBounds) {
            console.error('Failed to calculate unified bounds for container children');
            return false;
        }

        // Calculate the correct container position to center it around the child objects
        const currentContainerPosition = containerData.mesh.position.clone();
        const targetWorldPosition = currentContainerPosition.clone().add(localBounds.center);

        const success = this.updateContainerGeometryWithFactories(
            containerData,
            localBounds.size,
            targetWorldPosition,
            true // Reposition container to center around child objects
        );

        if (success) {
            // Calculate the offset that the container moved
            const containerMovement = targetWorldPosition.clone().sub(currentContainerPosition);

            // Compensate child object positions so they don't move in world space
            // Since children are in container's local space, we need to subtract the container movement
            childObjects.forEach(childObj => {
                if (childObj.mesh) {
                    // Move child in opposite direction to compensate for container movement
                    childObj.mesh.position.sub(containerMovement);

                    // Update the child object data to reflect the new position
                    sceneController.updateObject(childObj.id, {
                        position: childObj.mesh.position.clone()
                    });
                }
            });

            // Update container position to the calculated bounds center
            sceneController.updateObject(containerData.id, { position: targetWorldPosition });
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

        // SIMPLIFIED ARCHITECTURE: Container never moves during auto-layout, only resizes
        // This eliminates coordinate system mismatches and prevents object positioning breakage
        const success = this.updateContainerGeometryWithFactories(
            containerData,
            layoutBounds.size,
            containerData.mesh.position, // Keep current position
            false // shouldReposition = false
        );

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

        return this.updateContainerGeometryWithFactories(
            containerData,
            size,
            containerData.mesh.position,
            false // shouldReposition = false
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
            this.showContainer(containerData.id);
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

    /**
     * Show container wireframe
     */
    showContainer(containerId, force = false) {
        const sceneController = window.modlerComponents?.sceneController;
        if (!sceneController) return false;

        const objectData = sceneController.getObject(containerId);
        if (!objectData || !objectData.isContainer || !objectData.mesh) {
            return false;
        }

        // NEW ARCHITECTURE: Show wireframe child instead of main mesh
        const mainMesh = objectData.mesh;
        const wireframeChild = mainMesh.children.find(child => child.userData.supportMeshType === 'wireframe');

        if (wireframeChild) {
            wireframeChild.visible = true;

            // Restore original opacity if it was hidden
            if (wireframeChild.material && wireframeChild.userData.isHidden) {
                const originalOpacity = wireframeChild.userData.originalOpacity;
                if (originalOpacity !== undefined) {
                    wireframeChild.material.opacity = originalOpacity;
                }
                wireframeChild.userData.isHidden = false;
            }

            return true;
        }

        return false;
    }

    /**
     * Hide container wireframe (but keep contents visible)
     */
    hideContainer(containerId, force = false) {
        const sceneController = window.modlerComponents?.sceneController;
        if (!sceneController) return false;

        const objectData = sceneController.getObject(containerId);
        if (!objectData || !objectData.isContainer || !objectData.mesh) {
            return false;
        }

        // NEW ARCHITECTURE: Hide wireframe child (main mesh stays invisible, children stay visible)
        const mainMesh = objectData.mesh;
        const wireframeChild = mainMesh.children.find(child => child.userData.supportMeshType === 'wireframe');

        if (wireframeChild) {
            // Store original opacity for restoration
            if (wireframeChild.material && !wireframeChild.userData.isHidden) {
                wireframeChild.userData.originalOpacity = wireframeChild.material.opacity;
            }

            // Hide wireframe child completely - child objects remain visible as they're separate meshes
            wireframeChild.visible = false;
            wireframeChild.userData.isHidden = true; // Mark as logically hidden
            return true;
        }

        return false;
    }

    /**
     * Check if container has non-zero padding
     */
    hasNonZeroPadding(objectData) {
        if (!objectData?.autoLayout?.padding) return false;

        const padding = objectData.autoLayout.padding;
        return padding.top > 0 || padding.bottom > 0 || padding.left > 0 ||
               padding.right > 0 || padding.front > 0 || padding.back > 0;
    }

    /**
     * Show padding visualization for container
     */
    showPaddingVisualization(containerId) {
        const sceneController = window.modlerComponents?.sceneController;
        if (!sceneController) return false;

        const objectData = sceneController.getObject(containerId);
        if (!objectData || !objectData.isContainer) {
            return false;
        }

        // Use visual effects to show padding guides (if available)
        const visualEffects = window.modlerComponents?.visualEffects;
        if (visualEffects && objectData.mesh && objectData.autoLayout?.padding) {
            if (typeof visualEffects.showPaddingVisualization === 'function') {
                try {
                    visualEffects.showPaddingVisualization(objectData.mesh, objectData.autoLayout.padding);
                    return true;
                } catch (error) {
                    console.warn('Padding visualization failed:', error);
                }
            }
        }

        // Padding visualization is optional - return success even if not available
        return true;
    }

    /**
     * Hide padding visualization for container
     */
    hidePaddingVisualization(containerId) {
        const sceneController = window.modlerComponents?.sceneController;
        if (!sceneController) return false;

        const objectData = sceneController.getObject(containerId);
        if (!objectData || !objectData.isContainer) {
            return false;
        }

        // Use visual effects to hide padding guides (if available)
        const visualEffects = window.modlerComponents?.visualEffects;
        if (visualEffects && objectData.mesh) {
            if (typeof visualEffects.hidePaddingVisualization === 'function') {
                try {
                    visualEffects.hidePaddingVisualization(objectData.mesh);
                    return true;
                } catch (error) {
                    console.warn('Padding visualization hide failed:', error);
                }
            }
        }

        // Padding visualization is optional - return success even if not available
        return true;
    }

    /**
     * Refresh container materials
     */
    refreshMaterials() {
        const sceneController = window.modlerComponents?.sceneController;
        if (!sceneController) return false;

        try {
            // Get all container objects and refresh their materials
            const allObjects = sceneController.getAllObjects();
            let refreshed = 0;

            allObjects.forEach(objectData => {
                if (objectData.isContainer && objectData.mesh?.material) {
                    objectData.mesh.material.needsUpdate = true;
                    refreshed++;
                }
            });

            if (refreshed > 0) {
                console.log(`✅ Refreshed materials for ${refreshed} containers`);
            }
            return true;
        } catch (error) {
            console.error('Failed to refresh container materials:', error);
            return false;
        }
    }
}

// Export for use in main application
window.ContainerCrudManager = ContainerCrudManager;