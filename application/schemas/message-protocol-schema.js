/**
 * PostMessage Protocol Schema
 *
 * Central schema defining all PostMessage communication between:
 * - Main application ↔ Svelte UI iframes
 * - Main application ↔ Direct-mounted Svelte components
 *
 * This schema:
 * - Defines all valid message types
 * - Specifies required/optional payload fields
 * - Validates payload data types
 * - Documents request-response pairings
 * - Prevents "missing handler" bugs
 *
 * Version: 1.0.0
 */

const MESSAGE_PROTOCOL_VERSION = '1.0.0';

/**
 * Message direction constants
 */
const MESSAGE_DIRECTION = {
    UI_TO_MAIN: 'ui-to-main',      // From Svelte UI to main app
    MAIN_TO_UI: 'main-to-ui',      // From main app to Svelte UI
    BIDIRECTIONAL: 'bidirectional' // Can go both ways
};

/**
 * Data type validators
 */
const DATA_TYPES = {
    STRING: 'string',
    NUMBER: 'number',
    BOOLEAN: 'boolean',
    OBJECT: 'object',
    ARRAY: 'array',
    ANY: 'any',
    STRING_OR_NULL: 'string|null',
    NUMBER_OR_STRING: 'number|string',
    NUMBER_OR_UNDEFINED: 'number|undefined',
    OBJECT_ARRAY: 'object[]'
};

/**
 * Complete PostMessage Protocol Schema
 * Each message type defines:
 * - direction: Who can send this message
 * - payload: Required and optional fields with types
 * - response: Expected response message (if any)
 * - description: What this message does
 */
