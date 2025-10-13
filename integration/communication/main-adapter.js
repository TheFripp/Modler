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

        // Send initial state after panels are ready
        this.waitForPanelsAndSendInitialState();

        return true;
    }

    /**
     * Wait for UI panels to be ready, then send initial state
     * @private
     */
    waitForPanelsAndSendInitialState() {
        // Wait a short delay for iframes to fully load
        setTimeout(() => {
            this.sendInitialState();
        }, 500);
    }

    /**
     * Send initial state to UI panels
     * @private
     */
    sendInitialState() {
        try {
            // Send current hierarchy
            const hierarchyData = this.getHierarchyData();

            const hierarchyMessage = window.MessageProtocol.MessageBuilders.hierarchyUpdated(
                hierarchyData.objects,
                hierarchyData.rootObjects
            );
            this.send(hierarchyMessage);

            // Send current selection
            const selectedObjects = this.selectionController?.getSelectedObjects() || [];
            if (selectedObjects.length > 0) {
                const selectedObjectIds = selectedObjects.map(obj => obj.id);
                const objectData = this.getObjectDataForUI(selectedObjectIds[0]);
                const selectionMessage = window.MessageProtocol.MessageBuilders.selectionChanged(
                    selectedObjectIds,
                    objectData
                );
                this.send(selectionMessage);
            }

            console.log('📤 Initial state sent to UI panels');
        } catch (error) {
            console.error('❌ Failed to send initial state:', error);
        }
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

        // Lifecycle changes (object creation, deletion)
        this.subscriptions.push(
            eventBus.subscribe(EVENT_TYPES.LIFECYCLE, (event) => {
                this.handleLifecycleEvent(event);
            }, { subscriberId: 'main-adapter-lifecycle' })
        );

        // Parametric design updates
        this.subscriptions.push(
            eventBus.subscribe(EVENT_TYPES.PARAMETRIC_UPDATE, (event) => {
                this.handleParametricEvent(event);
            }, { subscriberId: 'main-adapter-parametric' })
        );

        // Tool state changes (tool activation, snap toggle)
        this.subscriptions.push(
            eventBus.subscribe(EVENT_TYPES.TOOL_STATE, (event) => {
                this.handleToolStateEvent(event);
            }, { subscriberId: 'main-adapter-tool-state' })
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

        // Skip UI sync for preview objects (box creation tool, etc.)
        if (objectData.mesh?.userData?.hideFromSelection) {
            return; // Preview object - don't send to UI
        }

        // Skip UI sync for preview/drag operations (push tool during drag, etc.)
        // These are intermediate states - final state will be sent when operation completes
        const source = changeData?.source;
        if (source === 'push-tool' || source === 'move-tool-drag') {
            return; // Preview operation - don't send to UI during drag
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

        // Skip UI sync for preview/drag operations
        const source = changeData?.source;
        if (source === 'push-tool' || source === 'move-tool-drag' || source === 'layout-preview') {
            return; // Preview operation - don't send to UI during drag
        }

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

        // Skip UI sync for preview/drag operations (layout updates during push)
        const source = changeData?.source;
        if (source === 'push-tool' || source === 'layout-preview' || source === 'layout-drag-update') {
            return; // Preview operation - don't send to UI during drag
        }

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

        // Use throttled strategy for rapid selection changes (shift-select, etc.)
        message.strategy = window.MessageProtocol.EMISSION_STRATEGY.THROTTLED;

        this.send(message);
    }

    /**
     * Handle lifecycle events (object creation, deletion)
     * @private
     */
    handleLifecycleEvent(event) {
        this.stats.eventsReceived++;

        const { objectId, changeData } = event;
        const eventType = changeData?.eventType; // 'created' or 'deleted'

        if (eventType === 'created') {
            // Object creation - notify UI to add to hierarchy
            const objectData = this.sceneController.getObject(objectId);
            if (!objectData) return;

            const message = window.MessageProtocol.MessageBuilders.objectCreated(
                objectId,
                this.getObjectDataForUI(objectId)
            );
            this.send(message);

        } else if (eventType === 'deleted') {
            // Object deletion - notify UI to remove from hierarchy
            const message = window.MessageProtocol.MessageBuilders.objectDeleted(objectId);
            this.send(message);
        }
    }

    /**
     * Handle parametric design events
     * @private
     */
    handleParametricEvent(event) {
        this.stats.eventsReceived++;

        const { objectId, changeData } = event;

        // Forward parametric updates to UI
        const message = window.MessageProtocol.MessageBuilders.stateChanged(
            objectId,
            {
                changeType: 'parametric',
                ...changeData
            },
            'parametric'
        );

        this.send(message);
    }

    /**
     * Handle tool state events (tool activation, snap toggle)
     * @private
     */
    handleToolStateEvent(event) {
        this.stats.eventsReceived++;

        const { changeData } = event;
        const { activeTool, snapEnabled } = changeData;

        // Build tool state message
        const message = window.MessageProtocol.MessageBuilders.toolStateChanged(
            activeTool,
            snapEnabled
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
     * Handle object creation messages (from UI)
     * @private
     */
    handleObjectCreateMessage(message) {
        // UI-initiated object creation (e.g., "Add Box" button)
        // In practice, tools like BoxCreationTool handle creation
        // This is here for completeness but might not be actively used
        console.log('[MainAdapter] Object create request from UI:', message);

        // If UI sends explicit create requests, route to appropriate tool
        const { objectType, options } = message.data || {};
        if (objectType && this.sceneController) {
            // Could trigger tool activation or direct creation
            console.log(`[MainAdapter] Create ${objectType} requested`);
        }
    }

    /**
     * Handle object deletion messages (from UI)
     * @private
     */
    handleObjectDeleteMessage(message) {
        // UI-initiated object deletion (e.g., Delete key, context menu)
        const objectId = message.data?.objectId;
        if (objectId && this.sceneController) {
            console.log(`[MainAdapter] Delete object ${objectId} requested`);
            this.sceneController.removeObject(objectId);
        }
    }

    /**
     * Handle hierarchy change messages (from UI)
     * @private
     */
    handleHierarchyChangeMessage(message) {
        // UI-initiated hierarchy change (e.g., drag-drop in ObjectTree)
        const { objectId, newParentId } = message.data || {};
        if (objectId && this.sceneController) {
            console.log(`[MainAdapter] Move object ${objectId} to parent ${newParentId}`);
            this.sceneController.setParentContainer(objectId, newParentId);
        }
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

        return {
            objects: allObjects.map(obj => this.getObjectDataForUI(obj.id)),
            rootObjects: [] // UI handles tree structure via parentContainer field
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
