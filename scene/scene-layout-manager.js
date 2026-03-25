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
                return this._updateManualContainer(container, context);
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
            // Note: if geometry factories ever clamp/adjust sizes, a re-pass would be needed here
            if (result.containerResized && !pushContext) {
                this._applyContainerResize(container, result.targetContainerSize);
            }

            // Refresh cell wireframes if currently showing on this container
            this._refreshCellWireframesIfNeeded(container);

            return { success: true, layoutBounds: result.bounds };

        } finally {
            this._layoutInProgress = wasLayoutInProgress;
        }
    }

    /**
     * Refresh cell wireframes on a container if they are currently visible.
     * Called after layout recalculation so wireframes stay in sync with child positions.
     * @private
     */
    _refreshCellWireframesIfNeeded(container) {
        if (!container.mesh) return;
        const cellGroup = container.mesh.getObjectByName('cellWireframes');
        if (!cellGroup) return;

        const containerVisualizer = window.modlerComponents?.containerVisualizer;
        if (containerVisualizer) {
            containerVisualizer.showCellWireframes(container.mesh);
        }
    }

    // ====== HUG MODE ======

    /**
     * Update a hug-mode container: arrange children with gap (if direction set),
     * then resize to fit children tightly.
     * @private
     */
    _updateHugContainer(container, context) {
        const wasLayoutInProgress = this._layoutInProgress;
        this._layoutInProgress = true;

        try {
            const children = this.sceneController.getChildObjects(container.id);
            if (children.length === 0) {
                return { success: true, reason: 'no children' };
            }

            if (!window.LayoutEngine) {
                return { success: false, reason: 'LayoutEngine not available' };
            }

            // If layout direction is configured, arrange children with gap before wrapping.
            // calculateLayout with null containerSize uses fixed gap (no fill, no space-between).
            // Children are centered around origin, so bounds.center ≈ (0,0,0) — no drift.
            if (container.autoLayout?.direction) {
                const result = window.LayoutEngine.calculateLayout(
                    children, container.autoLayout, null
                );
                if (result.positions && result.positions.length === children.length) {
                    children.forEach((child, i) => {
                        if (child.mesh) {
                            child.mesh.position.copy(result.positions[i]);
                        }
                    });
                }
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
                            position: childObj.mesh.position
                        });
                    }
                });
            }

            // Update container position
            this.sceneController.updateObject(container.id, { position: targetPosition });

            // Handle visibility after resize
            containerCrudManager.handleContainerVisibilityAfterResize(container, true);

            // Refresh cell wireframes if currently showing on this container
            this._refreshCellWireframesIfNeeded(container);

            return { success: true };

        } finally {
            this._layoutInProgress = wasLayoutInProgress;
        }
    }

    // ====== MANUAL MODE ======

    /**
     * Update a manual-mode container: expand to fit children on hierarchy changes.
     * One-shot expand only (never shrinks, never recenters). Only acts on hierarchy
     * changes (child added/moved), not on every child dimension change.
     * @private
     */
    _updateManualContainer(container, context) {
        if (context.reason !== 'hierarchy-changed') {
            return { success: false, reason: 'manual mode - no hierarchy change' };
        }

        const wasLayoutInProgress = this._layoutInProgress;
        this._layoutInProgress = true;

        try {
            const children = this.sceneController.getChildObjects(container.id);
            if (children.length === 0) {
                return { success: true, reason: 'no children' };
            }

            const childMeshes = this.getChildMeshesForBounds(children);
            if (childMeshes.length === 0) {
                return { success: false, reason: 'no valid child meshes' };
            }

            // Calculate bounds of all children in container-local space (no padding for manual)
            const bounds = window.LayoutEngine.calculateHugBounds(childMeshes, {});
            if (!bounds) {
                return { success: false, reason: 'bounds calculation failed' };
            }

            // Container is centered at origin in local space: extends -size/2 to +size/2.
            // Required half-extent = max distance from origin to any child edge.
            const currentSize = this.getContainerSize(container);
            const neededHalfX = Math.max(Math.abs(bounds.min.x), Math.abs(bounds.max.x));
            const neededHalfY = Math.max(Math.abs(bounds.min.y), Math.abs(bounds.max.y));
            const neededHalfZ = Math.max(Math.abs(bounds.min.z), Math.abs(bounds.max.z));

            // Expand only — never shrink below current size
            const expandedSize = new THREE.Vector3(
                Math.max(currentSize.x, neededHalfX * 2),
                Math.max(currentSize.y, neededHalfY * 2),
                Math.max(currentSize.z, neededHalfZ * 2)
            );

            const grew = expandedSize.x > currentSize.x + 0.001 ||
                          expandedSize.y > currentSize.y + 0.001 ||
                          expandedSize.z > currentSize.z + 0.001;

            if (grew) {
                this._applyContainerResize(container, expandedSize);
            }

            return { success: true, expanded: grew };
        } finally {
            this._layoutInProgress = wasLayoutInProgress;
        }
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
            .map(child => child.mesh)
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

        // Route state change through ObjectStateManager (single source of truth)
        const osm = this.getObjectStateManager();
        const updatedAutoLayout = {
            ...container.autoLayout,  // Preserve existing modifiers (tileMode, etc.)
            enabled: true,
            direction: layoutConfig.direction || container.autoLayout?.direction || 'x',
            gap: layoutConfig.gap ?? container.autoLayout?.gap ?? 0,
            padding: layoutConfig.padding || container.autoLayout?.padding || window.ObjectDataFormat.createDefaultPadding(),
            ...layoutConfig
        };

        if (osm) {
            osm.updateObject(containerId, {
                autoLayout: updatedAutoLayout,
                ...window.ObjectStateManager.buildContainerModeUpdate('layout')
            }, { source: 'layout-manager', skipLayout: true });
        } else {
            // Fallback: direct mutation if OSM not yet available (early init)
            container.autoLayout = updatedAutoLayout;
        }

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

        // Route state change through ObjectStateManager (single source of truth)
        const osm = this.getObjectStateManager();
        if (osm) {
            osm.updateObject(containerId, {
                autoLayout: null,
                ...window.ObjectStateManager.buildContainerModeUpdate('manual')
            }, { source: 'layout-manager', skipLayout: true });
        } else {
            container.autoLayout = null;
        }
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

        const layoutAxis = container?.autoLayout?.direction || 'x';
        const isPushingPerpendicular = pushContext && pushContext.axis !== layoutAxis;

        objects.forEach((obj, index) => {
            const layoutPosition = positions[index];
            const layoutSize = sizes[index];

            // Apply fill-based sizing BEFORE positioning
            if (layoutSize && obj.layoutProperties) {
                ['x', 'y', 'z'].forEach(axis => {
                    // During perpendicular push, only resize on the push axis
                    // (prevents cross-dimension contamination on other fill axes)
                    if (isPushingPerpendicular && axis !== pushContext.axis) return;

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

            // Apply layout positions (children are always parented to container mesh)
            if (obj.mesh.parent !== container.mesh) {
                console.warn('Layout: object', obj.id, 'not parented to container — skipping position');
                return;
            }

            if (isPushingPerpendicular) {
                obj.mesh.position[pushContext.axis] = layoutPosition[pushContext.axis];
                if (geomCenterOffset) obj.mesh.position[pushContext.axis] += geomCenterOffset[pushContext.axis];
            } else {
                obj.mesh.position.copy(layoutPosition);
                if (geomCenterOffset) obj.mesh.position.add(geomCenterOffset);
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
