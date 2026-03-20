import * as THREE from 'three';
// Modler V2 - Centralized Navigation Controller
// Unified container hierarchy navigation with consistent visual state management
// Extends HierarchicalSelectionManager with visual state control

class NavigationController {
    constructor() {
        // Navigation state
        this.navigationStack = []; // Stack of container contexts we've navigated into
        this.currentContainer = null; // Currently active container context

        // SIMPLIFICATION: Single navigation authority flag
        this.isNavigating = false; // Prevents interruptions during navigation operations

        // Visual state management
        this.visualizationManager = null;
        this.containerVisualizer = null;
        this.selectionController = null;

        this.initialized = false;
    }

    /**
     * Initialize with required components
     */
    initialize(selectionController, visualizationManager, containerVisualizer) {
        this.selectionController = selectionController;
        this.visualizationManager = visualizationManager;
        this.containerVisualizer = containerVisualizer;
        this.initialized = true;
    }

    // ====== UNIFIED NAVIGATION API ======

    /**
     * Navigate to a specific container by ID
     * @param {string} containerId - Container to navigate to
     * @param {Object} options - Navigation options
     */
    navigateToContainer(containerId, options = {}) {
        if (!this.initialized) {
            console.error('NavigationController not initialized');
            return false;
        }

        const sceneController = window.modlerComponents?.sceneController;
        if (!sceneController) return false;

        const containerData = sceneController.getObject(containerId);
        if (!containerData || !containerData.isContainer) {
            console.warn(`Container ${containerId} not found or is not a container`);
            return false;
        }

        // REORDERED SEQUENCE: Set navigation state first, then clear selection
        // Update navigation state BEFORE clearing selection to ensure UI gets correct context
        if (this.currentContainer) {
            this.navigationStack.push(this.currentContainer);
        }
        this.currentContainer = containerData;

        // Apply visual state using container visualizer
        this.containerVisualizer.stepIntoContainer(containerData.mesh);

        // Set proper selection state for container
        this.visualizationManager.setState(containerData.mesh, 'selected-in-context');

        // FIXED TIMING: Clear selection AFTER container context is established
        // This ensures UI update happens with correct container context
        // Only clear if not adding to selection (shift-click)
        if (!options.addToSelection) {
            this.selectionController.clearSelection('navigate-to-container');
        }

        return true;
    }

    /**
     * Navigate to a specific object by ID
     * Automatically finds object's container and navigates appropriately
     * @param {string} objectId - Object to navigate to
     * @param {Object} options - Navigation options
     */
    navigateToObject(objectId, options = {}) {
        // ATOMIC NAVIGATION: Set flag to prevent interruptions
        this.isNavigating = true;

        try {
            if (!this.initialized) {
                console.error('NavigationController not initialized');
                return false;
            }

            const sceneController = window.modlerComponents?.sceneController;
            if (!sceneController) {
                console.error('SceneController not available');
                return false;
            }

            const objectData = sceneController.getObject(objectId);
            if (!objectData) {
                console.warn(`Object ${objectId} not found`);
                return false;
            }


            // If object is a container, navigate to it
            if (objectData.isContainer) {
                const result = this.navigateToContainer(objectId, options);
                return result;
            }

            // If object has a parent container, navigate to container first
            if (objectData.parentContainer) {
                const parentContainer = sceneController.getObject(objectData.parentContainer);
                if (parentContainer) {
                    this.navigateToContainer(objectData.parentContainer, options);

                    // Then select the specific child object
                    if (!options.addToSelection) {
                        this.selectionController.clearSelection('navigate-to-object');
                    }
                    this.selectionController.select(objectData.mesh);
                    return true;
                } else {
                    console.error('Parent container not found:', objectData.parentContainer);
                    return false;
                }
            }

            // Object is at root level - just select it
            // Pass options to navigateToRoot so it knows whether to clear selection
            this.navigateToRoot(options);
            this.selectionController.select(objectData.mesh);
            return true;

        } finally {
            // ATOMIC NAVIGATION: Always clear flag when done
            this.isNavigating = false;
        }
    }

    /**
     * Navigate up one level in the hierarchy
     */
    navigateUp() {
        if (!this.initialized) return false;

        if (this.navigationStack.length > 0) {
            // Navigate back to parent container
            this.currentContainer = this.navigationStack.pop();

            // Apply visual state
            this.containerVisualizer.stepIntoContainer(this.currentContainer.mesh);
            this.visualizationManager.setState(this.currentContainer.mesh, 'selected-in-context');

        } else if (this.currentContainer) {
            // Exit to root level (this will trigger its own UI notification)
            this.navigateToRoot();
        }

        return true;
    }

    /**
     * Navigate down into a container (from current context)
     * @param {string} containerId - Container to step into
     */
    navigateDown(containerId) {
        return this.navigateToContainer(containerId);
    }

