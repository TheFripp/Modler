/**
 * Simple PostMessage Communication
 *
 * SIMPLIFIED: Direct data extraction + inline computed properties
 * - Main → UI: ObjectEventBus events with COMPLETE data
 * - UI → Main: Commands routed to CommandRouter
 *
 * Data Flow: SceneController → DataExtractor → Compute Props → postMessage
 * NO intermediate serialization layers, NO transformation passes
 *
 * Part of: Communication Architecture Simplification
 * Version: 2.0.0
 * Date: 2025-10-16
 */

class SimpleCommunication {
    constructor() {
        this.initialized = false;

        // Component references
        this.sceneController = null;
        this.dataExtractor = null;

        // Statistics for debugging
        this.stats = {
            messagesSent: 0,
            messagesReceived: 0,
            errors: 0
        };

        // Batching: accumulate object-changed messages within a microtask
        this.pendingObjectChanges = new Map(); // objectId -> { objectId, eventType, object }
        this.batchScheduled = false;
    }

    /**
     * Initialize component references
     */
    initializeComponents() {
        if (!this.sceneController) {
            this.sceneController = window.modlerComponents?.sceneController;
            this.dataExtractor = window.DataExtractor;
        }
        return this.sceneController && this.dataExtractor;
    }

    /**
     * Initialize communication system
     */
    initialize() {
        if (this.initialized) {
            console.warn('SimpleCommunication: Already initialized');
            return;
        }

        console.log('🔄 SimpleCommunication: Initializing...');

        // Initialize Main → UI communication
        this.initializeMainToUI();

        // Initialize UI → Main communication
        this.initializeUIToMain();

        this.initialized = true;
        console.log('✅ SimpleCommunication initialized');
    }

    /**
     * Main → UI: Listen to ObjectEventBus, send COMPLETE data to all iframes
     */
    initializeMainToUI() {
        const eventBus = window.objectEventBus;

        if (!eventBus) {
            console.error('SimpleCommunication: ObjectEventBus not available');
            return;
        }

        // Subscribe to selection events (object:selection)
        eventBus.subscribe(eventBus.EVENT_TYPES.SELECTION, (event) => {
            this.handleSelectionEvent(event);
        });

        // Subscribe to hierarchy events (object:hierarchy)
        eventBus.subscribe(eventBus.EVENT_TYPES.HIERARCHY, (event) => {
            this.handleHierarchyEvent(event);
        });

        // Subscribe to object events (geometry, material, transform, lifecycle)
        const objectHandler = (event) => this.handleObjectEvent(event);
        eventBus.subscribe(eventBus.EVENT_TYPES.GEOMETRY, objectHandler);
        eventBus.subscribe(eventBus.EVENT_TYPES.MATERIAL, objectHandler);
        eventBus.subscribe(eventBus.EVENT_TYPES.TRANSFORM, objectHandler);
        eventBus.subscribe(eventBus.EVENT_TYPES.LIFECYCLE, objectHandler);

        // Subscribe to tool events (tool:state)
        eventBus.subscribe(eventBus.EVENT_TYPES.TOOL_STATE, (event) => {
            this.handleToolEvent(event);
        });

        // Listen for panels-ready event to send initial hierarchy sync
        // NOTE: This event fires late (200ms) - individual panels send their own ready messages earlier
        window.addEventListener('modler:panels-ready', () => {
            this.sendInitialHierarchySync();
        });

    }

    /**
     * UI → Main: Listen to postMessage, route to CommandRouter
     */
    initializeUIToMain() {
        window.addEventListener('message', (event) => {
            try {
                // Basic validation
                if (!event.data || typeof event.data !== 'object') {
                    return;
                }

                const { type, ...data } = event.data;

                if (!type) {
                    return;
                }

                // Handle UI panel ready messages - send initial state to newly loaded panel
                if (type === 'ui-panel-ready' || type === 'left-panel-ready') {
                    // Delegate to CommandRouter which has stateSerializer access
                    const commandRouter = window.commandRouter;
                    if (commandRouter) {
                        commandRouter.execute({ action: type, ...data });
                    }
                    return;
                }

                this.stats.messagesReceived++;

                // Route to CommandRouter
                const commandRouter = window.commandRouter;
                if (commandRouter) {
                    commandRouter.execute({
                        action: type,
                        ...data,
                        sourceWindow: event.source,  // Pass window object for postMessage responses (renamed to avoid collision)
                        origin: event.origin         // Keep origin string for validation
                    });
                }

            } catch (error) {
                console.error('SimpleCommunication: Error handling UI message', error);
                this.stats.errors++;
            }
        });

        console.log('✅ SimpleCommunication: UI → Main initialized');
    }

