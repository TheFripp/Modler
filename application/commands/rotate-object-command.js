const logger = window.logger;
/**
 * Rotate Object Command
 * Undoable command for rotating objects around a pivot point.
 * Stores both rotation and position since pivot rotation changes both.
 */
class RotateObjectCommand extends BaseCommand {
    /**
     * @param {string} objectId - ID of the object being rotated
     * @param {Object} oldRotation - Original rotation {x, y, z} in degrees
     * @param {Object} newRotation - New rotation {x, y, z} in degrees
     * @param {Object} oldPosition - Original position {x, y, z} in meters
     * @param {Object} newPosition - New position {x, y, z} in meters
     */
    constructor(objectId, oldRotation, newRotation, oldPosition, newPosition) {
        super();
        this.objectId = objectId;
        this.oldRotation = { ...oldRotation };
        this.newRotation = { ...newRotation };
        this.oldPosition = { ...oldPosition };
        this.newPosition = { ...newPosition };

        // Capture coordinate space context
        const sceneController = window.modlerComponents?.sceneController;
        const objectStateManager = window.modlerComponents?.objectStateManager;

        if (sceneController) {
            const objectData = sceneController.getObject(objectId);
            if (objectData) {
                this.parentContainer = objectData.parentContainer || null;
                if (this.parentContainer) {
                    this.wasInLayoutMode = objectStateManager?.isLayoutMode(this.parentContainer) || false;
                } else {
                    this.wasInLayoutMode = false;
                }
            }
        }
    }

    execute() {
        // Rotation already applied during drag
        return true;
    }

    undo() {
        const objectStateManager = window.modlerComponents?.objectStateManager;
        const sceneController = window.modlerComponents?.sceneController;

        if (!objectStateManager || !sceneController) {
            logger.error('RotateObjectCommand: Required components not available for undo');
            return false;
        }

        try {
            const objectData = sceneController.getObject(this.objectId);
            if (!objectData) {
                logger.error('RotateObjectCommand: Object not found for undo:', this.objectId);
                return false;
            }

            const currentParent = objectData.parentContainer || null;
            const currentlyInLayoutMode = currentParent
                ? (objectStateManager?.isLayoutMode(currentParent) || false)
                : false;

            if (currentlyInLayoutMode && !this.wasInLayoutMode) {
                return true;
            }

            objectStateManager.updateObject(this.objectId, {
                rotation: this.oldRotation,
                position: this.oldPosition
            });

            return true;

        } catch (error) {
            logger.error('RotateObjectCommand: Undo failed:', error);
            return false;
        }
    }

    redo() {
        const objectStateManager = window.modlerComponents?.objectStateManager;
        const sceneController = window.modlerComponents?.sceneController;

        if (!objectStateManager || !sceneController) {
            logger.error('RotateObjectCommand: Required components not available for redo');
            return false;
        }

        try {
            const objectData = sceneController.getObject(this.objectId);
            if (!objectData) {
                logger.error('RotateObjectCommand: Object not found for redo:', this.objectId);
                return false;
            }

            const currentlyInLayoutMode = objectData.parentContainer
                ? (objectStateManager?.isLayoutMode(objectData.parentContainer) || false)
                : false;

            if (currentlyInLayoutMode) {
                return true;
            }

            objectStateManager.updateObject(this.objectId, {
                rotation: this.newRotation,
                position: this.newPosition
            });

            return true;

        } catch (error) {
            logger.error('RotateObjectCommand: Redo failed:', error);
            return false;
        }
    }

    getDescription() {
        const axes = ['x', 'y', 'z'];
        const deltas = axes
            .map(a => ({ axis: a.toUpperCase(), delta: this.newRotation[a] - this.oldRotation[a] }))
            .filter(d => Math.abs(d.delta) > 0.01);
        const desc = deltas.map(d => `${d.axis}: ${d.delta.toFixed(1)}°`).join(', ');
        return `Rotate object (${desc || 'no change'})`;
    }
}

window.RotateObjectCommand = RotateObjectCommand;
