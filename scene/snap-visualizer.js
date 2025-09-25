/**
 * Snap Visualizer
 * Visual feedback system for snap indicators
 * Target: ~150 lines - snap indicator rendering, screen overlays, performance optimized
 */

class SnapVisualizer {
    constructor(scene, camera, canvas) {
        this.scene = scene;
        this.camera = camera;
        this.canvas = canvas;

        // New unified systems
        this.geometryFactory = new GeometryFactory();
        this.materialManager = new MaterialManager();
        this.resourcePool = new VisualizationResourcePool();

        // Visual indicator state
        this.currentIndicator = null;
        this.indicatorMesh = null;

        // Snap state - controlled by SnapController
        this.isSnapEnabled = true;

        // Create materials and geometry with configuration values
        this.createMaterials();

        // Register for configuration updates
        this.registerConfigurationCallbacks();

    }

    /**
     * SnapController interface - enables centralized control
     */
    setEnabled(enabled) {
        this.isSnapEnabled = enabled;

        // Immediately clear indicators when disabled
        if (!enabled) {
            this.clearIndicator();
        }

    }
    
    /**
     * Create materials and geometries using centralized systems
     */
    createMaterials() {
        const configManager = window.modlerComponents?.configurationManager;
        const snapConfig = configManager ?
            configManager.get('visual.snapping') :
            { indicatorColor: '#ffffff', cornerSize: 0.1, faceSize: 0.05, borderWidth: 2, opacity: 1.0, renderOrder: 1001 };

        // Create materials using MaterialManager
        this.materials = {
            edge: this.materialManager.createPreviewWireframeMaterial({
                color: snapConfig.indicatorColor,
                linewidth: snapConfig.borderWidth + 1,
                opacity: snapConfig.opacity * 0.9,
                depthTest: false,
                depthWrite: false
            })
        };

        // Create geometries using GeometryFactory (TODO: Add ring geometry support)
        this.geometries = {
            corner: new THREE.RingGeometry(snapConfig.cornerSize * 0.5, snapConfig.cornerSize, 16),
            face: new THREE.RingGeometry(snapConfig.faceSize * 0.5, snapConfig.faceSize, 16)
        };

        // Snap indicator material using MaterialManager
        this.snapMaterial = this.materialManager.createPreviewWireframeMaterial({
            color: snapConfig.indicatorColor,
            opacity: snapConfig.opacity,
            depthTest: false,
            depthWrite: false,
            renderOrder: snapConfig.renderOrder || 1001
        });
    }
    
    /**
     * Register for configuration change callbacks
     */
    registerConfigurationCallbacks() {
        const configManager = window.modlerComponents?.configurationManager;
        if (!configManager) return;
        
        // Subscribe to snapping configuration changes
        configManager.subscribe('visual.snapping.indicatorColor', (newValue) => {
            this.updateMaterialColor(newValue);
        });
        
        configManager.subscribe('visual.snapping.cornerSize', (newValue) => {
            this.updateIndicatorSizes();
        });
        
        configManager.subscribe('visual.snapping.faceSize', (newValue) => {
            this.updateIndicatorSizes();
        });
        
        configManager.subscribe('visual.snapping.borderWidth', (newValue) => {
            this.updateBorderWidth(newValue);
        });
        
        configManager.subscribe('visual.snapping.opacity', (newValue) => {
            this.updateOpacity(newValue);
        });
    }
    
    /**
     * Update material colors
     */
    updateMaterialColor(colorValue) {
        const colorHex = parseInt(colorValue.replace('#', ''), 16);
        
        if (this.snapMaterial) {
            this.snapMaterial.color.setHex(colorHex);
            this.snapMaterial.needsUpdate = true;
        }
        
        if (this.materials.edge) {
            this.materials.edge.color.setHex(colorHex);
            this.materials.edge.needsUpdate = true;
        }
        
    }
    
    /**
     * Update indicator sizes - requires recreating geometries
     */
    updateIndicatorSizes() {
        const configManager = window.modlerComponents?.configurationManager;
        if (!configManager) return;
        
        const cornerSize = configManager.get('visual.snapping.cornerSize', 0.1);
        const faceSize = configManager.get('visual.snapping.faceSize', 0.05);
        
        // Return old geometries to pool instead of disposing
        if (this.geometries.corner) this.geometryFactory.returnGeometry(this.geometries.corner, 'ring');
        if (this.geometries.face) this.geometryFactory.returnGeometry(this.geometries.face, 'ring');

        // Create new geometries with updated sizes using GeometryFactory
        this.geometries.corner = this.geometryFactory.createRingGeometry(cornerSize * 0.5, cornerSize, 16);
        this.geometries.face = this.geometryFactory.createRingGeometry(faceSize * 0.5, faceSize, 16);
        
    }
    
    /**
     * Update border width for edge indicators
     */
    updateBorderWidth(newWidth) {
        if (this.materials.edge) {
            this.materials.edge.linewidth = newWidth + 1;
            this.materials.edge.needsUpdate = true;
        }
        
    }
    
    /**
     * Update opacity for all materials
     */
    updateOpacity(newOpacity) {
        if (this.snapMaterial) {
            this.snapMaterial.opacity = newOpacity;
            this.snapMaterial.needsUpdate = true;
        }
        
        if (this.materials.edge) {
            this.materials.edge.opacity = newOpacity * 0.9;
            this.materials.edge.needsUpdate = true;
        }
        
    }
    
