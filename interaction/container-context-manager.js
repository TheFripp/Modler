// Modler V2 - Container Context Management
// Handles container step-in/out logic and context highlighting
// Target: ~150 lines - extracted from SelectionController

class ContainerContextManager {
    constructor() {
        // Container context state
        this.containerContext = null; // Current container we're "stepped into"
        this.containerEdgeHighlight = null; // Faded container selection frame

    }

    /**
     * Step into a container - sets container context and shows faded selection frame
     */
    stepIntoContainer(containerObject) {
        // Clear any previous container context
        this.stepOutOfContainer();

        this.containerContext = containerObject;

        // Create faded edge highlight for the container
        this.createContainerEdgeHighlight(containerObject);

    }

    /**
     * Step out of current container context
     */
    stepOutOfContainer() {
        // Commit any pending object position changes before stepping out
        this.commitObjectPositions();

        if (this.containerEdgeHighlight) {
            if (this.containerEdgeHighlight.parent) {
                this.containerEdgeHighlight.parent.remove(this.containerEdgeHighlight);
            }
            if (this.containerEdgeHighlight.geometry) {
                this.containerEdgeHighlight.geometry.dispose();
            }
            this.containerEdgeHighlight = null;
        }

        this.containerContext = null;
    }

    /**
     * Check if we're currently inside a container context
     */
    isInContainerContext() {
        return this.containerContext !== null;
    }

    /**
     * Get the current container context
     */
    getContainerContext() {
        return this.containerContext;
    }

    /**
     * Create faded edge highlight for container context
     */
    createContainerEdgeHighlight(object) {
        if (!object || !object.geometry) return;

        try {
            // Use centralized wireframe creation to prevent triangulation artifacts
            const visualEffects = window.modlerComponents?.visualEffects;
            let edgeMesh;

            if (visualEffects) {
                // Extract dimensions from container geometry for centralized wireframe creation
                const box = new THREE.Box3().setFromObject(object);
                const size = box.getSize(new THREE.Vector3());

                // Get container color from configuration (same as regular container selection)
                const configManager = window.modlerComponents?.configurationManager;
                const containerConfig = configManager ?
                    configManager.get('visual.containers') :
                    { wireframeColor: '#00ff00' };

                const containerColorHex = parseInt(containerConfig.wireframeColor.replace('#', ''), 16);

                // Use centralized VisualEffects wireframe creation (prevents triangles)
                edgeMesh = visualEffects.createPreviewBox(
                    size.x, size.y, size.z,
                    new THREE.Vector3(0, 0, 0), // Position will be set below
                    containerColorHex, // Use configured container color
                    0.25 // 25% opacity for container context as specified
                );

                // Override the material opacity to match containerEdgeMaterial
                edgeMesh.material.opacity = 0.25;
            } else {
                // Fallback to manual creation if VisualEffects not available
                console.warn('VisualEffects not available, using fallback container edge creation');

                // Get container material from SelectionVisualizer
                const selectionVisualizer = window.modlerComponents?.selectionVisualizer;
                const containerMaterial = selectionVisualizer?.containerEdgeMaterial ||
                    new THREE.LineBasicMaterial({
                        color: 0x00ff00,
                        transparent: true,
                        opacity: 0.25,
                        renderOrder: 998
                    });

                const edgeGeometry = new THREE.EdgesGeometry(object.geometry);
                edgeMesh = new THREE.LineSegments(edgeGeometry, containerMaterial);
            }

            // Make edge highlights non-raycastable
            edgeMesh.raycast = () => {};

            // Position and orient the edge highlight to match the object
            edgeMesh.position.copy(object.position);
            edgeMesh.rotation.copy(object.rotation);
            edgeMesh.scale.copy(object.scale);
            edgeMesh.updateMatrix();

            // Add to scene
            const scene = window.modlerComponents?.sceneFoundation?.scene;
            if (scene) {
                scene.add(edgeMesh);
                this.containerEdgeHighlight = edgeMesh;
            }

        } catch (error) {
            console.error('Error creating container edge highlight:', error);
        }
    }

    /**
     * Update container edge highlight when container is resized
     */
    updateContainerEdgeHighlight() {
        if (this.containerContext && this.containerEdgeHighlight) {
            // Remove old highlight
            if (this.containerEdgeHighlight.parent) {
                this.containerEdgeHighlight.parent.remove(this.containerEdgeHighlight);
            }
            if (this.containerEdgeHighlight.geometry) {
                this.containerEdgeHighlight.geometry.dispose();
            }

            // Create new highlight with updated geometry
            this.createContainerEdgeHighlight(this.containerContext);
        }
    }

    /**
     * Commit current object positions to avoid position jumps
     */
    commitObjectPositions() {
        const sceneController = window.modlerComponents?.sceneController;
        const selectionController = window.modlerComponents?.selectionController;
        if (!sceneController || !selectionController) return;

        // For all currently selected objects, ensure their positions are committed
        const selectedObjects = selectionController.getSelectedObjects();
        selectedObjects.forEach(object => {
            const objectData = sceneController.getObjectByMesh(object);
            if (objectData) {
                // ARCHITECTURAL FIX: Simplified position commitment using world positions
                // Always save world position for consistency - eliminates coordinate space confusion
                objectData.position = object.getWorldPosition(new THREE.Vector3());

                // Notify scene controller of the position change
                sceneController.notifyObjectTransformChanged(objectData.id);
            }
        });
    }

    /**
     * Handle container context during selection clearing
     */
    handleSelectionClear(reason = 'normal') {
        // ENHANCED LOGIC: Only step out of container for specific reasons
        // Stay in container context when selecting different objects within the same container
        const shouldStepOut = this.isInContainerContext() &&
            reason !== 'step-into-container' &&
            reason !== 'object-selection'; // Don't step out when selecting objects within container

        if (shouldStepOut) {
            this.stepOutOfContainer();
        }
    }

    /**
     * Clean up container context
     */
    destroy() {
        this.stepOutOfContainer();
    }
}

// Export for use in main application
window.ContainerContextManager = ContainerContextManager;