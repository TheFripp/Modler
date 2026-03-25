/**
 * KeyboardRouter - Centralized Keyboard Input Management
 *
 * Single source of truth for all keyboard input across main application and UI panels.
 * Implements priority-based delegation system to prevent competing listeners.
 *
 * Priority Order:
 * 1. Active input fields (highest priority - allow native behavior)
 * 2. Active tool keyboard handlers (tool-specific shortcuts)
 * 3. Global commands (Cmd+Z, Cmd+F, Tab, etc.)
 * 4. Tool switching shortcuts (Q/W/E/R/T)
 * 5. Otherwise ignored
 */

class KeyboardRouter {
    constructor() {
        // Component references
        this.selectionController = null;
        this.sceneController = null;
        this.toolController = null;
        this.propertyPanelSync = null;
        this.measurementTool = null;
        this.historyManager = null;

        // Field navigation workflows (from field-navigation-manager)
        this.navigationWorkflows = new Map(); // toolName -> { fieldOrder, onFieldFocus, onFieldApply, onWorkflowComplete, currentFieldIndex }

        // Key state tracking
        this.keys = new Set();

        // Bind handlers
        this.handleKeyDown = this.onKeyDown.bind(this);
        this.handleKeyUp = this.onKeyUp.bind(this);
    }

    /**
     * Initialize the keyboard router with component references
     */
    initialize(components) {
        this.selectionController = components.selectionController;
        this.sceneController = components.sceneController;
        this.toolController = components.toolController;
        this.propertyPanelSync = components.propertyPanelSync;
        this.measurementTool = components.measurementTool;
        this.historyManager = components.historyManager;

        // Setup single global keyboard listener (capture phase for highest priority)
        document.addEventListener('keydown', this.handleKeyDown, true);
        document.addEventListener('keyup', this.handleKeyUp, false);

        // Listen for forwarded keyboard events from iframe panels
        window.addEventListener('message', this.handleIframeKeyboardEvent.bind(this));
    }

    /**
     * Handle keyboard events forwarded from iframe panels
     * @param {MessageEvent} event - PostMessage event from iframe
     */
    handleIframeKeyboardEvent(event) {
        // Only handle keyboard-event messages
        if (event.data?.type !== 'keyboard-event') return;

        const { key, code } = event.data;

        // Handle Tab key forwarded from property panel
        if (key === 'Tab') {
            // Create a synthetic KeyboardEvent to process through normal flow
            const syntheticEvent = new KeyboardEvent('keydown', {
                key: 'Tab',
                code: 'Tab',
                bubbles: true,
                cancelable: true
            });

            // Process through normal Tab handling
            this.handleTabKey(syntheticEvent);
        }
    }


    /**
     * Register field navigation workflow for a tool (from field-navigation-manager)
     * @param {string} toolName - Name of the tool
     * @param {Object} config - Navigation configuration
     * @param {Array} config.fieldOrder - Array of field IDs in tab order
     * @param {Function} config.onFieldFocus - Called when field receives focus
     * @param {Function} config.onFieldApply - Called when Tab/Enter pressed on field
     * @param {Function} config.onWorkflowComplete - Called when navigation completes
     */
    registerNavigationWorkflow(toolName, config) {
        this.navigationWorkflows.set(toolName, {
            fieldOrder: config.fieldOrder || [],
            onFieldFocus: config.onFieldFocus || (() => {}),
            onFieldApply: config.onFieldApply || (() => {}),
            onWorkflowComplete: config.onWorkflowComplete || (() => {}),
            currentFieldIndex: -1
        });
    }

    /**
     * Unregister navigation workflow for a tool
     * @param {string} toolName - Name of the tool to unregister
     */
    unregisterNavigationWorkflow(toolName) {
        this.navigationWorkflows.delete(toolName);
    }

    /**
     * Check if an input field is currently focused
     * @returns {boolean}
     */
    isInputFocused() {
        const activeElement = document.activeElement;
        return activeElement && (
            activeElement.tagName === 'INPUT' ||
            activeElement.tagName === 'TEXTAREA' ||
            activeElement.contentEditable === 'true'
        );
    }

