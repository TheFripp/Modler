// Modler V2 - Base Command Interface
// Command pattern implementation for undo/redo system

class BaseCommand {
    constructor(type, description = '') {
        this.type = type;
        this.description = description;
        this.timestamp = Date.now();
        this.id = `${type}_${this.timestamp}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Execute the command
     * Must be implemented by subclasses
     * @returns {boolean} True if execution succeeded
     */
    execute() {
        throw new Error('BaseCommand.execute() must be implemented by subclasses');
    }

    /**
     * Undo the command
     * Must be implemented by subclasses
     * @returns {boolean} True if undo succeeded
     */
    undo() {
        throw new Error('BaseCommand.undo() must be implemented by subclasses');
    }

    /**
     * Get command information for debugging/logging
     * @returns {Object} Command info
     */
    getInfo() {
        return {
            id: this.id,
            type: this.type,
            description: this.description,
            timestamp: this.timestamp,
            age: Date.now() - this.timestamp
        };
    }

    /**
     * Check if this command can be safely undone
     * Override in subclasses for complex validation
     * @returns {boolean} True if command can be undone
     */
    canUndo() {
        return true;
    }

    /**
     * Clean up resources when command is removed from history
     * Override in subclasses if cleanup is needed
     */
    cleanup() {
        // Default: no cleanup needed
    }
}

// Export for use in command implementations
window.BaseCommand = BaseCommand;