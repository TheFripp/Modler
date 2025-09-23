// Modler V2 - Container Visualization Extension
// Extends ObjectVisualizer with container-specific behaviors
// Handles container wireframes, context states, padding visualization, and layout guides

class ContainerVisualizer extends ObjectVisualizer {
    constructor() {
        super();

        // Container-specific state tracking
        this.containerContext = null; // Current container context object
        this.contextHighlight = null; // Faded container edge highlight for context
        this.paddingVisualizations = new Map(); // container -> padding mesh
        this.layoutGuides = new Map(); // container -> layout guide meshes

        // Container-specific materials
        this.containerMaterial = null;
        this.paddingMaterial = null;
        this.layoutGuideMaterial = null;

        // Extended valid states for containers
        this.validStates = [...this.validStates, 'context', 'selected-in-context'];

        this.createContainerMaterials();
    }

    /**
     * Create container-specific materials
     */
    createContainerMaterials() {
        const configManager = this.getConfigManager();

        // Container wireframe material (green)
        const containerConfig = configManager ?
            configManager.get('visual.containers') :
            { wireframeColor: '#00ff00', lineWidth: 1, opacity: 0.8, renderOrder: 998 };

        const containerColorHex = parseInt(containerConfig.wireframeColor.replace('#', ''), 16);

        this.containerMaterial = new THREE.LineBasicMaterial({
            color: containerColorHex,
            transparent: true,
            opacity: containerConfig.opacity,
            linewidth: containerConfig.lineWidth
        });
        this.containerMaterial.lineWidth = containerConfig.lineWidth;
        this.containerMaterial.renderOrder = containerConfig.renderOrder || 998;

        // Padding visualization material
        this.paddingMaterial = new THREE.LineBasicMaterial({
            color: 0x00ff00,
            transparent: true,
            opacity: 0.3,
            linewidth: 1
        });

        // Layout guide material
        this.layoutGuideMaterial = new THREE.LineBasicMaterial({
            color: 0xffff00,
            transparent: true,
            opacity: 0.5,
            linewidth: 1
        });
    }

    /**
     * Register container-specific configuration callbacks
     */
    registerConfigurationCallbacks() {
        super.registerConfigurationCallbacks();

        const configManager = this.getConfigManager();
        if (!configManager) return;

        // Container-specific configuration changes
        configManager.subscribe('visual.containers.wireframeColor', (newValue) => {
            this.updateContainerMaterialProperty('color', newValue);
        });

        configManager.subscribe('visual.containers.lineWidth', (newValue) => {
            this.updateContainerMaterialProperty('linewidth', newValue);
        });

        configManager.subscribe('visual.containers.opacity', (newValue) => {
            this.updateContainerMaterialProperty('opacity', newValue);
        });
    }

    /**
     * Update container material property
     */
    updateContainerMaterialProperty(property, value) {
        if (!this.containerMaterial) return;

        if (property === 'color') {
            const colorHex = parseInt(value.replace('#', ''), 16);
            this.containerMaterial.color.setHex(colorHex);
        } else if (property === 'linewidth') {
            this.containerMaterial.lineWidth = value;
        } else {
            this.containerMaterial[property] = value;
        }

        this.containerMaterial.needsUpdate = true;
        this.refreshContainerWireframes();
    }

    /**
     * Override createEdgeHighlight to use green container wireframes
     */
    createEdgeHighlight(object) {
        // Check if this is a container
        const sceneController = window.modlerComponents?.sceneController;
        if (sceneController) {
            const objectData = sceneController.getObjectByMesh(object);
            if (objectData && objectData.isContainer) {
                return this.createContainerWireframe(object);
            }
        }

        // Fall back to parent implementation for non-containers
        return super.createEdgeHighlight(object);
    }

    /**
     * Create container wireframe (green)
     */
    createContainerWireframe(object) {
        // Don't create duplicate wireframes
        if (this.edgeHighlights.has(object)) return;

        // Only highlight containers with geometry
        if (!object.geometry) return;

        // Skip objects marked as hidden from selection
        if (object.userData && object.userData.hideFromSelection) return;

        // Use ContainerCrudManager to show the main container wireframe
        const sceneController = window.modlerComponents?.sceneController;
        const containerCrudManager = window.modlerComponents?.containerCrudManager;

        if (sceneController && containerCrudManager) {
            const objectData = sceneController.getObjectByMesh(object);
            if (objectData && objectData.isContainer) {
                // Force show the wireframe
                containerCrudManager.showContainer(objectData.id, true);

                // Track that we've shown this container
                this.edgeHighlights.set(object, object); // Store the object itself as reference
            }
        }
    }

