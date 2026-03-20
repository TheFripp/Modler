/**
 * BaseTool - Common tool behavior
 * Provides component access, hover management, default event handlers,
 * lifecycle management, and ToolController-compatible interface.
 * Tools override only what they need.
 */
class BaseTool {
    constructor(selectionController, visualEffects) {
        this.selectionController = selectionController;
        this.visualEffects = visualEffects;
        this.hoveredObject = null;
    }

    // --- Lazy component getters (replaces setTimeout hacks + window.modlerComponents?.X) ---
    get sceneController() { return window.modlerComponents?.sceneController; }
    get objectStateManager() { return window.modlerComponents?.objectStateManager; }
    get visualizationManager() { return window.modlerComponents?.visualizationManager; }
    get historyManager() { return window.modlerComponents?.historyManager; }
    get snapController() { return window.modlerComponents?.snapController; }
    get inputController() { return window.modlerComponents?.inputController; }
    get containerCrudManager() { return window.modlerComponents?.containerCrudManager; }
    get measurementTool() { return window.modlerComponents?.measurementTool; }
    get configurationManager() { return window.modlerComponents?.configurationManager; }

    // --- Default event handlers ---

    onClick(hit, event) {
        if (hit?.object) {
            this.selectionController.handleObjectClick(hit.object, event);
        } else {
            this.selectionController.handleEmptySpaceClick(event);
        }
    }

    onDoubleClick(hit, event) {
        this.selectionController.handleDoubleClick(hit, event);
    }

    onHover(hit, isAltPressed) {}
    onMouseDown(hit, event) { return false; }
    onMouseUp(hit, event) { return false; }
    onMouseMove(hit, event) {}
    onKeyDown(event) { return false; }
    onKeyUp(event) { return false; }

    hasActiveHighlight() { return false; }

    // --- Lifecycle ---

    activate() {}

    deactivate() {
        this.clearHover();
    }

    // --- Standard hover management ---

    clearHover() {
        if (this.hoveredObject) {
            if (!this.selectionController.isSelected(this.hoveredObject)) {
                this.visualizationManager?.setState(this.hoveredObject, 'normal');
            }
            this.hoveredObject = null;
            this.emitHoverChange(null);
        }
    }

    emitHoverChange(objectId) {
        if (window.objectEventBus) {
            window.objectEventBus.emit(window.objectEventBus.EVENT_TYPES.INTERACTION_HOVER, objectId,
                { hoveredObjectId: objectId },
                { immediate: true }
            );
        }
    }

    // --- Helpers ---

    getObjectData(mesh) {
        return this.sceneController?.getObjectByMesh(mesh);
    }

    handleMeasurementMode(isAltPressed, hit) {
        return MovementUtils.handleMeasurementMode(isAltPressed, hit, this.selectionController);
    }
}
window.BaseTool = BaseTool;