    /**
     * Main keydown event handler with priority-based routing
     */
    onKeyDown(event) {
        const code = event.code;
        const key = event.key;

        // Track key state
        if (!this.keys.has(code)) {
            this.keys.add(code);
        }

        // PRIORITY 1: Input fields - handle workflow navigation or allow native behavior
        if (this.isInputFocused()) {
            const activeElement = document.activeElement;

            // Handle Tab/Enter for workflow navigation within input fields
            if (key === 'Tab' || key === 'Enter') {
                for (const [toolName, workflow] of this.navigationWorkflows) {
                    const fieldIndex = workflow.fieldOrder.indexOf(activeElement.id);
                    if (fieldIndex !== -1) {
                        event.preventDefault();
                        this.processFieldNavigation(toolName, workflow, activeElement, fieldIndex, event);
                        return;
                    }
                }
            }

            // Otherwise allow native input behavior
            return;
        }

        // PRIORITY 2: Active tool keyboard handlers (for tools that need event-driven behavior)
        // Direct method call to tool - no registration needed
        if (this.toolController) {
            const activeTool = this.toolController.getActiveTool();
            if (activeTool && activeTool.onKeyDown && activeTool.onKeyDown(event)) {
                return; // Tool handled the event
            }
        }

        // PRIORITY 3: Global commands (Cmd/Ctrl shortcuts)
        if (event.metaKey || event.ctrlKey) {
            if (this.handleGlobalCommand(event)) {
                return; // Command handled
            }
        }

        // PRIORITY 4: Tab key for input field focus
        if (code === 'Tab') {
            event.preventDefault();
            this.handleTabKey(event);
            return;
        }

        // PRIORITY 5: Escape key - navigate up or clear selection
        // Delegates to handleEmptySpaceClick which routes through NavigationController:
        // in container context → navigateUp(), at root → clearSelection()
        if (code === 'Escape') {
            event.preventDefault();
            if (this.selectionController) {
                this.selectionController.handleEmptySpaceClick(event);
            }
            return;
        }

        // PRIORITY 5.5: Delete/Backspace - delete selected objects
        if (code === 'Delete' || code === 'Backspace') {
            event.preventDefault(); // Prevent browser back navigation on Backspace
            if (this.toolController) {
                this.toolController.deleteSelectedObjects();
            }
            return;
        }

        // PRIORITY 6: Tool switching shortcuts (if no modifier keys)
        if (!event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey) {
            if (this.handleToolSwitch(code)) {
                return; // Tool switched
            }
        }
    }

    /**
     * Handle global commands (Cmd+Z, Cmd+F, Cmd+D, etc.)
     * @returns {boolean} True if command was handled
     */
    handleGlobalCommand(event) {
        const code = event.code;

        // Cmd+F: Wrap selected objects in container
        if (code === 'KeyF') {
            event.preventDefault();
            if (this.toolController) {
                this.toolController.createLayoutContainer();
            }
            return true;
        }

        // Cmd+Z: Undo
        if (code === 'KeyZ' && !event.shiftKey) {
            event.preventDefault();
            if (this.historyManager) {
                this.historyManager.undo();
            }
            return true;
        }

        // Cmd+Shift+Z or Cmd+Y: Redo
        if ((code === 'KeyZ' && event.shiftKey) || code === 'KeyY') {
            event.preventDefault();
            if (this.historyManager) {
                this.historyManager.redo();
            }
            return true;
        }

        // Cmd+D: Duplicate selected object
        if (code === 'KeyD') {
            event.preventDefault();
            if (this.historyManager && this.sceneController && this.selectionController) {
                const selectedObjects = this.selectionController.getSelectedObjects();
                if (selectedObjects && selectedObjects.length > 0) {
                    const mesh = selectedObjects[0];
                    const objectData = this.sceneController.getObjectByMesh(mesh);
                    if (objectData) {
                        const command = new DuplicateObjectCommand(objectData.id);
                        this.historyManager.executeCommand(command);
                    }
                }
            }
            return true;
        }

        return false;
    }

    /**
     * Handle Tab key for input field focus and workflow navigation
     * Priority:
     * 1. If any tool has active workflow -> start workflow
     * 2. If tool recorded last manipulation -> focus that property (move tool position, push tool dimension)
     * 3. If measurement tool showing -> focus that axis
     * 4. If object selected -> focus first dimension input
     */
    handleTabKey(event) {
        // Priority 1: Check if any tool has an active workflow (like during drag operations)
        for (const [toolName, workflow] of this.navigationWorkflows) {
            if (toolName.includes('drag') || toolName.includes('tool')) {
                event.preventDefault();
                this.startWorkflow(toolName, 0);
                return;
            }
        }

        // Priority 2: Focus last manipulated property (e.g., dimension.x after push tool)
        const inputFocusManager = window.inputFocusManager;
        if (inputFocusManager) {
            const lastManipulated = inputFocusManager.getLastManipulated();
            if (lastManipulated) {
                // Notify property panel iframe to focus input
                this.notifyPropertyPanelFocus(lastManipulated.objectId, lastManipulated.property);
                return;
            }
        }
    }

    /**
     * Notify property panel iframe to focus a specific input
     * @param {string} objectId - Object ID
     * @param {string} property - Property path (e.g., "dimensions.x")
     */
    notifyPropertyPanelFocus(objectId, property) {
        // ARCHITECTURE: Property panel IS in an iframe (loaded via DirectComponentManager)
        // Get the iframe reference from directComponentManager
        const directComponentManager = window.modlerComponents?.directComponentManager;

        if (directComponentManager && directComponentManager.componentInstances?.propertyPanel) {
            const iframe = directComponentManager.componentInstances.propertyPanel.iframe;

            if (iframe && iframe.contentWindow) {
                iframe.contentWindow.postMessage({
                    type: 'focus-input',
                    objectId: objectId,
                    property: property
                }, '*');
            }
        }
    }

