import * as THREE from 'three';
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

class ObjectStateManager {
    constructor() {

        // SINGLE SOURCE OF TRUTH: All object state lives here
        this.objects = new Map(); // objectId -> complete object state
        this.selection = new Set(); // Set of selected object IDs

        // System references for propagation
        this.sceneController = null;
        this.objectDataFormat = null; // Central format standardization

        // Change tracking for efficient updates
        this.pendingChanges = new Map(); // objectId -> source
        this.updateScheduled = false;

        // Layout propagation manager (Phase 4 refactoring)
        this.layoutPropagationManager = null; // Lazy-initialized
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

    getLayoutPropagationManager() {
        if (!this.layoutPropagationManager) {
            this.layoutPropagationManager = window.modlerComponents?.layoutPropagationManager;
        }
        return this.layoutPropagationManager;
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
        // CRITICAL: Read directly from THREE.js mesh for position/rotation (tools mutate mesh directly)
        const sceneObject = this.sceneController.getObject(object.id);
        if (sceneObject?.mesh) {
            if (propertyKey === 'position' && sceneObject.mesh.position) {
                // Read fresh position from mesh (push tool and move tool modify directly)
                object.position = {
                    x: sceneObject.mesh.position.x,
                    y: sceneObject.mesh.position.y,
                    z: sceneObject.mesh.position.z
                };
            } else if (propertyKey === 'rotation' && sceneObject.mesh.rotation) {
                // Read fresh rotation from mesh and convert to degrees
                object.rotation = {
                    x: (sceneObject.mesh.rotation.x * 180) / Math.PI,
                    y: (sceneObject.mesh.rotation.y * 180) / Math.PI,
                    z: (sceneObject.mesh.rotation.z * 180) / Math.PI
                };
            } else if (propertyKey === 'dimension') {
                // ARCHITECTURE: Read dimensions from geometry via DimensionManager
                const dimensions = window.dimensionManager?.getDimensions(sceneObject.mesh);
                if (dimensions) {
                    object.dimensions = { ...dimensions };
                }
            }
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

        // Listen for lifecycle events to auto-register new objects
        this.setupLifecycleListener();

        // Make ObjectStateManager globally available immediately
        if (window.modlerComponents) {
            window.modlerComponents.objectStateManager = this;
        } else {
            console.warn('ObjectStateManager: window.modlerComponents not available');
        }
    }

    /**
     * Set up lifecycle listener to auto-register new objects
     *
     * Listens to object:lifecycle events from SceneController and automatically
     * registers new objects in ObjectStateManager's internal map.
     */
    setupLifecycleListener() {
        if (!window.objectEventBus) return;

        window.objectEventBus.subscribe(window.objectEventBus.EVENT_TYPES.LIFECYCLE, (event) => {
            const operation = event.changeData?.operation;
            const objectId = event.objectId;

            if (operation === 'created' && objectId) {
                // Auto-register newly created objects
                const objectData = this.sceneController?.getObject?.(objectId);
                if (objectData && !this.objects.has(objectId)) {
                    // Use ObjectDataFormat for standardization if available
                    const standardized = this.objectDataFormat
                        ? this.objectDataFormat.standardizeObjectData(objectData)
                        : objectData;

                    this.objects.set(objectId, standardized);
                }
            } else if (operation === 'deleted' && objectId) {
                // Remove deleted objects
                this.objects.delete(objectId);
                this.selection.delete(objectId);
            }
        });
    }

    /**
     * Set up initial selection sync with SelectionController
     */
    setupSelectionControllerIntegration() {
        const selectionController = this.getSelectionController();
        if (!selectionController) return;

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
        // ARCHITECTURE: Get fresh dimensions from geometry via DimensionManager (single source of truth)
        const dimensions = window.dimensionManager?.getDimensions(objectData.mesh) || { x: 1, y: 1, z: 1 };

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
            autoLayout: objectData.autoLayout || window.ObjectDataFormat.createDefaultAutoLayout(),

            // Material properties
            material: objectData.material || { color: '#888888', opacity: 1, transparent: false }
        };

        // Add extended properties for legacy format
        if (includeExtendedProps) {
            structure.scale = { x: 1, y: 1, z: 1 };
            structure.childIds = [];
            structure.containerMode = null;
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
     * UNIFIED UPDATE API: Single entry point for ALL state changes
     *
     * This is the ONLY method you should use to change object state from outside the scene layer.
     * Routes updates to SceneController, emits events via ObjectEventBus, and triggers layout propagation.
     *
     * @param {number} objectId - ID of the object to update
     * @param {Object} updates - Object containing properties to update
     * @param {Object} [updates.dimensions] - {x, y, z} dimensions
     * @param {Object} [updates.position] - {x, y, z} position
     * @param {Object} [updates.rotation] - {x, y, z} rotation (radians)
     * @param {Object} [updates.material] - Material properties (color, opacity, etc.)
     * @param {string} [updates.name] - Object name
     * @param {boolean} [updates.visible] - Visibility state
     * @param {boolean} [updates.locked] - Lock state
     * @param {number} [updates.parentContainer] - Parent container ID
     * @param {string} [source='input'] - Source of the update for event filtering (e.g., 'push-tool', 'dimension-input')
     *
     * @example
     * // Change dimensions (triggers layout propagation if in container)
     * objectStateManager.updateObject(objectId, {
     *     dimensions: { x: 100, y: 50, z: 30 }
     * }, 'dimension-input');
     *
     * @example
     * // Move object during tool preview (filtered from UI sync)
     * objectStateManager.updateObject(objectId, {
     *     position: { x: newX, y: newY, z: newZ }
     * }, 'push-tool');
     *
     * @flow
     * 1. Validate object exists (auto-create if needed)
     * 2. Apply updates to local state
     * 3. Propagate to SceneController (geometry updates)
     * 4. Emit ObjectEventBus events (UI synchronization)
     * 5. Schedule layout propagation (if in container)
     * 6. Queue deferred propagation for batching
     *
     * @architectural-note
     * Never bypass this method to manipulate meshes directly. All state changes
     * must flow through ObjectStateManager to maintain consistency and enable
     * undo/redo, UI sync, and layout propagation.
     */
    updateObject(objectId, updates, sourceOrOptions = 'input') {
        // Support both old signature (source string) and new signature (options object)
        let source = 'input';
        let options = {};

        if (typeof sourceOrOptions === 'string') {
            source = sourceOrOptions;
        } else if (typeof sourceOrOptions === 'object') {
            options = sourceOrOptions;
            source = options.source || 'input';
        }

        // Validate that source is a string (defensive programming)
        if (typeof source !== 'string') {
            console.warn('⚠️ ObjectStateManager.updateObject: source must be a string, got:', typeof source, source);
            source = 'input';
        }

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

        // Store changed properties for use in propagateChanges (merge to avoid overwrite race)
        if (object._changedProperties) {
            changedProperties.forEach(prop => object._changedProperties.add(prop));
        } else {
            object._changedProperties = changedProperties;
        }

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

        // Track this object for propagation with source and options
        this.pendingChanges.set(objectId, { source, options });
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
                } else if (path === 'layoutProperties') {
                    // Expand layoutProperties nested object (sizeX, sizeY, sizeZ, fixedSize)
                    Object.entries(value).forEach(([key, val]) => {
                        expandedUpdates[`${path}.${key}`] = val;
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
                // Direct property — enforce container mode flag sync
                if (path === 'containerMode' || path === 'isHug' || path === 'sizingMode') {
                    const mode = path === 'containerMode' ? value :
                                 path === 'isHug' && value ? 'hug' :
                                 path === 'sizingMode' ? value :
                                 object.containerMode;
                    const modeUpdate = ObjectStateManager.buildContainerModeUpdate(mode);
                    Object.assign(object, modeUpdate);
                    changedProperties.add('containerMode');
                    changedProperties.add('isHug');
                    changedProperties.add('sizingMode');
                } else {
                    object[path] = value;
                }
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

        // Build array of {object, source, options} tuples
        const changedItems = Array.from(this.pendingChanges.entries()).map(([id, data]) => {
            // Support both old format (string source) and new format ({source, options})
            const source = typeof data === 'string' ? data : data.source;
            const options = typeof data === 'object' ? data.options : {};

            return {
                object: this.objects.get(id),
                source,
                options
            };
        });

        // Update 3D scene (with source and options information)
        this.updateSceneController(changedItems);

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

        changedItems.forEach(({ object, source, options }) => {
            // PROXY PATTERN: Apply ALL geometry updates directly to SceneController
            // SceneController is the single source of truth for all 3D properties

            // Handle parent container changes (drag-and-drop in object tree)
            if (object._changedProperties?.has('parentContainer')) {
                this.sceneController.setParentContainer(object.id, object.parentContainer, true);
            }

            // Check if layout propagation should be skipped (optimization for material/transform changes)
            const skipLayoutPropagation = options?.skipLayoutPropagation || false;

            // Apply dimension updates (triggers parent layout on change, UNLESS source is push-tool or skipLayoutPropagation is true)
            // Push tool suppresses layout updates during drag for performance and to prevent container movement
            const shouldTriggerLayout = source !== 'push-tool' && !skipLayoutPropagation;
            this.applyGeometryUpdate(object, 'Dimension', 'updateObjectDimensions', shouldTriggerLayout);

            // Apply position updates
            this.applyGeometryUpdate(object, 'Position', 'updateObjectPosition', false);

            // Apply rotation updates
            this.applyGeometryUpdate(object, 'Rotation', 'updateObjectRotation', false);

            // Sync non-geometry properties to SceneController first (needed for layout)
            const sceneObject = this.sceneController.getObject(object.id);
            if (sceneObject) {
                sceneObject.name = object.name;

                // childrenOrder is owned by SceneController — CommandRouter writes it directly
                // No sync needed here

                // Sync container mode so SceneLayoutManager gate checks match OSM
                if (object.isContainer && object.containerMode) {
                    sceneObject.containerMode = object.containerMode;
                }

                // SCHEMA-FIRST: Always sync autoLayout for containers, use schema defaults if needed
                if (object.isContainer) {
                    sceneObject.autoLayout = object.autoLayout ||
                        window.ObjectDataFormat.createDefaultAutoLayout();

                    // CRITICAL: If user manually sets gap, clear calculatedGap to use fixed gap
                    if (object._changedProperties?.has('autoLayout')) {
                        sceneObject.calculatedGap = undefined;
                        object.calculatedGap = undefined;
                    }
                }

                // LAYOUT PROPERTIES: Sync layoutProperties for all objects (layout engine reads from SceneController)
                if (object.layoutProperties) {
                    sceneObject.layoutProperties = object.layoutProperties;
                }
            }

            // Update container layout if needed (TOP-DOWN PROPAGATION)
            // UNIFIED: SceneLayoutManager.updateContainer() handles all mode routing
            const autoLayoutChanged = object._changedProperties?.has('autoLayout');
            const autoLayoutPropertyChanged = Array.from(object._changedProperties || []).some(prop =>
                prop.startsWith('autoLayout.')
            );
            const dimensionChanged = object._changedProperties?.has('dimensions');

            if (object.isContainer && sceneObject) {
                const skipLayoutUpdate = source === 'push-tool';

                // Trigger container update for any layout-relevant change
                const needsUpdate = autoLayoutChanged || autoLayoutPropertyChanged || dimensionChanged;
                if (!skipLayoutUpdate && needsUpdate) {
                    // Clear calculatedGap when user explicitly sets gap (data-model concern)
                    if (autoLayoutChanged) {
                        sceneObject.calculatedGap = undefined;
                        object.calculatedGap = undefined;
                    }

                    // SINGLE CALL: updateContainer handles layout/hug/manual routing internally
                    this.sceneController.updateContainer(object.id);
                }

                // Show padding visualization if padding is set
                const visualEffects = this.getVisualEffects();
                if (visualEffects && object.autoLayout?.padding) {
                    visualEffects.showPaddingVisualization(sceneObject.mesh, object.autoLayout.padding);
                } else if (visualEffects) {
                    visualEffects.hidePaddingVisualization(sceneObject.mesh);
                }

                // BOTTOM-UP PROPAGATION: Container size changed → schedule grandparent layout update
                this.scheduleParentLayoutUpdate(object.id);
            }

            // CHILD LAYOUT PROPERTIES CHANGED: Trigger parent container layout update
            const layoutPropertiesChanged = object._changedProperties?.has('layoutProperties') ||
                Array.from(object._changedProperties || []).some(prop => prop.startsWith('layoutProperties.'));

            if (layoutPropertiesChanged && object.parentContainer && !object.isContainer) {
                // Child sizing changed → parent needs to recalculate layout
                this.sceneController.updateContainer(object.parentContainer);
            }
        });
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

        // Check for layoutProperties changes (including sub-properties like layoutProperties.sizeX)
        const hasLayoutPropertiesChange = changedProps.has('layoutProperties') ||
            Array.from(changedProps).some(prop => prop.startsWith('layoutProperties.'));

        if (hasAutoLayoutChange || hasLayoutPropertiesChange) {
            return window.objectEventBus.EVENT_TYPES.HIERARCHY;
        }
        // Name changes should trigger hierarchy update (for ObjectTree display)
        if (changedProps.has('name')) {
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
     *
     * Called by SelectionController when selection changes.
     * Updates internal selection state only - does NOT emit events.
     * SelectionController.notifySelectionChange() handles ObjectEventBus emission.
     */
    setSelection(objectIds) {
        this.selection.clear();
        objectIds.forEach(id => this.selection.add(id));

        // NOTE: Do NOT emit to ObjectEventBus here - SelectionController already emits
        // This method is called BY SelectionController.notifySelectionChange() which handles emission
        // Emitting here would create duplicate events and cause selection loops
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

    // ====== STATE MACHINE: CENTRALIZED MODE CHECKING ======
    // Single source of truth for object mode/state queries
    // All code should use these methods instead of direct property checks

    /**
     * Get container sizing mode
     *
     * @param {string|number} objectId - Object ID
     * @returns {'layout'|'hug'|'manual'|null} Container mode, or null if not a container
     *
     * @example
     * const mode = objectStateManager.getContainerMode(containerId);
     * if (mode === 'layout') {
     *   // Container has fixed size with auto-layout
     * } else if (mode === 'hug') {
     *   // Container auto-resizes to fit children
     * }
     */
    getContainerMode(objectId) {
        const obj = this.getObject(objectId);
        if (!obj?.isContainer) return null;

        // PRIMARY: Use containerMode if set (new canonical property)
        if (obj.containerMode === 'layout' || obj.containerMode === 'hug' || obj.containerMode === 'manual') {
            return obj.containerMode;
        }

        // LEGACY FALLBACK: Derive from old flags (for data created before containerMode existed)
        if (obj.autoLayout?.enabled) return 'layout';
        if (obj.layoutMode !== null && obj.layoutMode !== undefined) return 'layout';
        if (obj.isHug === true) return 'hug';

        return 'manual';
    }

    /**
     * Check if container is in layout mode
     *
     * @param {string|number} objectId - Object ID
     * @returns {boolean} True if container has layout enabled
     */
    isLayoutMode(objectId) {
        return this.getContainerMode(objectId) === 'layout';
    }

    /**
     * Check if container is in hug mode
     *
     * @param {string|number} objectId - Object ID
     * @returns {boolean} True if container is in hug mode
     */
    isHugMode(objectId) {
        return this.getContainerMode(objectId) === 'hug';
    }

    /**
     * Build the update object for changing container mode.
     * Sets containerMode and keeps legacy flags (isHug, sizingMode) in sync.
     *
     * @param {'layout'|'hug'|'manual'} mode - Target mode
     * @returns {Object} Update object to spread into updateObject() calls
     */
    static buildContainerModeUpdate(mode) {
        return {
            containerMode: mode,
            isHug: mode === 'hug',
            sizingMode: mode
        };
    }

    /**
     * Get child object's size mode for a specific axis
     *
     * @param {string|number} objectId - Object ID
     * @param {string} axis - Axis ('x', 'y', or 'z')
     * @returns {'fill'|'fixed'} Size mode for the axis
     *
     * @example
     * const sizeMode = objectStateManager.getChildSizeMode(childId, 'x');
     * if (sizeMode === 'fill') {
     *   // Child fills container on X axis
     * }
     */
    getChildSizeMode(objectId, axis) {
        const obj = this.getObject(objectId);
        if (!obj) return 'fixed';

        const property = `size${axis.toUpperCase()}`;
        return obj.layoutProperties?.[property] || 'fixed';
    }

    /**
     * Check if child object has fill enabled on any axis
     *
     * @param {string|number} objectId - Object ID
     * @param {string} [axis] - Optional specific axis to check ('x', 'y', 'z')
     * @returns {boolean} True if fill is enabled (on specified axis or any axis)
     */
    hasFillEnabled(objectId, axis = null) {
        const obj = this.getObject(objectId);
        if (!obj?.layoutProperties) return false;

        if (axis) {
            return this.getChildSizeMode(objectId, axis) === 'fill';
        }

        // Check any axis
        return obj.layoutProperties.sizeX === 'fill' ||
               obj.layoutProperties.sizeY === 'fill' ||
               obj.layoutProperties.sizeZ === 'fill';
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
     * Get object in PostMessage-ready format with fresh geometry data
     * @param {string} objectId - Object ID
     * @returns {Object|null} PostMessage-safe object data with fresh dimensions from geometry
     */
    getObjectForPostMessage(objectId) {
        // Get fresh object data from SceneController (single source of truth for geometry)
        const sceneObject = this.sceneController?.getObject(objectId);
        if (!sceneObject) {
            console.warn(`ObjectStateManager.getObjectForPostMessage: Object ${objectId} not found in SceneController`);
            return null;
        }

        // Build fresh structure with current geometry dimensions
        const freshObject = this.buildObjectStructure(sceneObject, true);

        return this.safeSerializeForPostMessage(freshObject, `object ${objectId}`);
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
     * DELEGATED to LayoutPropagationManager (Phase 4 refactoring)
     */
    scheduleParentLayoutUpdate(childObjectId) {
        const manager = this.getLayoutPropagationManager();
        if (manager) {
            manager.scheduleParentLayoutUpdate(childObjectId);
        }
    }

    /**
     * Get container nesting depth (0 for root-level containers)
     * DELEGATED to LayoutPropagationManager (Phase 4 refactoring)
     */
    getContainerDepth(containerId) {
        const manager = this.getLayoutPropagationManager();
        return manager ? manager.getContainerDepth(containerId) : 0;
    }

    /**
     * Clear depth cache when hierarchy changes
     * DELEGATED to LayoutPropagationManager (Phase 4 refactoring)
     */
    clearDepthCache() {
        const manager = this.getLayoutPropagationManager();
        if (manager) {
            manager.clearDepthCache();
        }
    }
}

// Export singleton instance
window.ObjectStateManager = ObjectStateManager;