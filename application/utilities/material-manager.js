// Modler V2 - Material Manager
// Centralized material creation, caching, and configuration management
// Eliminates scattered material creation across visualization systems

class MaterialManager {
    constructor() {
        // Material cache - prevents duplicate materials
        this.materialCache = new Map(); // key -> material instance

        // Configuration callbacks
        this.configCallbacks = new Map(); // config path -> callback array

        // Active materials tracking for cleanup
        this.activeMaterials = new Set();

        // Material type registry
        this.materialTypes = {
            SELECTION_EDGE: 'selection-edge',
            CONTAINER_WIREFRAME: 'container-wireframe',
            FACE_HIGHLIGHT: 'face-highlight',
            AXIS_HIGHLIGHT: 'axis-highlight',
            PADDING_VISUALIZATION: 'padding-viz',
            PREVIEW_WIREFRAME: 'preview-wireframe',
            LAYOUT_GUIDE: 'layout-guide',
            HOVER_EFFECT: 'hover-effect'
        };

        // Performance metrics
        this.stats = {
            created: 0,
            cached: 0,
            disposed: 0,
            configUpdates: 0
        };

        this.initializeConfiguration();
    }

    /**
     * Initialize configuration system
     */
    initializeConfiguration() {
        // Wait for configuration manager to be available
        if (window.modlerComponents?.configurationManager) {
            this.registerConfigurationCallbacks();
        } else {
            const checkConfigManager = () => {
                if (window.modlerComponents?.configurationManager) {
                    this.registerConfigurationCallbacks();
                } else {
                    setTimeout(checkConfigManager, 100);
                }
            };
            checkConfigManager();
        }
    }

    /**
     * Get configuration manager
     */
    getConfigManager() {
        return window.modlerComponents?.configurationManager;
    }

    /**
     * Register configuration change callbacks
     */
    registerConfigurationCallbacks() {
        const configManager = this.getConfigManager();
        if (!configManager) return;

        // Selection materials
        this.registerConfigCallback('visual.selection.color', (newValue) => {
            this.updateMaterialsOfType(this.materialTypes.SELECTION_EDGE, 'color', newValue);
            this.updateMaterialsOfType(this.materialTypes.FACE_HIGHLIGHT, 'color', newValue);
        });

        this.registerConfigCallback('visual.selection.lineWidth', (newValue) => {
            this.updateMaterialsOfType(this.materialTypes.SELECTION_EDGE, 'linewidth', newValue);
        });

        this.registerConfigCallback('visual.selection.opacity', (newValue) => {
            this.updateMaterialsOfType(this.materialTypes.SELECTION_EDGE, 'opacity', newValue);
        });

        // Container materials
        this.registerConfigCallback('visual.containers.wireframeColor', (newValue) => {
            this.updateMaterialsOfType(this.materialTypes.CONTAINER_WIREFRAME, 'color', newValue);
        });

        this.registerConfigCallback('visual.containers.lineWidth', (newValue) => {
            this.updateMaterialsOfType(this.materialTypes.CONTAINER_WIREFRAME, 'linewidth', newValue);
        });

        this.registerConfigCallback('visual.containers.opacity', (newValue) => {
            this.updateMaterialsOfType(this.materialTypes.CONTAINER_WIREFRAME, 'opacity', newValue);
        });

        // Face highlight materials
        this.registerConfigCallback('visual.effects.materials.face.opacity', (newValue) => {
            this.updateMaterialsOfType(this.materialTypes.FACE_HIGHLIGHT, 'opacity', newValue);
            this.updateMaterialsOfType(this.materialTypes.AXIS_HIGHLIGHT, 'opacity', newValue);
        });

        // Preview materials
        this.registerConfigCallback('visual.boxCreation.color', (newValue) => {
            this.updateMaterialsOfType(this.materialTypes.PREVIEW_WIREFRAME, 'color', newValue);
        });

        this.registerConfigCallback('visual.effects.wireframe.lineWidth', (newValue) => {
            this.updateMaterialsOfType(this.materialTypes.PREVIEW_WIREFRAME, 'linewidth', newValue);
            this.updateMaterialsOfType(this.materialTypes.PADDING_VISUALIZATION, 'linewidth', newValue);
        });

        console.log('MaterialManager: Configuration callbacks registered');
    }

