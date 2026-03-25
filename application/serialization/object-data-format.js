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
const OBJECT_DATA_FORMAT_VERSION = '1.2.0';

/**
 * Object type constants — single source of truth for type strings
 */
const OBJECT_TYPES = {
    BOX: 'box',
    CONTAINER: 'container'
    // Future: CYLINDER: 'cylinder', SPHERE: 'sphere', GROUP: 'group', COMPONENT: 'component'
};

/**
 * Container mode constants — single source of truth for container modes
 */
const CONTAINER_MODES = {
    MANUAL: 'manual',
    LAYOUT: 'layout',
    HUG: 'hug'
};

/**
 * Maximum container nesting depth (0-indexed: depth 2 = 3 levels total)
 */
const MAX_NESTING_DEPTH = 2;

/**
 * Format migration registry — each entry upgrades data from one version to the next.
 * Add new entries when the format changes to ensure old saved files load correctly.
 */
const FORMAT_MIGRATIONS = {
    '1.0.0': {
        to: '1.1.0',
        migrate: (data) => {
            // Convert integer ID to UUID string if needed
            // Individual object migration — scene-level ID remapping handled by SceneDeserializer
            if (typeof data.id === 'number') {
                data.id = String(data.id);
            }
            if (typeof data.parentContainer === 'number') {
                data.parentContainer = String(data.parentContainer);
            }
            if (Array.isArray(data.childIds)) {
                data.childIds = data.childIds.map(id => typeof id === 'number' ? String(id) : id);
            }
            if (Array.isArray(data.childrenOrder)) {
                data.childrenOrder = data.childrenOrder.map(id => typeof id === 'number' ? String(id) : id);
            }
            if (data.autoLayout?.tileMode?.sourceObjectId && typeof data.autoLayout.tileMode.sourceObjectId === 'number') {
                data.autoLayout.tileMode.sourceObjectId = String(data.autoLayout.tileMode.sourceObjectId);
            }
            data.formatVersion = '1.1.0';
            return data;
        }
    },
    '1.1.0': {
        to: '1.2.0',
        migrate: (data) => {
            // Derive containerMode from legacy flags if missing
            if (!data.containerMode && data.isContainer) {
                if (data.isHug === true) {
                    data.containerMode = 'hug';
                } else if (data.autoLayout?.enabled) {
                    data.containerMode = 'layout';
                } else {
                    data.containerMode = 'manual';
                }
            }
            // Remove legacy container mode flags
            delete data.isHug;
            delete data.sizingMode;
            delete data.layoutMode;
            data.formatVersion = '1.2.0';
            return data;
        }
    }
};

/**
 * Apply format migrations to upgrade old data to the current version.
 * Walks the migration chain until data reaches OBJECT_DATA_FORMAT_VERSION.
 * @param {Object} data - Object data (may have old formatVersion)
 * @returns {Object} Migrated data at current version
 */
