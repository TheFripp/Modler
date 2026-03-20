/**
 * Select Tool
 * Handles object selection using SelectionController directly
 * Target: ~50 lines - clean architecture with direct controller access
 */

class SelectTool {
    constructor(selectionController, visualEffects) {
        this.selectionController = selectionController;
        this.visualEffects = visualEffects;
        
        // Use SelectionController directly for clean architecture
        
        this.hoveredObject = null;
    }
    
    /**
     * Handle mouse hover events - show object highlighting for interaction feedback
     */
    onHover(hit, isAltPressed) {
        // Handle Alt-key measurement mode
        if (MovementUtils.handleMeasurementMode(isAltPressed, hit, this.selectionController)) return;

        const visualizationManager = window.modlerComponents?.visualizationManager;

        if (hit && hit.object) {
            const objectData = window.modlerComponents?.sceneController?.getObjectByMesh(hit.object);

            if (objectData && objectData.selectable) {
                // Clear previous hover if switching to a different object
                if (this.hoveredObject && this.hoveredObject !== hit.object) {
                    if (!this.selectionController.isSelected(this.hoveredObject)) {
                        visualizationManager?.setState(this.hoveredObject, 'normal');
                    }
                }

                // Show hover highlight if not already selected
                if (!this.selectionController.isSelected(hit.object)) {
                    visualizationManager?.setState(hit.object, 'hovered');
                }

                this.hoveredObject = hit.object;
                return;
            }
        }

        // Clear hover when not over a selectable object
        if (this.hoveredObject) {
            if (!this.selectionController.isSelected(this.hoveredObject)) {
                visualizationManager?.setState(this.hoveredObject, 'normal');
            }
            this.hoveredObject = null;
        }
    }
    
    /**
     * Handle mouse click events
     */
    onClick(hit, event) {
        if (hit && hit.object) {
            this.selectionController.handleObjectClick(hit.object, event);
        } else {
            this.selectionController.handleEmptySpaceClick(event);
        }
    }
    
    
    /**
     * Handle double-click events
     */
    onDoubleClick(hit, event) {
        // Use SelectionController directly
        this.selectionController.handleDoubleClick(hit, event);
    }
    
    /**
     * Check if tool has an active highlight (for camera/tool coordination)
     * Select tool should NOT block camera orbit - it only handles clicks, not drags
     */
    hasActiveHighlight() {
        return false; // Select tool never blocks camera orbit
    }
    
    /**
     * Tool activation wrapper for ToolController compatibility
     */
    activate() {
        // No special activation needed for select tool
    }

    /**
     * Tool deactivation wrapper for ToolController compatibility
     */
    deactivate() {
        this.onToolDeactivate();
    }

    /**
     * Tool deactivation cleanup
     */
    onToolDeactivate() {
        if (this.hoveredObject) {
            const visualizationManager = window.modlerComponents?.visualizationManager;
            if (visualizationManager && !this.selectionController.isSelected(this.hoveredObject)) {
                visualizationManager.setState(this.hoveredObject, 'normal');
            }
            this.hoveredObject = null;
        }
    }
}
window.SelectTool = SelectTool;
