// Modler V2 - Unified Visualization Manager
// Coordinates between ObjectVisualizer and ContainerVisualizer
// Provides single API for all visualization needs, auto-delegates to correct visualizer

class VisualizationManager {
    constructor() {
        // Create visualizer instances
        this.objectVisualizer = new ObjectVisualizer();
        this.containerVisualizer = new ContainerVisualizer();

        // State tracking
        this.objectTypes = new Map(); // object -> 'object' | 'container'
        this.activeVisualizer = new Map(); // object -> visualizer instance

        // Batch update management
        this.updateQueue = new Set();
        this.batchTimeout = null;
        this.BATCH_DELAY = 16; // ~60fps
    }

    /**
     * Initialize with ConfigurationManager
     */
    initializeWithConfigurationManager() {
        this.objectVisualizer.initializeWithConfigurationManager();
        this.containerVisualizer.initializeWithConfigurationManager();
    }

    /**
     * Get the appropriate visualizer for an object
     */
    getVisualizerFor(object) {
        // Check cache first
        if (this.activeVisualizer.has(object)) {
            return this.activeVisualizer.get(object);
        }

        // Determine object type
        const sceneController = window.modlerComponents?.sceneController;
        let isContainer = false;

        if (sceneController) {
            const objectData = sceneController.getObjectByMesh(object);
            isContainer = objectData && objectData.isContainer;
        }

        // Select appropriate visualizer
        const visualizer = isContainer ? this.containerVisualizer : this.objectVisualizer;

        // Cache the decision
        this.objectTypes.set(object, isContainer ? 'container' : 'object');
        this.activeVisualizer.set(object, visualizer);

        return visualizer;
    }

    /**
     * Set object visual state (main API method)
     * This replaces all calls to SelectionVisualizer.updateObjectVisual()
     */
    setState(object, state) {
        if (!object) return false;

        const visualizer = this.getVisualizerFor(object);
        return visualizer.setState(object, state);
    }

    /**
     * Batch update multiple objects (for performance)
     */
    batchSetStates(updates) {
        // updates = [{ object, state }, ...]
        const results = [];

        for (const { object, state } of updates) {
            results.push(this.setState(object, state));
        }

        return results;
    }

    /**
     * Show face highlight for tools (unified API)
     */
    showFaceHighlight(object, face, color = null) {
        const visualizer = this.getVisualizerFor(object);
        return visualizer.showFaceHighlight(object, face, color);
    }

    /**
     * Hide face highlight
     */
    hideFaceHighlight(object, face) {
        const visualizer = this.getVisualizerFor(object);
        return visualizer.hideFaceHighlight(object, face);
    }

    /**
     * Update object transform (position, rotation, scale)
     */
    updateTransform(object) {
        const visualizer = this.getVisualizerFor(object);
        return visualizer.updateTransform(object);
    }

    /**
     * Update object geometry (after push tool, dimension changes, etc.)
     */
    updateGeometry(object) {
        const visualizer = this.getVisualizerFor(object);
        return visualizer.updateGeometry(object);
    }

    /**
     * Get current state of object
     */
    getState(object) {
        const visualizer = this.getVisualizerFor(object);
        return visualizer.getState(object);
    }

    /**
     * Check if object is in specific state
     */
    isInState(object, state) {
        const visualizer = this.getVisualizerFor(object);
        return visualizer.isInState(object, state);
    }

    // Container-specific methods (delegate to ContainerVisualizer)

    // REMOVED: Container navigation methods - NavigationController is the single authority
    // VisualizationManager focuses solely on visual state management, not navigation
    // Use NavigationController directly for all container navigation needs

    /**
     * Check if currently in container context - delegate to NavigationController
     */
    isInContainerContext() {
        const navigationController = window.modlerComponents?.navigationController;
        return navigationController ? navigationController.isInContainerContext() : false;
    }

    /**
     * Get current container context - delegate to NavigationController
     */
    getContainerContext() {
        const navigationController = window.modlerComponents?.navigationController;
        return navigationController ? navigationController.getCurrentContainer()?.mesh : null;
    }

    // Legacy compatibility methods (for easier transition)

    /**
     * Legacy compatibility: updateObjectVisual -> setState
     */
    updateObjectVisual(object, isSelected) {
        const state = isSelected ? 'selected' : 'normal';
        return this.setState(object, state);
    }

    /**
     * Legacy compatibility: createEdgeHighlight -> setState('selected')
     */
    createEdgeHighlight(object) {
        return this.setState(object, 'selected');
    }

    /**
     * Legacy compatibility: removeEdgeHighlight -> setState('normal')
     */
    removeEdgeHighlight(object) {
        return this.setState(object, 'normal');
    }

    /**
     * Legacy compatibility: showContainerWireframe
     */
    showContainerWireframe(object) {
        return this.setState(object, 'selected');
    }

    /**
     * Legacy compatibility: hideContainerWireframe
     */
    hideContainerWireframe(object) {
        return this.setState(object, 'normal');
    }

    // Performance optimization methods

