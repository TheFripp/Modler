const logger = window.logger;
/**
 * Push Face Command
 * Undoable command for face push operations (dimension and position changes)
 * Supports hug→layout transition undo/redo when push triggers mode change
 */
class PushFaceCommand extends BaseCommand {
    /**
     * @param {string|number} objectId - ID of the object being pushed
     * @param {Object} faceNormal - Face normal direction {x, y, z}
     * @param {number} pushDistance - Distance pushed
     * @param {Object} oldDimensions - Original dimensions {x, y, z}
     * @param {Object} newDimensions - New dimensions {x, y, z}
     * @param {Object} oldPosition - Original position {x, y, z}
     * @param {Object} newPosition - New position {x, y, z}
     * @param {Object} [hugTransitionState] - State for hug→layout transition undo/redo
     */
    constructor(objectId, faceNormal, pushDistance, oldDimensions, newDimensions, oldPosition, newPosition, hugTransitionState = null, fillTransitionState = null, gapTransitionState = null, tileChildSyncState = null) {
        super('push-face', 'Push face operation');
        this.objectId = objectId;
        this.faceNormal = faceNormal ? { ...faceNormal } : null;
        this.pushDistance = pushDistance || 0;
        this.oldDimensions = { ...oldDimensions };
        this.newDimensions = { ...newDimensions };
        this.oldPosition = oldPosition ? { ...oldPosition } : null;
        this.newPosition = newPosition ? { ...newPosition } : null;
        this.hugTransitionState = hugTransitionState;
        this.fillTransitionState = fillTransitionState;
        this.gapTransitionState = gapTransitionState;
        this.tileChildSyncState = tileChildSyncState;
    }

    execute() {
        // Push operation already happened, just store the state
        return true;
    }

    undo() {
        const sceneController = window.modlerComponents?.sceneController;

        if (!sceneController) {
            logger.error('PushFaceCommand: SceneController not available for undo');
            return false;
        }

        try {
            const objectData = sceneController.getObject(this.objectId);
            if (!objectData || !objectData.mesh) {
                logger.error('PushFaceCommand: Object not found');
                return false;
            }

            // Reverse hug→layout transition before restoring geometry
            if (this.hugTransitionState) {
                this.restoreHugState();
            }

            // Reverse perpendicular fill transition
            if (this.fillTransitionState) {
                this.restoreFillState();
            }

            // Restore gap to original value
            if (this.gapTransitionState) {
                this.restoreGapState();
            }

            // Restore tile children to original dimensions
            if (this.tileChildSyncState) {
                this.restoreTileChildState();
            }

            // Restore geometry to old dimensions and position
            this.restoreGeometryState(objectData.mesh, this.oldDimensions, this.oldPosition);

            // Recalculate container after geometry is restored
            if (this.hugTransitionState) {
                sceneController.updateContainer(this.hugTransitionState.containerId);
            }

            // Recalculate container after fill state restored
            if (this.fillTransitionState) {
                sceneController.updateContainer(this.fillTransitionState.containerId);
            }

            // Recalculate container after gap restored
            if (this.gapTransitionState) {
                sceneController.updateContainer(this.gapTransitionState.containerId);
            }

            // Recalculate container after tile children restored
            if (this.tileChildSyncState) {
                sceneController.updateContainer(this.tileChildSyncState.containerId);
            }

            logger.info(`↩️ Undid push: ${this.objectId}`);
            return true;

        } catch (error) {
            logger.error('PushFaceCommand: Undo failed:', error);
            return false;
        }
    }