    /**
     * Navigate to root level (exit all container contexts)
     */
    navigateToRoot(options = {}) {
        if (!this.initialized) return false;

        // CRITICAL FIX: Check if we were in container context before clearing state
        const wasInContainerContext = this.currentContainer !== null || this.navigationStack.length > 0;

        // Clear navigation state
        this.navigationStack = [];
        this.currentContainer = null;

        // Clean up visual state for all containers we were in
        if (wasInContainerContext) {
            this.containerVisualizer.exitAllContainerContexts();
        }

        // Clear selection only if not adding to selection (shift-click)
        if (!options.addToSelection) {
            this.selectionController.clearSelection('navigate-to-root');
        }

        return true;
    }

    // ====== NAVIGATION STATE QUERIES ======

    /**
     * Get current navigation state
     * @returns {Object} Current navigation state
     */
    getNavigationState() {
        return {
            currentContainer: this.currentContainer ? {
                id: this.currentContainer.id,
                name: this.currentContainer.name
            } : null,
            navigationDepth: this.navigationStack.length + (this.currentContainer ? 1 : 0),
            navigationPath: this.getBreadcrumbs(),
            isInContainerContext: this.currentContainer !== null
        };
    }

    /**
     * Get breadcrumb navigation path
     * @returns {Array} Array of container names from root to current
     */
    getBreadcrumbs() {
        const breadcrumbs = [];

        // Add all containers in the navigation stack
        this.navigationStack.forEach(container => {
            breadcrumbs.push({
                id: container.id,
                name: container.name,
                type: 'container'
            });
        });

        // Add current container
        if (this.currentContainer) {
            breadcrumbs.push({
                id: this.currentContainer.id,
                name: this.currentContainer.name,
                type: 'container'
            });
        }

        return breadcrumbs;
    }

    /**
     * Check if currently in a container context
     * NavigationController is the authoritative source
     */
    isInContainerContext() {
        return this.currentContainer !== null;
    }

    /**
     * Get current container data
     */
    getCurrentContainer() {
        return this.currentContainer;
    }

    /**
     * Get full context stack as meshes (for ContainerVisualizer)
     * @returns {THREE.Object3D[]} Array of container meshes from outermost to current
     */
    getContextStackMeshes() {
        const meshes = this.navigationStack
            .filter(c => c?.mesh)
            .map(c => c.mesh);
        if (this.currentContainer?.mesh) {
            meshes.push(this.currentContainer.mesh);
        }
        return meshes;
    }

    /**
     * Handle double-click events for navigation
     * @param {THREE.Object3D} object - Double-clicked object
     * @param {Event} event - Mouse event
     */
    handleDoubleClick(object, event) {
        if (!object) {
            // Double-click on empty space - navigate up
            this.navigateUp();
            return true;
        }

        const sceneController = window.modlerComponents?.sceneController;
        if (!sceneController) return false;

        const objectData = sceneController.getObjectByMesh(object);
        if (!objectData) return false;

        // Double-click on container - navigate into it
        if (objectData.isContainer) {
            this.navigateToContainer(objectData.id);
            return true;
        }

        // Double-click on child object inside a container - always navigate directly to it
        if (objectData.parentContainer) {
            this.navigateToObject(objectData.id);
            return true;
        }

        return false;
    }

    /**
     * Handle empty space clicks
     * @param {Event} event - Mouse event
     */
    handleEmptySpaceClick(event) {
        const isMultiSelect = event && (event.ctrlKey || event.metaKey);

        if (!isMultiSelect) {
            if (this.isInContainerContext()) {
                // Step out of container context
                this.navigateUp();
            } else {
                // Clear selection at root level
                this.selectionController.clearSelection('empty-space');
            }
        }
    }

    // ====== UTILITY METHODS ======

    /**
     * Reset navigation state (useful for tool switching)
     */
    reset() {
        const wasInContext = this.currentContainer !== null;
        this.navigationStack = [];
        this.currentContainer = null;

        if (wasInContext && this.containerVisualizer) {
            this.containerVisualizer.exitAllContainerContexts();
        }
    }

    /**
     * Get navigation statistics for debugging
     */
    getNavigationStats() {
        return {
            initialized: this.initialized,
            stackDepth: this.navigationStack.length,
            currentContainer: this.currentContainer?.name || 'none',
            breadcrumbs: this.getBreadcrumbs().map(b => b.name).join(' > ')
        };
    }

    // ====== KEYBOARD NAVIGATION ======

    /**
     * Handle keyboard shortcuts for navigation
     * @param {KeyboardEvent} event - Keyboard event
     * @returns {boolean} True if key was handled
     */
    handleKeyDown(event) {
        if (!this.initialized) return false;

        switch (event.code) {
            case 'Escape':
                // Navigate up one level in container hierarchy
                if (this.currentContainer) {
                    this.navigateUp();
                    return true;
                }
                break;
        }

        return false;
    }
}

// Export for use in main application
window.NavigationController = NavigationController;