    /**
     * Update snap indicator based on current snap point
     */
    updateSnapIndicator(snapPoint) {

        // Early return if snapping is disabled
        if (!this.isSnapEnabled) {
            this.clearIndicator();
            return;
        }

        // Clear existing indicator
        this.clearIndicator();

        if (!snapPoint) {
            return;
        }


        // Create appropriate indicator based on snap type
        switch (snapPoint.type) {
            case 'corner':
                this.showCornerIndicator(snapPoint);
                break;
            case 'edge':
                this.showEdgeIndicator(snapPoint);
                break;
            case 'face':
                // No visual indicator for face snapping - object movement provides feedback
                break;
            default:
                console.warn('Unknown snap type:', snapPoint.type);
        }
    }
    
    /**
     * Show corner snap indicator (fixed 8px circle)
     */
    showCornerIndicator(snapPoint) {

        // Create circle geometry with fixed screen size (8px radius)
        const radius = this.calculateFixedScreenRadius(snapPoint.worldPos, 8);

        const cornerGeometry = this.geometryFactory.createRingGeometry(radius * 0.7, radius, 32);
        const indicatorMesh = new THREE.Mesh(cornerGeometry, this.snapMaterial);

        // Position at world snap point
        indicatorMesh.position.copy(snapPoint.worldPos);

        // Make billboard to always face camera
        this.makeBillboard(indicatorMesh);

        // Add to scene
        this.scene.add(indicatorMesh);
        this.indicatorMesh = indicatorMesh;
        this.currentIndicator = snapPoint;


        // Store geometry reference for cleanup
        this.indicatorMesh.userData.dynamicGeometry = cornerGeometry;
    }
    
    /**
     * Show edge snap indicator (double thickness line along edge)
     */
    showEdgeIndicator(snapPoint) {
        if (!snapPoint.edgeStart || !snapPoint.edgeEnd) {
            this.showCornerIndicator(snapPoint);
            return;
        }

        // Get configured color and create double-thickness material
        const configManager = window.modlerComponents?.configurationManager;
        const snapConfig = configManager?.get('visual.snapping') || { indicatorColor: '#ffffff' };
        const colorHex = parseInt(snapConfig.indicatorColor.replace('#', ''), 16);

        // Create line geometry for the full edge
        const points = [snapPoint.edgeStart, snapPoint.edgeEnd];
        const lineGeometry = this.geometryFactory.createLineGeometryFromPoints(points);

        // Create material using MaterialManager
        const edgeMaterial = this.materialManager.createPreviewWireframeMaterial({
            color: snapConfig.indicatorColor,
            linewidth: 4,
            opacity: 0.9,
            depthTest: false,
            depthWrite: false
        });
        edgeMaterial.renderOrder = 1001;

        const edgeLine = new THREE.Line(lineGeometry, edgeMaterial);

        // Add to scene
        this.scene.add(edgeLine);
        this.indicatorMesh = edgeLine;
        this.currentIndicator = snapPoint;
    }
    
    /**
     * Calculate fixed screen radius for consistent indicator size
     */
    calculateFixedScreenRadius(worldPos, pixelSize) {
        // Calculate distance from camera to point
        const distance = this.camera.position.distanceTo(worldPos);

        // Convert pixel size to world units at this distance
        // This is a simplified calculation - for pixel-perfect sizing use proper projection math
        const canvas = this.canvas;
        const fov = this.camera.fov * (Math.PI / 180); // Convert to radians
        const heightAtDistance = 2 * Math.tan(fov / 2) * distance;
        const worldUnitsPerPixel = heightAtDistance / canvas.height;

        return pixelSize * worldUnitsPerPixel;
    }
    
    /**
     * Make mesh always face camera (billboard effect)
     */
    makeBillboard(mesh) {
        // Store reference to camera for update loop
        mesh.userData.billboard = true;
        mesh.userData.camera = this.camera;
        
        // Initial orientation
        mesh.lookAt(this.camera.position);
    }
    
    /**
     * Update billboard orientation (called from animation loop)
     */
    updateIndicators() {
        if (this.indicatorMesh && this.indicatorMesh.userData.billboard) {
            // Update billboard orientation
            this.indicatorMesh.lookAt(this.camera.position);
        }
    }
    
    /**
     * Clear current snap indicator
     */
    clearIndicator() {
        if (this.indicatorMesh) {
            // Remove from scene
            this.scene.remove(this.indicatorMesh);

            // Clean up dynamically created geometry
            if (this.indicatorMesh.userData.dynamicGeometry) {
                this.geometryFactory.returnGeometry(this.indicatorMesh.userData.dynamicGeometry, 'ring');
            } else if (this.indicatorMesh.geometry) {
                this.geometryFactory.returnGeometry(this.indicatorMesh.geometry, 'ring');
            }

            // Return material to pool if it's not shared
            if (this.indicatorMesh.material && this.indicatorMesh.material !== this.snapMaterial) {
                this.materialManager.returnMaterial(this.indicatorMesh.material);
            }

            this.indicatorMesh = null;
        }

        this.currentIndicator = null;
    }
    
    /**
     * Get current indicator info (for debugging)
     */
    getCurrentIndicator() {
        return this.currentIndicator;
    }
    
    /**
     * Check if indicator is currently showing
     */
    hasActiveIndicator() {
        return this.indicatorMesh !== null;
    }
    
    
    /**
     * Cleanup
     */
    destroy() {
        this.clearIndicator();
        
        // Return shared materials to pool
        if (this.snapMaterial) {
            this.materialManager.returnMaterial(this.snapMaterial);
        }

        if (this.materials.edge) {
            this.materialManager.returnMaterial(this.materials.edge);
        }

        // Return geometries to pool
        if (this.geometries?.corner) {
            this.geometryFactory.returnGeometry(this.geometries.corner, 'ring');
        }

        if (this.geometries?.face) {
            this.geometryFactory.returnGeometry(this.geometries.face, 'ring');
        }
        
    }
}

// Export for use in main application
window.SnapVisualizer = SnapVisualizer;