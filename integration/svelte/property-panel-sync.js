/**
 * PropertyPanelSync - UI Communication Bridge
 *
 * ARCHITECTURAL ROLE:
 * PropertyPanelSync is the COMMUNICATION LAYER between the main app and Svelte UI panels.
 * It translates ObjectEventBus events into PostMessage format for iframe communication.
 *
 * RELATIONSHIP WITH ObjectStateManager:
 * - ObjectStateManager = Single Source of Truth for object state (DATA layer)
 * - PropertyPanelSync = Communication bridge to UI panels (COMMUNICATION layer)
 * - These are COMPLEMENTARY, not redundant
 *
 * DATA FLOW:
 * 1. ObjectStateManager updates state → fires 'objects-changed' event
 * 2. main-integration.js catches event → sends 'unified-update' (for transform/selection)
 * 3. PropertyPanelSync catches ObjectEventBus events → sends specialized messages:
 *    - GEOMETRY events → 'object-modified-geometry' (dimension changes)
 *    - MATERIAL events → 'object-modified-material' (color/opacity changes)
 *    - SELECTION events → 'selection-change' (selection state)
 *    - HIERARCHY events → hierarchy refresh (parent-child changes)
 *    - TRANSFORM events → NOT HANDLED (ObjectStateManager handles via unified-update)
 *
 * WHY TRANSFORM IS NOT HANDLED:
 * Transform updates (position, rotation, scale) go through ObjectStateManager's
 * 'objects-changed' event which sends complete object data. PropertyPanelSync's
 * transform handler was sending incomplete data causing UI flickering.
 *
 * RESPONSIBILITIES:
 * - PostMessage abstraction for iframe communication
 * - Event-specific serialization and optimization
 * - Multi-panel routing (left, right, toolbars)
 * - Throttling and error handling
 * - JSON serialization for PostMessage compatibility
 */

class PropertyPanelSync {
    constructor(eventBus, panelManager) {
        this.eventBus = eventBus;
        this.panelManager = panelManager;

        // Support both legacy PanelManager and new DirectComponentManager
        // DirectComponentManager is passed as panelManager in new architecture
        this.componentManager = panelManager;

        // Initialize serializer with error handling
        try {
            this.serializer = new ObjectSerializer();
        } catch (error) {
            console.error('PropertyPanelSync: Failed to initialize ObjectSerializer:', error);
            this.serializer = null;
        }

        // Component references
        this.sceneController = null;
        this.selectionController = null;
        this.snapController = null;
        this.navigationController = null;

        // Event subscriptions (for cleanup)
        this.subscriptions = [];

        // Statistics for debugging
        this.stats = {
            eventsProcessed: 0,
            messagesSucceeded: 0,
            messagesFailed: 0,
            transformEvents: 0,
            geometryEvents: 0,
            selectionEvents: 0
        };

        // Throttling for UI responsiveness
        this.uiThrottleMap = new Map(); // eventType+objectId -> timeout
        this.UI_THROTTLE_DELAY = 33; // ~30fps for UI updates (smoother than 60fps for UI)

        // Initialization state tracking
        this.initialized = false;
        this.initializationRetries = 0;
        this.maxInitializationRetries = 3;

        // Initialize subscriptions and components
        this.setupEventSubscriptions();
        this.initializeComponents();
    }

    /**
     * Initialize component references with validation
     */
    initializeComponents() {
        try {
            this.sceneController = window.modlerComponents?.sceneController;
            this.selectionController = window.modlerComponents?.selectionController;
            this.snapController = window.modlerComponents?.snapController;
            this.navigationController = window.modlerComponents?.navigationController;

            // Validate initialization
            this.initialized = this.validateInitialization();

            if (!this.initialized) {
                console.warn(`PropertyPanelSync: Initialization incomplete (attempt ${this.initializationRetries + 1}/${this.maxInitializationRetries})`);
                this.initializationRetries++;

                // Retry initialization after a delay if components aren't ready
                if (this.initializationRetries < this.maxInitializationRetries) {
                    setTimeout(() => this.initializeComponents(), 500);
                }
            } else {
                this.initializationRetries = 0;

                // Send initial hierarchy to left panel after successful initialization
                // Wait longer to ensure iframes are fully loaded and message listeners are ready
                setTimeout(() => {
                    this.refreshCompleteHierarchy();
                }, 1000); // Increased delay to 1 second to ensure iframes are ready
            }
        } catch (error) {
            console.error('PropertyPanelSync: Component initialization failed:', error);
            this.initialized = false;
        }
    }

