/**
 * Message Protocol for Modler V2 Communication Bridge
 *
 * Defines standardized message format for UI ↔ Main communication.
 * Replaces ad-hoc message formats in PropertyPanelSync, UnifiedCommunication, PropertyController.
 *
 * Version: 1.0.0
 * Part of: Phase 3 - Communication Layer Consolidation
 */

/**
 * Message Types (Direction indicators)
 */
const MESSAGE_TYPES = {
    // UI → Main (Commands)
    PROPERTY_UPDATE: 'property-update',
    OBJECT_CREATE: 'object-create',
    OBJECT_DELETE: 'object-delete',
    TOOL_ACTIVATE: 'tool-activate',
    TOOL_DEACTIVATE: 'tool-deactivate',
    HIERARCHY_CHANGE: 'hierarchy-change',

    // Container Operations (Phase 3.6)
    CONTAINER_CREATE: 'create-layout-container',
    CONTAINER_CREATE_TILED: 'create-tiled-container',
    OBJECT_MOVE_TO_CONTAINER: 'object-move-to-container',
    OBJECT_CONTAINER_MOVE_TO_CONTAINER: 'object-container-move-to-container',
    OBJECT_MOVE_TO_ROOT: 'object-move-to-root',
    OBJECT_REORDER: 'object-reorder',
    REVERSE_CHILD_ORDER: 'reverse-child-order',
    HIERARCHY_REFRESH_REQUEST: 'request-hierarchy-refresh',

    // Layout/Transform Features (Phase 3.6)
    FILL_MODE_TOGGLE: 'fill-button-toggle',
    FILL_MODE_CHECK: 'fill-button-check',
    FILL_STATES_REQUEST: 'fill-button-get-states',
    FILL_BUTTON_HOVER: 'fill-button-hover',
    LAYOUT_MODE_CHECK: 'check-layout-mode',
    LAYOUT_BUTTON_HOVER: 'layout-button-hover',

    // Main → UI (Notifications)
    STATE_CHANGED: 'state-changed',
    SELECTION_CHANGED: 'selection-changed',
    HIERARCHY_UPDATED: 'hierarchy-updated',
    GEOMETRY_UPDATED: 'geometry-updated',
    TOOL_STATE_CHANGED: 'tool-state-changed',

    // Bidirectional (Request/Response)
    REQUEST: 'request',
    RESPONSE: 'response',
    ERROR: 'error'
};

/**
 * Emission Strategies (how to send messages)
 */
const EMISSION_STRATEGY = {
    IMMEDIATE: 'immediate',    // Send immediately (critical updates)
    THROTTLED: 'throttled',    // Throttle to 60fps (real-time drag)
    BATCHED: 'batched'         // Batch for efficiency (bulk updates)
};

/**
 * Message Priority Levels
 */
const MESSAGE_PRIORITY = {
    CRITICAL: 3,  // User input, tool commands
    HIGH: 2,      // Selection changes, geometry updates
    NORMAL: 1,    // Hierarchy updates, non-critical state
    LOW: 0        // Batch updates, background sync
};

/**
 * Standard Message Format
 *
 * All messages follow this structure for consistency
 */
class Message {
    /**
     * Create a new message
     * @param {string} type - Message type from MESSAGE_TYPES
     * @param {Object} payload - Message data
     * @param {Object} options - Message options
     */
    constructor(type, payload, options = {}) {
        this.id = options.id || this.generateMessageId();
        this.type = type;
        this.payload = payload;
        this.timestamp = Date.now();
        this.priority = options.priority || MESSAGE_PRIORITY.NORMAL;
        this.strategy = options.strategy || EMISSION_STRATEGY.IMMEDIATE;
        this.source = options.source || 'unknown';

        // Request/Response pairing
        this.requestId = options.requestId || null;
        this.requiresResponse = options.requiresResponse || false;
    }

