/**
 * Object Data Format - Central Format Module
 *
 * SINGLE SOURCE OF TRUTH for all object data formatting
 * Eliminates 5+ different formats and 6+ conversion points
 *
 * STANDARD FORMAT: Based on ObjectSerializer format with improvements
 * - Nested objects for transforms (position: {x,y,z})
 * - Degrees for rotation (UI-friendly)
 * - Consistent property naming
 * - Complete type safety
 * - PostMessage serializable
 */

/**
 * Format version for migration compatibility
 */
const OBJECT_DATA_FORMAT_VERSION = '1.0.0';

/**
 * Standard ObjectData format specification
 * This is the ONLY format that should be used throughout the system
 */
const STANDARD_OBJECT_DATA_SCHEMA = {
    // Core identification
    id: 'string',
    name: 'string',
    type: 'string',

    // Hierarchy
    parentContainer: 'string|null',
    childIds: 'array',

    // Transform (always nested objects)
    position: { x: 'number', y: 'number', z: 'number' },
    rotation: { x: 'number', y: 'number', z: 'number' }, // Always degrees
    scale: { x: 'number', y: 'number', z: 'number' },

    // Physical properties
    dimensions: { x: 'number', y: 'number', z: 'number' },
    material: {
        color: 'string', // Hex string
        opacity: 'number',
        transparent: 'boolean'
    },

    // Container properties
    isContainer: 'boolean',
    isHug: 'boolean', // Hug mode: container auto-resizes to fit children (mutually exclusive with layout mode)
    layoutMode: 'string|null',
    autoLayout: {
        enabled: 'boolean',
        direction: 'string|null',
        gap: 'number',
        padding: 'object',
        alignment: 'object|undefined', // Alignment: { x: 'left'|'center'|'right', y: 'bottom'|'center'|'top', z: 'back'|'center'|'front' }
        tileMode: 'object|undefined' // Tile mode: { enabled: boolean, repeat: number, sourceObjectId: string }
    },
    calculatedGap: 'number|undefined', // Dynamic gap value in space-between mode
    layoutProperties: 'object|undefined', // Layout properties for children (sizeX, sizeY, sizeZ: 'fixed'|'fill')

    // State flags
    selected: 'boolean',
    locked: 'boolean',
    visible: 'boolean',

    // Metadata
    formatVersion: 'string',
    lastModified: 'number'
};

/**
 * Create a standard ObjectData object with all required properties
 * @param {Object} sourceData - Source data in any format
 * @param {Object} options - Conversion options
 * @returns {Object} Standard ObjectData format
 */
function standardizeObjectData(sourceData, options = {}) {
    if (!sourceData) {
        console.warn('ObjectDataFormat.standardizeObjectData: No source data provided');
        return createEmptyObjectData();
    }

    try {
        // Detect source format and convert accordingly
        const sourceFormat = detectSourceFormat(sourceData);

        let standardData;
        switch (sourceFormat) {
            case 'flat_properties':
                standardData = convertFromFlatProperties(sourceData);
                break;
            case 'three_js':
                standardData = convertFromThreeJS(sourceData);
                break;
            case 'object_state_manager':
                standardData = convertFromObjectStateManager(sourceData);
                break;
            case 'standard':
                standardData = { ...sourceData }; // Already standard, just copy
                break;
            default:
                console.warn('ObjectDataFormat: Unknown source format, attempting best-effort conversion');
                standardData = convertBestEffort(sourceData);
        }

        // Ensure all required properties exist with proper defaults
        return ensureStandardFormat(standardData, options);

    } catch (error) {
        console.error('ObjectDataFormat.standardizeObjectData: Conversion failed:', error);
        return createEmptyObjectData(sourceData.id || 'unknown');
    }
}

/**
 * Validate that an object conforms to the standard format
 * @param {Object} objectData - Object to validate
 * @returns {Object} { isValid: boolean, errors: string[] }
 */