    /**
     * Validate that all critical components are available
     */
    validateInitialization() {
        const critical = {
            eventBus: this.eventBus,
            componentManager: this.componentManager,
            sceneController: this.sceneController,
            selectionController: this.selectionController
        };

        const missing = Object.entries(critical)
            .filter(([name, component]) => !component)
            .map(([name]) => name);

        if (missing.length > 0) {
            console.warn('PropertyPanelSync: Missing critical components:', missing.join(', '));
            return false;
        }

        // Optional components (warn but don't fail initialization)
        const optional = {
            snapController: this.snapController,
            navigationController: this.navigationController,
            serializer: this.serializer
        };

        const missingOptional = Object.entries(optional)
            .filter(([name, component]) => !component)
            .map(([name]) => name);

        if (missingOptional.length > 0) {
            console.warn('PropertyPanelSync: Missing optional components:', missingOptional.join(', '));
        }

        return true;
    }

    /**
     * Setup subscriptions to ObjectEventBus events
     */
    setupEventSubscriptions() {
        // Subscribe to all relevant event types

        // NOTE: TRANSFORM events are NOT subscribed here.
        // Transform updates (position, rotation, scale) are handled by:
        // ObjectStateManager → 'objects-changed' → main-integration → 'unified-update'
        // This ensures complete object data is sent, preventing flickering issues.

        this.subscriptions.push(
            this.eventBus.subscribe(
                this.eventBus.EVENT_TYPES.GEOMETRY,
                this.handleGeometryEvent.bind(this),
                { subscriberId: 'PropertyPanelSync_Geometry' }
            )
        );

        this.subscriptions.push(
            this.eventBus.subscribe(
                this.eventBus.EVENT_TYPES.MATERIAL,
                this.handleMaterialEvent.bind(this),
                { subscriberId: 'PropertyPanelSync_Material' }
            )
        );

        this.subscriptions.push(
            this.eventBus.subscribe(
                this.eventBus.EVENT_TYPES.SELECTION,
                this.handleSelectionEvent.bind(this),
                { subscriberId: 'PropertyPanelSync_Selection' }
            )
        );

        this.subscriptions.push(
            this.eventBus.subscribe(
                this.eventBus.EVENT_TYPES.HIERARCHY,
                this.handleHierarchyEvent.bind(this),
                { subscriberId: 'PropertyPanelSync_Hierarchy' }
            )
        );

        this.subscriptions.push(
            this.eventBus.subscribe(
                this.eventBus.EVENT_TYPES.LIFECYCLE,
                this.handleLifecycleEvent.bind(this),
                { subscriberId: 'PropertyPanelSync_Lifecycle' }
            )
        );

        // Subscribe to parametric design events
        this.subscriptions.push(
            this.eventBus.subscribe(
                this.eventBus.EVENT_TYPES.PARAMETRIC_UPDATE,
                this.handleParametricEvent.bind(this),
                { subscriberId: 'PropertyPanelSync_Parametric' }
            )
        );

        this.subscriptions.push(
            this.eventBus.subscribe(
                this.eventBus.EVENT_TYPES.CONSTRAINT_CHANGE,
                this.handleConstraintEvent.bind(this),
                { subscriberId: 'PropertyPanelSync_Constraint' }
            )
        );

        // Subscribe to component instancing events
        this.subscriptions.push(
            this.eventBus.subscribe(
                this.eventBus.EVENT_TYPES.INSTANCE_UPDATE,
                this.handleInstanceEvent.bind(this),
                { subscriberId: 'PropertyPanelSync_Instance' }
            )
        );

        this.subscriptions.push(
            this.eventBus.subscribe(
                this.eventBus.EVENT_TYPES.MASTER_CHANGE,
                this.handleMasterChangeEvent.bind(this),
                { subscriberId: 'PropertyPanelSync_MasterChange' }
            )
        );
    }

