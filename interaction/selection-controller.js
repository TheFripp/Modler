// Modler V2 - Core Selection State Management
// Handles selection state only - visual effects delegated to SelectionVisualizer
// Target: ~150 lines - streamlined from 793 lines

class SelectionController {
    constructor() {
        // Core selection state
        this.selectedObjects = new Set();
        this.selectionHistory = [];
        this.maxHistorySize = 10;

        // Component references (set during initialization)
        this.visualizationManager = null;
        // containerContextManager removed - NavigationController handles all container context

        // Double-click tracking for container step-in (moved from BaseSelectionBehavior)
        this.lastClickedChildObject = null;
        this.lastClickTime = 0;

    }

    /**
     * Initialize with dependent components
     */
    initialize(visualizationManager) {
        this.visualizationManager = visualizationManager;
        // containerContextManager removed - NavigationController handles all container context
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
     * Resolve target object for selection based on container-first logic
     * Returns { targetObject, shouldNavigate }
     */
    resolveSelectionTarget(object) {
        const objectData = this.getObjectData(object);
        if (!objectData) return { targetObject: object, shouldNavigate: false };

        const isInContainerContext = this.isInContainerContext();
        const currentContainerContext = this.getContainerContext();

        // In container context - check if object is part of current container
        if (isInContainerContext && currentContainerContext && objectData) {
            const isPartOfCurrentContainer = this.isObjectPartOfContainer(objectData, currentContainerContext);

            if (isPartOfCurrentContainer) {
                // Direct selection within current container
                return { targetObject: object, shouldNavigate: false };
            } else {
                // Object outside current container - navigate up first
                const navigationController = this.getNavigationController();
                if (navigationController) {
                    navigationController.navigateUp();
                }
                // Then select directly
                return { targetObject: object, shouldNavigate: false };
            }
        }

        // Not in container context - apply container-first logic
        if (objectData.parentContainer) {
            const parentContainer = this.getParentContainer(objectData);
            if (parentContainer?.mesh) {
                // Regular containers: Select parent container instead of child
                return { targetObject: parentContainer.mesh, shouldNavigate: false };
            }
        }

        // Default: direct selection
        return { targetObject: object, shouldNavigate: false };
    }

    // Core selection methods
    select(object, options = {}) {
        if (!object) return false;

        const sceneController = this.getSceneController();
        if (!sceneController) {
            console.warn('⚠️ SceneController not available');
            return false;
        }

        // Resolve which object to actually select (container-first logic)
        // Skip container-first logic if this is a direct selection from UI
        let targetObject, shouldNavigate;

        if (options.direct) {
            targetObject = object;
            shouldNavigate = false;

            // If directly selecting a child object from UI, step into parent container
            const objectData = this.getObjectData(object);
            if (objectData && objectData.parentContainer) {
                const navigationController = this.getNavigationController();
                if (navigationController) {
                    navigationController.navigateToContainer(objectData.parentContainer);
                }
            }
        } else {
            const resolved = this.resolveSelectionTarget(object);
            targetObject = resolved.targetObject;
            shouldNavigate = resolved.shouldNavigate;
        }

        // Add to selection
        this.selectedObjects.add(targetObject);
        this.addToHistory('select', targetObject);

        // Handle navigation if needed (for container double-clicks)
        if (shouldNavigate) {
            const navigationController = this.getNavigationController();
            const objectData = this.getObjectData(targetObject);
            if (navigationController && objectData) {
                navigationController.navigateToContainer(objectData.id);
                return true; // NavigationController handles visual updates
            }
        }

        // Update visualization
        if (this.visualizationManager) {
            this.visualizationManager.setState(targetObject, 'selected');
        }

        // Notify about selection change
        this.notifySelectionChange();

        return true;
    }

    deselect(object) {
        if (!object || !this.selectedObjects.has(object)) return false;

        this.selectedObjects.delete(object);
        this.addToHistory('deselect', object);

        // Delegate visual updates to VisualizationManager
        if (this.visualizationManager) {
            this.visualizationManager.setState(object, 'normal');
        }

        return true;
    }

    toggle(object) {
        if (this.isSelected(object)) {
            const result = this.deselect(object);
            // After deselecting, update property panel with remaining selection or clear
            this.updatePropertyPanelForCurrentSelection();
            return result;
        } else {
            return this.select(object);
        }
    }

    updatePropertyPanelForCurrentSelection() {
        // Legacy method - functionality moved to unified ObjectEventBus communication
        // All panel updates now handled by notifySelectionChange() → ObjectEventBus → PropertyPanelSync
        this.notifySelectionChange();
    }

    clearSelection() {
        const objectsToDeselect = Array.from(this.selectedObjects);

        // Update visualization for all deselected objects
        if (this.visualizationManager) {
            objectsToDeselect.forEach(object => {
                this.visualizationManager.setState(object, 'normal');
            });
        }

        this.selectedObjects.clear();
        this.addToHistory('clear', null);
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


    // Selection history
    addToHistory(action, object) {
        const historyEntry = {
            action: action,
            object: object,
            objectName: object ? (object.name || 'unnamed') : null,
            timestamp: Date.now(),
            selectionCount: this.selectedObjects.size
        };

        this.selectionHistory.push(historyEntry);

        // Keep history size manageable
        if (this.selectionHistory.length > this.maxHistorySize) {
            this.selectionHistory.shift();
        }
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


        // Phase 3: Emit consolidated selection event for UI panels (MainAdapter → UIAdapter)
        // This is the PRIMARY event for Phase 3 communication architecture
        if (window.objectEventBus) {
            window.objectEventBus.emit(
                window.objectEventBus.EVENT_TYPES?.SELECTION || 'object:selection',
                null, // No single objectId - this is a multi-object selection event
                {
                    selected: selectedObjectIds.length > 0, // Overall selection state
                    selectedObjectIds: selectedObjectIds,   // All selected IDs for UI
                    selectionCount: selectedObjectIds.length,
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

    // Statistics
    getStats() {
        return {
            selectedCount: this.selectedObjects.size,
            historyEntries: this.selectionHistory.length,
            lastAction: this.selectionHistory.length > 0 ? this.selectionHistory[this.selectionHistory.length - 1] : null
        };
    }

    // Cleanup
    destroy() {
        this.clearSelection();
        this.selectionHistory = [];
        this.selectionChangeCallback = null;

        // Clean up dependent components
        if (this.visualizationManager) {
            this.visualizationManager.destroy();
        }
        // containerContextManager removed - managed by NavigationController

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

        // Prevent direct container clicks (except when already inside that container)
        if (objectData.isContainer) {
            const isInContext = this.isInContainerContext();
            const currentContext = this.getContainerContext();

            if (!isInContext || currentContext !== objectData.mesh) {
                this.handleEmptySpaceClick(event);
                return false;
            }
        }

        // Determine selection target and update click tracking
        let targetObject = object;

        if (objectData.parentContainer) {
            const parentContainer = this.getParentContainer(objectData);
            const isInContext = this.isInContainerContext();
            const currentContext = this.getContainerContext();

            if (parentContainer?.mesh) {
                if (isInContext && currentContext === parentContainer.mesh) {
                    // In container - select child directly
                    this.lastClickedChildObject = object;
                    this.lastClickTime = Date.now();
                } else {
                    // Not in container - container-first logic
                    this.lastClickedChildObject = object;
                    this.lastClickTime = Date.now();
                    targetObject = parentContainer.mesh;
                }
            }
        } else if (objectData.isContainer) {
            this.lastClickTime = Date.now();
        } else {
            this.lastClickedChildObject = null;
        }

        // Handle multi-selection
        const isMultiSelect = event.ctrlKey || event.metaKey || event.shiftKey;

        if (isMultiSelect) {
            this.toggle(targetObject);
        } else {
            // CRITICAL: Check if clicking the same object that's already the only selection
            // Prevents UI flickering when clicking already-selected object
            const isSameObjectAlreadySelected =
                this.selectedObjects.size === 1 &&
                this.selectedObjects.has(targetObject);

            if (!isSameObjectAlreadySelected) {
                this.clearSelection();
                this.select(targetObject);
            }
            // If same object already selected, do nothing (no clear, no select, no events)
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
            const isMultiSelect = event.ctrlKey || event.metaKey;
            if (!isMultiSelect) {
                this.clearSelection();
            }
        }
    }


    /**
     * Check if an object is a DIRECT child of the current container context
     */
    isDirectChildOfCurrentContainer(objectData) {
        if (!objectData) return false;

        const isInContainerContext = this.isInContainerContext();

        // Not in container context - only top-level objects are valid
        if (!isInContainerContext) {
            return !objectData.parentContainer;
        }

        // In container context - check if object's parent matches current container
        const currentContainerContext = this.getContainerContext();
        if (currentContainerContext) {
            const currentContainerData = this.getObjectData(currentContainerContext);
            return objectData.parentContainer === currentContainerData?.id;
        }

        return false;
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