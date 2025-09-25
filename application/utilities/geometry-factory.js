// Modler V2 - Geometry Factory
// Centralized geometry creation with pooling and resource management
// Eliminates redundant geometry creation across visualization systems

class GeometryFactory {
    constructor() {
        // Geometry pools for frequently used shapes
        this.pools = {
            boxEdges: new Map(), // size string -> geometry array
            faceTriangles: new Map(), // face key -> geometry array
            rectangularFaces: new Map(), // face key -> geometry array
            wireframes: new Map(), // dimensions -> geometry array
            planes: new Map() // size -> geometry array
        };

        // Active geometry tracking for cleanup
        this.activeGeometries = new WeakMap(); // geometry -> metadata

        // Performance metrics
        this.stats = {
            created: 0,
            poolHits: 0,
            poolMisses: 0,
            disposed: 0
        };

        // Pool size limits to prevent memory bloat
        this.maxPoolSize = {
            boxEdges: 20,
            faceTriangles: 50,
            rectangularFaces: 30,
            wireframes: 15,
            planes: 25
        };
    }

    /**
     * Create face geometry (unified interface for both triangle and rectangular faces)
     * @param {Object} hit - Raycast hit with object and face information
     * @param {string} type - 'triangle', 'rectangular', or 'auto' for automatic detection
     * @returns {THREE.BufferGeometry} Face geometry ready for highlighting
     */
    createFaceGeometry(hit, type = 'auto') {
        if (!hit?.object?.geometry || !hit?.face) {
            console.warn('GeometryFactory: Invalid hit data for face geometry');
            return null;
        }

        try {
            // Automatic type detection
            if (type === 'auto') {
                const geometry = hit.object.geometry;
                if (geometry.type === 'BoxGeometry' || this.isBoxLikeGeometry(geometry)) {
                    type = 'rectangular';
                } else {
                    type = 'triangle';
                }
            }

            // Create appropriate face geometry
            if (type === 'rectangular') {
                return this.createRectangularFaceGeometry(hit);
            } else {
                return this.createTriangleFaceGeometry(hit);
            }

        } catch (error) {
            console.error('GeometryFactory: Error creating face geometry:', error);
            return null;
        }
    }

