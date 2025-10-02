/**
 * ObjectEventBus Event Payload Schema
 *
 * Central schema defining all ObjectEventBus event payloads.
 * Ensures type-safe event emissions with validated payload structures.
 *
 * This schema:
 * - Defines payload structure for each EVENT_TYPE
 * - Specifies required/optional fields
 * - Validates data types at emit-time
 * - Documents event metadata (throttling, batching)
 * - Prevents incomplete event data bugs
 *
 * Version: 1.0.0
 */

const EVENT_PAYLOAD_SCHEMA_VERSION = '1.0.0';

/**
 * Event emission preferences
 */
const EVENT_PREFERENCES = {
    THROTTLE: 'throttle',     // Throttle rapid emissions (default: 16ms)
    BATCH: 'batch',           // Batch multiple emissions (default: 100ms)
    IMMEDIATE: 'immediate'    // Emit immediately, no throttling
};

/**
 * Complete Event Payload Schema
 * Maps each EVENT_TYPE to its expected payload structure
 *
 * Schema format:
 * {
 *   eventType: {
 *     description: 'What this event represents',
 *     emissionPreference: EVENT_PREFERENCES constant,
 *     changeData: {
 *       fieldName: { type: DATA_TYPE, required: boolean, description: '' }
 *     }
 *   }
 * }
 */
