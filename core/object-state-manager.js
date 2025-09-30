/**
 * ObjectStateManager - Single Source of Truth
 *
 * UPDATED: Now uses ObjectDataFormat for standardized data
 *
 * SOLVES: Multiple disconnected state systems causing manual integration bugs
 *
 * REPLACES:
 * - Manual property updates in main-integration.js
 * - Scattered state in SceneController, Svelte stores, PropertyController
 * - Manual ObjectEventBus emissions
 * - PostMessage bridging code
 * - Multiple data format conversions
 *
 * PROVIDES:
 * - Single object state store with standard format
 * - Automatic change propagation
 * - Reactive subscriptions
 * - Unified update API
 * - Format validation and consistency
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
        this.pendingChanges = new Set();
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

            // Add internal references (not part of standard format)
            standardizedData.mesh = objectData.mesh;
            standardizedData._sceneObjectData = objectData;

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

            // Internal references (read-only)
            mesh: objectData.mesh,
            _sceneObjectData: objectData
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
    updateObject(objectId, updates) {
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

        // Track this object for propagation
        this.pendingChanges.add(objectId);
        this.scheduleUpdate();

        return true;
    }

    /**
     * Apply nested property updates (e.g., "position.x", "autoLayout.enabled")
     */
    applyUpdates(object, updates) {
        Object.entries(updates).forEach(([path, value]) => {
            if (path.includes('.')) {
                // Nested property (e.g., "position.x")
                const [parent, child] = path.split('.');
                if (!object[parent]) object[parent] = {};
                object[parent][child] = value;
            } else {
                // Direct property
                object[path] = value;
            }
        });
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

        const changedObjects = Array.from(this.pendingChanges).map(id => this.objects.get(id));

        // Update 3D scene
        this.updateSceneController(changedObjects);

        // Update UI systems
        this.updateUISystems(changedObjects);

        // Emit unified events
        this.emitChangeEvents(changedObjects);

        // Clear pending changes
        this.pendingChanges.clear();
    }

    /**
     * Update SceneController with object changes
     */
    updateSceneController(changedObjects) {
        if (!this.sceneController) return;

        changedObjects.forEach(object => {
            const sceneObject = object._sceneObjectData;
            if (!sceneObject || !sceneObject.mesh) return;

            // Update 3D properties
            if (object.position) {
                sceneObject.mesh.position.set(object.position.x, object.position.y, object.position.z);
                sceneObject.mesh.updateMatrixWorld(true);
            }

            if (object.rotation) {
                sceneObject.mesh.rotation.set(object.rotation.x, object.rotation.y, object.rotation.z);
            }

            // Update container layout if needed
            if (object.isContainer && object.autoLayout?.enabled) {
                this.sceneController.updateLayout(object.id);
            }

            // Update object data properties
            Object.assign(sceneObject, {
                name: object.name,
                dimensions: object.dimensions,
                autoLayout: object.autoLayout
            });
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
    emitChangeEvents(changedObjects) {
        if (!window.objectEventBus) return;

        changedObjects.forEach(object => {
            // Skip objects without valid IDs (e.g., during creation)
            if (!object || !object.id) {
                return;
            }

            // Determine event type based on what changed
            const eventType = this.determineEventType(object);

            window.objectEventBus.emit(
                eventType,
                object.id,
                { changeType: 'unified-update' },
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