    /**
     * Override removeEdgeHighlight for containers
     */
    removeEdgeHighlight(object) {
        // Check if this is a container
        const sceneController = window.modlerComponents?.sceneController;
        if (sceneController) {
            const objectData = sceneController.getObjectByMesh(object);
            if (objectData && objectData.isContainer) {
                return this.hideContainerWireframe(object);
            }
        }

        // Fall back to parent implementation for non-containers
        return super.removeEdgeHighlight(object);
    }

    /**
     * Hide container wireframe
     */
    hideContainerWireframe(object) {
        const sceneController = window.modlerComponents?.sceneController;
        const containerCrudManager = window.modlerComponents?.containerCrudManager;

        if (sceneController && containerCrudManager) {
            const objectData = sceneController.getObjectByMesh(object);
            if (objectData && objectData.isContainer) {
                // Only hide if not in container context
                if (this.containerContext !== object) {
                    containerCrudManager.hideContainer(objectData.id);
                }
            }
        }

        // Remove from tracking
        this.edgeHighlights.delete(object);
    }

    /**
     * Step into container context
     */
    stepIntoContainer(containerObject) {
        // Clear any previous container context
        this.stepOutOfContainer();

        this.containerContext = containerObject;

        // Set container to context state
        this.setState(containerObject, 'context');

        // Create faded context highlight
        this.createContextHighlight(containerObject);

        // Disable other container interactions
        this.disableOtherContainers(containerObject);
    }

    /**
     * Step out of container context
     */
    stepOutOfContainer() {
        const previousContainer = this.containerContext;

        // Clean up context highlight
        if (this.contextHighlight) {
            if (this.contextHighlight.parent) {
                this.contextHighlight.parent.remove(this.contextHighlight);
            }
            this.cleanupHighlightMesh(this.contextHighlight);
            this.contextHighlight = null;
        }

        this.containerContext = null;

        // Re-enable container interactions
        this.enableAllContainers();

        // Restore previous container state if it was selected
        if (previousContainer) {
            const selectionController = window.modlerComponents?.selectionController;
            if (selectionController && selectionController.isSelected && selectionController.isSelected(previousContainer)) {
                this.setState(previousContainer, 'selected');
            } else {
                this.setState(previousContainer, 'normal');
            }
        }
    }

    /**
     * Create faded context highlight
     */
    createContextHighlight(object) {
        if (!object || !object.geometry) return;

        try {
            // Create faded edge highlight using container material
            const edgeGeometry = new THREE.EdgesGeometry(object.geometry);

            // Create material with reduced opacity for context
            const contextMaterial = this.containerMaterial.clone();
            contextMaterial.opacity = this.containerMaterial.opacity * 0.3; // 30% of normal opacity

            const edgeMesh = this.createThickLineGroup(edgeGeometry, this.containerMaterial.lineWidth || 1, contextMaterial);

            // Clean up temporary geometry
            edgeGeometry.dispose();

            // Make non-raycastable
            edgeMesh.raycast = () => {};

            // Copy transform
            edgeMesh.position.copy(object.position);
            edgeMesh.rotation.copy(object.rotation);
            edgeMesh.scale.copy(object.scale);
            edgeMesh.position.y += 0.002; // Slightly higher than normal highlights

            // Add to scene
            if (object.parent) {
                object.parent.add(edgeMesh);
            }

            this.contextHighlight = edgeMesh;

        } catch (error) {
            console.warn('Failed to create container context highlight:', error);
        }
    }

    /**
     * Override applyStateVisuals for container-specific states
     */
    applyStateVisuals(object, newState, oldState) {
        // Handle container-specific states
        if (newState === 'context') {
            // Context state handled by stepIntoContainer
            return;
        } else if (newState === 'selected-in-context') {
            // Show both context highlight and enhanced visibility
            this.enhanceContextHighlight();
            this.showContainerWireframe(object);
            return;
        }

        // Handle standard states
        super.applyStateVisuals(object, newState, oldState);

        // Add container-specific enhancements for selected state
        if (newState === 'selected' || newState === 'multi-selected') {
            this.showPaddingVisualization(object);
        }
    }