const EVENT_PAYLOAD_SCHEMA = {
    // ===========================
    // TRANSFORM EVENTS
    // ===========================

    'object:transform': {
        description: 'Object position, rotation, or scale changed',
        emissionPreference: EVENT_PREFERENCES.THROTTLE,
        changeData: {
            position: {
                type: 'object|undefined',
                required: false,
                description: 'New position {x, y, z}',
                schema: {
                    x: { type: 'number', required: false },
                    y: { type: 'number', required: false },
                    z: { type: 'number', required: false }
                }
            },
            rotation: {
                type: 'object|undefined',
                required: false,
                description: 'New rotation {x, y, z} in radians',
                schema: {
                    x: { type: 'number', required: false },
                    y: { type: 'number', required: false },
                    z: { type: 'number', required: false }
                }
            },
            scale: {
                type: 'object|undefined',
                required: false,
                description: 'New scale {x, y, z}',
                schema: {
                    x: { type: 'number', required: false },
                    y: { type: 'number', required: false },
                    z: { type: 'number', required: false }
                }
            },
            source: {
                type: 'string',
                required: false,
                description: 'Source of the change (e.g., "tool", "undo", "direct")'
            }
        }
    },

    // ===========================
    // GEOMETRY EVENTS
    // ===========================

    'object:geometry': {
        description: 'Object dimensions or geometry modified',
        emissionPreference: EVENT_PREFERENCES.THROTTLE,
        changeData: {
            dimensions: {
                type: 'object',
                required: false,
                description: 'New dimensions {x, y, z}',
                schema: {
                    x: { type: 'number', required: true },
                    y: { type: 'number', required: true },
                    z: { type: 'number', required: true }
                }
            },
            vertices: {
                type: 'array',
                required: false,
                description: 'Modified vertex positions'
            },
            faces: {
                type: 'array',
                required: false,
                description: 'Modified face definitions'
            },
            operation: {
                type: 'string',
                required: false,
                description: 'Geometry operation type (e.g., "push", "extrude", "bevel")'
            }
        }
    },

    // ===========================
    // MATERIAL EVENTS
    // ===========================

    'object:material': {
        description: 'Object material properties changed',
        emissionPreference: EVENT_PREFERENCES.THROTTLE,
        changeData: {
            color: {
                type: 'string|number',
                required: false,
                description: 'New color (hex string or number)'
            },
            opacity: {
                type: 'number',
                required: false,
                description: 'New opacity (0.0 to 1.0)'
            },
            transparent: {
                type: 'boolean',
                required: false,
                description: 'Transparency enabled'
            },
            metalness: {
                type: 'number',
                required: false,
                description: 'Metalness value (0.0 to 1.0)'
            },
            roughness: {
                type: 'number',
                required: false,
                description: 'Roughness value (0.0 to 1.0)'
            }
        }
    },

    // ===========================
    // HIERARCHY EVENTS
    // ===========================

    'object:hierarchy': {
        description: 'Parent-child relationships changed',
        emissionPreference: EVENT_PREFERENCES.IMMEDIATE,
        changeData: {
            type: {
                type: 'string',
                required: true,
                description: 'Hierarchy change type: "parent-changed", "child-added", "child-removed", "layout-property-changed"'
            },
            parentId: {
                type: 'string|null',
                required: false,
                description: 'New parent object ID (null for root)'
            },
            childId: {
                type: 'string',
                required: false,
                description: 'Child object ID involved in change'
            },
            previousParentId: {
                type: 'string|null',
                required: false,
                description: 'Previous parent ID'
            },
            property: {
                type: 'string',
                required: false,
                description: 'Layout property that changed (e.g., "calculatedGap")'
            },
            value: {
                type: 'any',
                required: false,
                description: 'New value of the changed property'
            }
        }
    },

    // ===========================
    // LIFECYCLE EVENTS
    // ===========================

    'object:lifecycle': {
        description: 'Object created or deleted',
        emissionPreference: EVENT_PREFERENCES.IMMEDIATE,
        changeData: {
            operation: {
                type: 'string',
                required: true,
                description: 'Lifecycle operation: "created" or "deleted"'
            },
            objectType: {
                type: 'string',
                required: false,
                description: 'Type of object (e.g., "box", "container", "sphere")'
            },
            objectData: {
                type: 'object',
                required: false,
                description: 'Complete object data (for creation events)'
            },
            reason: {
                type: 'string',
                required: false,
                description: 'Reason for deletion (e.g., "user", "cascade", "undo")'
            }
        }
    },

    // ===========================
    // SELECTION EVENTS
    // ===========================

    'object:selection': {
        description: 'Object selection state changed',
        emissionPreference: EVENT_PREFERENCES.IMMEDIATE,
        changeData: {
            selected: {
                type: 'boolean',
                required: true,
                description: 'Whether object is now selected'
            },
            selectionMode: {
                type: 'string',
                required: false,
                description: 'Selection mode: "single", "multi", "add", "remove"'
            },
            selectionContext: {
                type: 'object',
                required: false,
                description: 'Additional selection context',
                schema: {
                    isContainer: { type: 'boolean', required: false },
                    containerId: { type: 'string', required: false },
                    clickCount: { type: 'number', required: false }
                }
            }
        }
    },

    // ===========================
    // TOOL STATE EVENTS
    // ===========================

    'tool:state': {
        description: 'Tool activation or state change',
        emissionPreference: EVENT_PREFERENCES.IMMEDIATE,
        changeData: {
            toolName: {
                type: 'string',
                required: true,
                description: 'Name of the tool (e.g., "select", "move", "push")'
            },
            active: {
                type: 'boolean',
                required: true,
                description: 'Whether tool is now active'
            },
            toolState: {
                type: 'object',
                required: false,
                description: 'Tool-specific state data'
            },
            previousTool: {
                type: 'string',
                required: false,
                description: 'Previously active tool name'
            }
        }
    },

    // ===========================
    // PARAMETRIC DESIGN EVENTS
    // ===========================

    'parametric:update': {
        description: 'Parametric parameter value changed',
        emissionPreference: EVENT_PREFERENCES.THROTTLE,
        changeData: {
            parameter: {
                type: 'string',
                required: true,
                description: 'Parameter name that changed'
            },
            value: {
                type: 'any',
                required: true,
                description: 'New parameter value'
            },
            previousValue: {
                type: 'any',
                required: false,
                description: 'Previous parameter value'
            },
            affectedProperties: {
                type: 'array',
                required: false,
                description: 'List of properties driven by this parameter'
            }
        }
    },

    'parametric:constraint': {
        description: 'Property constraint changed',
        emissionPreference: EVENT_PREFERENCES.IMMEDIATE,
        changeData: {
            property: {
                type: 'string',
                required: true,
                description: 'Property path (e.g., "dimensions.x")'
            },
            constraint: {
                type: 'string',
                required: true,
                description: 'Constraint type: "locked", "formula", "free"'
            },
            formula: {
                type: 'string',
                required: false,
                description: 'Formula expression (if constraint is "formula")'
            }
        }
    },

    'parametric:formula': {
        description: 'Formula-driven property updated',
        emissionPreference: EVENT_PREFERENCES.THROTTLE,
        changeData: {
            property: {
                type: 'string',
                required: true,
                description: 'Property updated by formula'
            },
            formula: {
                type: 'string',
                required: true,
                description: 'Formula that calculated the value'
            },
            calculatedValue: {
                type: 'any',
                required: true,
                description: 'Value calculated by formula'
            },
            dependencies: {
                type: 'array',
                required: false,
                description: 'List of properties used in formula'
            }
        }
    },

    'parametric:dependency': {
        description: 'Object dependency relationships changed',
        emissionPreference: EVENT_PREFERENCES.IMMEDIATE,
        changeData: {
            dependencyType: {
                type: 'string',
                required: true,
                description: 'Dependency type: "added", "removed", "updated"'
            },
            dependsOn: {
                type: 'array',
                required: true,
                description: 'List of object IDs this object depends on'
            },
            dependedBy: {
                type: 'array',
                required: false,
                description: 'List of object IDs that depend on this object'
            }
        }
    },

    // ===========================
    // COMPONENT INSTANCING EVENTS
    // ===========================

    'component:instance': {
        description: 'Component instance modified',
        emissionPreference: EVENT_PREFERENCES.IMMEDIATE,
        changeData: {
            action: {
                type: 'string',
                required: true,
                description: 'Instance action: "created", "modified", "deleted", "synced"'
            },
            masterId: {
                type: 'string',
                required: true,
                description: 'Master component ID'
            },
            propertyOverrides: {
                type: 'object',
                required: false,
                description: 'Instance-specific property overrides'
            }
        }
    },

    'component:master': {
        description: 'Master component changed',
        emissionPreference: EVENT_PREFERENCES.IMMEDIATE,
        changeData: {
            changeType: {
                type: 'string',
                required: true,
                description: 'Master change type: "property", "geometry", "deleted"'
            },
            affectedInstances: {
                type: 'array',
                required: true,
                description: 'List of instance IDs that need updating'
            },
            changedProperties: {
                type: 'array',
                required: false,
                description: 'List of properties changed in master'
            }
        }
    },

    'component:sync': {
        description: 'Full component synchronization event',
        emissionPreference: EVENT_PREFERENCES.BATCH,
        changeData: {
            syncType: {
                type: 'string',
                required: true,
                description: 'Sync type: "full", "partial", "properties-only"'
            },
            syncedProperties: {
                type: 'array',
                required: true,
                description: 'List of properties synchronized'
            },
            errors: {
                type: 'array',
                required: false,
                description: 'List of synchronization errors'
            }
        }
    },

    // ===========================
    // META-FUNCTIONALITY EVENTS
    // ===========================

    'object:metadata': {
        description: 'Extended property metadata changed',
        emissionPreference: EVENT_PREFERENCES.BATCH,
        changeData: {
            metadataType: {
                type: 'string',
                required: true,
                description: 'Metadata type: "tag", "annotation", "custom-property"'
            },
            metadataKey: {
                type: 'string',
                required: true,
                description: 'Metadata key/name'
            },
            metadataValue: {
                type: 'any',
                required: true,
                description: 'Metadata value'
            }
        }
    },

    'system:state': {
        description: 'Global system state change',
        emissionPreference: EVENT_PREFERENCES.IMMEDIATE,
        changeData: {
            stateType: {
                type: 'string',
                required: true,
                description: 'State type: "mode-change", "config-update", "system-ready"'
            },
            state: {
                type: 'any',
                required: true,
                description: 'New system state value'
            },
            previousState: {
                type: 'any',
                required: false,
                description: 'Previous system state value'
            }
        }
    },

    // ===========================
    // PROPERTY CHANGE EVENT (Generic)
    // ===========================

    'object:property-changed': {
        description: 'Generic property change notification',
        emissionPreference: EVENT_PREFERENCES.THROTTLE,
        changeData: {
            property: {
                type: 'string',
                required: true,
                description: 'Property path that changed'
            },
            value: {
                type: 'any',
                required: true,
                description: 'New property value'
            },
            previousValue: {
                type: 'any',
                required: false,
                description: 'Previous property value'
            },
            source: {
                type: 'string',
                required: false,
                description: 'Source of change (e.g., "ui", "tool", "drag", "undo")'
            }
        }
    }
};