    redo() {
        const sceneController = window.modlerComponents?.sceneController;

        if (!sceneController) {
            logger.error('PushFaceCommand: SceneController not available for redo');
            return false;
        }

        try {
            const objectData = sceneController.getObject(this.objectId);
            if (!objectData || !objectData.mesh) {
                logger.error('PushFaceCommand: Object not found');
                return false;
            }

            // Re-apply hug→layout transition before restoring geometry
            if (this.hugTransitionState) {
                this.reapplyLayoutState();
            }

            // Re-apply perpendicular fill transition
            if (this.fillTransitionState) {
                this.reapplyFillState();
            }

            // Re-apply gap change
            if (this.gapTransitionState) {
                this.reapplyGapState();
            }

            // Re-apply tile child dimensions
            if (this.tileChildSyncState) {
                this.reapplyTileChildState();
            }

            // Restore geometry to new dimensions and position
            this.restoreGeometryState(objectData.mesh, this.newDimensions, this.newPosition);

            // Recalculate container after geometry is restored
            if (this.hugTransitionState) {
                sceneController.updateContainer(this.hugTransitionState.containerId);
            }

            // Recalculate container after fill state re-applied
            if (this.fillTransitionState) {
                sceneController.updateContainer(this.fillTransitionState.containerId);
            }

            // Recalculate container after gap re-applied
            if (this.gapTransitionState) {
                sceneController.updateContainer(this.gapTransitionState.containerId);
            }

            // Recalculate container after tile children re-applied
            if (this.tileChildSyncState) {
                sceneController.updateContainer(this.tileChildSyncState.containerId);
            }

            logger.info(`↪️ Redid push: ${this.objectId}`);
            return true;

        } catch (error) {
            logger.error('PushFaceCommand: Redo failed:', error);
            return false;
        }
    }

    /**
     * Restore container and children to pre-transition hug state
     */
    restoreHugState() {
        const objectStateManager = window.modlerComponents?.objectStateManager;
        if (!objectStateManager) return;

        const state = this.hugTransitionState;

        // Restore children's original layoutProperties
        for (const [childId, childState] of Object.entries(state.childStates)) {
            if (childState.originalLayoutProperties) {
                objectStateManager.updateObject(childId, {
                    layoutProperties: JSON.parse(JSON.stringify(childState.originalLayoutProperties))
                }, 'undo');
            }
        }

        // Restore container to hug mode
        objectStateManager.updateObject(state.containerId, {
            ...ObjectStateManager.buildContainerModeUpdate('hug'),
            autoLayout: JSON.parse(JSON.stringify(state.originalAutoLayout))
        }, 'undo');
    }

    /**
     * Re-apply layout mode and children fill state for redo
     */
    reapplyLayoutState() {
        const objectStateManager = window.modlerComponents?.objectStateManager;
        if (!objectStateManager) return;

        const state = this.hugTransitionState;

        // Re-apply layout mode on container
        objectStateManager.updateObject(state.containerId, {
            ...ObjectStateManager.buildContainerModeUpdate('layout'),
            autoLayout: JSON.parse(JSON.stringify(state.targetAutoLayout))
        }, 'redo');

        // Re-apply children's fill layoutProperties
        for (const [childId, childState] of Object.entries(state.childStates)) {
            if (childState.targetLayoutProperties) {
                objectStateManager.updateObject(childId, {
                    layoutProperties: JSON.parse(JSON.stringify(childState.targetLayoutProperties))
                }, 'redo');
            }
        }
    }

    /**
     * Restore children's original layoutProperties before perpendicular fill
     */
    restoreFillState() {
        const objectStateManager = window.modlerComponents?.objectStateManager;
        if (!objectStateManager) return;

        for (const [childId, childState] of Object.entries(this.fillTransitionState.childStates)) {
            if (childState.originalLayoutProperties) {
                objectStateManager.updateObject(childId, {
                    layoutProperties: JSON.parse(JSON.stringify(childState.originalLayoutProperties))
                }, 'undo');
            }
        }
    }

    /**
     * Re-apply children's fill layoutProperties for redo
     */
    reapplyFillState() {
        const objectStateManager = window.modlerComponents?.objectStateManager;
        if (!objectStateManager) return;

        for (const [childId, childState] of Object.entries(this.fillTransitionState.childStates)) {
            if (childState.targetLayoutProperties) {
                objectStateManager.updateObject(childId, {
                    layoutProperties: JSON.parse(JSON.stringify(childState.targetLayoutProperties))
                }, 'undo');
            }
        }
    }

    /**
     * Restore gap to original value (undo of gap change from push)
     */
    restoreGapState() {
        const objectStateManager = window.modlerComponents?.objectStateManager;
        const sceneController = window.modlerComponents?.sceneController;
        if (!objectStateManager || !sceneController) return;

        const state = this.gapTransitionState;
        const container = sceneController.getObject(state.containerId);
        if (!container) return;

        objectStateManager.updateObject(state.containerId, {
            autoLayout: { ...container.autoLayout, gap: state.oldGap }
        }, 'undo');
    }

