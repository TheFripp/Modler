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
        x: (mesh.rotation.x * 180) / Math.PI,
        y: (mesh.rotation.y * 180) / Math.PI,
        z: (mesh.rotation.z * 180) / Math.PI
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

    // CRITICAL: Deep copy of autoLayout - NO transformation, NO defaults
    // Preserve EXACT values from SceneController; deep-copy nested objects to prevent mutation
    const autoLayout = sceneObject.autoLayout ? {
        ...sceneObject.autoLayout,
        padding: sceneObject.autoLayout.padding ? { ...sceneObject.autoLayout.padding } : undefined,
        alignment: sceneObject.autoLayout.alignment ? { ...sceneObject.autoLayout.alignment } : undefined,
        tileMode: sceneObject.autoLayout.tileMode ? { ...sceneObject.autoLayout.tileMode } : undefined
    } : null;

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
        containerMode: sceneObject.containerMode || null,
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

        // Yard (material library) metadata
        yardItemId: sceneObject.yardItemId || null,
        yardFixed: sceneObject.yardFixed || null,

        // Component properties (reserved for future instancing)
        componentId: sceneObject.componentId || null,
        isComponentMaster: sceneObject.isComponentMaster || false,
        isComponentInstance: sceneObject.isComponentInstance || false,
        masterComponentId: sceneObject.masterComponentId || null,

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
        childrenOrder: sceneObject.childrenOrder || [], // For drag-drop reordering in ObjectTree
        selected: sceneObject.selected || false,
        locked: sceneObject.locked || false,
        visible: sceneObject.visible !== undefined ? sceneObject.visible : true,
        autoLayout: sceneObject.autoLayout ? {
            ...sceneObject.autoLayout,
            padding: sceneObject.autoLayout.padding ? { ...sceneObject.autoLayout.padding } : undefined,
            alignment: sceneObject.autoLayout.alignment ? { ...sceneObject.autoLayout.alignment } : undefined,
            tileMode: sceneObject.autoLayout.tileMode ? { ...sceneObject.autoLayout.tileMode } : undefined
        } : null  // For tileMode check in UI
    };
}

/**
 * Extract a complete subtree (object + all descendants) as self-contained data.
 * Root object's parentContainer is set to null. Internal references preserved.
 * Used for object export, clipboard, and component library storage.
 *
 * @param {Object} sceneController - SceneController instance
 * @param {string} rootObjectId - ID of the root object to extract
 * @returns {Object|null} { root: serializedObject, children: [...], version: string }
 */
function extractSubtreeData(sceneController, rootObjectId) {
    if (!sceneController) return null;

    const rootObj = sceneController.getObject(rootObjectId);
    if (!rootObj) return null;

    const collected = [];

    // Recursive depth-first collection
    function collectDescendants(objId) {
        const obj = sceneController.getObject(objId);
        if (!obj) return;

        const serialized = extractSerializableData(obj);
        if (serialized) {
            collected.push(serialized);
        }

        // Recurse into children (use childrenOrder for consistent ordering)
        const childOrder = obj.childrenOrder || [];
        for (const childId of childOrder) {
            collectDescendants(childId);
        }
    }

    collectDescendants(rootObjectId);

    if (collected.length === 0) return null;

    // Root's parentContainer is null (it's the top of the exported subtree).
    // Safe to mutate: extractSerializableData() creates fresh objects.
    collected[0].parentContainer = null;

    return {
        root: collected[0],
        children: collected.slice(1),
        version: window.ObjectDataFormat?.VERSION || '1.1.0',
        exportedAt: Date.now()
    };
}

// Export functions
window.DataExtractor = {
    extractSerializableData,
    extractBasicData,
    extractSubtreeData
};