    /**
     * Register a configuration callback
     */
    registerConfigCallback(configPath, callback) {
        if (!this.configCallbacks.has(configPath)) {
            this.configCallbacks.set(configPath, []);
        }
        this.configCallbacks.get(configPath).push(callback);

        // Register with configuration manager
        const configManager = this.getConfigManager();
        if (configManager && configManager.subscribe) {
            configManager.subscribe(configPath, callback);
        }
    }

    // ===== MATERIAL FACTORY METHODS =====

    /**
     * Create or get cached selection edge material (orange wireframe)
     * @param {Object} options - Material options
     * @returns {THREE.LineBasicMaterial} Selection edge material
     */
    createSelectionEdgeMaterial(options = {}) {
        const configManager = this.getConfigManager();

        // Build configuration
        const config = {
            color: options.color || configManager?.get('visual.selection.color') || '#ff6600',
            lineWidth: options.lineWidth || configManager?.get('visual.selection.lineWidth') || 2,
            opacity: options.opacity || configManager?.get('visual.selection.opacity') || 0.8,
            renderOrder: options.renderOrder || configManager?.get('visual.selection.renderOrder') || 999,
            transparent: true,
            ...options
        };

        // Generate cache key
        const key = this.generateMaterialKey(this.materialTypes.SELECTION_EDGE, config);

        // Check cache
        const cached = this.getMaterialFromCache(key);
        if (cached) return cached;

        // Create new material
        const colorHex = parseInt(config.color.replace('#', ''), 16);
        const material = new THREE.LineBasicMaterial({
            color: colorHex,
            transparent: config.transparent,
            opacity: config.opacity,
            linewidth: config.lineWidth
        });

        material.lineWidth = config.lineWidth;
        material.renderOrder = config.renderOrder;

        return this.cacheMaterial(key, material, this.materialTypes.SELECTION_EDGE);
    }

    /**
     * Create or get cached container wireframe material (green wireframe)
     * @param {Object} options - Material options
     * @returns {THREE.LineBasicMaterial} Container wireframe material
     */
    createContainerWireframeMaterial(options = {}) {
        const configManager = this.getConfigManager();

        // Build configuration
        const config = {
            color: options.color || configManager?.get('visual.containers.wireframeColor') || '#00ff00',
            lineWidth: options.lineWidth || configManager?.get('visual.containers.lineWidth') || 1,
            opacity: options.opacity || configManager?.get('visual.containers.opacity') || 0.8,
            renderOrder: options.renderOrder || configManager?.get('visual.containers.renderOrder') || 998,
            transparent: true,
            ...options
        };

        // Generate cache key
        const key = this.generateMaterialKey(this.materialTypes.CONTAINER_WIREFRAME, config);

        // Check cache
        const cached = this.getMaterialFromCache(key);
        if (cached) return cached;

        // Create new material
        const colorHex = parseInt(config.color.replace('#', ''), 16);
        const material = new THREE.LineBasicMaterial({
            color: colorHex,
            transparent: config.transparent,
            opacity: config.opacity,
            linewidth: config.lineWidth
        });

        material.lineWidth = config.lineWidth;
        material.renderOrder = config.renderOrder;

        return this.cacheMaterial(key, material, this.materialTypes.CONTAINER_WIREFRAME);
    }

    /**
     * Create or get cached face highlight material
     * @param {Object} options - Material options
     * @returns {THREE.MeshBasicMaterial} Face highlight material
     */
    createFaceHighlightMaterial(options = {}) {
        const configManager = this.getConfigManager();

        // Build configuration
        const config = {
            color: options.color || configManager?.get('visual.selection.color') || '#ff6600',
            opacity: options.opacity || configManager?.get('visual.effects.materials.face.opacity') || 0.6,
            renderOrder: options.renderOrder || configManager?.get('visual.effects.materials.face.renderOrder') || 1000,
            side: THREE.DoubleSide,
            transparent: true,
            depthTest: false,
            depthWrite: false,
            ...options
        };

        // Generate cache key
        const key = this.generateMaterialKey(this.materialTypes.FACE_HIGHLIGHT, config);

        // Check cache
        const cached = this.getMaterialFromCache(key);
        if (cached) return cached;

        // Create new material
        const colorHex = parseInt(config.color.replace('#', ''), 16);
        const material = new THREE.MeshBasicMaterial({
            color: colorHex,
            transparent: config.transparent,
            opacity: config.opacity,
            side: config.side,
            depthTest: config.depthTest,
            depthWrite: config.depthWrite
        });

        material.renderOrder = config.renderOrder;

        return this.cacheMaterial(key, material, this.materialTypes.FACE_HIGHLIGHT);
    }

