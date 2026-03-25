// Modler V2 - Core Selection State Management
// Handles selection state only - visual effects delegated to SelectionVisualizer
// Target: ~150 lines - streamlined from 793 lines

class SelectionController {
    constructor() {
        // Core selection state
        this.selectedObjects = new Set();

        // Component references (set during initialization)
        this.visualizationManager = null;

        // Double-click tracking for container step-in (moved from BaseSelectionBehavior)
        this.lastClickedChildObject = null;
        this.lastClickTime = 0;
    }

    /**
     * Initialize with dependent components
     */
    initialize(visualizationManager) {
        this.visualizationManager = visualizationManager;
    }

    // ====== COMPONENT GETTERS (reduce repeated lookups) ======

    getSceneController() {
        return window.modlerComponents?.sceneController;
    }

    getNavigationController() {
        return window.modlerComponents?.navigationController;
    }

    getObjectStateManager() {
        return window.modlerComponents?.objectStateManager;
    }

    getToolController() {
        return window.modlerComponents?.toolController;
    }

    /**
     * Get object data from mesh with error handling
     */
    getObjectData(mesh) {
        const sceneController = this.getSceneController();
        return sceneController?.getObjectByMesh(mesh);
    }

    /**
     * Get parent container for an object
     */
    getParentContainer(objectData) {
        if (!objectData?.parentContainer) return null;
        const sceneController = this.getSceneController();
        return sceneController?.getObject(objectData.parentContainer);
    }

    /**
     * Resolve target object for selection based on source and container-first logic.
     * Single source of truth for "given an object, what should actually get selected?"
     * @param {Object} object - The clicked/targeted mesh
     * @param {Object} options - Resolution options
     * @param {boolean} options.skipResolution - Target already resolved, return as-is
     * @param {boolean} options.direct - UI tree selection: select as-is, navigate to parent
     * @returns {{ target: Object, navigateTo: string|null }}
     */
    resolveSelectionTarget(object, options = {}) {
        // Already resolved by caller
        if (options.skipResolution) {
            return { target: object, navigateTo: null };
        }

        // Direct selection from UI tree — select the exact object, navigate to parent container
        if (options.direct) {
            const objectData = this.getObjectData(object);
            const navigateTo = objectData?.parentContainer || null;
            return { target: object, navigateTo };
        }

        // 3D click — container-first resolution
        const objectData = this.getObjectData(object);
        if (!objectData) return { target: object, navigateTo: null };

        const isInContainerContext = this.isInContainerContext();
        const currentContainerContext = this.getContainerContext();

        // In container context - check if object is part of current container
        if (isInContainerContext && currentContainerContext) {
            const isPartOfCurrentContainer = this.isObjectPartOfContainer(objectData, currentContainerContext);

            if (!isPartOfCurrentContainer) {
                // Object outside current container - navigate up first
                const navigationController = this.getNavigationController();
                if (navigationController) {
                    navigationController.navigateUp();
                }
            }
            // Direct selection within (or after navigating out of) container
            return { target: object, navigateTo: null };
        }

        // Not in container context - resolve up to root-level container
        if (objectData.parentContainer) {
            const sceneController = this.getSceneController();
            let current = objectData;
            let rootContainer = null;
            while (current?.parentContainer && sceneController) {
                const parent = sceneController.getObject(current.parentContainer);
                if (parent?.isContainer) {
                    rootContainer = parent;
                    current = parent;
                } else {
                    break;
                }
            }
            if (rootContainer?.mesh) {
                return { target: rootContainer.mesh, navigateTo: null };
            }
        }

        return { target: object, navigateTo: null };
    }

    // Core selection methods
    select(object, options = {}) {
        if (!object) return false;

        const sceneController = this.getSceneController();
        if (!sceneController) {
            console.warn('SceneController not available');
            return false;
        }

        // Single resolution path for all selection sources
        const { target, navigateTo } = this.resolveSelectionTarget(object, options);

        // Navigate to parent container if needed (e.g., UI tree selecting a child)
        if (navigateTo) {
            const navigationController = this.getNavigationController();
            navigationController?.navigateToContainer(navigateTo);
        }

        // Add to selection
        this.selectedObjects.add(target);

        // Update visualization
        if (this.visualizationManager) {
            this.visualizationManager.setState(target, 'selected');
        }

        // Notify about selection change
        this.notifySelectionChange();

        return true;
    }