    /**
     * Handle geometry events (dimension changes, vertex modifications)
     */
    handleGeometryEvent(event) {
        try {
            this.stats.eventsProcessed++;
            this.stats.geometryEvents++;

            // Get the object from scene
            const object = this.getObjectById(event.objectId);
            if (!object) return;

            // Check if object is currently selected
            if (!this.isObjectSelected(object)) return;

            // Serialize with geometry optimization for PostMessage (forces fresh calculation)
            const serializedData = this.serializer.serializeForPostMessage(object, {
                changeType: 'geometry',
                useCache: false
            });
            if (!serializedData) return;

            // Send to UI with geometry-specific update type
            this.sendToUI('object-modified-geometry', [serializedData], {
                throttle: true,
                panels: ['right'] // Property panel for dimension updates
            });

        } catch (error) {
            console.error('PropertyPanelSync.handleGeometryEvent error:', error);
            this.stats.messagesFailed++;
        }
    }

    /**
     * Handle material events (color, opacity changes)
     */
    handleMaterialEvent(event) {
        try {
            this.stats.eventsProcessed++;

            // Get the object from scene
            const object = this.getObjectById(event.objectId);
            if (!object) return;

            // Check if object is currently selected
            if (!this.isObjectSelected(object)) return;

            // Serialize with material optimization for PostMessage
            const serializedData = this.serializer.serializeForPostMessage(object, {
                changeType: 'material',
                includeGeometry: false,
                includeHierarchy: false
            });
            if (!serializedData) return;

            // Send to UI with material-specific update type
            this.sendToUI('object-modified-material', [serializedData], {
                throttle: true,
                panels: ['right']
            });

        } catch (error) {
            console.error('PropertyPanelSync.handleMaterialEvent error:', error);
            this.stats.messagesFailed++;
        }
    }

    /**
     * Handle selection events (selection state changes)
     */
    handleSelectionEvent(event) {
        try {
            this.stats.eventsProcessed++;
            this.stats.selectionEvents++;

            // Check initialization before processing
            if (!this.initialized) {
                console.warn('PropertyPanelSync: Not initialized, skipping selection event');
                return;
            }

            // Check serializer availability
            if (!this.serializer) {
                console.warn('PropertyPanelSync: Serializer not available, skipping selection event');
                return;
            }

            // Selection events need different handling
            const selectedObjects = this.getCurrentSelection();
            const serializedObjects = this.serializer.serializeBatchForPostMessage(selectedObjects);

            // Send to all relevant panels
            this.sendToUI('selection-change', serializedObjects, {
                throttle: false, // Selection changes should be immediate
                panels: ['right', 'left'] // Both property and hierarchy panels
            });

        } catch (error) {
            console.error('PropertyPanelSync.handleSelectionEvent error:', error);
            this.stats.messagesFailed++;
        }
    }

    /**
     * Handle hierarchy events (parent-child relationship changes)
     */
    handleHierarchyEvent(event) {
        try {
            this.stats.eventsProcessed++;

            // Hierarchy events affect the entire object tree
            this.refreshCompleteHierarchy();

        } catch (error) {
            console.error('PropertyPanelSync.handleHierarchyEvent error:', error);
            this.stats.messagesFailed++;
        }
    }

    /**
     * Handle lifecycle events (object create/delete operations)
     */
    handleLifecycleEvent(event) {
        try {
            this.stats.eventsProcessed++;

            // Lifecycle events (create/delete) require full hierarchy refresh
            this.refreshCompleteHierarchy();

        } catch (error) {
            console.error('PropertyPanelSync.handleLifecycleEvent error:', error);
            this.stats.messagesFailed++;
        }
    }

