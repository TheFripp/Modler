/**
 * FileManager - High-Level File Operations
 *
 * Manages scene file CRUD operations, auto-save, and current file state.
 * Coordinates SceneSerializer, SceneDeserializer, and IndexedDBWrapper.
 *
 * Responsibilities:
 * - File save/load/delete operations
 * - Current file tracking and dirty state
 * - Auto-save scheduling
 * - Unsaved changes warnings
 */

class FileManager extends EventTarget {
    constructor() {
        super();

        // File states (enum)
        this.FILE_STATES = {
            CLEAN: 'CLEAN',                             // No changes
            DIRTY: 'DIRTY',                             // Has unsaved changes, safe to save
            LOADING: 'LOADING',                         // Deserialization in progress
            SAVING: 'SAVING',                           // Serialization in progress
            OPERATION_IN_PROGRESS: 'OPERATION_IN_PROGRESS'  // Drag/layout operation in progress
        };

        // Current file state
        this.currentFileId = null;
        this.currentFileName = 'Untitled';
        this.state = this.FILE_STATES.CLEAN;            // Use state machine instead of boolean
        this.isDirty = false;                           // DEPRECATED: Keep for backward compatibility during transition
        this.lastSaved = null;
        this.createdTimestamp = null;

        // Active operations tracking
        this.activeOperations = new Set();

        // Change tracking control
        this.changeTrackingEnabled = true;

        // Auto-save configuration
        this.autoSaveEnabled = true;
        this.autoSaveInterval = 30000; // 30 seconds
        this.autoSaveTimer = null;

        // Component references
        this.storage = null;
        this.serializer = null;
        this.deserializer = null;
        this.thumbnailCapture = null;

        // Statistics
        this.stats = {
            saves: 0,
            loads: 0,
            autoSaves: 0,
            manualSaves: 0
        };

        // Initialize components
        this.initializeComponents();

        // Setup change tracking
        this.setupChangeTracking();

        // Load last opened file ID from localStorage
        this.loadLastOpenedFile();
    }

    /**
     * Initialize component references
     */
    initializeComponents() {
        this.storage = new IndexedDBWrapper();
        this.serializer = new SceneSerializer();
        this.deserializer = new SceneDeserializer();

        // ThumbnailCapture will be initialized when available
        if (window.ThumbnailCapture) {
            this.thumbnailCapture = new ThumbnailCapture();
        }
    }

    /**
     * Setup change tracking to mark scene as dirty
     */
    setupChangeTracking() {
        const eventBus = window.objectEventBus;
        if (!eventBus) {
            console.warn('FileManager: ObjectEventBus not available, change tracking disabled');
            return;
        }

        // Listen to all events that modify the scene
        // Use EVENT_TYPES constants to ensure we're subscribing to the correct event names
        const eventTypes = [
            eventBus.EVENT_TYPES.GEOMETRY,      // 'object:geometry' - Dimensions, vertices
            eventBus.EVENT_TYPES.HIERARCHY,     // 'object:hierarchy' - Parent-child relationships
            eventBus.EVENT_TYPES.TRANSFORM,     // 'object:transform' - Position, rotation, scale
            eventBus.EVENT_TYPES.MATERIAL,      // 'object:material' - Color, opacity, texture
            eventBus.EVENT_TYPES.LIFECYCLE      // 'object:lifecycle' - Create, delete operations
        ];

        eventTypes.forEach(eventType => {
            eventBus.subscribe(eventType, () => {
                this.markAsDirty();
            }, { subscriberId: `FileManager_ChangeTracking_${eventType}` });
        });

        console.log('FileManager: Change tracking initialized for event types:', eventTypes);
    }

    /**
     * Set file state with validation
     */
    setState(newState) {
        if (!Object.values(this.FILE_STATES).includes(newState)) {
            console.error(`FileManager: Invalid state "${newState}"`);
            return;
        }

        const oldState = this.state;
        this.state = newState;

        // Update deprecated isDirty flag for backward compatibility
        this.isDirty = (newState === this.FILE_STATES.DIRTY || newState === this.FILE_STATES.OPERATION_IN_PROGRESS);

        // Only log state changes in development (not every transition)
        // Uncomment for debugging: console.log(`FileManager: State ${oldState} → ${newState}`);

        // Emit events
        this.emit('state-changed', { state: newState, oldState });
        this.emit('dirty-state-changed', { isDirty: this.isDirty });
    }

