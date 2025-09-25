// Modler V2 - Visualization Resource Pool
// Object pooling for frequently used visual elements
// Reduces garbage collection pressure and improves performance

class VisualizationResourcePool {
    constructor() {
        // Resource pools for different visual element types
        this.pools = {
            lineMeshes: [], // THREE.LineSegments for wireframes
            meshHighlights: [], // THREE.Mesh for face highlights
            groups: [], // THREE.Group for complex visuals
            vectors: [], // THREE.Vector3 for calculations
            colors: [], // THREE.Color for material updates
            matrices: [] // THREE.Matrix4 for transforms
        };

        // Pool configuration
        this.config = {
            lineMeshes: { maxSize: 50, initialSize: 10 },
            meshHighlights: { maxSize: 100, initialSize: 20 },
            groups: { maxSize: 30, initialSize: 5 },
            vectors: { maxSize: 200, initialSize: 50 },
            colors: { maxSize: 100, initialSize: 25 },
            matrices: { maxSize: 50, initialSize: 10 }
        };

        // Active resource tracking
        this.activeResources = {
            lineMeshes: new Set(),
            meshHighlights: new Set(),
            groups: new Set(),
            vectors: new Set(),
            colors: new Set(),
            matrices: new Set()
        };

        // Performance metrics
        this.stats = {
            requests: { lineMeshes: 0, meshHighlights: 0, groups: 0, vectors: 0, colors: 0, matrices: 0 },
            poolHits: { lineMeshes: 0, meshHighlights: 0, groups: 0, vectors: 0, colors: 0, matrices: 0 },
            poolMisses: { lineMeshes: 0, meshHighlights: 0, groups: 0, vectors: 0, colors: 0, matrices: 0 },
            returned: { lineMeshes: 0, meshHighlights: 0, groups: 0, vectors: 0, colors: 0, matrices: 0 }
        };

        this.initializePools();
    }

    /**
     * Initialize pools with basic resources
     */
    initializePools() {
        // Pre-populate pools with initial resources
        for (const [poolName, config] of Object.entries(this.config)) {
            for (let i = 0; i < config.initialSize; i++) {
                const resource = this.createNewResource(poolName);
                if (resource) {
                    this.pools[poolName].push(resource);
                }
            }
        }

        console.log('VisualizationResourcePool: Initialized with pre-populated pools');
    }

    /**
     * Get a line mesh from the pool (for wireframes, edges)
     * @param {THREE.BufferGeometry} geometry - Geometry for the line mesh
     * @param {THREE.Material} material - Material for the line mesh
     * @returns {THREE.LineSegments} Line mesh ready for use
     */
    getLineMesh(geometry, material) {
        this.stats.requests.lineMeshes++;

        const pool = this.pools.lineMeshes;
        let lineMesh;

        if (pool.length > 0) {
            lineMesh = pool.pop();
            this.stats.poolHits.lineMeshes++;

            // Reset line mesh properties
            this.resetLineMesh(lineMesh, geometry, material);
        } else {
            lineMesh = new THREE.LineSegments(geometry, material);
            this.stats.poolMisses.lineMeshes++;
        }

        // Track as active
        this.activeResources.lineMeshes.add(lineMesh);

        // Add pool metadata
        lineMesh.userData.pooled = true;
        lineMesh.userData.poolType = 'lineMeshes';

        return lineMesh;
    }

    /**
     * Get a mesh for face highlighting
     * @param {THREE.BufferGeometry} geometry - Geometry for the mesh
     * @param {THREE.Material} material - Material for the mesh
     * @returns {THREE.Mesh} Mesh ready for highlighting
     */
    getMeshHighlight(geometry, material) {
        this.stats.requests.meshHighlights++;

        const pool = this.pools.meshHighlights;
        let mesh;

        if (pool.length > 0) {
            mesh = pool.pop();
            this.stats.poolHits.meshHighlights++;

            // Reset mesh properties
            this.resetMesh(mesh, geometry, material);
        } else {
            mesh = new THREE.Mesh(geometry, material);
            this.stats.poolMisses.meshHighlights++;
        }

        // Track as active
        this.activeResources.meshHighlights.add(mesh);

        // Add pool metadata
        mesh.userData.pooled = true;
        mesh.userData.poolType = 'meshHighlights';

        // Make non-raycastable by default (common for highlights)
        mesh.raycast = () => {};

        return mesh;
    }