    /**
     * Generate unique message ID
     */
    generateMessageId() {
        return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Serialize for postMessage
     */
    serialize() {
        return {
            id: this.id,
            type: this.type,
            payload: this.payload,
            timestamp: this.timestamp,
            priority: this.priority,
            strategy: this.strategy,
            source: this.source,
            requestId: this.requestId,
            requiresResponse: this.requiresResponse
        };
    }

    /**
     * Deserialize from postMessage
     */
    static deserialize(data) {
        const msg = new Message(data.type, data.payload, {
            id: data.id,
            priority: data.priority,
            strategy: data.strategy,
            source: data.source,
            requestId: data.requestId,
            requiresResponse: data.requiresResponse
        });
        msg.timestamp = data.timestamp;
        return msg;
    }
}

/**
 * Message Builders (Convenience constructors)
 */
const MessageBuilders = {
    /**
     * Property update message (UI → Main)
     */
    propertyUpdate(objectId, property, value, source = 'input') {
        return new Message(MESSAGE_TYPES.PROPERTY_UPDATE, {
            objectId,
            property,
            value
        }, {
            priority: MESSAGE_PRIORITY.CRITICAL,
            strategy: EMISSION_STRATEGY.IMMEDIATE,
            source
        });
    },

    /**
     * State changed notification (Main → UI)
     */
    stateChanged(objectId, changes, eventType = 'geometry') {
        return new Message(MESSAGE_TYPES.STATE_CHANGED, {
            objectId,
            changes,
            eventType
        }, {
            priority: MESSAGE_PRIORITY.HIGH,
            strategy: EMISSION_STRATEGY.THROTTLED,
            source: 'scene-controller'
        });
    },

    /**
     * Selection changed notification (Main → UI)
     */
    selectionChanged(selectedObjectIds, objectData) {
        return new Message(MESSAGE_TYPES.SELECTION_CHANGED, {
            selectedObjectIds,
            objectData
        }, {
            priority: MESSAGE_PRIORITY.HIGH,
            strategy: EMISSION_STRATEGY.IMMEDIATE,
            source: 'selection-controller'
        });
    },

    /**
     * Hierarchy updated notification (Main → UI)
     */
    hierarchyUpdated(objects, rootObjects) {
        return new Message(MESSAGE_TYPES.HIERARCHY_UPDATED, {
            objects,
            rootObjects
        }, {
            priority: MESSAGE_PRIORITY.NORMAL,
            strategy: EMISSION_STRATEGY.BATCHED,
            source: 'scene-controller'
        });
    },

    /**
     * Tool activation command (UI → Main)
     */
    toolActivate(toolName, options = {}) {
        return new Message(MESSAGE_TYPES.TOOL_ACTIVATE, {
            toolName,
            options
        }, {
            priority: MESSAGE_PRIORITY.CRITICAL,
            strategy: EMISSION_STRATEGY.IMMEDIATE,
            source: 'ui'
        });
    },

    /**
     * Object created notification (Main → UI)
     */
    objectCreated(objectId, objectData) {
        return new Message(MESSAGE_TYPES.STATE_CHANGED, {
            objectId,
            objectData,
            eventType: 'created',
            changeType: 'lifecycle'
        }, {
            priority: MESSAGE_PRIORITY.HIGH,
            strategy: EMISSION_STRATEGY.IMMEDIATE,
            source: 'scene-controller'
        });
    },

    /**
     * Object deleted notification (Main → UI)
     */
    objectDeleted(objectId) {
        return new Message(MESSAGE_TYPES.STATE_CHANGED, {
            objectId,
            eventType: 'deleted',
            changeType: 'lifecycle'
        }, {
            priority: MESSAGE_PRIORITY.HIGH,
            strategy: EMISSION_STRATEGY.IMMEDIATE,
            source: 'scene-controller'
        });
    },

    /**
     * Tool state changed notification (Main → UI)
     */
    toolStateChanged(activeTool, snapEnabled) {
        return new Message(MESSAGE_TYPES.TOOL_STATE_CHANGED, {
            activeTool,
            snapEnabled
        }, {
            priority: MESSAGE_PRIORITY.NORMAL,
            strategy: EMISSION_STRATEGY.THROTTLED,
            source: 'tool-controller'
        });
    },

    /**
     * Request message with response expectation
     */
    request(requestType, data) {
        return new Message(MESSAGE_TYPES.REQUEST, {
            requestType,
            data
        }, {
            priority: MESSAGE_PRIORITY.HIGH,
            strategy: EMISSION_STRATEGY.IMMEDIATE,
            requiresResponse: true
        });
    },

    /**
     * Response to a request
     */
    response(requestId, data, success = true) {
        return new Message(MESSAGE_TYPES.RESPONSE, {
            data,
            success
        }, {
            requestId,
            priority: MESSAGE_PRIORITY.HIGH,
            strategy: EMISSION_STRATEGY.IMMEDIATE
        });
    },

    /**
     * Error message
     */
    error(error, context = {}) {
        return new Message(MESSAGE_TYPES.ERROR, {
            error: error.message || String(error),
            stack: error.stack,
            context
        }, {
            priority: MESSAGE_PRIORITY.CRITICAL,
            strategy: EMISSION_STRATEGY.IMMEDIATE,
            source: 'error-handler'
        });
    },

    // ========== Phase 3.6: Container Operations ==========

    /**
     * Create layout container (UI → Main)
     */
    containerCreate() {
        return new Message(MESSAGE_TYPES.CONTAINER_CREATE, {}, {
            priority: MESSAGE_PRIORITY.CRITICAL,
            strategy: EMISSION_STRATEGY.IMMEDIATE,
            source: 'ui'
        });
    },

    /**
     * Create tiled container (UI → Main)
     */
    containerCreateTiled(objectId, axis, repeat, gap) {
        return new Message(MESSAGE_TYPES.CONTAINER_CREATE_TILED, {
            objectId,
            axis,
            repeat,
            gap
        }, {
            priority: MESSAGE_PRIORITY.CRITICAL,
            strategy: EMISSION_STRATEGY.IMMEDIATE,
            source: 'ui'
        });
    },

    /**
     * Move object to container (UI → Main)
     */
    objectMoveToContainer(objectId, targetContainerId, insertIndex = null) {
        return new Message(MESSAGE_TYPES.OBJECT_MOVE_TO_CONTAINER, {
            objectId,
            targetContainerId,
            insertIndex
        }, {
            priority: MESSAGE_PRIORITY.HIGH,
            strategy: EMISSION_STRATEGY.IMMEDIATE,
            source: 'ui'
        });
    },

    /**
     * Move container to another container (UI → Main)
     */
    objectContainerMoveToContainer(objectId, targetContainerId, insertIndex = null) {
        return new Message(MESSAGE_TYPES.OBJECT_CONTAINER_MOVE_TO_CONTAINER, {
            objectId,
            targetContainerId,
            insertIndex
        }, {
            priority: MESSAGE_PRIORITY.HIGH,
            strategy: EMISSION_STRATEGY.IMMEDIATE,
            source: 'ui'
        });
    },

    /**
     * Move object to root (UI → Main)
     */
    objectMoveToRoot(objectId) {
        return new Message(MESSAGE_TYPES.OBJECT_MOVE_TO_ROOT, {
            objectId
        }, {
            priority: MESSAGE_PRIORITY.HIGH,
            strategy: EMISSION_STRATEGY.IMMEDIATE,
            source: 'ui'
        });
    },

    /**
     * Reorder objects in container (UI → Main)
     */
    objectReorder(parentId, childId, newIndex) {
        return new Message(MESSAGE_TYPES.OBJECT_REORDER, {
            parentId,
            childId,
            newIndex
        }, {
            priority: MESSAGE_PRIORITY.HIGH,
            strategy: EMISSION_STRATEGY.IMMEDIATE,
            source: 'ui'
        });
    },

    /**
     * Reverse child order in container (UI → Main)
     */
    reverseChildOrder(objectId) {
        return new Message(MESSAGE_TYPES.REVERSE_CHILD_ORDER, {
            objectId
        }, {
            priority: MESSAGE_PRIORITY.NORMAL,
            strategy: EMISSION_STRATEGY.IMMEDIATE,
            source: 'ui'
        });
    },

    /**
     * Request hierarchy refresh (UI → Main)
     */
    hierarchyRefreshRequest() {
        return new Message(MESSAGE_TYPES.HIERARCHY_REFRESH_REQUEST, {}, {
            priority: MESSAGE_PRIORITY.NORMAL,
            strategy: EMISSION_STRATEGY.IMMEDIATE,
            source: 'ui'
        });
    },

    // ========== Phase 3.6: Layout/Transform Features ==========

    /**
     * Toggle fill mode on axis (UI → Main)
     */
    fillModeToggle(objectId, axis) {
        return new Message(MESSAGE_TYPES.FILL_MODE_TOGGLE, {
            objectId,
            axis
        }, {
            priority: MESSAGE_PRIORITY.HIGH,
            strategy: EMISSION_STRATEGY.IMMEDIATE,
            source: 'ui'
        });
    },

    /**
     * Check if fill mode available (UI → Main)
     */
    fillModeCheck(objectId) {
        return new Message(MESSAGE_TYPES.FILL_MODE_CHECK, {
            objectId
        }, {
            priority: MESSAGE_PRIORITY.NORMAL,
            strategy: EMISSION_STRATEGY.IMMEDIATE,
            source: 'ui'
        });
    },

    /**
     * Request all fill button states (UI → Main)
     */
    fillStatesRequest(objectId) {
        return new Message(MESSAGE_TYPES.FILL_STATES_REQUEST, {
            objectId
        }, {
            priority: MESSAGE_PRIORITY.NORMAL,
            strategy: EMISSION_STRATEGY.IMMEDIATE,
            source: 'ui'
        });
    },

    /**
     * Fill button hover (UI → Main)
     */
    fillButtonHover(objectId, axis, isHovering) {
        return new Message(MESSAGE_TYPES.FILL_BUTTON_HOVER, {
            objectId,
            axis,
            isHovering
        }, {
            priority: MESSAGE_PRIORITY.LOW,
            strategy: EMISSION_STRATEGY.THROTTLED,
            source: 'ui'
        });
    },

    /**
     * Check layout mode (UI → Main)
     */
    layoutModeCheck(objectId) {
        return new Message(MESSAGE_TYPES.LAYOUT_MODE_CHECK, {
            objectId
        }, {
            priority: MESSAGE_PRIORITY.NORMAL,
            strategy: EMISSION_STRATEGY.IMMEDIATE,
            source: 'ui'
        });
    },

    /**
     * Layout button hover (UI → Main)
     */
    layoutButtonHover(objectId, axis, isHovering) {
        return new Message(MESSAGE_TYPES.LAYOUT_BUTTON_HOVER, {
            objectId,
            axis,
            isHovering
        }, {
            priority: MESSAGE_PRIORITY.LOW,
            strategy: EMISSION_STRATEGY.THROTTLED,
            source: 'ui'
        });
    }
};

/**
 * Message Validator
 */
class MessageValidator {
    /**
     * Validate message structure
     */
    static validate(message) {
        const errors = [];

        if (!message.id) {
            errors.push('Message must have an id');
        }

        if (!message.type || !Object.values(MESSAGE_TYPES).includes(message.type)) {
            errors.push(`Invalid message type: ${message.type}`);
        }

        if (message.payload === undefined) {
            errors.push('Message must have a payload');
        }

        if (!message.timestamp) {
            errors.push('Message must have a timestamp');
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }

    /**
     * Validate specific message types
     */
    static validatePropertyUpdate(payload) {
        const errors = [];

        if (!payload.objectId) {
            errors.push('Property update must have objectId');
        }

        if (!payload.property) {
            errors.push('Property update must have property');
        }

        if (payload.value === undefined) {
            errors.push('Property update must have value');
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }
}

// Export for global use
if (typeof window !== 'undefined') {
    window.MessageProtocol = {
        Message,
        MESSAGE_TYPES,
        EMISSION_STRATEGY,
        MESSAGE_PRIORITY,
        MessageBuilders,
        MessageValidator
    };
}

// Export for Node/module environments
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        Message,
        MESSAGE_TYPES,
        EMISSION_STRATEGY,
        MESSAGE_PRIORITY,
        MessageBuilders,
        MessageValidator
    };
}
