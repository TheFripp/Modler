/**
 * Base Face Tool Event Handler - Centralized Mouse Event Processing
 *
 * Provides common mouse event handling patterns shared between face-based tools
 * (MoveTool, PushTool) to eliminate event handling duplication and ensure
 * consistent behavior across all face-based interactions.
 *
 * **Shared Event Patterns:**
 * - Left mouse button validation
 * - Face hover validation and operation start
 * - Operation state management (dragging/pushing)
 * - Selection behavior delegation
 * - Tool lifecycle management
 *
 * @class BaseFaceToolEventHandler
 */
class BaseFaceToolEventHandler {
    /**
     * Initialize centralized event handler
     *
     * @param {Object} tool - The tool instance (MoveTool or PushTool)
     * @param {Object} faceToolBehavior - Shared face detection behavior
     * @param {Object} selectionController - Selection controller for direct access
     */
    constructor(tool, faceToolBehavior, selectionController) {
        this.tool = tool;
        this.faceToolBehavior = faceToolBehavior;
        this.selectionController = selectionController;
    }

    /**
     * Handle mouse down events with operation-specific callbacks
     *
     * @param {Object} hit - Raycast hit result
     * @param {Event} event - Mouse event
     * @param {Object} operationCallbacks - Tool-specific operation callbacks
     * @returns {boolean} True if event was handled
     */
    handleMouseDown(hit, event, operationCallbacks) {
        const {
            isOperationActive,      // Function: () => boolean
            startOperation,         // Function: (hit) => void
            getOperationStateName   // Function: () => string (for debugging)
        } = operationCallbacks;

        // Only handle left mouse button
        if (event.button !== 0) return false;

        // Don't start new operations if one is already active
        if (isOperationActive()) return false;

        // Use shared face validation and start operation if valid
        if (this.faceToolBehavior.hasValidFaceHover(hit)) {
            startOperation(hit);
            return true;
        }

        return false;
    }

    /**
     * Handle mouse up events with operation-specific callbacks
     *
     * @param {Object} hit - Raycast hit result
     * @param {Event} event - Mouse event
     * @param {Object} operationCallbacks - Tool-specific operation callbacks
     * @returns {boolean} True if event was handled
     */
    handleMouseUp(hit, event, operationCallbacks) {
        const {
            isOperationActive,    // Function: () => boolean
            endOperation         // Function: () => void
        } = operationCallbacks;

        if (isOperationActive()) {
            endOperation();
            return true;
        }

        return false;
    }

    /**
     * Handle click events with operation state checking
     *
     * @param {Object} hit - Raycast hit result
     * @param {Event} event - Mouse event
     * @param {Object} operationCallbacks - Tool-specific operation callbacks
     */
    handleClick(hit, event, operationCallbacks) {
        const { isOperationActive } = operationCallbacks;

        // Only handle clicks if no operation is active
        if (isOperationActive()) return;

        if (hit && hit.object) {
            this.selectionController.handleObjectClick(hit.object, event, { toolType: this.tool.constructor.name });
        } else {
            this.selectionController.handleEmptySpaceClick(event);
        }
    }

    /**
     * Handle double-click events with operation state checking
     *
     * @param {Object} hit - Raycast hit result
     * @param {Event} event - Mouse event
     * @param {Object} operationCallbacks - Tool-specific operation callbacks
     */
    handleDoubleClick(hit, event, operationCallbacks) {
        const { isOperationActive } = operationCallbacks;

        // Only handle double-clicks if no operation is active
        if (isOperationActive()) return;

        this.selectionController.handleDoubleClick(hit, event);
    }

    /**
     * Handle tool activation with operation-specific setup
     *
     * @param {Object} activationCallbacks - Tool-specific activation callbacks
     */
    handleToolActivate(activationCallbacks = {}) {
        const {
            beforeActivation,    // Function: () => void (optional)
            afterActivation     // Function: () => void (optional)
        } = activationCallbacks;

        if (beforeActivation) {
            beforeActivation();
        }

        // Common activation logic could go here
        // (currently minimal, but extensible)

        if (afterActivation) {
            afterActivation();
        }
    }

    /**
     * Handle tool deactivation with operation cleanup
     *
     * @param {Object} deactivationCallbacks - Tool-specific deactivation callbacks
     */
    handleToolDeactivate(deactivationCallbacks) {
        const {
            isOperationActive,    // Function: () => boolean
            endOperation,        // Function: () => void
            beforeDeactivation,  // Function: () => void (optional)
            afterDeactivation   // Function: () => void (optional)
        } = deactivationCallbacks;

        if (beforeDeactivation) {
            beforeDeactivation();
        }

        // Clear hover state
        this.faceToolBehavior.clearHover();

        // End any active operations
        if (isOperationActive()) {
            endOperation();
        }

        if (afterDeactivation) {
            afterDeactivation();
        }
    }

    /**
     * Create operation callbacks object for consistent interface
     *
     * @param {Object} config - Configuration for callbacks
     * @returns {Object} Standardized callbacks object
     */
    static createOperationCallbacks(config) {
        const {
            isActiveCheck,        // Function to check if operation is active
            startCallback,        // Function to start operation
            endCallback,         // Function to end operation
            operationName = 'operation' // Name for debugging
        } = config;

        return {
            isOperationActive: isActiveCheck,
            startOperation: startCallback,
            endOperation: endCallback,
            getOperationStateName: () => operationName
        };
    }

    /**
     * Create activation callbacks object for consistent interface
     *
     * @param {Object} config - Configuration for callbacks
     * @returns {Object} Standardized callbacks object
     */
    static createActivationCallbacks(config = {}) {
        return {
            beforeActivation: config.beforeActivation || null,
            afterActivation: config.afterActivation || null
        };
    }

    /**
     * Create deactivation callbacks object for consistent interface
     *
     * @param {Object} config - Configuration for callbacks
     * @returns {Object} Standardized callbacks object
     */
    static createDeactivationCallbacks(config) {
        const {
            isActiveCheck,
            endCallback,
            beforeDeactivation,
            afterDeactivation
        } = config;

        return {
            isOperationActive: isActiveCheck,
            endOperation: endCallback,
            beforeDeactivation: beforeDeactivation || null,
            afterDeactivation: afterDeactivation || null
        };
    }
}

// Export for use in tools
window.BaseFaceToolEventHandler = BaseFaceToolEventHandler;