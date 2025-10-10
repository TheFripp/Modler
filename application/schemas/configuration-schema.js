/**
 * Configuration Schema
 *
 * Central schema defining all configuration settings with constraints and validation.
 * Ensures type-safe configuration access with validated values.
 *
 * This schema:
 * - Defines all config keys with types and constraints
 * - Specifies min/max values for numeric settings
 * - Validates color format for color strings
 * - Defines enum values for discrete choices
 * - Auto-generates default values
 * - Supports config migration
 *
 * Version: 1.0.0
 */

const CONFIGURATION_SCHEMA_VERSION = '1.0.0';

/**
 * Constraint types for config values
 */
const CONSTRAINT_TYPES = {
    MIN_MAX: 'min-max',         // Numeric min/max range
    ENUM: 'enum',               // Discrete set of values
    COLOR: 'color',             // Hex color validation
    POSITIVE: 'positive',       // Must be > 0
    NON_NEGATIVE: 'non-negative', // Must be >= 0
    RANGE_0_1: 'range-0-1',     // Between 0.0 and 1.0
    INTEGER: 'integer',          // Whole numbers only
    BOOLEAN: 'boolean'           // True/false
};

/**
 * Complete Configuration Schema
 *
 * Schema format:
 * {
 *   'config.path.key': {
 *     type: 'string' | 'number' | 'boolean' | 'object',
 *     default: <default value>,
 *     constraint: CONSTRAINT_TYPES constant,
 *     min: <number> (for min-max),
 *     max: <number> (for min-max),
 *     values: [array] (for enum),
 *     description: 'What this setting controls'
 *   }
 * }
 */