function migrateObjectData(data) {
    let current = data.formatVersion || '1.0.0';
    let iterations = 0;
    const MAX_ITERATIONS = 20; // Safety valve

    while (FORMAT_MIGRATIONS[current] && iterations < MAX_ITERATIONS) {
        const migration = FORMAT_MIGRATIONS[current];
        data = migration.migrate(data);
        current = data.formatVersion;
        iterations++;
    }

    return data;
}

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
    containerMode: 'string|null', // 'manual' | 'layout' | 'hug' — single source of truth for container mode
    autoLayout: {
        enabled: 'boolean',
        direction: 'string|null',
        gap: 'number',
        padding: 'object',
        alignment: 'object|undefined', // Alignment: { x: 'left'|'center'|'right', y: 'bottom'|'center'|'top', z: 'back'|'center'|'front' }
        reversed: 'boolean|undefined', // Reverse layout direction
        tileMode: 'object|undefined' // Tile mode: { enabled: boolean, repeat: number, sourceObjectId: string }
    },
    calculatedGap: 'number|undefined', // Dynamic gap value in space-between mode
    layoutProperties: 'object|undefined', // Layout properties for children (sizeX, sizeY, sizeZ: 'fixed'|'fill')

    // State flags
    selected: 'boolean',
    locked: 'boolean',
    visible: 'boolean',

    // Component properties (reserved for future component instancing)
    componentId: 'string|null',           // UUID of the component definition (shared across instances)
    isComponentMaster: 'boolean',         // Is this the master definition
    isComponentInstance: 'boolean',       // Is this an instance
    masterComponentId: 'string|null',     // Points to master's componentId

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
                // SceneController data doesn't have explicit format markers - use best-effort conversion
                // This is normal and expected for most object data
                standardData = convertBestEffort(sourceData);
        }

        // Apply format migrations for old saved data
        standardData = migrateObjectData(standardData);

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

    // Validate format version (accept current or any migratable version)
    if (objectData.formatVersion && objectData.formatVersion !== OBJECT_DATA_FORMAT_VERSION) {
        // Check if there's a migration path from this version
        if (!FORMAT_MIGRATIONS[objectData.formatVersion]) {
            errors.push(`Unsupported format version: ${objectData.formatVersion}`);
        }
    }

    return {
        isValid: errors.length === 0,
        errors: errors
    };
}

/**
 * Serialize ObjectData for PostMessage transmission
 * Standardizes then deep-clones to create new references (safe for Svelte reactivity)
 * @param {Object} objectData - Standard ObjectData
 * @returns {Object} PostMessage-safe object
 */
