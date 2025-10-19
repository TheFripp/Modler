/**
 * Data Extractor - Direct Property Extraction
 *
 * SIMPLIFIED: Direct extraction of serializable properties from SceneController objects.
 * NO format detection, NO conversion layers, NO default application.
 * Just direct copying of properties we need for postMessage and file serialization.
 *
 * Core Principle: "Copy, don't transform"
 * - SceneController objects already have consistent structure
 * - We just extract what we need
 * - Preserve exact values (especially autoLayout)
 *
 * Part of: Communication Architecture Simplification
 * Version: 2.0.0
 * Date: 2025-10-16
 */

/**
 * Extract serializable data from SceneController object
 *
 * CRITICAL: This is the ONLY data extraction function.
 * All communication and serialization use this.
 *
 * @param {Object} sceneObject - Object from SceneController.getObject()
 * @returns {Object} Serializable object data (NO defaults applied, exact copy)
 */
function extractSerializableData(sceneObject) {
    if (!sceneObject) {
        return null;
    }

    // Extract mesh-based properties (position, rotation from Three.js mesh)
    const mesh = sceneObject.mesh;

    // CRITICAL: Direct copy of position/rotation from mesh (actual geometry, not transforms)
    const position = mesh ? {
        x: mesh.position.x,
        y: mesh.position.y,
        z: mesh.position.z
    } : (sceneObject.position || { x: 0, y: 0, z: 0 });

    const rotation = mesh ? {
        x: mesh.rotation.x,
        y: mesh.rotation.y,
        z: mesh.rotation.z
    } : (sceneObject.rotation || { x: 0, y: 0, z: 0 });

    const scale = mesh ? {
        x: mesh.scale.x,
        y: mesh.scale.y,
        z: mesh.scale.z
    } : (sceneObject.scale || { x: 1, y: 1, z: 1 });

    // Extract material properties
    const material = mesh?.material ? {
        color: typeof mesh.material.color?.getHex === 'function'
            ? `#${mesh.material.color.getHex().toString(16).padStart(6, '0')}`
            : (sceneObject.material?.color || '#888888'),
        opacity: mesh.material.opacity ?? 1,
        transparent: mesh.material.transparent ?? false
    } : (sceneObject.material || { color: '#888888', opacity: 1, transparent: false });

    // CRITICAL: Direct copy of autoLayout - NO transformation, NO defaults
    // Preserve EXACT values from SceneController
    const autoLayout = sceneObject.autoLayout ? { ...sceneObject.autoLayout } : null;

    // VALIDATION: Ensure isHug and autoLayout.enabled are mutually exclusive
    // This prevents corrupted data from being saved
    const isHug = autoLayout?.enabled ? false : (sceneObject.isHug || false);

    // Direct copy of all properties
    return {
        // Core identification
        id: sceneObject.id,
        name: sceneObject.name || 'Object',
        type: sceneObject.type || 'object',

        // Hierarchy
        parentContainer: sceneObject.parentContainer || null,
        childIds: sceneObject.childIds || [],
        childrenOrder: sceneObject.childrenOrder || [],

        // Transform (from mesh geometry)
        position,
        rotation,
        scale,

        // Physical properties
        dimensions: sceneObject.dimensions || { x: 1, y: 1, z: 1 },
        material,

        // Container properties - DIRECT COPY with validation
        isContainer: sceneObject.isContainer || false,
        isHug: isHug,  // Validated to ensure mutual exclusivity
        layoutMode: sceneObject.layoutMode || null,
        autoLayout: autoLayout,  // EXACT copy or null
        calculatedGap: sceneObject.calculatedGap, // May be undefined - that's OK
        layoutProperties: sceneObject.layoutProperties || null,

        // State flags
        visible: sceneObject.visible !== undefined ? sceneObject.visible : true,
        selectable: sceneObject.selectable !== undefined ? sceneObject.selectable : true,
        locked: sceneObject.locked || false,
        selected: sceneObject.selected || false,

        // Metadata
        category: sceneObject.category || 'permanent',
        isTemporary: sceneObject.isTemporary || false,
        isPreview: sceneObject.isPreview || false,

        // Timestamp
        lastModified: Date.now()
    };
}

/**
 * Extract basic object data (lighter version for hierarchy lists)
 *
 * CRITICAL: Includes parentContainer for ObjectTree to build tree structure
 *
 * @param {Object} sceneObject - Object from SceneController.getObject()
 * @returns {Object} Basic object data with parentContainer
 */
function extractBasicData(sceneObject) {
    if (!sceneObject) {
        return null;
    }

    return {
        id: sceneObject.id,
        name: sceneObject.name || 'Object',
        type: sceneObject.type || 'object',
        isContainer: sceneObject.isContainer || false,
        parentContainer: sceneObject.parentContainer || null, // CRITICAL for tree building
        selected: sceneObject.selected || false,
        locked: sceneObject.locked || false,
        visible: sceneObject.visible !== undefined ? sceneObject.visible : true,
        autoLayout: sceneObject.autoLayout ? { ...sceneObject.autoLayout } : null  // For tileMode check in UI
    };
}

/**
 * Create default autoLayout for NEW objects
 * ONLY use when creating brand new containers, never for existing objects
 *
 * @returns {Object} Default autoLayout structure
 */
function createDefaultAutoLayout() {
    return {
        enabled: false,
        direction: null,
        gap: 0,
        padding: { width: 0, height: 0, depth: 0 },
        alignment: { x: 'center', y: 'center', z: 'center' },
        reversed: false
    };
}

// Export functions
window.DataExtractor = {
    extractSerializableData,
    extractBasicData,
    createDefaultAutoLayout
};
