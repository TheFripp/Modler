import * as THREE from 'three';
/**
 * SceneLayoutManager - Container Layout and Sizing Operations
 *
 * Extracted from SceneController as part of Phase 5 refactoring.
 * Manages all container auto-layout functionality, hug sizing, and layout calculations.
 *
 * Responsibilities:
 * - Enable/disable auto-layout on containers
 * - Calculate and apply layout positions and sizes
 * - Hug container sizing (fit to children)
 * - Layout utility functions (center calculation, size extraction)
 *
 * Dependencies:
 * - LayoutEngine (window.LayoutEngine) - Layout calculation algorithm
 * - GeometryUtils (window.GeometryUtils) - Geometry manipulation
 * - ContainerCrudManager - Container resize operations
 * - ObjectStateManager - calculatedGap persistence
 * - ObjectEventBus - Layout property change notifications
 * - SceneController - Object queries, dimension updates
 *
 * @class SceneLayoutManager
 */
class SceneLayoutManager {
    constructor() {
        // Component references (lazy-loaded via getters)
        this.sceneController = null;
        this.containerCrudManager = null;
        this.objectStateManager = null;

        // Hug update throttling
        this.hugUpdatesEnabled = true;
    }

    /**
     * Initialize the layout manager
     * @param {SceneController} sceneController - Reference to scene controller
     */
    initialize(sceneController) {
        this.sceneController = sceneController;
        return true;
    }

    /**
     * Get ContainerCrudManager (lazy-loaded)
     */
    getContainerCrudManager() {
        if (!this.containerCrudManager) {
            this.containerCrudManager = window.modlerComponents?.containerCrudManager;
        }
        return this.containerCrudManager;
    }

    /**
     * Get ObjectStateManager (lazy-loaded)
     */
    getObjectStateManager() {
        if (!this.objectStateManager) {
            this.objectStateManager = window.modlerComponents?.objectStateManager;
        }
        return this.objectStateManager;
    }

    /**
     * Enable auto layout on a container
     * Initializes layout configuration and performs initial layout calculation
     *
     * @param {number} containerId - Container object ID
     * @param {Object} layoutConfig - Layout configuration
     * @param {string} layoutConfig.direction - Layout direction ('x', 'y', 'z', 'xy', 'xyz')
     * @param {number} layoutConfig.gap - Gap between objects in world units
     * @param {Object} layoutConfig.padding - Padding configuration {width, height, depth} - inset from container walls
     * @returns {boolean} True if layout was successfully enabled
     */
    enableAutoLayout(containerId, layoutConfig) {
        if (!this.sceneController) {
            console.error('SceneLayoutManager: SceneController not initialized');
            return false;
        }

        const container = this.sceneController.getObject(containerId);
        if (!container || !container.isContainer) {
            return false;
        }

        // CRITICAL FIX: Reset child positions to prepare for layout calculation
        // When layout is enabled on an existing container, children may be at preserved world positions
        // Layout system expects children to start from container-relative positions near (0,0,0)
        this.resetChildPositionsForLayout(containerId);

        container.autoLayout = {
            enabled: true,
            direction: layoutConfig.direction || 'x',
            gap: layoutConfig.gap || 0,
            padding: layoutConfig.padding || { width: 0, height: 0, depth: 0 },
            ...layoutConfig
        };

        const layoutResult = this.updateLayout(containerId);

        // Resize container to fit the laid out objects
        if (layoutResult && layoutResult.success) {
            const containerCrudManager = this.getContainerCrudManager();
            if (containerCrudManager) {
                // UNIFIED API: Auto-layout enabled/changed
                containerCrudManager.resizeContainer(container, {
                    reason: 'layout-updated',
                    layoutBounds: layoutResult.layoutBounds,
                    immediate: true
                });
            }
        }

        return true;
    }

    /**
     * Disable auto layout on a container
     * @param {number} containerId - Container object ID
     * @returns {boolean} True if layout was successfully disabled
     */
    disableAutoLayout(containerId) {
        if (!this.sceneController) return false;

        const container = this.sceneController.getObject(containerId);
        if (!container) return false;

        container.autoLayout = null;
        return true;
    }