    /**
     * Override clearStateVisuals for container-specific states
     */
    clearStateVisuals(object, state) {
        if (state === 'context') {
            // Context cleanup handled by stepOutOfContainer
            return;
        } else if (state === 'selected-in-context') {
            this.restoreContextHighlight();
            this.hideContainerWireframe(object);
            return;
        }

        // Handle standard states
        super.clearStateVisuals(object, state);

        // Remove container-specific visuals
        if (state === 'selected' || state === 'multi-selected') {
            this.hidePaddingVisualization(object);
        }
    }

    /**
     * Show container wireframe (force show even in context)
     */
    showContainerWireframe(object) {
        const sceneController = window.modlerComponents?.sceneController;
        const containerCrudManager = window.modlerComponents?.containerCrudManager;

        if (sceneController && containerCrudManager) {
            const objectData = sceneController.getObjectByMesh(object);
            if (objectData && objectData.isContainer) {
                containerCrudManager.showContainer(objectData.id, true);
            }
        }
    }

    /**
     * Enhance context highlight for selection state
     */
    enhanceContextHighlight() {
        if (this.contextHighlight && this.contextHighlight.material) {
            this.contextHighlight.material.opacity = this.containerMaterial.opacity * 0.6; // More visible
        }
    }

    /**
     * Restore context highlight to normal faded state
     */
    restoreContextHighlight() {
        if (this.contextHighlight && this.contextHighlight.material) {
            this.contextHighlight.material.opacity = this.containerMaterial.opacity * 0.3; // Back to faded
        }
    }

    /**
     * Show padding visualization for selected container
     */
    showPaddingVisualization(object) {
        const sceneController = window.modlerComponents?.sceneController;
        if (!sceneController) return;

        const objectData = sceneController.getObjectByMesh(object);
        if (!objectData || !objectData.isContainer || !objectData.autoLayout) return;

        // Only show if layout is enabled and has non-zero padding
        if (!objectData.autoLayout.enabled || !this.hasNonZeroPadding(objectData)) return;

        // Use ContainerCrudManager's padding visualization if available
        const containerCrudManager = window.modlerComponents?.containerCrudManager;
        if (containerCrudManager && containerCrudManager.showPaddingVisualization) {
            containerCrudManager.showPaddingVisualization(objectData.id);
        }
    }

    /**
     * Hide padding visualization
     */
    hidePaddingVisualization(object) {
        const sceneController = window.modlerComponents?.sceneController;
        const containerCrudManager = window.modlerComponents?.containerCrudManager;

        if (sceneController && containerCrudManager) {
            const objectData = sceneController.getObjectByMesh(object);
            if (objectData && objectData.isContainer && containerCrudManager.hidePaddingVisualization) {
                containerCrudManager.hidePaddingVisualization(objectData.id);
            }
        }
    }

    /**
     * Check if container has non-zero padding
     */
    hasNonZeroPadding(containerData) {
        if (!containerData.autoLayout?.padding) return false;

        const padding = containerData.autoLayout.padding;
        return padding.top > 0 || padding.bottom > 0 ||
               padding.left > 0 || padding.right > 0 ||
               padding.front > 0 || padding.back > 0;
    }

    /**
     * Disable collision detection for other containers during context
     */
    disableOtherContainers(activeContainer) {
        // Implementation would disable collision meshes for containers other than activeContainer
        // This prevents accidental selection of other containers while in context
    }

    /**
     * Re-enable collision detection for all containers
     */
    enableAllContainers() {
        // Implementation would re-enable all container collision meshes
    }

    /**
     * Refresh container wireframes
     */
    refreshContainerWireframes() {
        const containerCrudManager = window.modlerComponents?.containerCrudManager;
        if (containerCrudManager && containerCrudManager.refreshMaterials) {
            containerCrudManager.refreshMaterials();
        }
    }

    /**
     * Check if currently in container context
     */
    isInContainerContext() {
        return this.containerContext !== null;
    }

    /**
     * Get current container context
     */
    getContainerContext() {
        return this.containerContext;
    }

    /**
     * Override cleanup to handle container-specific resources
     */
    cleanup(object) {
        super.cleanup(object);

        // Clean up container-specific visualizations
        this.hidePaddingVisualization(object);

        // If this was the container context, step out
        if (this.containerContext === object) {
            this.stepOutOfContainer();
        }
    }

    /**
     * Override destroy to clean up container-specific resources
     */
    destroy() {
        super.destroy();

        // Step out of any container context
        this.stepOutOfContainer();

        // Clean up container-specific maps
        this.paddingVisualizations.clear();
        this.layoutGuides.clear();
    }
}

// Export for use in application
window.ContainerVisualizer = ContainerVisualizer;