    /**
     * Create contextual highlight material (different colors for containers vs objects)
     * @param {THREE.Object3D} targetObject - Object to create material for
     * @param {Object} options - Material options
     * @returns {THREE.MeshBasicMaterial} Contextual highlight material
     */
    createContextualHighlightMaterial(targetObject, options = {}) {
        const configManager = this.getConfigManager();

        // Determine color based on object type
        let highlightColor;
        if (this.isContainer(targetObject)) {
            highlightColor = configManager?.get('visual.containers.wireframeColor') || '#00ff00';
        } else {
            highlightColor = configManager?.get('visual.selection.color') || '#ff6600';
        }

        // Use face highlight factory with contextual color
        return this.createFaceHighlightMaterial({
            color: highlightColor,
            ...options
        });
    }

    /**
     * Create axis highlight material (for push tool)
     * @param {Object} options - Material options
     * @returns {THREE.MeshBasicMaterial} Axis highlight material
     */
    createAxisHighlightMaterial(options = {}) {
        const configManager = this.getConfigManager();

        // Build configuration
        const config = {
            color: options.color || configManager?.get('visual.effects.axisHighlight.color') || '#00ff88',
            opacity: options.opacity || configManager?.get('visual.effects.axisHighlight.opacity') || 0.3,
            side: THREE.DoubleSide,
            transparent: true,
            depthTest: false,
            depthWrite: false,
            ...options
        };

        // Generate cache key
        const key = this.generateMaterialKey(this.materialTypes.AXIS_HIGHLIGHT, config);

        // Check cache
        const cached = this.getMaterialFromCache(key);
        if (cached) return cached;

        // Create new material
        const colorHex = parseInt(config.color.replace('#', ''), 16);
        const material = new THREE.MeshBasicMaterial({
            color: colorHex,
            opacity: config.opacity,
            transparent: config.transparent,
            side: config.side,
            depthTest: config.depthTest,
            depthWrite: config.depthWrite
        });

        return this.cacheMaterial(key, material, this.materialTypes.AXIS_HIGHLIGHT);
    }

    /**
     * Create preview wireframe material (for box creation, etc.)
     * @param {Object} options - Material options
     * @returns {THREE.LineBasicMaterial} Preview wireframe material
     */
    createPreviewWireframeMaterial(options = {}) {
        const configManager = this.getConfigManager();

        // Build configuration
        const config = {
            color: options.color || configManager?.get('visual.boxCreation.color') || '#00ff00',
            lineWidth: options.lineWidth || configManager?.get('visual.effects.wireframe.lineWidth') || 1,
            opacity: options.opacity !== undefined ? options.opacity : 0.8,
            transparent: true,
            ...options
        };

        // Generate cache key
        const key = this.generateMaterialKey(this.materialTypes.PREVIEW_WIREFRAME, config);

        // Check cache
        const cached = this.getMaterialFromCache(key);
        if (cached) return cached;

        // Create new material
        const colorHex = parseInt(config.color.replace('#', ''), 16);
        const material = new THREE.LineBasicMaterial({
            color: colorHex,
            transparent: config.transparent,
            opacity: config.opacity,
            linewidth: config.lineWidth
        });

        return this.cacheMaterial(key, material, this.materialTypes.PREVIEW_WIREFRAME);
    }

