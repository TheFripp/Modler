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
        this.selectionVisualizer = null;
        this.containerContextManager = null;

    }

    /**
     * Initialize with dependent components
     */
    initialize(selectionVisualizer, containerContextManager) {
        this.selectionVisualizer = selectionVisualizer;
        this.containerContextManager = containerContextManager;
    }

    // Core selection methods
    select(object) {
        if (!object) return false;

        this.selectedObjects.add(object);
        this.addToHistory('select', object);

        // Delegate visual updates to SelectionVisualizer
        if (this.selectionVisualizer) {
            this.selectionVisualizer.updateObjectVisual(object, true);
        }

        // Update property panel with the selected object
        if (window.updatePropertyPanelFromObject) {
            window.updatePropertyPanelFromObject(object);
        }

        // Update object list selection with all currently selected objects
        if (window.updateObjectListSelection) {
            const allSelectedNames = Array.from(this.selectedObjects).map(obj => obj.name);
            window.updateObjectListSelection(allSelectedNames);
        }

        // Notify tools about selection change
        this.notifySelectionChange();

        return true;
    }

    deselect(object) {
        if (!object || !this.selectedObjects.has(object)) return false;

        this.selectedObjects.delete(object);
        this.addToHistory('deselect', object);

        // Delegate visual updates to SelectionVisualizer
        if (this.selectionVisualizer) {
            this.selectionVisualizer.updateObjectVisual(object, false);
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
        // Update object list selection with current selection
        if (window.updateObjectListSelection) {
            const allSelectedNames = Array.from(this.selectedObjects).map(obj => obj.name);
            window.updateObjectListSelection(allSelectedNames);
        }

        if (this.selectedObjects.size === 0) {
            // No selection - clear property panel
            if (window.clearPropertyPanel) {
                window.clearPropertyPanel();
            }
        } else {
            // Show properties for the most recently selected object
            const lastSelected = Array.from(this.selectedObjects)[this.selectedObjects.size - 1];
            if (window.updatePropertyPanelFromObject) {
                window.updatePropertyPanelFromObject(lastSelected);
            }
        }
    }

    clearSelection(reason = 'normal') {
        const objectsToDeselect = Array.from(this.selectedObjects);

        // CLICK TRACING: Log selection clearing
        console.log(`[CLICK TRACE] clearSelection called with reason: '${reason}'`, {
            isInContainerContext: this.isInContainerContext(),
            containerContext: this.getContainerContext()?.name || 'none',
            selectedCount: objectsToDeselect.length
        });

        // Delegate container context handling to ContainerContextManager
        if (this.containerContextManager) {
            this.containerContextManager.handleSelectionClear(reason);
        }

        // Deselect all currently selected objects
        objectsToDeselect.forEach(object => {
            // Delegate visual updates to SelectionVisualizer
            if (this.selectionVisualizer) {
                this.selectionVisualizer.updateObjectVisual(object, false);
            }
        });

        this.selectedObjects.clear();
        this.addToHistory('clear', null);

        // Update property panel to show no selection
        if (window.updatePropertyPanelFromObject) {
            window.updatePropertyPanelFromObject(null);
        }

        // Update object list selection to show no selection
        if (window.updateObjectListSelection) {
            window.updateObjectListSelection([]);
        }

        // Notify tools about selection change
        this.notifySelectionChange();

        return objectsToDeselect.length;
    }

    // Container context delegation
    stepIntoContainer(containerObject) {
        if (this.containerContextManager) {
            this.containerContextManager.stepIntoContainer(containerObject);
        }
    }

    stepOutOfContainer() {
        if (this.containerContextManager) {
            this.containerContextManager.stepOutOfContainer();
        }
    }

    isInContainerContext() {
        return this.containerContextManager ? this.containerContextManager.isInContainerContext() : false;
    }

    getContainerContext() {
        return this.containerContextManager ? this.containerContextManager.getContainerContext() : null;
    }

    updateContainerEdgeHighlight() {
        if (this.containerContextManager) {
            this.containerContextManager.updateContainerEdgeHighlight();
        }
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



    // Wireframe synchronization (delegates to MeshSynchronizer)
    updateSelectionWireframe(object) {
        if (!object) return;

        // Delegate to MeshSynchronizer for centralized mesh coordination
        const meshSynchronizer = window.modlerComponents?.meshSynchronizer;
        if (meshSynchronizer) {
            meshSynchronizer.syncAllRelatedMeshes(object, 'transform');
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

        // Notify registered callback
        if (this.selectionChangeCallback) {
            this.selectionChangeCallback(selectedObjects);
        }

        // Notify active tool about selection change
        const toolController = window.modlerComponents?.toolController;
        if (toolController) {
            const currentTool = toolController.getActiveTool();
            if (currentTool && currentTool.onSelectionChange) {
                currentTool.onSelectionChange(selectedObjects);
            }
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
        if (this.selectionVisualizer) {
            this.selectionVisualizer.destroy();
        }
        if (this.containerContextManager) {
            this.containerContextManager.destroy();
        }

    }
}

// Export for use in main application
window.SelectionController = SelectionController;