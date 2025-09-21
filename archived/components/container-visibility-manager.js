// Modler V2 - Container Visibility Manager
// Scene-root approach for child visibility - avoids fighting Three.js rendering
// When container is deselected, temporarily moves children to scene root

class ContainerVisibilityManager {
    constructor() {
        // Track which children have been moved to scene root temporarily
        this.temporarySceneChildren = new Map(); // containerId -> [{objectId, originalLocalPosition}]
        this.containerStates = new Map(); // containerId -> {wireframeVisible}
        
        // Debounce rapid show/hide cycles
        this.pendingOperations = new Map(); // containerId -> {operation, timestamp}
        this.debounceDelay = 100; // 100ms debounce
        
    }
    
    /**
     * Register a container
     * @param {number} containerId - Container ID
     */
    registerContainer(containerId) {
        this.containerStates.set(containerId, {
            wireframeVisible: false
        });
        this.temporarySceneChildren.set(containerId, []);
    }
    
    /**
     * Register child object - no special tracking needed with scene-root approach
     * @param {number} objectId - Child object ID  
     * @param {boolean} isVisible - Ignored - using scene hierarchy instead
     */
    registerChildObject(objectId, isVisible = true) {
        // No-op with scene-root approach - visibility handled by hierarchy
    }
    
    /**
     * Show container wireframe (simplified - no child reparenting)
     * @param {number} containerId - Container ID
     * @param {Object} containerMesh - Container mesh object
     */
    showContainer(containerId, containerMesh) {
        const state = this.containerStates.get(containerId);
        if (!state) return;

        // Debounce rapid show/hide cycles
        const now = Date.now();
        const pending = this.pendingOperations.get(containerId);
        if (pending && (now - pending.timestamp) < this.debounceDelay) {
            if (pending.operation === 'show') {
                return false;
            }
        }
        this.pendingOperations.set(containerId, {operation: 'show', timestamp: now});

        // Show container wireframe
        containerMesh.visible = true;
        delete containerMesh.raycast; // Enable raycasting
        state.wireframeVisible = true;

        // Re-enable raycasting on interactive mesh children
        containerMesh.traverse((child) => {
            if (child.userData && child.userData.isContainerInteractive) {
                delete child.raycast; // Re-enable interactive mesh raycasting when container shown
            }
        });

        return true;
    }
    
    /**
     * Hide container wireframe (simplified - no child reparenting)
     * @param {number} containerId - Container ID
     * @param {Object} containerMesh - Container mesh object
     */
    hideContainer(containerId, containerMesh) {
        const state = this.containerStates.get(containerId);
        if (!state) return;

        // Debounce rapid show/hide cycles
        const now = Date.now();
        const pending = this.pendingOperations.get(containerId);
        if (pending && (now - pending.timestamp) < this.debounceDelay) {
            if (pending.operation === 'hide') {
                return false;
            }
        }
        this.pendingOperations.set(containerId, {operation: 'hide', timestamp: now});

        // Hide container wireframe
        containerMesh.visible = false;
        containerMesh.raycast = () => {}; // Disable raycasting
        state.wireframeVisible = false;

        // Disable raycasting on interactive mesh children
        containerMesh.traverse((child) => {
            if (child.userData && child.userData.isContainerInteractive) {
                child.raycast = () => {}; // Disable interactive mesh raycasting when container hidden
            }
        });

        return true;
    }
    
    /**
     * DEPRECATED: Child reparenting methods removed
     * Children now remain as container children at all times for simplified architecture
     */
    
    /**
     * Remove container (simplified - no child restoration needed)
     * @param {number} containerId - Container ID
     */
    removeContainer(containerId) {
        // Clean up tracking
        this.containerStates.delete(containerId);
        this.temporarySceneChildren.delete(containerId);

    }
    
    /**
     * Debug method to log current states
     */
    debugStates() {
    }
}

// Export for use in main application
window.ContainerVisibilityManager = ContainerVisibilityManager;