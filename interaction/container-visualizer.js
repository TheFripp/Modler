import * as THREE from 'three';
// Modler V2 - Container Visualization Extension
// Extends ObjectVisualizer with container-specific behaviors
// Handles container wireframes, context states, padding visualization, and layout guides

class ContainerVisualizer extends ObjectVisualizer {
    constructor() {
        super();

        // Container-specific state tracking
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
        // Use MaterialManager for centralized material creation
        this.containerMaterial = this.materialManager.createContainerWireframeMaterial();
        this.paddingMaterial = this.materialManager.createPaddingVisualizationMaterial();
        this.layoutGuideMaterial = this.materialManager.createLayoutGuideMaterial();
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

        // Track wireframe for edge highlights map via supportMeshes
        const supportMeshes = object.userData?.supportMeshes;
        const trackingMesh = supportMeshes?.containerSelectionWireframe || supportMeshes?.cadWireframe;
        if (trackingMesh) {
            this.edgeHighlights.set(object, trackingMesh);
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
     * Get the context stack meshes from NavigationController
     */
    getNavigationContextStack() {
        const navigationController = window.modlerComponents?.navigationController;
        return navigationController ? navigationController.getContextStackMeshes() : [];
    }

    /**
     * Hide container wireframe
     */
    hideContainerWireframe(object) {
        // Only hide if not in container context stack
        if (!this.getNavigationContextStack().includes(object)) {
            const factory = this.getSupportMeshFactory();
            if (factory) {
                factory.hideContainerSelectionWireframe(object);
                factory.hideContainerWireframe(object);
            }
        }

        // Remove from tracking
        this.edgeHighlights.delete(object);
    }

    /**
     * Apply visual state for stepping into a container context
     * @param {THREE.Object3D} containerObject - Container to step into
     */
    stepIntoContainer(containerObject) {
        // Set container to context state using existing wireframe
        this.setContainerContextState(containerObject);

        // Ensure all parent containers in the stack maintain their context state
        this.ensureParentContextStates();

        // Disable other container interactions
        this.disableOtherContainers(containerObject);
    }

    /**
     * Exit all container contexts visually (called from navigateToRoot)
     * Hides wireframes for all containers that were in the context
     */
    exitAllContainerContexts() {
        // Get the stack before NavigationController clears it
        // (NavigationController already cleared its state, but support meshes still need cleanup)
        const factory = this.getSupportMeshFactory();
        if (!factory) return;

        // Hide all container wireframes that aren't in the (now-empty) navigation stack
        const sceneController = window.modlerComponents?.sceneController;
        if (sceneController) {
            const allObjects = sceneController.getAllObjects();
            for (const objectData of allObjects) {
                if (objectData.isContainer) {
                    factory.hideContainerWireframe(objectData.mesh);
                    this.edgeHighlights.delete(objectData.mesh);
                }
            }
        }
    }

    /**
     * Set container to context state (faded wireframe)
     */
    setContainerContextState(containerObject) {
        if (!containerObject) return;

        const factory = this.getSupportMeshFactory();
        if (factory) {
            // Get original opacity for 30% fade calculation
            const supportMeshes = containerObject.userData?.supportMeshes;
            const wireframe = supportMeshes?.cadWireframe;
            const originalOpacity = wireframe?.userData?.originalOpacity ?? wireframe?.material?.opacity ?? 1;
            factory.setContainerWireframeOpacity(containerObject, originalOpacity * 0.3);
            if (wireframe) wireframe.userData.wireframeState = 'context';
        }
    }

    /**
     * Set container wireframe to selection state (full opacity)
     */
    setContainerSelectionState(containerObject) {
        if (!containerObject) return;

        const factory = this.getSupportMeshFactory();
        if (factory) {
            // Show fat selection wireframe (LineSegments2 with pixel-width lines)
            factory.showContainerSelectionWireframe(containerObject);
            // Also show thin cadWireframe at full opacity for context
            factory.restoreContainerWireframeOpacity(containerObject);
            factory.showContainerWireframe(containerObject);
        }
    }

    /**
     * Create hover effect for containers - shows cadWireframe at reduced opacity
     */
    createHoverEffect(object) {
        const factory = this.getSupportMeshFactory();
        if (factory) {
            factory.showContainerHoverWireframe(object);
        }
    }

    /**
     * Remove hover effect for containers
     */
    removeHoverEffect(object) {
        const factory = this.getSupportMeshFactory();
        if (factory) {
            factory.hideContainerHoverWireframe(object);
        }
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
            this.setContainerSelectionState(object);
            this.showPaddingVisualization(object);
            this.showChildContainers(object);
            this.showParentContainerContext(object);
        } else {
            super.applyStateVisuals(object, newState, oldState);
        }
    }

    /**
     * Override clearStateVisuals for container-specific states
     */
    clearStateVisuals(object, state) {
        if (state === 'context') {
            // Context cleanup - hide the wireframe unless it's still in context stack
            if (!this.getNavigationContextStack().includes(object)) {
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
            this.hideContainerWireframe(object);
            this.hidePaddingVisualization(object);
            this.hideChildContainers(object, true);
            this.hideParentContainerContext(object);
            return;
        }

        super.clearStateVisuals(object, state);
    }

    /**
     * Show container wireframe (force show even in context)
     */
    showContainerWireframe(object) {
        const factory = this.getSupportMeshFactory();
        if (factory) {
            factory.restoreContainerWireframeOpacity(object);
            factory.showContainerWireframe(object);
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
        if (objectData.containerMode !== 'layout' || !this.hasNonZeroPadding(objectData)) return;

        const visualEffects = window.modlerComponents?.visualEffects;
        if (visualEffects && typeof visualEffects.showPaddingVisualization === 'function') {
            visualEffects.showPaddingVisualization(objectData.mesh, objectData.autoLayout.padding);
        }
    }

    /**
     * Hide padding visualization
     */
    hidePaddingVisualization(object) {
        const sceneController = window.modlerComponents?.sceneController;
        if (!sceneController) return;

        const objectData = sceneController.getObjectByMesh(object);
        if (!objectData || !objectData.isContainer) return;

        const visualEffects = window.modlerComponents?.visualEffects;
        if (visualEffects && typeof visualEffects.hidePaddingVisualization === 'function') {
            visualEffects.hidePaddingVisualization(objectData.mesh);
        }
    }

    /**
     * Check if container has non-zero padding
     */
    hasNonZeroPadding(containerData) {
        if (!containerData.autoLayout?.padding) return false;

        const padding = containerData.autoLayout.padding;
        return padding.width > 0 || padding.height > 0 || padding.depth > 0;
    }

    /**
     * Show child containers when parent container is selected.
     * Recursively shows all descendant containers with depth-based opacity:
     * depth 1 = 75%, depth 2 = 50%, depth 3 = 25%, etc.
     */
    showChildContainers(parentObject, depth = 0) {
        const sceneController = window.modlerComponents?.sceneController;
        if (!sceneController) return;

        const parentObjectData = sceneController.getObjectByMesh(parentObject);
        if (!parentObjectData || !parentObjectData.isContainer) return;

        const childObjects = sceneController.getChildObjects(parentObjectData.id);
        const factory = this.getSupportMeshFactory();
        if (!factory) return;

        childObjects.forEach(childData => {
            if (childData.isContainer) {
                factory.showContainerWireframe(childData.mesh);

                // Depth-based opacity: 75% at depth 1, 50% at depth 2, etc.
                const childDepth = depth + 1;
                const opacity = Math.max(0.25, 1.0 - childDepth * 0.25);
                factory.setContainerWireframeOpacity(childData.mesh, opacity);

                // Recursively show deeper nested containers
                this.showChildContainers(childData.mesh, childDepth);
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

        const childObjects = sceneController.getChildObjects(parentObjectData.id);
        const factory = this.getSupportMeshFactory();
        if (!factory) return;

        childObjects.forEach(childData => {
            if (childData.isContainer) {
                // Always recurse first (since showChildContainers is now recursive)
                this.hideChildContainers(childData.mesh, forceHideAll);

                // Hide child container if forced or if not currently selected
                if (forceHideAll || !selectionController.isSelected(childData.mesh)) {
                    factory.hideContainerWireframe(childData.mesh);
                }
            }
        });
    }

    /**
     * Show parent container as semi-transparent wireframe when a nested container is selected
     */
    showParentContainerContext(object) {
        const sceneController = window.modlerComponents?.sceneController;
        if (!sceneController) return;

        const objectData = sceneController.getObjectByMesh(object);
        if (!objectData || !objectData.parentContainer) return;

        const parentData = sceneController.getObject(objectData.parentContainer);
        if (!parentData?.isContainer || !parentData.mesh) return;

        // Don't override if parent is already in navigation context stack
        if (this.getNavigationContextStack().includes(parentData.mesh)) return;

        // Show parent wireframe at reduced opacity
        this.setContainerContextState(parentData.mesh);
        // Track that we showed this parent for cleanup
        this._parentContextForSelection = parentData.mesh;
    }

    /**
     * Hide parent container context wireframe when nested container is deselected
     */
    hideParentContainerContext(object) {
        if (!this._parentContextForSelection) return;

        const parentMesh = this._parentContextForSelection;
        this._parentContextForSelection = null;

        // Don't hide if parent is in navigation context stack
        if (this.getNavigationContextStack().includes(parentMesh)) return;

        this.hideContainerWireframe(parentMesh);
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
     * Delegates to NavigationController as single source of truth
     */
    isInContainerContext() {
        const navigationController = window.modlerComponents?.navigationController;
        return navigationController ? navigationController.isInContainerContext() : false;
    }

    /**
     * Get current container context mesh
     */
    getContainerContext() {
        const navigationController = window.modlerComponents?.navigationController;
        const currentContainer = navigationController ? navigationController.getCurrentContainer() : null;
        return currentContainer ? currentContainer.mesh : null;
    }

    /**
     * Get all container contexts (full stack)
     */
    getContainerContextStack() {
        return this.getNavigationContextStack();
    }

    /**
     * Ensure all parent containers in context stack have visible context states
     */
    ensureParentContextStates() {
        this.getNavigationContextStack().forEach(container => {
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
    }

    /**
     * Override destroy to clean up container-specific resources
     */
    destroy() {
        super.destroy();

        this.exitAllContainerContexts();

        this.paddingVisualizations.clear();
        this.layoutGuides.clear();
    }
}

// Export for use in application
window.ContainerVisualizer = ContainerVisualizer;