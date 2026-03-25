import * as THREE from 'three';
import { LineMaterial } from 'three/lines/LineMaterial';
// Modler V2 - Material Manager
// Centralized material creation, caching, and configuration management
// Eliminates scattered material creation across visualization systems

/**
 * MaterialGuard - Validation layer for material property modifications
 * Prevents unauthorized modifications to managed materials
 */
class MaterialGuard {
    /**
     * Safely set material opacity with validation
     * @param {THREE.Material} material - Material to modify
     * @param {number} value - New opacity value (0-1)
     * @param {string} modifierName - Name of component making the modification
     * @returns {boolean} Success status
     */
    static setOpacity(material, value, modifierName = 'Unknown') {
        if (!material) {
            console.warn('[MaterialGuard] Cannot set opacity: material is null');
            return false;
        }

        // Check if material is managed
        const isManaged = material.userData?.isManaged;
        const allowedModifiers = material.userData?.allowedModifiers || [];

        if (isManaged && !allowedModifiers.includes(modifierName)) {
            console.warn(`[MaterialGuard] Blocked unauthorized opacity modification:`, {
                modifier: modifierName,
                materialType: material.userData?.materialManagerType,
                allowedModifiers,
                attemptedValue: value,
                currentValue: material.opacity
            });
            return false;
        }

        // Validate value
        if (typeof value !== 'number' || isNaN(value) || value < 0 || value > 1) {
            console.warn('[MaterialGuard] Invalid opacity value:', value);
            return false;
        }

        // Apply modification
        material.opacity = value;
        material.needsUpdate = true;
        return true;
    }

    /**
     * Check if a material modification is allowed
     * @param {THREE.Material} material - Material to check
     * @param {string} modifierName - Name of component requesting modification
     * @returns {boolean} Whether modification is allowed
     */
    static canModify(material, modifierName = 'Unknown') {
        if (!material) return false;

        const isManaged = material.userData?.isManaged;
        if (!isManaged) return true; // Unmanaged materials can be modified

        const allowedModifiers = material.userData?.allowedModifiers || [];
        return allowedModifiers.includes(modifierName);
    }

    /**
     * Install development validator to monitor unauthorized material modifications
     * Only runs in development mode (when isDevelopment is true)
     * @param {Set} managedMaterials - Set of materials to monitor
     */
    static installDevelopmentValidator(managedMaterials) {
        // Check if in development mode
        const isDevelopment = window.location.hostname === 'localhost' ||
                            window.location.hostname === '127.0.0.1' ||
                            window.location.search.includes('debug=true');

        if (!isDevelopment) {
            return; // Skip in production
        }

        console.log('[MaterialGuard] Installing development validator for', managedMaterials.size, 'managed materials');

        // Install opacity trap on all managed materials
        for (const material of managedMaterials) {
            if (!material.userData?.isManaged) continue;

            // Store original opacity value
            let _opacity = material.opacity;
            const materialType = material.userData.materialManagerType;

            // Replace opacity property with getter/setter that logs modifications
            Object.defineProperty(material, 'opacity', {
                get() {
                    return _opacity;
                },
                set(value) {
                    _opacity = value;
                },
                configurable: true // Allow reconfiguration if needed
            });
        }
    }
}