    /**
     * Create triangle face geometry from hit data
     * @param {Object} hit - Raycast hit data
     * @returns {THREE.BufferGeometry} Triangle geometry
     */
    createTriangleFaceGeometry(hit) {
        const positionAttribute = hit.object.geometry.getAttribute('position');
        if (!positionAttribute) {
            console.warn('GeometryFactory: No position attribute in geometry');
            return null;
        }

        // Generate cache key based on face vertices
        const faceKey = `triangle_${hit.face.a}_${hit.face.b}_${hit.face.c}`;

        // Check pool first
        const pooledGeometry = this.getFromPool('faceTriangles', faceKey);
        if (pooledGeometry) {
            return pooledGeometry;
        }

        // Create new triangle geometry
        const va = new THREE.Vector3().fromBufferAttribute(positionAttribute, hit.face.a);
        const vb = new THREE.Vector3().fromBufferAttribute(positionAttribute, hit.face.b);
        const vc = new THREE.Vector3().fromBufferAttribute(positionAttribute, hit.face.c);

        const positions = [va.x, va.y, va.z, vb.x, vb.y, vb.z, vc.x, vc.y, vc.z];
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));

        // Store in pool and track
        this.storeInPool('faceTriangles', faceKey, geometry);
        this.trackGeometry(geometry, { type: 'faceTriangle', key: faceKey });

        this.stats.created++;
        return geometry;
    }

    /**
     * Create rectangular face geometry for box-like objects
     * @param {Object} hit - Raycast hit data
     * @returns {THREE.BufferGeometry} Rectangular face geometry
     */
    createRectangularFaceGeometry(hit) {
        const object = hit.object;
        const face = hit.face;
        const normal = face.normal.clone().normalize();

        // Compute bounding box
        object.geometry.computeBoundingBox();
        const box = object.geometry.boundingBox;
        if (!box) {
            console.warn('GeometryFactory: Could not compute bounding box');
            return null;
        }

        // Determine face axis and side
        const { axis, side } = this.determineFaceOrientation(normal);
        if (!axis) {
            // Fallback to triangle for complex faces
            return this.createTriangleFaceGeometry(hit);
        }

        // Generate cache key
        const boxSize = `${box.max.x - box.min.x}_${box.max.y - box.min.y}_${box.max.z - box.min.z}`;
        const faceKey = `rect_${boxSize}_${axis}_${side}`;

        // Check pool first
        const pooledGeometry = this.getFromPool('rectangularFaces', faceKey);
        if (pooledGeometry) {
            return pooledGeometry;
        }

        // Create face vertices
        const vertices = this.generateRectangularFaceVertices(box, axis, side);
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));

        // Store in pool and track
        this.storeInPool('rectangularFaces', faceKey, geometry);
        this.trackGeometry(geometry, { type: 'rectangularFace', key: faceKey });

        this.stats.created++;
        return geometry;
    }

    /**
     * Create edge geometry for wireframes and highlights
     * @param {THREE.BufferGeometry} sourceGeometry - Geometry to create edges from
     * @param {Object} options - Edge creation options
     * @returns {THREE.EdgesGeometry} Edge geometry
     */
    createEdgeGeometry(sourceGeometry, options = {}) {
        if (!sourceGeometry) {
            console.warn('GeometryFactory: No source geometry for edge creation');
            return null;
        }

        try {
            // Generate cache key based on geometry characteristics
            const geometryKey = this.generateGeometryKey(sourceGeometry);

            // Check pool
            const pooledGeometry = this.getFromPool('boxEdges', geometryKey);
            if (pooledGeometry) {
                return pooledGeometry;
            }

            // Create new edge geometry
            const edgeGeometry = new THREE.EdgesGeometry(sourceGeometry, options.thresholdAngle);

            // Store in pool and track
            this.storeInPool('boxEdges', geometryKey, edgeGeometry);
            this.trackGeometry(edgeGeometry, { type: 'edges', key: geometryKey });

            this.stats.created++;
            return edgeGeometry;

        } catch (error) {
            console.error('GeometryFactory: Error creating edge geometry:', error);
            return null;
        }
    }

    /**
     * Create wireframe geometry for containers and previews
     * @param {number} width - Wireframe width
     * @param {number} height - Wireframe height
     * @param {number} depth - Wireframe depth
     * @param {Object} options - Wireframe options
     * @returns {THREE.BufferGeometry} Wireframe geometry
     */
    createWireframeGeometry(width, height, depth, options = {}) {
        const sizeKey = `${width.toFixed(3)}_${height.toFixed(3)}_${depth.toFixed(3)}`;

        // Check pool first
        const pooledGeometry = this.getFromPool('wireframes', sizeKey);
        if (pooledGeometry) {
            return pooledGeometry;
        }

        // Create box geometry and extract edges
        const boxGeometry = new THREE.BoxGeometry(width, height, depth);
        const wireframeGeometry = new THREE.EdgesGeometry(boxGeometry);

        // Clean up temporary geometry
        boxGeometry.dispose();

        // Store in pool and track
        this.storeInPool('wireframes', sizeKey, wireframeGeometry);
        this.trackGeometry(wireframeGeometry, { type: 'wireframe', key: sizeKey });

        this.stats.created++;
        return wireframeGeometry;
    }

    /**
     * Create plane geometry for previews and UI elements
     * @param {number} width - Plane width
     * @param {number} height - Plane height
     * @param {Object} options - Plane options
     * @returns {THREE.PlaneGeometry} Plane geometry
     */
    createPlaneGeometry(width, height, options = {}) {
        const sizeKey = `${width.toFixed(3)}_${height.toFixed(3)}`;

        // Check pool first
        const pooledGeometry = this.getFromPool('planes', sizeKey);
        if (pooledGeometry) {
            return pooledGeometry;
        }

        // Create plane geometry
        const geometry = new THREE.PlaneGeometry(width, height, options.widthSegments, options.heightSegments);

        // Store in pool and track
        this.storeInPool('planes', sizeKey, geometry);
        this.trackGeometry(geometry, { type: 'plane', key: sizeKey });

        this.stats.created++;
        return geometry;
    }

    /**
     * Create axis-specific face geometries (for push tool highlighting)
     * @param {THREE.Object3D} object - Object to create faces for
     * @param {string} axis - Axis ('x', 'y', or 'z')
     * @returns {THREE.BufferGeometry} Axis faces geometry
     */
    createAxisFacesGeometry(object, axis) {
        if (!object?.geometry) {
            console.warn('GeometryFactory: No geometry for axis faces');
            return null;
        }

        object.geometry.computeBoundingBox();
        const box = object.geometry.boundingBox;
        if (!box) {
            console.warn('GeometryFactory: Could not compute bounding box for axis faces');
            return null;
        }

        // Generate cache key
        const boxSize = `${box.max.x - box.min.x}_${box.max.y - box.min.y}_${box.max.z - box.min.z}`;
        const faceKey = `axis_${boxSize}_${axis}`;

        // Check pool first
        const pooledGeometry = this.getFromPool('rectangularFaces', faceKey);
        if (pooledGeometry) {
            return pooledGeometry;
        }

        // Create faces for both sides of the axis
        const minVertices = this.generateRectangularFaceVertices(box, axis, 'min');
        const maxVertices = this.generateRectangularFaceVertices(box, axis, 'max');
        const allVertices = [...minVertices, ...maxVertices];

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(allVertices), 3));

        // Store in pool and track
        this.storeInPool('rectangularFaces', faceKey, geometry);
        this.trackGeometry(geometry, { type: 'axisFaces', key: faceKey });

        this.stats.created++;
        return geometry;
    }

    // ===== UTILITY METHODS =====

    /**
     * Determine face orientation from normal vector
     * @param {THREE.Vector3} normal - Face normal vector
     * @returns {Object} Object with axis and side properties
     */
    determineFaceOrientation(normal) {
        const absNormal = new THREE.Vector3(Math.abs(normal.x), Math.abs(normal.y), Math.abs(normal.z));

        if (absNormal.x > 0.9) {
            return { axis: 'x', side: normal.x > 0 ? 'max' : 'min' };
        } else if (absNormal.y > 0.9) {
            return { axis: 'y', side: normal.y > 0 ? 'max' : 'min' };
        } else if (absNormal.z > 0.9) {
            return { axis: 'z', side: normal.z > 0 ? 'max' : 'min' };
        }

        return { axis: null, side: null };
    }

    /**
     * Generate rectangular face vertices for a given axis and side
     * @param {THREE.Box3} bbox - Bounding box
     * @param {string} axis - Axis ('x', 'y', or 'z')
     * @param {string} side - Side ('min' or 'max')
     * @returns {Array} Vertex array
     */
    generateRectangularFaceVertices(bbox, axis, side) {
        const vertices = [];
        let coord, minVal1, maxVal1, minVal2, maxVal2;

        switch (axis) {
            case 'x':
                coord = side === 'max' ? bbox.max.x : bbox.min.x;
                minVal1 = bbox.min.y; maxVal1 = bbox.max.y;
                minVal2 = bbox.min.z; maxVal2 = bbox.max.z;
                break;
            case 'y':
                coord = side === 'max' ? bbox.max.y : bbox.min.y;
                minVal1 = bbox.min.x; maxVal1 = bbox.max.x;
                minVal2 = bbox.min.z; maxVal2 = bbox.max.z;
                break;
            case 'z':
                coord = side === 'max' ? bbox.max.z : bbox.min.z;
                minVal1 = bbox.min.x; maxVal1 = bbox.max.x;
                minVal2 = bbox.min.y; maxVal2 = bbox.max.y;
                break;
            default:
                return [];
        }

        // Generate two triangles for the rectangular face
        const v1 = this.createVertexForAxis(axis, coord, minVal1, minVal2);
        const v2 = this.createVertexForAxis(axis, coord, maxVal1, minVal2);
        const v3 = this.createVertexForAxis(axis, coord, maxVal1, maxVal2);
        const v4 = this.createVertexForAxis(axis, coord, minVal1, minVal2);
        const v5 = this.createVertexForAxis(axis, coord, maxVal1, maxVal2);
        const v6 = this.createVertexForAxis(axis, coord, minVal1, maxVal2);

        // Correct winding order based on side
        if ((axis === 'x' && side === 'min') || (axis === 'y' && side === 'max') || (axis === 'z' && side === 'min')) {
            vertices.push(...v1, ...v3, ...v2, ...v4, ...v6, ...v5);
        } else {
            vertices.push(...v1, ...v2, ...v3, ...v4, ...v5, ...v6);
        }

        return vertices;
    }

    /**
     * Create vertex coordinates for a specific axis
     * @param {string} axis - Axis ('x', 'y', or 'z')
     * @param {number} coord - Coordinate value for the axis
     * @param {number} val1 - First perpendicular value
     * @param {number} val2 - Second perpendicular value
     * @returns {Array} Vertex coordinates [x, y, z]
     */
    createVertexForAxis(axis, coord, val1, val2) {
        switch (axis) {
            case 'x': return [coord, val1, val2];
            case 'y': return [val1, coord, val2];
            case 'z': return [val1, val2, coord];
            default: return [0, 0, 0];
        }
    }

    /**
     * Check if geometry has box-like characteristics
     * @param {THREE.BufferGeometry} geometry - Geometry to test
     * @returns {boolean} True if geometry is box-like
     */
    isBoxLikeGeometry(geometry) {
        if (!geometry?.getAttribute('position')) return false;

        const positions = geometry.getAttribute('position');
        const vertexCount = positions.count;

        if (vertexCount === 24 || vertexCount === 8) {
            geometry.computeBoundingBox();
            const bbox = geometry.boundingBox;
            if (bbox) {
                const threshold = 0.001;
                const hasDistinctX = Math.abs(bbox.max.x - bbox.min.x) > threshold;
                const hasDistinctY = Math.abs(bbox.max.y - bbox.min.y) > threshold;
                const hasDistinctZ = Math.abs(bbox.max.z - bbox.min.z) > threshold;
                return hasDistinctX && hasDistinctY && hasDistinctZ;
            }
        }

        return false;
    }

    // ===== POOL MANAGEMENT =====

    /**
     * Get geometry from pool if available
     * @param {string} poolName - Name of the pool
     * @param {string} key - Cache key
     * @returns {THREE.BufferGeometry|null} Pooled geometry or null
     */
    getFromPool(poolName, key) {
        const pool = this.pools[poolName];
        if (!pool || !pool.has(key)) {
            this.stats.poolMisses++;
            return null;
        }

        const geometries = pool.get(key);
        if (geometries.length === 0) {
            this.stats.poolMisses++;
            return null;
        }

        this.stats.poolHits++;
        return geometries.pop(); // Return a geometry from the pool
    }

    /**
     * Store geometry in appropriate pool
     * @param {string} poolName - Name of the pool
     * @param {string} key - Cache key
     * @param {THREE.BufferGeometry} geometry - Geometry to store
     */
    storeInPool(poolName, key, geometry) {
        const pool = this.pools[poolName];
        if (!pool) return;

        if (!pool.has(key)) {
            pool.set(key, []);
        }

        const geometries = pool.get(key);

        // Respect pool size limits
        if (geometries.length < this.maxPoolSize[poolName]) {
            geometries.push(geometry);
        }
    }

    /**
     * Track active geometry for cleanup
     * @param {THREE.BufferGeometry} geometry - Geometry to track
     * @param {Object} metadata - Associated metadata
     */
    trackGeometry(geometry, metadata) {
        this.activeGeometries.set(geometry, {
            ...metadata,
            created: Date.now()
        });
    }

    /**
     * Generate unique key for geometry caching
     * @param {THREE.BufferGeometry} geometry - Source geometry
     * @returns {string} Unique key
     */
    generateGeometryKey(geometry) {
        if (!geometry.boundingBox) {
            geometry.computeBoundingBox();
        }

        const box = geometry.boundingBox;
        if (!box) return `geometry_${Math.random()}`;

        return `geom_${box.min.x.toFixed(3)}_${box.min.y.toFixed(3)}_${box.min.z.toFixed(3)}_${box.max.x.toFixed(3)}_${box.max.y.toFixed(3)}_${box.max.z.toFixed(3)}`;
    }

    /**
     * Dispose of specific geometry and remove from pools
     * @param {THREE.BufferGeometry} geometry - Geometry to dispose
     */
    disposeGeometry(geometry) {
        if (!geometry) return;

        try {
            geometry.dispose();
            this.activeGeometries.delete(geometry);
            this.stats.disposed++;

            // Remove from all pools (inefficient but thorough cleanup)
            for (const [poolName, pool] of Object.entries(this.pools)) {
                for (const [key, geometries] of pool) {
                    const index = geometries.indexOf(geometry);
                    if (index !== -1) {
                        geometries.splice(index, 1);
                        if (geometries.length === 0) {
                            pool.delete(key);
                        }
                        break;
                    }
                }
            }
        } catch (error) {
            console.warn('GeometryFactory: Error disposing geometry:', error);
        }
    }

    /**
     * Clear all pools and dispose geometries
     */
    clearAllPools() {
        for (const [poolName, pool] of Object.entries(this.pools)) {
            for (const [key, geometries] of pool) {
                geometries.forEach(geometry => {
                    try {
                        geometry.dispose();
                        this.stats.disposed++;
                    } catch (error) {
                        console.warn('GeometryFactory: Error disposing pooled geometry:', error);
                    }
                });
            }
            pool.clear();
        }

        this.activeGeometries = new WeakMap();
    }

    /**
     * Get performance statistics
     * @returns {Object} Performance stats
     */
    getStats() {
        const totalPooled = Object.values(this.pools).reduce((total, pool) => {
            return total + Array.from(pool.values()).reduce((sum, geometries) => sum + geometries.length, 0);
        }, 0);

        return {
            ...this.stats,
            totalPooled,
            hitRate: this.stats.poolHits / (this.stats.poolHits + this.stats.poolMisses) || 0,
            activeGeometries: this.activeGeometries.size || 'unknown'
        };
    }

    /**
     * Clean up factory resources
     */
    destroy() {
        this.clearAllPools();

        // Reset stats
        this.stats = {
            created: 0,
            poolHits: 0,
            poolMisses: 0,
            disposed: 0
        };
    }
}

// Export for use in main application
window.GeometryFactory = GeometryFactory;