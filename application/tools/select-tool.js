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
        // Check for measurement mode (Alt key)
        if (isAltPressed) {
            const measurementTool = window.modlerComponents?.measurementTool;
            if (measurementTool) {
                const selectedObjects = this.selectionController?.getSelectedObjects() || [];
                measurementTool.onHover(hit, selectedObjects);
            }
            return;
        }

        // Clear measurement when Alt not pressed
        const measurementTool = window.modlerComponents?.measurementTool;
        if (measurementTool) {
            measurementTool.clearMeasurement();
        }

        // Normal hover behavior
        if (hit && hit.object) {
            // Highlight selectable objects to show they can be interacted with
            const objectData = window.modlerComponents?.sceneController?.getObjectByMesh(hit.object);

            if (objectData && objectData.selectable) {
                // Select tool doesn't show hover highlights - clean selection experience
                this.hoveredObject = hit.object;
                return;
            }
        }

        // Clear highlight if not hovering over selectable object
        if (this.hoveredObject) {
            this.visualEffects.clearHighlight();
            this.hoveredObject = null;
        }
    }
    
    /**
     * Handle mouse click events
     */
    onClick(hit, event) {
        // Use SelectionController directly
        if (hit && hit.object) {
            console.log('🎯 Click hit object:', hit.object.name);
            this.selectionController.handleObjectClick(hit.object, event, { toolType: 'SelectTool' });
        } else {
            console.log('🌌 Click on empty space - clearing selection');
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
            this.visualEffects.clearHighlight();
            this.hoveredObject = null;
        }
    }
}
window.SelectTool = SelectTool;