/**
 * Event Payload Validator
 */
class EventPayloadValidator {
    constructor(schema = EVENT_PAYLOAD_SCHEMA) {
        this.schema = schema;
        this.stats = {
            eventsValidated: 0,
            validationErrors: 0,
            unknownEventTypes: 0
        };
    }

    /**
     * Validate an event emission
     * @param {string} eventType - Event type from ObjectEventBus.EVENT_TYPES
     * @param {Object} changeData - Event payload
     * @returns {Object} { isValid: boolean, errors: string[], preference: string }
     */
    validate(eventType, changeData) {
        this.stats.eventsValidated++;

        // Check if event type exists in schema
        if (!this.schema[eventType]) {
            this.stats.unknownEventTypes++;
            return {
                isValid: false,
                errors: [`Unknown event type: "${eventType}". Did you forget to add it to EVENT_PAYLOAD_SCHEMA?`],
                preference: EVENT_PREFERENCES.IMMEDIATE
            };
        }

        const eventSchema = this.schema[eventType];
        const errors = [];

        // Validate changeData payload
        if (changeData && typeof changeData === 'object') {
            const payloadErrors = this.validatePayload(changeData, eventSchema.changeData, eventType);
            errors.push(...payloadErrors);
        } else if (Object.keys(eventSchema.changeData).some(key => eventSchema.changeData[key].required)) {
            errors.push(`Event "${eventType}" requires changeData payload`);
        }

        if (errors.length > 0) {
            this.stats.validationErrors++;
        }

        return {
            isValid: errors.length === 0,
            errors: errors,
            preference: eventSchema.emissionPreference
        };
    }