    /**
     * Create padding visualization material
     * @param {Object} options - Material options
     * @returns {THREE.MeshBasicMaterial} Padding visualization material
     */
    createPaddingVisualizationMaterial(options = {}) {
        // Build configuration
        const config = {
            color: options.color || '#ff9900',
            opacity: options.opacity !== undefined ? options.opacity : 0.3,
            wireframe: true,
            transparent: true,
            ...options
        };

        // Generate cache key
        const key = this.generateMaterialKey(this.materialTypes.PADDING_VISUALIZATION, config);

        // Check cache
        const cached = this.getMaterialFromCache(key);
        if (cached) return cached;

        // Create new material
        const colorHex = parseInt(config.color.replace('#', ''), 16);
        const material = new THREE.MeshBasicMaterial({
            color: colorHex,
            transparent: config.transparent,
            opacity: config.opacity,
            wireframe: config.wireframe
        });

        return this.cacheMaterial(key, material, this.materialTypes.PADDING_VISUALIZATION);
    }

    /**
     * Create layout guide material
     * @param {Object} options - Material options
     * @returns {THREE.LineBasicMaterial} Layout guide material
     */
    createLayoutGuideMaterial(options = {}) {
        // Build configuration
        const config = {
            color: options.color || '#ffff00',
            opacity: options.opacity !== undefined ? options.opacity : 0.5,
            lineWidth: options.lineWidth || 1,
            transparent: true,
            ...options
        };

        // Generate cache key
        const key = this.generateMaterialKey(this.materialTypes.LAYOUT_GUIDE, config);

        // Check cache
        const cached = this.getMaterialFromCache(key);
        if (cached) return cached;

        // Create new material
        const colorHex = parseInt(config.color.replace('#', ''), 16);
        const material = new THREE.LineBasicMaterial({
            color: colorHex,
            transparent: config.transparent,
            opacity: config.opacity,
            linewidth: config.lineWidth
        });

        return this.cacheMaterial(key, material, this.materialTypes.LAYOUT_GUIDE);
    }

    // ===== UTILITY METHODS =====

    /**
     * Check if object is a container
     * @param {THREE.Object3D} object - Object to check
     * @returns {boolean} True if object is a container
     */
    isContainer(object) {
        const sceneController = window.modlerComponents?.sceneController;
        if (sceneController) {
            const objectData = sceneController.getObjectByMesh(object);
            return objectData && objectData.isContainer;
        }
        return false;
    }

    /**
     * Generate cache key for material
     * @param {string} type - Material type
     * @param {Object} config - Material configuration
     * @returns {string} Cache key
     */
    generateMaterialKey(type, config) {
        // Create a stable key from config properties
        const keyProps = [
            type,
            config.color || 'default',
            config.opacity || '1',
            config.lineWidth || '1',
            config.wireframe || 'false',
            config.transparent || 'false',
            config.side || 'front',
            config.depthTest || 'true',
            config.depthWrite || 'true'
        ];

        return keyProps.join('_');
    }

    /**
     * Get material from cache
     * @param {string} key - Cache key
     * @returns {THREE.Material|null} Cached material or null
     */
    getMaterialFromCache(key) {
        const cached = this.materialCache.get(key);
        if (cached) {
            this.stats.cached++;
            return cached;
        }
        return null;
    }

    /**
     * Cache material instance
     * @param {string} key - Cache key
     * @param {THREE.Material} material - Material to cache
     * @param {string} type - Material type
     * @returns {THREE.Material} The cached material
     */
    cacheMaterial(key, material, type) {
        // Store in cache
        this.materialCache.set(key, material);

        // Track as active
        this.activeMaterials.add(material);

        // Add metadata for tracking
        material.userData = material.userData || {};
        material.userData.materialManagerType = type;
        material.userData.cacheKey = key;
        material.userData.createdAt = Date.now();

        this.stats.created++;
        return material;
    }

    /**
     * Update all materials of a specific type with new property value
     * @param {string} type - Material type to update
     * @param {string} property - Property to update
     * @param {*} value - New value
     */
    updateMaterialsOfType(type, property, value) {
        let updatedCount = 0;

        for (const material of this.activeMaterials) {
            if (material.userData?.materialManagerType === type) {
                try {
                    if (property === 'color' && typeof value === 'string') {
                        const colorHex = parseInt(value.replace('#', ''), 16);
                        material.color.setHex(colorHex);
                    } else if (property === 'linewidth') {
                        material.lineWidth = value;
                    } else {
                        material[property] = value;
                    }

                    material.needsUpdate = true;
                    updatedCount++;
                } catch (error) {
                    console.warn('MaterialManager: Error updating material property:', error);
                }
            }
        }

        if (updatedCount > 0) {
            this.stats.configUpdates++;
            console.log(`MaterialManager: Updated ${updatedCount} materials of type ${type} with ${property}=${value}`);
        }
    }

