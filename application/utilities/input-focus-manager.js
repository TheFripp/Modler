/**
 * InputFocusManager - Track and focus property panel inputs
 *
 * Allows tools (move, push, etc.) to track which property they're manipulating
 * and enables Tab key to jump to that input field in the UI.
 */

class InputFocusManager {
    constructor() {
        this.lastManipulatedProperty = null; // e.g., "position.x", "dimensions.z"
        this.lastManipulatedObjectId = null;

        // Listen for Tab key globally
        this.setupKeyboardListener();
    }

    /**
     * Record which property was manipulated by a tool
     * @param {string} objectId - Object being manipulated
     * @param {string} property - Property path (e.g., "position.x")
     */
    recordManipulation(objectId, property) {
        this.lastManipulatedProperty = property;
        this.lastManipulatedObjectId = objectId;
    }

    /**
     * Get the last manipulated property
     * @returns {{objectId: string, property: string} | null}
     */
    getLastManipulated() {
        if (!this.lastManipulatedProperty || !this.lastManipulatedObjectId) {
            return null;
        }
        return {
            objectId: this.lastManipulatedObjectId,
            property: this.lastManipulatedProperty
        };
    }

    /**
     * Clear the last manipulated tracking
     */
    clear() {
        this.lastManipulatedProperty = null;
        this.lastManipulatedObjectId = null;
    }

    /**
     * Setup keyboard listener for Tab key
     */
    setupKeyboardListener() {
        window.addEventListener('keydown', (e) => {
            // Tab key pressed (not in an input field)
            if (e.key === 'Tab' && !this.isInputFocused()) {
                e.preventDefault();
                this.focusLastManipulatedInput();
            }
        });
    }

    /**
     * Check if an input is currently focused
     */
    isInputFocused() {
        const activeElement = document.activeElement;
        return activeElement && (
            activeElement.tagName === 'INPUT' ||
            activeElement.tagName === 'TEXTAREA' ||
            activeElement.isContentEditable
        );
    }

    /**
     * Focus the last manipulated input in the UI
     */
    focusLastManipulatedInput() {
        const lastManipulated = this.getLastManipulated();
        if (!lastManipulated) {
            return;
        }

        // Send message to UI panels to focus the input
        this.notifyUIToFocus(lastManipulated.objectId, lastManipulated.property);
    }

    /**
     * Notify UI panels to focus a specific input
     */
    notifyUIToFocus(objectId, property) {
        // Emit event for UI to listen to
        window.dispatchEvent(new CustomEvent('modler:focus-input', {
            detail: { objectId, property }
        }));

        // Also send via PostMessage for iframe-based panels
        const panels = document.querySelectorAll('iframe');
        panels.forEach(panel => {
            try {
                panel.contentWindow.postMessage({
                    type: 'focus-input',
                    data: { objectId, property }
                }, '*'); // Use '*' for same-origin iframes
            } catch (error) {
                console.warn('InputFocusManager: Failed to send focus message to panel:', error);
            }
        });
    }
}

// Create singleton instance
const inputFocusManager = new InputFocusManager();

// Make globally available
window.inputFocusManager = inputFocusManager;
window.InputFocusManager = InputFocusManager;

// Register with modlerComponents
if (window.modlerComponents) {
    window.modlerComponents.inputFocusManager = inputFocusManager;
}