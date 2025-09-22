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