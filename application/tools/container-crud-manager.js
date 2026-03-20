import * as THREE from 'three';
// Modler V2 - Container CRUD Operations
// Container creation, configuration, and lifecycle management (Create, Read, Update, Delete)
// 38 methods covering: creation, nesting, resizing, layout integration, visibility, cleanup
// Current: ~910 lines - compact methods, comprehensive container lifecycle

class ContainerCrudManager {
    constructor() {
        // Simple throttle tracking for resize operations
        this.lastResizeTime = new Map(); // containerId -> timestamp
        this.throttleDelay = 16; // milliseconds - 60 FPS

        // Centralized state management
        this.objectStateManager = null;
        setTimeout(() => {
            this.objectStateManager = window.modlerComponents?.objectStateManager;
        }, 50);
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

        // Layout direction no longer needed - layout-aware wireframes removed
        const success = LayoutGeometry.updateContainerGeometry(
            containerData.mesh,
            size,
            newCenter || containerData.mesh.position,
            shouldReposition,
            null, // layoutDirection parameter kept for compatibility but ignored
            geometryFactory,
            materialManager
        );

        // ARCHITECTURE SIMPLIFICATION: Explicit wireframe update after geometry change
        if (success) {
            const geometryUtils = window.GeometryUtils;
            if (geometryUtils) {
                geometryUtils.updateSupportMeshGeometries(containerData.mesh);
            }
        }

        return success;
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

    // ========================================================================
    // UNIFIED CONTAINER RESIZE API
    // ========================================================================

    /**
     * Smart container resize - automatically detects context and chooses behavior
     *
     * This is the NEW unified API for all container resizing operations.
     * Replaces the need to manually choose between resizeContainerToFitChildren
     * and resizeContainerToLayoutBounds based on mode detection.
     *
     * @param {Object|string|number} containerOrId - Container data or ID
     * @param {Object} options - Resize context and parameters
     * @param {string} options.reason - Why resize? 'child-changed'|'child-added'|'child-removed'|'mode-changed'|'layout-updated'|'creation'
     * @param {Object} [options.layoutBounds] - Pre-calculated layout bounds (layout mode only)
     * @param {boolean} [options.immediate=false] - Bypass throttling for immediate update
     * @param {Object} [options.pushContext] - Push tool context for layout bounds
     * @returns {boolean} Success status
     *
     * @example
     * // Child moved in hug container
     * containerCrudManager.resizeContainer(containerId, { reason: 'child-changed' });
     *
     * @example
     * // Layout configuration updated
     * containerCrudManager.resizeContainer(containerId, {
     *     reason: 'layout-updated',
     *     layoutBounds: layoutResult.layoutBounds
     * });
     *
     * @example
     * // Object added to container
     * containerCrudManager.resizeContainer(containerId, {
     *     reason: 'child-added',
     *     immediate: true
     * });
     */
    resizeContainer(containerOrId, options = {}) {
        // Resolve container from ID or object
        const container = this.resolveContainer(containerOrId);
        if (!container) {
            console.warn('resizeContainer: Invalid container provided');
            return false;
        }

        // Extract context
        const {
            reason = 'child-changed',  // Default reason
            layoutBounds = null,
            immediate = false,
            pushContext = null
        } = options;

        // Detect container mode automatically
        const mode = this.detectContainerMode(container);

        // Route to appropriate handler based on mode
        switch (mode) {
            case 'layout':
                return this.resizeForLayoutMode(container, { layoutBounds, pushContext, immediate });

            case 'hug':
                return this.resizeForHugMode(container, { reason, immediate });

            case 'fixed':
                // Fixed containers don't auto-resize
                return false;

            default:
                console.warn('resizeContainer: Unknown container mode', mode);
                return false;
        }
    }

    /**
     * Resolve container from ID or object
     * @private
     */
    resolveContainer(containerOrId) {
        // Already a container object
        if (containerOrId && typeof containerOrId === 'object' && containerOrId.mesh) {
            return containerOrId;
        }

        // Container ID - resolve from SceneController
        if (typeof containerOrId === 'string' || typeof containerOrId === 'number') {
            const sceneController = window.modlerComponents?.sceneController;
            if (sceneController) {
                return sceneController.getObject(containerOrId);
            }
        }

        return null;
    }

    /**
     * Detect container mode (hug/layout/fixed)
     * @private
     */
    detectContainerMode(container) {
        // Use centralized state machine
        const mode = this.objectStateManager?.getContainerMode(container.id);

        if (mode) {
            return mode; // 'layout', 'hug', or 'manual'
        }

        // Fallback: check fixed mode explicitly (legacy)
        if (container.containerMode === 'manual' || container.sizingMode === 'fixed') {
            return 'manual';
        }

        // Default: hug mode (container wraps children)
        return 'hug';
    }

    /**
     * Resize container in hug mode (adapts to children)
     * @private
     */
    resizeForHugMode(container, { reason, immediate }) {
        // SMART DEFAULT: Preserve position for child changes, reposition for structural changes
        const preservePosition = (
            reason === 'child-changed' ||       // BOTTOM-UP: child moved/resized
            reason === 'child-transformed'      // BOTTOM-UP: child rotated/scaled
        );

        return this._resizeToFitChildren(
            container,
            null,           // newContainerSize - calculate from children
            immediate,      // immediateUpdate - bypass throttling if requested
            preservePosition // preservePosition - smart default based on reason
        );
    }

    /**
     * Resize container in layout mode (uses pre-calculated bounds)
     * @private
     */
    resizeForLayoutMode(container, { layoutBounds, pushContext, immediate }) {
        // If no bounds provided, calculate layout first
        if (!layoutBounds) {
            const sceneController = window.modlerComponents?.sceneController;
            if (sceneController) {
                const layoutResult = sceneController.updateLayout(container.id);
                layoutBounds = layoutResult?.layoutBounds;
            }
        }

        // No bounds available - can't resize
        if (!layoutBounds) {
            return false;
        }

        return this._resizeToLayoutBounds(container, layoutBounds, pushContext);
    }

    // ========================================================================
    // END UNIFIED API
    // ========================================================================

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
     * Create auto layout container from selected objects
     * @param {Array} selectedObjects - Array of selected mesh objects
     * @returns {boolean} True if container was successfully created
     */
    createContainerFromSelection(selectedObjects) {
        const sceneController = window.modlerComponents?.sceneController;
        if (!sceneController) {
            console.error('createContainerFromSelection: SceneController not available');
            return false;
        }
        if (!Array.isArray(selectedObjects) || selectedObjects.length === 0) {
            console.error('createContainerFromSelection: Invalid selected objects');
            return false;
        }
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


        const containerObject = sceneController.addObject(edgeContainer, null, {
            name: sceneController.generateObjectName('container'),
            type: 'container',
            position: bounds.center.clone(),
            isContainer: true,
            selectable: true, // Container must be selectable for raycasting and face highlighting
            containerMode: 'hug',
            originalBounds: bounds // Store original bounds for interactive mesh creation
            // autoLayout provided by schema factory in SceneLifecycleManager
        });


        if (!containerObject) {
            console.error('Failed to create container object');
            return null;
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

            // Make container temporarily selectable for selection
            containerObject.selectable = true;
            selectionController.select(containerObject.mesh);

            // Force visualization update to show container highlight
            const visualizationManager = window.modlerComponents?.visualizationManager;
            if (visualizationManager) {
                visualizationManager.setState(containerObject.mesh, 'selected');
            }
        }

        // Hierarchy updates handled automatically by PropertyPanelSync listening to HIERARCHY events
        // Manual calls removed to avoid race conditions with event-driven updates
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
            selectable: true, // Container must be selectable for raycasting and face highlighting
            containerMode: 'hug' // Default container sizing mode - automatically resizes to fit children
            // autoLayout provided by schema factory in SceneLifecycleManager
        });

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
            objectData.containerMode = 'hug';
            objectData.sizingMode = 'hug'; // Legacy compat
            objectData.isHug = true; // Legacy compat
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
        const validation = this.validateContainer(containerData, 'addObjectToContainer');
        if (!validation.success) return false;
        if (!objectData || !objectData.mesh) {
            console.error('addObjectToContainer: Invalid object data');
            return false;
        }

