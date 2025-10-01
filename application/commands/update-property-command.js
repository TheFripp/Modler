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
    }

    execute() {
        // Property update already happened, just store the state
        logger.debug(`Property update command executed: ${this.objectId}.${this.property}`);
        return true;
    }

    undo() {
        const objectStateManager = window.modlerComponents?.objectStateManager;

        if (!objectStateManager) {
            logger.error('UpdatePropertyCommand: ObjectStateManager not available for undo');
            return false;
        }

        try {
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

        if (!objectStateManager) {
            logger.error('UpdatePropertyCommand: ObjectStateManager not available for redo');
            return false;
        }

        try {
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
