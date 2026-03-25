import * as THREE from 'three';
import { LineMaterial } from 'three/lines/LineMaterial';

/**
 * MaterialDefinitions - Specialized material factory methods
 *
 * Extracted from MaterialManager to separate material recipes (config → material)
 * from cache management and utility infrastructure. All factory methods are
 * stateless: they read config, build a material, and return it via the cache.
 *
 * Proxy methods mirror MaterialManager's cache API so factory code stays unchanged.
 */

class MaterialDefinitions {
    constructor(mm) {
        this.mm = mm;
    }

    // ===== PROXIES FOR MATERIALMANAGER INFRASTRUCTURE =====
    getConfigManager() { return this.mm.getConfigManager(); }
    generateMaterialKey(type, config) { return this.mm.generateMaterialKey(type, config); }
    getMaterialFromCache(key) { return this.mm.getMaterialFromCache(key); }
    cacheMaterial(key, material, type) { return this.mm.cacheMaterial(key, material, type); }
    get materialTypes() { return this.mm.materialTypes; }
    get colors() { return this.mm.colors; }
    get activeMaterials() { return this.mm.activeMaterials; }
    isContainer(object) { return this.mm.isContainer(object); }

    // ===== INTERACTION MATERIAL FACTORY METHODS =====

    createSelectionEdgeMaterial(options = {}) {
        const configManager = this.getConfigManager();

        const config = {
            color: options.color || configManager?.get('visual.selection.color') || '#ff6600',
            lineWidth: options.lineWidth || configManager?.get('visual.wireframe.lineWidth') || 2,
            opacity: options.opacity || configManager?.get('visual.selection.opacity') || 0.8,
            renderOrder: options.renderOrder || configManager?.get('visual.selection.renderOrder') || 999,
            transparent: true,
            depthTest: true,
            depthWrite: false,
            clippingPlanes: [],
            ...options
        };

        const key = this.generateMaterialKey(this.materialTypes.SELECTION_EDGE, config);
        const cached = this.getMaterialFromCache(key);
        if (cached) return cached;

        let colorHex;
        if (typeof config.color === 'string') {
            colorHex = parseInt(config.color.replace('#', ''), 16);
        } else if (typeof config.color === 'number') {
            colorHex = config.color;
        } else {
            colorHex = 0xffffff;
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

        return this.cacheMaterial(key, material, this.materialTypes.SELECTION_EDGE);
    }

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

    createContainerWireframeMaterial(options = {}) {
        const configManager = this.getConfigManager();

        const config = {
            color: options.color || configManager?.get('visual.containers.wireframeColor') || '#00ff00',
            lineWidth: options.lineWidth || configManager?.get('visual.wireframe.lineWidth') || 2,
            opacity: options.opacity || configManager?.get('visual.containers.opacity') || 0.8,
            renderOrder: options.renderOrder || configManager?.get('visual.containers.renderOrder') || 998,
            transparent: true,
            depthTest: true,
            depthWrite: false,
            clippingPlanes: [],
            ...options
        };

        const key = this.generateMaterialKey(this.materialTypes.CONTAINER_WIREFRAME, config);
        const cached = this.getMaterialFromCache(key);
        if (cached) return cached;

        let colorHex;
        if (typeof config.color === 'string') {
            colorHex = parseInt(config.color.replace('#', ''), 16);
        } else if (typeof config.color === 'number') {
            colorHex = config.color;
        } else {
            colorHex = 0xffffff;
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

        return this.cacheMaterial(key, material, this.materialTypes.CONTAINER_WIREFRAME);
    }

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
            worldUnits: false
        });

        material.depthFunc = THREE.LessEqualDepth;

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

