/**
 * FieldNavigationManager - Centralized Tab Navigation System
 * Handles Tab key navigation between input fields with tool-specific workflows
 * Used by tools like BoxCreationTool for dimension field navigation
 */
class FieldNavigationManager {
    constructor() {
        this.navigationHandlers = new Map();
        this.setupGlobalTabListener();
    }

    /**
     * Register field navigation workflow for a tool
     * @param {string} toolName - Name of the tool
     * @param {Object} config - Navigation configuration
     * @param {Array} config.fieldOrder - Array of field IDs in tab order
     * @param {Function} config.onFieldFocus - Called when field receives focus
     * @param {Function} config.onFieldApply - Called when Tab/Enter pressed on field
     * @param {Function} config.onWorkflowComplete - Called when navigation completes
     */
    registerNavigationWorkflow(toolName, config) {
        this.navigationHandlers.set(toolName, {
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
        this.navigationHandlers.delete(toolName);
    }

    /**
     * Setup global Tab key listener
     */
    setupGlobalTabListener() {
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Tab' || event.key === 'Enter') {
                this.handleKeyPress(event);
            }
        });
    }

    /**
     * Handle Tab/Enter key press
     * @param {KeyboardEvent} event - Keyboard event
     */
    handleKeyPress(event) {
        const activeElement = document.activeElement;
        if (!activeElement || activeElement.tagName !== 'INPUT') return;

        // Find which tool workflow this field belongs to
        for (const [toolName, handler] of this.navigationHandlers) {
            const fieldIndex = handler.fieldOrder.indexOf(activeElement.id);
            if (fieldIndex !== -1) {
                event.preventDefault();
                this.processFieldNavigation(toolName, handler, activeElement, fieldIndex, event);
                break;
            }
        }
    }

    /**
     * Process field navigation for specific tool
     * @param {string} toolName - Tool name
     * @param {Object} handler - Navigation handler
     * @param {HTMLElement} currentField - Currently focused field
     * @param {number} fieldIndex - Index of current field
     * @param {KeyboardEvent} event - Original keyboard event
     */
    processFieldNavigation(toolName, handler, currentField, fieldIndex, event) {
        // Apply current field value
        handler.onFieldApply(currentField.id, currentField.value, event);

        // Move to next field or complete workflow
        const nextIndex = fieldIndex + 1;
        if (nextIndex < handler.fieldOrder.length) {
            const nextFieldId = handler.fieldOrder[nextIndex];
            const nextField = document.getElementById(nextFieldId);
            if (nextField) {
                this.focusAndSelectText(nextField);
                handler.currentFieldIndex = nextIndex;
                handler.onFieldFocus(nextFieldId, nextIndex);
            }
        } else {
            // Workflow complete
            handler.onWorkflowComplete();
            handler.currentFieldIndex = -1;
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
     * Start navigation workflow for a tool
     * @param {string} toolName - Tool name
     * @param {number} startIndex - Starting field index (default: 0)
     */
    startWorkflow(toolName, startIndex = 0) {
        const handler = this.navigationHandlers.get(toolName);
        if (!handler || !handler.fieldOrder.length) return false;

        const fieldId = handler.fieldOrder[startIndex];
        const field = document.getElementById(fieldId);
        if (!field) return false;

        this.focusAndSelectText(field);
        handler.currentFieldIndex = startIndex;
        handler.onFieldFocus(fieldId, startIndex);
        return true;
    }

    /**
     * Reset workflow state for a tool
     * @param {string} toolName - Tool name
     */
    resetWorkflow(toolName) {
        const handler = this.navigationHandlers.get(toolName);
        if (handler) {
            handler.currentFieldIndex = -1;
        }
    }

    /**
     * Get current field index for a tool
     * @param {string} toolName - Tool name
     * @returns {number} Current field index or -1 if not active
     */
    getCurrentFieldIndex(toolName) {
        const handler = this.navigationHandlers.get(toolName);
        return handler ? handler.currentFieldIndex : -1;
    }

    /**
     * Clean up all navigation handlers
     */
    destroy() {
        this.navigationHandlers.clear();
    }
}

// Export for use in main application
window.FieldNavigationManager = FieldNavigationManager;