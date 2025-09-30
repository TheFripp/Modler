/**
 * ObjectStateManager - State Coordination Layer
 *
 * ARCHITECTURE: Proxy Pattern
 * - SceneController is the single source of truth for 3D geometry
 * - ObjectStateManager coordinates updates between systems
 * - All geometry updates (dimensions, position, rotation) proxy to SceneController
 *
 * SOLVES: Multiple disconnected state systems causing sync bugs
 *
 * PROVIDES:
 * - Unified update API for all property changes
 * - Automatic propagation to SceneController and UI
 * - Event coordination (ObjectEventBus, selection, hierarchy)
 * - Format validation via ObjectDataFormat
 * - Batched updates for performance
 *
 * KEY PRINCIPLE:
 * - SceneController owns the 3D data (geometry, meshes)
 * - ObjectStateManager routes updates and coordinates events
 * - No duplicate storage of geometry properties
 */

class ObjectStateManager extends EventTarget {
    constructor() {
        super();

        // SINGLE SOURCE OF TRUTH: All object state lives here
        this.objects = new Map(); // objectId -> complete object state
        this.selection = new Set(); // Set of selected object IDs
        this.hierarchy = []; // Flat array of all objects for UI

        // System references for propagation
        this.sceneController = null;
        this.uiSystems = new Set(); // UI systems that need updates
        this.objectDataFormat = null; // Central format standardization

        // Change tracking for efficient updates
        this.pendingChanges = new Map(); // objectId -> source
        this.updateScheduled = false;
    }

    /**
     * Initialize with system references
     */
    initialize(systems) {
        this.sceneController = systems.sceneController;

        // Initialize ObjectDataFormat reference
        this.objectDataFormat = window.ObjectDataFormat;
        if (!this.objectDataFormat) {
            console.warn('ObjectStateManager: ObjectDataFormat not available');
        }

        // Import existing object state from SceneController
        this.importFromSceneController();

        // Set up SelectionController integration if available
        this.setupSelectionControllerIntegration(systems);

        // Make ObjectStateManager globally available immediately
        if (window.modlerComponents) {
            window.modlerComponents.objectStateManager = this;
        } else {
            console.warn('ObjectStateManager: window.modlerComponents not available');
        }
    }

    /**
     * Set up bidirectional integration with SelectionController
     */
    setupSelectionControllerIntegration(systems) {
        const selectionController = window.modlerComponents?.selectionController;
        if (!selectionController) return;

        // Listen to SelectionController changes and sync to ObjectStateManager
        if (selectionController.addEventListener) {
            selectionController.addEventListener('selectionChanged', (event) => {
                const selectedMeshes = event.detail.selectedObjects || event.detail || [];
                const selectedIds = selectedMeshes.map(mesh => {
                    const objectData = this.sceneController?.getObjectByMesh?.(mesh);
                    return objectData?.id || mesh.userData?.id || mesh.uuid;
                }).filter(Boolean);

                // Update our selection without triggering circular events
                if (JSON.stringify(Array.from(this.selection)) !== JSON.stringify(selectedIds)) {
                    this.selection.clear();
                    selectedIds.forEach(id => this.selection.add(id));

                    // Emit our selection change event
                    this.dispatchEvent(new CustomEvent('selection-changed', {
                        detail: { selection: Array.from(this.selection) }
                    }));
                }
            });
        }

        // Set initial selection from SelectionController
        const initialSelection = selectionController.getSelectedObjects?.() || [];
        const initialIds = initialSelection.map(mesh => {
            const objectData = this.sceneController?.getObjectByMesh?.(mesh);
            return objectData?.id || mesh.userData?.id || mesh.uuid;
        }).filter(Boolean);

        this.setSelection(initialIds);
    }

