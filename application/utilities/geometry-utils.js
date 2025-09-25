// Modler V2 - Geometry Utilities
// CAD-style geometry manipulation utilities for vertex-level operations

class GeometryUtils {

    /**
     * Scale geometry along a specific axis using CAD-style vertex manipulation
     * @param {THREE.BufferGeometry} geometry - Target geometry
     * @param {string} axis - Axis to scale ('x', 'y', or 'z')
     * @param {number} newDimension - New dimension value
     * @returns {boolean} Success status
     */
    static scaleGeometryAlongAxis(geometry, axis, newDimension) {
        if (!geometry || !geometry.getAttribute('position')) {
            console.warn('GeometryUtils: Invalid geometry or missing position attribute');
            return false;
        }

        try {
            // Force geometry bounds recalculation
            geometry.computeBoundingBox();
            const bbox = geometry.boundingBox;

            // Calculate current dimension and scale factor
            const axisIndex = { x: 0, y: 1, z: 2 }[axis];
            const currentDimension = bbox.max[axis] - bbox.min[axis];

            if (currentDimension === 0) {
                console.warn('GeometryUtils: Cannot scale along axis with zero dimension');
                return false;
            }

            const scaleFactor = newDimension / currentDimension;
            const center = (bbox.max[axis] + bbox.min[axis]) * 0.5;

            // Modify vertices directly for true CAD behavior
            const positions = geometry.getAttribute('position');
            const vertices = positions.array;

            for (let i = 0; i < vertices.length; i += 3) {
                const vertexIndex = i + axisIndex;
                const distanceFromCenter = vertices[vertexIndex] - center;
                vertices[vertexIndex] = center + (distanceFromCenter * scaleFactor);
            }

            // Update geometry
            positions.needsUpdate = true;
            geometry.computeBoundingBox();

            return true;

        } catch (error) {
            console.error('GeometryUtils: Failed to scale geometry along axis:', error);
            return false;
        }
    }

    /**
     * Calculate bounding box dimensions for a geometry
     * @param {THREE.BufferGeometry} geometry - Target geometry
     * @returns {Object|null} Object with x, y, z dimensions or null if failed
     */
    static getGeometryDimensions(geometry) {
        if (!geometry) {
            console.warn('GeometryUtils: Invalid geometry');
            return null;
        }

        try {
            geometry.computeBoundingBox();
            const bbox = geometry.boundingBox;

            return {
                x: bbox.max.x - bbox.min.x,
                y: bbox.max.y - bbox.min.y,
                z: bbox.max.z - bbox.min.z
            };

        } catch (error) {
            console.error('GeometryUtils: Failed to get geometry dimensions:', error);
            return null;
        }
    }

    /**
     * Calculate bounding box center for a geometry
     * @param {THREE.BufferGeometry} geometry - Target geometry
     * @returns {THREE.Vector3|null} Center point or null if failed
     */
    static getGeometryCenter(geometry) {
        if (!geometry) {
            console.warn('GeometryUtils: Invalid geometry');
            return null;
        }

        try {
            geometry.computeBoundingBox();
            const bbox = geometry.boundingBox;

            return new THREE.Vector3(
                (bbox.max.x + bbox.min.x) * 0.5,
                (bbox.max.y + bbox.min.y) * 0.5,
                (bbox.max.z + bbox.min.z) * 0.5
            );

        } catch (error) {
            console.error('GeometryUtils: Failed to get geometry center:', error);
            return null;
        }
    }

    /**
     * Update support mesh geometries to match main geometry
     * Wrapper around SupportMeshFactory for consistent usage
     * @param {THREE.Mesh} mesh - Main mesh with support meshes
     * @returns {boolean} Success status
     */
    static updateSupportMeshGeometries(mesh) {
        if (!mesh) {
            console.warn('GeometryUtils: Invalid mesh');
            return false;
        }

        try {
            const supportMeshFactory = window.SupportMeshFactory ? new SupportMeshFactory() : null;
            if (supportMeshFactory) {
                supportMeshFactory.updateSupportMeshGeometries(mesh);
                return true;
            } else {
                console.warn('GeometryUtils: SupportMeshFactory not available');
                return false;
            }

        } catch (error) {
            console.error('GeometryUtils: Failed to update support mesh geometries:', error);
            return false;
        }
    }

    /**
     * Validate that geometry has required attributes for manipulation
     * @param {THREE.BufferGeometry} geometry - Geometry to validate
     * @returns {boolean} True if geometry is valid for manipulation
     */
    static validateGeometryForManipulation(geometry) {
        if (!geometry) return false;
        if (!geometry.getAttribute('position')) return false;
        if (!geometry.boundingBox) {
            geometry.computeBoundingBox();
        }
        return true;
    }

    /**
     * Get axis index for coordinate access
     * @param {string} axis - Axis name ('x', 'y', or 'z')
     * @returns {number|null} Index (0, 1, 2) or null if invalid
     */
    static getAxisIndex(axis) {
        const axisMap = { x: 0, y: 1, z: 2 };
        return axisMap[axis] !== undefined ? axisMap[axis] : null;
    }
}

// Export for use in main application
window.GeometryUtils = GeometryUtils;