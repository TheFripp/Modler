/**
 * Command Metadata Schema
 *
 * Central schema defining all Command Pattern metadata for undo/redo system.
 * Enables command validation, serialization, and persistent history.
 *
 * This schema:
 * - Defines command types and their parameters
 * - Specifies required data for execute/undo
 * - Validates command construction
 * - Enables command history save/load
 * - Supports macro recording
 *
 * Version: 1.0.0
 */

const COMMAND_METADATA_SCHEMA_VERSION = '1.0.0';

/**
 * Command categories for organization
 */
const COMMAND_CATEGORIES = {
    OBJECT_MANIPULATION: 'object-manipulation',
    PROPERTY_MODIFICATION: 'property-modification',
    HIERARCHY: 'hierarchy',
    CREATION: 'creation',
    DELETION: 'deletion',
    LAYOUT: 'layout'
};

/**
 * Complete Command Metadata Schema
 *
 * Schema format:
 * {
 *   commandType: {
 *     category: COMMAND_CATEGORIES constant,
 *     description: 'What this command does',
 *     className: 'JavaScript class name',
 *     parameters: {
 *       paramName: { type: 'type', required: boolean, description: '' }
 *     },
 *     serializable: boolean,  // Can be saved to history file
 *     undoable: boolean,      // Can be undone
 *     affectsScene: boolean   // Modifies 3D scene
 *   }
 * }
 */
const COMMAND_METADATA_SCHEMA = {
    // ===========================
    // CREATION COMMANDS
    // ===========================

    'create-object': {
        category: COMMAND_CATEGORIES.CREATION,
        description: 'Create a new 3D object',
        className: 'CreateObjectCommand',
        parameters: {
            objectType: {
                type: 'string',
                required: true,
                description: 'Type of object to create (e.g., "box", "sphere")'
            },
            position: {
                type: 'object',
                required: true,
                description: 'Initial position {x, y, z}',
                schema: {
                    x: { type: 'number', required: true },
                    y: { type: 'number', required: true },
                    z: { type: 'number', required: true }
                }
            },
            dimensions: {
                type: 'object',
                required: true,
                description: 'Initial dimensions {x, y, z}',
                schema: {
                    x: { type: 'number', required: true },
                    y: { type: 'number', required: true },
                    z: { type: 'number', required: true }
                }
            },
            material: {
                type: 'object',
                required: false,
                description: 'Initial material properties'
            },
            name: {
                type: 'string',
                required: false,
                description: 'Object name'
            }
        },
        serializable: true,
        undoable: true,
        affectsScene: true
    },

    'create-container': {
        category: COMMAND_CATEGORIES.CREATION,
        description: 'Create a new container object',
        className: 'CreateContainerCommand',
        parameters: {
            position: {
                type: 'object',
                required: true,
                description: 'Container position {x, y, z}'
            },
            dimensions: {
                type: 'object',
                required: true,
                description: 'Container dimensions {x, y, z}'
            },
            autoLayout: {
                type: 'object',
                required: false,
                description: 'Initial auto-layout configuration'
            },
            name: {
                type: 'string',
                required: false,
                description: 'Container name'
            }
        },
        serializable: true,
        undoable: true,
        affectsScene: true
    },

    // ===========================
    // DELETION COMMANDS
    // ===========================

    'delete-object': {
        category: COMMAND_CATEGORIES.DELETION,
        description: 'Delete an object from the scene',
        className: 'DeleteObjectCommand',
        parameters: {
            objectId: {
                type: 'string',
                required: true,
                description: 'ID of object to delete'
            },
            cascadeChildren: {
                type: 'boolean',
                required: false,
                description: 'Whether to delete children (default: false)'
            },
            preserveBackup: {
                type: 'boolean',
                required: false,
                description: 'Whether to preserve object backup for undo (default: true)'
            }
        },
        serializable: true,
        undoable: true,
        affectsScene: true
    },

    // ===========================
    // PROPERTY MODIFICATION COMMANDS
    // ===========================

    'update-property': {
        category: COMMAND_CATEGORIES.PROPERTY_MODIFICATION,
        description: 'Update a single object property',
        className: 'UpdatePropertyCommand',
        parameters: {
            objectId: {
                type: 'string',
                required: true,
                description: 'ID of object to modify'
            },
            property: {
                type: 'string',
                required: true,
                description: 'Property path (e.g., "position.x", "material.color")'
            },
            oldValue: {
                type: 'any',
                required: true,
                description: 'Previous value (for undo)'
            },
            newValue: {
                type: 'any',
                required: true,
                description: 'New value to set'
            }
        },
        serializable: true,
        undoable: true,
        affectsScene: true
    },

    'update-layout-property': {
        category: COMMAND_CATEGORIES.LAYOUT,
        description: 'Update container layout property',
        className: 'UpdateLayoutPropertyCommand',
        parameters: {
            containerId: {
                type: 'string',
                required: true,
                description: 'ID of container to modify'
            },
            property: {
                type: 'string',
                required: true,
                description: 'Layout property path (e.g., "autoLayout.gap")'
            },
            oldValue: {
                type: 'any',
                required: true,
                description: 'Previous value'
            },
            newValue: {
                type: 'any',
                required: true,
                description: 'New value'
            }
        },
        serializable: true,
        undoable: true,
        affectsScene: true
    },

    // ===========================
    // OBJECT MANIPULATION COMMANDS
    // ===========================

    'move-object': {
        category: COMMAND_CATEGORIES.OBJECT_MANIPULATION,
        description: 'Move object to new position',
        className: 'MoveObjectCommand',
        parameters: {
            objectId: {
                type: 'string',
                required: true,
                description: 'ID of object to move'
            },
            oldPosition: {
                type: 'object',
                required: true,
                description: 'Previous position {x, y, z}'
            },
            newPosition: {
                type: 'object',
                required: true,
                description: 'New position {x, y, z}'
            },
            relativeTo: {
                type: 'string',
                required: false,
                description: 'Coordinate space: "world" or "parent"'
            }
        },
        serializable: true,
        undoable: true,
        affectsScene: true
    },

    'push-face': {
        category: COMMAND_CATEGORIES.OBJECT_MANIPULATION,
        description: 'Push/pull object face to modify geometry',
        className: 'PushFaceCommand',
        parameters: {
            objectId: {
                type: 'string',
                required: true,
                description: 'ID of object to modify'
            },
            faceNormal: {
                type: 'object',
                required: true,
                description: 'Face normal direction {x, y, z}'
            },
            pushDistance: {
                type: 'number',
                required: true,
                description: 'Distance to push face'
            },
            oldDimensions: {
                type: 'object',
                required: true,
                description: 'Previous dimensions {x, y, z}'
            },
            newDimensions: {
                type: 'object',
                required: true,
                description: 'New dimensions {x, y, z}'
            }
        },
        serializable: true,
        undoable: true,
        affectsScene: true
    }
};