    /**
     * Dispose of specific material and remove from cache
     * @param {THREE.Material} material - Material to dispose
     */
    disposeMaterial(material) {
        if (!material) return;

        try {
            // Remove from cache if present
            if (material.userData?.cacheKey) {
                this.materialCache.delete(material.userData.cacheKey);
            }

            // Remove from active tracking
            this.activeMaterials.delete(material);

            // Dispose material
            material.dispose();
            this.stats.disposed++;

        } catch (error) {
            console.warn('MaterialManager: Error disposing material:', error);
        }
    }

    /**
     * Clear all cached materials and dispose them
     */
    clearAllMaterials() {
        // Dispose all active materials
        for (const material of this.activeMaterials) {
            try {
                material.dispose();
                this.stats.disposed++;
            } catch (error) {
                console.warn('MaterialManager: Error disposing material during cleanup:', error);
            }
        }

        // Clear collections
        this.materialCache.clear();
        this.activeMaterials.clear();

        console.log('MaterialManager: All materials cleared and disposed');
    }

    // ===== STANDARD MATERIAL CREATION METHODS =====

    /**
     * Create MeshLambertMaterial with caching and configuration
     * @param {Object} options - Material options
     * @param {number|string} options.color - Material color (hex number or string)
     * @param {number} options.opacity - Material opacity (optional)
     * @param {boolean} options.transparent - Enable transparency (optional)
     * @param {boolean} options.wireframe - Enable wireframe mode (optional)
     * @returns {THREE.MeshLambertMaterial} Cached or new material
     */
    createMeshLambertMaterial(options = {}) {
        // Normalize options
        const normalizedOptions = {
            color: this.normalizeColor(options.color || '#888888'),
            opacity: options.opacity !== undefined ? options.opacity : 1.0,
            transparent: options.transparent !== undefined ? options.transparent : (options.opacity !== undefined && options.opacity < 1.0),
            wireframe: options.wireframe || false
        };

        // Generate cache key
        const key = `lambert_${normalizedOptions.color}_${normalizedOptions.opacity}_${normalizedOptions.transparent}_${normalizedOptions.wireframe}`;

        // Check cache first
        if (this.materialCache.has(key)) {
            this.stats.cached++;
            return this.materialCache.get(key);
        }

        // Create new material
        const material = new THREE.MeshLambertMaterial({
            color: normalizedOptions.color,
            opacity: normalizedOptions.opacity,
            transparent: normalizedOptions.transparent,
            wireframe: normalizedOptions.wireframe
        });

        // Add metadata and cache
        material.userData.materialManagerType = 'meshLambert';
        material.userData.materialManagerKey = key;
        this.cacheMaterial(key, material);
        this.trackMaterial(material);

        this.stats.created++;
        return material;
    }