    /**
     * Reset child positions to prepare for layout calculation
     * Centers children along all axes so layout starts from container center
     * @param {number} containerId - Container object ID
     */
    resetChildPositionsForLayout(containerId) {
        if (!this.sceneController) return;

        const childObjects = this.sceneController.getChildObjects(containerId);
        if (childObjects.length === 0) return;

        const container = this.sceneController.getObject(containerId);
        if (!container || !container.mesh || !container.autoLayout) return;

        const layoutDirection = container.autoLayout.direction;

        // Get container world position for coordinate conversion
        const containerWorldPosition = container.mesh.getWorldPosition(new THREE.Vector3());

        // Use origin as layout anchor to center the layout properly
        container.layoutAnchor = new THREE.Vector3(0, 0, 0);

        // Calculate the center of all children in container's local space
        const childCenters = { x: 0, y: 0, z: 0 };
        let count = 0;

        childObjects.forEach((childData) => {
            if (childData.mesh) {
                const worldPos = childData.mesh.getWorldPosition(new THREE.Vector3());
                const relativePos = worldPos.clone().sub(containerWorldPosition);
                childCenters.x += relativePos.x;
                childCenters.y += relativePos.y;
                childCenters.z += relativePos.z;
                count++;
            }
        });

        if (count > 0) {
            childCenters.x /= count;
            childCenters.y /= count;
            childCenters.z /= count;
        }

        // Convert each child to container-relative coordinates and center ALL axes
        // This ensures the layout group is centered in the container
        childObjects.forEach((childData) => {
            if (childData.mesh) {
                const worldPos = childData.mesh.getWorldPosition(new THREE.Vector3());
                const relativePos = worldPos.clone().sub(containerWorldPosition);

                // Center children on ALL axes (layout will redistribute them along layout axis)
                relativePos.x -= childCenters.x;
                relativePos.y -= childCenters.y;
                relativePos.z -= childCenters.z;

                childData.mesh.position.copy(relativePos);
                childData.mesh.updateMatrixWorld();
            }
        });
    }

    /**
     * Calculate the size-weighted center position of multiple objects
     * @param {Array} objectsData - Array of object data with mesh and size information
     * @returns {THREE.Vector3} Size-weighted center position
     */
    calculateObjectsCenter(objectsData) {
        if (objectsData.length === 0) return new THREE.Vector3(0, 0, 0);

        let totalWeight = 0;
        const weightedSum = new THREE.Vector3(0, 0, 0);

        objectsData.forEach(objData => {
            if (!objData.mesh) return;

            // Get object position in world space
            const position = objData.mesh.getWorldPosition(new THREE.Vector3());

            // Calculate object size using LayoutEngine for consistency
            const size = window.LayoutEngine ?
                window.LayoutEngine.getObjectSize(objData) :
                new THREE.Vector3(1, 1, 1);

            // Calculate volume as weight (width × height × depth)
            const volume = size.x * size.y * size.z;

            // Add weighted position to sum
            weightedSum.add(position.clone().multiplyScalar(volume));
            totalWeight += volume;
        });

        // Return size-weighted center
        if (totalWeight > 0) {
            return weightedSum.divideScalar(totalWeight);
        } else {
            // Fallback to geometric center if no valid sizes
            const positions = objectsData.map(obj => obj.mesh.getWorldPosition(new THREE.Vector3()));
            const sum = positions.reduce((acc, pos) => acc.add(pos), new THREE.Vector3(0, 0, 0));
            return sum.divideScalar(positions.length);
        }
    }

    /**
     * Get container size from mesh geometry
     * @param {Object} container - Container object data
     * @returns {THREE.Vector3} Container size
     */
    getContainerSize(container) {
        if (!container || !container.mesh || !container.mesh.geometry) {
            return new THREE.Vector3(1, 1, 1); // Default size
        }

        const dimensions = GeometryUtils.getGeometryDimensions(container.mesh.geometry);
        if (dimensions) {
            return new THREE.Vector3(dimensions.x, dimensions.y, dimensions.z);
        }

        return new THREE.Vector3(1, 1, 1); // Fallback
    }