class MaterialManager {
    constructor() {
        // Material cache - prevents duplicate materials
        this.materialCache = new Map(); // key -> material instance

        // Configuration callbacks
        this.configCallbacks = new Map(); // config path -> callback array

        // Active materials tracking for cleanup
        this.activeMaterials = new Set();

        // Color constants for special material states
        this.colors = {
            DISABLED_STATE: 0x888888,  // Grey for disabled/blocked tool operations
            DEFAULT_OBJECT: 0x888888   // Grey for default object material
        };

        // Material type registry
        this.materialTypes = {
            SELECTION_EDGE: 'selection-edge',
            CONTAINER_WIREFRAME: 'container-wireframe',
            FACE_HIGHLIGHT: 'face-highlight',
            FACE_HIGHLIGHT_CONTAINER: 'face-highlight-container',
            FACE_HIGHLIGHT_DISABLED: 'face-highlight-disabled',
            PADDING_VISUALIZATION: 'padding-viz',
            PREVIEW_WIREFRAME: 'preview-wireframe',
            CAD_WIREFRAME: 'cad-wireframe',
            LAYOUT_GUIDE: 'layout-guide',
            HOVER_EFFECT: 'hover-effect',
            SELECTION_EDGE_FAT: 'selection-edge-fat',
            CONTAINER_WIREFRAME_FAT: 'container-wireframe-fat',
            TOOL_GIZMO: 'tool-gizmo',
            YARD_CAD_WIREFRAME: 'yard-cad-wireframe'
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

        // Global wireframe line width — updates ALL wireframe material types
        this.registerConfigCallback('visual.wireframe.lineWidth', (newValue) => {
            this.updateMaterialsOfType(this.materialTypes.SELECTION_EDGE, 'linewidth', newValue);
            this.updateMaterialsOfType(this.materialTypes.SELECTION_EDGE_FAT, 'linewidth', newValue);
            this.updateMaterialsOfType(this.materialTypes.CONTAINER_WIREFRAME, 'linewidth', newValue);
            this.updateMaterialsOfType(this.materialTypes.CONTAINER_WIREFRAME_FAT, 'linewidth', newValue);
            this.updateMaterialsOfType(this.materialTypes.CAD_WIREFRAME, 'linewidth', newValue);
            this.updateMaterialsOfType(this.materialTypes.YARD_CAD_WIREFRAME, 'linewidth', newValue);
            this.updateMaterialsOfType(this.materialTypes.HOVER_EFFECT, 'linewidth', newValue);
            this.invalidateCacheForType(this.materialTypes.SELECTION_EDGE);
            this.invalidateCacheForType(this.materialTypes.SELECTION_EDGE_FAT);
            this.invalidateCacheForType(this.materialTypes.CONTAINER_WIREFRAME);
            this.invalidateCacheForType(this.materialTypes.CONTAINER_WIREFRAME_FAT);
            this.invalidateCacheForType(this.materialTypes.CAD_WIREFRAME);
            this.invalidateCacheForType(this.materialTypes.YARD_CAD_WIREFRAME);
            this.invalidateCacheForType(this.materialTypes.HOVER_EFFECT);
        });

        // Selection materials (both standard and fat LineMaterial)
        this.registerConfigCallback('visual.selection.color', (newValue) => {
            this.updateMaterialsOfType(this.materialTypes.SELECTION_EDGE, 'color', newValue);
            this.updateMaterialsOfType(this.materialTypes.SELECTION_EDGE_FAT, 'color', newValue);
            this.updateMaterialsOfType(this.materialTypes.FACE_HIGHLIGHT, 'color', newValue);
            this.invalidateCacheForType(this.materialTypes.SELECTION_EDGE);
            this.invalidateCacheForType(this.materialTypes.SELECTION_EDGE_FAT);
            this.invalidateCacheForType(this.materialTypes.FACE_HIGHLIGHT);
        });

        this.registerConfigCallback('visual.selection.opacity', (newValue) => {
            this.updateMaterialsOfType(this.materialTypes.SELECTION_EDGE, 'opacity', newValue);
            this.updateMaterialsOfType(this.materialTypes.SELECTION_EDGE_FAT, 'opacity', newValue);
            this.invalidateCacheForType(this.materialTypes.SELECTION_EDGE);
            this.invalidateCacheForType(this.materialTypes.SELECTION_EDGE_FAT);
        });

        this.registerConfigCallback('visual.selection.faceHighlightOpacity', (newValue) => {
            this.updateMaterialsOfType(this.materialTypes.FACE_HIGHLIGHT, 'opacity', newValue);
            this.updateMaterialsOfType(this.materialTypes.FACE_HIGHLIGHT_DISABLED, 'opacity', newValue);
            // Don't invalidate cache - we want to keep using the same material instance
        });

        // Container materials (both standard and fat LineMaterial)
        this.registerConfigCallback('visual.containers.wireframeColor', (newValue) => {
            this.updateMaterialsOfType(this.materialTypes.CONTAINER_WIREFRAME, 'color', newValue);
            this.updateMaterialsOfType(this.materialTypes.CONTAINER_WIREFRAME_FAT, 'color', newValue);
            this.updateMaterialsOfType(this.materialTypes.FACE_HIGHLIGHT_CONTAINER, 'color', newValue);
            this.invalidateCacheForType(this.materialTypes.CONTAINER_WIREFRAME);
            this.invalidateCacheForType(this.materialTypes.CONTAINER_WIREFRAME_FAT);
        });

        this.registerConfigCallback('visual.containers.opacity', (newValue) => {
            this.updateMaterialsOfType(this.materialTypes.CONTAINER_WIREFRAME, 'opacity', newValue);
            this.updateMaterialsOfType(this.materialTypes.CONTAINER_WIREFRAME_FAT, 'opacity', newValue);
            this.invalidateCacheForType(this.materialTypes.CONTAINER_WIREFRAME);
            this.invalidateCacheForType(this.materialTypes.CONTAINER_WIREFRAME_FAT);
        });

        this.registerConfigCallback('visual.containers.faceHighlightOpacity', (newValue) => {
            this.updateMaterialsOfType(this.materialTypes.FACE_HIGHLIGHT_CONTAINER, 'opacity', newValue);
            // Don't invalidate cache - we want to keep using the same material instance
        });

        // NOTE: visual.effects.materials.face.opacity callback removed - it was conflicting with
        // visual.selection.faceHighlightOpacity which is the correct setting for face highlights

        // Preview materials
        this.registerConfigCallback('visual.boxCreation.color', (newValue) => {
            this.updateMaterialsOfType(this.materialTypes.PREVIEW_WIREFRAME, 'color', newValue);
        });

        this.registerConfigCallback('visual.effects.wireframe.lineWidth', (newValue) => {
            this.updateMaterialsOfType(this.materialTypes.PREVIEW_WIREFRAME, 'linewidth', newValue);
            this.updateMaterialsOfType(this.materialTypes.PADDING_VISUALIZATION, 'linewidth', newValue);
        });

        // CAD wireframe materials
        this.registerConfigCallback('visual.cad.wireframe.color', (newValue) => {
            this.updateMaterialsOfType(this.materialTypes.CAD_WIREFRAME, 'color', newValue);
            this.invalidateCacheForType(this.materialTypes.CAD_WIREFRAME);
        });

        this.registerConfigCallback('visual.cad.wireframe.opacity', (newValue) => {
            this.updateMaterialsOfType(this.materialTypes.CAD_WIREFRAME, 'opacity', newValue);
            this.invalidateCacheForType(this.materialTypes.CAD_WIREFRAME);
        });

        // Tool gizmo materials (color is axis-determined, only lineWidth is configurable)
        this.registerConfigCallback('visual.gizmo.lineWidth', (newValue) => {
            this.updateMaterialsOfType(this.materialTypes.TOOL_GIZMO, 'linewidth', newValue);
        });

        // Configuration callbacks registered
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
            lineWidth: options.lineWidth || configManager?.get('visual.wireframe.lineWidth') || 2,
            opacity: options.opacity || configManager?.get('visual.selection.opacity') || 0.8,
            renderOrder: options.renderOrder || configManager?.get('visual.selection.renderOrder') || 999,
            transparent: true,
            depthTest: true,   // Hide back-face edges, only show camera-visible faces
            depthWrite: false, // Don't write to depth buffer
            clippingPlanes: [],
            ...options
        };

        // Generate cache key
        const key = this.generateMaterialKey(this.materialTypes.SELECTION_EDGE, config);

        // Check cache
        const cached = this.getMaterialFromCache(key);
        if (cached) return cached;

        // Create new material
        // Safe color parsing to handle various color input types
        let colorHex;
        if (typeof config.color === 'string') {
            colorHex = parseInt(config.color.replace('#', ''), 16);
        } else if (typeof config.color === 'number') {
            colorHex = config.color;
        } else {
            colorHex = 0xffffff; // Default to white
        }
        const material = new THREE.LineBasicMaterial({
            color: colorHex,
            transparent: config.transparent,
            opacity: config.opacity,
            linewidth: config.lineWidth,
            depthTest: true,
            depthWrite: false,
            clippingPlanes: [] // Disable clipping - always render wireframes
        });

        // LessEqualDepth prevents z-fighting: wireframe edges are coplanar with geometry,
        // so "equal" depth must pass. High renderOrder (9999) ensures wireframe renders after geometry.
        material.depthFunc = THREE.LessEqualDepth;
        material.lineWidth = config.lineWidth;
        material.renderOrder = config.renderOrder;

        return this.cacheMaterial(key, material, this.materialTypes.SELECTION_EDGE);
    }

