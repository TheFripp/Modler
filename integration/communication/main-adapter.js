/**
 * Main Adapter - Integrates Communication Bridge with Main Window
 *
 * Responsibilities:
 * - Subscribe to ObjectEventBus events
 * - Translate events to messages
 * - Send messages to UI via CommunicationBridge
 * - Handle requests from UI
 * - Integrate with ObjectStateManager, SceneController, etc.
 *
 * Replaces: PropertyPanelSync event handling
 *
 * Version: 1.0.0
 * Part of: Phase 3 - Communication Layer Consolidation
 */

class MainAdapter {
    constructor() {
        this.bridge = null;
        this.initialized = false;

        // Component references (lazy-loaded)
        this.objectStateManager = null;
        this.sceneController = null;
        this.selectionController = null;
        this.toolController = null;

        // Event subscriptions
        this.subscriptions = [];

        // Statistics
        this.stats = {
            eventsReceived: 0,
            messagesSent: 0,
            requestsHandled: 0
        };
    }

    /**
     * Set bridge reference
     */
    setBridge(bridge) {
        this.bridge = bridge;
    }

    /**
     * Initialize and subscribe to events
     */
    initialize() {
        if (this.initialized) {
            console.warn('MainAdapter already initialized');
            return;
        }

        // Get component references
        this.objectStateManager = window.modlerComponents?.objectStateManager;
        this.sceneController = window.modlerComponents?.sceneController;
        this.selectionController = window.modlerComponents?.selectionController;
        this.toolController = window.modlerComponents?.toolController;

        if (!this.objectStateManager || !this.sceneController) {
            console.error('❌ MainAdapter: Required components not available');
            return false;
        }

        // Subscribe to ObjectEventBus
        this.subscribeToEvents();

        this.initialized = true;
        console.log('✅ MainAdapter initialized');
        return true;
    }

    /**
     * Subscribe to ObjectEventBus events
     * @private
     */
    subscribeToEvents() {
        const eventBus = window.objectEventBus;
        if (!eventBus) {
            console.error('❌ ObjectEventBus not available');
            return;
        }

        const { EVENT_TYPES } = eventBus;

        // Geometry changes (dimensions, vertices)
        this.subscriptions.push(
            eventBus.subscribe(EVENT_TYPES.GEOMETRY, (event) => {
                this.handleGeometryEvent(event);
            }, { subscriberId: 'main-adapter-geometry' })
        );

        // Transform changes (position, rotation, scale)
        this.subscriptions.push(
            eventBus.subscribe(EVENT_TYPES.TRANSFORM, (event) => {
                this.handleTransformEvent(event);
            }, { subscriberId: 'main-adapter-transform' })
        );

        // Material changes (color, opacity)
        this.subscriptions.push(
            eventBus.subscribe(EVENT_TYPES.MATERIAL, (event) => {
                this.handleMaterialEvent(event);
            }, { subscriberId: 'main-adapter-material' })
        );

        // Hierarchy changes (parent/child, container layout)
        this.subscriptions.push(
            eventBus.subscribe(EVENT_TYPES.HIERARCHY, (event) => {
                this.handleHierarchyEvent(event);
            }, { subscriberId: 'main-adapter-hierarchy' })
        );

        // Selection changes (from SelectionController)
        this.subscriptions.push(
            eventBus.subscribe(EVENT_TYPES.SELECTION, (event) => {
                this.handleSelectionEvent(event);
            }, { subscriberId: 'main-adapter-selection' })
        );

        console.log(`📡 MainAdapter subscribed to ${this.subscriptions.length} event types`);
    }

    /**
     * Handle geometry events
     * @private
     */
    handleGeometryEvent(event) {
        this.stats.eventsReceived++;

        const { objectId, changeData } = event;

        // Get fresh object data from SceneController
        const objectData = this.sceneController.getObject(objectId);
        if (!objectData) {
            return; // Object might have been deleted
        }

        // Build message with updated state
        const message = window.MessageProtocol.MessageBuilders.stateChanged(
            objectId,
            {
                changeType: 'geometry',
                dimensions: changeData.dimensions || this.getDimensions(objectData),
                ...changeData
            },
            'geometry'
        );

        this.send(message);
    }

    /**
     * Handle transform events
     * @private
     */
    handleTransformEvent(event) {
        this.stats.eventsReceived++;

        const { objectId, changeData } = event;

        // Transform events use throttled emission for smooth dragging
        const message = window.MessageProtocol.MessageBuilders.stateChanged(
            objectId,
            {
                changeType: 'transform',
                position: changeData.position,
                rotation: changeData.rotation,
                ...changeData
            },
            'transform'
        );

        // Override strategy for real-time dragging
        message.strategy = window.MessageProtocol.EMISSION_STRATEGY.THROTTLED;

        this.send(message);
    }

    /**
     * Handle material events
     * @private
     */
    handleMaterialEvent(event) {
        this.stats.eventsReceived++;

        const { objectId, changeData } = event;

        const message = window.MessageProtocol.MessageBuilders.stateChanged(
            objectId,
            {
                changeType: 'material',
                ...changeData
            },
            'material'
        );

        this.send(message);
    }

    /**
     * Handle hierarchy events
     * @private
     */
    handleHierarchyEvent(event) {
        this.stats.eventsReceived++;

        const { objectId, changeData } = event;

        // Hierarchy changes often affect multiple objects - use batched
        const message = window.MessageProtocol.MessageBuilders.hierarchyUpdated(
            changeData.objects || [],
            changeData.rootObjects || []
        );

        // Override to batched for efficiency
        message.strategy = window.MessageProtocol.EMISSION_STRATEGY.BATCHED;

        this.send(message);
    }

