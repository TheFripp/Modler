/**
 * PropertyPanelSync - Unified UI Communication Bridge
 *
 * Bridges the ObjectEventBus with Svelte UI panels through PostMessage communication.
 * Replaces multiple scattered PostMessage calls with a centralized, reliable system.
 *
 * Features:
 * - Subscribes to ObjectEventBus events
 * - Uses ObjectSerializer for consistent data preparation
 * - Handles PostMessage delivery to all Svelte panels
 * - Event type routing and optimization
 * - Error handling and recovery
 * - Maintains compatibility with existing Svelte bridge
 */

class PropertyPanelSync {
    constructor(eventBus, panelManager) {
        this.eventBus = eventBus;
        this.panelManager = panelManager;

        // Initialize serializer
        this.serializer = new ObjectSerializer();

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

        // Initialize subscriptions
        this.setupEventSubscriptions();
        this.initializeComponents();
    }

    /**
     * Initialize component references
     */
    initializeComponents() {
        this.sceneController = window.modlerComponents?.sceneController;
        this.selectionController = window.modlerComponents?.selectionController;
        this.snapController = window.modlerComponents?.snapController;
        this.navigationController = window.modlerComponents?.navigationController;
    }

    /**
     * Setup subscriptions to ObjectEventBus events
     */
    setupEventSubscriptions() {
        // Subscribe to all relevant event types
        this.subscriptions.push(
            this.eventBus.subscribe(
                this.eventBus.EVENT_TYPES.TRANSFORM,
                this.handleTransformEvent.bind(this),
                { subscriberId: 'PropertyPanelSync_Transform' }
            )
        );

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
     * Handle transform events (position, rotation, scale changes)
     */
    handleTransformEvent(event) {
        try {
            this.stats.eventsProcessed++;
            this.stats.transformEvents++;

            // Get the object from scene
            const object = this.getObjectById(event.objectId);
            if (!object) return;

            // Check if object is currently selected
            if (!this.isObjectSelected(object)) return;

            // Serialize with transform optimization
            const serializedData = this.serializer.serializeForChangeType(object, 'transform');
            if (!serializedData) return;

            // Send to UI with transform-specific update type
            this.sendToUI('object-modified-transform', [serializedData], {
                throttle: true,
                panels: ['right'] // Property panel only for real-time updates
            });

        } catch (error) {
            console.error('PropertyPanelSync.handleTransformEvent error:', error);
            this.stats.messagesFailed++;
        }
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

            // Serialize with geometry optimization (forces fresh calculation)
            const serializedData = this.serializer.serializeForChangeType(object, 'geometry');
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

            // Serialize with material optimization
            const serializedData = this.serializer.serializeForChangeType(object, 'material');
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

            // Selection events need different handling
            const selectedObjects = this.getCurrentSelection();
            const serializedObjects = this.serializer.serializeBatch(selectedObjects);

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
     * Send data to Svelte UI panels
     * @param {string} updateType - Type of update for Svelte processing
     * @param {Array} serializedObjects - Array of serialized object data
     * @param {Object} options - Sending options
     */
    sendToUI(updateType, serializedObjects, options = {}) {
        const {
            throttle = true,
            panels = ['right'], // Default to property panel
            includeContext = true
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

        const iframes = this.panelManager.getIframes();

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
        if (!this.sceneController) {
            this.initializeComponents();
            if (!this.sceneController) return null;
        }

        const objectData = this.sceneController.getObject(objectId);
        return objectData?.mesh || null;
    }

    /**
     * Check if object is currently selected
     * @private
     */
    isObjectSelected(object) {
        if (!this.selectionController) {
            this.initializeComponents();
            if (!this.selectionController) return false;
        }

        return this.selectionController.selectedObjects.has(object);
    }

    /**
     * Get current selection as array of objects
     * @private
     */
    getCurrentSelection() {
        if (!this.selectionController) {
            this.initializeComponents();
            if (!this.selectionController) return [];
        }

        return Array.from(this.selectionController.selectedObjects);
    }

    /**
     * Get container context for UI
     * @private
     */
    getContainerContext() {
        if (!this.navigationController) {
            this.initializeComponents();
        }

        const containerContext = this.navigationController?.getCurrentContainer() || null;

        return containerContext ? {
            id: containerContext.id,
            name: containerContext.name,
            mesh: containerContext.mesh ? 'present' : null
        } : null;
    }

    /**
     * Refresh complete hierarchy for left panel
     * @private
     */
    refreshCompleteHierarchy() {
        if (!this.sceneController) {
            this.initializeComponents();
            if (!this.sceneController) return;
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

            const serializedObjects = filteredObjects.map(objData =>
                this.serializer.serializeObject(objData.mesh)
            ).filter(Boolean);

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
                const serializedObjects = this.serializer.serializeBatch(selectedObjects);
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
        this.panelManager = null;
        this.serializer = null;
    }
}

// Export for use in main application
window.PropertyPanelSync = PropertyPanelSync;