const MESSAGE_PROTOCOL_SCHEMA = {
    // ===========================
    // PROPERTY UPDATES
    // ===========================

    'property-update': {
        direction: MESSAGE_DIRECTION.UI_TO_MAIN,
        description: 'Update a single property on an object',
        payload: {
            objectId: { type: DATA_TYPES.NUMBER_OR_STRING, required: true },
            property: { type: DATA_TYPES.STRING, required: true },
            value: { type: DATA_TYPES.ANY, required: true },
            source: { type: DATA_TYPES.STRING, required: false }
        },
        response: null // No direct response - updates come via data-update
    },

    // ===========================
    // TOOL MANAGEMENT
    // ===========================

    'tool-activation': {
        direction: MESSAGE_DIRECTION.UI_TO_MAIN,
        description: 'Activate a specific tool',
        payload: {
            toolName: { type: DATA_TYPES.STRING, required: true }
        },
        response: 'tool-state-update'
    },

    'create-layout-container': {
        direction: MESSAGE_DIRECTION.UI_TO_MAIN,
        description: 'Wrap selected objects in a container',
        payload: {},
        response: null
    },

    'undo': {
        direction: MESSAGE_DIRECTION.UI_TO_MAIN,
        description: 'Undo last command',
        payload: {},
        response: null
    },

    'redo': {
        direction: MESSAGE_DIRECTION.UI_TO_MAIN,
        description: 'Redo last undone command',
        payload: {},
        response: null
    },

    'tool-switch': {
        direction: MESSAGE_DIRECTION.UI_TO_MAIN,
        description: 'Switch to a different tool',
        payload: {
            toolName: { type: DATA_TYPES.STRING, required: true }
        },
        response: null
    },

    'clear-selection': {
        direction: MESSAGE_DIRECTION.UI_TO_MAIN,
        description: 'Clear all selected objects',
        payload: {},
        response: null
    },

    'duplicate-object': {
        direction: MESSAGE_DIRECTION.UI_TO_MAIN,
        description: 'Duplicate selected object(s)',
        payload: {},
        response: null
    },

    'tool-state-update': {
        direction: MESSAGE_DIRECTION.MAIN_TO_UI,
        description: 'Notify UI of current tool state',
        payload: {
            toolState: {
                type: DATA_TYPES.OBJECT,
                required: true,
                schema: {
                    activeTool: { type: DATA_TYPES.STRING, required: true }
                }
            },
            snapEnabled: { type: DATA_TYPES.BOOLEAN, required: false }
        },
        response: null
    },

    'snap-toggle': {
        direction: MESSAGE_DIRECTION.UI_TO_MAIN,
        description: 'Toggle snapping on/off',
        payload: {},
        response: 'tool-state-update'
    },

    // ===========================
    // FILL BUTTONS (Layout System)
    // ===========================

    'fill-button-check': {
        direction: MESSAGE_DIRECTION.UI_TO_MAIN,
        description: 'Check if fill buttons should be shown for an object',
        payload: {
            objectId: { type: DATA_TYPES.NUMBER_OR_STRING, required: true }
        },
        response: 'fill-button-check-response'
    },

    'fill-button-check-response': {
        direction: MESSAGE_DIRECTION.MAIN_TO_UI,
        description: 'Response with fill button visibility',
        payload: {
            objectId: { type: DATA_TYPES.NUMBER_OR_STRING, required: true },
            shouldShow: { type: DATA_TYPES.BOOLEAN, required: true }
        },
        response: null
    },

    'fill-button-get-states': {
        direction: MESSAGE_DIRECTION.UI_TO_MAIN,
        description: 'Get current fill button states for axes',
        payload: {
            objectId: { type: DATA_TYPES.NUMBER_OR_STRING, required: true }
        },
        response: 'fill-button-states-response'
    },

    'fill-button-states-response': {
        direction: MESSAGE_DIRECTION.MAIN_TO_UI,
        description: 'Response with fill button states',
        payload: {
            objectId: { type: DATA_TYPES.NUMBER_OR_STRING, required: true },
            states: {
                type: DATA_TYPES.OBJECT,
                required: true,
                schema: {
                    x: { type: DATA_TYPES.BOOLEAN, required: true },
                    y: { type: DATA_TYPES.BOOLEAN, required: true },
                    z: { type: DATA_TYPES.BOOLEAN, required: true }
                }
            }
        },
        response: null
    },

    'fill-button-toggle': {
        direction: MESSAGE_DIRECTION.UI_TO_MAIN,
        description: 'Toggle fill property for an axis',
        payload: {
            objectId: { type: DATA_TYPES.NUMBER_OR_STRING, required: true },
            axis: { type: DATA_TYPES.STRING, required: true } // 'x', 'y', or 'z'
        },
        response: 'fill-button-states-response'
    },

    'fill-button-hover': {
        direction: MESSAGE_DIRECTION.UI_TO_MAIN,
        description: 'Hover over fill button to highlight corresponding face',
        payload: {
            objectId: { type: DATA_TYPES.NUMBER_OR_STRING, required: true },
            axis: { type: DATA_TYPES.STRING, required: true }, // 'x', 'y', or 'z'
            isHovering: { type: DATA_TYPES.BOOLEAN, required: true }
        },
        response: null
    },

    // ===========================
    // OBJECT SELECTION
    // ===========================

    'object-select': {
        direction: MESSAGE_DIRECTION.UI_TO_MAIN,
        description: 'Select an object in the scene (from UI list)',
        payload: {
            objectId: { type: DATA_TYPES.NUMBER, required: true },
            parentContainer: { type: DATA_TYPES.NUMBER_OR_STRING, required: false },
            useNavigationController: { type: DATA_TYPES.BOOLEAN, required: false },
            isShiftClick: { type: DATA_TYPES.BOOLEAN, required: false }
        },
        response: null // Selection state comes via data-update
    },

    'object-move-to-container': {
        direction: MESSAGE_DIRECTION.UI_TO_MAIN,
        description: 'Move an object to a different container or to scene root',
        payload: {
            objectId: { type: DATA_TYPES.NUMBER_OR_STRING, required: true },
            targetContainerId: { type: DATA_TYPES.NUMBER_OR_STRING, required: false }
        },
        response: null // Hierarchy change comes via hierarchy-changed
    },

    'object-container-move-to-container': {
        direction: MESSAGE_DIRECTION.UI_TO_MAIN,
        description: 'Move a container to a different container',
        payload: {
            objectId: { type: DATA_TYPES.NUMBER_OR_STRING, required: true },
            targetContainerId: { type: DATA_TYPES.NUMBER_OR_STRING, required: true }
        },
        response: null // Hierarchy change comes via hierarchy-changed
    },

    'object-move-to-root': {
        direction: MESSAGE_DIRECTION.UI_TO_MAIN,
        description: 'Move an object to scene root (remove from container)',
        payload: {
            objectId: { type: DATA_TYPES.NUMBER_OR_STRING, required: true }
        },
        response: null // Hierarchy change comes via hierarchy-changed
    },

    'object-reorder': {
        direction: MESSAGE_DIRECTION.UI_TO_MAIN,
        description: 'Reorder an object within its parent container or root',
        payload: {
            objectId: { type: DATA_TYPES.NUMBER_OR_STRING, required: true },
            targetId: { type: DATA_TYPES.NUMBER_OR_STRING, required: true },
            position: { type: DATA_TYPES.STRING, required: true }, // 'before' or 'after'
            parentId: { type: DATA_TYPES.NUMBER_OR_STRING, required: false } // null for root
        },
        response: null // Hierarchy change comes via hierarchy-changed
    },

    'request-hierarchy-refresh': {
        direction: MESSAGE_DIRECTION.UI_TO_MAIN,
        description: 'Request an immediate hierarchy refresh from main window',
        payload: {},
        response: null
    },

    'left-panel-ready': {
        direction: MESSAGE_DIRECTION.UI_TO_MAIN,
        description: 'Left panel has loaded and is ready to receive data',
        payload: {},
        response: null // Triggers immediate hierarchy refresh
    },

    // ===========================
    // LAYOUT MODE
    // ===========================

    'check-layout-mode': {
        direction: MESSAGE_DIRECTION.UI_TO_MAIN,
        description: 'Check if object is in a layout-enabled container',
        payload: {
            objectId: { type: DATA_TYPES.NUMBER_OR_STRING, required: true }
        },
        response: 'layout-mode-response'
    },

    'layout-mode-response': {
        direction: MESSAGE_DIRECTION.MAIN_TO_UI,
        description: 'Response with layout mode status',
        payload: {
            objectId: { type: DATA_TYPES.NUMBER_OR_STRING, required: true },
            inLayoutMode: { type: DATA_TYPES.BOOLEAN, required: true }
        },
        response: null
    },

    'create-tiled-container': {
        direction: MESSAGE_DIRECTION.UI_TO_MAIN,
        description: 'Create a tiled array container from an object',
        payload: {
            objectId: { type: DATA_TYPES.NUMBER_OR_STRING, required: true },
            axis: { type: DATA_TYPES.STRING, required: true }, // 'x', 'y', or 'z'
            repeat: { type: DATA_TYPES.NUMBER, required: true }, // Number of instances (minimum 2)
            gap: { type: DATA_TYPES.NUMBER, required: true } // Gap between instances
        },
        response: null // Container creation result comes via hierarchy updates
    },

    // ===========================
    // SETTINGS MANAGEMENT
    // ===========================

    'cad-wireframe-settings-changed': {
        direction: MESSAGE_DIRECTION.UI_TO_MAIN,
        description: 'Update CAD wireframe visual settings',
        payload: {
            settings: {
                type: DATA_TYPES.OBJECT,
                required: true,
                schema: {
                    color: { type: DATA_TYPES.STRING, required: false },
                    opacity: { type: DATA_TYPES.NUMBER, required: false },
                    lineWidth: { type: DATA_TYPES.NUMBER, required: false }
                }
            }
        },
        response: null
    },

    'get-cad-wireframe-settings': {
        direction: MESSAGE_DIRECTION.UI_TO_MAIN,
        description: 'Request current CAD wireframe settings',
        payload: {},
        response: 'cad-wireframe-settings-response'
    },

    'cad-wireframe-settings-response': {
        direction: MESSAGE_DIRECTION.MAIN_TO_UI,
        description: 'Response with current CAD wireframe settings',
        payload: {
            settings: {
                type: DATA_TYPES.OBJECT,
                required: true,
                schema: {
                    color: { type: DATA_TYPES.STRING, required: true },
                    opacity: { type: DATA_TYPES.NUMBER, required: true },
                    lineWidth: { type: DATA_TYPES.NUMBER, required: true }
                }
            }
        },
        response: null
    },

    'visual-settings-changed': {
        direction: MESSAGE_DIRECTION.UI_TO_MAIN,
        description: 'Update visual settings (selection, containers)',
        payload: {
            settings: { type: DATA_TYPES.OBJECT, required: true }
        },
        response: null
    },

    'get-visual-settings': {
        direction: MESSAGE_DIRECTION.UI_TO_MAIN,
        description: 'Request current visual settings',
        payload: {},
        response: 'visual-settings-response'
    },

    'visual-settings-response': {
        direction: MESSAGE_DIRECTION.MAIN_TO_UI,
        description: 'Response with current visual settings',
        payload: {
            settings: { type: DATA_TYPES.OBJECT, required: true }
        },
        response: null
    },

    'scene-settings-changed': {
        direction: MESSAGE_DIRECTION.UI_TO_MAIN,
        description: 'Update scene settings (background, grid)',
        payload: {
            settings: { type: DATA_TYPES.OBJECT, required: true }
        },
        response: null
    },

    'get-scene-settings': {
        direction: MESSAGE_DIRECTION.UI_TO_MAIN,
        description: 'Request current scene settings',
        payload: {},
        response: 'scene-settings-response'
    },

    'scene-settings-response': {
        direction: MESSAGE_DIRECTION.MAIN_TO_UI,
        description: 'Response with current scene settings',
        payload: {
            settings: { type: DATA_TYPES.OBJECT, required: true }
        },
        response: null
    },

    'interface-settings-changed': {
        direction: MESSAGE_DIRECTION.UI_TO_MAIN,
        description: 'Update interface settings (accent color, toolbar opacity)',
        payload: {
            settings: { type: DATA_TYPES.OBJECT, required: true }
        },
        response: null
    },

    'get-interface-settings': {
        direction: MESSAGE_DIRECTION.UI_TO_MAIN,
        description: 'Request current interface settings',
        payload: {},
        response: 'interface-settings-response'
    },

    'interface-settings-response': {
        direction: MESSAGE_DIRECTION.MAIN_TO_UI,
        description: 'Response with current interface settings',
        payload: {
            settings: { type: DATA_TYPES.OBJECT, required: true }
        },
        response: null
    },

    // ===========================
    // DATA SYNCHRONIZATION
    // ===========================

    'data-update': {
        direction: MESSAGE_DIRECTION.MAIN_TO_UI,
        description: 'Send updated object data to UI',
        payload: {
            updateType: { type: DATA_TYPES.STRING, required: true },
            selectedObjects: { type: DATA_TYPES.OBJECT_ARRAY, required: false },
            objectHierarchy: { type: DATA_TYPES.OBJECT_ARRAY, required: false },
            timestamp: { type: DATA_TYPES.NUMBER, required: false }
        },
        response: null
    },

    'selection-change': {
        direction: MESSAGE_DIRECTION.BIDIRECTIONAL,
        description: 'Notify of selection changes',
        payload: {
            selectedObjects: { type: DATA_TYPES.OBJECT_ARRAY, required: true }
        },
        response: null
    },

    'hierarchy-changed': {
        direction: MESSAGE_DIRECTION.MAIN_TO_UI,
        description: 'Notify that object hierarchy has changed',
        payload: {
            objectHierarchy: { type: DATA_TYPES.OBJECT_ARRAY, required: true }
        },
        response: null
    },

    // ===========================
    // GEOMETRY UPDATES
    // ===========================

    'object-modified-geometry': {
        direction: MESSAGE_DIRECTION.MAIN_TO_UI,
        description: 'Object geometry (dimensions) changed',
        payload: {
            selectedObjects: { type: DATA_TYPES.OBJECT_ARRAY, required: true }
        },
        response: null
    },

    'object-modified-material': {
        direction: MESSAGE_DIRECTION.MAIN_TO_UI,
        description: 'Object material (color, opacity) changed',
        payload: {
            selectedObjects: { type: DATA_TYPES.OBJECT_ARRAY, required: true }
        },
        response: null
    }
};

