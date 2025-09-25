// Modler V2 - History Manager
// Command pattern implementation for undo/redo functionality

class HistoryManager {
    constructor() {
        // History stacks
        this.undoStack = [];
        this.redoStack = [];

        // Configuration
        this.maxSteps = 50;
        this.enabled = true;

        // State tracking
        this.isExecuting = false; // Prevent recursive command execution
        this.initialized = false;

        // Component references
        this.configManager = null;
        this.sceneController = null;

        // Event callbacks
        this.callbacks = {
            onHistoryChanged: []
        };
    }

    /**
     * Initialize with required components
     */
    initialize() {
        this.configManager = window.modlerComponents?.configurationManager;
        this.sceneController = window.modlerComponents?.sceneController;

        // Load configuration
        this.loadConfiguration();

        // Subscribe to configuration changes
        if (this.configManager) {
            this.configManager.subscribe('history.maxSteps', (value) => {
                this.maxSteps = value;
                this.trimHistory();
            });

            this.configManager.subscribe('history.enabled', (value) => {
                this.enabled = value;
            });
        }

        this.initialized = true;
    }

    /**
     * Load configuration from ConfigManager
     */
    loadConfiguration() {
        if (!this.configManager) return;

        const historyConfig = this.configManager.get('history');
        if (historyConfig) {
            this.maxSteps = historyConfig.maxSteps || 50;
            this.enabled = historyConfig.enabled !== false;
        }
    }

    /**
     * Execute a command and add it to history
     * @param {BaseCommand} command - Command to execute
     * @returns {boolean} True if command was executed successfully
     */
    executeCommand(command) {
        if (!this.enabled || !this.initialized || this.isExecuting) {
            return false;
        }

        if (!command || typeof command.execute !== 'function') {
            console.error('HistoryManager: Invalid command provided');
            return false;
        }

        this.isExecuting = true;

        try {
            // Execute the command
            const success = command.execute();

            if (success) {
                // Add to undo stack
                this.undoStack.push(command);

                // Clear redo stack when new command is executed
                this.clearRedoStack();

                // Trim history if needed
                this.trimHistory();

                // Notify listeners
                this.notifyHistoryChanged();

                return true;
            } else {
                console.warn('HistoryManager: Command execution failed:', command.getInfo());
                return false;
            }
        } catch (error) {
            console.error('HistoryManager: Error executing command:', error, command.getInfo());
            return false;
        } finally {
            this.isExecuting = false;
        }
    }

    /**
     * Undo the last command
     * @returns {boolean} True if undo was successful
     */
    undo() {
        if (!this.enabled || !this.initialized || this.isExecuting || this.undoStack.length === 0) {
            return false;
        }

        const command = this.undoStack.pop();

        this.isExecuting = true;

        try {
            const success = command.undo();

            if (success) {
                // Add to redo stack
                this.redoStack.push(command);

                // Notify listeners
                this.notifyHistoryChanged();

                return true;
            } else {
                // Put command back on undo stack if undo failed
                this.undoStack.push(command);
                console.warn('HistoryManager: Command undo failed:', command.getInfo());
                return false;
            }
        } catch (error) {
            // Put command back on undo stack if error occurred
            this.undoStack.push(command);
            console.error('HistoryManager: Error undoing command:', error, command.getInfo());
            return false;
        } finally {
            this.isExecuting = false;
        }
    }

    /**
     * Redo the last undone command
     * @returns {boolean} True if redo was successful
     */
    redo() {
        if (!this.enabled || !this.initialized || this.isExecuting || this.redoStack.length === 0) {
            return false;
        }

        const command = this.redoStack.pop();

        this.isExecuting = true;

        try {
            const success = command.execute();

            if (success) {
                // Add back to undo stack
                this.undoStack.push(command);

                // Notify listeners
                this.notifyHistoryChanged();

                return true;
            } else {
                // Put command back on redo stack if redo failed
                this.redoStack.push(command);
                console.warn('HistoryManager: Command redo failed:', command.getInfo());
                return false;
            }
        } catch (error) {
            // Put command back on redo stack if error occurred
            this.redoStack.push(command);
            console.error('HistoryManager: Error redoing command:', error, command.getInfo());
            return false;
        } finally {
            this.isExecuting = false;
        }
    }

    /**
     * Clear all history
     */
    clear() {
        this.clearUndoStack();
        this.clearRedoStack();
        this.notifyHistoryChanged();
    }

    /**
     * Clear undo stack and cleanup commands
     */
    clearUndoStack() {
        this.undoStack.forEach(command => {
            if (typeof command.cleanup === 'function') {
                command.cleanup();
            }
        });
        this.undoStack = [];
    }

    /**
     * Clear redo stack and cleanup commands
     */
    clearRedoStack() {
        this.redoStack.forEach(command => {
            if (typeof command.cleanup === 'function') {
                command.cleanup();
            }
        });
        this.redoStack = [];
    }

    /**
     * Trim history to maxSteps limit
     */
    trimHistory() {
        while (this.undoStack.length > this.maxSteps) {
            const removedCommand = this.undoStack.shift();
            if (typeof removedCommand.cleanup === 'function') {
                removedCommand.cleanup();
            }
        }
    }

    /**
     * Get history state information
     */
    getHistoryState() {
        return {
            canUndo: this.canUndo(),
            canRedo: this.canRedo(),
            undoCount: this.undoStack.length,
            redoCount: this.redoStack.length,
            maxSteps: this.maxSteps,
            enabled: this.enabled,
            isExecuting: this.isExecuting
        };
    }

    /**
     * Check if undo is available
     */
    canUndo() {
        return this.enabled && this.undoStack.length > 0 && !this.isExecuting;
    }

    /**
     * Check if redo is available
     */
    canRedo() {
        return this.enabled && this.redoStack.length > 0 && !this.isExecuting;
    }

    /**
     * Register callback for history changes
     */
    onHistoryChanged(callback) {
        if (typeof callback === 'function') {
            this.callbacks.onHistoryChanged.push(callback);
        }
    }

    /**
     * Notify all listeners that history has changed
     */
    notifyHistoryChanged() {
        const state = this.getHistoryState();
        this.callbacks.onHistoryChanged.forEach(callback => {
            try {
                callback(state);
            } catch (error) {
                console.error('HistoryManager: Error in history change callback:', error);
            }
        });
    }

    /**
     * Get debug information
     */
    getDebugInfo() {
        return {
            initialized: this.initialized,
            enabled: this.enabled,
            maxSteps: this.maxSteps,
            undoStack: this.undoStack.map(cmd => cmd.getInfo()),
            redoStack: this.redoStack.map(cmd => cmd.getInfo()),
            isExecuting: this.isExecuting
        };
    }
}

// Export for use in main application
window.HistoryManager = HistoryManager;