    /**
     * Import existing state from SceneController (migration helper)
     */
    importFromSceneController() {
        if (!this.sceneController) return;

        // Get all objects from scene and import their state using standard format
        const sceneObjects = this.sceneController.getAllObjects();
        sceneObjects.forEach(objectData => {
            // Use ObjectDataFormat for standardization if available
            let standardizedData;

            if (this.objectDataFormat) {
                // Prepare source data for standardization
                const sourceData = {
                    ...objectData, // Include all SceneController data
                    // Add Three.js mesh data for complete conversion
                    position: objectData.mesh?.position,
                    rotation: objectData.mesh?.rotation,
                    scale: objectData.mesh?.scale,
                    geometry: objectData.mesh?.geometry,
                    material: objectData.mesh?.material
                };

                // Standardize the format
                standardizedData = this.objectDataFormat.standardizeObjectData(sourceData);

                // Validate the result
                const validation = this.objectDataFormat.validateObjectData(standardizedData);
                if (!validation.isValid) {
                    console.warn(`ObjectStateManager: Invalid data for object ${objectData.id}:`, validation.errors);
                }
            } else {
                // Fallback to legacy format if ObjectDataFormat not available
                standardizedData = this.createLegacyFormat(objectData);
            }

            // Add internal references (mesh kept for backward compatibility)
            standardizedData.mesh = objectData.mesh;

            this.objects.set(objectData.id, standardizedData);
        });

        this.rebuildHierarchy();
    }

    /**
     * Create legacy format for fallback compatibility
     * @private
     */
    createLegacyFormat(objectData) {
        return {
            // Core identity
            id: objectData.id,
            name: objectData.name,
            type: objectData.type,

            // 3D properties
            position: objectData.mesh ? {
                x: objectData.mesh.position.x,
                y: objectData.mesh.position.y,
                z: objectData.mesh.position.z
            } : { x: 0, y: 0, z: 0 },

            rotation: objectData.mesh ? {
                x: objectData.mesh.rotation.x,
                y: objectData.mesh.rotation.y,
                z: objectData.mesh.rotation.z
            } : { x: 0, y: 0, z: 0 },

            scale: { x: 1, y: 1, z: 1 },
            dimensions: objectData.dimensions || { x: 1, y: 1, z: 1 },

            // Container properties
            isContainer: objectData.isContainer || false,
            parentContainer: objectData.parentContainer || null,
            autoLayout: objectData.autoLayout || { enabled: false, direction: 'x' },
            childIds: [],
            layoutMode: null,

            // Material properties
            material: objectData.material || { color: '#888888', opacity: 1, transparent: false },

            // State flags
            selected: false,
            locked: false,
            visible: true,

            // Metadata
            formatVersion: '1.0.0',
            lastModified: Date.now()
        };
    }

    /**
     * Import a single object from SceneController
     */
    importObjectFromScene(objectData) {
        if (!objectData) {
            console.warn('ObjectStateManager: No objectData provided for import');
            return;
        }

        this.objects.set(objectData.id, {
            // Core identity
            id: objectData.id,
            name: objectData.name,
            type: objectData.type,

            // 3D properties
            position: objectData.mesh ? {
                x: objectData.mesh.position.x,
                y: objectData.mesh.position.y,
                z: objectData.mesh.position.z
            } : { x: 0, y: 0, z: 0 },

            rotation: objectData.mesh ? {
                x: objectData.mesh.rotation.x,
                y: objectData.mesh.rotation.y,
                z: objectData.mesh.rotation.z
            } : { x: 0, y: 0, z: 0 },

            dimensions: objectData.dimensions || { x: 1, y: 1, z: 1 },

            // Container properties
            isContainer: objectData.isContainer || false,
            parentContainer: objectData.parentContainer || null,
            autoLayout: objectData.autoLayout || { enabled: false, direction: 'x' },

            // Material properties
            material: objectData.material || { color: 0x888888 },

            // Internal references (mesh kept for backward compatibility)
            mesh: objectData.mesh
        });

        // CRITICAL: Rebuild hierarchy and emit events to trigger UI updates
        this.rebuildHierarchy();

        // Emit HIERARCHY event to notify PropertyPanelSync and other listeners
        if (window.objectEventBus) {
            window.objectEventBus.emit(
                window.objectEventBus.EVENT_TYPES.HIERARCHY,
                objectData.id,
                { action: 'import', objectName: objectData.name },
                { immediate: true, source: 'ObjectStateManager.importObjectFromScene' }
            );
        }
    }