function validateObjectData(objectData) {
    const errors = [];

    if (!objectData || typeof objectData !== 'object') {
        return { isValid: false, errors: ['Object data is null or not an object'] };
    }

    // Required properties
    const requiredFields = ['id', 'name', 'type', 'position', 'rotation', 'dimensions'];
    requiredFields.forEach(field => {
        if (!objectData.hasOwnProperty(field)) {
            errors.push(`Missing required field: ${field}`);
        }
    });

    // Validate nested objects
    if (objectData.position && typeof objectData.position === 'object') {
        ['x', 'y', 'z'].forEach(axis => {
            if (typeof objectData.position[axis] !== 'number') {
                errors.push(`position.${axis} must be a number`);
            }
        });
    } else if (objectData.position) {
        errors.push('position must be an object with x, y, z properties');
    }

    if (objectData.rotation && typeof objectData.rotation === 'object') {
        ['x', 'y', 'z'].forEach(axis => {
            if (typeof objectData.rotation[axis] !== 'number') {
                errors.push(`rotation.${axis} must be a number`);
            }
        });
    } else if (objectData.rotation) {
        errors.push('rotation must be an object with x, y, z properties');
    }

    if (objectData.dimensions && typeof objectData.dimensions === 'object') {
        ['x', 'y', 'z'].forEach(axis => {
            if (typeof objectData.dimensions[axis] !== 'number' || objectData.dimensions[axis] <= 0) {
                errors.push(`dimensions.${axis} must be a positive number`);
            }
        });
    } else if (objectData.dimensions) {
        errors.push('dimensions must be an object with x, y, z properties');
    }

    // Validate format version
    if (objectData.formatVersion && objectData.formatVersion !== OBJECT_DATA_FORMAT_VERSION) {
        errors.push(`Unsupported format version: ${objectData.formatVersion}`);
    }

    return {
        isValid: errors.length === 0,
        errors: errors
    };
}

/**
 * Serialize ObjectData for PostMessage transmission
 * UPDATED: Now uses schema-driven serialization to prevent missing properties
 * @param {Object} objectData - Standard ObjectData
 * @returns {Object} PostMessage-safe object
 */
function serializeForPostMessage(objectData) {
    if (!objectData) return null;

    try {
        // Use schema-driven serialization if available (preferred)
        if (window.SchemaSerializer) {
            const serialized = window.SchemaSerializer.serializeWithSchema(
                objectData,
                STANDARD_OBJECT_DATA_SCHEMA,
                { createNewReferences: true }
            );

            // Add runtime metadata
            serialized.formatVersion = OBJECT_DATA_FORMAT_VERSION;
            serialized.lastModified = Date.now();

            return serialized;
        }

        // Fallback to manual serialization (backwards compatibility)
        const serialized = {
            id: objectData.id,
            name: objectData.name,
            type: objectData.type,
            isContainer: objectData.isContainer,
            position: objectData.position ? { ...objectData.position } : undefined,
            rotation: objectData.rotation ? { ...objectData.rotation } : undefined,
            scale: objectData.scale ? { ...objectData.scale } : undefined,
            dimensions: objectData.dimensions ? { ...objectData.dimensions } : undefined,
            material: objectData.material ? { ...objectData.material } : undefined,
            visible: objectData.visible,
            locked: objectData.locked,
            selectable: objectData.selectable,
            children: objectData.children ? [...objectData.children] : [],
            childrenOrder: objectData.childrenOrder ? [...objectData.childrenOrder] : undefined,
            parent: objectData.parent,
            parentContainer: objectData.parentContainer,
            layoutMode: objectData.layoutMode,
            autoLayout: objectData.autoLayout ? {
                ...objectData.autoLayout,
                padding: objectData.autoLayout.padding ? { ...objectData.autoLayout.padding } : undefined
            } : undefined,
            gap: objectData.gap,
            padding: objectData.padding,
            calculatedGap: objectData.calculatedGap,
            constraints: objectData.constraints ? { ...objectData.constraints } : undefined,
            userData: objectData.userData ? { ...objectData.userData } : {},
            createdAt: objectData.createdAt,
            modifiedAt: objectData.modifiedAt,
            formatVersion: OBJECT_DATA_FORMAT_VERSION,
            lastModified: Date.now()
        };

        return serialized;

    } catch (error) {
        console.error('ObjectDataFormat.serializeForPostMessage: Serialization failed:', error);
        return null;
    }
}

