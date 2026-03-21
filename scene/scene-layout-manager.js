import * as THREE from 'three';
/**
 * SceneLayoutManager - Unified Container Layout Orchestrator
 *
 * THE single entry point for all container layout updates across all modes.
 * Every layout rule is coordinated through updateContainer() — no other system
 * performs mode-routing or layout decision-making.
 *
 * Responsibilities:
 * - updateContainer(): Unified entry point for layout/hug/manual modes
 * - Enable/disable auto-layout on containers
 * - Calculate and apply layout positions and sizes (layout mode)
 * - Hug container sizing — fit to children (hug mode)
 * - calculatedGap persistence (THE single location)
 * - Layout utility functions (center calculation, size extraction, child mesh filtering)
 *
 * Dependencies:
 * - LayoutEngine (window.LayoutEngine) - Pure layout calculations
 * - GeometryUtils (window.GeometryUtils) - Geometry manipulation
 * - ContainerCrudManager - Container geometry operations only (applyContainerGeometry)
 * - ObjectStateManager - State queries (hasFillEnabled, getObject)
 * - ObjectEventBus - calculatedGap change notifications
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

        // Guard: prevents recursive container updates (avoids double-resize conflicts)
        this._layoutInProgress = false;
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

    // ====== UNIFIED ENTRY POINT ======

    /**
     * Update a container's layout — THE single entry point for all modes.
     *
     * All callers (LayoutPropagationManager, ObjectStateManager, SceneHierarchyManager,
     * commands, tools) call this method. Mode-routing happens HERE and nowhere else.
     *
     * @param {number|string} containerId - Container object ID
     * @param {Object} context - Optional context
     * @param {Object} context.pushContext - Push tool context {axis, anchorMode}
     * @returns {Object} Result {success: boolean, reason?: string, layoutBounds?: Object}
     */
    updateContainer(containerId, context = {}) {
        if (!this.sceneController) {
            return { success: false, reason: 'SceneController not initialized' };
        }

        const container = this.sceneController.getObject(containerId);
        if (!container || !container.isContainer) {
            return { success: false, reason: 'not a container' };
        }

        const mode = container.containerMode || 'manual';

        // Clear calculatedGap when not in layout mode (THE single clearing location)
        if (mode !== 'layout') {
            container.calculatedGap = undefined;
            const osmObj = this.getObjectStateManager()?.getObject(container.id);
            if (osmObj) osmObj.calculatedGap = undefined;
        }

        switch (mode) {
            case 'layout':
                return this._updateLayoutContainer(container, context);
            case 'hug':
                return this._updateHugContainer(container, context);
            case 'manual':
                return { success: false, reason: 'manual mode' };
            default:
                return { success: false, reason: `unknown mode: ${mode}` };
        }
    }

    // ====== LAYOUT MODE ======

    /**
     * Update a layout-mode container: calculate positions, apply, resize if needed.
     * Uses LayoutEngine.calculateLayoutWithConvergence() to eliminate the re-pass pattern.
     * @private
     */
    _updateLayoutContainer(container, context) {
        const children = this.sceneController.getChildObjects(container.id);
        if (children.length === 0) {
            return { success: true, reason: 'no children' };
        }

        if (!window.LayoutEngine) {
            return { success: false, reason: 'LayoutEngine not available' };
        }

        const wasLayoutInProgress = this._layoutInProgress;
        this._layoutInProgress = true;

        try {
            const pushContext = context.pushContext || null;
            const containerSize = this.getContainerSize(container);
            const fillAxes = this._getAxesWithFillChildren(children);

            // ONE call — convergence (re-pass) handled internally by LayoutEngine
            const result = window.LayoutEngine.calculateLayoutWithConvergence(
                children, container.autoLayout, containerSize, fillAxes, pushContext
            );

            // Apply positions and sizes to Three.js meshes
            this.applyLayoutPositionsAndSizes(children, result.positions, result.sizes, container, pushContext);

            // Persist calculatedGap (THE single write location)
            this._persistCalculatedGap(container, result.calculatedGap, pushContext);

            // Resize container geometry if needed (skip during push — push manages its own geometry)
            if (result.containerResized && !pushContext) {
                this._applyContainerResize(container, result.targetContainerSize);

                // After geometry resize, re-apply positions with the actual new container size
                // (geometry may have been clamped or adjusted by the factory)
                const newContainerSize = this.getContainerSize(container);
                const finalResult = window.LayoutEngine.calculateLayout(
                    children, container.autoLayout, newContainerSize, null, pushContext
                );
                this.applyLayoutPositionsAndSizes(children, finalResult.positions, finalResult.sizes, container, pushContext);
                this._persistCalculatedGap(container, finalResult.calculatedGap, pushContext);
            }

            return { success: true, layoutBounds: result.bounds };

        } finally {
            this._layoutInProgress = wasLayoutInProgress;
        }
    }

    // ====== HUG MODE ======

    /**
     * Update a hug-mode container: resize to fit children tightly.
     * Absorbs logic previously in ContainerCrudManager._resizeToFitChildren().
     * @private
     */
    _updateHugContainer(container, context) {
        if (this._layoutInProgress) {
            return { success: false, reason: 'layout in progress' };
        }

        const children = this.sceneController.getChildObjects(container.id);
        if (children.length === 0) {
            return { success: true, reason: 'no children' };
        }

        if (!window.LayoutEngine) {
            return { success: false, reason: 'LayoutEngine not available' };
        }

        const childMeshes = this.getChildMeshesForBounds(children);
        if (childMeshes.length === 0) {
            return { success: false, reason: 'no valid child meshes' };
        }

        const padding = container.autoLayout?.padding || {};
        const bounds = window.LayoutEngine.calculateHugBounds(childMeshes, padding);

        if (!bounds) {
            return { success: false, reason: 'bounds calculation failed' };
        }

        // Hug containers recenter around children (container moves to wrap them)
        const currentContainerPosition = container.mesh.position.clone();
        const targetPosition = currentContainerPosition.clone().add(bounds.center);

        // Apply geometry resize
        const containerCrudManager = this.getContainerCrudManager();
        if (!containerCrudManager) {
            return { success: false, reason: 'ContainerCrudManager not available' };
        }

        const success = containerCrudManager.updateContainerGeometryWithFactories(
            container, bounds.size, targetPosition, true
        );

        if (success) {
            // Compensate child positions for container movement
            const containerMovement = targetPosition.clone().sub(currentContainerPosition);
            children.forEach(childObj => {
                if (childObj.mesh) {
                    childObj.mesh.position.sub(containerMovement);
                    this.sceneController.updateObject(childObj.id, {
                        position: childObj.mesh.position.clone()
                    });
                }
            });
        }

        // Update container position
        this.sceneController.updateObject(container.id, { position: targetPosition });

        // Handle visibility after resize
        containerCrudManager.handleContainerVisibilityAfterResize(container, true);

        return { success: true };
    }

    // ====== calculatedGap PERSISTENCE (THE single location) ======

    /**
     * Persist calculatedGap on container, OSM copy, and notify UI.
     * This is THE only place calculatedGap is written.
     * @private
     */
    _persistCalculatedGap(container, gap, pushContext) {
        if (gap === undefined) return;

        // Set on SceneController's object
        container.calculatedGap = gap;

        // Set on ObjectStateManager's copy
        const osmObj = this.getObjectStateManager()?.getObject(container.id);
        if (osmObj) osmObj.calculatedGap = gap;

        // Notify UI (skip during push to prevent property panel flickering)
        if (!pushContext && window.objectEventBus && container.id) {
            window.objectEventBus.emit(
                window.objectEventBus.EVENT_TYPES.HIERARCHY,
                container.id,
                {
                    type: 'layout-property-changed',
                    property: 'calculatedGap',
                    value: gap,
                    source: 'layout-drag-update'
                },
                { immediate: true, source: 'SceneLayoutManager.updateContainer' }
            );
        }
    }

    // ====== CONTAINER GEOMETRY HELPERS ======

    /**
     * Apply container resize via ContainerCrudManager (geometry-only operation)
     * @private
     */
    _applyContainerResize(container, targetSize) {
        const containerCrudManager = this.getContainerCrudManager();
        if (!containerCrudManager) return;

        containerCrudManager.updateContainerGeometryWithFactories(
            container, targetSize, container.mesh.position, false
        );
    }

    /**
     * Get child meshes suitable for bounds calculation.
     * For container children, uses the collision mesh instead of the edge container.
     * Moved from ContainerCrudManager — this is a layout concern.
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

    // ====== ENABLE/DISABLE AUTO-LAYOUT ======

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

        // Reset child positions to prepare for layout calculation
        // When layout is enabled on an existing container, children may be at preserved world positions
        this.resetChildPositionsForLayout(containerId);

        container.autoLayout = {
            enabled: true,
            direction: layoutConfig.direction || 'x',
            gap: layoutConfig.gap || 0,
            padding: layoutConfig.padding || { width: 0, height: 0, depth: 0 },
            ...layoutConfig
        };

        this.updateContainer(containerId);

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

    // ====== CHILD POSITION RESET ======

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

        // Get container world position for coordinate conversion
        const containerWorldPosition = container.mesh.getWorldPosition(new THREE.Vector3());

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
        childObjects.forEach((childData) => {
            if (childData.mesh) {
                const worldPos = childData.mesh.getWorldPosition(new THREE.Vector3());
                const relativePos = worldPos.clone().sub(containerWorldPosition);

                relativePos.x -= childCenters.x;
                relativePos.y -= childCenters.y;
                relativePos.z -= childCenters.z;

                childData.mesh.position.copy(relativePos);
                childData.mesh.updateMatrixWorld();
            }
        });
    }

    // ====== UTILITY METHODS ======

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

            const position = objData.mesh.getWorldPosition(new THREE.Vector3());
            const size = window.LayoutEngine ?
                window.LayoutEngine.getObjectSize(objData) :
                new THREE.Vector3(1, 1, 1);

            const volume = size.x * size.y * size.z;
            weightedSum.add(position.clone().multiplyScalar(volume));
            totalWeight += volume;
        });

        if (totalWeight > 0) {
            return weightedSum.divideScalar(totalWeight);
        } else {
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
            return new THREE.Vector3(1, 1, 1);
        }

        const dimensions = GeometryUtils.getGeometryDimensions(container.mesh.geometry);
        if (dimensions) {
            return new THREE.Vector3(dimensions.x, dimensions.y, dimensions.z);
        }

        return new THREE.Vector3(1, 1, 1);
    }

    // ====== BACKWARD-COMPATIBLE SHIMS ======

    /**
     * @deprecated Use updateContainer() instead
     * Backward-compatible shim — delegates to updateContainer()
     */
    updateLayout(containerId, pushContext = null) {
        return this.updateContainer(containerId, { pushContext });
    }

    /**
     * @deprecated Use updateContainer() instead
     * Backward-compatible shim — delegates to updateContainer()
     */
    updateHugContainerSize(containerId) {
        return this.updateContainer(containerId, {});
    }

    // ====== APPLY POSITIONS TO THREE.JS ======

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

        // Compute geometry center offset (non-zero during push when geometry is
        // off-center due to anchored resize — one face fixed, center shifts from origin)
        let geomCenterOffset = null;
        if (pushContext && container && container.mesh && container.mesh.geometry) {
            container.mesh.geometry.computeBoundingBox();
            const bb = container.mesh.geometry.boundingBox;
            if (bb) {
                geomCenterOffset = new THREE.Vector3();
                bb.getCenter(geomCenterOffset);
            }
        }

        objects.forEach((obj, index) => {
            const layoutPosition = positions[index];
            const layoutSize = sizes[index];

            // Apply fill-based sizing BEFORE positioning
            if (layoutSize && obj.layoutProperties) {
                ['x', 'y', 'z'].forEach(axis => {
                    const fillEnabled = this.getObjectStateManager()?.hasFillEnabled(obj.id, axis);

                    if (fillEnabled) {
                        const currentDim = obj.dimensions?.[axis] || 1;
                        const newDim = layoutSize[axis];

                        if (typeof newDim === 'number' && !isNaN(newDim) && newDim > 0) {
                            if (Math.abs(currentDim - newDim) > 0.001) {
                                const anchorMode = 'center';
                                const suppressEvents = pushContext !== null;
                                this.sceneController.updateObjectDimensions(obj.id, axis, newDim, anchorMode, suppressEvents);
                            }
                        }
                    }
                });
            }

            // Apply layout positions
            {
                const layoutAxis = container.autoLayout?.direction || 'x';
                const isPushingPerpendicular = pushContext && pushContext.axis !== layoutAxis;

                if (container && container.mesh && obj.mesh.parent === container.mesh) {
                    // Object is child of container - use layout position directly as local position
                    if (isPushingPerpendicular) {
                        obj.mesh.position[pushContext.axis] = layoutPosition[pushContext.axis];
                        if (geomCenterOffset) obj.mesh.position[pushContext.axis] += geomCenterOffset[pushContext.axis];
                    } else {
                        obj.mesh.position.copy(layoutPosition);
                        if (geomCenterOffset) obj.mesh.position.add(geomCenterOffset);
                    }

                    obj.position = { x: obj.mesh.position.x, y: obj.mesh.position.y, z: obj.mesh.position.z };

                } else {
                    // Object not in container hierarchy - use world position (fallback)
                    const containerPosition = container && container.mesh ? container.mesh.position : new THREE.Vector3(0, 0, 0);

                    if (isPushingPerpendicular) {
                        const worldPos = layoutPosition[pushContext.axis] + containerPosition[pushContext.axis];
                        obj.mesh.position[pushContext.axis] = worldPos;
                        if (geomCenterOffset) obj.mesh.position[pushContext.axis] += geomCenterOffset[pushContext.axis];
                        obj.position = { x: obj.mesh.position.x, y: obj.mesh.position.y, z: obj.mesh.position.z };
                    } else {
                        const worldPosition = new THREE.Vector3()
                            .copy(layoutPosition)
                            .add(containerPosition);
                        if (geomCenterOffset) worldPosition.add(geomCenterOffset);

                        obj.mesh.position.copy(worldPosition);
                        obj.position = { x: obj.mesh.position.x, y: obj.mesh.position.y, z: obj.mesh.position.z };
                    }
                }
            }
        });
    }

    // ====== INTERNAL HELPERS ======

    /**
     * Get which axes have children with fill mode (per-axis granularity)
     * @param {Array} children - Array of child object data
     * @returns {Object} {x: boolean, y: boolean, z: boolean}
     */
    _getAxesWithFillChildren(children) {
        const result = { x: false, y: false, z: false };
        for (const child of children) {
            const lp = child.layoutProperties;
            if (!lp) continue;
            if (lp.sizeX === 'fill') result.x = true;
            if (lp.sizeY === 'fill') result.y = true;
            if (lp.sizeZ === 'fill') result.z = true;
            if (result.x && result.y && result.z) break;
        }
        return result;
    }
}

// Export for use in Modler V2
window.SceneLayoutManager = SceneLayoutManager;
