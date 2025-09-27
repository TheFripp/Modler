/**
 * ObjectSerializer - Unified Object Serialization System
 *
 * Single source of truth for converting Three.js objects to serialized data
 * for transmission to Svelte UI. Consolidates all serialization logic that
 * was previously scattered across multiple files.
 *
 * Features:
 * - GeometryUtils integration for accurate dimensions
 * - Consistent field naming throughout system
 * - Robust error handling and fallbacks
 * - Support for all object types (regular, containers)
 * - Performance optimization for batch operations
 * - Extensible for future object properties
 */

class ObjectSerializer {
    constructor() {
        // Component references (initialized lazily)
        this.geometryUtils = null;
        this.sceneController = null;

        // Cache for performance
        this.serializationCache = new Map();
        this.cacheMaxAge = 1000; // 1 second cache for rapid updates

        // Statistics for debugging
        this.stats = {
            serializations: 0,
            cacheHits: 0,
            errors: 0,
            batchOperations: 0
        };

        // Configuration
        this.PRECISION = {
            position: 3,    // 3 decimal places for position
            rotation: 1,    // 1 decimal place for rotation (degrees)
            scale: 3,       // 3 decimal places for scale
            dimensions: 3   // 3 decimal places for dimensions
        };
    }

    /**
     * Initialize component references
     * Called automatically on first use
     */
    initializeComponents() {
        if (!this.geometryUtils) {
            this.geometryUtils = window.GeometryUtils;
        }
        if (!this.sceneController) {
            this.sceneController = window.modlerComponents?.sceneController;
        }
    }

    /**
     * Serialize a single Three.js object
     * @param {THREE.Object3D} obj - The Three.js object to serialize
     * @param {Object} options - Serialization options
     * @param {string} options.changeType - Type of change that triggered serialization
     * @param {boolean} options.includeGeometry - Whether to include geometry data
     * @param {boolean} options.includeHierarchy - Whether to include hierarchy data
     * @param {boolean} options.useCache - Whether to use caching (default: true)
     * @returns {Object|null} Serialized object data or null if failed
     */
    serializeObject(obj, options = {}) {
        const {
            changeType = 'general',
            includeGeometry = true,
            includeHierarchy = true,
            useCache = true
        } = options;

        try {
            this.initializeComponents();

            // Validate input
            if (!obj || !obj.userData) {
                return null;
            }

            // Check cache first
            if (useCache) {
                const cached = this.getCachedSerialization(obj, changeType);
                if (cached) {
                    this.stats.cacheHits++;
                    return cached;
                }
            }

            // Get object data from scene controller
            if (!this.sceneController) {
                console.warn('ObjectSerializer: SceneController not available');
                return null;
            }

            const objectData = this.sceneController.getObjectByMesh(obj);
            if (!objectData) {
                return null;
            }

            // Build core serialized object
            const serialized = this.buildCoreData(obj, objectData);

            // Add geometry data if requested
            if (includeGeometry) {
                this.addGeometryData(serialized, obj);
            }

            // Add material data
            this.addMaterialData(serialized, obj);

            // Add container-specific data
            if (objectData.isContainer) {
                this.addContainerData(serialized, objectData);
            }

            // Add hierarchy data if requested
            if (includeHierarchy) {
                this.addHierarchyData(serialized, objectData);
            }

            // Cache the result
            if (useCache) {
                this.cacheSerializedObject(obj, changeType, serialized);
            }

            this.stats.serializations++;
            return serialized;

        } catch (error) {
            console.error('ObjectSerializer.serializeObject error:', error, {
                objectId: obj?.userData?.id,
                changeType
            });
            this.stats.errors++;
            return null;
        }
    }

    /**
     * Serialize multiple objects efficiently
     * @param {Array<THREE.Object3D>} objects - Array of objects to serialize
     * @param {Object} options - Serialization options
     * @returns {Array<Object>} Array of serialized objects
     */
    serializeBatch(objects, options = {}) {
        try {
            this.initializeComponents();

            if (!Array.isArray(objects) || objects.length === 0) {
                return [];
            }

            const results = [];
            for (const obj of objects) {
                const serialized = this.serializeObject(obj, options);
                if (serialized) {
                    results.push(serialized);
                }
            }

            this.stats.batchOperations++;
            return results;

        } catch (error) {
            console.error('ObjectSerializer.serializeBatch error:', error);
            this.stats.errors++;
            return [];
        }
    }

    /**
     * Build core object data (always included)
     * @private
     */
    buildCoreData(obj, objectData) {
        return {
            id: objectData.id,
            name: objectData.name,
            type: objectData.type || 'object',
            isContainer: objectData.isContainer || false,
            position: {
                x: parseFloat(obj.position.x.toFixed(this.PRECISION.position)),
                y: parseFloat(obj.position.y.toFixed(this.PRECISION.position)),
                z: parseFloat(obj.position.z.toFixed(this.PRECISION.position))
            },
            rotation: {
                x: parseFloat((obj.rotation.x * 180 / Math.PI).toFixed(this.PRECISION.rotation)),
                y: parseFloat((obj.rotation.y * 180 / Math.PI).toFixed(this.PRECISION.rotation)),
                z: parseFloat((obj.rotation.z * 180 / Math.PI).toFixed(this.PRECISION.rotation))
            },
            scale: {
                x: parseFloat(obj.scale.x.toFixed(this.PRECISION.scale)),
                y: parseFloat(obj.scale.y.toFixed(this.PRECISION.scale)),
                z: parseFloat(obj.scale.z.toFixed(this.PRECISION.scale))
            }
        };
    }