    // ═══════════════════════════════════════════════════════════════
    // DATA EXTRACTION & COMPUTED PROPERTIES
    // ═══════════════════════════════════════════════════════════════

    /**
     * Get complete object data with computed properties
     * Direct extraction + inline computed properties (NO transformation layers)
     */
    getCompleteObjectData(objectId) {
        if (!this.initializeComponents()) return null;

        const sceneObject = this.sceneController.getObject(objectId);
        if (!sceneObject) return null;

        // Direct extraction (no transformation)
        const data = this.dataExtractor.extractSerializableData(sceneObject);
        if (!data) return null;

        // Add computed properties inline (simple lookups)
        data.canHaveFillButtons = this.computeCanHaveFillButtons(sceneObject);
        data.fillButtonStates = this.computeFillButtonStates(sceneObject);
        data.isInLayoutMode = this.computeIsInLayoutMode(sceneObject);

        return data;
    }

    /**
     * Compute whether object can have fill buttons
     * DEFINITION: Fill buttons available when object has parent in layout mode
     */
    computeCanHaveFillButtons(sceneObject) {
        if (!sceneObject || sceneObject.isContainer || sceneObject.locked) {
            return false;
        }

        if (!sceneObject.parentContainer) {
            return false;
        }

        const parent = this.sceneController.getObject(sceneObject.parentContainer);
        return parent && (parent.containerMode === 'layout' || (parent.autoLayout && parent.autoLayout.enabled));
    }

    /**
     * Compute fill button states for each axis
     * DEFINITION: Fill button active when layoutProperties[axis] === 'fill'
     */
    computeFillButtonStates(sceneObject) {
        if (!sceneObject || !sceneObject.layoutProperties) {
            return { x: false, y: false, z: false };
        }

        return {
            x: sceneObject.layoutProperties.sizeX === 'fill',
            y: sceneObject.layoutProperties.sizeY === 'fill',
            z: sceneObject.layoutProperties.sizeZ === 'fill'
        };
    }

    /**
     * Compute whether object is in layout mode
     * DEFINITION: Layout mode active when container AND autoLayout.enabled
     */
    computeIsInLayoutMode(sceneObject) {
        return sceneObject && sceneObject.isContainer &&
               (sceneObject.containerMode === 'layout' || (sceneObject.autoLayout && sceneObject.autoLayout.enabled));
    }

    // ═══════════════════════════════════════════════════════════════
    // EVENT HANDLERS (Main → UI)
    // ═══════════════════════════════════════════════════════════════

    /**
     * Handle object change events
     */
    handleObjectEvent(event) {
        const objectId = event.objectId;
        const eventType = event.eventType;
        const changeData = event.changeData || {};

        if (!objectId) return;

        // Special handling for deletion events
        if (changeData.operation === 'deleted' || changeData.operation === 'created') {
            // For deletions and creations, send a full hierarchy update instead
            // because the object list structure has changed
            this.handleHierarchyEvent(event);
            return;
        }

        // Get COMPLETE object data
        const completeData = this.getCompleteObjectData(objectId);

        if (!completeData) return;

        // Queue for batched delivery (coalesces rapid updates to same object)
        this.pendingObjectChanges.set(objectId, {
            objectId,
            eventType,
            object: completeData
        });

        if (!this.batchScheduled) {
            this.batchScheduled = true;
            queueMicrotask(() => this.flushPendingObjectChanges());
        }
    }

