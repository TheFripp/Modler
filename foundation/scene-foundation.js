// Modler V2 - Foundation Layer
// Basic Three.js Setup - Direct implementation, no abstractions

class SceneFoundation {
    constructor(canvas) {
        this.canvas = canvas;
        
        // Core Three.js components
        this.scene = new THREE.Scene();
        
        // Get container dimensions with robust fallback
        const container = this.canvas.parentElement;
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
        const container = this.canvas.parentElement;
        const width = container.clientWidth || 800;
        const height = container.clientHeight || 600;
        
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
            const container = this.canvas.parentElement;
            const width = container.clientWidth || 800;
            const height = container.clientHeight || 600;
            
            this.camera.aspect = width / height;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(width, height);
            
        };
        
        window.addEventListener('resize', this.resizeHandler);
    }
    
    render() {
        if (!this.isRunning) return;
        
        
        // Call animation callbacks for managed objects
        if (this.animationCallbacks && this.animationCallbacks.length > 0) {
            this.animationCallbacks.forEach(callback => callback());
        }
        
        this.renderer.render(this.scene, this.camera);
        requestAnimationFrame(this.renderLoop);
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