        const sceneController = validation.sceneController;
        const obj = objectData.mesh;
        const containerMesh = containerData.mesh;

        if (!PositionTransform.preserveWorldPosition(obj, containerMesh)) {
            console.error('Failed to preserve world position during container addition');
            return false;
        }

        sceneController.setParentContainer(objectData.id, containerData.id, false);
        // UNIFIED API: Child added to container (re-center container around all children)
        this.resizeContainer(containerData, {
            reason: 'child-added',
            immediate: true
        });

        // Legacy meshSynchronizer removed - support meshes now self-contained children

        // Hierarchy updates handled automatically by PropertyPanelSync listening to events


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

        // UNIFIED API: Child container added to parent (re-center parent)
        this.resizeContainer(parentContainerData, {
            reason: 'child-added',
            immediate: true
        });

        // If the child container also has children, we may need cascading updates
        const childChildren = sceneController.getChildObjects(childContainerData.id);
        if (childChildren.length > 0) {
            // UNIFIED API: Child container may need resize after coordinate space changes
            this.resizeContainer(childContainerData, {
                reason: 'coordinate-space-changed',
                immediate: true
            });
        }

        // Legacy meshSynchronizer removed - support meshes now self-contained children

        // Hierarchy updates handled automatically by PropertyPanelSync listening to events


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
            // UNIFIED API: Child removed from container (re-center around remaining children)
            this.resizeContainer(parentContainer, {
                reason: 'child-removed',
                immediate: true
            });
        }

        // Hierarchy updates handled automatically by PropertyPanelSync listening to events

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
        return this._resizeToFitChildren(containerData);
    }
    
    /**
     * INTERNAL: Resize container to fit its child objects with fill-aware layout support
     * DO NOT call directly - use resizeContainer() instead
     *
     * @param {Object} containerData - Container to resize
     * @param {THREE.Vector3} newContainerSize - Optional target size for fill calculations
     * @param {boolean} immediateUpdate - If true, bypass throttling
     * @param {boolean} preservePosition - If true, resize WITHOUT repositioning (BOTTOM-UP)
     */
    _resizeToFitChildren(containerData, newContainerSize = null, immediateUpdate = false, preservePosition = false) {
        const validation = this.validateContainer(containerData, 'resizeContainerToFitChildren');
        if (!validation.success) return false;

        const sceneController = validation.sceneController;

        // Check sizing mode constraints
        const mode = containerData.containerMode || containerData.sizingMode;
        if (mode === 'fixed' && !newContainerSize) {
            return false;
        }
        if (!containerData.containerMode) {
            containerData.containerMode = 'hug';
            containerData.sizingMode = 'hug'; // Legacy compat
            containerData.isHug = true; // Legacy compat
        }

        // Apply throttling
        if (!immediateUpdate) {
            const lastResize = this.lastResizeTime.get(containerData.id);
            const now = Date.now();
            if (lastResize && (now - lastResize) < this.throttleDelay) {
                return false;
            }
            this.lastResizeTime.set(containerData.id, now);
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

        // ARCHITECTURE FIX: Conditional repositioning based on workflow
        const currentContainerPosition = containerData.mesh.position.clone();
        let targetPosition;
        let shouldRepositionChildren;

        if (preservePosition) {
            // BOTTOM-UP WORKFLOW: Keep container where it is, only change size
            // Use case: Child object moved/resized, container adapts
            targetPosition = currentContainerPosition.clone();
            shouldRepositionChildren = false;

        } else {
            // TOP-DOWN WORKFLOW: Reposition container to center around children
            // Use case: Container creation, object added/removed
            targetPosition = currentContainerPosition.clone().add(localBounds.center);
            shouldRepositionChildren = true;
        }

        const success = this.updateContainerGeometryWithFactories(
            containerData,
            localBounds.size,
            targetPosition,
            !preservePosition  // Only reposition geometry if NOT preserving position
        );

        if (success && shouldRepositionChildren) {
            // Calculate the offset that the container moved
            const containerMovement = targetPosition.clone().sub(currentContainerPosition);

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
        }

        // Update container position
        sceneController.updateObject(containerData.id, { position: targetPosition });
        this.handleContainerVisibilityAfterResize(containerData, immediateUpdate);

        return success;
    }

    /**
     * INTERNAL: Resize container to match layout-calculated bounds
     * DO NOT call directly - use resizeContainer() instead
     */
    _resizeToLayoutBounds(containerData, layoutBounds, pushContext = null) {
        const validation = this.validateContainer(containerData, 'resizeContainerToLayoutBounds');
        if (!validation.success) return false;

        if (!layoutBounds || !layoutBounds.size) {
            console.error('resizeContainerToLayoutBounds: layoutBounds is required');
            return false;
        }

        // Calculate new position if pushing (container grows from pushed edge)
        let newPosition = containerData.mesh.position.clone();

        if (pushContext && pushContext.isPush) {
            const oldSize = containerData.dimensions;
            const newSize = layoutBounds.size;
            const axis = pushContext.axis;
            const anchorMode = pushContext.anchorMode;

            // Calculate size delta
            const sizeDelta = newSize[axis] - oldSize[axis];

            // Adjust position based on anchor mode:
            // - 'min' anchor: growing from max edge (right/top/back) -> shift position in positive direction
            // - 'max' anchor: growing from min edge (left/bottom/front) -> shift position in negative direction
            if (anchorMode === 'min') {
                // Anchor at min edge, grow toward max -> shift by +delta/2
                newPosition[axis] += sizeDelta / 2;
            } else if (anchorMode === 'max') {
                // Anchor at max edge, grow toward min -> shift by -delta/2
                newPosition[axis] -= sizeDelta / 2;
            }

        }

        const success = this.updateContainerGeometryWithFactories(
            containerData,
            layoutBounds.size,
            newPosition,
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
     * Delegates to SupportMeshFactory as single authority for support mesh visibility
     */
    showContainer(containerId, restoreOpacity = false) {
        const sceneController = window.modlerComponents?.sceneController;
        const supportMeshFactory = window.modlerComponents?.supportMeshFactory;
        if (!sceneController) return false;

        const objectData = sceneController.getObject(containerId);
        if (!objectData || !objectData.isContainer || !objectData.mesh) {
            return false;
        }

        if (supportMeshFactory) {
            if (restoreOpacity) {
                supportMeshFactory.restoreContainerWireframeOpacity(objectData.mesh);
            }
            supportMeshFactory.showContainerWireframe(objectData.mesh);
        }

        return true;
    }

    /**
     * Hide container wireframe (but keep contents visible)
     * Delegates to SupportMeshFactory as single authority for support mesh visibility
     */
    hideContainer(containerId) {
        const sceneController = window.modlerComponents?.sceneController;
        const supportMeshFactory = window.modlerComponents?.supportMeshFactory;
        if (!sceneController) return false;

        const objectData = sceneController.getObject(containerId);
        if (!objectData || !objectData.isContainer || !objectData.mesh) {
            return false;
        }

        if (supportMeshFactory) {
            supportMeshFactory.hideContainerWireframe(objectData.mesh);
        }

        return true;
    }

    /**
     * Check if container has non-zero padding
     */
    hasNonZeroPadding(objectData) {
        if (!objectData?.autoLayout?.padding) return false;

        const padding = objectData.autoLayout.padding;
        return padding.width > 0 || padding.height > 0 || padding.depth > 0;
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

            return true;
        } catch (error) {
            console.error('Failed to refresh container materials:', error);
            return false;
        }
    }
}

// Export for use in main application
window.ContainerCrudManager = ContainerCrudManager;