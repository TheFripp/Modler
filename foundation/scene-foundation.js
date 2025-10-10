// Modler V2 - Foundation Layer
// Basic Three.js Setup - Direct implementation, no abstractions

class SceneFoundation {
    constructor(canvas) {
        this.canvas = canvas;
        
        // Core Three.js components
        this.scene = new THREE.Scene();
        
        // Get container dimensions with robust fallback
        const container = this.canvas?.parentElement;
        let width = container ? container.clientWidth : 0;
        let height = container ? container.clientHeight : 0;
        
        // If container has no dimensions, use reasonable defaults
        if (width <= 0) width = 800;
        if (height <= 0) height = 600;
        
        
        this.camera = new THREE.PerspectiveCamera(75, width / height, 0.01, 2000);
        
        // Force a fresh WebGL context
        this.renderer = new THREE.WebGLRenderer({ 
            canvas: this.canvas, 
            antialias: true,
            preserveDrawingBuffer: true,
            powerPreference: "high-performance"
        });
        
        // Initial setup
        this.setupRenderer();
        this.setupCamera();
        this.setupRenderLoop();
        this.setupResizeHandler();
        
        // Animation callback system
        this.animationCallbacks = [];
        
        // Start rendering
        this.isRunning = true;
        this.render();
    }
    
    setupRenderer() {
        // Simple approach - use container size
        const container = this.canvas?.parentElement;
        const width = container?.clientWidth || 800;
        const height = container?.clientHeight || 600;
        
        // Set renderer size - let it handle canvas sizing
        this.renderer.setSize(width, height);
        this.renderer.setClearColor(0x1a1a1a);
        // Shadows disabled for modeling app simplicity
    }
    
    
    
    setupCamera() {
        this.camera.position.set(5, 5, 5);
        this.camera.lookAt(0, 0, 0);
    }
    
    setupRenderLoop() {
        this.renderLoop = this.render.bind(this);
    }
    
    setupResizeHandler() {
        this.resizeHandler = () => {
            const container = this.canvas?.parentElement;
            const width = container?.clientWidth || 800;
            const height = container?.clientHeight || 600;
            
            this.camera.aspect = width / height;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(width, height);
            
        };
        
        window.addEventListener('resize', this.resizeHandler);
    }
    
    render() {
        if (!this.isRunning) return;

        // Update grid opacity based on camera position
        this.updateGridOpacity();

        // Call animation callbacks for managed objects
        if (this.animationCallbacks && this.animationCallbacks.length > 0) {
            this.animationCallbacks.forEach(callback => callback());
        }

        this.renderer.render(this.scene, this.camera);
        requestAnimationFrame(this.renderLoop);
    }

    /**
     * Update grid opacity based on camera position
     * When camera is below floor (y < -1), set grid to 20% opacity
     */
    updateGridOpacity() {
        if (!this.camera) return;

        const targetOpacity = this.camera.position.y < -1 ? 0.2 : 1.0;

        // Find floor grid object
        this.scene.traverse((object) => {
            if (object.userData && object.userData.type === 'grid') {
                // Update all children (grid lines)
                object.traverse((child) => {
                    if (child.material && child.material.opacity !== undefined) {
                        // Smoothly transition opacity
                        if (Math.abs(child.material.opacity - targetOpacity) > 0.01) {
                            const lerp = (a, b, t) => a + (b - a) * t;
                            child.material.opacity = lerp(
                                child.material.opacity,
                                targetOpacity,
                                0.1
                            );
                            child.material.needsUpdate = true;
                        }
                    }
                });
            }
        });
    }

    // Add animation callback
    addAnimationCallback(callback) {
        if (typeof callback === 'function') {
            this.animationCallbacks.push(callback);
        }
    }
    
    // Remove animation callback
    removeAnimationCallback(callback) {
        const index = this.animationCallbacks.indexOf(callback);
        if (index > -1) {
            this.animationCallbacks.splice(index, 1);
        }
    }
    
    // Clear all animation callbacks
    clearAnimationCallbacks() {
        this.animationCallbacks = [];
    }

    /**
     * Update scene background color
     */
    updateBackgroundColor(color) {
        this.renderer.setClearColor(color);
    }

    /**
     * Update grid colors - delegates to SceneController
     */
    updateGridMainColor(color) {
        const sceneController = window.modlerComponents?.sceneController;
        if (sceneController && sceneController.updateGridMainColor) {
            sceneController.updateGridMainColor(color);
        }
    }

    updateGridSubColor(color) {
        const sceneController = window.modlerComponents?.sceneController;
        if (sceneController && sceneController.updateGridSubColor) {
            sceneController.updateGridSubColor(color);
        }
    }

    destroy() {
        this.isRunning = false;
        window.removeEventListener('resize', this.resizeHandler);
        
        // Clear animation callbacks
        this.clearAnimationCallbacks();
        
        // Clean up Three.js objects
        this.scene.traverse((object) => {
            if (object.geometry) {
                object.geometry.dispose();
            }
            if (object.material) {
                if (Array.isArray(object.material)) {
                    object.material.forEach(material => material.dispose());
                } else {
                    object.material.dispose();
                }
            }
        });
        
        this.renderer.dispose();
    }
}

// Export for use in main application
window.SceneFoundation = SceneFoundation;

// Global scene update functions for ConfigurationManager
window.updateSceneBackground = (color) => {
    const sceneFoundation = window.modlerComponents?.sceneFoundation;
    if (sceneFoundation) {
        sceneFoundation.updateBackgroundColor(color);
    }
};

window.updateGridMainColor = (color) => {
    const sceneFoundation = window.modlerComponents?.sceneFoundation;
    if (sceneFoundation) {
        sceneFoundation.updateGridMainColor(color);
    }
};

window.updateGridSubColor = (color) => {
    const sceneFoundation = window.modlerComponents?.sceneFoundation;
    if (sceneFoundation) {
        sceneFoundation.updateGridSubColor(color);
    }
};

window.updateAccentColor = (color) => {
    // Update CSS custom property for accent color
    document.documentElement.style.setProperty('--accent-color', color);
};

window.updateToolbarOpacity = (opacity) => {
    // Update CSS custom property for toolbar opacity
    const opacityDecimal = typeof opacity === 'number' && opacity <= 1 ? opacity : opacity / 100;
    document.documentElement.style.setProperty('--toolbar-opacity', opacityDecimal);
};