const CONFIGURATION_SCHEMA = {
    // ===========================
    // VERSION & METADATA
    // ===========================

    'version': {
        type: 'string',
        default: CONFIGURATION_SCHEMA_VERSION,
        constraint: null,
        description: 'Configuration schema version'
    },

    // ===========================
    // VISUAL SETTINGS
    // ===========================

    // Selection visualization
    'visual.selection.color': {
        type: 'string',
        default: '#ff6600',
        constraint: CONSTRAINT_TYPES.COLOR,
        description: 'Selection highlight color'
    },

    'visual.selection.lineWidth': {
        type: 'number',
        default: 2,
        constraint: CONSTRAINT_TYPES.MIN_MAX,
        min: 1,
        max: 10,
        description: 'Selection wireframe line width'
    },

    'visual.selection.opacity': {
        type: 'number',
        default: 0.8,
        constraint: CONSTRAINT_TYPES.RANGE_0_1,
        description: 'Selection wireframe opacity'
    },

    'visual.selection.faceHighlightOpacity': {
        type: 'number',
        default: 0.3,
        constraint: CONSTRAINT_TYPES.RANGE_0_1,
        description: 'Selected face highlight opacity'
    },

    'visual.selection.renderOrder': {
        type: 'number',
        default: 999,
        constraint: CONSTRAINT_TYPES.INTEGER,
        description: 'Render order for selection wireframes'
    },

    // Container visualization
    'visual.containers.wireframeColor': {
        type: 'string',
        default: '#00ff00',
        constraint: CONSTRAINT_TYPES.COLOR,
        description: 'Container wireframe color'
    },

    'visual.containers.opacity': {
        type: 'number',
        default: 0.8,
        constraint: CONSTRAINT_TYPES.RANGE_0_1,
        description: 'Container wireframe opacity'
    },

    'visual.containers.lineWidth': {
        type: 'number',
        default: 1,
        constraint: CONSTRAINT_TYPES.MIN_MAX,
        min: 1,
        max: 5,
        description: 'Container wireframe line width'
    },

    'visual.containers.faceHighlightOpacity': {
        type: 'number',
        default: 0.3,
        constraint: CONSTRAINT_TYPES.RANGE_0_1,
        description: 'Container face highlight opacity'
    },

    'visual.containers.renderOrder': {
        type: 'number',
        default: 998,
        constraint: CONSTRAINT_TYPES.INTEGER,
        description: 'Render order for container wireframes'
    },

    // CAD wireframe
    'visual.cad.wireframe.color': {
        type: 'string',
        default: '#888888',
        constraint: CONSTRAINT_TYPES.COLOR,
        description: 'CAD geometry wireframe color'
    },

    'visual.cad.wireframe.opacity': {
        type: 'number',
        default: 0.8,
        constraint: CONSTRAINT_TYPES.RANGE_0_1,
        description: 'CAD wireframe opacity'
    },

    'visual.cad.wireframe.lineWidth': {
        type: 'number',
        default: 1,
        constraint: CONSTRAINT_TYPES.MIN_MAX,
        min: 1,
        max: 5,
        description: 'CAD wireframe line width'
    },

    // Grid visualization
    'visual.grid.renderOrder': {
        type: 'number',
        default: -100,
        constraint: CONSTRAINT_TYPES.INTEGER,
        description: 'Grid render order (behind all wireframes)'
    },

    // Snapping visualization
    'visual.snapping.indicatorColor': {
        type: 'string',
        default: '#ffffff',
        constraint: CONSTRAINT_TYPES.COLOR,
        description: 'Snap indicator color'
    },

    'visual.snapping.cornerSize': {
        type: 'number',
        default: 0.1,
        constraint: CONSTRAINT_TYPES.POSITIVE,
        description: 'Snap corner indicator size'
    },

    'visual.snapping.faceSize': {
        type: 'number',
        default: 0.05,
        constraint: CONSTRAINT_TYPES.POSITIVE,
        description: 'Snap face indicator size'
    },

    'visual.snapping.borderWidth': {
        type: 'number',
        default: 2,
        constraint: CONSTRAINT_TYPES.MIN_MAX,
        min: 1,
        max: 10,
        description: 'Snap indicator border width'
    },

    'visual.snapping.proximityThreshold': {
        type: 'number',
        default: 8,
        constraint: CONSTRAINT_TYPES.POSITIVE,
        description: 'Snap proximity threshold in pixels'
    },

    'visual.snapping.opacity': {
        type: 'number',
        default: 1.0,
        constraint: CONSTRAINT_TYPES.RANGE_0_1,
        description: 'Snap indicator opacity'
    },

    'visual.snapping.renderOrder': {
        type: 'number',
        default: 1001,
        constraint: CONSTRAINT_TYPES.INTEGER,
        description: 'Snap indicator render order'
    },

    // Visual effects materials
    'visual.effects.materials.face.color': {
        type: 'string',
        default: '#00ffff',
        constraint: CONSTRAINT_TYPES.COLOR,
        description: 'Face highlight color'
    },

    'visual.effects.materials.face.opacity': {
        type: 'number',
        default: 0.6,
        constraint: CONSTRAINT_TYPES.RANGE_0_1,
        description: 'Face highlight opacity'
    },

    'visual.effects.materials.face.renderOrder': {
        type: 'number',
        default: 1000,
        constraint: CONSTRAINT_TYPES.INTEGER,
        description: 'Face highlight render order'
    },

    'visual.effects.materials.axis.color': {
        type: 'string',
        default: '#00ff88',
        constraint: CONSTRAINT_TYPES.COLOR,
        description: 'Axis highlight color'
    },

    'visual.effects.materials.axis.opacity': {
        type: 'number',
        default: 0.3,
        constraint: CONSTRAINT_TYPES.RANGE_0_1,
        description: 'Axis highlight opacity'
    },

    'visual.effects.materials.object.color': {
        type: 'string',
        default: '#ff6600',
        constraint: CONSTRAINT_TYPES.COLOR,
        description: 'Object highlight color'
    },

    'visual.effects.materials.object.opacity': {
        type: 'number',
        default: 0.9,
        constraint: CONSTRAINT_TYPES.RANGE_0_1,
        description: 'Object highlight opacity'
    },

    'visual.effects.materials.object.linewidth': {
        type: 'number',
        default: 2,
        constraint: CONSTRAINT_TYPES.MIN_MAX,
        min: 1,
        max: 10,
        description: 'Object highlight line width'
    },

    'visual.effects.materials.preview.defaultColor': {
        type: 'string',
        default: '#00ff00',
        constraint: CONSTRAINT_TYPES.COLOR,
        description: 'Preview object default color'
    },

    'visual.effects.materials.preview.opacity': {
        type: 'number',
        default: 0.8,
        constraint: CONSTRAINT_TYPES.RANGE_0_1,
        description: 'Preview object opacity'
    },

    'visual.effects.materials.preview.linewidth': {
        type: 'number',
        default: 1,
        constraint: CONSTRAINT_TYPES.MIN_MAX,
        min: 1,
        max: 5,
        description: 'Preview object line width'
    },

    'visual.effects.materials.layoutGuides.color': {
        type: 'string',
        default: '#ff0000',
        constraint: CONSTRAINT_TYPES.COLOR,
        description: 'Layout guide color'
    },

    'visual.effects.materials.layoutGuides.opacity': {
        type: 'number',
        default: 0.8,
        constraint: CONSTRAINT_TYPES.RANGE_0_1,
        description: 'Layout guide opacity'
    },

    'visual.effects.materials.layoutGuides.linewidth': {
        type: 'number',
        default: 2,
        constraint: CONSTRAINT_TYPES.MIN_MAX,
        min: 1,
        max: 10,
        description: 'Layout guide line width'
    },

    'visual.effects.materials.layoutGuides.dashSize': {
        type: 'number',
        default: 0.2,
        constraint: CONSTRAINT_TYPES.POSITIVE,
        description: 'Layout guide dash size'
    },

    'visual.effects.materials.layoutGuides.gapSize': {
        type: 'number',
        default: 0.1,
        constraint: CONSTRAINT_TYPES.POSITIVE,
        description: 'Layout guide gap size'
    },

    // Animation settings
    'visual.effects.animation.fadeStep': {
        type: 'number',
        default: 0.03,
        constraint: CONSTRAINT_TYPES.RANGE_0_1,
        description: 'Fade animation step size'
    },

    'visual.effects.animation.maxOpacity': {
        type: 'number',
        default: 0.1,
        constraint: CONSTRAINT_TYPES.RANGE_0_1,
        description: 'Maximum fade opacity'
    },

    'visual.effects.animation.timeout': {
        type: 'number',
        default: 1000,
        constraint: CONSTRAINT_TYPES.POSITIVE,
        description: 'Animation timeout in milliseconds'
    },

    // Geometry settings
    'visual.effects.geometry.normalOffset': {
        type: 'number',
        default: 0.001,
        constraint: CONSTRAINT_TYPES.POSITIVE,
        description: 'Normal offset for face highlighting'
    },

    'visual.effects.geometry.boxDetectionThreshold': {
        type: 'number',
        default: 0.9,
        constraint: CONSTRAINT_TYPES.RANGE_0_1,
        description: 'Box detection threshold'
    },

    'visual.effects.geometry.duplicateThreshold': {
        type: 'number',
        default: 0.1,
        constraint: CONSTRAINT_TYPES.POSITIVE,
        description: 'Duplicate vertex detection threshold'
    },

    'visual.effects.geometry.minPreviewSize': {
        type: 'number',
        default: 0.01,
        constraint: CONSTRAINT_TYPES.POSITIVE,
        description: 'Minimum preview object size'
    },

    // Cache settings
    'visual.effects.cache.geometryPoolSize': {
        type: 'number',
        default: 10,
        constraint: CONSTRAINT_TYPES.POSITIVE,
        description: 'Geometry pool size for reuse'
    },

    'visual.effects.cache.bboxCacheTime': {
        type: 'number',
        default: 5000,
        constraint: CONSTRAINT_TYPES.POSITIVE,
        description: 'Bounding box cache time in milliseconds'
    },

    // ===========================
    // SCENE SETTINGS
    // ===========================

    'scene.backgroundColor': {
        type: 'string',
        default: '#1a1a1a',
        constraint: CONSTRAINT_TYPES.COLOR,
        description: 'Scene background color'
    },

    'scene.gridSize': {
        type: 'number',
        default: 20,
        constraint: CONSTRAINT_TYPES.POSITIVE,
        description: 'Grid size in world units'
    },

    'scene.gridDensity': {
        type: 'number',
        default: 20,
        constraint: CONSTRAINT_TYPES.POSITIVE,
        description: 'Number of grid divisions'
    },

    'scene.gridMainColor': {
        type: 'string',
        default: '#444444',
        constraint: CONSTRAINT_TYPES.COLOR,
        description: 'Main grid line color'
    },

    'scene.gridSubColor': {
        type: 'string',
        default: '#222222',
        constraint: CONSTRAINT_TYPES.COLOR,
        description: 'Sub grid line color'
    },

    // ===========================
    // UI SETTINGS
    // ===========================

    'ui.accentColor': {
        type: 'string',
        default: '#4a9eff',
        constraint: CONSTRAINT_TYPES.COLOR,
        description: 'UI accent color'
    },

    'ui.toolbarOpacity': {
        type: 'number',
        default: 0.95,
        constraint: CONSTRAINT_TYPES.RANGE_0_1,
        description: 'Toolbar background opacity'
    },

    'ui.panelBackground': {
        type: 'string',
        default: '#252525',
        constraint: CONSTRAINT_TYPES.COLOR,
        description: 'Panel background color'
    },

    'ui.textColor': {
        type: 'string',
        default: '#e0e0e0',
        constraint: CONSTRAINT_TYPES.COLOR,
        description: 'UI text color'
    },

    'ui.borderColor': {
        type: 'string',
        default: '#404040',
        constraint: CONSTRAINT_TYPES.COLOR,
        description: 'UI border color'
    },

    // ===========================
    // HISTORY SETTINGS
    // ===========================

    'history.maxSteps': {
        type: 'number',
        default: 50,
        constraint: CONSTRAINT_TYPES.POSITIVE,
        description: 'Maximum undo/redo steps'
    },

    'history.enabled': {
        type: 'boolean',
        default: true,
        constraint: CONSTRAINT_TYPES.BOOLEAN,
        description: 'Undo/redo system enabled'
    },

    'history.trackMoves': {
        type: 'boolean',
        default: true,
        constraint: CONSTRAINT_TYPES.BOOLEAN,
        description: 'Track object movements in history'
    },

    'history.trackCreation': {
        type: 'boolean',
        default: true,
        constraint: CONSTRAINT_TYPES.BOOLEAN,
        description: 'Track object creation in history'
    },

    'history.trackDeletion': {
        type: 'boolean',
        default: true,
        constraint: CONSTRAINT_TYPES.BOOLEAN,
        description: 'Track object deletion in history'
    },

    'history.trackModification': {
        type: 'boolean',
        default: true,
        constraint: CONSTRAINT_TYPES.BOOLEAN,
        description: 'Track object modification in history'
    }
};

