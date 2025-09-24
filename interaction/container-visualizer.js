// Modler V2 - Container Visualization Extension
// Extends ObjectVisualizer with container-specific behaviors
// Handles container wireframes, context states, padding visualization, and layout guides

class ContainerVisualizer extends ObjectVisualizer {
    constructor() {
        super();

        // Container-specific state tracking
        this.containerContextStack = []; // Stack of container contexts for nested step-ins
        this.paddingVisualizations = new Map(); // container -> padding mesh
        this.layoutGuides = new Map(); // container -> layout guide meshes
        this.dimmedObjects = new Map(); // object -> { originalProperties, contextLevel } (for dimming in context)

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

        // Use unified wireframe system for selection state
        this.setContainerSelectionState(object);

        // Track wireframe for edge highlights map
        const wireframeChild = object.children.find(child => child.userData.supportMeshType === 'wireframe');
        if (wireframeChild) {
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
        // Find wireframe child directly (consistent with setContainerSelectionState)
        const wireframeChild = object.children.find(child =>
            child.userData.supportMeshType === 'wireframe');

        if (wireframeChild) {
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

        // Set container to context state using existing wireframe
        this.setContainerContextState(containerObject);

        // Ensure all parent containers in the stack maintain their context state
        this.ensureParentContextStates();

        // Disable other container interactions
        this.disableOtherContainers(containerObject);

        // Apply dimming to objects outside the container context
        this.dimNonSelectedObjectsInContext();
    }

    /**
     * Step out of container context (one level only)
     */
    stepOutOfContainer() {
        if (this.containerContextStack.length === 0) return;

        // Remove the most recent container from stack
        const containerToRemove = this.containerContextStack.pop();
        const newContextLevel = this.containerContextStack.length;

        // If this was the last container in the stack, re-enable all containers
        if (newContextLevel === 0) {
            this.enableAllContainers();
            // Restore all dimmed objects when exiting container context completely
            this.restoreAllDimmedObjects();
        } else {
            // Still in a container context - selectively restore objects that are no longer in context
            this.restoreDimmingForContextLevel(newContextLevel + 1);
            // Re-apply dimming for the current context level
            this.dimNonSelectedObjectsInContext();
        }

        // Set the container to normal state only if it's no longer in the context stack
        if (!this.containerContextStack.includes(containerToRemove)) {
            this.hideContainerWireframe(containerToRemove);
        }
    }

    /**
     * Set container to context state (faded wireframe)
     */
    setContainerContextState(containerObject) {
        if (!containerObject) return;

        // Find the existing wireframe child
        const wireframeChild = containerObject.children.find(child =>
            child.userData.supportMeshType === 'wireframe');

        if (wireframeChild) {
            // Make visible and set to faded opacity for context state
            wireframeChild.visible = true;
            if (wireframeChild.material) {
                // Store original opacity if not already stored
                if (wireframeChild.userData.originalOpacity === undefined) {
                    wireframeChild.userData.originalOpacity = wireframeChild.material.opacity;
                }

                // Set faded opacity for context state
                wireframeChild.material.opacity = wireframeChild.userData.originalOpacity * 0.3; // 30% of original
                wireframeChild.material.transparent = true;

                // Mark as in context state
                wireframeChild.userData.wireframeState = 'context';
            }
        }
    }

    /**
     * Set container wireframe to selection state (full opacity)
     */
    setContainerSelectionState(containerObject) {
        if (!containerObject) return;

        const wireframeChild = containerObject.children.find(child =>
            child.userData.supportMeshType === 'wireframe');

        if (wireframeChild) {
            wireframeChild.visible = true;
            if (wireframeChild.material) {
                // Restore original opacity
                if (wireframeChild.userData.originalOpacity !== undefined) {
                    wireframeChild.material.opacity = wireframeChild.userData.originalOpacity;
                } else {
                    wireframeChild.material.opacity = this.containerMaterial.opacity;
                }
                wireframeChild.material.transparent = true;

                // Mark as in selection state
                wireframeChild.userData.wireframeState = 'selected';
            }
        }
    }

    /**
     * Dim objects outside the current container context (50% opacity)
     * This creates focus by dimming everything NOT in the current container branch
     */
    dimNonSelectedObjectsInContext() {
        if (!this.isInContainerContext()) return;

        const sceneController = window.modlerComponents?.sceneController;
        const selectionController = window.modlerComponents?.selectionController;
        if (!sceneController || !selectionController) return;

        // Get the current container context
        const currentContainer = this.getContainerContext();
        if (!currentContainer) return;

        // Find the container data
        const containerData = sceneController.getObjectByMesh(currentContainer);
        if (!containerData || !containerData.isContainer) return;

        // Get ALL objects in the scene
        const allObjects = sceneController.getAllObjects();

        allObjects.forEach(objectData => {
            // Skip if this object is currently selected
            if (selectionController.isSelected(objectData.mesh)) return;

            // Skip if already dimmed
            if (this.dimmedObjects.has(objectData.mesh)) return;

            // Skip containers in the context stack (they should stay visible)
            if (this.containerContextStack.includes(objectData.mesh)) return;

            // Skip if this object is INSIDE the current container context
            if (this.isObjectInsideContainerBranch(objectData, containerData)) return;

            // Dim objects that are OUTSIDE the container context
            this.dimObject(objectData.mesh);
        });
    }

    /**
     * Check if an object is inside the current container branch
     * @param {Object} objectData - Object data from scene controller
     * @param {Object} containerData - Container data we're checking against
     * @returns {boolean} True if object is inside the container branch
     */
    isObjectInsideContainerBranch(objectData, containerData) {
        // The object is inside the container branch if:
        // 1. It's a direct child of the container
        // 2. It's a child of any nested container within this container

        if (!objectData || !containerData) return false;

        // Check if object is the container itself
        if (objectData.id === containerData.id) return true;

        // Check if object is a direct child of the container
        if (objectData.parentContainer === containerData.id) return true;

        // Check if object is nested deeper in the container hierarchy
        let currentParent = objectData.parentContainer;
        const sceneController = window.modlerComponents?.sceneController;

        while (currentParent && sceneController) {
            const parentData = sceneController.getObject(currentParent);
            if (!parentData) break;

            // If we found our target container in the parent chain
            if (parentData.id === containerData.id) return true;

            // Move up the hierarchy
            currentParent = parentData.parentContainer;
        }

        return false;
    }

    /**
     * Restore all dimmed objects to normal opacity
     */
    restoreAllDimmedObjects() {
        for (const [mesh, dimmingData] of this.dimmedObjects) {
            this.restoreObject(mesh, dimmingData);
        }
        this.dimmedObjects.clear();
    }

    /**
     * Restore dimming only for objects dimmed at a specific context level or higher
     * Used when stepping out of nested containers to only restore relevant objects
     */
    restoreDimmingForContextLevel(contextLevel) {
        const objectsToRestore = [];

        for (const [mesh, dimmingData] of this.dimmedObjects) {
            // Restore objects that were dimmed at the specified context level or deeper
            if (dimmingData.contextLevel >= contextLevel) {
                this.restoreObject(mesh, dimmingData);
                objectsToRestore.push(mesh);
            }
        }

        // Remove restored objects from the dimmed objects map
        objectsToRestore.forEach(mesh => {
            this.dimmedObjects.delete(mesh);
        });
    }

    /**
     * Dim a single object (50% opacity)
     */
    dimObject(mesh) {
        if (!mesh || !mesh.material) return;
        if (this.dimmedObjects.has(mesh)) {
            // Object is already dimmed - don't dim it again
            return;
        }

        // Store original properties and current context level
        const dimmingData = {
            originalProperties: {
                opacity: mesh.material.opacity,
                transparent: mesh.material.transparent
            },
            contextLevel: this.containerContextStack.length
        };

        this.dimmedObjects.set(mesh, dimmingData);

        // Apply dimming
        mesh.material.transparent = true;
        mesh.material.opacity = dimmingData.originalProperties.opacity * 0.5; // 50% of original
    }

    /**
     * Restore a single object to original opacity
     */
    restoreObject(mesh, dimmingData) {
        if (!mesh || !mesh.material) return;

        const originalProperties = dimmingData.originalProperties || dimmingData;
        mesh.material.opacity = originalProperties.opacity;
        mesh.material.transparent = originalProperties.transparent;
    }

    /**
     * Update dimming when selection changes in container context
     * More selective approach - only updates objects that need changes
     */
    updateContextDimming() {
        if (!this.isInContainerContext()) {
            this.restoreAllDimmedObjects();
            return;
        }

        const sceneController = window.modlerComponents?.sceneController;
        const selectionController = window.modlerComponents?.selectionController;
        if (!sceneController || !selectionController) return;

        // Get the current container context
        const currentContainer = this.getContainerContext();
        if (!currentContainer) return;

        // Find the container data
        const containerData = sceneController.getObjectByMesh(currentContainer);
        if (!containerData || !containerData.isContainer) return;

        // Get ALL objects in the scene to evaluate dimming
        const allObjects = sceneController.getAllObjects();
        const currentContextLevel = this.containerContextStack.length;

        allObjects.forEach(objectData => {
            const isSelected = selectionController.isSelected(objectData.mesh);
            const isDimmed = this.dimmedObjects.has(objectData.mesh);
            const isInsideContainer = this.isObjectInsideContainerBranch(objectData, containerData);
            const isInContextStack = this.containerContextStack.includes(objectData.mesh);

            if (isInsideContainer || isInContextStack || isSelected) {
                // Objects inside container, in context stack, or selected should NOT be dimmed
                if (isDimmed) {
                    const dimmingData = this.dimmedObjects.get(objectData.mesh);
                    if (dimmingData && dimmingData.contextLevel === currentContextLevel) {
                        this.restoreObject(objectData.mesh, dimmingData);
                        this.dimmedObjects.delete(objectData.mesh);
                    }
                }
            } else {
                // Objects outside container should be dimmed
                if (!isDimmed) {
                    this.dimObject(objectData.mesh);
                }
            }
        });
    }

    /**
     * Override applyStateVisuals for container-specific states
     */
    applyStateVisuals(object, newState, oldState) {
        // Handle container-specific states
        if (newState === 'context') {
            // Set faded context state
            this.setContainerContextState(object);
            return;
        } else if (newState === 'selected-in-context') {
            // Show enhanced visibility for selected context container
            this.showContainerWireframe(object);
            return;
        }

        // Handle standard states for containers
        if (newState === 'selected' || newState === 'multi-selected') {
            // Use unified wireframe system for selection
            this.setContainerSelectionState(object);
            this.showPaddingVisualization(object);
            this.showChildContainers(object);

            // Update dimming in container context when container becomes selected
            this.dimNonSelectedObjectsInContext();
        } else {
            // Fall back to parent for non-container specific states
            super.applyStateVisuals(object, newState, oldState);

            // Update dimming when any object becomes selected/deselected in container context
            this.dimNonSelectedObjectsInContext();
        }
    }

    /**
     * Override clearStateVisuals for container-specific states
     */
    clearStateVisuals(object, state) {
        if (state === 'context') {
            // Context cleanup - hide the wireframe unless it's still in context stack
            if (!this.containerContextStack.includes(object)) {
                this.hideContainerWireframe(object);
            }
            return;
        } else if (state === 'selected-in-context') {
            // Return to faded context state
            this.setContainerContextState(object);
            return;
        }

        // Handle container-specific selected states
        if (state === 'selected' || state === 'multi-selected') {
            // Hide container wireframe (don't delegate to parent since it returns early for containers)
            this.hideContainerWireframe(object);
            this.hidePaddingVisualization(object);
            // Force hide all child containers to handle nested container clearing
            this.hideChildContainers(object, true);

            // Update dimming in container context when container selection changes
            this.dimNonSelectedObjectsInContext();
            return;
        }

        // Handle other standard states through parent
        super.clearStateVisuals(object, state);

        // Update dimming when any object selection changes in container context
        this.dimNonSelectedObjectsInContext();
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
    hideChildContainers(parentObject, forceHideAll = false) {
        const sceneController = window.modlerComponents?.sceneController;
        const selectionController = window.modlerComponents?.selectionController;
        if (!sceneController || !selectionController) return;

        const parentObjectData = sceneController.getObjectByMesh(parentObject);
        if (!parentObjectData || !parentObjectData.isContainer) return;

        // Get child objects and hide containers among them
        const childObjects = sceneController.getChildObjects(parentObjectData.id);
        const containerCrudManager = window.modlerComponents?.containerCrudManager;

        childObjects.forEach(childData => {
            if (childData.isContainer && containerCrudManager) {
                // Hide child container if forced or if not currently selected
                if (forceHideAll || !selectionController.isSelected(childData.mesh)) {
                    containerCrudManager.hideContainer(childData.id);

                    // Recursively hide nested containers when forcing
                    if (forceHideAll) {
                        this.hideChildContainers(childData.mesh, true);
                    }
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
     * Ensure all parent containers in context stack have visible context states
     */
    ensureParentContextStates() {
        this.containerContextStack.forEach(container => {
            this.setContainerContextState(container);
        });
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
        this.paddingVisualizations.clear();
        this.layoutGuides.clear();
    }
}

// Export for use in application
window.ContainerVisualizer = ContainerVisualizer;