    /**
     * Send data to Svelte UI panels
     * @param {string} updateType - Type of update for Svelte processing
     * @param {Array} serializedObjects - Array of serialized object data
     * @param {Object} options - Sending options
     */
    sendToUI(updateType, serializedObjects, options = {}) {
        const {
            throttle = true,
            panels = ['right'], // Default to property panel
            includeContext = true,
            customData = null
        } = options;

        try {
            // Ensure objects are properly serialized
            let safeSerializedObjects = serializedObjects;
            if (Array.isArray(serializedObjects)) {
                safeSerializedObjects = serializedObjects.map(obj => {
                    // If it's already a plain object, use it as is
                    if (obj && typeof obj === 'object' && !obj.isObject3D && !obj.isMesh) {
                        return obj;
                    }
                    // If it's a Three.js object, serialize it
                    if (obj && (obj.isObject3D || obj.isMesh)) {
                        return this.serializer ? this.serializer.serializeObject(obj) : null;
                    }
                    return obj;
                }).filter(Boolean);
            }

            // Build complete data package with correct field names based on update type
            const data = {
                updateType: updateType,
                timestamp: Date.now()
            };

            // Use correct field name based on update type
            if (updateType === 'hierarchy-changed') {
                data.objectHierarchy = safeSerializedObjects;
            } else {
                data.selectedObjects = safeSerializedObjects;
            }

            // Add container context if requested
            if (includeContext) {
                data.containerContext = this.getContainerContext();
            }

            // Merge customData if provided (for tool state, settings, etc.)
            if (customData) {
                Object.assign(data, customData);
            }

            // Handle throttling for UI performance
            if (throttle) {
                const throttleKey = `${updateType}_${Date.now()}`;
                if (this.uiThrottleMap.has(throttleKey)) {
                    return; // Already throttled
                }

                this.uiThrottleMap.set(throttleKey, setTimeout(() => {
                    this.uiThrottleMap.delete(throttleKey);
                }, this.UI_THROTTLE_DELAY));
            }

            // Send to specified panels
            this.sendToSpecificPanels(data, panels);

        } catch (error) {
            console.error('PropertyPanelSync.sendToUI error:', error);
            this.stats.messagesFailed++;
        }
    }

    /**
     * Send data to specific Svelte panels
     * @private
     */
    sendToSpecificPanels(data, panels) {
        if (!this.panelManager) {
            console.warn('PropertyPanelSync: PanelManager not available');
            return;
        }

        // Support both legacy PanelManager and DirectComponentManager
        let iframes;
        if (typeof this.panelManager.getIframes === 'function') {
            // Legacy PanelManager
            iframes = this.panelManager.getIframes();
        } else if (this.panelManager.componentInstances) {
            // DirectComponentManager - convert to iframe format
            iframes = {
                left: this.panelManager.componentInstances.leftPanel?.iframe,
                right: this.panelManager.componentInstances.propertyPanel?.iframe,
                mainToolbar: this.panelManager.componentInstances.mainToolbar?.iframe
            };
        } else {
            console.warn('PropertyPanelSync: Unable to get iframes from panel manager');
            return;
        }

        for (const panelName of panels) {
            try {
                let iframe = null;
                switch (panelName) {
                    case 'right':
                        iframe = iframes.right;
                        break;
                    case 'left':
                        iframe = iframes.left;
                        break;
                    case 'mainToolbar':
                        iframe = iframes.mainToolbar;
                        break;
                    case 'systemToolbar':
                        iframe = iframes.systemToolbar;
                        break;
                }

                if (iframe && iframe.contentWindow) {
                    // Create a safe data object that can be cloned for postMessage
                    const safeData = JSON.parse(JSON.stringify({
                        type: 'data-update',
                        data: data
                    }));

                    iframe.contentWindow.postMessage(safeData, '*');
                    this.stats.messagesSucceeded++;
                }

            } catch (error) {
                console.error(`PropertyPanelSync: Failed to send to ${panelName}:`, error);
                this.stats.messagesFailed++;
            }
        }
    }

    /**
     * Get object by ID from scene controller
     * @private
     */
    getObjectById(objectId) {
        if (!this.initialized || !this.sceneController) {
            if (!this.initialized) {
                console.warn('PropertyPanelSync: Not fully initialized, cannot get object');
            }
            return null;
        }

        try {
            const objectData = this.sceneController.getObject(objectId);
            return objectData?.mesh || null;
        } catch (error) {
            console.error('PropertyPanelSync.getObjectById error:', error);
            return null;
        }
    }