/**
 * Deserialize ObjectData from PostMessage
 * @param {Object} messageData - Data received via PostMessage
 * @returns {Object} Standard ObjectData
 */
function deserializeFromPostMessage(messageData) {
    if (!messageData) return null;

    try {
        // Validate and standardize the received data
        const standardData = standardizeObjectData(messageData);

        // Verify format version compatibility
        if (messageData.formatVersion && messageData.formatVersion !== OBJECT_DATA_FORMAT_VERSION) {
            console.warn(`ObjectDataFormat: Received data with different format version: ${messageData.formatVersion}`);
            // Could implement migration logic here if needed
        }

        return standardData;

    } catch (error) {
        console.error('ObjectDataFormat.deserializeFromPostMessage: Deserialization failed:', error);
        return null;
    }
}

/**
 * Convert flat properties format to standard nested format
 * @private
 */
function convertFromFlatProperties(sourceData) {
    const standardData = {
        id: sourceData.id || 'unknown',
        name: sourceData.name || 'Object',
        type: sourceData.type || 'object',
        isContainer: sourceData.isContainer || false,

        position: {
            x: sourceData['position.x'] || 0,
            y: sourceData['position.y'] || 0,
            z: sourceData['position.z'] || 0
        },

        rotation: {
            x: sourceData['rotation.x'] || 0,
            y: sourceData['rotation.y'] || 0,
            z: sourceData['rotation.z'] || 0
        },

        scale: {
            x: sourceData['scale.x'] || 1,
            y: sourceData['scale.y'] || 1,
            z: sourceData['scale.z'] || 1
        },

        dimensions: {
            x: sourceData['dimensions.x'] || 1,
            y: sourceData['dimensions.y'] || 1,
            z: sourceData['dimensions.z'] || 1
        },

        material: {
            color: sourceData['material.color'] || '#888888',
            opacity: sourceData['material.opacity'] || 1,
            transparent: sourceData['material.transparent'] || false
        },

        autoLayout: {
            enabled: sourceData['autoLayout.enabled'] || false,
            direction: sourceData['autoLayout.direction'] || null,
            gap: sourceData['autoLayout.gap'] || 0,
            padding: sourceData['autoLayout.padding'] || { width: 0, height: 0, depth: 0 }
        },

        calculatedGap: sourceData.calculatedGap, // Include dynamic gap value

        parentContainer: sourceData.parentContainer || null
    };

    return standardData;
}

/**
 * Convert Three.js object format to standard format
 * @private
 */
