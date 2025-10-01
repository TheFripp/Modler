/**
 * Move Object Command
 * Undoable command for moving objects
 */
class MoveObjectCommand extends BaseCommand {
    /**
     * @param {string} objectId - ID of the object being moved
     * @param {Object} oldPosition - Original position {x, y, z}
     * @param {Object} newPosition - New position {x, y, z}
     */
    constructor(objectId, oldPosition, newPosition) {
        super();
        this.objectId = objectId;
        this.oldPosition = { ...oldPosition };
        this.newPosition = { ...newPosition };
    }

    execute() {
        // Move operation already happened, just store the state
        logger.debug(`Move command executed: ${this.objectId}`);
        return true;
    }

    undo() {
        const objectStateManager = window.modlerComponents?.objectStateManager;
        const sceneController = window.modlerComponents?.sceneController;

        if (!objectStateManager || !sceneController) {
            logger.error('MoveObjectCommand: Required components not available for undo');
            return false;
        }

        try {
            // Update position back to old position
            objectStateManager.updateObject(this.objectId, {
                position: this.oldPosition
            });

            logger.info(`↩️ Undid move: ${this.objectId}`);
            return true;

        } catch (error) {
            logger.error('MoveObjectCommand: Undo failed:', error);
            return false;
        }
    }

    redo() {
        const objectStateManager = window.modlerComponents?.objectStateManager;
        const sceneController = window.modlerComponents?.sceneController;

        if (!objectStateManager || !sceneController) {
            logger.error('MoveObjectCommand: Required components not available for redo');
            return false;
        }

        try {
            // Update position to new position
            objectStateManager.updateObject(this.objectId, {
                position: this.newPosition
            });

            logger.info(`↪️ Redid move: ${this.objectId}`);
            return true;

        } catch (error) {
            logger.error('MoveObjectCommand: Redo failed:', error);
            return false;
        }
    }

    getDescription() {
        const dx = (this.newPosition.x - this.oldPosition.x).toFixed(2);
        const dy = (this.newPosition.y - this.oldPosition.y).toFixed(2);
        const dz = (this.newPosition.z - this.oldPosition.z).toFixed(2);
        return `Move object (Δx: ${dx}, Δy: ${dy}, Δz: ${dz})`;
    }
}