    /**
     * Validate payload fields
     * @private
     */
    validatePayload(data, schema, eventType) {
        const errors = [];

        // Check required fields
        for (const [fieldName, fieldDef] of Object.entries(schema)) {
            if (fieldDef.required && !(fieldName in data)) {
                errors.push(`Missing required field "${fieldName}" in "${eventType}" event`);
                continue;
            }

            // Validate field type if present
            if (fieldName in data) {
                const fieldErrors = this.validateFieldType(data[fieldName], fieldDef, fieldName, eventType);
                errors.push(...fieldErrors);
            }
        }

        return errors;
    }

    /**
     * Validate field type
     * @private
     */
    validateFieldType(value, fieldDef, fieldName, eventType) {
        const errors = [];
        const expectedType = fieldDef.type;

        // Handle optional types (type|undefined, type|null)
        if (expectedType.includes('|')) {
            const types = expectedType.split('|');
            const isValid = types.some(type => {
                if (type === 'undefined' && value === undefined) return true;
                if (type === 'null' && value === null) return true;
                return this.matchesType(value, type);
            });
            if (!isValid) {
                errors.push(`Field "${fieldName}" in "${eventType}" should be one of: ${expectedType}`);
            }
            return errors;
        }

        // Validate single type
        const actualType = Array.isArray(value) ? 'array' : typeof value;

        if (expectedType === 'any') {
            return errors; // Any type is valid
        }

        if (!this.matchesType(value, expectedType)) {
            errors.push(`Field "${fieldName}" in "${eventType}" has wrong type: expected ${expectedType}, got ${actualType}`);
        }

        // Validate nested schema if present
        if (fieldDef.schema && typeof value === 'object' && !Array.isArray(value)) {
            const nestedErrors = this.validatePayload(value, fieldDef.schema, `${eventType}.${fieldName}`);
            errors.push(...nestedErrors);
        }

        return errors;
    }

    /**
     * Check if value matches expected type
     * @private
     */
    matchesType(value, expectedType) {
        const actualType = Array.isArray(value) ? 'array' : typeof value;
        return actualType === expectedType;
    }

    /**
     * Get emission preference for an event type
     * @param {string} eventType - Event type
     * @returns {string} Emission preference constant
     */
    getEmissionPreference(eventType) {
        const schema = this.schema[eventType];
        return schema ? schema.emissionPreference : EVENT_PREFERENCES.IMMEDIATE;
    }

    /**
     * Get statistics
     * @returns {Object} Statistics object
     */
    getStats() {
        return {
            ...this.stats,
            validationSuccessRate: this.stats.eventsValidated > 0 ?
                ((this.stats.eventsValidated - this.stats.validationErrors) / this.stats.eventsValidated * 100).toFixed(1) + '%' : '0%'
        };
    }

    /**
     * Generate documentation for all event types
     * @returns {string} Markdown documentation
     */
    generateDocumentation() {
        let doc = `# ObjectEventBus Event Documentation\n\n`;
        doc += `Version: ${EVENT_PAYLOAD_SCHEMA_VERSION}\n\n`;
        doc += `Total event types: ${Object.keys(this.schema).length}\n\n`;

        for (const [eventType, schema] of Object.entries(this.schema)) {
            doc += `## \`${eventType}\`\n\n`;
            doc += `${schema.description}\n\n`;
            doc += `**Emission Preference:** ${schema.emissionPreference}\n\n`;

            if (schema.changeData && Object.keys(schema.changeData).length > 0) {
                doc += `**Payload Fields:**\n\n`;
                for (const [field, def] of Object.entries(schema.changeData)) {
                    const required = def.required ? '(required)' : '(optional)';
                    doc += `- \`${field}\`: ${def.type} ${required} - ${def.description}\n`;
                }
                doc += `\n`;
            }

            doc += `---\n\n`;
        }

        return doc;
    }
}

// Export for use in main application
window.EventPayloadValidator = EventPayloadValidator;
window.EVENT_PAYLOAD_SCHEMA = EVENT_PAYLOAD_SCHEMA;
window.EVENT_PREFERENCES = EVENT_PREFERENCES;
window.EVENT_PAYLOAD_SCHEMA_VERSION = EVENT_PAYLOAD_SCHEMA_VERSION;

// Create global validator instance
window.eventPayloadValidator = new EventPayloadValidator();

// Also export as module for Node.js compatibility
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        EventPayloadValidator,
        EVENT_PAYLOAD_SCHEMA,
        EVENT_PREFERENCES,
        EVENT_PAYLOAD_SCHEMA_VERSION
    };
}
