/**
 * Simple PostMessage Communication
 *
 * Replaces Phase 3 complexity (2,500 lines) with straightforward postMessage (~100 lines):
 * - Main → UI: ObjectEventBus events with COMPLETE data
 * - UI → Main: Commands routed to CommandRouter
 *
 * No adapters, bridges, protocols, validation, or circular detection needed.
 * Just simple, direct communication with complete data.
 *
 * Part of: Communication Simplification (replaces Phase 3)
 * Version: 1.0.0
 * Date: 2025-10-13
 */

class SimpleCommunication {
    constructor() {
        this.initialized = false;
        this.iframes = null;

        // Statistics for debugging
        this.stats = {
            messagesSent: 0,
            messagesReceived: 0,
            errors: 0
        };
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
        const stateSerializer = window.stateSerializer;

        if (!eventBus) {
            console.error('SimpleCommunication: ObjectEventBus not available');
            return;
        }

        if (!stateSerializer) {
            console.error('SimpleCommunication: StateSerializer not available');
            return;
        }

        // Subscribe to object events (geometry, material, transform changes)
        eventBus.subscribe('object:*', (event) => {
            this.handleObjectEvent(event, stateSerializer);
        });

        // Subscribe to selection events
        eventBus.subscribe('selection:*', (event) => {
            this.handleSelectionEvent(event, stateSerializer);
        });

        // Subscribe to hierarchy events
        eventBus.subscribe('hierarchy:*', (event) => {
            this.handleHierarchyEvent(event, stateSerializer);
        });

        // Subscribe to tool events
        eventBus.subscribe('tool:*', (event) => {
            this.handleToolEvent(event);
        });

        console.log('✅ SimpleCommunication: Main → UI initialized');
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

                // Ignore special UI panel ready messages (handled elsewhere)
                if (type === 'ui-panel-ready' || type === 'left-panel-ready') {
                    return;
                }

                this.stats.messagesReceived++;

                // Route to CommandRouter
                const commandRouter = window.commandRouter;
                if (commandRouter) {
                    commandRouter.execute({
                        action: type,
                        ...data,
                        source: event.origin
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
    // EVENT HANDLERS (Main → UI)
    // ═══════════════════════════════════════════════════════════════

    /**
     * Handle object change events
     */
    handleObjectEvent(event, stateSerializer) {
        const { objectId, eventType } = event.data;

        if (!objectId) return;

        // Get COMPLETE object data
        const completeData = stateSerializer.getCompleteObjectData(objectId);

        if (!completeData) return;

        // Send to all UI iframes
        this.sendToAllIframes({
            type: 'object-changed',
            data: {
                objectId,
                eventType,
                object: completeData // COMPLETE data!
            }
        });
    }

    /**
     * Handle selection change events
     */
    handleSelectionEvent(event, stateSerializer) {
        const { selectedObjectIds } = event.data;

        // Get COMPLETE data for all selected objects
        const selectedObjects = selectedObjectIds
            .map(id => stateSerializer.getCompleteObjectData(id))
            .filter(Boolean);

        // Send to all UI iframes
        this.sendToAllIframes({
            type: 'selection-changed',
            data: {
                selectedObjectIds,
                selectedObjects // COMPLETE data for each!
            }
        });
    }

    /**
     * Handle hierarchy change events
     */
    handleHierarchyEvent(event, stateSerializer) {
        // Get COMPLETE hierarchy tree
        const hierarchyTree = stateSerializer.getCompleteHierarchy();

        // Send to all UI iframes
        this.sendToAllIframes({
            type: 'hierarchy-changed',
            data: {
                hierarchy: hierarchyTree
            }
        });
    }

    /**
     * Handle tool change events
     */
    handleToolEvent(event) {
        const { toolId, state } = event.data;

        this.sendToAllIframes({
            type: 'tool-changed',
            data: {
                toolId,
                state
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
            // Cache iframe references
            if (!this.iframes) {
                this.iframes = document.querySelectorAll('iframe');
            }

            this.iframes.forEach(iframe => {
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