    /**
     * Create or get cached hover edge material (subtle wireframe for hover state)
     * @param {Object} options - Material options
     * @returns {THREE.LineBasicMaterial} Hover edge material
     */
    createHoverEdgeMaterial(options = {}) {
        const configManager = this.getConfigManager();

        const config = {
            color: options.color || '#ffaa44',
            lineWidth: options.lineWidth || configManager?.get('visual.wireframe.lineWidth') || 2,
            opacity: options.opacity || 0.4,
            renderOrder: options.renderOrder || 9998,
            transparent: true,
            depthTest: true,
            depthWrite: false,
            clippingPlanes: [],
            ...options
        };

        const key = this.generateMaterialKey(this.materialTypes.HOVER_EFFECT, config);

        const cached = this.getMaterialFromCache(key);
        if (cached) return cached;

        let colorHex;
        if (typeof config.color === 'string') {
            colorHex = parseInt(config.color.replace('#', ''), 16);
        } else if (typeof config.color === 'number') {
            colorHex = config.color;
        } else {
            colorHex = 0xffaa44;
        }

        const material = new THREE.LineBasicMaterial({
            color: colorHex,
            transparent: config.transparent,
            opacity: config.opacity,
            linewidth: config.lineWidth,
            depthTest: true,
            depthWrite: false,
            clippingPlanes: []
        });

        material.depthFunc = THREE.LessEqualDepth;
        material.lineWidth = config.lineWidth;
        material.renderOrder = config.renderOrder;

        return this.cacheMaterial(key, material, this.materialTypes.HOVER_EFFECT);
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
            lineWidth: options.lineWidth || configManager?.get('visual.wireframe.lineWidth') || 2,
            opacity: options.opacity || configManager?.get('visual.containers.opacity') || 0.8,
            renderOrder: options.renderOrder || configManager?.get('visual.containers.renderOrder') || 998,
            transparent: true,
            depthTest: true,   // Hide back-face edges, only show camera-visible faces
            depthWrite: false, // Don't write to depth buffer
            clippingPlanes: [],
            ...options
        };