        return this.cacheMaterial(key, material, this.materialTypes.SELECTION_EDGE_FAT);
    }

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

        material.depthFunc = THREE.LessEqualDepth;

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

    updateLineMaterialResolution(width, height) {
        for (const material of this.activeMaterials) {
            if (material.isLineMaterial) {
                material.resolution.set(width, height);
            }
        }
    }

    createFaceHighlightMaterial(options = {}) {
        const configManager = this.getConfigManager();

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

        const key = this.generateMaterialKey(this.materialTypes.FACE_HIGHLIGHT, config);
        const cached = this.getMaterialFromCache(key);
        if (cached) return cached;

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

        material.polygonOffset = true;
        material.polygonOffsetFactor = -1;
        material.polygonOffsetUnits = -1;

        material.renderOrder = config.renderOrder;

        return this.cacheMaterial(key, material, this.materialTypes.FACE_HIGHLIGHT);
    }

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

        const key = this.generateMaterialKey(this.materialTypes.FACE_HIGHLIGHT_CONTAINER, config);
        const cached = this.getMaterialFromCache(key);
        if (cached) return cached;

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

        material.polygonOffset = true;
        material.polygonOffsetFactor = -1;
        material.polygonOffsetUnits = -1;

        material.renderOrder = config.renderOrder;

        return this.cacheMaterial(key, material, this.materialTypes.FACE_HIGHLIGHT_CONTAINER);
    }

    createDisabledFaceHighlightMaterial(options = {}) {
        const configManager = this.getConfigManager();

        const config = {
            color: options.color || this.colors.DISABLED_STATE,
            opacity: options.opacity || configManager?.get('visual.selection.faceHighlightOpacity') || 0.2,
            renderOrder: options.renderOrder || configManager?.get('visual.effects.materials.face.renderOrder') || 1000,
            side: THREE.DoubleSide,
            transparent: true,
            depthTest: true,
            depthWrite: false,
            clippingPlanes: [],
            ...options
        };

        const key = this.generateMaterialKey(this.materialTypes.FACE_HIGHLIGHT_DISABLED, config);
        const cached = this.getMaterialFromCache(key);
        if (cached) return cached;

        const material = new THREE.MeshBasicMaterial({
            color: config.color,
            transparent: config.transparent,
            opacity: config.opacity,
            side: config.side,
            depthTest: config.depthTest,
            depthWrite: config.depthWrite,
            clippingPlanes: []
        });

        material.polygonOffset = true;
        material.polygonOffsetFactor = -1;
        material.polygonOffsetUnits = -1;

        material.renderOrder = config.renderOrder;

        return this.cacheMaterial(key, material, this.materialTypes.FACE_HIGHLIGHT_DISABLED);
    }

    createContextualHighlightMaterial(targetObject, options = {}) {
        const configManager = this.getConfigManager();

        let highlightColor;
        if (this.isContainer(targetObject)) {
            highlightColor = configManager?.get('visual.containers.wireframeColor') || '#00ff00';
        } else {
            highlightColor = configManager?.get('visual.selection.color') || '#ff6600';
        }

        return this.createFaceHighlightMaterial({
            color: highlightColor,
            ...options
        });
    }

    createPreviewWireframeMaterial(options = {}) {
        const configManager = this.getConfigManager();

        const config = {
            color: options.color || configManager?.get('visual.boxCreation.color') || '#00ff00',
            lineWidth: options.lineWidth || configManager?.get('visual.effects.wireframe.lineWidth') || 1,
            opacity: options.opacity !== undefined ? options.opacity : 0.8,
            transparent: true,
            ...options
        };

        const key = this.generateMaterialKey(this.materialTypes.PREVIEW_WIREFRAME, config);
        const cached = this.getMaterialFromCache(key);
        if (cached) return cached;

        let colorHex;
        if (typeof config.color === 'string') {
            colorHex = parseInt(config.color.replace('#', ''), 16);
        } else if (typeof config.color === 'number') {
            colorHex = config.color;
        } else {
            colorHex = 0xffffff;
        }
        const material = new THREE.LineBasicMaterial({
            color: colorHex,
            transparent: config.transparent,
            opacity: config.opacity,
            linewidth: config.lineWidth
        });

        return this.cacheMaterial(key, material, this.materialTypes.PREVIEW_WIREFRAME);
    }

    // ===== CAD / VISUALIZATION MATERIAL FACTORY METHODS =====

    createCadEdgeMaterial(options = {}) {
        const configManager = this.getConfigManager();

        const config = {
            color: options.color || configManager?.get('visual.cad.wireframe.color') || '#888888',
            lineWidth: options.lineWidth || configManager?.get('visual.wireframe.lineWidth') || 2,
            opacity: options.opacity !== undefined ? options.opacity : (configManager?.get('visual.cad.wireframe.opacity') !== undefined ? configManager.get('visual.cad.wireframe.opacity') : 0.8),
            transparent: true,
            depthTest: true,
            depthWrite: false,
            clippingPlanes: [],
            ...options
        };

        const key = this.generateMaterialKey(this.materialTypes.CAD_WIREFRAME, config);
        const cached = this.getMaterialFromCache(key);
        if (cached) return cached;

        let colorHex;
        if (typeof config.color === 'string') {
            colorHex = parseInt(config.color.replace('#', ''), 16);
        } else if (typeof config.color === 'number') {
            colorHex = config.color;
        } else {
            colorHex = 0x666666;
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

        return this.cacheMaterial(key, material, this.materialTypes.CAD_WIREFRAME);
    }

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

    createPaddingVisualizationMaterial(options = {}) {
        const config = {
            color: options.color || '#ff9900',
            opacity: options.opacity !== undefined ? options.opacity : 0.3,
            transparent: true,
            depthTest: true,
            depthWrite: false,
            ...options
        };

        const key = this.generateMaterialKey(this.materialTypes.PADDING_VISUALIZATION, config);
        const cached = this.getMaterialFromCache(key);
        if (cached) return cached;

        let colorHex;
        if (typeof config.color === 'string') {
            colorHex = parseInt(config.color.replace('#', ''), 16);
        } else if (typeof config.color === 'number') {
            colorHex = config.color;
        } else {
            colorHex = 0xffffff;
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

    createLayoutGuideMaterial(options = {}) {
        const config = {
            color: options.color || '#ffff00',
            opacity: options.opacity !== undefined ? options.opacity : 0.5,
            lineWidth: options.lineWidth || 1,
            transparent: true,
            ...options
        };

        const key = this.generateMaterialKey(this.materialTypes.LAYOUT_GUIDE, config);
        const cached = this.getMaterialFromCache(key);
        if (cached) return cached;

        let colorHex;
        if (typeof config.color === 'string') {
            colorHex = parseInt(config.color.replace('#', ''), 16);
        } else if (typeof config.color === 'number') {
            colorHex = config.color;
        } else {
            colorHex = 0xffffff;
        }
        const material = new THREE.LineBasicMaterial({
            color: colorHex,
            transparent: config.transparent,
            opacity: config.opacity,
            linewidth: config.lineWidth
        });

        return this.cacheMaterial(key, material, this.materialTypes.LAYOUT_GUIDE);
    }
}

window.MaterialDefinitions = MaterialDefinitions;