/**
 * Message Protocol Validator
 */
class MessageProtocolValidator {
    constructor(schema = MESSAGE_PROTOCOL_SCHEMA) {
        this.schema = schema;
        this.stats = {
            messagesValidated: 0,
            validationErrors: 0,
            unknownMessageTypes: 0
        };
    }

    /**
     * Validate a message against the schema
     * @param {string} type - Message type
     * @param {Object} data - Message payload
     * @param {string} direction - Message direction (optional)
     * @returns {Object} { isValid: boolean, errors: string[] }
     */
    validate(type, data, direction = null) {
        this.stats.messagesValidated++;

        // Check if message type exists in schema
        if (!this.schema[type]) {
            this.stats.unknownMessageTypes++;
            return {
                isValid: false,
                errors: [`Unknown message type: "${type}". Did you forget to add it to MESSAGE_PROTOCOL_SCHEMA?`]
            };
        }

        const messageSchema = this.schema[type];
        const errors = [];

        // Validate direction (if provided)
        if (direction && messageSchema.direction !== MESSAGE_DIRECTION.BIDIRECTIONAL) {
            if (messageSchema.direction !== direction) {
                errors.push(`Invalid direction for "${type}": expected ${messageSchema.direction}, got ${direction}`);
            }
        }

        // Validate payload
        const payloadErrors = this.validatePayload(data, messageSchema.payload, type);
        errors.push(...payloadErrors);

        if (errors.length > 0) {
            this.stats.validationErrors++;
        }

        return {
            isValid: errors.length === 0,
            errors: errors
        };
    }