    /**
     * Get a group for complex visual hierarchies
     * @returns {THREE.Group} Group ready for use
     */
    getGroup() {
        this.stats.requests.groups++;

        const pool = this.pools.groups;
        let group;

        if (pool.length > 0) {
            group = pool.pop();
            this.stats.poolHits.groups++;

            // Reset group properties
            this.resetGroup(group);
        } else {
            group = new THREE.Group();
            this.stats.poolMisses.groups++;
        }

        // Track as active
        this.activeResources.groups.add(group);

        // Add pool metadata
        group.userData.pooled = true;
        group.userData.poolType = 'groups';

        return group;
    }

    /**
     * Get a vector for calculations (to avoid frequent Vector3 allocation)
     * @param {number} x - X component (default 0)
     * @param {number} y - Y component (default 0)
     * @param {number} z - Z component (default 0)
     * @returns {THREE.Vector3} Vector ready for use
     */
    getVector3(x = 0, y = 0, z = 0) {
        this.stats.requests.vectors++;

        const pool = this.pools.vectors;
        let vector;

        if (pool.length > 0) {
            vector = pool.pop();
            vector.set(x, y, z);
            this.stats.poolHits.vectors++;
        } else {
            vector = new THREE.Vector3(x, y, z);
            this.stats.poolMisses.vectors++;
        }

        // Track as active
        this.activeResources.vectors.add(vector);

        return vector;
    }

    /**
     * Get a color object for material updates
     * @param {number|string} color - Color value (default white)
     * @returns {THREE.Color} Color ready for use
     */
    getColor(color = 0xffffff) {
        this.stats.requests.colors++;

        const pool = this.pools.colors;
        let colorObj;

        if (pool.length > 0) {
            colorObj = pool.pop();
            colorObj.set(color);
            this.stats.poolHits.colors++;
        } else {
            colorObj = new THREE.Color(color);
            this.stats.poolMisses.colors++;
        }

        // Track as active
        this.activeResources.colors.add(colorObj);

        return colorObj;
    }

    /**
     * Get a matrix for transform calculations
     * @returns {THREE.Matrix4} Matrix ready for use
     */
    getMatrix4() {
        this.stats.requests.matrices++;

        const pool = this.pools.matrices;
        let matrix;

        if (pool.length > 0) {
            matrix = pool.pop();
            matrix.identity(); // Reset to identity
            this.stats.poolHits.matrices++;
        } else {
            matrix = new THREE.Matrix4();
            this.stats.poolMisses.matrices++;
        }

        // Track as active
        this.activeResources.matrices.add(matrix);

        return matrix;
    }

    // ===== RETURN METHODS =====

    /**
     * Return a line mesh to the pool
     * @param {THREE.LineSegments} lineMesh - Line mesh to return
     */
    returnLineMesh(lineMesh) {
        if (!lineMesh || !lineMesh.userData?.pooled) return;

        // Remove from active tracking
        this.activeResources.lineMeshes.delete(lineMesh);

        // Clean up the line mesh
        this.cleanupLineMesh(lineMesh);

        // Return to pool if under max size
        const pool = this.pools.lineMeshes;
        if (pool.length < this.config.lineMeshes.maxSize) {
            pool.push(lineMesh);
            this.stats.returned.lineMeshes++;
        } else {
            // Pool is full, dispose of the mesh
            if (lineMesh.geometry && lineMesh.geometry !== lineMesh.userData.originalGeometry) {
                lineMesh.geometry.dispose();
            }
        }
    }

    /**
     * Return a mesh highlight to the pool
     * @param {THREE.Mesh} mesh - Mesh to return
     */
    returnMeshHighlight(mesh) {
        if (!mesh || !mesh.userData?.pooled) return;

        // Remove from active tracking
        this.activeResources.meshHighlights.delete(mesh);

        // Clean up the mesh
        this.cleanupMesh(mesh);

        // Return to pool if under max size
        const pool = this.pools.meshHighlights;
        if (pool.length < this.config.meshHighlights.maxSize) {
            pool.push(mesh);
            this.stats.returned.meshHighlights++;
        } else {
            // Pool is full, dispose if needed
            if (mesh.geometry && mesh.geometry !== mesh.userData.originalGeometry) {
                mesh.geometry.dispose();
            }
        }
    }

    /**
     * Return a group to the pool
     * @param {THREE.Group} group - Group to return
     */
    returnGroup(group) {
        if (!group || !group.userData?.pooled) return;

        // Remove from active tracking
        this.activeResources.groups.delete(group);

        // Clean up the group
        this.cleanupGroup(group);

        // Return to pool if under max size
        const pool = this.pools.groups;
        if (pool.length < this.config.groups.maxSize) {
            pool.push(group);
            this.stats.returned.groups++;
        }
    }