    /**
     * Check if object is currently selected
     * @private
     */
    isObjectSelected(object) {
        if (!this.initialized || !this.selectionController) {
            if (!this.initialized) {
                console.warn('PropertyPanelSync: Not fully initialized, cannot check selection');
            }
            return false;
        }

        try {
            return this.selectionController.selectedObjects.has(object);
        } catch (error) {
            console.error('PropertyPanelSync.isObjectSelected error:', error);
            return false;
        }
    }

    /**
     * Get current selection as array of objects
     * @private
     */
    getCurrentSelection() {
        if (!this.initialized || !this.selectionController) {
            if (!this.initialized) {
                console.warn('PropertyPanelSync: Not fully initialized, cannot get selection');
            }
            return [];
        }

        try {
            return Array.from(this.selectionController.selectedObjects);
        } catch (error) {
            console.error('PropertyPanelSync.getCurrentSelection error:', error);
            return [];
        }
    }

    /**
     * Get container context for UI
     * @private
     */
    getContainerContext() {
        // Navigation controller is optional - don't fail if not available
        if (!this.navigationController) {
            return null;
        }

        try {
            const containerContext = this.navigationController.getCurrentContainer() || null;

            return containerContext ? {
                id: containerContext.id,
                name: containerContext.name,
                mesh: containerContext.mesh ? 'present' : null
            } : null;
        } catch (error) {
            console.error('PropertyPanelSync.getContainerContext error:', error);
            return null;
        }
    }

    /**
     * Refresh complete hierarchy for left panel
     * @private
     */
    refreshCompleteHierarchy() {
        if (!this.initialized || !this.sceneController) {
            if (!this.initialized) {
                console.warn('PropertyPanelSync: Not fully initialized, cannot refresh hierarchy');
            }
            return;
        }

        try {
            const allObjects = this.sceneController.getAllObjects();

            // Filter out utility objects (same logic as left panel)
            const filteredObjects = allObjects.filter(obj =>
                obj.name !== 'Floor Grid' &&
                obj.type !== 'grid' &&
                !obj.name?.toLowerCase().includes('grid') &&
                obj.name !== '(Interactive)' &&
                !obj.name?.toLowerCase().includes('interactive')
            );

            // Serialize objects safely for PostMessage transmission
            const serializedObjects = [];
            if (this.serializer) {
                for (const objData of filteredObjects) {
                    try {
                        const serialized = this.serializer.serializeForPostMessage(objData.mesh, {
                            includeHierarchy: true,
                            changeType: 'hierarchy'
                        });
                        if (serialized) {
                            serializedObjects.push(serialized);
                        }
                    } catch (error) {
                        console.error('PropertyPanelSync: Failed to serialize object:', objData.name, error);
                    }
                }
            } else {
                console.warn('PropertyPanelSync: Serializer not available, cannot serialize hierarchy');
                return;
            }

            // Send hierarchy update
            this.sendToUI('hierarchy-changed', serializedObjects, {
                throttle: false,
                panels: ['left'],
                includeContext: false
            });

        } catch (error) {
            console.error('PropertyPanelSync.refreshCompleteHierarchy error:', error);
        }
    }

    /**
     * Send tool state update to UI panels
     * @param {string} toolName - Name of active tool
     * @param {Object} additionalData - Additional tool state data
     */
    sendToolStateUpdate(toolName, additionalData = {}) {
        try {
            // Get current snap state
            const snapEnabled = this.snapController ? this.snapController.getEnabled() : false;

            // Create tool state data
            const toolStateData = {
                activeTool: toolName,
                snapEnabled: snapEnabled,
                ...additionalData
            };

            // Send to toolbars
            const iframes = this.panelManager.getIframes();

            if (iframes.mainToolbar && iframes.mainToolbar.contentWindow) {
                iframes.mainToolbar.contentWindow.postMessage({
                    type: 'tool-state-update',
                    data: { toolState: toolStateData }
                }, '*');
                this.stats.messagesSucceeded++;
            }

        } catch (error) {
            console.error('PropertyPanelSync.sendToolStateUpdate error:', error);
            this.stats.messagesFailed++;
        }
    }

