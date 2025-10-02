/**
 * Schema-Driven Serialization Utility
 *
 * Automatically serializes objects based on schema definition
 * Eliminates manual property enumeration and prevents missing property bugs
 *
 * Benefits:
 * - Add property once to schema → all serialization updated automatically
 * - Impossible to forget properties
 * - Single source of truth
 * - Type validation built-in
 * - Handles nested objects and arrays
 */

/**
 * Serialize a property based on its schema type
 * @param {*} value - The property value
 * @param {string|object} schemaType - The schema type definition
 * @returns {*} Serialized value with new references for objects
 */
function serializeProperty(value, schemaType) {
    // Handle undefined/null
    if (value === undefined || value === null) {
        // Check if schema allows null/undefined
        if (typeof schemaType === 'string' && (schemaType.includes('null') || schemaType.includes('undefined'))) {
            return value;
        }
        // Return default for required properties
        return getDefaultForType(schemaType);
    }

    // Handle nested objects (recursive)
    if (typeof schemaType === 'object' && !Array.isArray(schemaType)) {
        return serializeNestedObject(value, schemaType);
    }

    // Handle arrays
    if (typeof schemaType === 'string' && schemaType.includes('array')) {
        if (!Array.isArray(value)) return [];
        // Create new array reference
        return [...value];
    }

    // Handle primitives - return value as-is
    // (primitives are immutable, no need for new references)
    return value;
}

/**
 * Serialize nested object recursively
 * @param {object} obj - The object to serialize
 * @param {object} schema - The schema for the object
 * @returns {object} New object with all schema properties
 */
function serializeNestedObject(obj, schema) {
    if (!obj || typeof obj !== 'object') {
        obj = {};
    }

    const serialized = {};

    for (const [key, schemaType] of Object.entries(schema)) {
        serialized[key] = serializeProperty(obj[key], schemaType);
    }

    return serialized;
}

/**
 * Get default value for a schema type
 * @param {string|object} schemaType - The schema type definition
 * @returns {*} Default value
 */
function getDefaultForType(schemaType) {
    // Handle nested objects
    if (typeof schemaType === 'object' && !Array.isArray(schemaType)) {
        return serializeNestedObject({}, schemaType);
    }

    // Parse string type
    const typeStr = typeof schemaType === 'string' ? schemaType.split('|')[0] : 'string';

    switch (typeStr) {
        case 'string': return '';
        case 'number': return 0;
        case 'boolean': return false;
        case 'array': return [];
        case 'object': return {};
        default: return null;
    }
}

/**
 * Serialize object using schema (main entry point)
 * @param {object} sourceData - Source object to serialize
 * @param {object} schema - Schema definition
 * @param {object} options - Serialization options
 * @returns {object} Fully serialized object with all schema properties
 */
function serializeWithSchema(sourceData, schema, options = {}) {
    const {
        includeOptional = true,
        createNewReferences = true
    } = options;

    if (!sourceData || typeof sourceData !== 'object') {
        sourceData = {};
    }

    const serialized = {};

    for (const [key, schemaType] of Object.entries(schema)) {
        // Skip optional properties if requested
        if (!includeOptional && typeof schemaType === 'string' && schemaType.includes('undefined')) {
            if (sourceData[key] === undefined) {
                continue;
            }
        }

        // Serialize the property
        serialized[key] = serializeProperty(sourceData[key], schemaType);
    }

    return serialized;
}

/**
 * Validate object against schema
 * @param {object} obj - Object to validate
 * @param {object} schema - Schema definition
 * @returns {object} Validation result { isValid, missing, invalid }
 */
function validateAgainstSchema(obj, schema) {
    const missing = [];
    const invalid = [];

    function validateRecursive(obj, schema, path = '') {
        for (const [key, schemaType] of Object.entries(schema)) {
            const fullPath = path ? `${path}.${key}` : key;

            // Check if optional
            const isOptional = typeof schemaType === 'string' &&
                              (schemaType.includes('undefined') || schemaType.includes('null'));

            // Check if missing
            if (!obj || !obj.hasOwnProperty(key)) {
                if (!isOptional) {
                    missing.push(fullPath);
                }
                continue;
            }

            // Check nested objects
            if (typeof schemaType === 'object' && !Array.isArray(schemaType)) {
                if (typeof obj[key] === 'object' && obj[key] !== null) {
                    validateRecursive(obj[key], schemaType, fullPath);
                } else if (!isOptional) {
                    invalid.push({ path: fullPath, reason: 'Expected object' });
                }
                continue;
            }

            // Type validation for primitives
            const expectedType = typeof schemaType === 'string' ? schemaType.split('|')[0] : 'string';
            const actualType = Array.isArray(obj[key]) ? 'array' : typeof obj[key];

            if (expectedType === 'number' && actualType !== 'number') {
                invalid.push({ path: fullPath, reason: `Expected number, got ${actualType}` });
            } else if (expectedType === 'string' && actualType !== 'string') {
                invalid.push({ path: fullPath, reason: `Expected string, got ${actualType}` });
            } else if (expectedType === 'boolean' && actualType !== 'boolean') {
                invalid.push({ path: fullPath, reason: `Expected boolean, got ${actualType}` });
            } else if (expectedType === 'array' && !Array.isArray(obj[key])) {
                invalid.push({ path: fullPath, reason: `Expected array, got ${actualType}` });
            }
        }
    }

    validateRecursive(obj, schema);

    return {
        isValid: missing.length === 0 && invalid.length === 0,
        missing,
        invalid
    };
}

/**
 * Deep clone object with new references (for Svelte reactivity)
 * @param {*} value - Value to clone
 * @returns {*} Deep cloned value
 */
function deepClone(value) {
    if (value === null || value === undefined) {
        return value;
    }

    if (Array.isArray(value)) {
        return value.map(deepClone);
    }

    if (typeof value === 'object') {
        const cloned = {};
        for (const [key, val] of Object.entries(value)) {
            cloned[key] = deepClone(val);
        }
        return cloned;
    }

    // Primitives
    return value;
}

// Export for use in other modules
window.SchemaSerializer = {
    serializeWithSchema,
    serializeProperty,
    serializeNestedObject,
    validateAgainstSchema,
    deepClone,
    getDefaultForType
};

// Also export as module for Node.js compatibility (for tests)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = window.SchemaSerializer;
}
