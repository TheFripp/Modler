const logger = window.logger;
/**
 * Update Property Command
 * Undoable command for property changes from the property panel
 */
class UpdatePropertyCommand extends BaseCommand {
    /**
     * @param {string} objectId - ID of the object being modified
     * @param {string} property - Property path (e.g., "position.x", "dimensions.y", "material.color")
     * @param {*} oldValue - Original value
     * @param {*} newValue - New value
     */
    constructor(objectId, property, oldValue, newValue) {
        super();
        this.objectId = objectId;
        this.property = property;
        this.oldValue = oldValue;
        this.newValue = newValue;

        // Capture coordinate space context for position/transform properties
        if (property.startsWith('position.') || property.startsWith('rotation.')) {
            const sceneController = window.modlerComponents?.sceneController;
            if (sceneController) {
                const objectData = sceneController.getObject(objectId);
                if (objectData) {
                    this.parentContainer = objectData.parentContainer || null;

                    // Check if in layout mode
                    if (this.parentContainer) {
                        const parent = sceneController.getObject(this.parentContainer);
                        this.wasInLayoutMode = parent?.autoLayout?.enabled || false;
                    } else {
                        this.wasInLayoutMode = false;
                    }
                }
            }
        }
    }

    execute() {
        // Property update already happened, just store the state
        logger.debug(`Property update command executed: ${this.objectId}.${this.property}`);
        return true;
    }

    undo() {
        const objectStateManager = window.modlerComponents?.objectStateManager;
        const sceneController = window.modlerComponents?.sceneController;

        if (!objectStateManager) {
            logger.error('UpdatePropertyCommand: ObjectStateManager not available for undo');
            return false;
        }

        try {
            // Validate coordinate space for position/rotation properties
            if ((this.property.startsWith('position.') || this.property.startsWith('rotation.')) && sceneController) {
                const objectData = sceneController.getObject(this.objectId);
                if (objectData) {
                    const currentParent = objectData.parentContainer || null;

                    // Check if layout mode is active
                    let currentlyInLayoutMode = false;
                    if (currentParent) {
                        const parent = sceneController.getObject(currentParent);
                        currentlyInLayoutMode = parent?.autoLayout?.enabled || false;
                    }

                    // Skip position/rotation restore if now in layout mode
                    if (currentlyInLayoutMode && !this.wasInLayoutMode) {
                        logger.info(`↩️ Skipped ${this.property} undo (object now in layout mode): ${this.objectId}`);
                        return true;
                    }

                    // Warn if parent changed
                    if (currentParent !== this.parentContainer) {
                        logger.warn('UpdatePropertyCommand: Parent container changed, coordinate space may be incorrect');
                    }
                }
            }

            // Convert property path to nested update object
            const updates = this.createUpdateObject(this.property, this.oldValue);

            // Update through ObjectStateManager for full synchronization
            objectStateManager.updateObject(this.objectId, updates);

            logger.info(`↩️ Undid property change: ${this.property}`);
            return true;

        } catch (error) {
            logger.error('UpdatePropertyCommand: Undo failed:', error);
            return false;
        }
    }

    redo() {
        const objectStateManager = window.modlerComponents?.objectStateManager;
        const sceneController = window.modlerComponents?.sceneController;

        if (!objectStateManager) {
            logger.error('UpdatePropertyCommand: ObjectStateManager not available for redo');
            return false;
        }

        try {
            // Validate coordinate space for position/rotation properties
            if ((this.property.startsWith('position.') || this.property.startsWith('rotation.')) && sceneController) {
                const objectData = sceneController.getObject(this.objectId);
                if (objectData) {
                    // Check if layout mode is active
                    let currentlyInLayoutMode = false;
                    if (objectData.parentContainer) {
                        const parent = sceneController.getObject(objectData.parentContainer);
                        currentlyInLayoutMode = parent?.autoLayout?.enabled || false;
                    }

                    // Skip position/rotation restore if in layout mode
                    if (currentlyInLayoutMode) {
                        logger.info(`↪️ Skipped ${this.property} redo (object in layout mode): ${this.objectId}`);
                        return true;
                    }
                }
            }

            // Convert property path to nested update object
            const updates = this.createUpdateObject(this.property, this.newValue);

            // Update through ObjectStateManager for full synchronization
            objectStateManager.updateObject(this.objectId, updates);

            logger.info(`↪️ Redid property change: ${this.property}`);
            return true;

        } catch (error) {
            logger.error('UpdatePropertyCommand: Redo failed:', error);
            return false;
        }
    }

    /**
     * Convert property path to nested object
     * e.g., "position.x" with value 5 becomes { position: { x: 5 } }
     */
    createUpdateObject(property, value) {
        const updates = {};

        if (property.includes('.')) {
            const parts = property.split('.');
            let current = updates;

            for (let i = 0; i < parts.length - 1; i++) {
                current[parts[i]] = {};
                current = current[parts[i]];
            }

            current[parts[parts.length - 1]] = value;
        } else {
            updates[property] = value;
        }

        return updates;
    }

    getDescription() {
        return `Update ${this.property}: ${this.oldValue} → ${this.newValue}`;
    }
}

window.UpdatePropertyCommand = UpdatePropertyCommand;