    /**
     * Return a vector to the pool
     * @param {THREE.Vector3} vector - Vector to return
     */
    returnVector3(vector) {
        if (!vector) return;

        // Remove from active tracking
        this.activeResources.vectors.delete(vector);

        // Return to pool if under max size
        const pool = this.pools.vectors;
        if (pool.length < this.config.vectors.maxSize) {
            pool.push(vector);
            this.stats.returned.vectors++;
        }
    }

    /**
     * Return a color to the pool
     * @param {THREE.Color} color - Color to return
     */
    returnColor(color) {
        if (!color) return;

        // Remove from active tracking
        this.activeResources.colors.delete(color);

        // Return to pool if under max size
        const pool = this.pools.colors;
        if (pool.length < this.config.colors.maxSize) {
            pool.push(color);
            this.stats.returned.colors++;
        }
    }

    /**
     * Return a matrix to the pool
     * @param {THREE.Matrix4} matrix - Matrix to return
     */
    returnMatrix4(matrix) {
        if (!matrix) return;

        // Remove from active tracking
        this.activeResources.matrices.delete(matrix);

        // Return to pool if under max size
        const pool = this.pools.matrices;
        if (pool.length < this.config.matrices.maxSize) {
            pool.push(matrix);
            this.stats.returned.matrices++;
        }
    }

    // ===== RESOURCE CREATION AND CLEANUP =====

    /**
     * Create new resource for a specific pool type
     * @param {string} poolType - Type of resource to create
     * @returns {Object|null} New resource or null if unknown type
     */
    createNewResource(poolType) {
        switch (poolType) {
            case 'lineMeshes':
                return new THREE.LineSegments();
            case 'meshHighlights':
                const mesh = new THREE.Mesh();
                mesh.raycast = () => {}; // Non-raycastable by default
                return mesh;
            case 'groups':
                return new THREE.Group();
            case 'vectors':
                return new THREE.Vector3();
            case 'colors':
                return new THREE.Color();
            case 'matrices':
                return new THREE.Matrix4();
            default:
                console.warn(`VisualizationResourcePool: Unknown pool type: ${poolType}`);
                return null;
        }
    }

    /**
     * Reset line mesh to default state
     * @param {THREE.LineSegments} lineMesh - Line mesh to reset
     * @param {THREE.BufferGeometry} geometry - New geometry
     * @param {THREE.Material} material - New material
     */
    resetLineMesh(lineMesh, geometry, material) {
        lineMesh.geometry = geometry;
        lineMesh.material = material;
        lineMesh.position.set(0, 0, 0);
        lineMesh.rotation.set(0, 0, 0);
        lineMesh.scale.set(1, 1, 1);
        lineMesh.visible = true;
        lineMesh.userData = { pooled: true, poolType: 'lineMeshes' };
    }

    /**
     * Reset mesh to default state
     * @param {THREE.Mesh} mesh - Mesh to reset
     * @param {THREE.BufferGeometry} geometry - New geometry
     * @param {THREE.Material} material - New material
     */
    resetMesh(mesh, geometry, material) {
        mesh.geometry = geometry;
        mesh.material = material;
        mesh.position.set(0, 0, 0);
        mesh.rotation.set(0, 0, 0);
        mesh.scale.set(1, 1, 1);
        mesh.visible = true;
        mesh.userData = { pooled: true, poolType: 'meshHighlights' };
        mesh.raycast = () => {}; // Non-raycastable by default
    }

    /**
     * Reset group to default state
     * @param {THREE.Group} group - Group to reset
     */
    resetGroup(group) {
        // Remove all children
        while (group.children.length > 0) {
            group.remove(group.children[0]);
        }

        group.position.set(0, 0, 0);
        group.rotation.set(0, 0, 0);
        group.scale.set(1, 1, 1);
        group.visible = true;
        group.userData = { pooled: true, poolType: 'groups' };
    }

    /**
     * Clean up line mesh before returning to pool
     * @param {THREE.LineSegments} lineMesh - Line mesh to clean up
     */
    cleanupLineMesh(lineMesh) {
        // Remove from parent if attached
        if (lineMesh.parent) {
            lineMesh.parent.remove(lineMesh);
        }

        // Clear user data except pool metadata
        const poolData = { pooled: true, poolType: 'lineMeshes' };
        lineMesh.userData = poolData;
    }

    /**
     * Clean up mesh before returning to pool
     * @param {THREE.Mesh} mesh - Mesh to clean up
     */
    cleanupMesh(mesh) {
        // Remove from parent if attached
        if (mesh.parent) {
            mesh.parent.remove(mesh);
        }

        // Clear user data except pool metadata
        const poolData = { pooled: true, poolType: 'meshHighlights' };
        mesh.userData = poolData;
    }

