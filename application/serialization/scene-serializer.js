/**
 * SceneSerializer - Complete Scene Export System
 *
 * Exports entire application state to versioned JSON format for file storage.
 * Captures objects, hierarchy, camera, configuration, and metadata.
 *
 * Used by FileManager for save operations and auto-save.
 */

class SceneSerializer {
    constructor() {
        // Component references (lazy-loaded)
        this.sceneController = null;
        this.cameraController = null;
        this.configurationManager = null;
        this.objectSerializer = null;

        // Current file format version (semantic versioning)
        this.CURRENT_VERSION = '1.0.0';

        // Statistics for debugging
        this.stats = {
            serializations: 0,
            lastSerializationTime: 0,
            lastSerializationSize: 0
        };
    }

    /**
     * Initialize component references
     * Called automatically on first use
     */
    initializeComponents() {
        if (!this.sceneController) {
            this.sceneController = window.modlerComponents?.sceneController;
        }
        if (!this.cameraController) {
            this.cameraController = window.modlerComponents?.cameraController;
        }
        if (!this.configurationManager) {
            this.configurationManager = window.modlerComponents?.configurationManager;
        }
        if (!this.objectSerializer) {
            this.objectSerializer = window.modlerComponents?.objectSerializer;
        }
    }

    /**
     * Serialize complete scene to JSON
     * @param {Object} options - Serialization options
     * @param {string} options.fileName - Name for the scene file
     * @param {Object} options.metadata - Additional metadata to include
     * @returns {Object} Complete scene data in JSON format
     */
    serializeScene(options = {}) {
        const startTime = performance.now();

        try {
            this.initializeComponents();

            if (!this.sceneController) {
                throw new Error('SceneController not available');
            }

            // Build complete scene data structure
            const sceneData = {
                // File format version for migration support
                version: this.CURRENT_VERSION,

                // File metadata
                metadata: this.serializeMetadata(options),

                // Scene content
                scene: this.serializeSceneContent(),

                // Camera state
                camera: this.serializeCameraState(),

                // Visual configuration
                configuration: this.serializeConfiguration(),

                // Marketplace metadata (for future cloud storage)
                marketplace: this.serializeMarketplaceData()
            };

            // Update statistics
            const endTime = performance.now();
            this.stats.serializations++;
            this.stats.lastSerializationTime = endTime - startTime;
            this.stats.lastSerializationSize = JSON.stringify(sceneData).length;

            return sceneData;

        } catch (error) {
            console.error('SceneSerializer: Failed to serialize scene:', error);
            throw error;
        }
    }

    /**
     * Serialize file metadata
     * @param {Object} options - Options containing fileName and additional metadata
     * @returns {Object} Metadata object
     */
    serializeMetadata(options = {}) {
        const now = Date.now();

        return {
            name: options.fileName || 'Untitled',
            created: options.createdTimestamp || now,
            modified: now,
            appVersion: this.getAppVersion(),
            description: options.description || ''
        };
    }

    /**
     * Serialize scene content (objects and hierarchy)
     * @returns {Object} Scene content data
     */
    serializeSceneContent() {
        const allObjects = this.sceneController.getAllObjects();

        // Filter out system objects (floor grid, etc.) - these are app-level, not scene content
        const sceneObjects = allObjects.filter(obj => {
            return obj.category !== 'system' && obj.type !== 'grid';
        });

        // Serialize each object using ObjectSerializer for consistency
        const serializedObjects = sceneObjects.map(obj => {
            let serialized;
            if (this.objectSerializer) {
                // Use existing ObjectSerializer for standardized format
                serialized = this.objectSerializer.serializeObject(obj.mesh, {
                    includeGeometry: true,
                    includeHierarchy: true,
                    useCache: false // Don't use cache for file save
                });
            } else {
                console.warn('[SceneSerializer] ObjectSerializer not available, using fallback');
                // Fallback: serialize essential properties directly
                serialized = this.serializeObjectFallback(obj);
            }

            return serialized;
        }).filter(Boolean); // Remove any null entries

        return {
            objects: serializedObjects,
            rootChildrenOrder: this.sceneController.rootChildrenOrder || [],
            nextId: this.sceneController.nextId,
            nextBoxNumber: this.sceneController.nextBoxNumber,
            nextContainerNumber: this.sceneController.nextContainerNumber
        };
    }