    /**
     * Queue object for batched update
     */
    queueUpdate(object, state) {
        this.updateQueue.add({ object, state });

        // Debounce batch processing
        if (this.batchTimeout) {
            clearTimeout(this.batchTimeout);
        }

        this.batchTimeout = setTimeout(() => {
            this.processBatchedUpdates();
        }, this.BATCH_DELAY);
    }

    /**
     * Process batched updates
     */
    processBatchedUpdates() {
        const updates = Array.from(this.updateQueue);
        this.updateQueue.clear();
        this.batchTimeout = null;

        // Group updates by visualizer for efficiency
        const objectUpdates = [];
        const containerUpdates = [];

        for (const { object, state } of updates) {
            const type = this.objectTypes.get(object);
            if (type === 'container') {
                containerUpdates.push({ object, state });
            } else {
                objectUpdates.push({ object, state });
            }
        }

        // Process updates by visualizer
        if (objectUpdates.length > 0) {
            for (const { object, state } of objectUpdates) {
                this.objectVisualizer.setState(object, state);
            }
        }

        if (containerUpdates.length > 0) {
            for (const { object, state } of containerUpdates) {
                this.containerVisualizer.setState(object, state);
            }
        }
    }

    // Special state management for complex scenarios

    /**
     * Handle container selection in container context
     * Resolves the original issue of container wireframes not showing when stepped into
     */
    handleContainerContextSelection(object, isSelected) {
        const isContainer = this.objectTypes.get(object) === 'container';
        const isInContext = this.isInContainerContext();
        const currentContext = this.getContainerContext();

        if (isContainer && isInContext && currentContext === object) {
            // Selecting same container we're stepped into
            const state = isSelected ? 'selected-in-context' : 'context';
            return this.setState(object, state);
        } else {
            // Normal selection logic
            const state = isSelected ? 'selected' : 'normal';
            return this.setState(object, state);
        }
    }

    /**
     * Multi-selection state management
     */
    setMultiSelection(objects, selectedObjects) {
        const updates = [];

        // Set all objects to normal first
        for (const object of objects) {
            if (!selectedObjects.has(object)) {
                updates.push({ object, state: 'normal' });
            }
        }

        // Set selected objects to multi-selected or selected
        const selectedArray = Array.from(selectedObjects);
        for (let i = 0; i < selectedArray.length; i++) {
            const object = selectedArray[i];
            const state = selectedArray.length > 1 ? 'multi-selected' : 'selected';
            updates.push({ object, state });
        }

        return this.batchSetStates(updates);
    }

    /**
     * Tool-specific highlighting (push tool, move tool, etc.)
     */
    setToolHighlight(object, toolName, isActive) {
        // For now, delegate to face highlighting
        // Future: Could have tool-specific states like 'push-hover', 'move-drag', etc.
        if (isActive) {
            // Tool-specific highlighting logic would go here
            return this.setState(object, 'hovered');
        } else {
            // Restore to previous state
            const currentState = this.getState(object);
            if (currentState === 'hovered') {
                return this.setState(object, 'normal');
            }
        }
    }

    // Cleanup and lifecycle methods

    /**
     * Clean up all visualizations for an object
     */
    cleanup(object) {
        const visualizer = this.activeVisualizer.get(object);
        if (visualizer) {
            visualizer.cleanup(object);
        }

        // Remove from caches
        this.objectTypes.delete(object);
        this.activeVisualizer.delete(object);

        // Remove from update queue
        this.updateQueue = new Set(
            Array.from(this.updateQueue).filter(update => update.object !== object)
        );
    }

    /**
     * Destroy manager and clean up all resources
     */
    destroy() {
        // Clear any pending batch updates
        if (this.batchTimeout) {
            clearTimeout(this.batchTimeout);
            this.batchTimeout = null;
        }

        // Destroy visualizers
        this.objectVisualizer.destroy();
        this.containerVisualizer.destroy();

        // Clear caches
        this.objectTypes.clear();
        this.activeVisualizer.clear();
        this.updateQueue.clear();
    }

    // Debug and introspection methods

    /**
     * Get visualization statistics
     */
    getStats() {
        return {
            totalObjects: this.objectTypes.size,
            containers: Array.from(this.objectTypes.values()).filter(type => type === 'container').length,
            objects: Array.from(this.objectTypes.values()).filter(type => type === 'object').length,
            queuedUpdates: this.updateQueue.size,
            isInContainerContext: this.isInContainerContext(),
            containerContext: this.getContainerContext()?.name || null
        };
    }

    /**
     * Get all objects in specific state
     */
    getObjectsInState(state) {
        const result = [];

        for (const [object, visualizer] of this.activeVisualizer) {
            if (visualizer.isInState(object, state)) {
                result.push(object);
            }
        }

        return result;
    }

    /**
     * Debug: log current state of all tracked objects
     */
    debugLogStates() {
        console.group('VisualizationManager States');

        for (const [object, type] of this.objectTypes) {
            const visualizer = this.activeVisualizer.get(object);
            const state = visualizer ? visualizer.getState(object) : 'unknown';
            console.log(`${object.name || 'unnamed'} (${type}): ${state}`);
        }

        console.log('Container context:', this.getContainerContext()?.name || 'none');
        console.groupEnd();
    }
}

// Export for use in application
window.VisualizationManager = VisualizationManager;