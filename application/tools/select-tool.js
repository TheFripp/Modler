/**
 * Select Tool
 * Handles object selection using shared selection behavior
 * Target: ~50 lines - delegates to BaseSelectionBehavior
 */

class SelectTool {
    constructor(selectionController, visualEffects) {
        this.selectionController = selectionController;
        this.visualEffects = visualEffects;
        
        // Use shared selection behavior for consistency
        this.selectionBehavior = new BaseSelectionBehavior(selectionController);
        
        this.hoveredObject = null;
    }
    
    /**
     * Handle mouse hover events - show object highlighting for interaction feedback
     */
    onHover(hit) {
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
        // Delegate to shared selection behavior
        if (hit && hit.object) {
            this.selectionBehavior.handleObjectClick(hit.object, event);
        } else {
            this.selectionBehavior.handleEmptySpaceClick(event);
        }
    }
    
    
    /**
     * Handle double-click events - delegate to shared behavior
     */
    onDoubleClick(hit, event) {
        // Delegate to shared selection behavior
        this.selectionBehavior.handleDoubleClick(hit, event);
    }
    
    /**
     * Check if tool has an active highlight (for camera/tool coordination)
     */
    hasActiveHighlight() {
        return this.hoveredObject !== null;
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