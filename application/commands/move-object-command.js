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

        // Capture coordinate space context
        const sceneController = window.modlerComponents?.sceneController;
        if (sceneController) {
            const objectData = sceneController.getObject(objectId);
            if (objectData) {
                this.parentContainer = objectData.parentContainer || null;

                // Check if object is in a container with active layout
                if (this.parentContainer) {
                    const parent = sceneController.getObject(this.parentContainer);
                    this.wasInLayoutMode = parent?.autoLayout?.enabled || false;
                } else {
                    this.wasInLayoutMode = false;
                }
            }
        }
    }

    execute() {
        // Move operation already happened, just store the state
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
            const objectData = sceneController.getObject(this.objectId);
            if (!objectData) {
                logger.error('MoveObjectCommand: Object not found for undo:', this.objectId);
                return false;
            }

            // Validate coordinate space hasn't changed
            const currentParent = objectData.parentContainer || null;
            const parentChanged = currentParent !== this.parentContainer;

            // Check if layout mode changed
            let currentlyInLayoutMode = false;
            if (currentParent) {
                const parent = sceneController.getObject(currentParent);
                currentlyInLayoutMode = parent?.autoLayout?.enabled || false;
            }

            // If object is now in layout mode but wasn't before, skip position restore
            // Let layout system handle positioning
            if (currentlyInLayoutMode && !this.wasInLayoutMode) {
                logger.info(`↩️ Skipped position undo (object now in layout mode): ${this.objectId}`);
                return true;
            }

            // If parent changed, warn but attempt to restore
            if (parentChanged) {
                logger.warn('MoveObjectCommand: Parent container changed during undo, position may be incorrect');
            }

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
            const objectData = sceneController.getObject(this.objectId);
            if (!objectData) {
                logger.error('MoveObjectCommand: Object not found for redo:', this.objectId);
                return false;
            }

            // Check if layout mode is active
            let currentlyInLayoutMode = false;
            if (objectData.parentContainer) {
                const parent = sceneController.getObject(objectData.parentContainer);
                currentlyInLayoutMode = parent?.autoLayout?.enabled || false;
            }

            // If object is now in layout mode, skip position restore
            if (currentlyInLayoutMode) {
                logger.info(`↪️ Skipped position redo (object in layout mode): ${this.objectId}`);
                return true;
            }

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