function convertFromThreeJS(threeObject) {
    const userData = threeObject.userData || {};

    const standardData = {
        id: threeObject.id || userData.id || threeObject.uuid,
        name: threeObject.name || userData.name || 'Object',
        type: threeObject.type || userData.type || 'object',
        isContainer: threeObject.isContainer || userData.isContainer || false,

        position: {
            x: threeObject.position ? parseFloat(threeObject.position.x.toFixed(3)) : 0,
            y: threeObject.position ? parseFloat(threeObject.position.y.toFixed(3)) : 0,
            z: threeObject.position ? parseFloat(threeObject.position.z.toFixed(3)) : 0
        },

        rotation: {
            // Convert radians to degrees for UI
            x: threeObject.rotation ? parseFloat((threeObject.rotation.x * 180 / Math.PI).toFixed(1)) : 0,
            y: threeObject.rotation ? parseFloat((threeObject.rotation.y * 180 / Math.PI).toFixed(1)) : 0,
            z: threeObject.rotation ? parseFloat((threeObject.rotation.z * 180 / Math.PI).toFixed(1)) : 0
        },

        scale: {
            x: threeObject.scale ? parseFloat(threeObject.scale.x.toFixed(3)) : 1,
            y: threeObject.scale ? parseFloat(threeObject.scale.y.toFixed(3)) : 1,
            z: threeObject.scale ? parseFloat(threeObject.scale.z.toFixed(3)) : 1
        },

        dimensions: userData.dimensions || { x: 1, y: 1, z: 1 },

        material: {
            color: threeObject.material?.color ? `#${threeObject.material.color.getHexString()}` : '#888888',
            opacity: threeObject.material?.opacity || 1,
            transparent: threeObject.material?.transparent || false
        },

        autoLayout: userData.autoLayout || { enabled: false, direction: null, gap: 0, padding: { width: 0, height: 0, depth: 0 } },
        calculatedGap: userData.calculatedGap, // Include dynamic gap value
        parentContainer: userData.parentContainer || null
    };

    return standardData;
}

/**
 * Convert ObjectStateManager format to standard format
 * @private
 */
function convertFromObjectStateManager(stateData) {
    const standardData = {
        id: stateData.id || 'unknown',
        name: stateData.name || 'Object',
        type: stateData.type || 'object',
        isContainer: stateData.isContainer || false,

        position: stateData.position || { x: 0, y: 0, z: 0 },

        rotation: {
            // Convert radians to degrees if needed
            x: stateData.rotation ? (stateData.rotation.x > Math.PI ? stateData.rotation.x * 180 / Math.PI : stateData.rotation.x) : 0,
            y: stateData.rotation ? (stateData.rotation.y > Math.PI ? stateData.rotation.y * 180 / Math.PI : stateData.rotation.y) : 0,
            z: stateData.rotation ? (stateData.rotation.z > Math.PI ? stateData.rotation.z * 180 / Math.PI : stateData.rotation.z) : 0
        },

        scale: stateData.scale || { x: 1, y: 1, z: 1 },
        dimensions: stateData.dimensions || { x: 1, y: 1, z: 1 },

        material: {
            color: typeof stateData.material?.color === 'number' ?
                `#${stateData.material.color.toString(16).padStart(6, '0')}` :
                stateData.material?.color || '#888888',
            opacity: stateData.material?.opacity || 1,
            transparent: stateData.material?.transparent || false
        },

        autoLayout: stateData.autoLayout || { enabled: false, direction: null, gap: 0, padding: { width: 0, height: 0, depth: 0 } },
        calculatedGap: stateData.calculatedGap, // Include dynamic gap value
        parentContainer: stateData.parentContainer || null
    };

    return standardData;
}

/**
 * Best effort conversion for unknown formats
 * @private
 */
function convertBestEffort(sourceData) {
    return {
        id: sourceData.id || sourceData.uuid || 'unknown',
        name: sourceData.name || 'Object',
        type: sourceData.type || 'object',
        isContainer: !!sourceData.isContainer,

        position: sourceData.position || { x: 0, y: 0, z: 0 },
        rotation: sourceData.rotation || { x: 0, y: 0, z: 0 },
        scale: sourceData.scale || { x: 1, y: 1, z: 1 },
        dimensions: sourceData.dimensions || { x: 1, y: 1, z: 1 },

        material: sourceData.material || { color: '#888888', opacity: 1, transparent: false },
        autoLayout: sourceData.autoLayout || { enabled: false, direction: null, gap: 0, padding: { width: 0, height: 0, depth: 0 } },
        parentContainer: sourceData.parentContainer || null
    };
}

/**
 * Detect the format of source data
 * @private
 */