/**
 * Command Metadata Validator
 */
class CommandMetadataValidator {
    constructor(schema = COMMAND_METADATA_SCHEMA) {
        this.schema = schema;
        this.stats = {
            validationAttempts: 0,
            validationErrors: 0,
            unknownCommandTypes: 0
        };
    }

    /**
     * Validate command construction parameters
     * @param {string} commandType - Type of command
     * @param {Object} params - Command constructor parameters
     * @returns {Object} { isValid: boolean, errors: string[], metadata: Object }
     */
    validate(commandType, params) {
        this.stats.validationAttempts++;

        // Check if command type exists in schema
        if (!this.schema[commandType]) {
            this.stats.unknownCommandTypes++;
            return {
                isValid: false,
                errors: [`Unknown command type: "${commandType}". Did you forget to add it to COMMAND_METADATA_SCHEMA?`],
                metadata: null
            };
        }

        const commandSchema = this.schema[commandType];
        const errors = [];

        // Validate parameters
        const paramErrors = this.validateParameters(params, commandSchema.parameters, commandType);
        errors.push(...paramErrors);

        if (errors.length > 0) {
            this.stats.validationErrors++;
        }

        return {
            isValid: errors.length === 0,
            errors: errors,
            metadata: commandSchema
        };
    }

    /**
     * Validate command parameters
     * @private
     */
    validateParameters(params, paramSchema, commandType) {
        const errors = [];

        if (!paramSchema) return errors; // No parameter schema
        if (!params) params = {}; // Treat missing params as empty object

        // Check required parameters
        for (const [paramName, paramDef] of Object.entries(paramSchema)) {
            if (paramDef.required && !(paramName in params)) {
                errors.push(`Missing required parameter "${paramName}" in "${commandType}" command`);
                continue;
            }

            // Validate parameter type if present
            if (paramName in params) {
                const paramErrors = this.validateParameterType(params[paramName], paramDef, paramName, commandType);
                errors.push(...paramErrors);
            }
        }

        return errors;
    }

