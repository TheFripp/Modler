// Modler V2 - Container Visualization Extension
// Extends ObjectVisualizer with container-specific behaviors
// Handles container wireframes, context states, padding visualization, and layout guides

class ContainerVisualizer extends ObjectVisualizer {
    constructor() {
        super();

        // Container-specific state tracking
        this.containerContextStack = []; // Stack of container contexts for nested step-ins
        this.contextHighlights = new Map(); // container -> highlight mesh for context
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

        // NEW ARCHITECTURE: Show wireframe child directly
        const wireframeChild = object.children.find(child => child.userData.supportMeshType === 'wireframe');
        if (wireframeChild) {
            wireframeChild.visible = true;
            // Track that we've shown this container
            this.edgeHighlights.set(object, wireframeChild);
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
        // NEW ARCHITECTURE: Hide wireframe child directly
        const wireframeChild = this.edgeHighlights.get(object);
        if (wireframeChild && wireframeChild.userData.supportMeshType === 'wireframe') {
            // Only hide if not in container context stack
            if (!this.containerContextStack.includes(object)) {
                wireframeChild.visible = false;
            }
        }

        // Remove from tracking
        this.edgeHighlights.delete(object);
    }

    /**
     * Step into container context (supports nested contexts)
     */
    stepIntoContainer(containerObject) {
        // Add to context stack
        this.containerContextStack.push(containerObject);

        // Set container to context state
        this.setState(containerObject, 'context');

        // Create faded context highlight
        this.createContextHighlight(containerObject);

        // Ensure all parent containers in the stack maintain their context highlights
        this.ensureContextHighlightsVisible();

        // Disable other container interactions
        this.disableOtherContainers(containerObject);
    }

    /**
     * Step out of container context (one level only)
     */
    stepOutOfContainer() {
        if (this.containerContextStack.length === 0) return;

        // Remove the most recent container from stack
        const containerToRemove = this.containerContextStack.pop();

        // Clean up context highlight for this container
        const contextHighlight = this.contextHighlights.get(containerToRemove);
        if (contextHighlight) {
            if (contextHighlight.parent) {
                contextHighlight.parent.remove(contextHighlight);
            }
            this.cleanupHighlightMesh(contextHighlight);
            this.contextHighlights.delete(containerToRemove);
        }

        // If this was the last container in the stack, re-enable all containers
        if (this.containerContextStack.length === 0) {
            this.enableAllContainers();
        }

        // Set the container to normal state only if it's no longer in the context stack
        if (!this.containerContextStack.includes(containerToRemove)) {
            this.setState(containerToRemove, 'normal');
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

            // Position the context highlight to match the container's world position
            this.updateContextHighlightTransform(edgeMesh, object);

            // Add to scene (not as child to avoid transform issues with manual matrix containers)
            if (object.parent) {
                object.parent.add(edgeMesh);
            }

            this.contextHighlights.set(object, edgeMesh);

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
            this.showChildContainers(object);
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
            this.hideChildContainers(object);
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
        // Enhance highlights for all containers in context stack
        this.containerContextStack.forEach(container => {
            const contextHighlight = this.contextHighlights.get(container);
            if (contextHighlight && contextHighlight.material) {
                contextHighlight.material.opacity = this.containerMaterial.opacity * 0.6; // More visible
            }
        });
    }

    /**
     * Restore context highlight to normal faded state
     */
    restoreContextHighlight() {
        // Restore highlights for all containers in context stack
        this.containerContextStack.forEach(container => {
            const contextHighlight = this.contextHighlights.get(container);
            if (contextHighlight && contextHighlight.material) {
                contextHighlight.material.opacity = this.containerMaterial.opacity * 0.3; // Back to faded
            }
        });
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
     * Show child containers when parent container is selected
     */
    showChildContainers(parentObject) {
        const sceneController = window.modlerComponents?.sceneController;
        if (!sceneController) return;

        const parentObjectData = sceneController.getObjectByMesh(parentObject);
        if (!parentObjectData || !parentObjectData.isContainer) return;

        // Get child objects and show containers among them
        const childObjects = sceneController.getChildObjects(parentObjectData.id);
        const containerCrudManager = window.modlerComponents?.containerCrudManager;

        childObjects.forEach(childData => {
            if (childData.isContainer && containerCrudManager) {
                containerCrudManager.showContainer(childData.id);
            }
        });
    }

    /**
     * Hide child containers when parent container is deselected
     */
    hideChildContainers(parentObject) {
        const sceneController = window.modlerComponents?.sceneController;
        const selectionController = window.modlerComponents?.selectionController;
        if (!sceneController || !selectionController) return;

        const parentObjectData = sceneController.getObjectByMesh(parentObject);
        if (!parentObjectData || !parentObjectData.isContainer) return;

        // Get child objects and hide containers among them (but only if they're not selected)
        const childObjects = sceneController.getChildObjects(parentObjectData.id);
        const containerCrudManager = window.modlerComponents?.containerCrudManager;

        childObjects.forEach(childData => {
            if (childData.isContainer && containerCrudManager) {
                // Only hide if the child container itself is not selected
                if (!selectionController.isSelected(childData.mesh)) {
                    containerCrudManager.hideContainer(childData.id);
                }
            }
        });
    }

    /**
     * Disable collision detection for other containers during context
     */
    disableOtherContainers(activeContainer) {
        const sceneController = window.modlerComponents?.sceneController;
        if (!sceneController) return;

        // Get all objects in the scene
        const allObjects = sceneController.getAllObjects();

        for (const objectData of allObjects) {
            if (objectData.isContainer) {
                const containerMesh = objectData.mesh;

                // Disable interactive mesh for the active container (the one we stepped into)
                // This prevents the container from interfering with selection of its children
                if (containerMesh === activeContainer) {
                    this.disableContainerInteractiveMesh(containerMesh);
                }
            }
        }
    }

    /**
     * Re-enable collision detection for all containers
     */
    enableAllContainers() {
        const sceneController = window.modlerComponents?.sceneController;
        if (!sceneController) return;

        // Get all objects in the scene
        const allObjects = sceneController.getAllObjects();

        for (const objectData of allObjects) {
            if (objectData.isContainer) {
                const containerMesh = objectData.mesh;
                this.enableContainerInteractiveMesh(containerMesh);
            }
        }
    }

    /**
     * Disable container interactive mesh to prevent interference with child selection
     */
    disableContainerInteractiveMesh(containerMesh) {
        if (!containerMesh) return;

        // Find the interactive mesh child
        const interactiveMesh = containerMesh.children.find(child =>
            child.userData && child.userData.isContainerInteractive
        );

        if (interactiveMesh) {
            interactiveMesh.raycast = () => {}; // Disable raycasting
            interactiveMesh.userData.wasRaycastable = true; // Mark that it was previously raycastable
        }
    }

    /**
     * Re-enable container interactive mesh
     */
    enableContainerInteractiveMesh(containerMesh) {
        if (!containerMesh) return;

        // Find the interactive mesh child
        const interactiveMesh = containerMesh.children.find(child =>
            child.userData && child.userData.isContainerInteractive
        );

        if (interactiveMesh && interactiveMesh.userData.wasRaycastable) {
            delete interactiveMesh.raycast; // Re-enable raycasting by removing override
            delete interactiveMesh.userData.wasRaycastable;
        }
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
        return this.containerContextStack.length > 0;
    }

    /**
     * Get current container context (the most recent one)
     */
    getContainerContext() {
        return this.containerContextStack.length > 0 ?
            this.containerContextStack[this.containerContextStack.length - 1] : null;
    }

    /**
     * Get all container contexts (full stack)
     */
    getContainerContextStack() {
        return [...this.containerContextStack]; // Return a copy
    }

    /**
     * Ensure all parent containers in context stack have visible context highlights
     */
    ensureContextHighlightsVisible() {
        this.containerContextStack.forEach(container => {
            const contextHighlight = this.contextHighlights.get(container);
            if (contextHighlight) {
                contextHighlight.visible = true;

                // Update the transform to match the container's current position
                this.updateContextHighlightTransform(contextHighlight, container);

                // Make sure the parent container is also visible and has its context state
                this.setState(container, 'context');

                // Ensure the container's wireframe is also visible
                this.showContainerWireframe(container);
            }
        });
    }

    /**
     * Update context highlight transform to match its container
     */
    updateContextHighlightTransform(contextHighlight, container) {
        if (!contextHighlight || !container) return;

        // Get the container's world transform
        const worldPosition = container.getWorldPosition(new THREE.Vector3());
        const worldRotation = container.getWorldQuaternion(new THREE.Quaternion());
        const worldScale = container.getWorldScale(new THREE.Vector3());

        // Apply the transform to the context highlight
        contextHighlight.position.copy(worldPosition);
        contextHighlight.quaternion.copy(worldRotation);
        contextHighlight.scale.copy(worldScale);

        // Offset slightly higher to avoid z-fighting
        contextHighlight.position.y += 0.002;
    }

    /**
     * Update context highlight for a specific container (called after container moves)
     */
    updateContainerContextHighlight(containerMesh) {
        const contextHighlight = this.contextHighlights.get(containerMesh);
        if (contextHighlight) {
            this.updateContextHighlightTransform(contextHighlight, containerMesh);
        }
    }

    /**
     * Override cleanup to handle container-specific resources
     */
    cleanup(object) {
        super.cleanup(object);

        // Clean up container-specific visualizations
        this.hidePaddingVisualization(object);

        // If this was in the container context stack, remove it
        const index = this.containerContextStack.indexOf(object);
        if (index !== -1) {
            this.containerContextStack.splice(index, 1);

            // Clean up its context highlight
            const contextHighlight = this.contextHighlights.get(object);
            if (contextHighlight) {
                if (contextHighlight.parent) {
                    contextHighlight.parent.remove(contextHighlight);
                }
                this.cleanupHighlightMesh(contextHighlight);
                this.contextHighlights.delete(object);
            }
        }
    }

    /**
     * Override destroy to clean up container-specific resources
     */
    destroy() {
        super.destroy();

        // Step out of all container contexts
        while (this.containerContextStack.length > 0) {
            this.stepOutOfContainer();
        }

        // Clean up container-specific maps
        this.contextHighlights.clear();
        this.paddingVisualizations.clear();
        this.layoutGuides.clear();
    }
}

// Export for use in application
window.ContainerVisualizer = ContainerVisualizer;