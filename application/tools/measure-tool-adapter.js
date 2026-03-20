/**
 * Measure Tool Adapter
 * Wraps MeasurementTool as a registered toolbar tool with keyboard shortcut (M)
 * When active, measurements show on hover without needing Alt key
 * Measurements persist when mouse leaves object, allowing click on label to input values
 */

class MeasureToolAdapter {
    constructor(selectionController, visualEffects) {
        this.selectionController = selectionController;
        this.visualEffects = visualEffects;
    }

    activate() {
        // No special activation needed
    }

    deactivate() {
        const measurementTool = window.modlerComponents?.measurementTool;
        if (measurementTool) {
            measurementTool.clearMeasurement();
        }
    }

    onHover(hit) {
        const measurementTool = window.modlerComponents?.measurementTool;
        if (!measurementTool) return;

        if (!hit) {
            // Persist measurement when mouse leaves object geometry
            // Allows user to move mouse to the label and click it
            return;
        }

        const selectedObjects = this.selectionController?.getSelectedObjects() || [];
        measurementTool.onHover(hit, selectedObjects);
    }

    onClick(hit, event) {
        const measurementTool = window.modlerComponents?.measurementTool;

        // Check if clicking on the measurement label
        if (measurementTool && measurementTool.currentMeasurement) {
            const inputController = window.modlerComponents?.inputController;
            if (inputController && measurementTool.isMouseNearLabel(inputController.mouse)) {
                this.focusMeasuredProperty(measurementTool);
                return;
            }
        }

        // Normal click behavior
        if (hit && hit.object) {
            this.selectionController.handleObjectClick(hit.object, event);
        } else {
            // Clicking empty space: clear measurement and deselect
            if (measurementTool) {
                measurementTool.clearMeasurement();
            }
            this.selectionController.handleEmptySpaceClick(event);
        }
    }

    /**
     * Focus the property panel input for the currently measured dimension
     */
    focusMeasuredProperty(measurementTool) {
        const object = measurementTool.currentObject;
        const axis = measurementTool.currentEdgeAxis;
        if (!object || !axis) return;

        const sceneController = window.modlerComponents?.sceneController;
        if (!sceneController) return;

        const objectData = sceneController.getObjectByMesh(object);
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

    onDoubleClick(hit, event) {
        this.selectionController.handleDoubleClick(hit, event);
    }

    hasActiveHighlight() {
        return false;
    }
}
window.MeasureToolAdapter = MeasureToolAdapter;