    deselect(object) {
        if (!object || !this.selectedObjects.has(object)) return false;

        this.selectedObjects.delete(object);

        // Delegate visual updates to VisualizationManager
        if (this.visualizationManager) {
            this.visualizationManager.setState(object, 'normal');
        }

        return true;
    }

    toggle(object) {
        if (this.isSelected(object)) {
            const result = this.deselect(object);
            this.notifySelectionChange();
            return result;
        } else {
            return this.select(object);
        }
    }

    clearSelection(reason) {
        const objectsToDeselect = Array.from(this.selectedObjects);

        // Update visualization for all deselected objects
        if (this.visualizationManager) {
            objectsToDeselect.forEach(object => {
                this.visualizationManager.setState(object, 'normal');
            });
        }

        this.selectedObjects.clear();
        this.notifySelectionChange();

        return objectsToDeselect.length;
    }

    isInContainerContext() {
        const navigationController = this.getNavigationController();
        return navigationController?.isInContainerContext() ?? false;
    }

    getContainerContext() {
        const navigationController = this.getNavigationController();
        return navigationController?.getCurrentContainer()?.mesh ?? null;
    }

    /**
     * Check if an object is part of a specific container context
     */
    isObjectPartOfContainer(objectData, containerMesh) {
        if (!objectData || !containerMesh) return false;

        // Check if object is the container itself
        if (objectData.mesh === containerMesh) return true;

        // Check if object is a child of the container
        if (objectData.parentContainer) {
            const parentContainer = this.getParentContainer(objectData);
            if (parentContainer?.mesh === containerMesh) return true;
        }

        // Check if object is a visual component of the container
        if (objectData.mesh?.parent === containerMesh) return true;

        return false;
    }


    // Query methods
    isSelected(object) {
        return this.selectedObjects.has(object);
    }

    getSelectedObjects() {
        return Array.from(this.selectedObjects);
    }

    getSelectedCount() {
        return this.selectedObjects.size;
    }

    hasSelection() {
        return this.selectedObjects.size > 0;
    }


    // Selection events
    onSelectionChange(callback) {
        // Simple callback system - could expand to full event system later if needed
        if (typeof callback === 'function') {
            this.selectionChangeCallback = callback;
        }
    }

    notifySelectionChange() {
        const selectedObjects = this.getSelectedObjects();
        const selectedObjectIds = selectedObjects
            .map(mesh => this.getObjectData(mesh)?.id)
            .filter(Boolean);

        // Build container context from NavigationController
        const navigationController = this.getNavigationController();
        const currentContainer = navigationController?.getCurrentContainer();
        const containerContext = currentContainer
            ? { containerId: currentContainer.id, containerName: currentContainer.name }
            : null;

        // Emit consolidated selection event for UI panels
        if (window.objectEventBus) {
            window.objectEventBus.emit(
                window.objectEventBus.EVENT_TYPES?.SELECTION || 'object:selection',
                null,
                {
                    selected: selectedObjectIds.length > 0,
                    selectedObjectIds: selectedObjectIds,
                    selectionCount: selectedObjectIds.length,
                    containerContext,
                    source: 'SelectionController.notifySelectionChange'
                },
                { immediate: true, source: 'SelectionController.notifySelectionChange' }
            );
        }

        // Sync selection to ObjectStateManager
        const objectStateManager = this.getObjectStateManager();
        if (objectStateManager) {
            objectStateManager.setSelection(selectedObjectIds);
        }

        // Notify registered callback
        if (this.selectionChangeCallback) {
            this.selectionChangeCallback(selectedObjects);
        }

        // Notify active tool
        const toolController = this.getToolController();
        const currentTool = toolController?.getActiveTool();
        if (currentTool?.onSelectionChange) {
            currentTool.onSelectionChange(selectedObjects);
        }
    }

    // Configuration updates
    refreshSelectionVisualization() {
        // Refresh visualization for all currently selected objects
        // MaterialManager has already updated the materials, now we need to force visual refresh
        const selectedObjects = Array.from(this.selectedObjects);

        if (this.visualizationManager && selectedObjects.length > 0) {
            selectedObjects.forEach(object => {
                // Force refresh by toggling state: normal -> selected
                // This ensures new material properties are applied to visible wireframes
                this.visualizationManager.setState(object, 'normal');
                this.visualizationManager.setState(object, 'selected');
            });
        }
    }

