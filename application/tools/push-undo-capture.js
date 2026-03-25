/**
 * PushUndoCapture - Undo state capture logic for PushTool
 *
 * Extracted from PushTool to separate undo bookkeeping from push geometry logic.
 * Captures transition states (hug, fill, gap, tile) and creates PushFaceCommand.
 */

class PushUndoCapture {
    /**
     * Capture final states and register undo command for a push operation.
     * @param {Object} params - Push operation state
     * @param {THREE.Mesh} params.pushedObject - The mesh that was pushed
     * @param {Object} params.initialDimensions - Dimensions before push
     * @param {Object} params.initialPosition - Position before push
     * @param {THREE.Vector3} params.faceNormal - Normal of the pushed face
     * @param {string} params.pushAxis - Axis being pushed ('x', 'y', or 'z')
     * @param {number} params.pushDirection - Direction multiplier (+1 or -1)
     * @param {Object|null} params.hugTransitionState - Hug-to-layout transition state
     * @param {Object|null} params.fillTransitionState - Fill mode transition state
     * @param {Object|null} params.gapTransitionState - Gap adjustment state
     * @param {Object|null} params.tileChildSyncState - Tile child sync state
     * @param {Object} params.sceneController - SceneController reference
     * @param {Object} params.historyManager - HistoryManager reference
     */
    static capture({
        pushedObject, initialDimensions, initialPosition,
        faceNormal, pushAxis, pushDirection,
        hugTransitionState, fillTransitionState, gapTransitionState, tileChildSyncState,
        sceneController, historyManager
    }) {
        if (!historyManager) return;

        const geometryUtils = window.GeometryUtils;
        const finalDimensions = geometryUtils?.getGeometryDimensions(pushedObject.geometry);
        const finalPosition = {
            x: pushedObject.position.x,
            y: pushedObject.position.y,
            z: pushedObject.position.z
        };

        if (!initialDimensions || !finalDimensions || !initialPosition) return;

        // Check if dimensions or position actually changed
        const dimensionsChanged =
            Math.abs(finalDimensions.x - initialDimensions.x) > 0.001 ||
            Math.abs(finalDimensions.y - initialDimensions.y) > 0.001 ||
            Math.abs(finalDimensions.z - initialDimensions.z) > 0.001;

        const positionChanged =
            Math.abs(finalPosition.x - initialPosition.x) > 0.001 ||
            Math.abs(finalPosition.y - initialPosition.y) > 0.001 ||
            Math.abs(finalPosition.z - initialPosition.z) > 0.001;

        if (!dimensionsChanged && !positionChanged && !hugTransitionState && !fillTransitionState && !gapTransitionState && !tileChildSyncState) {
            return;
        }

        // Calculate push distance based on dimension change along push axis
        let pushDistance = 0;
        if (pushAxis) {
            const axis = pushAxis.toLowerCase();
            pushDistance = (finalDimensions[axis] - initialDimensions[axis]) * pushDirection;
        }

        // Capture post-transition state for redo
        if (hugTransitionState) {
            const objectData = sceneController?.getObject(hugTransitionState.containerId);
            if (objectData) {
                hugTransitionState.targetAutoLayout = JSON.parse(JSON.stringify(objectData.autoLayout));
                const children = sceneController.getChildObjects(objectData.id);
                children.forEach(child => {
                    const entry = hugTransitionState.childStates[child.id];
                    if (entry) {
                        entry.targetLayoutProperties = child.layoutProperties
                            ? JSON.parse(JSON.stringify(child.layoutProperties))
                            : null;
                    }
                });
            }
        }

        // Capture fill transition target state for redo
        if (fillTransitionState) {
            const children = sceneController?.getChildObjects(fillTransitionState.containerId);
            if (children) {
                children.forEach(child => {
                    const entry = fillTransitionState.childStates[child.id];
                    if (entry) {
                        entry.targetLayoutProperties = child.layoutProperties
                            ? JSON.parse(JSON.stringify(child.layoutProperties))
                            : null;
                    }
                });
            }
        }

        // Capture final tile child state for redo
        if (tileChildSyncState) {
            const children = sceneController?.getChildObjects(tileChildSyncState.containerId);
            tileChildSyncState.finalChildStates = {};
            if (children) {
                const dimensionManager = window.dimensionManager;
                children.forEach(child => {
                    tileChildSyncState.finalChildStates[child.id] = {
                        dimensions: dimensionManager ? { ...dimensionManager.getDimensions(child.mesh) } : null,
                        position: child.mesh ? {
                            x: child.mesh.position.x,
                            y: child.mesh.position.y,
                            z: child.mesh.position.z
                        } : null
                    };
                });
            }
        }

        const command = new PushFaceCommand(
            pushedObject.userData.id,
            faceNormal,
            pushDistance,
            initialDimensions,
            finalDimensions,
            initialPosition,
            finalPosition,
            hugTransitionState,
            fillTransitionState,
            gapTransitionState,
            tileChildSyncState
        );
        historyManager.executeCommand(command);
    }
}

window.PushUndoCapture = PushUndoCapture;