    /**
     * Start navigation workflow for a tool (from field-navigation-manager)
     * @param {string} toolName - Tool name
     * @param {number} startIndex - Starting field index (default: 0)
     * @returns {boolean} Success
     */
    startWorkflow(toolName, startIndex = 0) {
        const workflow = this.navigationWorkflows.get(toolName);
        if (!workflow || !workflow.fieldOrder.length) return false;

        const fieldId = workflow.fieldOrder[startIndex];
        const field = document.getElementById(fieldId);
        if (!field) return false;

        this.focusAndSelectText(field);
        workflow.currentFieldIndex = startIndex;
        workflow.onFieldFocus(fieldId, startIndex);
        return true;
    }

    /**
     * Process field navigation within a workflow (Enter/Tab in input field)
     * @param {string} toolName - Tool name
     * @param {Object} workflow - Navigation workflow
     * @param {HTMLElement} currentField - Currently focused field
     * @param {number} fieldIndex - Index of current field
     * @param {KeyboardEvent} event - Original keyboard event
     */
    processFieldNavigation(toolName, workflow, currentField, fieldIndex, event) {
        // Apply current field value
        workflow.onFieldApply(currentField.id, currentField.value, event);

        // Move to next field or complete workflow
        const nextIndex = fieldIndex + 1;
        if (nextIndex < workflow.fieldOrder.length) {
            const nextFieldId = workflow.fieldOrder[nextIndex];
            const nextField = document.getElementById(nextFieldId);
            if (nextField) {
                this.focusAndSelectText(nextField);
                workflow.currentFieldIndex = nextIndex;
                workflow.onFieldFocus(nextFieldId, nextIndex);
            }
        } else {
            // Workflow complete
            workflow.onWorkflowComplete();
            workflow.currentFieldIndex = -1;
        }
    }

    /**
     * Focus field and select all text
     * @param {HTMLElement} field - Input field to focus
     */
    focusAndSelectText(field) {
        if (!field) return;

        field.focus();
        if (field.select) {
            field.select();
        } else if (field.setSelectionRange) {
            field.setSelectionRange(0, field.value.length);
        }
    }

    /**
     * Reset workflow state for a tool
     * @param {string} toolName - Tool name
     */
    resetWorkflow(toolName) {
        const workflow = this.navigationWorkflows.get(toolName);
        if (workflow) {
            workflow.currentFieldIndex = -1;
        }
    }

    /**
     * Get current field index for a tool
     * @param {string} toolName - Tool name
     * @returns {number} Current field index or -1 if not active
     */
    getCurrentFieldIndex(toolName) {
        const workflow = this.navigationWorkflows.get(toolName);
        return workflow ? workflow.currentFieldIndex : -1;
    }

    /**
     * Handle tool switching shortcuts (Q/W/E/R/T)
     * @returns {boolean} True if tool was switched
     */
    handleToolSwitch(code) {
        if (!this.toolController) return false;

        const toolMap = {
            'KeyQ': 'select',
            'KeyW': 'move',
            'KeyE': 'push',
            'KeyR': 'rotate',
            'KeyT': 'box-creation',
            'KeyY': 'tile',
            'KeyM': 'measure'
        };

        const toolName = toolMap[code];
        if (toolName) {
            // Toggle: if pressing the already-active tool's key, switch back to select
            if (this.toolController.activeToolName === toolName && toolName !== 'select') {
                this.toolController.switchToTool('select');
            } else {
                this.toolController.switchToTool(toolName);
            }
            return true;
        }

        return false;
    }

    /**
     * Main keyup event handler
     */
    onKeyUp(event) {
        const code = event.code;
        this.keys.delete(code);

        // Forward to active tool if it has onKeyUp handler - direct method call
        if (this.toolController) {
            const activeTool = this.toolController.getActiveTool();
            if (activeTool && activeTool.onKeyUp && activeTool.onKeyUp(event)) {
                return; // Tool handled the event
            }
        }
    }

    /**
     * Check if a key is currently pressed
     * @param {string} keyCode - Key code to check
     * @returns {boolean}
     */
    isKeyDown(keyCode) {
        return this.keys.has(keyCode);
    }

    /**
     * Clean up event listeners
     */
    destroy() {
        document.removeEventListener('keydown', this.handleKeyDown, true);
        document.removeEventListener('keyup', this.handleKeyUp, false);
        this.keys.clear();
        this.toolKeyboardHandlers.clear();
        this.navigationWorkflows.clear();
    }
}

// Create singleton instance
const keyboardRouter = new KeyboardRouter();

// Export for use in main application
window.KeyboardRouter = KeyboardRouter;
window.keyboardRouter = keyboardRouter;