    /**
     * Force refresh of property panel with current selection
     */
    refreshPropertyPanel() {
        try {
            const selectedObjects = this.getCurrentSelection();
            if (selectedObjects.length > 0) {
                const serializedObjects = this.serializer.serializeBatchForPostMessage(selectedObjects);
                this.sendToUI('property-refresh', serializedObjects, {
                    throttle: false,
                    panels: ['right']
                });
            }
        } catch (error) {
            console.error('PropertyPanelSync.refreshPropertyPanel error:', error);
        }
    }

    /**
     * Get statistics for debugging
     * @returns {Object} Statistics object
     */
    getStats() {
        return {
            ...this.stats,
            serializerStats: this.serializer.getStats(),
            activeThrottles: this.uiThrottleMap.size,
            subscriptionCount: this.subscriptions.length,
            successRate: this.stats.messagesSucceeded + this.stats.messagesFailed > 0 ?
                (this.stats.messagesSucceeded / (this.stats.messagesSucceeded + this.stats.messagesFailed) * 100).toFixed(1) + '%' : '0%'
        };
    }

    /**
     * Handle parametric property events
     */
    handleParametricEvent(event) {
        try {
            this.stats.eventsProcessed++;

            // Get the object from scene
            const object = this.getObjectById(event.objectId);
            if (!object) return;

            // Serialize with parametric optimization
            const serializedData = this.serializer.serializeForParametricUpdate(object, event.changeData.parameter);
            if (!serializedData) return;

            // Send to UI with parametric-specific update type
            this.sendToUI('parametric-property-update', [serializedData], {
                throttle: true,
                panels: ['right']
            });

        } catch (error) {
            console.error('PropertyPanelSync.handleParametricEvent error:', error);
            this.stats.messagesFailed++;
        }
    }

    /**
     * Handle constraint change events
     */
    handleConstraintEvent(event) {
        try {
            this.stats.eventsProcessed++;

            // Get the object from scene
            const object = this.getObjectById(event.objectId);
            if (!object) return;

            // Check if object is currently selected
            if (!this.isObjectSelected(object)) return;

            // Serialize with constraint information
            const serializedData = this.serializer.serializeObject(object, {
                changeType: 'constraint',
                includeGeometry: false,
                useCache: false
            });
            if (!serializedData) return;

            // Send to UI to update constraint display
            this.sendToUI('constraint-change', [serializedData], {
                throttle: false, // Constraint changes should be immediate
                panels: ['right']
            });

        } catch (error) {
            console.error('PropertyPanelSync.handleConstraintEvent error:', error);
            this.stats.messagesFailed++;
        }
    }

    /**
     * Handle component instance events
     */
    handleInstanceEvent(event) {
        try {
            this.stats.eventsProcessed++;

            // Get the object from scene
            const object = this.getObjectById(event.objectId);
            if (!object) return;

            // Serialize with instance optimization
            const serializedData = this.serializer.serializeForInstanceUpdate(object, event.changeData.action);
            if (!serializedData) return;

            // Send to UI with instance-specific update type
            this.sendToUI('instance-update', [serializedData], {
                throttle: true,
                panels: ['right']
            });

        } catch (error) {
            console.error('PropertyPanelSync.handleInstanceEvent error:', error);
            this.stats.messagesFailed++;
        }
    }

    /**
     * Handle master component change events
     */
    handleMasterChangeEvent(event) {
        try {
            this.stats.eventsProcessed++;

            // Master changes affect multiple objects
            const affectedInstances = event.changeData.affectedInstances || [];

            // Serialize all affected instances
            const serializedObjects = [];
            for (const instanceId of affectedInstances) {
                const object = this.getObjectById(instanceId);
                if (object) {
                    const serialized = this.serializer.serializeForInstanceUpdate(object, 'master_change');
                    if (serialized) {
                        serializedObjects.push(serialized);
                    }
                }
            }

            if (serializedObjects.length > 0) {
                // Send to UI with master change update type
                this.sendToUI('master-component-change', serializedObjects, {
                    throttle: false, // Master changes should be immediate
                    panels: ['right', 'left'] // Both property and hierarchy panels
                });
            }

        } catch (error) {
            console.error('PropertyPanelSync.handleMasterChangeEvent error:', error);
            this.stats.messagesFailed++;
        }
    }