    /**
     * UNIFIED UPDATE API: Single method to update any property
     */
    updateObject(objectId, updates, source = 'input') {
        let object = this.objects.get(objectId);

        // Auto-create object if it doesn't exist (handles timing issues)
        if (!object) {
            // Try to get object from SceneController
            const sceneObject = this.sceneController?.getObject?.(objectId);
            if (sceneObject) {
                // Import this specific object from SceneController
                this.importObjectFromScene(sceneObject);
                object = this.objects.get(objectId);
            } else {
                // Create minimal object structure for updates
                object = {
                    id: objectId,
                    name: `Object ${objectId}`,
                    type: 'unknown',
                    position: { x: 0, y: 0, z: 0 },
                    dimensions: { x: 1, y: 1, z: 1 },
                    rotation: { x: 0, y: 0, z: 0 },
                    scale: { x: 1, y: 1, z: 1 },
                    material: {},
                    isContainer: false,
                    parentContainer: null
                };
                this.objects.set(objectId, object);
            }
        }

        // Apply updates to local state
        this.applyUpdates(object, updates);

        // Validate format after updates if ObjectDataFormat is available
        if (this.objectDataFormat) {
            const validation = this.objectDataFormat.validateObjectData(object);
            if (!validation.isValid) {
                console.warn(`ObjectStateManager: Object ${objectId} invalid after update:`, validation.errors);
                // Could implement auto-correction here if needed
            }
        }

        // Update lastModified timestamp
        object.lastModified = Date.now();

        // Track this object for propagation with source
        this.pendingChanges.set(objectId, source);
        this.scheduleUpdate();

        return true;
    }

    /**
     * Apply nested property updates
     * Supports two formats:
     * 1. Flat paths: {'position.x': 5, 'position.y': 10} (from UI)
     * 2. Nested objects: {position: {x: 5, y: 10}} (from tools)
     *
     * Note: Geometry properties proxy to SceneController (single source of truth)
     */
    applyUpdates(object, updates) {
        // PASS 1: Expand nested objects into flat paths
        // Must be done BEFORE iterating to process, otherwise forEach snapshot misses new keys
        const expandedUpdates = {};

        Object.entries(updates).forEach(([path, value]) => {
            // Handle nested object format (e.g., position: {x: 5, y: 10})
            if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                if (path === 'position' || path === 'rotation' || path === 'dimensions') {
                    // Expand nested object into flat paths
                    Object.entries(value).forEach(([axis, axisValue]) => {
                        expandedUpdates[`${path}.${axis}`] = axisValue;
                    });
                    return; // Skip adding the nested object itself
                }
            }
            // Copy all other updates as-is
            expandedUpdates[path] = value;
        });

        // PASS 2: Process all flat paths into pending updates
        const dimensionUpdates = {};
        const positionUpdates = {};
        const rotationUpdates = {};

        Object.entries(expandedUpdates).forEach(([path, value]) => {
            // Handle flat path format (e.g., 'position.x': 5)
            if (path.startsWith('dimensions.')) {
                const axis = path.split('.')[1];
                dimensionUpdates[axis] = value;
            } else if (path.startsWith('position.')) {
                const axis = path.split('.')[1];
                positionUpdates[axis] = value;
            } else if (path.startsWith('rotation.')) {
                const axis = path.split('.')[1];
                rotationUpdates[axis] = value;
            } else if (path.includes('.')) {
                // Other nested properties (e.g., "autoLayout.gap", "material.color")
                const [parent, child] = path.split('.');
                if (!object[parent]) object[parent] = {};
                object[parent][child] = value;
            } else {
                // Direct property
                object[path] = value;
            }
        });