    /**
     * Clean up group before returning to pool
     * @param {THREE.Group} group - Group to clean up
     */
    cleanupGroup(group) {
        // Remove from parent if attached
        if (group.parent) {
            group.parent.remove(group);
        }

        // Remove all children (but don't dispose them, they might be pooled too)
        while (group.children.length > 0) {
            group.remove(group.children[0]);
        }

        // Clear user data except pool metadata
        const poolData = { pooled: true, poolType: 'groups' };
        group.userData = poolData;
    }

    // ===== PERFORMANCE AND DEBUGGING =====

    /**
     * Get pool statistics and performance metrics
     * @returns {Object} Detailed statistics
     */
    getStats() {
        const poolSizes = {};
        const activeCounts = {};
        const hitRates = {};

        for (const poolName of Object.keys(this.pools)) {
            poolSizes[poolName] = this.pools[poolName].length;
            activeCounts[poolName] = this.activeResources[poolName].size;

            const hits = this.stats.poolHits[poolName];
            const misses = this.stats.poolMisses[poolName];
            hitRates[poolName] = hits / (hits + misses) || 0;
        }

        return {
            poolSizes,
            activeCounts,
            hitRates,
            requests: { ...this.stats.requests },
            poolHits: { ...this.stats.poolHits },
            poolMisses: { ...this.stats.poolMisses },
            returned: { ...this.stats.returned }
        };
    }

    /**
     * Force return of all active resources (emergency cleanup)
     */
    forceReturnAllResources() {
        let returnedCount = 0;

        // Return all active line meshes
        const activeLineMeshes = Array.from(this.activeResources.lineMeshes);
        activeLineMeshes.forEach(mesh => {
            this.returnLineMesh(mesh);
            returnedCount++;
        });

        // Return all active mesh highlights
        const activeMeshHighlights = Array.from(this.activeResources.meshHighlights);
        activeMeshHighlights.forEach(mesh => {
            this.returnMeshHighlight(mesh);
            returnedCount++;
        });

        // Return all active groups
        const activeGroups = Array.from(this.activeResources.groups);
        activeGroups.forEach(group => {
            this.returnGroup(group);
            returnedCount++;
        });

        console.log(`VisualizationResourcePool: Force returned ${returnedCount} resources`);
    }

    /**
     * Clear all pools and dispose resources
     */
    clearAllPools() {
        let disposedCount = 0;

        // Clear all pools
        for (const [poolName, pool] of Object.entries(this.pools)) {
            while (pool.length > 0) {
                const resource = pool.pop();

                // Dispose geometries if they exist and are disposable
                if (resource.geometry && typeof resource.geometry.dispose === 'function') {
                    resource.geometry.dispose();
                }

                disposedCount++;
            }
        }

        // Clear active resource tracking
        for (const activeSet of Object.values(this.activeResources)) {
            activeSet.clear();
        }

        console.log(`VisualizationResourcePool: Cleared all pools and disposed ${disposedCount} resources`);
    }

    /**
     * Debug: Log detailed pool information
     */
    debugLogPools() {
        console.group('VisualizationResourcePool Status');

        const stats = this.getStats();

        console.log('Pool Sizes:', stats.poolSizes);
        console.log('Active Resources:', stats.activeCounts);
        console.log('Hit Rates:', stats.hitRates);
        console.log('Total Requests:', stats.requests);

        // Calculate efficiency
        const totalRequests = Object.values(stats.requests).reduce((sum, count) => sum + count, 0);
        const totalHits = Object.values(stats.poolHits).reduce((sum, count) => sum + count, 0);
        const overallHitRate = totalRequests > 0 ? totalHits / totalRequests : 0;

        console.log(`Overall Hit Rate: ${(overallHitRate * 100).toFixed(1)}%`);
        console.groupEnd();
    }

    /**
     * Destroy pool and clean up all resources
     */
    destroy() {
        // Force return all active resources
        this.forceReturnAllResources();

        // Clear all pools
        this.clearAllPools();

        // Reset stats
        for (const poolName of Object.keys(this.pools)) {
            this.stats.requests[poolName] = 0;
            this.stats.poolHits[poolName] = 0;
            this.stats.poolMisses[poolName] = 0;
            this.stats.returned[poolName] = 0;
        }

        console.log('VisualizationResourcePool: Destroyed and cleaned up');
    }
}

// Export for use in main application
window.VisualizationResourcePool = VisualizationResourcePool;