    /**
     * Add geometry data (dimensions) to serialized object
     * @private
     */
    addGeometryData(serialized, obj) {
        if (!obj.geometry) return;

        // Try GeometryUtils first (handles modified geometries correctly)
        if (this.geometryUtils) {
            const dimensions = this.geometryUtils.getGeometryDimensions(obj.geometry);
            if (dimensions) {
                serialized.dimensions = {
                    x: parseFloat(dimensions.x.toFixed(this.PRECISION.dimensions)),
                    y: parseFloat(dimensions.y.toFixed(this.PRECISION.dimensions)),
                    z: parseFloat(dimensions.z.toFixed(this.PRECISION.dimensions))
                };
                return;
            }
        }

        // Fallback to geometry parameters for basic geometries
        if (obj.geometry.parameters) {
            const params = obj.geometry.parameters;
            serialized.dimensions = {
                x: parseFloat((params.width || 1).toFixed(this.PRECISION.dimensions)),
                y: parseFloat((params.height || 1).toFixed(this.PRECISION.dimensions)),
                z: parseFloat((params.depth || 1).toFixed(this.PRECISION.dimensions))
            };
        }
    }

    /**
     * Add material data to serialized object
     * @private
     */
    addMaterialData(serialized, obj) {
        if (!obj.material) return;

        serialized.material = {
            color: obj.material.color ? obj.material.color.getHexString() : 'ffffff',
            opacity: obj.material.opacity !== undefined ? obj.material.opacity : 1,
            transparent: obj.material.transparent || false
        };

        // Add additional material properties if available
        if (obj.material.wireframe !== undefined) {
            serialized.material.wireframe = obj.material.wireframe;
        }
        if (obj.material.visible !== undefined) {
            serialized.material.visible = obj.material.visible;
        }
    }

    /**
     * Add container-specific data to serialized object
     * @private
     */
    addContainerData(serialized, objectData) {
        serialized.children = objectData.children || [];
        serialized.layout = objectData.layout || null;
        serialized.autoLayout = objectData.autoLayout || null;

        // Add sizing mode for containers
        if (objectData.sizingMode) {
            serialized.sizingMode = objectData.sizingMode;
        }
    }

    /**
     * Add hierarchy data to serialized object
     * @private
     */
    addHierarchyData(serialized, objectData) {
        // Use consistent field name throughout system
        // IMPORTANT: Always use 'parentContainer' not 'parent' for consistency
        serialized.parentContainer = objectData.parentContainer || null;

        // Add depth level for UI indentation
        if (objectData.depth !== undefined) {
            serialized.depth = objectData.depth;
        }
    }

    /**
     * Check cache for existing serialization
     * @private
     */
    getCachedSerialization(obj, changeType) {
        const cacheKey = `${obj.uuid}_${changeType}`;
        const cached = this.serializationCache.get(cacheKey);

        if (cached && (Date.now() - cached.timestamp < this.cacheMaxAge)) {
            return cached.data;
        }

        // Remove expired cache entry
        if (cached) {
            this.serializationCache.delete(cacheKey);
        }

        return null;
    }

    /**
     * Cache serialized object data
     * @private
     */
    cacheSerializedObject(obj, changeType, serializedData) {
        const cacheKey = `${obj.uuid}_${changeType}`;
        this.serializationCache.set(cacheKey, {
            data: { ...serializedData }, // Deep copy to prevent mutations
            timestamp: Date.now()
        });

        // Prevent cache from growing too large
        if (this.serializationCache.size > 100) {
            this.cleanupCache();
        }
    }

    /**
     * Clean up expired cache entries
     * @private
     */
    cleanupCache() {
        const now = Date.now();
        for (const [key, entry] of this.serializationCache.entries()) {
            if (now - entry.timestamp > this.cacheMaxAge) {
                this.serializationCache.delete(key);
            }
        }
    }

    /**
     * Serialize object for specific change type with optimizations
     * @param {THREE.Object3D} obj - Object to serialize
     * @param {string} changeType - Type of change ('transform', 'geometry', 'material', etc.)
     * @returns {Object|null} Optimized serialized data
     */
    serializeForChangeType(obj, changeType) {
        const options = {};

        // Optimize based on change type
        switch (changeType) {
            case 'transform':
                // For transform changes, we don't need geometry recalculation
                options.includeGeometry = false;
                break;

            case 'geometry':
                // For geometry changes, force fresh dimension calculation
                options.useCache = false;
                break;

            case 'material':
                // For material changes, geometry and hierarchy unchanged
                options.includeGeometry = false;
                options.includeHierarchy = false;
                break;

            case 'hierarchy':
                // For hierarchy changes, focus on relationship data
                options.includeGeometry = false;
                break;
        }

        return this.serializeObject(obj, options);
    }

    /**
     * Get serialization statistics for debugging
     * @returns {Object} Statistics object
     */
    getStats() {
        return {
            ...this.stats,
            cacheSize: this.serializationCache.size,
            cacheHitRate: this.stats.serializations > 0 ?
                (this.stats.cacheHits / this.stats.serializations * 100).toFixed(1) + '%' : '0%',
            availableComponents: {
                geometryUtils: !!this.geometryUtils,
                sceneController: !!this.sceneController
            }
        };
    }

    /**
     * Clear cache and reset statistics
     */
    reset() {
        this.serializationCache.clear();
        Object.keys(this.stats).forEach(key => this.stats[key] = 0);
    }

    /**
     * Dispose of the serializer and clean up resources
     */
    dispose() {
        this.reset();
        this.geometryUtils = null;
        this.sceneController = null;
    }
}

// Export for use in main application
window.ObjectSerializer = ObjectSerializer;