        // Store geometry updates for later application by SceneController
        if (Object.keys(dimensionUpdates).length > 0) {
            object._pendingDimensionUpdates = dimensionUpdates;
        }
        if (Object.keys(positionUpdates).length > 0) {
            object._pendingPositionUpdates = positionUpdates;
        }
        if (Object.keys(rotationUpdates).length > 0) {
            object._pendingRotationUpdates = rotationUpdates;
        }
    }

    /**
     * Batch updates and propagate to all systems
     */
    scheduleUpdate() {
        if (this.updateScheduled) return;

        this.updateScheduled = true;
        requestAnimationFrame(() => {
            this.propagateChanges();
            this.updateScheduled = false;
        });
    }

    /**
     * Propagate changes to all dependent systems
     */
    propagateChanges() {
        if (this.pendingChanges.size === 0) return;

        // Build array of {object, source} pairs
        const changedItems = Array.from(this.pendingChanges.entries()).map(([id, source]) => ({
            object: this.objects.get(id),
            source
        }));

        // Extract objects for methods that don't need source
        const changedObjects = changedItems.map(item => item.object);

        // Update 3D scene
        this.updateSceneController(changedObjects);

        // Update UI systems
        this.updateUISystems(changedObjects);

        // Emit unified events with source information
        this.emitChangeEvents(changedItems);

        // Clear pending changes
        this.pendingChanges.clear();
    }

    /**
     * Update SceneController with object changes
     */
    updateSceneController(changedObjects) {
        if (!this.sceneController) {
            return;
        }

        changedObjects.forEach(object => {
            // PROXY PATTERN: Apply ALL geometry updates directly to SceneController
            // SceneController is the single source of truth for all 3D properties

            // Apply dimension updates
            if (object._pendingDimensionUpdates && this.sceneController.updateObjectDimensions) {
                const updates = object._pendingDimensionUpdates;
                Object.entries(updates).forEach(([axis, value]) => {
                    this.sceneController.updateObjectDimensions(object.id, axis, value);
                });
                delete object._pendingDimensionUpdates;

                // Sync back from SceneController
                const sceneObject = this.sceneController.getObject(object.id);
                if (sceneObject?.dimensions) {
                    object.dimensions = { ...sceneObject.dimensions };
                }
            }

            // Apply position updates
            if (object._pendingPositionUpdates && this.sceneController.updateObjectPosition) {
                const updates = object._pendingPositionUpdates;
                Object.entries(updates).forEach(([axis, value]) => {
                    this.sceneController.updateObjectPosition(object.id, axis, value);
                });
                delete object._pendingPositionUpdates;

                // Sync back from SceneController
                const sceneObject = this.sceneController.getObject(object.id);
                if (sceneObject?.position) {
                    object.position = { ...sceneObject.position };
                }
            }

            // Apply rotation updates
            if (object._pendingRotationUpdates && this.sceneController.updateObjectRotation) {
                const updates = object._pendingRotationUpdates;
                Object.entries(updates).forEach(([axis, value]) => {
                    this.sceneController.updateObjectRotation(object.id, axis, value);
                });
                delete object._pendingRotationUpdates;

                // Sync back from SceneController
                const sceneObject = this.sceneController.getObject(object.id);
                if (sceneObject?.rotation) {
                    object.rotation = { ...sceneObject.rotation };
                }
            }

            // Update container layout if needed
            if (object.isContainer && object.autoLayout?.enabled) {
                this.sceneController.updateLayout(object.id);
            }

            // Sync non-geometry properties to SceneController
            const sceneObject = this.sceneController.getObject(object.id);
            if (sceneObject) {
                sceneObject.name = object.name;
                if (object.autoLayout) {
                    sceneObject.autoLayout = object.autoLayout;
                }
            }
        });
    }

    /**
     * Update UI systems (Svelte stores, property panel)
     */
    updateUISystems(changedObjects) {
        // Rebuild hierarchy for object list
        this.rebuildHierarchy();

        // Emit update events for UI systems
        this.dispatchEvent(new CustomEvent('objects-changed', {
            detail: {
                objects: changedObjects,
                hierarchy: this.hierarchy,
                selection: Array.from(this.selection)
            }
        }));
    }

    /**
     * Emit ObjectEventBus events for backward compatibility
     */
    emitChangeEvents(changedItems) {
        if (!window.objectEventBus) return;

        changedItems.forEach(({ object, source }) => {
            // Skip objects without valid IDs (e.g., during creation)
            if (!object || !object.id) {
                return;
            }

            // Determine event type based on what changed
            const eventType = this.determineEventType(object);

            window.objectEventBus.emit(
                eventType,
                object.id,
                { changeType: 'unified-update', source: source },
                { source: 'ObjectStateManager', throttle: false }
            );
        });
    }

    /**
     * Determine appropriate event type for ObjectEventBus
     */
    determineEventType(object) {
        if (object.autoLayout?.enabled) {
            return window.objectEventBus.EVENT_TYPES.HIERARCHY;
        }
        if (object.position || object.rotation) {
            return window.objectEventBus.EVENT_TYPES.TRANSFORM;
        }
        if (object.dimensions) {
            return window.objectEventBus.EVENT_TYPES.GEOMETRY;
        }
        return window.objectEventBus.EVENT_TYPES.MATERIAL;
    }

    /**
     * Rebuild hierarchy array for UI consumption
     */
    rebuildHierarchy() {
        this.hierarchy = Array.from(this.objects.values())
            .filter(obj => obj.name !== 'Floor Grid' && !obj.name?.toLowerCase().includes('grid'))
            .sort((a, b) => a.name.localeCompare(b.name));
    }

    /**
     * Selection management
     */
    setSelection(objectIds) {
        this.selection.clear();
        objectIds.forEach(id => this.selection.add(id));

        this.dispatchEvent(new CustomEvent('selection-changed', {
            detail: { selection: Array.from(this.selection) }
        }));
    }

    /**
     * Get current object state (for UI consumption)
     */
    getObject(objectId) {
        return this.objects.get(objectId);
    }

    /**
     * Get all objects (for UI consumption)
     */
    getAllObjects() {
        return Array.from(this.objects.values());
    }

    /**
     * Get current selection
     */
    getSelection() {
        return Array.from(this.selection);
    }

    /**
     * Get hierarchy for object list
     */
    getHierarchy() {
        return this.hierarchy;
    }

    /**
     * Get object in PostMessage-ready format
     * @param {string} objectId - Object ID
     * @returns {Object|null} PostMessage-safe object data
     */
    getObjectForPostMessage(objectId) {
        const object = this.objects.get(objectId);
        if (!object || !this.objectDataFormat) {
            return object; // Return as-is if ObjectDataFormat not available
        }

        try {
            return this.objectDataFormat.serializeForPostMessage(object);
        } catch (error) {
            console.error(`ObjectStateManager: Failed to serialize object ${objectId} for PostMessage:`, error);
            return object;
        }
    }

    /**
     * Get all objects in PostMessage-ready format
     * @returns {Array<Object>} Array of PostMessage-safe objects
     */
    getAllObjectsForPostMessage() {
        const objects = Array.from(this.objects.values());

        if (!this.objectDataFormat) {
            return objects; // Return as-is if ObjectDataFormat not available
        }

        try {
            return objects.map(obj => this.objectDataFormat.serializeForPostMessage(obj)).filter(Boolean);
        } catch (error) {
            console.error('ObjectStateManager: Failed to serialize objects for PostMessage:', error);
            return objects;
        }
    }

    /**
     * Get hierarchy in PostMessage-ready format
     * @returns {Array<Object>} PostMessage-safe hierarchy
     */
    getHierarchyForPostMessage() {
        if (!this.objectDataFormat) {
            return this.hierarchy; // Return as-is if ObjectDataFormat not available
        }

        try {
            return this.hierarchy.map(obj => this.objectDataFormat.serializeForPostMessage(obj)).filter(Boolean);
        } catch (error) {
            console.error('ObjectStateManager: Failed to serialize hierarchy for PostMessage:', error);
            return this.hierarchy;
        }
    }
}

// Export singleton instance
window.ObjectStateManager = ObjectStateManager;