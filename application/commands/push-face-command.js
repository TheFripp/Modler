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
    constructor(objectId, faceNormal, pushDistance, oldDimensions, newDimensions, oldPosition, newPosition, hugTransitionState = null, fillTransitionState = null, parentHugTransitionState = null) {
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
        this.parentHugTransitionState = parentHugTransitionState;
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

            // Reverse parent hug transition (restore to layout mode)
            if (this.parentHugTransitionState) {
                this.restoreParentLayoutState();
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

            // Recalculate container after parent restored to layout mode
            if (this.parentHugTransitionState) {
                sceneController.updateContainer(this.parentHugTransitionState.containerId);
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

            // Re-apply parent hug transition
            if (this.parentHugTransitionState) {
                this.reapplyParentHugState();
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

            // Recalculate container after parent re-applied to hug mode
            if (this.parentHugTransitionState) {
                sceneController.updateContainer(this.parentHugTransitionState.containerId);
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
     * Restore parent container to layout mode (undo of layout→hug transition)
     */
    restoreParentLayoutState() {
        const objectStateManager = window.modlerComponents?.objectStateManager;
        if (!objectStateManager) return;

        const state = this.parentHugTransitionState;

        // Restore children's original layoutProperties
        for (const [childId, childState] of Object.entries(state.childStates)) {
            if (childState.originalLayoutProperties) {
                objectStateManager.updateObject(childId, {
                    layoutProperties: JSON.parse(JSON.stringify(childState.originalLayoutProperties))
                }, 'undo');
            }
        }

        // Restore parent to layout mode with original autoLayout
        objectStateManager.updateObject(state.containerId, {
            ...ObjectStateManager.buildContainerModeUpdate('layout'),
            autoLayout: JSON.parse(JSON.stringify(state.originalAutoLayout))
        }, 'undo');
    }

    /**
     * Re-apply parent hug mode (redo of layout→hug transition)
     */
    reapplyParentHugState() {
        const objectStateManager = window.modlerComponents?.objectStateManager;
        if (!objectStateManager) return;

        const state = this.parentHugTransitionState;

        // Re-apply children's target layout properties
        for (const [childId, childState] of Object.entries(state.childStates)) {
            if (childState.targetLayoutProperties) {
                objectStateManager.updateObject(childId, {
                    layoutProperties: JSON.parse(JSON.stringify(childState.targetLayoutProperties))
                }, 'redo');
            }
        }

        // Set parent to hug mode
        objectStateManager.updateObject(state.containerId, {
            ...ObjectStateManager.buildContainerModeUpdate('hug')
        }, 'redo');
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