    /**
     * Fallback object serialization (if ObjectSerializer unavailable)
     * @param {Object} obj - Object data from SceneController
     * @returns {Object} Serialized object data
     */
    serializeObjectFallback(obj) {
        // ARCHITECTURE: Read dimensions from geometry via DimensionManager (single source of truth)
        const dimensions = window.dimensionManager?.getDimensions(obj.mesh) || { x: 1, y: 1, z: 1 };

        return {
            id: obj.id,
            name: obj.name,
            type: obj.type,
            parentContainer: obj.parentContainer || null,
            childrenOrder: obj.childrenOrder || [],
            position: obj.position ? { ...obj.position } : { x: 0, y: 0, z: 0 },
            rotation: obj.rotation ? { ...obj.rotation } : { x: 0, y: 0, z: 0 },
            dimensions: dimensions,
            material: obj.material ? {
                color: obj.material.color && obj.material.color.isColor
                    ? '#' + obj.material.color.getHexString() // Convert THREE.Color to hex string
                    : (obj.material.color || '#808080'),
                opacity: obj.material.opacity ?? 1.0,
                transparent: obj.material.transparent ?? false
            } : {
                color: '#808080',
                opacity: 1.0,
                transparent: false
            },
            isContainer: obj.isContainer || false,
            isHug: obj.isHug || false,
            layoutMode: obj.layoutMode || null,
            autoLayout: obj.autoLayout || {
                enabled: false,
                direction: null,
                gap: 0,
                padding: { top: 0, bottom: 0, left: 0, right: 0, front: 0, back: 0 }
            },
            visible: obj.visible ?? true,
            locked: obj.locked || false
        };
    }

    /**
     * Serialize camera state
     * @returns {Object} Camera position, rotation, and orbit target
     */
    serializeCameraState() {
        if (!this.cameraController || !this.cameraController.camera) {
            // Return default camera state
            return {
                position: { x: 5, y: 5, z: 5 },
                rotation: { x: 0, y: 0, z: 0 },
                orbitTarget: { x: 0, y: 0, z: 0 }
            };
        }

        const camera = this.cameraController.camera;
        const orbitTarget = this.cameraController.orbitTarget;

        return {
            position: {
                x: this.roundToPrecision(camera.position.x, 3),
                y: this.roundToPrecision(camera.position.y, 3),
                z: this.roundToPrecision(camera.position.z, 3)
            },
            rotation: {
                x: this.roundToPrecision(camera.rotation.x, 3),
                y: this.roundToPrecision(camera.rotation.y, 3),
                z: this.roundToPrecision(camera.rotation.z, 3)
            },
            orbitTarget: orbitTarget ? {
                x: this.roundToPrecision(orbitTarget.x, 3),
                y: this.roundToPrecision(orbitTarget.y, 3),
                z: this.roundToPrecision(orbitTarget.z, 3)
            } : { x: 0, y: 0, z: 0 }
        };
    }

    /**
     * Serialize visual configuration settings
     * @returns {Object} Configuration data
     *
     * NOTE: Visual settings (colors, opacity, etc.) should NOT be saved per-file.
     * They are app-wide settings stored in ConfigurationManager and persist separately.
     * This method returns an empty object to maintain file format compatibility.
     */
    serializeConfiguration() {
        // Return empty object - visual configuration is app-wide, not per-file
        return {};
    }

    /**
     * Serialize marketplace metadata (for future cloud storage)
     * @returns {Object} Marketplace data
     */
    serializeMarketplaceData() {
        return {
            isLocked: false,
            originalAuthor: null,
            purchaseChain: [],
            licenseType: 'single-use'
        };
    }

    /**
     * Get application version
     * @returns {string} App version string
     */
    getAppVersion() {
        // Try to get from package.json or hardcoded version
        return '2.1.0'; // Update this when app version changes
    }

    /**
     * Round number to specified precision
     * @param {number} value - Value to round
     * @param {number} precision - Decimal places
     * @returns {number} Rounded value
     */
    roundToPrecision(value, precision) {
        const multiplier = Math.pow(10, precision);
        return Math.round(value * multiplier) / multiplier;
    }

    /**
     * Validate serialized scene data
     * @param {Object} sceneData - Scene data to validate
     * @returns {Object} Validation result { valid: boolean, errors: string[] }
     */
    validateSceneData(sceneData) {
        const errors = [];

        // Check required top-level properties
        if (!sceneData.version) {
            errors.push('Missing version property');
        }
        if (!sceneData.metadata) {
            errors.push('Missing metadata property');
        }
        if (!sceneData.scene) {
            errors.push('Missing scene property');
        }

        // Check scene content
        if (sceneData.scene && !Array.isArray(sceneData.scene.objects)) {
            errors.push('scene.objects must be an array');
        }

        // Check metadata
        if (sceneData.metadata && !sceneData.metadata.name) {
            errors.push('metadata.name is required');
        }

        return {
            valid: errors.length === 0,
            errors: errors
        };
    }

    /**
     * Get serialization statistics
     * @returns {Object} Statistics object
     */
    getStats() {
        return { ...this.stats };
    }

    /**
     * Reset statistics
     */
    resetStats() {
        this.stats = {
            serializations: 0,
            lastSerializationTime: 0,
            lastSerializationSize: 0
        };
    }
}

// Make globally available
if (typeof window !== 'undefined') {
    window.SceneSerializer = SceneSerializer;
}