        // Generate cache key
        const key = this.generateMaterialKey(this.materialTypes.CONTAINER_WIREFRAME, config);

        // Check cache
        const cached = this.getMaterialFromCache(key);
        if (cached) return cached;

        // Create new material
        // Safe color parsing to handle various color input types
        let colorHex;
        if (typeof config.color === 'string') {
            colorHex = parseInt(config.color.replace('#', ''), 16);
        } else if (typeof config.color === 'number') {
            colorHex = config.color;
        } else {
            colorHex = 0xffffff; // Default to white
        }
        const material = new THREE.LineBasicMaterial({
            color: colorHex,
            transparent: config.transparent,
            opacity: config.opacity,
            linewidth: config.lineWidth,
            depthTest: true,
            depthWrite: false,
            clippingPlanes: [] // Disable clipping - always render wireframes
        });

        // LessEqualDepth prevents z-fighting with coplanar geometry
        material.depthFunc = THREE.LessEqualDepth;
        material.lineWidth = config.lineWidth;
        material.renderOrder = config.renderOrder;

        return this.cacheMaterial(key, material, this.materialTypes.CONTAINER_WIREFRAME);
    }

    /**
     * Create fat selection line material using LineMaterial (screen-space pixel-width lines)
     * Used for selection wireframes that need to be clearly visible on top of geometry
     * @param {Object} options - Material options
     * @returns {LineMaterial} Fat selection line material
     */
    createSelectionLineMaterial(options = {}) {
        const configManager = this.getConfigManager();

        const config = {
            color: options.color || configManager?.get('visual.selection.color') || '#ff6600',
            lineWidth: options.lineWidth || configManager?.get('visual.wireframe.lineWidth') || 2,
            opacity: options.opacity || configManager?.get('visual.selection.opacity') || 0.8,
            ...options
        };

        const key = this.generateMaterialKey(this.materialTypes.SELECTION_EDGE_FAT, config);
        const cached = this.getMaterialFromCache(key);
        if (cached) return cached;

        let colorHex;
        if (typeof config.color === 'string') {
            colorHex = parseInt(config.color.replace('#', ''), 16);
        } else if (typeof config.color === 'number') {
            colorHex = config.color;
        } else {
            colorHex = 0xff6600;
        }

        const material = new LineMaterial({
            color: colorHex,
            linewidth: config.lineWidth,
            transparent: true,
            opacity: config.opacity,
            depthTest: true,
            depthWrite: false,
            worldUnits: false // Screen pixels, not world units
        });

        // LessEqualDepth: wireframe edges are coplanar with geometry faces
        material.depthFunc = THREE.LessEqualDepth;

        // Push wireframe lines in front of coplanar geometry faces.
        // LineMaterial renders as triangles so polygonOffset applies.
        material.polygonOffset = true;
        material.polygonOffsetFactor = -1;
        material.polygonOffsetUnits = -4;

        // Set resolution from current canvas
        const renderer = window.modlerComponents?.sceneFoundation?.renderer;
        if (renderer) {
            const size = new THREE.Vector2();
            renderer.getSize(size);
            material.resolution.copy(size);
        }

        material.renderOrder = 9999;

        return this.cacheMaterial(key, material, this.materialTypes.SELECTION_EDGE_FAT);
    }

    /**
     * Create fat container selection line material using LineMaterial
     * @param {Object} options - Material options
     * @returns {LineMaterial} Fat container selection line material
     */
    createContainerSelectionLineMaterial(options = {}) {
        const configManager = this.getConfigManager();

        const config = {
            color: options.color || configManager?.get('visual.containers.wireframeColor') || '#00ff00',
            lineWidth: options.lineWidth || configManager?.get('visual.wireframe.lineWidth') || 2,
            opacity: options.opacity || configManager?.get('visual.containers.opacity') || 0.8,
            ...options
        };

        const key = this.generateMaterialKey(this.materialTypes.CONTAINER_WIREFRAME_FAT, config);
        const cached = this.getMaterialFromCache(key);
        if (cached) return cached;

        let colorHex;
        if (typeof config.color === 'string') {
            colorHex = parseInt(config.color.replace('#', ''), 16);
        } else if (typeof config.color === 'number') {
            colorHex = config.color;
        } else {
            colorHex = 0x00ff00;
        }

        const material = new LineMaterial({
            color: colorHex,
            linewidth: config.lineWidth,
            transparent: true,
            opacity: config.opacity,
            depthTest: true,
            depthWrite: false,
            worldUnits: false
        });

        // LessEqualDepth: wireframe edges are coplanar with geometry faces
        material.depthFunc = THREE.LessEqualDepth;

        // Push wireframe lines in front of coplanar geometry faces.
        // LineMaterial renders as triangles so polygonOffset applies.
        material.polygonOffset = true;
        material.polygonOffsetFactor = -1;
        material.polygonOffsetUnits = -4;

        const renderer = window.modlerComponents?.sceneFoundation?.renderer;
        if (renderer) {
            const size = new THREE.Vector2();
            renderer.getSize(size);
            material.resolution.copy(size);
        }

        material.renderOrder = 9999;

        return this.cacheMaterial(key, material, this.materialTypes.CONTAINER_WIREFRAME_FAT);
    }

    /**
     * Create LineMaterial for tool gizmos (arrows, circles, rotation arcs)
     * Uses screen-space pixel widths, renders on top, shared across all gizmo types
     */
    createToolGizmoLineMaterial(options = {}) {
        const configManager = this.getConfigManager();

        const config = {
            color: options.color || configManager?.get('visual.gizmo.color') || '#ff6600',
            lineWidth: options.lineWidth || configManager?.get('visual.gizmo.lineWidth') || 2,
            opacity: options.opacity ?? 0.9,
            ...options
        };

        const key = this.generateMaterialKey(this.materialTypes.TOOL_GIZMO, config);
        const cached = this.getMaterialFromCache(key);
        if (cached) return cached;

        let colorHex;
        if (typeof config.color === 'string') {
            colorHex = parseInt(config.color.replace('#', ''), 16);
        } else if (typeof config.color === 'number') {
            colorHex = config.color;
        } else {
            colorHex = 0xff6600;
        }

        const material = new LineMaterial({
            color: colorHex,
            linewidth: config.lineWidth,
            transparent: true,
            opacity: config.opacity,
            depthTest: false,
            depthWrite: false,
            worldUnits: false
        });

        const renderer = window.modlerComponents?.sceneFoundation?.renderer;
        if (renderer) {
            const size = new THREE.Vector2();
            renderer.getSize(size);
            material.resolution.copy(size);
        }

        material.renderOrder = 1000;

        return this.cacheMaterial(key, material, this.materialTypes.TOOL_GIZMO);
    }

    /**
     * Update resolution uniform on all LineMaterial instances (call on canvas resize)
     * @param {number} width - Canvas width in pixels
     * @param {number} height - Canvas height in pixels
     */
    updateLineMaterialResolution(width, height) {
        for (const material of this.activeMaterials) {
            if (material.isLineMaterial) {
                material.resolution.set(width, height);
            }
        }
    }

    /**
     * Create or get cached face highlight material
     * @param {Object} options - Material options
     * @returns {THREE.MeshBasicMaterial} Face highlight material
     */
    createFaceHighlightMaterial(options = {}) {
        const configManager = this.getConfigManager();

        // Build configuration
        const configOpacity = configManager?.get('visual.selection.faceHighlightOpacity');

        const config = {
            color: options.color || configManager?.get('visual.selection.color') || '#ff6600',
            opacity: options.opacity || configOpacity || 0.2,
            renderOrder: options.renderOrder || configManager?.get('visual.effects.materials.face.renderOrder') || 1000,
            side: THREE.DoubleSide,
            transparent: true,
            depthTest: true,
            depthWrite: false,
            clippingPlanes: [],
            ...options
        };

        // Generate cache key
        const key = this.generateMaterialKey(this.materialTypes.FACE_HIGHLIGHT, config);

        // Check cache
        const cached = this.getMaterialFromCache(key);
        if (cached) return cached;

        // Create new material
        let colorHex;
        if (typeof config.color === 'string') {
            colorHex = parseInt(config.color.replace('#', ''), 16);
        } else if (typeof config.color === 'number') {
            colorHex = config.color;
        } else {
            colorHex = 0xffffff;
        }
        const material = new THREE.MeshBasicMaterial({
            color: colorHex,
            transparent: config.transparent,
            opacity: config.opacity,
            side: config.side,
            depthTest: config.depthTest,
            depthWrite: config.depthWrite,
            clippingPlanes: []
        });

        // Prevent z-fighting: push highlight slightly in front of the geometry face
        material.polygonOffset = true;
        material.polygonOffsetFactor = -1;
        material.polygonOffsetUnits = -1;

        material.renderOrder = config.renderOrder;

        return this.cacheMaterial(key, material, this.materialTypes.FACE_HIGHLIGHT);
    }

    /**
     * Create or get cached container face highlight material
     * @param {Object} options - Material options
     * @returns {THREE.MeshBasicMaterial} Container face highlight material
     */
    createContainerFaceHighlightMaterial(options = {}) {
        const configManager = this.getConfigManager();

        const config = {
            color: options.color || configManager?.get('visual.selection.color') || '#ff6600',
            opacity: options.opacity || configManager?.get('visual.containers.faceHighlightOpacity') || 0.2,
            renderOrder: options.renderOrder || configManager?.get('visual.effects.materials.face.renderOrder') || 1000,
            side: THREE.DoubleSide,
            transparent: true,
            depthTest: true,
            depthWrite: false,
            clippingPlanes: [],
            ...options
        };

        // Generate cache key
        const key = this.generateMaterialKey(this.materialTypes.FACE_HIGHLIGHT_CONTAINER, config);

        // Check cache
        const cached = this.getMaterialFromCache(key);
        if (cached) return cached;

        // Create new material
        let colorHex;
        if (typeof config.color === 'string') {
            colorHex = parseInt(config.color.replace('#', ''), 16);
        } else if (typeof config.color === 'number') {
            colorHex = config.color;
        } else {
            colorHex = 0xffffff;
        }
        const material = new THREE.MeshBasicMaterial({
            color: colorHex,
            transparent: config.transparent,
            opacity: config.opacity,
            side: config.side,
            depthTest: config.depthTest,
            depthWrite: config.depthWrite,
            clippingPlanes: []
        });

        // Prevent z-fighting: push highlight slightly in front of the geometry face
        material.polygonOffset = true;
        material.polygonOffsetFactor = -1;
        material.polygonOffsetUnits = -1;

        material.renderOrder = config.renderOrder;

        return this.cacheMaterial(key, material, this.materialTypes.FACE_HIGHLIGHT_CONTAINER);
    }

    /**
     * Create disabled face highlight material (grey color for blocked tool operations)
     * This material is NOT updated when selection colors change - only opacity updates
     * @param {Object} options - Material options
     * @returns {THREE.MeshBasicMaterial} Disabled face highlight material
     */
    createDisabledFaceHighlightMaterial(options = {}) {
        const configManager = this.getConfigManager();

        // Build configuration - uses fixed grey color, only opacity tracks config
        const config = {
            color: options.color || this.colors.DISABLED_STATE, // Dark grey - fixed, not affected by selection color changes
            opacity: options.opacity || configManager?.get('visual.selection.faceHighlightOpacity') || 0.2,
            renderOrder: options.renderOrder || configManager?.get('visual.effects.materials.face.renderOrder') || 1000,
            side: THREE.DoubleSide,
            transparent: true,
            depthTest: true,
            depthWrite: false,
            clippingPlanes: [],
            ...options
        };

        // Generate cache key
        const key = this.generateMaterialKey(this.materialTypes.FACE_HIGHLIGHT_DISABLED, config);

        // Check cache
        const cached = this.getMaterialFromCache(key);
        if (cached) return cached;

        // Create new material
        const material = new THREE.MeshBasicMaterial({
            color: config.color,
            transparent: config.transparent,
            opacity: config.opacity,
            side: config.side,
            depthTest: config.depthTest,
            depthWrite: config.depthWrite,
            clippingPlanes: []
        });

        // Prevent z-fighting: push highlight slightly in front of the geometry face
        material.polygonOffset = true;
        material.polygonOffsetFactor = -1;
        material.polygonOffsetUnits = -1;

        material.renderOrder = config.renderOrder;

        // Cache with FACE_HIGHLIGHT_DISABLED type
        // This type is only updated for opacity changes, NOT color changes
        return this.cacheMaterial(key, material, this.materialTypes.FACE_HIGHLIGHT_DISABLED);
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
        // Safe color parsing to handle various color input types
        let colorHex;
        if (typeof config.color === 'string') {
            colorHex = parseInt(config.color.replace('#', ''), 16);
        } else if (typeof config.color === 'number') {
            colorHex = config.color;
        } else {
            colorHex = 0xffffff; // Default to white
        }
        const material = new THREE.LineBasicMaterial({
            color: colorHex,
            transparent: config.transparent,
            opacity: config.opacity,
            linewidth: config.lineWidth
        });

        return this.cacheMaterial(key, material, this.materialTypes.PREVIEW_WIREFRAME);
    }

    /**
     * Create CAD edge wireframe material (always visible, 50% opacity)
     * @param {Object} options - Material options
     * @returns {THREE.LineBasicMaterial} CAD wireframe material
     */
    createCadEdgeMaterial(options = {}) {
        const configManager = this.getConfigManager();

        // Build configuration for CAD wireframe
        const config = {
            color: options.color || configManager?.get('visual.cad.wireframe.color') || '#888888',
            lineWidth: options.lineWidth || configManager?.get('visual.wireframe.lineWidth') || 2,
            opacity: options.opacity !== undefined ? options.opacity : (configManager?.get('visual.cad.wireframe.opacity') !== undefined ? configManager.get('visual.cad.wireframe.opacity') : 0.8),
            transparent: true,
            depthTest: true,   // Enable depth test - hide back edges
            depthWrite: false, // Don't write to depth buffer
            clippingPlanes: [],
            ...options
        };

        // Generate cache key
        const key = this.generateMaterialKey(this.materialTypes.CAD_WIREFRAME, config);

        // Check cache
        const cached = this.getMaterialFromCache(key);
        if (cached) return cached;

        // Create new material
        let colorHex;
        if (typeof config.color === 'string') {
            colorHex = parseInt(config.color.replace('#', ''), 16);
        } else if (typeof config.color === 'number') {
            colorHex = config.color;
        } else {
            colorHex = 0x666666; // Default to gray
        }

        const material = new THREE.LineBasicMaterial({
            color: colorHex,
            transparent: config.transparent,
            opacity: config.opacity,
            linewidth: config.lineWidth,
            depthTest: true,
            depthWrite: false,
            clippingPlanes: [] // Disable clipping - always render wireframes
        });

        // LessEqualDepth: wireframe edges are coplanar with geometry faces
        material.depthFunc = THREE.LessEqualDepth;

        return this.cacheMaterial(key, material, this.materialTypes.CAD_WIREFRAME);
    }

    /**
     * Create yard object CAD edge wireframe material (purple, always visible)
     * @param {Object} options - Material options
     * @returns {THREE.LineBasicMaterial} Yard CAD wireframe material
     */
    createYardCadEdgeMaterial(options = {}) {
        const configManager = this.getConfigManager();

        const config = {
            color: options.color || configManager?.get('visual.yard.wireframe.color') || '#9b59b6',
            lineWidth: options.lineWidth || configManager?.get('visual.wireframe.lineWidth') || 2,
            opacity: options.opacity !== undefined ? options.opacity : 0.8,
            transparent: true,
            depthTest: true,
            depthWrite: false,
            ...options
        };

        const key = this.generateMaterialKey(this.materialTypes.YARD_CAD_WIREFRAME, config);

        const cached = this.getMaterialFromCache(key);
        if (cached) return cached;

        let colorHex;
        if (typeof config.color === 'string') {
            colorHex = parseInt(config.color.replace('#', ''), 16);
        } else if (typeof config.color === 'number') {
            colorHex = config.color;
        } else {
            colorHex = 0x9b59b6;
        }

        const material = new THREE.LineBasicMaterial({
            color: colorHex,
            transparent: config.transparent,
            opacity: config.opacity,
            linewidth: config.lineWidth,
            clippingPlanes: []
        });

        return this.cacheMaterial(key, material, this.materialTypes.YARD_CAD_WIREFRAME);
    }

    /**
     * Create padding visualization material
     * @param {Object} options - Material options
     * @returns {THREE.LineBasicMaterial} Padding visualization material
     */
    createPaddingVisualizationMaterial(options = {}) {
        // Build configuration
        const config = {
            color: options.color || '#ff9900',
            opacity: options.opacity !== undefined ? options.opacity : 0.3,
            transparent: true,
            depthTest: true,
            depthWrite: false,
            ...options
        };

        // Generate cache key
        const key = this.generateMaterialKey(this.materialTypes.PADDING_VISUALIZATION, config);

        // Check cache
        const cached = this.getMaterialFromCache(key);
        if (cached) return cached;

        // Create new material
        // Safe color parsing to handle various color input types
        let colorHex;
        if (typeof config.color === 'string') {
            colorHex = parseInt(config.color.replace('#', ''), 16);
        } else if (typeof config.color === 'number') {
            colorHex = config.color;
        } else {
            colorHex = 0xffffff; // Default to white
        }
        const material = new THREE.LineBasicMaterial({
            color: colorHex,
            transparent: config.transparent,
            opacity: config.opacity,
            depthTest: config.depthTest,
            depthWrite: config.depthWrite
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
        // Safe color parsing to handle various color input types
        let colorHex;
        if (typeof config.color === 'string') {
            colorHex = parseInt(config.color.replace('#', ''), 16);
        } else if (typeof config.color === 'number') {
            colorHex = config.color;
        } else {
            colorHex = 0xffffff; // Default to white
        }
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
            config.opacity !== undefined ? config.opacity : 'default', // Don't default to '1' - use actual value or 'default'
            config.lineWidth || '1',
            config.wireframe || 'false',
            config.transparent || 'false',
            config.side || 'front',
            config.depthTest || 'true',
            config.depthWrite || 'true',
            config.clippingPlanes && config.clippingPlanes.length === 0 ? 'noclip' : 'default' // Include clipping planes state
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

        // Add metadata for tracking and protection
        material.userData = material.userData || {};
        material.userData.materialManagerType = type;
        material.userData.cacheKey = key;
        material.userData.createdAt = Date.now();
        material.userData.isManaged = true; // Mark as MaterialManager-controlled
        material.userData.allowedModifiers = ['MaterialManager']; // Whitelist

        this.stats.created++;
        return material;
    }

    /**
     * Invalidate cached materials of a specific type
     * This ensures new objects get fresh materials with current config values
     * @param {string} type - Material type to invalidate
     */
    invalidateCacheForType(type) {
        const keysToRemove = [];

        for (const [key, material] of this.materialCache.entries()) {
            if (material.userData?.materialManagerType === type) {
                keysToRemove.push(key);
            }
        }

        keysToRemove.forEach(key => this.materialCache.delete(key));
    }

    /**
     * Update all materials of a specific type with new property value
     * @param {string} type - Material type to update
     * @param {string} property - Property to update
     * @param {*} value - New value
     */
    updateMaterialsOfType(type, property, value) {
        // Guard: skip null/undefined values to prevent corrupting material properties
        // Config callbacks may fire with null when a config key doesn't exist
        if (value == null) return;

        let updatedCount = 0;
        let needsGeometryUpdate = false;

        for (const material of this.activeMaterials) {
            if (material.userData?.materialManagerType === type) {
                try {
                    if (property === 'color' && typeof value === 'string') {
                        const colorHex = parseInt(value.replace('#', ''), 16);
                        material.color.setHex(colorHex);
                    } else if (property === 'linewidth') {
                        material.linewidth = value;
                        needsGeometryUpdate = true; // LineWidth changes require geometry rebuild
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

        // Note: ConfigurationManager handles visualization refresh via its subscribe callbacks
        // No need to trigger refresh here as it would create duplicate refreshes

        if (updatedCount > 0) {
            this.stats.configUpdates++;
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
            wireframe: normalizedOptions.wireframe,
            clippingPlanes: [] // Disable clipping - always render objects
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
            side: normalizedOptions.side,
            clippingPlanes: [] // Disable clipping - always render objects
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

        console.groupEnd();
    }

    /**
     * Track material for resource management
     * @param {THREE.Material} material - Material to track
     */
    trackMaterial(material) {
        // Add to tracking collection if not already tracked
        if (material && !material.userData.tracked) {
            material.userData.tracked = true;
            material.userData.createdAt = Date.now();
            // Could add to a tracking collection here if needed for advanced resource management
        }
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
    }

    /**
     * Clear material cache for specific material type
     * @param {string} materialType - Material type to clear from cache
     */
    clearMaterialCache(materialType) {
        if (!materialType) {
            console.warn('MaterialManager: No material type specified for cache clear');
            return;
        }

        let clearedCount = 0;

        // Clear materials from cache that match the type
        for (const [key, material] of this.materialCache) {
            if (key.includes(materialType)) {
                // Dispose of the material
                if (material && typeof material.dispose === 'function') {
                    material.dispose();
                }
                this.materialCache.delete(key);
                clearedCount++;
            }
        }

        // MaterialManager cleared cached materials (logging removed to reduce console noise)
    }
}

// Export for use in main application
window.MaterialManager = MaterialManager;
window.MaterialGuard = MaterialGuard;