    /**
     * Handle selection events
     * @private
     */
    handleSelectionEvent(event) {
        this.stats.eventsReceived++;

        const { changeData } = event;
        const selectedObjectIds = changeData.selectedObjectIds || [];

        // Get full object data for selected objects
        const objectData = selectedObjectIds.length > 0
            ? this.getObjectDataForUI(selectedObjectIds[0])
            : null;

        const message = window.MessageProtocol.MessageBuilders.selectionChanged(
            selectedObjectIds,
            objectData
        );

        this.send(message);
    }

    /**
     * Get object data formatted for UI
     * @private
     */
    getObjectDataForUI(objectId) {
        const objectData = this.sceneController.getObject(objectId);
        if (!objectData) return null;

        // Use existing ObjectDataFormat for serialization
        if (window.ObjectDataFormat) {
            return window.ObjectDataFormat.serializeForPostMessage(objectData);
        }

        // Fallback: basic serialization
        return {
            id: objectData.id,
            name: objectData.name,
            type: objectData.type,
            isContainer: objectData.isContainer,
            position: objectData.mesh?.position ? {
                x: objectData.mesh.position.x,
                y: objectData.mesh.position.y,
                z: objectData.mesh.position.z
            } : null,
            dimensions: this.getDimensions(objectData)
        };
    }

    /**
     * Get dimensions from object data
     * @private
     */
    getDimensions(objectData) {
        if (!objectData.mesh) return null;

        const dimensionManager = window.modlerComponents?.dimensionManager;
        if (dimensionManager) {
            return dimensionManager.getDimensions(objectData.mesh);
        }

        return null;
    }

    /**
     * Send message through bridge
     */
    send(message) {
        if (!this.bridge) {
            console.error('❌ MainAdapter: Bridge not set');
            return false;
        }

        const sent = this.bridge.sendToUI(message);
        if (sent) {
            this.stats.messagesSent++;
        }
        return sent;
    }

    /**
     * Receive message from bridge (UI → Main)
     */
    receive(message) {
        // Route based on message type
        switch (message.type) {
            case window.MessageProtocol.MESSAGE_TYPES.PROPERTY_UPDATE:
                this.handlePropertyUpdateMessage(message);
                break;

            case window.MessageProtocol.MESSAGE_TYPES.TOOL_ACTIVATE:
                this.handleToolActivateMessage(message);
                break;

            case window.MessageProtocol.MESSAGE_TYPES.TOOL_DEACTIVATE:
                this.handleToolDeactivateMessage(message);
                break;

            case window.MessageProtocol.MESSAGE_TYPES.OBJECT_CREATE:
                this.handleObjectCreateMessage(message);
                break;

            case window.MessageProtocol.MESSAGE_TYPES.OBJECT_DELETE:
                this.handleObjectDeleteMessage(message);
                break;

            case window.MessageProtocol.MESSAGE_TYPES.HIERARCHY_CHANGE:
                this.handleHierarchyChangeMessage(message);
                break;

            default:
                console.warn('MainAdapter: Unknown message type:', message.type);
        }
    }

    /**
     * Handle property update messages
     * @private
     */
    handlePropertyUpdateMessage(message) {
        const { objectId, property, value } = message.payload;

        if (!objectId || !property || value === undefined) {
            console.error('❌ Invalid property update message:', message);
            return;
        }

        // Route to ObjectStateManager
        this.objectStateManager.updateObject(objectId, {
            [property]: value
        }, message.source);
    }

    /**
     * Handle tool activation messages
     * @private
     */
    handleToolActivateMessage(message) {
        const { toolName, options } = message.payload;

        if (this.toolController) {
            this.toolController.activateTool(toolName, options);
        }
    }

    /**
     * Handle tool deactivation messages
     * @private
     */
    handleToolDeactivateMessage(message) {
        if (this.toolController) {
            this.toolController.deactivateCurrentTool();
        }
    }

    /**
     * Handle object creation messages
     * @private
     */
    handleObjectCreateMessage(message) {
        // TODO: Implement object creation routing
        console.log('TODO: Handle object create:', message);
    }

    /**
     * Handle object deletion messages
     * @private
     */
    handleObjectDeleteMessage(message) {
        // TODO: Implement object deletion routing
        console.log('TODO: Handle object delete:', message);
    }

    /**
     * Handle hierarchy change messages
     * @private
     */
    handleHierarchyChangeMessage(message) {
        // TODO: Implement hierarchy change routing
        console.log('TODO: Handle hierarchy change:', message);
    }

    /**
     * Handle request from UI
     */
    async handleRequest(message) {
        this.stats.requestsHandled++;

        const { requestType, data } = message.payload;

        // Route based on request type
        switch (requestType) {
            case 'get-object-data':
                return this.getObjectDataForUI(data.objectId);

            case 'get-hierarchy':
                return this.getHierarchyData();

            default:
                throw new Error(`Unknown request type: ${requestType}`);
        }
    }

    /**
     * Get complete hierarchy data
     * @private
     */
    getHierarchyData() {
        const allObjects = this.sceneController.getAllObjects();
        const rootObjects = this.sceneController.getRootObjects();

        return {
            objects: allObjects.map(obj => this.getObjectDataForUI(obj.id)),
            rootObjects: rootObjects.map(obj => obj.id)
        };
    }

    /**
     * Get statistics
     */
    getStats() {
        return { ...this.stats };
    }

    /**
     * Dispose and cleanup
     */
    dispose() {
        // Unsubscribe from all events
        this.subscriptions.forEach(unsubscribe => unsubscribe());
        this.subscriptions = [];

        this.initialized = false;
        console.log('🗑️ MainAdapter disposed');
    }
}

// Export for global use
if (typeof window !== 'undefined') {
    window.MainAdapter = MainAdapter;
}

// Export for Node/module environments
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MainAdapter;
}