/**
 * Configuration Schema Validator
 */
class ConfigurationSchemaValidator {
    constructor(schema = CONFIGURATION_SCHEMA) {
        this.schema = schema;
        this.stats = {
            validationAttempts: 0,
            validationErrors: 0,
            invalidValues: 0
        };
    }

    /**
     * Validate a configuration value
     * @param {string} key - Config key (e.g., 'visual.selection.color')
     * @param {*} value - Value to validate
     * @returns {Object} { isValid: boolean, errors: string[], coercedValue: * }
     */
    validate(key, value) {
        this.stats.validationAttempts++;

        // Check if key exists in schema
        if (!this.schema[key]) {
            return {
                isValid: false,
                errors: [`Unknown configuration key: "${key}". Did you forget to add it to CONFIGURATION_SCHEMA?`],
                coercedValue: value
            };
        }

        const configDef = this.schema[key];
        const errors = [];
        let coercedValue = value;

        // Validate type
        const typeErrors = this.validateType(value, configDef.type, key);
        if (typeErrors.length > 0) {
            errors.push(...typeErrors);
            this.stats.validationErrors++;
            return { isValid: false, errors, coercedValue: value };
        }

        // Coerce type if needed
        coercedValue = this.coerceType(value, configDef.type);

        // Validate constraints
        const constraintErrors = this.validateConstraints(coercedValue, configDef, key);
        errors.push(...constraintErrors);

        if (errors.length > 0) {
            this.stats.invalidValues++;
        }

        return {
            isValid: errors.length === 0,
            errors: errors,
            coercedValue: coercedValue
        };
    }