    /**
     * Update layout for a container and its children
     * @param {number} containerId - Container object ID
     * @param {Object} pushContext - Optional push context for push operations
     * @returns {Object} Layout result {success, reason, layoutBounds}
     */
    updateLayout(containerId, pushContext = null) {
        if (!this.sceneController) {
            return { success: false, reason: 'SceneController not initialized' };
        }

        const container = this.sceneController.getObject(containerId);

        if (!container || !container.autoLayout || !container.autoLayout.enabled) {
            return { success: false, reason: 'container or autoLayout not ready' };
        }

        // Get child objects of this container
        const children = this.sceneController.getChildObjects(containerId);
        if (children.length === 0) {
            return { success: true, reason: 'no children' };
        }

        // Require LayoutEngine for layout calculations
        if (!window.LayoutEngine) {
            return { success: false, reason: 'LayoutEngine not available' };
        }

        // Disable hug updates during layout to prevent intermediate updates
        const wasHugEnabled = this.hugUpdatesEnabled;
        this.hugUpdatesEnabled = false;

        try {
            // Get container size for fill calculations
            // CRITICAL: Always pass containerSize when layout is enabled, even for hug containers
            // Fill objects need the container size to calculate their dimensions
            const containerSize = this.getContainerSize(container);

            // Pass the layout anchor if it exists (preserves original center when switching to layout mode)
            const layoutAnchor = container.layoutAnchor || null;
            const layoutResult = window.LayoutEngine.calculateLayout(children, container.autoLayout, containerSize, layoutAnchor, pushContext);

            this.applyLayoutPositionsAndSizes(children, layoutResult.positions, layoutResult.sizes, container, pushContext);

            // Store calculated gap directly on container for display (no recursion)
            if (layoutResult.calculatedGap !== undefined) {
                container.calculatedGap = layoutResult.calculatedGap;

                // CRITICAL: Also update ObjectStateManager's copy so it's included in serialization
                const objectStateManager = this.getObjectStateManager();
                if (objectStateManager) {
                    const osmObject = objectStateManager.getObject(container.id);
                    if (osmObject) {
                        osmObject.calculatedGap = layoutResult.calculatedGap;
                    }
                }

                // Notify UI directly via event bus (triggers PostMessage with updated calculatedGap)
                // CRITICAL: Skip event emission during push operations to prevent property panel flickering
                if (window.objectEventBus && container.id && !pushContext) {
                    window.objectEventBus.emit(
                        window.objectEventBus.EVENT_TYPES.HIERARCHY,
                        container.id,
                        {
                            type: 'layout-property-changed',
                            property: 'calculatedGap',
                            value: layoutResult.calculatedGap,
                            source: 'layout-drag-update' // Mark as preview operation for MainAdapter filtering
                        },
                        { immediate: true, source: 'SceneLayoutManager.updateLayout' }
                    );
                }
            }

            // Use bounds directly from LayoutEngine (architectural improvement)
            const layoutBounds = layoutResult.bounds;

            // Resize container to match new layout bounds
            // CRITICAL: Don't resize if any child has fill mode - container size is fixed when children fill
            if (layoutBounds && layoutBounds.size && !this._hasChildWithFill(children)) {
                const containerCrudManager = this.getContainerCrudManager();
                if (containerCrudManager) {
                    // UNIFIED API: Layout recalculated (via updateLayout)
                    containerCrudManager.resizeContainer(container, {
                        reason: 'layout-updated',
                        layoutBounds: layoutBounds,
                        pushContext: pushContext,
                        immediate: true
                    });
                }
            }

            return { success: true, layoutBounds };

        } finally {
            // Re-enable hug updates
            this.hugUpdatesEnabled = wasHugEnabled;

            // If this is a hug container, trigger a single update now that layout is complete
            // CRITICAL: Don't hug if any child has fill mode - this creates circular dependency
            if (container.containerMode === 'hug' || container.isHug) {
                if (!this._hasChildWithFill(children)) {
                    this.updateHugContainerSize(containerId);
                }
            }
        }
    }

    /**
     * Apply calculated positions and sizes to objects
     * @param {Array} objects - Array of object data
     * @param {Array} positions - Array of position vectors
     * @param {Array} sizes - Array of size vectors
     * @param {Object} container - Container object data
     * @param {Object} pushContext - Optional push context for push operations
     */
    applyLayoutPositionsAndSizes(objects, positions, sizes, container = null, pushContext = null) {
        if (!this.sceneController) return;

        if (objects.length !== positions.length || objects.length !== sizes.length) {
            return;
        }

        objects.forEach((obj, index) => {
            const layoutPosition = positions[index];
            const layoutSize = sizes[index];

            // Apply fill-based sizing BEFORE positioning
            if (layoutSize && obj.layoutProperties) {
                // Check each axis for fill behavior
                ['x', 'y', 'z'].forEach(axis => {
                    // Use centralized state machine
                    const fillEnabled = this.getObjectStateManager()?.hasFillEnabled(obj.id, axis);

                    if (fillEnabled) {
                        // Only update if size has actually changed to avoid unnecessary geometry updates
                        const currentDim = obj.dimensions?.[axis] || 1;
                        const newDim = layoutSize[axis];

                        // Validate dimension is a valid number
                        if (typeof newDim === 'number' && !isNaN(newDim) && newDim > 0) {
                            if (Math.abs(currentDim - newDim) > 0.001) {
                                // Fill objects always resize symmetrically from center
                                // Layout engine handles repositioning based on alignment
                                const anchorMode = 'center';

                                // Suppress events during push to prevent property panel flickering
                                const suppressEvents = pushContext !== null;
                                this.sceneController.updateObjectDimensions(obj.id, axis, newDim, anchorMode, suppressEvents);
                            }
                        }
                    }
                });
            }

            // Apply layout positions - layout engine calculates positions based on:
            // - Alignment (perpendicular to layout axis)
            // - Fill/fixed sizing (layout axis)
            // - Gap distribution
            {
                // CRITICAL: During perpendicular push, only update the pushed axis
                // Preserve layout axis positions to avoid objects snapping back
                const layoutAxis = container.autoLayout?.direction || 'x';
                const isPushingPerpendicular = pushContext && pushContext.axis !== layoutAxis;

                // Normal layout update - apply positions
                // CRITICAL FIX: Use local positions when objects are children of container
                // Layout positions are already relative to container coordinate space
                if (container && container.mesh && obj.mesh.parent === container.mesh) {
                    // Object is child of container - use layout position directly as local position
                    if (isPushingPerpendicular) {
                        // Only update the pushed axis, preserve layout axis position
                        obj.mesh.position[pushContext.axis] = layoutPosition[pushContext.axis];
                    } else {
                        // Normal layout update - apply all positions
                        obj.mesh.position.copy(layoutPosition);
                    }

                    // Update object data position to maintain consistency (world position)
                    obj.position = obj.mesh.getWorldPosition(new THREE.Vector3());

                } else {
                    // Object not in container hierarchy - use world position (fallback)
                    const containerPosition = container && container.mesh ? container.mesh.position : new THREE.Vector3(0, 0, 0);

                    if (isPushingPerpendicular) {
                        // Only update the pushed axis
                        const worldPos = layoutPosition[pushContext.axis] + containerPosition[pushContext.axis];
                        obj.mesh.position[pushContext.axis] = worldPos;
                        obj.position = obj.mesh.getWorldPosition(new THREE.Vector3());
                    } else {
                        // Normal layout update - apply all positions
                        const worldPosition = new THREE.Vector3()
                            .copy(layoutPosition)
                            .add(containerPosition);

                        obj.mesh.position.copy(worldPosition);
                        obj.position = worldPosition.clone();
                    }
                }
            }
            // During push: positions are NOT updated - objects stay where they are

            // Transform change notification handled by mesh synchronizer
        });
    }