function detectSourceFormat(sourceData) {
    if (!sourceData || typeof sourceData !== 'object') {
        return 'unknown';
    }

    // Check for flat properties format
    if (sourceData.hasOwnProperty('position.x') || sourceData.hasOwnProperty('rotation.x') || sourceData.hasOwnProperty('dimensions.x')) {
        return 'flat_properties';
    }

    // Check for Three.js object
    if (sourceData.geometry && sourceData.material && sourceData.position && typeof sourceData.position.set === 'function') {
        return 'three_js';
    }

    // Check for ObjectStateManager format (has mesh reference)
    if (sourceData.mesh && sourceData._sceneObjectData) {
        return 'object_state_manager';
    }

    // Check for standard format
    if (sourceData.formatVersion === OBJECT_DATA_FORMAT_VERSION ||
        (sourceData.position && typeof sourceData.position === 'object' &&
         sourceData.rotation && typeof sourceData.rotation === 'object')) {
        return 'standard';
    }

    return 'unknown';
}

/**
 * Ensure all required properties exist with proper defaults
 * @private
 */
function ensureStandardFormat(objectData, options = {}) {
    const defaults = {
        formatVersion: OBJECT_DATA_FORMAT_VERSION,
        lastModified: Date.now(),
        selected: false,
        locked: false,
        visible: true,
        childIds: [],
        layoutMode: null
    };

    // Ensure all required nested objects exist
    if (!objectData.position || typeof objectData.position !== 'object') {
        objectData.position = { x: 0, y: 0, z: 0 };
    }
    if (!objectData.rotation || typeof objectData.rotation !== 'object') {
        objectData.rotation = { x: 0, y: 0, z: 0 };
    }
    if (!objectData.scale || typeof objectData.scale !== 'object') {
        objectData.scale = { x: 1, y: 1, z: 1 };
    }
    if (!objectData.dimensions || typeof objectData.dimensions !== 'object') {
        objectData.dimensions = { x: 1, y: 1, z: 1 };
    }
    if (!objectData.material || typeof objectData.material !== 'object') {
        objectData.material = { color: '#888888', opacity: 1, transparent: false };
    }
    if (!objectData.autoLayout || typeof objectData.autoLayout !== 'object') {
        objectData.autoLayout = {
            enabled: false,
            direction: null,
            gap: 0,
            padding: { width: 0, height: 0, depth: 0 }
        };
    }

    // Apply defaults for missing properties
    Object.keys(defaults).forEach(key => {
        if (!objectData.hasOwnProperty(key)) {
            objectData[key] = defaults[key];
        }
    });

    return objectData;
}

/**
 * Create an empty ObjectData with proper structure
 * @private
 */
function createEmptyObjectData(id = null) {
    return {
        id: id || `object-${Date.now()}`,
        name: 'Empty Object',
        type: 'object',
        isContainer: false,
        isHug: false,

        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
        dimensions: { x: 1, y: 1, z: 1 },

        material: {
            color: '#888888',
            opacity: 1,
            transparent: false
        },

        autoLayout: {
            enabled: false,
            direction: null,
            gap: 0,
            padding: { width: 0, height: 0, depth: 0 }
        },

        parentContainer: null,
        childIds: [],
        layoutMode: null,

        selected: false,
        locked: false,
        visible: true,

        formatVersion: OBJECT_DATA_FORMAT_VERSION,
        lastModified: Date.now()
    };
}

// Export the central format module
window.ObjectDataFormat = {
    // Core functions
    standardizeObjectData,
    validateObjectData,
    serializeForPostMessage,
    deserializeFromPostMessage,

    // Utilities
    createEmptyObjectData,

    // Constants
    SCHEMA: STANDARD_OBJECT_DATA_SCHEMA,
    VERSION: OBJECT_DATA_FORMAT_VERSION
};

// Also export as module for Node.js compatibility
if (typeof module !== 'undefined' && module.exports) {
    module.exports = window.ObjectDataFormat;
}