    /**
     * Validate payload against schema
     * @private
     */
    validatePayload(data, payloadSchema, messageType) {
        const errors = [];

        if (!payloadSchema) return errors; // No payload schema = any payload is valid
        if (!data) data = {}; // Treat missing data as empty object

        // Check required fields
        for (const [fieldName, fieldDef] of Object.entries(payloadSchema)) {
            if (fieldDef.required && !(fieldName in data)) {
                errors.push(`Missing required field "${fieldName}" in "${messageType}"`);
                continue;
            }

            // Validate field type if present
            if (fieldName in data) {
                const fieldErrors = this.validateFieldType(data[fieldName], fieldDef, fieldName, messageType);
                errors.push(...fieldErrors);
            }
        }

        return errors;
    }

    /**
     * Validate field type
     * @private
     */
    validateFieldType(value, fieldDef, fieldName, messageType) {
        const errors = [];
        const expectedType = fieldDef.type;

        // Handle null/undefined optional types
        if (expectedType === DATA_TYPES.STRING_OR_NULL && value === null) return errors;
        if (expectedType === DATA_TYPES.NUMBER_OR_UNDEFINED && value === undefined) return errors;

        // Handle union types (number|string)
        if (expectedType === DATA_TYPES.NUMBER_OR_STRING) {
            // Allow null for optional fields
            if (value === null && !fieldDef.required) return errors;

            const actualType = typeof value;
            if (actualType !== 'number' && actualType !== 'string') {
                errors.push(`Field "${fieldName}" in "${messageType}" has wrong type: expected number or string, got ${actualType}`);
            }
            return errors;
        }

        // Validate basic types
        const actualType = Array.isArray(value) ? 'array' : typeof value;

        if (expectedType === DATA_TYPES.ANY) {
            return errors; // Any type is valid
        }

        if (expectedType === DATA_TYPES.OBJECT_ARRAY) {
            if (!Array.isArray(value)) {
                errors.push(`Field "${fieldName}" in "${messageType}" should be an array, got ${actualType}`);
            } else if (value.length > 0 && typeof value[0] !== 'object') {
                errors.push(`Field "${fieldName}" in "${messageType}" should be an array of objects`);
            }
            return errors;
        }

        if (expectedType !== actualType) {
            errors.push(`Field "${fieldName}" in "${messageType}" has wrong type: expected ${expectedType}, got ${actualType}`);
        }

        // Validate nested schema if present
        if (fieldDef.schema && typeof value === 'object' && !Array.isArray(value)) {
            const nestedErrors = this.validatePayload(value, fieldDef.schema, `${messageType}.${fieldName}`);
            errors.push(...nestedErrors);
        }

        return errors;
    }

