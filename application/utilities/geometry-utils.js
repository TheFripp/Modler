import * as THREE from 'three';
// Modler V2 - Geometry Utilities
// CAD-style geometry manipulation utilities for vertex-level operations

class GeometryUtils {

    /**
     * Scale geometry along a specific axis using CAD-style vertex manipulation
     * @deprecated Use resizeGeometry(geometry, axis, newDimension, 'center') instead
     * @param {THREE.BufferGeometry} geometry - Target geometry
     * @param {string} axis - Axis to scale ('x', 'y', or 'z')
     * @param {number} newDimension - New dimension value
     * @returns {boolean} Success status
     */
    static scaleGeometryAlongAxis(geometry, axis, newDimension) {
        // Forward to unified method
        return this.resizeGeometry(geometry, axis, newDimension, 'center');
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
     * @param {boolean} updateFaceHighlight - Whether to update face highlight position (default: true)
     * @returns {boolean} Success status
     */
    static updateSupportMeshGeometries(mesh, updateFaceHighlight = true) {
        if (!mesh) {
            console.warn('GeometryUtils: Invalid mesh');
            return false;
        }

        try {
            const supportMeshFactory = window.modlerComponents?.supportMeshFactory;
            if (supportMeshFactory) {
                supportMeshFactory.updateSupportMeshGeometries(mesh, updateFaceHighlight);
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
     * Push a face of geometry along an axis (move one face while keeping opposite face fixed)
     * @deprecated Use resizeGeometry() with anchorMode 'min' or 'max' instead
     * @param {THREE.BufferGeometry} geometry - Target geometry
     * @param {string} axis - Axis to push along ('x', 'y', or 'z')
     * @param {number} direction - Direction to push (1 for positive, -1 for negative)
     * @param {number} delta - Amount to push in world units
     * @returns {boolean} Success status
     */
    static pushGeometryFace(geometry, axis, direction, delta) {
        // Calculate current dimension
        const dims = this.getGeometryDimensions(geometry);
        if (!dims) return false;

        const newDimension = dims[axis] + delta;
        const anchorMode = direction > 0 ? 'min' : 'max';

        // Forward to unified method
        return this.resizeGeometry(geometry, axis, newDimension, anchorMode);
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

    /**
     * UNIFIED GEOMETRY RESIZE - Replaces scaleGeometryAlongAxis() and pushGeometryFace()
     *
     * Resize geometry along an axis with configurable anchor point.
     * This is the single entry point for all dimension changes.
     *
     * @param {THREE.BufferGeometry} geometry - Target geometry
     * @param {string} axis - Axis to resize ('x', 'y', or 'z')
     * @param {number} newDimension - Target dimension value
     * @param {string} anchorMode - Which face stays fixed: 'center' | 'min' | 'max'
     *   - 'center': Scale from center (both faces move equally) - default for UI/layout
     *   - 'min': Keep MIN face fixed, move MAX face (push in +direction)
     *   - 'max': Keep MAX face fixed, move MIN face (push in -direction)
     * @returns {boolean} Success status
     */
    static resizeGeometry(geometry, axis, newDimension, anchorMode = 'center') {
        if (!this.validateGeometryForManipulation(geometry)) {
            console.warn('GeometryUtils: Invalid geometry for resizing');
            return false;
        }

        if (newDimension <= 0) {
            console.warn('GeometryUtils: Invalid dimension value:', newDimension);
            return false;
        }

        try {
            const positions = geometry.getAttribute('position');
            const vertices = positions.array;
            const axisIndex = this.getAxisIndex(axis);

            if (axisIndex === null) {
                console.warn('GeometryUtils: Invalid axis:', axis);
                return false;
            }

            // Calculate current bounds
            geometry.computeBoundingBox();
            const bbox = geometry.boundingBox;
            const minCoord = bbox.min[axis];
            const maxCoord = bbox.max[axis];
            const currentDimension = maxCoord - minCoord;

            if (currentDimension === 0) {
                console.warn('GeometryUtils: Cannot resize along axis with zero dimension');
                return false;
            }

            // Calculate transformation based on anchor mode
            let newMinCoord, newMaxCoord;

            switch (anchorMode) {
                case 'center':
                    // Scale from center - both faces move equally
                    const center = (minCoord + maxCoord) * 0.5;
                    const halfDimension = newDimension * 0.5;
                    newMinCoord = center - halfDimension;
                    newMaxCoord = center + halfDimension;
                    break;

                case 'min':
                    // Keep MIN face fixed, move MAX face
                    newMinCoord = minCoord;
                    newMaxCoord = minCoord + newDimension;
                    break;

                case 'max':
                    // Keep MAX face fixed, move MIN face
                    newMaxCoord = maxCoord;
                    newMinCoord = maxCoord - newDimension;
                    break;

                default:
                    console.warn('GeometryUtils: Invalid anchor mode:', anchorMode);
                    return false;
            }

            // Validate new bounds
            if (newMinCoord >= newMaxCoord) {
                console.warn('GeometryUtils: Invalid new bounds');
                return false;
            }

            // Transform vertices
            const epsilon = 0.001;
            for (let i = 0; i < vertices.length; i += 3) {
                const vertexIndex = i + axisIndex;
                const oldCoord = vertices[vertexIndex];

                // Map from old range to new range
                const t = (oldCoord - minCoord) / currentDimension; // Normalized position [0,1]
                vertices[vertexIndex] = newMinCoord + (t * newDimension);
            }

            // Update geometry
            positions.needsUpdate = true;
            geometry.computeBoundingBox();
            geometry.computeBoundingSphere();

            return true;

        } catch (error) {
            console.error('GeometryUtils: Failed to resize geometry:', error);
            return false;
        }
    }
}

// Export for use in main application
window.GeometryUtils = GeometryUtils;