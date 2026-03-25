/**
 * OsmSelectionSync - Selection UI synchronization for ObjectStateManager
 *
 * Extracted from ObjectStateManager to separate UI delivery concerns
 * (callback + store + iframe) from core state management.
 */

class OsmSelectionSync {
    constructor(osm) {
        this.osm = osm;
        this._cache = null;
    }

    /**
     * Invalidate cached selection structures (called when selection changes)
     */
    invalidateCache() {
        this._cache = null;
    }

    /**
     * Refresh selection UI for currently selected objects.
     * Ensures PropertyPanel shows real-time updates during operations like push tool.
     */
    refresh(changedItems) {
        const selectionController = this.osm.getSelectionController();
        if (!selectionController) return;

        // Check if any changed object is currently selected
        const hasSelectedChange = changedItems.some(({ object }) =>
            this.osm.selection.has(object.id)
        );

        if (!hasSelectedChange) return;

        // Get current selection with fresh data FROM SCENECONTROLLER (after updateSceneController has run)
        const selectedMeshes = selectionController.getSelectedObjects?.() || [];
        if (selectedMeshes.length === 0) return;

        // Only rebuild structures for objects that actually changed
        const changedIds = new Set(changedItems.map(({ object }) => object.id));
        const serializedSelection = selectedMeshes.map(mesh => {
            const objectData = this.osm.sceneController?.getObjectByMesh?.(mesh);
            if (!objectData) return null;

            // Reuse cached structure for unchanged objects
            if (!changedIds.has(objectData.id) && this._cache?.has(objectData.id)) {
                return this._cache.get(objectData.id);
            }

            return this.osm.buildObjectStructure(objectData);
        }).filter(Boolean);

        // Cache for next cycle
        this._cache = new Map(serializedSelection.map(s => [s.id, s]));

        if (serializedSelection.length === 0) return;

        // Try callback first (for iframe/indirect mode)
        if (selectionController.selectionChangeCallback) {
            selectionController.selectionChangeCallback(serializedSelection);
        }

        // Direct store update (for direct mode)
        const syncFunction = window.syncSelectionFromThreeJS;
        if (syncFunction && typeof syncFunction === 'function') {
            syncFunction(serializedSelection);
        }

        // Iframe postMessage fallback (needed for cross-origin iframe mode during drag)
        const simpleCommunication = window.simpleCommunication;
        if (simpleCommunication) {
            simpleCommunication.sendToAllIframes({
                type: 'selection-changed',
                data: {
                    selectedObjectIds: serializedSelection.map(obj => obj.id),
                    selectedObjects: serializedSelection,
                    containerContext: null
                }
            });
        }
    }
}

window.OsmSelectionSync = OsmSelectionSync;