    /**
     * Create MeshBasicMaterial with caching and configuration
     * @param {Object} options - Material options
     * @param {number|string} options.color - Material color (hex number or string)
     * @param {number} options.opacity - Material opacity (optional)
     * @param {boolean} options.transparent - Enable transparency (optional)
     * @param {boolean} options.wireframe - Enable wireframe mode (optional)
     * @param {boolean} options.colorWrite - Enable color write (optional)
     * @param {boolean} options.depthWrite - Enable depth write (optional)
     * @param {number} options.side - Material side (optional)
     * @returns {THREE.MeshBasicMaterial} Cached or new material
     */
    createMeshBasicMaterial(options = {}) {
        // Normalize options
        const normalizedOptions = {
            color: this.normalizeColor(options.color || '#888888'),
            opacity: options.opacity !== undefined ? options.opacity : 1.0,
            transparent: options.transparent !== undefined ? options.transparent : (options.opacity !== undefined && options.opacity < 1.0),
            wireframe: options.wireframe || false,
            colorWrite: options.colorWrite !== undefined ? options.colorWrite : true,
            depthWrite: options.depthWrite !== undefined ? options.depthWrite : true,
            side: options.side !== undefined ? options.side : THREE.FrontSide
        };

        // Generate cache key
        const key = `basic_${normalizedOptions.color}_${normalizedOptions.opacity}_${normalizedOptions.transparent}_${normalizedOptions.wireframe}_${normalizedOptions.colorWrite}_${normalizedOptions.depthWrite}_${normalizedOptions.side}`;

        // Check cache first
        if (this.materialCache.has(key)) {
            this.stats.cached++;
            return this.materialCache.get(key);
        }

        // Create new material
        const material = new THREE.MeshBasicMaterial({
            color: normalizedOptions.color,
            opacity: normalizedOptions.opacity,
            transparent: normalizedOptions.transparent,
            wireframe: normalizedOptions.wireframe,
            colorWrite: normalizedOptions.colorWrite,
            depthWrite: normalizedOptions.depthWrite,
            side: normalizedOptions.side
        });

        // Add metadata and cache
        material.userData.materialManagerType = 'meshBasic';
        material.userData.materialManagerKey = key;
        this.cacheMaterial(key, material);
        this.trackMaterial(material);

        this.stats.created++;
        return material;
    }

    /**
     * Create specialized invisible material for raycast planes
     * @param {Object} options - Material options
     * @returns {THREE.MeshBasicMaterial} Invisible material optimized for raycasting
     */
    createInvisibleRaycastMaterial(options = {}) {
        return this.createMeshBasicMaterial({
            transparent: true,
            opacity: 0.0,
            colorWrite: false,
            depthWrite: false,
            side: options.side || THREE.DoubleSide,
            ...options
        });
    }

    /**
     * Create specialized container interaction material
     * @param {Object} options - Material options
     * @returns {THREE.MeshBasicMaterial} Material optimized for container interaction
     */
    createContainerInteractionMaterial(options = {}) {
        return this.createMeshBasicMaterial({
            transparent: true,
            opacity: 0.0,
            colorWrite: false,
            depthWrite: false,
            wireframe: false,
            side: THREE.DoubleSide,
            ...options
        });
    }

    /**
     * Normalize color input to hex number
     * @param {number|string} color - Color as hex number or string
     * @returns {number} Normalized hex color
     */
    normalizeColor(color) {
        if (typeof color === 'string') {
            return parseInt(color.replace('#', ''), 16);
        }
        return color;
    }

    /**
     * Get performance and usage statistics
     * @returns {Object} Statistics object
     */
    getStats() {
        const cacheSize = this.materialCache.size;
        const activeCount = this.activeMaterials.size;

        // Count materials by type
        const typeCount = {};
        for (const material of this.activeMaterials) {
            const type = material.userData?.materialManagerType || 'unknown';
            typeCount[type] = (typeCount[type] || 0) + 1;
        }

        return {
            ...this.stats,
            cacheSize,
            activeCount,
            typeCount,
            cacheHitRate: this.stats.cached / (this.stats.created + this.stats.cached) || 0
        };
    }

    /**
     * Debug: Log all active materials
     */
    debugLogMaterials() {
        console.group('MaterialManager Active Materials');

        const byType = {};
        for (const material of this.activeMaterials) {
            const type = material.userData?.materialManagerType || 'unknown';
            if (!byType[type]) byType[type] = [];
            byType[type].push(material);
        }

        for (const [type, materials] of Object.entries(byType)) {
            console.log(`${type}: ${materials.length} materials`);
        }

        console.log('Total cache entries:', this.materialCache.size);
        console.log('Stats:', this.getStats());
        console.groupEnd();
    }

    /**
     * Destroy manager and clean up all resources
     */
    destroy() {
        // Clear all materials
        this.clearAllMaterials();

        // Clear configuration callbacks
        this.configCallbacks.clear();

        // Reset stats
        this.stats = {
            created: 0,
            cached: 0,
            disposed: 0,
            configUpdates: 0
        };

        console.log('MaterialManager: Destroyed and cleaned up');
    }
}

// Export for use in main application
window.MaterialManager = MaterialManager;