    /**
     * Re-apply gap change (redo of gap change from push)
     */
    reapplyGapState() {
        const objectStateManager = window.modlerComponents?.objectStateManager;
        const sceneController = window.modlerComponents?.sceneController;
        if (!objectStateManager || !sceneController) return;

        const state = this.gapTransitionState;
        const container = sceneController.getObject(state.containerId);
        if (!container) return;

        objectStateManager.updateObject(state.containerId, {
            autoLayout: { ...container.autoLayout, gap: state.newGap }
        }, 'redo');
    }

    /**
     * Restore tile children to their initial dimensions (undo)
     */
    restoreTileChildState() {
        this._applyTileChildStates(this.tileChildSyncState.initialChildStates);
    }

    /**
     * Re-apply tile children to their final dimensions (redo)
     */
    reapplyTileChildState() {
        this._applyTileChildStates(this.tileChildSyncState.finalChildStates);
    }

    /**
     * Apply a set of dimension/position states to tile children
     * @private
     */
    _applyTileChildStates(childStates) {
        const sceneController = window.modlerComponents?.sceneController;
        const objectStateManager = window.modlerComponents?.objectStateManager;
        const dimensionManager = window.dimensionManager;
        if (!sceneController || !objectStateManager || !dimensionManager) return;

        for (const [childId, state] of Object.entries(childStates)) {
            const child = sceneController.getObject(childId);
            if (!child?.mesh || !state.dimensions) continue;

            dimensionManager.setDimensions(child.mesh, state.dimensions, 'center');
            if (state.position) {
                child.mesh.position.set(state.position.x, state.position.y, state.position.z);
            }
            objectStateManager.updateObject(childId, {
                dimensions: { ...state.dimensions },
                ...(state.position ? { position: { ...state.position } } : {})
            }, 'undo');
        }
    }

    /**
     * Restore geometry to target dimensions and position by recreating it
     * We must recreate geometry because push operations shift the geometry center,
     * and scaling from a shifted center produces incorrect results
     */
    restoreGeometryState(mesh, targetDimensions, targetPosition) {
        const geometryFactory = window.modlerComponents?.geometryFactory;
        const sceneController = window.modlerComponents?.sceneController;
        const objectStateManager = window.modlerComponents?.objectStateManager;

        if (!geometryFactory || !sceneController) {
            logger.error('PushFaceCommand: Required components not available');
            return false;
        }

        const objectData = sceneController.getObjectByMesh(mesh);
        if (!objectData) {
            logger.error('PushFaceCommand: Object data not found');
            return false;
        }

        // Create new centered geometry with target dimensions
        const newGeometry = geometryFactory.createBoxGeometry(
            targetDimensions.x,
            targetDimensions.y,
            targetDimensions.z
        );

        // Return old geometry to pool
        if (mesh.geometry) {
            geometryFactory.returnGeometry(mesh.geometry, 'box');
        }

        // Replace geometry
        mesh.geometry = newGeometry;

        // Restore position (this was captured before/after the push)
        if (targetPosition) {
            mesh.position.set(targetPosition.x, targetPosition.y, targetPosition.z);
        }

        // Update support meshes
        const geometryUtils = window.GeometryUtils;
        if (geometryUtils) {
            geometryUtils.updateSupportMeshGeometries(mesh);
        }

        // Notify state change to update UI
        // Use updateObject to properly sync position, dimensions, and emit events
        if (objectStateManager && targetPosition) {
            objectStateManager.updateObject(objectData.id, {
                position: targetPosition,
                dimensions: targetDimensions
            }, 'undo');
        }

        return true;
    }

    getDescription() {
        const dx = (this.newDimensions.x - this.oldDimensions.x).toFixed(2);
        const dy = (this.newDimensions.y - this.oldDimensions.y).toFixed(2);
        const dz = (this.newDimensions.z - this.oldDimensions.z).toFixed(2);
        return `Push face (Δx: ${dx}, Δy: ${dy}, Δz: ${dz})`;
    }
}

window.PushFaceCommand = PushFaceCommand;
