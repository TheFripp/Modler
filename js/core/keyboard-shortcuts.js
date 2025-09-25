// Keyboard shortcuts and tool management
class KeyboardShortcuts {
    constructor() {
        this.setupEventListeners();
    }

    setupEventListeners() {
        document.addEventListener('keydown', (event) => {
            this.handleKeydown(event);
        });
    }

    handleKeydown(event) {
        // Only handle shortcuts when not typing in input fields
        if (event.target.tagName === 'INPUT') return;

        // Try NavigationController first for navigation keys
        const navigationController = window.modlerComponents?.navigationController;
        if (navigationController && navigationController.handleKeyDown(event)) {
            return; // NavigationController handled the key
        }

        // Handle undo/redo shortcuts
        if ((event.metaKey || event.ctrlKey) && event.key === 'z') {
            if (event.shiftKey) {
                // Redo (Cmd+Shift+Z / Ctrl+Shift+Z)
                this.redo();
            } else {
                // Undo (Cmd+Z / Ctrl+Z)
                this.undo();
            }
            event.preventDefault();
            return;
        }

        // Handle delete key
        if (event.key === 'Delete' || event.key === 'Backspace') {
            this.deleteSelectedObjects();
            event.preventDefault();
            return;
        }

        switch(event.key) {
            case 'q':
            case 'Q':
                this.activateTool('select');
                event.preventDefault();
                break;
            case 'w':
            case 'W':
                this.activateTool('move');
                event.preventDefault();
                break;
            case 'e':
            case 'E':
                this.activateTool('push');
                event.preventDefault();
                break;
            case 't':
            case 'T':
                this.activateTool('box-creation');
                event.preventDefault();
                break;
            case 'Tab':
                // Handle Tab key for push tool field highlighting
                const toolController = window.modlerComponents?.toolController;
                if (toolController?.getActiveToolName() === 'push') {
                    const pushTool = toolController.getActiveTool();
                    if (pushTool && pushTool.isPushing && pushTool.pushAxis) {
                        if (window.focusDimensionFieldForPushAxis) {
                            window.focusDimensionFieldForPushAxis(pushTool.pushAxis);
                        }
                        event.preventDefault();
                    }
                }
                break;
            case 'f':
            case 'F':
                // Only frame objects if no modifier keys are pressed
                // Cmd+F and Ctrl+F are handled by ToolController for container creation
                if (!event.metaKey && !event.ctrlKey) {
                    this.frameSelectedObject();
                    event.preventDefault();
                }
                break;
        }
    }

    activateTool(toolName) {
        if (!window.modlerComponents?.toolController) {
            return;
        }

        // Switch to the tool
        window.modlerComponents.toolController.switchToTool(toolName);

        // Update toolbar visual state
        document.querySelectorAll('.toolbar-button').forEach(btn => btn.classList.remove('active'));
        document.getElementById(`${toolName}-tool`)?.classList.add('active');

        // Notify Svelte toolbar of tool change
        if (window.notifyToolStateChanged) {
            window.notifyToolStateChanged();
        }
    }

    frameSelectedObject() {
        if (!window.modlerComponents?.cameraController || !window.modlerComponents?.selectionController) {
            return;
        }

        const selectedObjects = window.modlerComponents.selectionController.getSelectedObjects();

        if (selectedObjects.length === 0) {
            return;
        }

        // Frame the first selected object
        window.modlerComponents.cameraController.frameObject(selectedObjects[0]);
    }

    toggleSnapping() {
        if (!window.modlerComponents?.snapController) {
            return;
        }

        const currentState = window.modlerComponents.snapController.getEnabled();
        window.modlerComponents.snapController.setEnabled(!currentState);
    }

    resetCamera() {
        if (!window.modlerComponents?.cameraController) {
            return;
        }

        window.modlerComponents.cameraController.resetToDefault();
    }

    /**
     * Undo the last action
     */
    undo() {
        const historyManager = window.modlerComponents?.historyManager;
        if (!historyManager) {
            console.warn('KeyboardShortcuts: HistoryManager not available');
            return;
        }

        const success = historyManager.undo();
        if (!success) {
            console.log('KeyboardShortcuts: Nothing to undo');
        }
    }

    /**
     * Redo the last undone action
     */
    redo() {
        const historyManager = window.modlerComponents?.historyManager;
        if (!historyManager) {
            console.warn('KeyboardShortcuts: HistoryManager not available');
            return;
        }

        const success = historyManager.redo();
        if (!success) {
            console.log('KeyboardShortcuts: Nothing to redo');
        }
    }

    /**
     * Delete currently selected objects
     */
    deleteSelectedObjects() {
        const selectionController = window.modlerComponents?.selectionController;
        const historyManager = window.modlerComponents?.historyManager;
        const sceneController = window.modlerComponents?.sceneController;

        if (!selectionController || !historyManager || !sceneController) {
            console.warn('KeyboardShortcuts: Required components not available for deletion');
            return;
        }

        const selectedObjects = selectionController.getSelectedObjects();
        if (selectedObjects.length === 0) {
            console.log('KeyboardShortcuts: No objects selected for deletion');
            return;
        }

        // Get object IDs from selected meshes
        const objectIds = [];
        selectedObjects.forEach(mesh => {
            const objectData = sceneController.getObjectByMesh(mesh);
            if (objectData) {
                objectIds.push(objectData.id);
            }
        });

        if (objectIds.length === 0) {
            console.warn('KeyboardShortcuts: No valid object IDs found for selected objects');
            return;
        }

        // Create and execute delete command
        const deleteCommand = new DeleteObjectCommand(objectIds);
        const success = historyManager.executeCommand(deleteCommand);

        if (success) {
            console.log(`KeyboardShortcuts: Successfully deleted ${objectIds.length} object(s)`);
        } else {
            console.warn('KeyboardShortcuts: Failed to delete selected objects');
        }
    }
}

// Initialize keyboard shortcuts
window.keyboardShortcuts = new KeyboardShortcuts();

// Global functions for backward compatibility
window.setupKeyboardShortcuts = function() {
    // Already initialized
};

window.activateTool = function(toolName) {
    if (window.keyboardShortcuts) {
        window.keyboardShortcuts.activateTool(toolName);
    }
};

window.frameSelectedObject = function() {
    if (window.keyboardShortcuts) {
        window.keyboardShortcuts.frameSelectedObject();
    }
};

window.toggleSnapping = function() {
    if (window.keyboardShortcuts) {
        window.keyboardShortcuts.toggleSnapping();
    }
};

window.resetCamera = function() {
    if (window.keyboardShortcuts) {
        window.keyboardShortcuts.resetCamera();
    }
};