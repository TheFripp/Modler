/**
 * Measure Tool Adapter
 * Wraps MeasurementTool as a registered toolbar tool with keyboard shortcut (M)
 * When active, measurements show on hover without needing Alt key
 * Measurements persist when mouse leaves object, allowing click on label to input values
 * Extends BaseTool — onDoubleClick, hasActiveHighlight, activate inherited
 */

class MeasureToolAdapter extends BaseTool {
    deactivate() {
        this.measurementTool?.clearMeasurement();
    }

    onHover(hit) {
        if (!this.measurementTool) return;

        if (!hit) {
            // Persist measurement when mouse leaves object geometry
            // Allows user to move mouse to the label and click it
            return;
        }

        const selectedObjects = this.selectionController?.getSelectedObjects() || [];
        this.measurementTool.onHover(hit, selectedObjects);
    }

    onClick(hit, event) {
        // Check if clicking on the measurement label
        if (this.measurementTool?.currentMeasurement) {
            if (this.inputController && this.measurementTool.isMouseNearLabel(this.inputController.mouse)) {
                this.focusMeasuredProperty();
                return;
            }
        }

        // Normal click behavior — clear measurement on empty space click
        if (!hit?.object) {
            this.measurementTool?.clearMeasurement();
        }
        super.onClick(hit, event);
    }

    /**
     * Focus the property panel input for the currently measured dimension
     */
    focusMeasuredProperty() {
        const object = this.measurementTool.currentObject;
        const axis = this.measurementTool.currentEdgeAxis;
        if (!object || !axis) return;

        const objectData = this.getObjectData(object);
        if (!objectData) return;

        // Select the object if not already selected
        if (!this.selectionController.isSelected(object)) {
            this.selectionController.handleObjectClick(object, null);
        }

        // Focus the dimension input in the property panel
        const keyboardRouter = window.modlerComponents?.keyboardRouter;
        if (keyboardRouter) {
            keyboardRouter.notifyPropertyPanelFocus(objectData.id, `dimensions.${axis}`);
        }
    }
}
window.MeasureToolAdapter = MeasureToolAdapter;