    /**
     * Mark scene as dirty (has unsaved changes)
     */
    markAsDirty() {
        // Don't mark as dirty if change tracking is disabled (e.g., during load/deserialization)
        if (!this.changeTrackingEnabled) {
            return;
        }

        // Don't interrupt loading or saving operations
        if (this.state === this.FILE_STATES.LOADING || this.state === this.FILE_STATES.SAVING) {
            return;
        }

        // If there are active operations, mark as OPERATION_IN_PROGRESS instead of DIRTY
        if (this.activeOperations.size > 0) {
            this.setState(this.FILE_STATES.OPERATION_IN_PROGRESS);
        } else {
            this.setState(this.FILE_STATES.DIRTY);
        }
    }

    /**
     * Mark scene as clean (no unsaved changes)
     */
    markAsClean() {
        this.setState(this.FILE_STATES.CLEAN);
    }

    /**
     * Register an active operation (drag, layout calculation, etc.)
     * Prevents auto-save during the operation
     */
    registerOperation(operationId) {
        this.activeOperations.add(operationId);
        if (this.state === this.FILE_STATES.DIRTY) {
            this.setState(this.FILE_STATES.OPERATION_IN_PROGRESS);
        }
        // Uncomment for debugging: console.log(`FileManager: Operation "${operationId}" active (${this.activeOperations.size})`);
    }

    /**
     * Unregister an active operation
     * Returns to DIRTY state if changes exist and no operations remain
     */
    unregisterOperation(operationId) {
        const wasPresent = this.activeOperations.delete(operationId);
        // Uncomment for debugging: if (wasPresent) console.log(`FileManager: Operation "${operationId}" complete (${this.activeOperations.size})`);

        // If no more operations and we were in OPERATION_IN_PROGRESS state
        if (this.activeOperations.size === 0 && this.state === this.FILE_STATES.OPERATION_IN_PROGRESS) {
            // Return to DIRTY (we had changes that triggered the operation)
            this.setState(this.FILE_STATES.DIRTY);
        }
    }

    /**
     * Load last opened file ID from localStorage
     */
    loadLastOpenedFile() {
        try {
            const lastFileId = localStorage.getItem('modler_lastOpenedFileId');
            if (lastFileId) {
                // Don't auto-load yet, just store the ID
                // FileBrowser will handle the actual loading
                this._lastOpenedFileId = lastFileId;
            }
        } catch (error) {
            // localStorage might not be available
            console.warn('FileManager: Failed to load last opened file from localStorage:', error);
        }
    }

    /**
     * Save last opened file ID to localStorage
     */
    saveLastOpenedFile(fileId) {
        try {
            if (fileId) {
                localStorage.setItem('modler_lastOpenedFileId', fileId);
            } else {
                localStorage.removeItem('modler_lastOpenedFileId');
            }
        } catch (error) {
            // localStorage might not be available
            console.warn('FileManager: Failed to save last opened file to localStorage:', error);
        }
    }

    /**
     * Get last opened file ID
     */
    getLastOpenedFileId() {
        return this._lastOpenedFileId || null;
    }

