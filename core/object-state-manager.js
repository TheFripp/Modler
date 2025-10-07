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

        // System references for propagation
        this.sceneController = null;
        this.uiSystems = new Set(); // UI systems that need updates
        this.objectDataFormat = null; // Central format standardization

        // Change tracking for efficient updates
        this.pendingChanges = new Map(); // objectId -> source
        this.updateScheduled = false;

        // Performance optimization: Layout propagation tracking
        this.depthCache = new Map(); // containerId -> depth (cleared on hierarchy change)
        this.nextFramePropagations = new Set(); // Deferred propagations for next frame
    }

    // ====== COMPONENT GETTERS (reduce repeated lookups) ======

    getSelectionController() {
        return window.modlerComponents?.selectionController;
    }

    getContainerCrudManager() {
        return window.modlerComponents?.containerCrudManager;
    }

    getVisualEffects() {
        return window.modlerComponents?.visualEffects;
    }

    /**
     * Apply geometry updates (dimension/position/rotation) to SceneController
     * Handles the repeated pattern of: apply updates → sync back → trigger layout
     */
    applyGeometryUpdate(object, updateType, sceneMethodName, triggerLayout = false) {
        const pendingKey = `_pending${updateType}Updates`;
        const propertyKey = updateType.toLowerCase();
        const sceneMethod = this.sceneController[sceneMethodName];

        if (!object[pendingKey] || !sceneMethod) return;

        // Apply updates to SceneController
        const updates = object[pendingKey];
        Object.entries(updates).forEach(([axis, value]) => {
            sceneMethod.call(this.sceneController, object.id, axis, value);
        });
        delete object[pendingKey];

        // Sync back from SceneController (single source of truth)
        const sceneObject = this.sceneController.getObject(object.id);
        if (sceneObject?.[propertyKey]) {
            object[propertyKey] = { ...sceneObject[propertyKey] };
        }

        // Trigger parent layout update if needed (BOTTOM-UP PROPAGATION)
        if (triggerLayout) {
            this.scheduleParentLayoutUpdate(object.id);
        }
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
        this.setupSelectionControllerIntegration();

        // Listen for hierarchy changes from SceneController
        this.setupHierarchyChangeListener();

        // Make ObjectStateManager globally available immediately
        if (window.modlerComponents) {
            window.modlerComponents.objectStateManager = this;
        } else {
            console.warn('ObjectStateManager: window.modlerComponents not available');
        }
    }

    /**
     * REMOVED: Hierarchy change listener
     *
     * This was causing race conditions with PropertyPanelSync.
     * PropertyPanelSync now listens directly to SceneController HIERARCHY events
     * and reads fresh data from SceneController.getAllObjects().
     *
     * ObjectStateManager no longer maintains a duplicate hierarchy state.
     */
    setupHierarchyChangeListener() {
        // Listener removed - PropertyPanelSync handles hierarchy updates directly from SceneController
    }

    /**
     * Set up bidirectional integration with SelectionController
     */
    setupSelectionControllerIntegration() {
        const selectionController = this.getSelectionController();
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
    }

    /**
     * Extract Vector3 data from Three.js objects
     * @private
     */
    extractVector3(vector3, defaultValue = { x: 0, y: 0, z: 0 }) {
        return vector3 ? { x: vector3.x, y: vector3.y, z: vector3.z } : defaultValue;
    }

    /**
     * Extract rotation data from Three.js Euler and convert to degrees for UI
     * @private
     */
    extractRotation(rotation) {
        if (!rotation) return { x: 0, y: 0, z: 0 };
        // Convert from radians (Three.js) to degrees (UI display)
        return {
            x: (rotation.x * 180) / Math.PI,
            y: (rotation.y * 180) / Math.PI,
            z: (rotation.z * 180) / Math.PI
        };
    }

    /**
     * Build standard object structure from objectData
     * @private
     */
    buildObjectStructure(objectData, includeExtendedProps = true) {
        // Get fresh dimensions from geometry (single source of truth)
        let dimensions = objectData.dimensions || { x: 1, y: 1, z: 1 };
        if (objectData.mesh?.geometry && window.GeometryUtils?.getGeometryDimensions) {
            const geometryDimensions = window.GeometryUtils.getGeometryDimensions(objectData.mesh.geometry);
            if (geometryDimensions) {
                dimensions = {
                    x: geometryDimensions.x,
                    y: geometryDimensions.y,
                    z: geometryDimensions.z
                };
            }
        }

        const structure = {
            // Core identity
            id: objectData.id,
            name: objectData.name,
            type: objectData.type,

            // 3D properties
            position: this.extractVector3(objectData.mesh?.position),
            rotation: this.extractRotation(objectData.mesh?.rotation), // Convert radians to degrees
            dimensions: dimensions, // Fresh from geometry

            // Container properties
            isContainer: objectData.isContainer || false,
            parentContainer: objectData.parentContainer || null,
            autoLayout: objectData.autoLayout || { enabled: false, direction: 'x' },

            // Material properties
            material: objectData.material || { color: '#888888', opacity: 1, transparent: false }
        };

        // Add extended properties for legacy format
        if (includeExtendedProps) {
            structure.scale = { x: 1, y: 1, z: 1 };
            structure.childIds = [];
            structure.layoutMode = null;
            structure.selected = false;
            structure.locked = false;
            structure.visible = true;
            structure.formatVersion = '1.0.0';
            structure.lastModified = Date.now();
        }

        return structure;
    }

    /**
     * Create legacy format for fallback compatibility
     * @private
     */
    createLegacyFormat(objectData) {
        return this.buildObjectStructure(objectData, true);
    }

    /**
     * Import a single object from SceneController
     */
    importObjectFromScene(objectData) {
        if (!objectData) {
            console.warn('ObjectStateManager: No objectData provided for import');
            return;
        }

        // Build standard structure and add mesh reference
        const importedObject = this.buildObjectStructure(objectData, false);
        importedObject.mesh = objectData.mesh;

        this.objects.set(objectData.id, importedObject);

        // Emit HIERARCHY event to notify PropertyPanelSync and other listeners
        if (window.objectEventBus) {
            window.objectEventBus.emit(
                window.objectEventBus.EVENT_TYPES.HIERARCHY,
                objectData.id,
                { type: 'child-added', childId: String(objectData.id) },
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

        // Apply updates to local state and track which properties changed
        const changedProperties = this.applyUpdates(object, updates);

        // Store changed properties for use in propagateChanges
        object._changedProperties = changedProperties;

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
        // Track which top-level properties were changed
        const changedProperties = new Set();

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
                } else if (path === 'autoLayout') {
                    // Expand autoLayout nested object (enabled, direction, gap, padding)
                    Object.entries(value).forEach(([key, val]) => {
                        if (key === 'padding' && typeof val === 'object' && val !== null) {
                            // Handle nested padding object
                            Object.entries(val).forEach(([side, sideVal]) => {
                                expandedUpdates[`${path}.${key}.${side}`] = sideVal;
                            });
                        } else {
                            expandedUpdates[`${path}.${key}`] = val;
                        }
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
            // Track top-level property that changed
            const topLevelProp = path.split('.')[0];
            changedProperties.add(topLevelProp);

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
                // Other nested properties (e.g., "autoLayout.gap", "autoLayout.padding.top")
                const parts = path.split('.');
                let current = object;

                // Navigate/create nested structure
                for (let i = 0; i < parts.length - 1; i++) {
                    if (!current[parts[i]]) {
                        current[parts[i]] = {};
                    }
                    current = current[parts[i]];
                }

                // Set the final value
                current[parts[parts.length - 1]] = value;
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

        return changedProperties;
    }

    /**
     * Batch updates and propagate to all systems
     *
     * For UI-initiated updates, propagate synchronously for immediate feedback.
     * For tool/animation updates, could batch via requestAnimationFrame if needed.
     */
    scheduleUpdate() {
        if (this.updateScheduled) return;

        this.updateScheduled = true;

        // Propagate synchronously for immediate UI feedback
        // This eliminates the 1-frame delay that was causing flickering
        this.propagateChanges();
        this.updateScheduled = false;
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

        // Update 3D scene (with source information to skip geometry updates for 'drag')
        this.updateSceneController(changedItems);

        // Update UI systems
        this.updateUISystems(changedObjects);

        // Emit unified events with source information
        this.emitChangeEvents(changedItems);

        // Refresh selection UI if any changed objects are currently selected
        this.refreshSelectionUI(changedItems);

        // Clear pending changes
        this.pendingChanges.clear();
    }

    /**
     * Refresh selection UI for currently selected objects
     * This ensures PropertyPanel shows real-time updates during operations like push tool
     */
    refreshSelectionUI(changedItems) {
        const selectionController = this.getSelectionController();
        if (!selectionController) return;

        // Check if any changed object is currently selected
        const hasSelectedChange = changedItems.some(({ object }) =>
            this.selection.has(object.id)
        );

        if (!hasSelectedChange) return;

        // Get current selection with fresh data FROM SCENECONTROLLER (after updateSceneController has run)
        const selectedMeshes = selectionController.getSelectedObjects?.() || [];
        if (selectedMeshes.length === 0) return;

        // Build object structure from SceneController (single source of truth for geometry)
        const serializedSelection = selectedMeshes.map(mesh => {
            const objectData = this.sceneController?.getObjectByMesh?.(mesh);
            if (!objectData) return null;

            // Use buildObjectStructure to get fresh dimensions from SceneController
            return this.buildObjectStructure(objectData);
        }).filter(Boolean);

        if (serializedSelection.length === 0) return;

        // Try callback first (for iframe/indirect mode)
        if (selectionController.selectionChangeCallback) {
            selectionController.selectionChangeCallback(serializedSelection);
        }

        // Direct store update (for direct mode)
        // Access Svelte store function directly
        const syncFunction = window.syncSelectionFromThreeJS;
        if (syncFunction && typeof syncFunction === 'function') {
            syncFunction(serializedSelection);
        }
    }

    /**
     * Update SceneController with object changes
     */
    updateSceneController(changedItems) {
        if (!this.sceneController) {
            return;
        }

        changedItems.forEach(({ object, source }) => {
            // PROXY PATTERN: Apply ALL geometry updates directly to SceneController
            // SceneController is the single source of truth for all 3D properties

            // Handle parent container changes (drag-and-drop in object tree)
            if (object._changedProperties?.has('parentContainer')) {
                this.sceneController.setParentContainer(object.id, object.parentContainer, true);
            }

            // Apply dimension updates (triggers parent layout on change, UNLESS source is push-tool)
            // Push tool suppresses layout updates during drag for performance and to prevent container movement
            const shouldTriggerLayout = source !== 'push-tool';
            this.applyGeometryUpdate(object, 'Dimension', 'updateObjectDimensions', shouldTriggerLayout);

            // Apply position updates
            this.applyGeometryUpdate(object, 'Position', 'updateObjectPosition', false);

            // Apply rotation updates
            this.applyGeometryUpdate(object, 'Rotation', 'updateObjectRotation', false);

            // Sync non-geometry properties to SceneController first (needed for layout)
            const sceneObject = this.sceneController.getObject(object.id);
            if (sceneObject) {
                sceneObject.name = object.name;
                if (object.autoLayout) {
                    sceneObject.autoLayout = object.autoLayout;

                    // CRITICAL: If user manually sets gap, clear calculatedGap to use fixed gap
                    if (object._changedProperties?.has('autoLayout.gap')) {
                        sceneObject.calculatedGap = undefined;
                        object.calculatedGap = undefined;
                    }
                }
            }

            // Update container layout if needed (TOP-DOWN PROPAGATION)
            const autoLayoutChanged = object._changedProperties?.has('autoLayout');
            // Check if any autoLayout sub-property changed (gap, padding, direction, etc.)
            const autoLayoutPropertyChanged = Array.from(object._changedProperties || []).some(prop =>
                prop.startsWith('autoLayout.')
            );
            const isLayoutMode = object.autoLayout?.enabled;

            if (object.isContainer && sceneObject) {
                if (isLayoutMode) {
                    // LAYOUT MODE: Container size is ground truth

                    // SPECIAL CASE: Skip layout update if source is 'push-tool'
                    // Push directly manipulates geometry, positions should not change
                    const skipLayoutUpdate = source === 'push-tool';

                    if (!skipLayoutUpdate && (autoLayoutChanged || autoLayoutPropertyChanged)) {
                        const layoutResult = this.sceneController.updateLayout(object.id);

                        // When first switching TO layout mode, resize container once
                        // to establish initial size based on children. After that, no auto-resize.
                        if (autoLayoutChanged && layoutResult?.success && layoutResult.layoutBounds) {
                            const containerCrudManager = this.getContainerCrudManager();
                            if (containerCrudManager) {
                                containerCrudManager.resizeContainerToLayoutBounds(sceneObject, layoutResult.layoutBounds);

                                // CRITICAL: Recalculate layout after resize to get correct gap for new size
                                // This ensures space-between gap is calculated with the final container size
                                this.sceneController.updateLayout(object.id);
                            }
                        }
                    }
                    // Push operations: Skip layout update entirely - geometry already updated

                } else if (autoLayoutChanged || autoLayoutPropertyChanged) {
                    // HUG MODE (or switching FROM layout mode to hug)
                    // Clear calculatedGap when layout is disabled
                    if (autoLayoutChanged && sceneObject.calculatedGap !== undefined) {
                        sceneObject.calculatedGap = undefined;
                        object.calculatedGap = undefined;
                    }

                    // Update layout and resize container to fit children
                    const layoutResult = this.sceneController.updateLayout(object.id);

                    if (layoutResult && layoutResult.success && layoutResult.layoutBounds) {
                        const containerCrudManager = this.getContainerCrudManager();
                        if (containerCrudManager) {
                            containerCrudManager.resizeContainerToLayoutBounds(sceneObject, layoutResult.layoutBounds);
                        }
                    }
                }

                // Show padding visualization if padding is set
                const visualEffects = this.getVisualEffects();
                if (visualEffects && object.autoLayout.padding) {
                    visualEffects.showPaddingVisualization(sceneObject.mesh, object.autoLayout.padding);
                } else if (visualEffects) {
                    visualEffects.hidePaddingVisualization(sceneObject.mesh);
                }

                // BOTTOM-UP PROPAGATION: Container size changed → schedule grandparent layout update
                this.scheduleParentLayoutUpdate(object.id);
            }
        });
    }

    /**
     * Update UI systems (Svelte stores, property panel)
     */
    updateUISystems(changedObjects) {
        // Emit update events for UI systems
        // Note: main-integration will get hierarchy from SceneController and serialize it
        this.dispatchEvent(new CustomEvent('objects-changed', {
            detail: {
                objects: changedObjects,
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

            // Build appropriate changeData based on event type
            let changeData;
            if (eventType === window.objectEventBus.EVENT_TYPES.HIERARCHY) {
                // Hierarchy events need 'type' field, not 'changeType'
                changeData = {
                    type: 'layout-property-changed',
                    source: source
                };
            } else {
                // Other events can use generic changeType
                changeData = {
                    changeType: 'unified-update',
                    source: source
                };
            }

            window.objectEventBus.emit(
                eventType,
                object.id,
                changeData,
                { source: 'ObjectStateManager', throttle: false }
            );
        });
    }

    /**
     * Determine appropriate event type for ObjectEventBus based on what actually changed
     */
    determineEventType(object) {
        // Check what properties actually changed, not just what exists on the object
        const changedProps = object._changedProperties || new Set();

        // Check for autoLayout changes (including sub-properties like autoLayout.gap)
        const hasAutoLayoutChange = changedProps.has('autoLayout') ||
            Array.from(changedProps).some(prop => prop.startsWith('autoLayout.'));

        if (hasAutoLayoutChange) {
            return window.objectEventBus.EVENT_TYPES.HIERARCHY;
        }
        if (changedProps.has('position') || changedProps.has('rotation')) {
            return window.objectEventBus.EVENT_TYPES.TRANSFORM;
        }
        if (changedProps.has('dimensions')) {
            return window.objectEventBus.EVENT_TYPES.GEOMETRY;
        }
        if (changedProps.has('material')) {
            return window.objectEventBus.EVENT_TYPES.MATERIAL;
        }

        // Fallback: Check object structure (backward compatibility)
        if (object.position || object.rotation) {
            return window.objectEventBus.EVENT_TYPES.TRANSFORM;
        }
        if (object.dimensions) {
            return window.objectEventBus.EVENT_TYPES.GEOMETRY;
        }
        return window.objectEventBus.EVENT_TYPES.MATERIAL;
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
     * Safe serialization wrapper for PostMessage
     * @private
     */
    safeSerializeForPostMessage(data, errorContext = '') {
        if (!this.objectDataFormat) return data;

        try {
            if (Array.isArray(data)) {
                return data.map(item => this.objectDataFormat.serializeForPostMessage(item)).filter(Boolean);
            }
            return this.objectDataFormat.serializeForPostMessage(data);
        } catch (error) {
            console.error(`ObjectStateManager: Failed to serialize ${errorContext}:`, error);
            return data;
        }
    }

    /**
     * Get object in PostMessage-ready format
     * @param {string} objectId - Object ID
     * @returns {Object|null} PostMessage-safe object data
     */
    getObjectForPostMessage(objectId) {
        const object = this.objects.get(objectId);
        return this.safeSerializeForPostMessage(object, `object ${objectId}`);
    }

    /**
     * Get all objects in PostMessage-ready format
     * @returns {Array<Object>} Array of PostMessage-safe objects
     */
    getAllObjectsForPostMessage() {
        return this.safeSerializeForPostMessage(Array.from(this.objects.values()), 'objects');
    }


    /**
     * BIDIRECTIONAL HIERARCHICAL PROPAGATION
     * Schedules layout updates for parent containers when child changes
     */
    scheduleParentLayoutUpdate(childObjectId) {
        const childObject = this.sceneController?.getObject(childObjectId);
        if (!childObject || !childObject.parentContainer) return;

        const parentContainer = this.sceneController.getObject(childObject.parentContainer);
        if (!parentContainer?.autoLayout?.enabled) return;

        // Initialize scheduled updates set
        if (!this.scheduledLayoutUpdates) {
            this.scheduledLayoutUpdates = new Set();
        }

        // Add parent to scheduled updates
        this.scheduledLayoutUpdates.add(childObject.parentContainer);

        // Process in next frame (after current propagation completes)
        if (!this.layoutUpdateScheduled) {
            this.layoutUpdateScheduled = true;
            requestAnimationFrame(() => {
                this.processScheduledLayouts();
                this.layoutUpdateScheduled = false;
            });
        }
    }

    /**
     * Process all scheduled layout updates (bottom-up order)
     * Deepest containers are updated first to ensure proper propagation
     *
     * PERFORMANCE OPTIMIZATIONS:
     * - Caches container depths to avoid O(n×d) recalculation during sort
     * - Defers grandparent propagations to next frame to avoid re-processing
     */
    processScheduledLayouts() {
        if (!this.scheduledLayoutUpdates || this.scheduledLayoutUpdates.size === 0) return;

        // OPTIMIZATION: Build depth cache for this batch
        const containersToProcess = Array.from(this.scheduledLayoutUpdates);
        const depthMap = new Map();

        containersToProcess.forEach(containerId => {
            depthMap.set(containerId, this.getContainerDepthCached(containerId));
        });

        // Sort by container depth (deepest first) using cached depths
        const sorted = containersToProcess.sort((a, b) => {
            return depthMap.get(b) - depthMap.get(a); // Descending order (deepest first)
        });

        // OPTIMIZATION: Collect propagations for next frame instead of re-adding to current batch
        const deferredPropagations = new Set();

        // Update each container's layout
        sorted.forEach(containerId => {
            const container = this.sceneController.getObject(containerId);
            if (container?.autoLayout?.enabled) {
                // Trigger layout recalculation
                const layoutResult = this.sceneController.updateLayout(containerId);

                // CRITICAL ARCHITECTURE: Only auto-resize in HUG mode
                // In LAYOUT mode, container size is ground truth - no auto-resize
                if (layoutResult?.success && layoutResult.layoutBounds) {
                    const isLayoutMode = container.autoLayout?.enabled;

                    if (!isLayoutMode) {
                        // HUG MODE: Container wraps children
                        const containerCrudManager = this.getContainerCrudManager();
                        if (containerCrudManager) {
                            containerCrudManager.resizeContainerToLayoutBounds(container, layoutResult.layoutBounds);
                        }
                    }
                    // LAYOUT MODE: No auto-resize
                }

                // OPTIMIZATION: Defer grandparent propagations to next frame
                if (container.parentContainer) {
                    const grandparent = this.sceneController.getObject(container.parentContainer);
                    if (grandparent?.autoLayout?.enabled) {
                        deferredPropagations.add(container.parentContainer);
                    }
                }
            }
        });

        this.scheduledLayoutUpdates.clear();

        // Schedule deferred propagations for next frame
        if (deferredPropagations.size > 0) {
            this.nextFramePropagations = new Set([...this.nextFramePropagations, ...deferredPropagations]);

            if (!this.deferredPropagationScheduled) {
                this.deferredPropagationScheduled = true;
                requestAnimationFrame(() => {
                    // Move deferred propagations to scheduled updates
                    this.nextFramePropagations.forEach(id => {
                        this.scheduledLayoutUpdates.add(id);
                    });
                    this.nextFramePropagations.clear();
                    this.deferredPropagationScheduled = false;

                    // Process the propagations
                    this.processScheduledLayouts();
                });
            }
        }
    }

    /**
     * Get container nesting depth with caching (0 for root-level containers)
     * PERFORMANCE: Caches depths to avoid O(d) recalculation for each container during sort
     */
    getContainerDepthCached(containerId) {
        // Check cache first
        if (this.depthCache.has(containerId)) {
            return this.depthCache.get(containerId);
        }

        // Calculate and cache
        const depth = this.calculateContainerDepth(containerId);
        this.depthCache.set(containerId, depth);
        return depth;
    }

    /**
     * Get container nesting depth (0 for root-level containers)
     * Use getContainerDepthCached() for better performance in batch operations
     */
    getContainerDepth(containerId) {
        return this.calculateContainerDepth(containerId);
    }

    /**
     * Calculate container depth by walking up parent chain
     * @private
     */
    calculateContainerDepth(containerId) {
        let depth = 0;
        let current = this.sceneController?.getObject(containerId);

        while (current?.parentContainer) {
            depth++;
            current = this.sceneController.getObject(current.parentContainer);
            if (depth > 50) {
                console.error('ObjectStateManager: Detected circular parent chain for container', containerId);
                break;
            }
        }

        return depth;
    }

    /**
     * Clear depth cache when hierarchy changes
     * Called automatically on hierarchy modifications
     */
    clearDepthCache() {
        this.depthCache.clear();
    }
}

// Export singleton instance
window.ObjectStateManager = ObjectStateManager;