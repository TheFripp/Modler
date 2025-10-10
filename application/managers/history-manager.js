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
        this.isUndoing = false;   // Flag to indicate undo in progress
        this.isRedoing = false;   // Flag to indicate redo in progress
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

        // SCHEMA VALIDATION: Validate command metadata if validator available
        if (window.commandMetadataValidator && command.type) {
            // Extract command parameters from command object (if available)
            const commandParams = this.extractCommandParameters(command);
            const validation = window.commandMetadataValidator.validate(command.type, commandParams);

            if (!validation.isValid) {
                console.error('❌ Command validation failed:', {
                    commandType: command.type,
                    commandId: command.id,
                    errors: validation.errors
                });
                // Log but continue execution (graceful degradation)
                // In strict mode, you might want to return false here
            }
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
        this.isUndoing = true;

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
            this.isUndoing = false;
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
        this.isRedoing = true;

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
            this.isRedoing = false;
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
            isExecuting: this.isExecuting,
            isUndoing: this.isUndoing,
            isRedoing: this.isRedoing
        };
    }

    /**
     * Extract command parameters from command object for validation
     * @private
     */
    extractCommandParameters(command) {
        // Extract known command properties
        const params = {};

        // Common properties across all commands
        if (command.objectId !== undefined) params.objectId = command.objectId;
        if (command.objectIds !== undefined) params.objectIds = command.objectIds;
        if (command.objectType !== undefined) params.objectType = command.objectType;
        if (command.property !== undefined) params.property = command.property;
        if (command.oldValue !== undefined) params.oldValue = command.oldValue;
        if (command.newValue !== undefined) params.newValue = command.newValue;
        if (command.position !== undefined) params.position = command.position;
        if (command.dimensions !== undefined) params.dimensions = command.dimensions;
        if (command.oldPosition !== undefined) params.oldPosition = command.oldPosition;
        if (command.newPosition !== undefined) params.newPosition = command.newPosition;
        if (command.oldDimensions !== undefined) params.oldDimensions = command.oldDimensions;
        if (command.newDimensions !== undefined) params.newDimensions = command.newDimensions;
        if (command.faceNormal !== undefined) params.faceNormal = command.faceNormal;
        if (command.pushDistance !== undefined) params.pushDistance = command.pushDistance;
        if (command.containerId !== undefined) params.containerId = command.containerId;
        if (command.autoLayout !== undefined) params.autoLayout = command.autoLayout;
        if (command.material !== undefined) params.material = command.material;
        if (command.name !== undefined) params.name = command.name;
        if (command.selectedObjects !== undefined) params.selectedObjects = command.selectedObjects;
        if (command.containerData !== undefined) params.containerData = command.containerData;

        return params;
    }

    /**
     * Serialize history to JSON (for saving/loading)
     * Only serializes commands that are marked as serializable in schema
     * @returns {string} JSON string of serialized history
     */
    serializeHistory() {
        if (!window.commandMetadataValidator) {
            console.warn('Command metadata validator not available for serialization');
            return null;
        }

        const serializedUndo = this.undoStack
            .map(command => {
                if (!command.type) return null;
                const params = this.extractCommandParameters(command);
                return window.commandMetadataValidator.serialize(command.type, params, {
                    timestamp: command.timestamp,
                    id: command.id
                });
            })
            .filter(Boolean);

        const serializedRedo = this.redoStack
            .map(command => {
                if (!command.type) return null;
                const params = this.extractCommandParameters(command);
                return window.commandMetadataValidator.serialize(command.type, params, {
                    timestamp: command.timestamp,
                    id: command.id
                });
            })
            .filter(Boolean);

        return JSON.stringify({
            version: '1.0.0',
            timestamp: Date.now(),
            undoStack: serializedUndo,
            redoStack: serializedRedo
        });
    }

    /**
     * Deserialize history from JSON (for loading)
     * @param {string} jsonData - JSON string of serialized history
     * @returns {boolean} True if deserialization succeeded
     */
    deserializeHistory(jsonData) {
        if (!window.commandMetadataValidator) {
            console.warn('Command metadata validator not available for deserialization');
            return false;
        }

        try {
            const data = JSON.parse(jsonData);

            // Clear current history
            this.clear();

            // Deserialize commands (validation happens in deserialize)
            const undoCommands = data.undoStack
                .map(serialized => window.commandMetadataValidator.deserialize(serialized))
                .filter(Boolean);

            const redoCommands = data.redoStack
                .map(serialized => window.commandMetadataValidator.deserialize(serialized))
                .filter(Boolean);

            // Note: Deserialized commands would need to be reconstructed as actual Command objects
            // This is a simplified version - full implementation would need command factory
            console.log(`Deserialized ${undoCommands.length} undo commands and ${redoCommands.length} redo commands`);

            return true;

        } catch (error) {
            console.error('Failed to deserialize history:', error);
            return false;
        }
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