    /**
     * Create a new scene
     * @param {Object} options - Options
     * @param {boolean} options.force - Skip unsaved changes warning
     * @returns {Promise<Object>} Result { success: boolean, error?: string }
     */
    async newScene(options = {}) {
        try {
            // Auto-save if there are unsaved changes (no prompt needed with auto-save)
            if (!options.force && this.isDirty && this.currentFileId) {
                await this.saveScene();
            }

            // Enter LOADING state to prevent auto-save during scene clear
            this.setState(this.FILE_STATES.LOADING);

            // Reset file state BEFORE clearing
            // Generate unique scene name (Scene 001, Scene 002, etc.)
            const sceneName = await this.generateUniqueSceneName();
            this.currentFileId = null;
            this.currentFileName = sceneName;
            this.lastSaved = null;
            this.createdTimestamp = Date.now();

            // Clear last opened file (new scenes don't have a file ID yet)
            this.saveLastOpenedFile(null);

            // Disable change tracking during scene clear
            this.changeTrackingEnabled = false;

            try {
                // Clear scene via deserializer
                await this.deserializer.clearScene();
            } finally {
                // Re-enable change tracking
                this.changeTrackingEnabled = true;
                // Return to CLEAN state after loading
                this.setState(this.FILE_STATES.CLEAN);
            }

            // Immediately save the new empty scene so it appears in the file list
            // Unless skipAutoSave is requested (e.g., after deleting last file)
            if (!options.skipAutoSave) {
                const saveResult = await this.saveScene({
                    fileName: this.currentFileName,
                    skipThumbnail: true // Skip thumbnail for empty scene
                });

                if (!saveResult.success) {
                    throw new Error(saveResult.error || 'Failed to save new scene');
                }
            }

            // Emit event
            this.emit('file-changed', {
                fileId: this.currentFileId,
                fileName: this.currentFileName
            });

            return { success: true };

        } catch (error) {
            console.error('FileManager: Failed to create new scene:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Save current scene
     * @param {Object} options - Save options
     * @param {string} options.fileName - Override file name
     * @param {boolean} options.isAutoSave - Mark as auto-save
     * @returns {Promise<Object>} Result { success: boolean, fileId?: string, error?: string }
     */
    async saveScene(options = {}) {
        try {
            const fileName = options.fileName || this.currentFileName;
            const isAutoSave = options.isAutoSave || false;

            // Enter SAVING state
            const previousState = this.state;
            this.setState(this.FILE_STATES.SAVING);

            try {
                // Serialize scene
                const sceneData = this.serializer.serializeScene({
                    fileName: fileName,
                    createdTimestamp: this.createdTimestamp || Date.now()
                });

                // Add thumbnail if available
                if (this.thumbnailCapture && !isAutoSave && !options.skipThumbnail) {
                    try {
                        const thumbnail = await this.thumbnailCapture.captureSceneThumbnail(320, 180);
                        sceneData.thumbnail = thumbnail;
                    } catch (thumbnailError) {
                        // Silently continue without thumbnail
                    }
                }

                // Generate file ID if new file
                const fileId = this.currentFileId || this.generateFileId();

                // Save to storage
                await this.storage.set(fileId, sceneData);

                // Update state
                this.currentFileId = fileId;
                this.currentFileName = fileName;
                this.lastSaved = Date.now();
                if (!this.createdTimestamp) {
                    this.createdTimestamp = sceneData.metadata.created;
                }

                // Save as last opened file
                this.saveLastOpenedFile(fileId);

                // Update statistics
                this.stats.saves++;
                if (isAutoSave) {
                    this.stats.autoSaves++;
                } else {
                    this.stats.manualSaves++;
                }

                // Emit event
                this.emit('file-saved', {
                    fileId: fileId,
                    fileName: fileName,
                    isAutoSave: isAutoSave
                });

                // Return to CLEAN state after successful save
                this.setState(this.FILE_STATES.CLEAN);

                return { success: true, fileId: fileId };

            } catch (innerError) {
                // Restore previous state if save failed
                this.setState(previousState);
                throw innerError;
            }

        } catch (error) {
            console.error('FileManager: Failed to save scene:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Load a scene from storage
     * @param {string} fileId - File ID to load
     * @param {Object} options - Load options
     * @param {boolean} options.force - Skip unsaved changes warning
     * @returns {Promise<Object>} Result { success: boolean, error?: string }
     */
    async loadScene(fileId, options = {}) {
        try {
            // Auto-save if there are unsaved changes (no prompt needed with auto-save)
            if (!options.force && this.isDirty && this.currentFileId) {
                await this.saveScene();
            }

            // Enter LOADING state to prevent auto-save during deserialization
            this.setState(this.FILE_STATES.LOADING);

            // Load from storage
            const fileData = await this.storage.get(fileId);
            if (!fileData) {
                throw new Error('File not found');
            }

            // Update file metadata
            this.currentFileId = fileId;
            this.currentFileName = fileData.metadata?.name || 'Untitled';
            this.createdTimestamp = fileData.metadata?.created || null;
            this.lastSaved = Date.now();

            // Save as last opened file
            this.saveLastOpenedFile(fileId);

            // Disable change tracking during deserialization to prevent marking file as dirty
            this.changeTrackingEnabled = false;

            let result;
            try {
                // Deserialize scene
                result = await this.deserializer.deserializeScene(fileData);
                if (!result.success) {
                    throw new Error(result.error);
                }
            } finally {
                // Re-enable change tracking after deserialization completes
                this.changeTrackingEnabled = true;
                // Return to CLEAN state after successful load
                this.setState(this.FILE_STATES.CLEAN);
            }

            // Update statistics
            this.stats.loads++;

            // Emit event
            this.emit('file-loaded', {
                fileId: fileId,
                fileName: this.currentFileName,
                metadata: result.metadata
            });

            return { success: true, metadata: result.metadata };

        } catch (error) {
            console.error('FileManager: Failed to load scene:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Delete a file from storage
     * @param {string} fileId - File ID to delete
     * @returns {Promise<Object>} Result { success: boolean, error?: string }
     */
    async deleteScene(fileId) {
        try {
            console.log(`FileManager.deleteScene: Deleting file ${fileId}`);
            await this.storage.delete(fileId);
            console.log(`FileManager.deleteScene: File deleted from IndexedDB`);

            // If deleting current file, reset state
            if (fileId === this.currentFileId) {
                console.log('FileManager.deleteScene: Was current file, resetting state');
                this.currentFileId = null;
                this.currentFileName = 'Untitled';
                this.isDirty = false;
                this.lastSaved = null;
                this.createdTimestamp = null;
            }

            // Emit event
            this.emit('file-deleted', { fileId: fileId });

            return { success: true };

        } catch (error) {
            console.error('FileManager: Failed to delete scene:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Rename current file
     * @param {string} newName - New file name
     * @returns {Promise<Object>} Result { success: boolean, error?: string }
     */
    async renameCurrentFile(newName) {
        if (!this.currentFileId) {
            return { success: false, error: 'No file currently open' };
        }

        try {
            this.currentFileName = newName;
            this.markAsDirty(); // Mark as dirty to trigger save
            await this.saveScene({ fileName: newName });

            this.emit('file-renamed', {
                fileId: this.currentFileId,
                fileName: newName
            });

            return { success: true };

        } catch (error) {
            console.error('FileManager: Failed to rename file:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * List all saved files
     * @param {Object} options - Query options
     * @returns {Promise<Array>} Array of file metadata
     */
    async listFiles(options = {}) {
        try {
            const files = await this.storage.getAll({
                sortBy: 'modified',
                order: 'desc',
                ...options
            });

            // Extract metadata for UI display
            return files.map(file => ({
                id: file.id,
                name: file.metadata?.name || 'Untitled',
                created: file.metadata?.created,
                modified: file.metadata?.modified,
                thumbnail: file.thumbnail || null
            }));

        } catch (error) {
            console.error('FileManager: Failed to list files:', error);
            return [];
        }
    }

    /**
     * Start auto-save timer
     */
    startAutoSave() {
        if (this.autoSaveTimer) {
            return; // Already running
        }

        this.autoSaveTimer = setInterval(async () => {
            // Only auto-save if state is DIRTY and no operations are in progress
            // NEVER auto-save during LOADING, SAVING, or OPERATION_IN_PROGRESS
            if (this.state === this.FILE_STATES.DIRTY && this.autoSaveEnabled) {
                await this.saveScene({ isAutoSave: true });
            }
        }, this.autoSaveInterval);
    }

    /**
     * Stop auto-save timer
     */
    stopAutoSave() {
        if (this.autoSaveTimer) {
            clearInterval(this.autoSaveTimer);
            this.autoSaveTimer = null;
        }
    }

    /**
     * Prompt user about unsaved changes
     * @returns {Promise<string>} User choice: 'save', 'dont-save', or 'cancel'
     */
    async promptUnsavedChanges() {
        // Emit event for UI to handle
        return new Promise((resolve) => {
            this.emit('unsaved-changes-prompt', {
                callback: (choice) => resolve(choice)
            });

            // Default to 'dont-save' if no UI handler responds within 5 seconds
            setTimeout(() => resolve('dont-save'), 5000);
        });
    }

    /**
     * Generate unique scene name (Scene 001, Scene 002, etc.)
     * @returns {Promise<string>} Unique scene name
     */
    async generateUniqueSceneName() {
        // Get all existing file names
        const files = await this.listFiles();
        const existingNames = new Set(files.map(f => f.name));

        // Find the next available Scene XXX number
        let number = 1;
        let sceneName;
        do {
            const paddedNumber = number.toString().padStart(3, '0');
            sceneName = `Scene ${paddedNumber}`;
            number++;
        } while (existingNames.has(sceneName));

        return sceneName;
    }

    /**
     * Generate unique file ID
     * @returns {string} Unique ID
     */
    generateFileId() {
        return `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Get current file state
     * @returns {Object} Current file state
     */
    getCurrentFileState() {
        return {
            fileId: this.currentFileId,
            fileName: this.currentFileName,
            isDirty: this.isDirty,
            lastSaved: this.lastSaved,
            created: this.createdTimestamp
        };
    }

    /**
     * Get statistics
     * @returns {Object} Statistics object
     */
    getStats() {
        return { ...this.stats };
    }

    /**
     * Emit event helper
     */
    emit(eventName, detail) {
        this.dispatchEvent(new CustomEvent(eventName, { detail }));
    }
}

// Make globally available
if (typeof window !== 'undefined') {
    window.FileManager = FileManager;
}