    /**
     * Flush all pending object-changed messages in a single batch
     */
    flushPendingObjectChanges() {
        this.batchScheduled = false;

        if (this.pendingObjectChanges.size === 0) return;

        if (this.pendingObjectChanges.size === 1) {
            // Single object — send as regular object-changed for backward compat
            const entry = this.pendingObjectChanges.values().next().value;
            this.sendToAllIframes({
                type: 'object-changed',
                data: entry
            });
        } else {
            // Multiple objects — send as batch
            const changes = Array.from(this.pendingObjectChanges.values());
            this.sendToAllIframes({
                type: 'objects-batch-changed',
                data: { changes }
            });
        }

        this.pendingObjectChanges.clear();
    }

    /**
     * Handle selection change events
     */
    handleSelectionEvent(event) {
        const { selectedObjectIds } = event.changeData || {};

        // Get COMPLETE data for all selected objects
        const selectedObjects = (selectedObjectIds || [])
            .map(id => this.getCompleteObjectData(id))
            .filter(Boolean);

        // Send to all UI iframes
        this.sendToAllIframes({
            type: 'selection-changed',
            data: {
                selectedObjectIds: selectedObjectIds || [],
                selectedObjects // COMPLETE data for each!
            }
        });
    }

    /**
     * Handle hierarchy change events
     */
    handleHierarchyEvent(event) {
        if (!this.initializeComponents()) return;

        // Get COMPLETE hierarchy tree
        const hierarchyTree = this.getCompleteHierarchy();

        // Send to all UI iframes
        this.sendToAllIframes({
            type: 'hierarchy-changed',
            data: {
                hierarchy: hierarchyTree
            }
        });
    }

    /**
     * Get complete hierarchy as FLAT array with root ordering
     *
     * CRITICAL: ObjectTree builds the tree structure itself using parentContainer references.
     * We send ALL objects as a flat array, not a nested tree.
     *
     * Returns object with:
     * - objects: flat array of all objects (with parentContainer, childrenOrder)
     * - rootChildrenOrder: ordering for root-level objects
     */
    getCompleteHierarchy() {
        if (!this.initializeComponents()) return { objects: [], rootChildrenOrder: [] };

        // Get ALL objects as flat array
        const allObjects = this.sceneController.getAllObjects();

        // Map to basic object data (includes parentContainer + childrenOrder for tree building)
        const hierarchy = allObjects
            .map(obj => this.dataExtractor.extractBasicData(obj))
            .filter(Boolean);

        // Get root children order from HierarchyManager
        const hierarchyManager = this.sceneController.getHierarchyManager();
        const rootChildrenOrder = hierarchyManager?.rootChildrenOrder || [];

        return {
            objects: hierarchy,
            rootChildrenOrder: rootChildrenOrder
        };
    }

    /**
     * Handle tool change events
     */
    handleToolEvent(event) {
        const { toolName, active, toolState } = event.changeData || {};

        this.sendToAllIframes({
            type: 'tool-changed',
            data: {
                toolName,
                active,
                toolState
            }
        });
    }

    /**
     * Send initial hierarchy sync when panels are ready
     */
    sendInitialHierarchySync() {
        if (!this.initializeComponents()) return;

        const hierarchyTree = this.getCompleteHierarchy();

        this.sendToAllIframes({
            type: 'hierarchy-changed',
            data: {
                hierarchy: hierarchyTree
            }
        });
    }

    // ═══════════════════════════════════════════════════════════════
    // HELPERS
    // ═══════════════════════════════════════════════════════════════

    /**
     * Send message to all UI iframes
     */
    sendToAllIframes(message) {
        try {
            // CRITICAL: Query iframes dynamically each time, not cached!
            // Iframes are created asynchronously after SimpleCommunication initialization
            const iframes = document.querySelectorAll('iframe');

            iframes.forEach(iframe => {
                if (iframe.contentWindow) {
                    iframe.contentWindow.postMessage(message, '*');
                }
            });

            this.stats.messagesSent++;

        } catch (error) {
            console.error('SimpleCommunication: Error sending to iframes', error);
            this.stats.errors++;
        }
    }

    /**
     * Get statistics
     */
    getStats() {
        return { ...this.stats };
    }
}

// Export singleton instance
window.SimpleCommunication = SimpleCommunication;
window.simpleCommunication = new SimpleCommunication();

// Auto-initialize when Modler components are ready
if (window.modlerComponents) {
    window.simpleCommunication.initialize();
}
