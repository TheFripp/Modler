/**
 * DimensionManager - Single Source of Truth for Object Dimensions
 *
 * ARCHITECTURE: Establishes geometry as the authoritative source for all dimension data
 *
 * ELIMINATES:
 * - objectData.dimensions caching (source of truth conflicts)
 * - calculateObjectDimensions() (redundant with direct geometry access)
 * - Multiple dimension conversion points
 * - Circular Save→Load→Recalculate dependency
 *
 * PRINCIPLE: "Geometry is truth, everything else is cache"
 * - Geometry vertices define dimensions (via bounding box)
 * - All dimension queries go through this manager
 * - No dimension storage in objectData (except during serialization)
 * - Auto-layout reads dimensions from geometry, writes to geometry
 */

class DimensionManager {
    constructor() {
        this.sceneController = null;
    }

    /**
     * Initialize component references
     */
    initialize() {
        if (!this.sceneController) {
            this.sceneController = window.modlerComponents?.sceneController;
        }
    }

    /**
     * Get dimensions for an object (by ID or mesh)
     * SINGLE ENTRY POINT for all dimension queries
     *
     * @param {string|THREE.Mesh} objectOrId - Object ID or mesh
     * @returns {Object|null} Dimensions {x, y, z} or null if not found
     */
    getDimensions(objectOrId) {
        const mesh = this._resolveMesh(objectOrId);
        if (!mesh || !mesh.geometry) {
            return null;
        }

        return GeometryUtils.getGeometryDimensions(mesh.geometry);
    }

    /**
     * Set dimensions for an object (updates geometry directly)
     * SINGLE ENTRY POINT for all dimension updates
     *
     * @param {string|THREE.Mesh} objectOrId - Object ID or mesh
     * @param {Object} dimensions - New dimensions {x?, y?, z?}
     * @param {string} anchorMode - Which face stays fixed: 'center' | 'min' | 'max'
     * @returns {boolean} Success status
     */
    setDimensions(objectOrId, dimensions, anchorMode = 'center') {
        const mesh = this._resolveMesh(objectOrId);
        if (!mesh || !mesh.geometry) {
            console.warn('DimensionManager: Invalid object or geometry');
            return false;
        }

        let success = true;

        // Resize along each specified axis
        if (dimensions.x !== undefined) {
            success = GeometryUtils.resizeGeometry(mesh.geometry, 'x', dimensions.x, anchorMode) && success;
        }
        if (dimensions.y !== undefined) {
            success = GeometryUtils.resizeGeometry(mesh.geometry, 'y', dimensions.y, anchorMode) && success;
        }
        if (dimensions.z !== undefined) {
            success = GeometryUtils.resizeGeometry(mesh.geometry, 'z', dimensions.z, anchorMode) && success;
        }

        // Update support meshes if dimension changed
        if (success) {
            GeometryUtils.updateSupportMeshGeometries(mesh);
        }

        return success;
    }

    /**
     * Get dimension along a single axis
     *
     * @param {string|THREE.Mesh} objectOrId - Object ID or mesh
     * @param {string} axis - Axis ('x', 'y', or 'z')
     * @returns {number|null} Dimension value or null
     */
    getDimension(objectOrId, axis) {
        const dimensions = this.getDimensions(objectOrId);
        return dimensions ? dimensions[axis] : null;
    }

    /**
     * Set dimension along a single axis
     *
     * @param {string|THREE.Mesh} objectOrId - Object ID or mesh
     * @param {string} axis - Axis ('x', 'y', or 'z')
     * @param {number} value - New dimension value
     * @param {string} anchorMode - Which face stays fixed
     * @returns {boolean} Success status
     */
    setDimension(objectOrId, axis, value, anchorMode = 'center') {
        const dimensions = {};
        dimensions[axis] = value;
        return this.setDimensions(objectOrId, dimensions, anchorMode);
    }

    /**
     * Get dimensions for serialization
     * Used ONLY during save operations
     *
     * @param {string|THREE.Mesh} objectOrId - Object ID or mesh
     * @returns {Object|null} Dimensions snapshot for saving
     */
    getDimensionsForSerialization(objectOrId) {
        return this.getDimensions(objectOrId);
    }

    /**
     * Restore dimensions from serialization
     * Used ONLY during load operations
     *
     * @param {string|THREE.Mesh} objectOrId - Object ID or mesh
     * @param {Object} savedDimensions - Dimensions from saved file
     * @returns {boolean} Success status
     */
    restoreDimensionsFromSerialization(objectOrId, savedDimensions) {
        if (!savedDimensions) {
            console.warn('DimensionManager: No saved dimensions provided');
            return false;
        }

        // During deserialization, we trust the saved dimensions
        // Geometry was already created with these dimensions, so this is validation only
        const currentDimensions = this.getDimensions(objectOrId);

        if (!currentDimensions) {
            console.warn('DimensionManager: Could not read current dimensions');
            return false;
        }

        // Validate that geometry matches saved data (within tolerance)
        const tolerance = 0.01; // 1cm
        const xDiff = Math.abs(currentDimensions.x - savedDimensions.x);
        const yDiff = Math.abs(currentDimensions.y - savedDimensions.y);
        const zDiff = Math.abs(currentDimensions.z - savedDimensions.z);

        if (xDiff > tolerance || yDiff > tolerance || zDiff > tolerance) {
            // Fix the mismatch by updating geometry to match saved dimensions
            // This is expected during deserialization due to floating point precision
            return this.setDimensions(objectOrId, savedDimensions, 'center');
        }

        return true;
    }

    /**
     * Resolve object ID or mesh to mesh reference
     * @private
     */
    _resolveMesh(objectOrId) {
        // If already a mesh, return it
        if (objectOrId && objectOrId.geometry) {
            return objectOrId;
        }

        // If string or number ID, look up in SceneController
        if (typeof objectOrId === 'string' || typeof objectOrId === 'number') {
            this.initialize();
            const objectData = this.sceneController?.getObject(objectOrId);
            return objectData?.mesh || null;
        }

        return null;
    }

    /**
     * Validate dimensions object
     * @param {Object} dimensions - Dimensions to validate
     * @returns {boolean} True if valid
     */
    validateDimensions(dimensions) {
        if (!dimensions || typeof dimensions !== 'object') {
            return false;
        }

        const axes = ['x', 'y', 'z'];
        for (const axis of axes) {
            if (dimensions[axis] !== undefined) {
                if (typeof dimensions[axis] !== 'number' || dimensions[axis] <= 0) {
                    return false;
                }
            }
        }

        return true;
    }
}

// Create singleton instance
const dimensionManager = new DimensionManager();

// Make globally available
if (typeof window !== 'undefined') {
    window.DimensionManager = DimensionManager;
    window.dimensionManager = dimensionManager;
    console.log('[DimensionManager] Initialized successfully');
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { DimensionManager, dimensionManager };
}