    /**
     * Update container size to hug its children
     * Resizes container to fit all children with minimal padding
     * UNIFIED API: Delegates to ContainerCrudManager for consistency
     * @param {string} containerId - ID of the container to update
     */
    updateHugContainerSize(containerId) {
        if (!this.sceneController) return;

        const containerData = this.sceneController.getObject(containerId);
        if (!containerData || !containerData.isContainer || !containerData.mesh) {
            return;
        }

        // Get all children
        const children = this.sceneController.getChildObjects(containerId);
        if (children.length === 0) {
            return;
        }

        // Calculate bounding box that contains all children in LOCAL space (relative to container)
        const bbox = new THREE.Box3();
        children.forEach(child => {
            if (child.mesh && child.mesh.geometry) {
                // Get child's bounding box in its local space
                child.mesh.geometry.computeBoundingBox();
                const childBox = child.mesh.geometry.boundingBox.clone();

                // Transform to child's world space
                childBox.applyMatrix4(child.mesh.matrixWorld);

                // Then transform to container's local space
                const containerWorldMatrixInverse = containerData.mesh.matrixWorld.clone().invert();
                childBox.applyMatrix4(containerWorldMatrixInverse);

                bbox.union(childBox);
            }
        });

        // Get the center of the bounding box in container's local space
        const bboxCenter = bbox.getCenter(new THREE.Vector3());

        // Calculate new dimensions
        const newSize = bbox.getSize(new THREE.Vector3());

        // CRITICAL: The container needs to move so that its center aligns with the bbox center
        // This keeps the children in the same position relative to world space
        containerData.mesh.position.add(bboxCenter);
        containerData.mesh.updateMatrixWorld(true);

        // Now update all children positions to compensate for the container movement
        children.forEach(child => {
            if (child.mesh) {
                child.mesh.position.sub(bboxCenter);
                child.mesh.updateMatrixWorld(true);
            }
        });

        // Update container geometry (now centered at origin in its local space)
        const geometryUtils = window.GeometryUtils;
        if (geometryUtils && containerData.mesh.geometry) {
            geometryUtils.resizeGeometry(containerData.mesh.geometry, 'x', newSize.x, 'center');
            geometryUtils.resizeGeometry(containerData.mesh.geometry, 'y', newSize.y, 'center');
            geometryUtils.resizeGeometry(containerData.mesh.geometry, 'z', newSize.z, 'center');

            // Dimensions automatically updated via DimensionManager getter from geometry

            // Update support meshes (selection box, wireframe)
            const supportMeshFactory = window.modlerComponents?.supportMeshFactory;
            if (supportMeshFactory) {
                supportMeshFactory.updateSupportMeshGeometries(containerData.mesh, false);
            }
        }
    }
    /**
     * Check if any child has fill mode enabled on any axis
     */
    _hasChildWithFill(children) {
        return children.some(child => {
            const lp = child.layoutProperties;
            return lp && (lp.sizeX === 'fill' || lp.sizeY === 'fill' || lp.sizeZ === 'fill');
        });
    }
}

// Export for use in Modler V2
window.SceneLayoutManager = SceneLayoutManager;