    /**
     * Validate type
     * @private
     */
    validateType(value, expectedType, key) {
        const errors = [];
        const actualType = typeof value;

        if (expectedType === 'number' && actualType !== 'number') {
            // Allow string numbers that can be parsed
            if (actualType === 'string' && !isNaN(parseFloat(value))) {
                return errors; // Will be coerced
            }
            errors.push(`Config "${key}" should be a number, got ${actualType}`);
        } else if (expectedType === 'string' && actualType !== 'string') {
            errors.push(`Config "${key}" should be a string, got ${actualType}`);
        } else if (expectedType === 'boolean' && actualType !== 'boolean') {
            errors.push(`Config "${key}" should be a boolean, got ${actualType}`);
        } else if (expectedType === 'object' && (actualType !== 'object' || value === null || Array.isArray(value))) {
            errors.push(`Config "${key}" should be an object, got ${actualType}`);
        }

        return errors;
    }

    /**
     * Coerce value to expected type
     * @private
     */
    coerceType(value, expectedType) {
        if (expectedType === 'number' && typeof value === 'string') {
            return parseFloat(value);
        }
        return value;
    }

    /**
     * Validate constraints
     * @private
     */
    validateConstraints(value, configDef, key) {
        const errors = [];
        const constraint = configDef.constraint;

        if (!constraint) return errors; // No constraints

        switch (constraint) {
            case CONSTRAINT_TYPES.MIN_MAX:
                if (value < configDef.min) {
                    errors.push(`Config "${key}" value ${value} is below minimum ${configDef.min}`);
                }
                if (value > configDef.max) {
                    errors.push(`Config "${key}" value ${value} is above maximum ${configDef.max}`);
                }
                break;

            case CONSTRAINT_TYPES.ENUM:
                if (!configDef.values.includes(value)) {
                    errors.push(`Config "${key}" value "${value}" is not in allowed values: ${configDef.values.join(', ')}`);
                }
                break;

            case CONSTRAINT_TYPES.COLOR:
                if (!/^#[0-9A-Fa-f]{6}$/.test(value)) {
                    errors.push(`Config "${key}" value "${value}" is not a valid hex color (e.g., #ff6600)`);
                }
                break;

            case CONSTRAINT_TYPES.POSITIVE:
                if (value <= 0) {
                    errors.push(`Config "${key}" value ${value} must be positive (> 0)`);
                }
                break;

            case CONSTRAINT_TYPES.NON_NEGATIVE:
                if (value < 0) {
                    errors.push(`Config "${key}" value ${value} must be non-negative (>= 0)`);
                }
                break;

            case CONSTRAINT_TYPES.RANGE_0_1:
                if (value < 0 || value > 1) {
                    errors.push(`Config "${key}" value ${value} must be between 0.0 and 1.0`);
                }
                break;

            case CONSTRAINT_TYPES.INTEGER:
                if (!Number.isInteger(value)) {
                    errors.push(`Config "${key}" value ${value} must be an integer`);
                }
                break;

            case CONSTRAINT_TYPES.BOOLEAN:
                // Type validation already done
                break;
        }

        return errors;
    }