    // ===========================
    // UNIFIED COMMUNICATION METHODS
    // These methods replace direct PostMessage calls from Svelte components
    // ===========================

    /**
     * Send object movement/reordering commands through unified system
     * Replaces direct PostMessage calls from left-panel drag & drop operations
     */
    sendObjectMovement(operation, data) {
        try {
            // Validate operation type
            const validOperations = ['move-to-container', 'move-to-root', 'reorder-container', 'reorder-root'];
            if (!validOperations.includes(operation)) {
                console.error('PropertyPanelSync.sendObjectMovement: Invalid operation:', operation);
                return false;
            }

            // Create unified message format
            const message = {
                type: `object-${operation}`,
                data: data,
                timestamp: Date.now(),
                source: 'PropertyPanelSync'
            };

            // Send to main window (integration layer will handle the operation)
            if (window.parent && window.parent !== window) {
                window.parent.postMessage(message, '*');
                this.stats.messagesSucceeded++;
                return true;
            }

            // Direct mode: send to integration handler
            if (window.handleUnifiedObjectMovement) {
                window.handleUnifiedObjectMovement(operation, data);
                this.stats.messagesSucceeded++;
                return true;
            }

            console.warn('PropertyPanelSync.sendObjectMovement: No handler available');
            return false;

        } catch (error) {
            console.error('PropertyPanelSync.sendObjectMovement error:', error);
            this.stats.messagesFailed++;
            return false;
        }
    }

    /**
     * Send tool activation commands through unified system
     * Replaces direct PostMessage calls from threejs-bridge
     */
    sendToolActivation(toolName, additionalData = {}) {
        try {
            // Create unified message format
            const message = {
                type: 'tool-activation',
                data: {
                    toolName: toolName,
                    ...additionalData
                },
                timestamp: Date.now(),
                source: 'PropertyPanelSync'
            };

            // Send to main window
            if (window.parent && window.parent !== window) {
                window.parent.postMessage(message, '*');
                this.stats.messagesSucceeded++;
                return true;
            }

            // Direct mode: use existing tool activation if available
            if (window.activateTool) {
                window.activateTool(toolName);
                this.stats.messagesSucceeded++;
                return true;
            }

            console.warn('PropertyPanelSync.sendToolActivation: No handler available');
            return false;

        } catch (error) {
            console.error('PropertyPanelSync.sendToolActivation error:', error);
            this.stats.messagesFailed++;
            return false;
        }
    }

    /**
     * Send snap toggle commands through unified system
     * Replaces direct PostMessage calls from threejs-bridge
     */
    sendSnapToggle() {
        try {
            // Create unified message format
            const message = {
                type: 'snap-toggle',
                data: {},
                timestamp: Date.now(),
                source: 'PropertyPanelSync'
            };

            // Send to main window
            if (window.parent && window.parent !== window) {
                window.parent.postMessage(message, '*');
                this.stats.messagesSucceeded++;
                return true;
            }

            // Direct mode: use existing snap toggle if available
            if (window.toggleSnapping) {
                window.toggleSnapping();
                this.stats.messagesSucceeded++;
                return true;
            }

            console.warn('PropertyPanelSync.sendSnapToggle: No handler available');
            return false;

        } catch (error) {
            console.error('PropertyPanelSync.sendSnapToggle error:', error);
            this.stats.messagesFailed++;
            return false;
        }
    }

