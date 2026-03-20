/**
 * Select Tool
 * Handles object selection using SelectionController directly
 * Extends BaseTool — onClick, onDoubleClick, hasActiveHighlight, activate, deactivate inherited
 */

class SelectTool extends BaseTool {
    /**
     * Handle mouse hover events - show object highlighting for interaction feedback
     */
    onHover(hit, isAltPressed) {
        if (this.handleMeasurementMode(isAltPressed, hit)) return;

        if (hit && hit.object) {
            const objectData = this.getObjectData(hit.object);

            if (objectData && objectData.selectable) {
                // Clear previous hover if switching to a different object
                if (this.hoveredObject && this.hoveredObject !== hit.object) {
                    if (!this.selectionController.isSelected(this.hoveredObject)) {
                        this.visualizationManager?.setState(this.hoveredObject, 'normal');
                    }
                }

                // Show hover highlight if not already selected
                if (!this.selectionController.isSelected(hit.object)) {
                    this.visualizationManager?.setState(hit.object, 'hovered');
                }

                // Emit hover change only when hovered object changes
                if (this.hoveredObject !== hit.object) {
                    this.emitHoverChange(objectData?.id || null);
                }
                this.hoveredObject = hit.object;
                return;
            }
        }

        // Clear hover when not over a selectable object
        this.clearHover();
    }
}
window.SelectTool = SelectTool;