    /**
     * Get default value for a config key
     * @param {string} key - Config key
     * @returns {*} Default value
     */
    getDefault(key) {
        const configDef = this.schema[key];
        return configDef ? configDef.default : undefined;
    }

    /**
     * Generate default configuration object
     * @returns {Object} Default configuration
     */
    generateDefaultConfig() {
        const config = {};

        for (const [key, def] of Object.entries(this.schema)) {
            this.setNestedValue(config, key, def.default);
        }

        return config;
    }

    /**
     * Set nested value in object
     * @private
     */
    setNestedValue(obj, path, value) {
        const parts = path.split('.');
        let current = obj;

        for (let i = 0; i < parts.length - 1; i++) {
            if (!current[parts[i]]) {
                current[parts[i]] = {};
            }
            current = current[parts[i]];
        }

        current[parts[parts.length - 1]] = value;
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
     * Generate documentation for configuration
     * @returns {string} Markdown documentation
     */
    generateDocumentation() {
        let doc = `# Configuration Schema Documentation\n\n`;
        doc += `Version: ${CONFIGURATION_SCHEMA_VERSION}\n\n`;
        doc += `Total configuration keys: ${Object.keys(this.schema).length}\n\n`;

        // Group by category
        const categories = {};
        for (const [key, def] of Object.entries(this.schema)) {
            const category = key.split('.')[0];
            if (!categories[category]) {
                categories[category] = [];
            }
            categories[category].push([key, def]);
        }

        for (const [category, settings] of Object.entries(categories)) {
            doc += `## ${category.toUpperCase()} Settings (${settings.length})\n\n`;

            for (const [key, def] of settings) {
                doc += `### \`${key}\`\n\n`;
                doc += `${def.description}\n\n`;
                doc += `- **Type:** ${def.type}\n`;
                doc += `- **Default:** \`${JSON.stringify(def.default)}\`\n`;

                if (def.constraint) {
                    doc += `- **Constraint:** ${def.constraint}\n`;
                    if (def.min !== undefined) doc += `  - Min: ${def.min}\n`;
                    if (def.max !== undefined) doc += `  - Max: ${def.max}\n`;
                    if (def.values) doc += `  - Values: ${def.values.join(', ')}\n`;
                }

                doc += `\n---\n\n`;
            }
        }

        return doc;
    }
}

// Export for use in main application
window.ConfigurationSchemaValidator = ConfigurationSchemaValidator;
window.CONFIGURATION_SCHEMA = CONFIGURATION_SCHEMA;
window.CONSTRAINT_TYPES = CONSTRAINT_TYPES;
window.CONFIGURATION_SCHEMA_VERSION = CONFIGURATION_SCHEMA_VERSION;

// Create global validator instance
window.configurationSchemaValidator = new ConfigurationSchemaValidator();

// Also export as module for Node.js compatibility
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        ConfigurationSchemaValidator,
        CONFIGURATION_SCHEMA,
        CONSTRAINT_TYPES,
        CONFIGURATION_SCHEMA_VERSION
    };
}