    /**
     * Send visual settings updates through unified system
     * Replaces direct PostMessage calls from left-panel and system-toolbar
     */
    sendVisualSettings(settingsType, settings) {
        try {
            // Validate settings type
            const validTypes = ['selection', 'containers', 'cad-wireframe', 'visual', 'scene', 'interface'];
            if (!validTypes.includes(settingsType)) {
                console.error('PropertyPanelSync.sendVisualSettings: Invalid settings type:', settingsType);
                return false;
            }

            // Create unified message format
            const message = {
                type: `${settingsType}-settings-changed`,
                settings: settings,
                timestamp: Date.now(),
                source: 'PropertyPanelSync'
            };

            // Send to main window
            if (window.parent && window.parent !== window) {
                window.parent.postMessage(message, '*');
                this.stats.messagesSucceeded++;
                return true;
            }

            // Direct mode: trigger local event
            const eventName = `${settingsType}-settings-changed`;
            const event = new CustomEvent(eventName, {
                detail: { settings }
            });
            window.dispatchEvent(event);
            this.stats.messagesSucceeded++;
            return true;

        } catch (error) {
            console.error('PropertyPanelSync.sendVisualSettings error:', error);
            this.stats.messagesFailed++;
            return false;
        }
    }

    /**
     * Send navigation/selection commands through unified system
     * Replaces direct PostMessage calls from left-panel object selection
     */
    sendNavigationCommand(commandType, data) {
        try {
            // Validate command type
            const validCommands = ['object-select', 'get-visual-settings', 'get-cad-wireframe-settings', 'property-update'];
            if (!validCommands.includes(commandType)) {
                console.error('PropertyPanelSync.sendNavigationCommand: Invalid command type:', commandType);
                return false;
            }

            // Create unified message format
            const message = {
                type: commandType,
                data: data,
                timestamp: Date.now(),
                source: 'PropertyPanelSync'
            };

            // Send to main window
            if (window.parent && window.parent !== window) {
                window.parent.postMessage(message, '*');
                this.stats.messagesSucceeded++;
                return true;
            }

            // Direct mode: handle specific commands
            if (commandType === 'object-select' && data.objectId) {
                // Use NavigationController if available
                const navigationController = window.modlerComponents?.navigationController;
                if (navigationController && data.useNavigationController) {
                    if (data.parentContainer) {
                        navigationController.navigateToObject(data.objectId);
                    } else {
                        navigationController.selectObject(data.objectId);
                    }
                    this.stats.messagesSucceeded++;
                    return true;
                }

                // Fallback to direct selection
                if (window.selectObjectInSceneDirectly) {
                    window.selectObjectInSceneDirectly(data.objectId);
                    this.stats.messagesSucceeded++;
                    return true;
                }
            }

            console.warn('PropertyPanelSync.sendNavigationCommand: No handler available for command:', commandType);
            return false;

        } catch (error) {
            console.error('PropertyPanelSync.sendNavigationCommand error:', error);
            this.stats.messagesFailed++;
            return false;
        }
    }

    /**
     * Send settings request commands through unified system
     * For requesting current settings from main application
     */
    sendSettingsRequest(requestType) {
        try {
            // Validate request type
            const validRequests = ['get-visual-settings', 'get-cad-wireframe-settings'];
            if (!validRequests.includes(requestType)) {
                console.error('PropertyPanelSync.sendSettingsRequest: Invalid request type:', requestType);
                return false;
            }

            // Create unified message format
            const message = {
                type: requestType,
                timestamp: Date.now(),
                source: 'PropertyPanelSync'
            };

            // Send to main window
            if (window.parent && window.parent !== window) {
                window.parent.postMessage(message, '*');
                this.stats.messagesSucceeded++;
                return true;
            }

            console.warn('PropertyPanelSync.sendSettingsRequest: No parent window available');
            return false;

        } catch (error) {
            console.error('PropertyPanelSync.sendSettingsRequest error:', error);
            this.stats.messagesFailed++;
            return false;
        }
    }

    /**
     * Dispose of the sync system and clean up resources
     */
    dispose() {
        // Unsubscribe from all events
        this.subscriptions.forEach(unsubscribe => unsubscribe());
        this.subscriptions.length = 0;

        // Clear throttle timeouts
        for (const timeoutId of this.uiThrottleMap.values()) {
            clearTimeout(timeoutId);
        }
        this.uiThrottleMap.clear();

        // Dispose serializer
        if (this.serializer) {
            this.serializer.dispose();
        }

        // Clear references
        this.eventBus = null;
        this.componentManager = null;
        this.serializer = null;
    }
}

// Export for use in main application
window.PropertyPanelSync = PropertyPanelSync;