    getStats() {
        return {
            selectedCount: this.selectedObjects.size
        };
    }

    destroy() {
        this.clearSelection();
        this.selectionChangeCallback = null;

        if (this.visualizationManager) {
            this.visualizationManager.destroy();
        }
    }

    // ====== OBJECT INTERACTION METHODS (moved from BaseSelectionBehavior) ======

    /**
     * Handle clicking on an object - main selection entry point for tools
     */
    handleObjectClick(object, event) {
        if (!object || !this.isSelectableObject(object)) {
            this.handleEmptySpaceClick(event);
            return false;
        }

        const objectData = this.getObjectData(object);
        if (!objectData) return false;

        // Prevent direct container clicks (except when already inside that container, already selected, or multi-selecting)
        if (objectData.isContainer) {
            const isInContext = this.isInContainerContext();
            const currentContext = this.getContainerContext();
            const isAlreadySelected = this.selectedObjects.has(objectData.mesh);
            const isMultiSelect = event.ctrlKey || event.metaKey || event.shiftKey;

            // Only treat as empty space if NOT in context, NOT in current context, NOT already selected, AND NOT multi-selecting
            if (!isInContext || currentContext !== objectData.mesh) {
                if (!isAlreadySelected && !isMultiSelect) {
                    this.handleEmptySpaceClick(event);
                    return false;
                }
                // If already selected, continue to handle the click normally (keeps selection)
            }
        }

        // Resolve selection target using centralized logic
        const { target } = this.resolveSelectionTarget(object);

        // Track child click for double-click detection
        if (target !== object) {
            this.lastClickedChildObject = object;
            this.lastClickTime = Date.now();
        } else if (objectData.isContainer) {
            this.lastClickTime = Date.now();
        } else {
            this.lastClickedChildObject = null;
        }

        // Handle multi-selection
        const isMultiSelect = event.ctrlKey || event.metaKey || event.shiftKey;

        if (isMultiSelect) {
            this.toggle(target);
        } else {
            // Skip if clicking the same already-selected object (prevents UI flicker)
            const isSameObjectAlreadySelected =
                this.selectedObjects.size === 1 &&
                this.selectedObjects.has(target);

            if (!isSameObjectAlreadySelected) {
                this.clearSelection();
                this.select(target, { skipResolution: true });
            }
        }

        return true;
    }

    /**
     * Handle double-click events - step into container functionality
     */
    handleDoubleClick(hit, event) {
        const navigationController = this.getNavigationController();
        if (navigationController) {
            return navigationController.handleDoubleClick(hit?.object, event);
        }

        // Fallback - should rarely execute since NavigationController should always be available
        if (!hit?.object) return false;

        const objectData = this.getObjectData(hit.object);
        if (!objectData) return false;

        // For double-clicks, just select the object if NavigationController is unavailable
        this.clearSelection();
        this.select(hit.object);
        return true;
    }

    /**
     * Handle clicking on empty space or non-selectable objects
     */
    handleEmptySpaceClick(event) {
        const navigationController = this.getNavigationController();
        if (navigationController) {
            navigationController.handleEmptySpaceClick(event);
        } else {
            // Fallback: clear selection unless multi-select is active
            const isMultiSelect = event.ctrlKey || event.metaKey || event.shiftKey;
            if (!isMultiSelect) {
                this.clearSelection();
            }
        }
    }


    /**
     * Check if object is selectable
     */
    isSelectableObject(object) {
        const sceneController = this.getSceneController();
        if (!sceneController) return false;

        const objectData = this.getObjectData(object);

        // Direct match - use object's selectable property
        if (objectData) {
            // System objects (like floor grid) are never selectable
            if (objectData.category === 'system') {
                return false;
            }
            return objectData.selectable === true;
        }

        // Legacy: Check if this is a container interactive mesh
        if (object.userData?.isContainerInteractive) {
            const containerId = object.userData.parentContainer;
            if (containerId) {
                const containerData = sceneController.getObject(containerId);
                return containerData?.selectable === true;
            }
        }

        // Check parent hierarchy (up to 5 levels)
        let currentObject = object.parent;
        let depth = 0;
        while (currentObject && depth < 5) {
            const parentData = this.getObjectData(currentObject);
            if (parentData) {
                return parentData.selectable === true;
            }
            currentObject = currentObject.parent;
            depth++;
        }

        return false;
    }
}

// Export for use in main application
window.SelectionController = SelectionController;