    /**
     * Get expected response message type for a request
     * @param {string} requestType - Request message type
     * @returns {string|null} Response message type or null
     */
    getExpectedResponse(requestType) {
        const messageSchema = this.schema[requestType];
        return messageSchema ? messageSchema.response : null;
    }

    /**
     * Get all message types by direction
     * @param {string} direction - MESSAGE_DIRECTION constant
     * @returns {string[]} Array of message types
     */
    getMessagesByDirection(direction) {
        return Object.entries(this.schema)
            .filter(([type, schema]) => schema.direction === direction || schema.direction === MESSAGE_DIRECTION.BIDIRECTIONAL)
            .map(([type]) => type);
    }

    /**
     * Get statistics
     * @returns {Object} Statistics object
     */
    getStats() {
        return {
            ...this.stats,
            validationSuccessRate: this.stats.messagesValidated > 0 ?
                ((this.stats.messagesValidated - this.stats.validationErrors) / this.stats.messagesValidated * 100).toFixed(1) + '%' : '0%'
        };
    }

    /**
     * Generate documentation for all message types
     * @returns {string} Markdown documentation
     */
    generateDocumentation() {
        let doc = `# PostMessage Protocol Documentation\n\n`;
        doc += `Version: ${MESSAGE_PROTOCOL_VERSION}\n\n`;
        doc += `Total message types: ${Object.keys(this.schema).length}\n\n`;

        // Group by direction
        for (const direction of Object.values(MESSAGE_DIRECTION)) {
            const messages = this.getMessagesByDirection(direction);
            if (messages.length === 0) continue;

            doc += `## ${direction.toUpperCase()} Messages (${messages.length})\n\n`;

            for (const messageType of messages) {
                const schema = this.schema[messageType];
                doc += `### \`${messageType}\`\n\n`;
                doc += `${schema.description}\n\n`;

                if (schema.payload && Object.keys(schema.payload).length > 0) {
                    doc += `**Payload:**\n\n`;
                    for (const [field, def] of Object.entries(schema.payload)) {
                        const required = def.required ? '(required)' : '(optional)';
                        doc += `- \`${field}\`: ${def.type} ${required}\n`;
                    }
                    doc += `\n`;
                }

                if (schema.response) {
                    doc += `**Response:** \`${schema.response}\`\n\n`;
                }

                doc += `---\n\n`;
            }
        }

        return doc;
    }
}

// Export for use in main application
window.MessageProtocolValidator = MessageProtocolValidator;
window.MESSAGE_PROTOCOL_SCHEMA = MESSAGE_PROTOCOL_SCHEMA;
window.MESSAGE_DIRECTION = MESSAGE_DIRECTION;
window.DATA_TYPES = DATA_TYPES;
window.MESSAGE_PROTOCOL_VERSION = MESSAGE_PROTOCOL_VERSION;

// Create global validator instance
window.messageProtocolValidator = new MessageProtocolValidator();

// Also export as module for Node.js compatibility
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        MessageProtocolValidator,
        MESSAGE_PROTOCOL_SCHEMA,
        MESSAGE_DIRECTION,
        DATA_TYPES,
        MESSAGE_PROTOCOL_VERSION
    };
}