    /**
     * Validate parameter type
     * @private
     */
    validateParameterType(value, paramDef, paramName, commandType) {
        const errors = [];
        const expectedType = paramDef.type;

        // Handle optional types
        if (expectedType.includes('|')) {
            const types = expectedType.split('|');
            const isValid = types.some(type => this.matchesType(value, type));
            if (!isValid) {
                errors.push(`Parameter "${paramName}" in "${commandType}" should be one of: ${expectedType}`);
            }
            return errors;
        }

        // Validate single type
        if (expectedType !== 'any' && !this.matchesType(value, expectedType)) {
            const actualType = Array.isArray(value) ? 'array' : typeof value;
            errors.push(`Parameter "${paramName}" in "${commandType}" has wrong type: expected ${expectedType}, got ${actualType}`);
        }

        // Validate nested schema if present
        if (paramDef.schema && typeof value === 'object' && !Array.isArray(value)) {
            const nestedErrors = this.validateParameters(value, paramDef.schema, `${commandType}.${paramName}`);
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
     * Serialize command for storage
     * @param {string} commandType - Command type
     * @param {Object} params - Command parameters
     * @param {Object} metadata - Additional metadata (timestamp, id, etc.)
     * @returns {Object|null} Serialized command or null if not serializable
     */
    serialize(commandType, params, metadata = {}) {
        const commandSchema = this.schema[commandType];
        if (!commandSchema || !commandSchema.serializable) {
            return null; // Command not serializable
        }

        return {
            type: commandType,
            params: params,
            metadata: {
                timestamp: metadata.timestamp || Date.now(),
                id: metadata.id || `cmd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                version: COMMAND_METADATA_SCHEMA_VERSION,
                ...metadata
            }
        };
    }

    /**
     * Deserialize command from storage
     * @param {Object} serialized - Serialized command data
     * @returns {Object|null} Deserialized command data or null if invalid
     */
    deserialize(serialized) {
        if (!serialized || !serialized.type || !serialized.params) {
            return null; // Invalid serialized data
        }

        const validation = this.validate(serialized.type, serialized.params);
        if (!validation.isValid) {
            console.error('Command deserialization failed:', validation.errors);
            return null;
        }

        return {
            type: serialized.type,
            params: serialized.params,
            metadata: serialized.metadata || {}
        };
    }

    /**
     * Get command metadata
     * @param {string} commandType - Command type
     * @returns {Object|null} Command metadata or null
     */
    getMetadata(commandType) {
        return this.schema[commandType] || null;
    }

    /**
     * Get all commands by category
     * @param {string} category - COMMAND_CATEGORIES constant
     * @returns {string[]} Array of command types
     */
    getCommandsByCategory(category) {
        return Object.entries(this.schema)
            .filter(([type, schema]) => schema.category === category)
            .map(([type]) => type);
    }

    /**
     * Get statistics
     * @returns {Object} Statistics object
     */
    getStats() {
        return {
            ...this.stats,
            validationSuccessRate: this.stats.validationAttempts > 0 ?
                ((this.stats.validationAttempts - this.stats.validationErrors) / this.stats.validationAttempts * 100).toFixed(1) + '%' : '0%'
        };
    }

    /**
     * Generate documentation for all commands
     * @returns {string} Markdown documentation
     */
    generateDocumentation() {
        let doc = `# Command Pattern Documentation\n\n`;
        doc += `Version: ${COMMAND_METADATA_SCHEMA_VERSION}\n\n`;
        doc += `Total command types: ${Object.keys(this.schema).length}\n\n`;

        // Group by category
        for (const category of Object.values(COMMAND_CATEGORIES)) {
            const commands = this.getCommandsByCategory(category);
            if (commands.length === 0) continue;

            doc += `## ${category.toUpperCase()} Commands (${commands.length})\n\n`;

            for (const commandType of commands) {
                const schema = this.schema[commandType];
                doc += `### \`${commandType}\` (${schema.className})\n\n`;
                doc += `${schema.description}\n\n`;

                doc += `**Properties:**\n`;
                doc += `- Serializable: ${schema.serializable ? 'Yes' : 'No'}\n`;
                doc += `- Undoable: ${schema.undoable ? 'Yes' : 'No'}\n`;
                doc += `- Affects Scene: ${schema.affectsScene ? 'Yes' : 'No'}\n\n`;

                if (schema.parameters && Object.keys(schema.parameters).length > 0) {
                    doc += `**Parameters:**\n\n`;
                    for (const [param, def] of Object.entries(schema.parameters)) {
                        const required = def.required ? '(required)' : '(optional)';
                        doc += `- \`${param}\`: ${def.type} ${required} - ${def.description}\n`;
                    }
                    doc += `\n`;
                }

                doc += `---\n\n`;
            }
        }

        return doc;
    }
}

// Export for use in main application
window.CommandMetadataValidator = CommandMetadataValidator;
window.COMMAND_METADATA_SCHEMA = COMMAND_METADATA_SCHEMA;
window.COMMAND_CATEGORIES = COMMAND_CATEGORIES;
window.COMMAND_METADATA_SCHEMA_VERSION = COMMAND_METADATA_SCHEMA_VERSION;

// Create global validator instance
window.commandMetadataValidator = new CommandMetadataValidator();

// Also export as module for Node.js compatibility
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        CommandMetadataValidator,
        COMMAND_METADATA_SCHEMA,
        COMMAND_CATEGORIES,
        COMMAND_METADATA_SCHEMA_VERSION
    };
}
