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

        // State tracking only — batch queue removed (was unused)
    }

    /**
     * Initialize with ConfigurationManager
     */
    initializeWithConfigurationManager() {
        this.objectVisualizer.initializeWithConfigurationManager();
        this.containerVisualizer.initializeWithConfigurationManager();
    }

    // ====== COMPONENT GETTERS (reduce repeated lookups) ======

    getSceneController() {
        return window.modlerComponents?.sceneController;
    }

    getNavigationController() {
        return window.modlerComponents?.navigationController;
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
        const sceneController = this.getSceneController();
        const objectData = sceneController?.getObjectByMesh(object);
        const isContainer = objectData?.isContainer ?? false;

        // Select appropriate visualizer
        const visualizer = isContainer ? this.containerVisualizer : this.objectVisualizer;

        // Cache the decision
        this.objectTypes.set(object, isContainer ? 'container' : 'object');
        this.activeVisualizer.set(object, visualizer);

        return visualizer;
    }

    /**
     * Set object visual state (main API method)
     * Enforces state priority: selected/multi-selected > context > hovered > normal
     */
    setState(object, state) {
        if (!object) return false;

        // State priority guard: don't downgrade selected/multi-selected to hovered
        const visualizer = this.getVisualizerFor(object);
        if (state === 'hovered') {
            const currentState = visualizer.getState(object);
            if (currentState === 'selected' || currentState === 'multi-selected' ||
                currentState === 'context' || currentState === 'selected-in-context') {
                return true; // Keep higher-priority state
            }
        }

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

    // Container-specific methods (delegate to NavigationController)

    isInContainerContext() {
        const navigationController = this.getNavigationController();
        return navigationController?.isInContainerContext() ?? false;
    }

    getContainerContext() {
        const navigationController = this.getNavigationController();
        return navigationController?.getCurrentContainer()?.mesh ?? null;
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
    setToolHighlight(object, isActive) {
        // For now, delegate to hover state
        // Future: Could have tool-specific states like 'push-hover', 'move-drag', etc.
        if (isActive) {
            return this.setState(object, 'hovered');
        } else {
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
    }

    /**
     * Destroy manager and clean up all resources
     */
    destroy() {
        // Destroy visualizers
        this.objectVisualizer.destroy();
        this.containerVisualizer.destroy();

        // Clear caches
        this.objectTypes.clear();
        this.activeVisualizer.clear();
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

}

// Export for use in application
window.VisualizationManager = VisualizationManager;