function serializeForPostMessage(objectData) {
    if (!objectData) return null;

    try {
        // Standardize to extract position/rotation from mesh references
        const standardData = standardizeObjectData(objectData);

        // Deep clone to create new references (needed for Svelte reactivity)
        // JSON round-trip is safe here: standardized data has no functions/circular refs
        const serialized = JSON.parse(JSON.stringify(standardData));

        // Ensure metadata
        serialized.formatVersion = OBJECT_DATA_FORMAT_VERSION;
        serialized.lastModified = Date.now();

        return serialized;

    } catch (error) {
        console.error('ObjectDataFormat.serializeForPostMessage: Serialization failed:', error);
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

        autoLayout: sourceData.autoLayout || createDefaultAutoLayout(),

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

        dimensions: threeObject.dimensions || userData.dimensions || { x: 1, y: 1, z: 1 },

        material: {
            color: threeObject.material?.color ? `#${threeObject.material.color.getHexString()}` : '#888888',
            opacity: threeObject.material?.opacity || 1,
            transparent: threeObject.material?.transparent || false
        },

        autoLayout: userData.autoLayout || createDefaultAutoLayout(),
        calculatedGap: userData.calculatedGap, // Include dynamic gap value
        parentContainer: threeObject.parentContainer || userData.parentContainer || null
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

        // Rotation is already in degrees (ObjectStateManager.extractRotation converts radians→degrees)
        rotation: stateData.rotation ? { x: stateData.rotation.x, y: stateData.rotation.y, z: stateData.rotation.z } : { x: 0, y: 0, z: 0 },

        scale: stateData.scale || { x: 1, y: 1, z: 1 },
        dimensions: stateData.dimensions || { x: 1, y: 1, z: 1 },

        material: {
            color: typeof stateData.material?.color === 'number' ?
                `#${stateData.material.color.toString(16).padStart(6, '0')}` :
                stateData.material?.color || '#888888',
            opacity: stateData.material?.opacity || 1,
            transparent: stateData.material?.transparent || false
        },

        autoLayout: stateData.autoLayout || createDefaultAutoLayout(),
        calculatedGap: stateData.calculatedGap, // Include dynamic gap value
        parentContainer: stateData.parentContainer || null,

        // Container mode — containerMode is the sole authority
        containerMode: stateData.containerMode || null,
        childrenOrder: stateData.childrenOrder || [],
        childIds: stateData.childIds || [],

        // Additional object properties
        selectable: stateData.selectable !== undefined ? stateData.selectable : true,
        visible: stateData.visible !== undefined ? stateData.visible : true,

        // Preserve formatVersion to avoid unnecessary migration
        formatVersion: stateData.formatVersion || OBJECT_DATA_FORMAT_VERSION
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
        containerMode: sourceData.containerMode || null,
        autoLayout: sourceData.autoLayout || createDefaultAutoLayout(),
        parentContainer: sourceData.parentContainer || null,
        formatVersion: sourceData.formatVersion || OBJECT_DATA_FORMAT_VERSION
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

    // Check for SceneController/ObjectStateManager format (has mesh reference)
    // CRITICAL: Must detect this BEFORE checking for standard format to avoid copying mesh
    if (sourceData.mesh && sourceData.id) {
        return 'object_state_manager';
    }

    // Check for ObjectStateManager format (has mesh reference + _sceneObjectData)
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
        childIds: []
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

    // CRITICAL FIX: Don't overwrite existing autoLayout with defaults
    // Only create default if autoLayout is truly missing or invalid
    if (!objectData.autoLayout || typeof objectData.autoLayout !== 'object') {
        objectData.autoLayout = createDefaultAutoLayout();
    } else {
        // Preserve existing autoLayout - fill in missing properties from canonical defaults
        const defaults = createDefaultAutoLayout();
        for (const key of Object.keys(defaults)) {
            if (key === 'padding' || key === 'alignment') {
                // Nested objects: ensure they exist with proper shape
                if (!objectData.autoLayout[key] || typeof objectData.autoLayout[key] !== 'object') {
                    objectData.autoLayout[key] = defaults[key];
                }
            } else if (objectData.autoLayout[key] === undefined) {
                objectData.autoLayout[key] = defaults[key];
            }
        }
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
 * Create a default autoLayout object with all required properties
 * SINGLE SOURCE OF TRUTH for autoLayout defaults
 * @returns {Object} Complete autoLayout object based on STANDARD_OBJECT_DATA_SCHEMA
 */
function createDefaultPadding() {
    return { width: 0, height: 0, depth: 0 };
}

function createDefaultAutoLayout() {
    return {
        enabled: false,
        direction: null,
        gap: 0,
        padding: createDefaultPadding(),
        alignment: { x: 'center', y: 'center', z: 'center' },
        reversed: false,
        tileMode: undefined
    };
}

/**
 * Create an empty ObjectData with proper structure
 * @private
 */
function createEmptyObjectData(id = null) {
    return {
        id: id || crypto.randomUUID(),
        name: 'Empty Object',
        type: 'object',
        isContainer: false,
        containerMode: null,

        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
        dimensions: { x: 1, y: 1, z: 1 },

        material: {
            color: '#888888',
            opacity: 1,
            transparent: false
        },

        autoLayout: createDefaultAutoLayout(),

        parentContainer: null,
        childIds: [],

        selected: false,
        locked: false,
        visible: true,

        formatVersion: OBJECT_DATA_FORMAT_VERSION,
        lastModified: Date.now()
    };
}

/**
 * Create complete object metadata using schema defaults
 * SINGLE SOURCE OF TRUTH for object creation
 *
 * @param {Object} options - Object creation options
 * @returns {Object} Complete object metadata following STANDARD_OBJECT_DATA_SCHEMA
 */
function createObjectMetadata(options = {}) {
    const validTypes = Object.values(OBJECT_TYPES);
    const type = options.type || OBJECT_TYPES.BOX;
    const systemTypes = ['mesh', 'grid', 'cube'];
    if (options.type && !validTypes.includes(options.type) && !systemTypes.includes(options.type)) {
        console.warn(`ObjectDataFormat: Unknown object type '${options.type}', valid types: ${validTypes.join(', ')}`);
    }

    return {
        // Core identification
        id: options.id || crypto.randomUUID(),
        name: options.name || 'Object',
        type: type,

        // Hierarchy
        parentContainer: options.parentContainer || null,
        childIds: options.childIds || [],
        childrenOrder: options.childrenOrder || [],

        // Transform
        position: options.position || { x: 0, y: 0, z: 0 },
        rotation: options.rotation || { x: 0, y: 0, z: 0 },
        scale: options.scale || { x: 1, y: 1, z: 1 },

        // Physical properties (dimensions handled by getter in SceneLifecycleManager)
        dimensions: options.dimensions || { x: 1, y: 1, z: 1 },
        material: options.material || {
            color: '#888888',
            opacity: 1,
            transparent: false
        },

        // Container properties - ALWAYS use schema defaults
        isContainer: options.isContainer || false,
        containerMode: options.containerMode || (options.isContainer ? 'hug' : null),
        autoLayout: options.autoLayout || createDefaultAutoLayout(), // SCHEMA DEFAULT - never null
        layoutProperties: options.layoutProperties || {
            sizeX: options.sizeX || 'fixed',
            sizeY: options.sizeY || 'fixed',
            sizeZ: options.sizeZ || 'fixed',
            fixedSize: options.fixedSize || null
        },

        // State flags
        visible: options.visible !== false,
        selectable: options.selectable !== false,
        locked: options.locked || false,
        selected: options.selected || false,

        // Metadata
        formatVersion: OBJECT_DATA_FORMAT_VERSION,
        created: options.created || Date.now(),
        lastModified: Date.now(),

        // Three.js specific (not in schema but needed internally)
        mesh: options.mesh || null,
        category: options.category || 'permanent',
        isTemporary: options.isTemporary || false,
        isPreview: options.isPreview || false,
        userData: options.userData || {},

        // Additional options pass-through
        originalBounds: options.originalBounds || undefined,

        // Yard (material library) metadata
        yardItemId: options.yardItemId || null,
        yardFixed: options.yardFixed || null
    };
}

/**
 * Remap all ID references in an array of objects using a provided mapping.
 * Handles: id, parentContainer, childIds, childrenOrder, autoLayout.tileMode.sourceObjectId.
 * This is the single source of truth for "which fields contain object ID references".
 *
 * @param {Array<Object>} objects - Array of serialized object data to remap
 * @param {Map<string, string>} idMap - Map from old ID (as string) to new ID
 */
function remapObjectIds(objects, idMap) {
    for (const obj of objects) {
        obj.id = idMap.get(String(obj.id)) || obj.id;

        if (obj.parentContainer != null) {
            obj.parentContainer = idMap.get(String(obj.parentContainer)) || obj.parentContainer;
        }
        if (Array.isArray(obj.childIds)) {
            obj.childIds = obj.childIds.map(id => idMap.get(String(id)) || id);
        }
        if (Array.isArray(obj.childrenOrder)) {
            obj.childrenOrder = obj.childrenOrder.map(id => idMap.get(String(id)) || id);
        }
        if (obj.autoLayout?.tileMode?.sourceObjectId != null) {
            obj.autoLayout.tileMode.sourceObjectId =
                idMap.get(String(obj.autoLayout.tileMode.sourceObjectId)) || obj.autoLayout.tileMode.sourceObjectId;
        }
    }
}

// Export the central format module
window.ObjectDataFormat = {
    // Core functions
    standardizeObjectData,
    validateObjectData,
    serializeForPostMessage,

    // Factories
    createObjectMetadata,
    createEmptyObjectData,
    createDefaultAutoLayout,
    createDefaultPadding,

    // Migration & ID utilities
    migrateObjectData,
    remapObjectIds,

    // Constants
    SCHEMA: STANDARD_OBJECT_DATA_SCHEMA,
    VERSION: OBJECT_DATA_FORMAT_VERSION,
    FORMAT_MIGRATIONS,
    OBJECT_TYPES,
    CONTAINER_MODES,
    MAX_NESTING_DEPTH
};

// Also export as module for Node.js compatibility
if (typeof module !== 'undefined' && module.exports) {
    module.exports = window.ObjectDataFormat;
}