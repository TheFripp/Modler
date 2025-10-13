/**
 * Push Face Command
 * Undoable command for face push operations (dimension and position changes)
 */
class PushFaceCommand extends BaseCommand {
    /**
     * @param {string} objectId - ID of the object being pushed
     * @param {Object} oldDimensions - Original dimensions {x, y, z}
     * @param {Object} newDimensions - New dimensions {x, y, z}
     * @param {Object} oldPosition - Original position {x, y, z}
     * @param {Object} newPosition - New position {x, y, z}
     */
    constructor(objectId, oldDimensions, newDimensions, oldPosition, newPosition) {
        super('push-face', 'Push face operation');
        this.objectId = objectId;
        this.oldDimensions = { ...oldDimensions };
        this.newDimensions = { ...newDimensions };
        this.oldPosition = oldPosition ? { ...oldPosition } : null;
        this.newPosition = newPosition ? { ...newPosition } : null;
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

            // Restore geometry to old dimensions and position
            this.restoreGeometryState(objectData.mesh, this.oldDimensions, this.oldPosition);

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

            // Restore geometry to new dimensions and position
            this.restoreGeometryState(objectData.mesh, this.newDimensions, this.newPosition);

            logger.info(`↪️ Redid push: ${this.objectId}`);
            return true;

        } catch (error) {
            logger.error('PushFaceCommand: Redo failed:', error);
            return false;
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
