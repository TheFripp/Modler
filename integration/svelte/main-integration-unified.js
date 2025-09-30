/**
 * UNIFIED Main Integration - Simplified with ObjectStateManager
 *
 * ELIMINATES: 100+ lines of manual property handling, scattered state updates
 * REPLACES: Complex switch statements, manual ObjectEventBus calls, fragmented logic
 * PROVIDES: Single, simple integration layer using ObjectStateManager
 */

(function() {
    'use strict';

    // ==================================================================================
    // INITIALIZATION
    // ==================================================================================

    let isInitialized = false;
    let iframeMode = false;

    /**
     * Initialize main integration system
     */
    function initialize() {
        if (isInitialized) return;

        console.log('🚀 Unified Main Integration initializing...');

        // Detect iframe mode
        iframeMode = window !== window.parent;

        if (iframeMode) {
            console.log('📱 Running in iframe mode');
            setupIframeMessageHandling();
        } else {
            console.log('🖥️ Running in direct mode');
            setupDirectMessageHandling();
        }

        setupUnifiedEventHandlers();
        isInitialized = true;

        console.log('✅ Unified Main Integration ready');
    }

    // ==================================================================================
    // UNIFIED EVENT HANDLING
    // ==================================================================================

    /**
     * Setup event handlers for ObjectStateManager
     */
    function setupUnifiedEventHandlers() {
        const objectStateManager = window.modlerComponents?.objectStateManager;
        if (!objectStateManager) {
            console.warn('⚠️ ObjectStateManager not available');
            return;
        }

        // Listen to unified state changes
        objectStateManager.addEventListener('objects-changed', (event) => {
            const { objects, hierarchy, selection } = event.detail;

            // Notify UI systems
            notifyUISystems({
                type: 'data-update',
                data: {
                    selectedObjects: selection,
                    objectHierarchy: hierarchy,
                    updateType: 'unified-update'
                }
            });
        });

        objectStateManager.addEventListener('selection-changed', (event) => {
            const { selection } = event.detail;

            // Notify UI systems
            notifyUISystems({
                type: 'data-update',
                data: {
                    selectedObjects: selection,
                    updateType: 'selection-change'
                }
            });
        });
    }

    // ==================================================================================
    // SIMPLIFIED PROPERTY HANDLING
    // ==================================================================================

    /**
     * REVOLUTIONARY SIMPLIFICATION: All property updates in ~10 lines
     */
    function handlePropertyUpdate(objectId, property, value) {
        const objectStateManager = window.modlerComponents?.objectStateManager;
        if (!objectStateManager) {
            console.warn('❌ ObjectStateManager not available');
            return;
        }

        // Convert property path to nested update object
        const updates = {};
        if (property.includes('.')) {
            const [parent, child] = property.split('.');
            updates[parent] = { [child]: parseFloat(value) || value };
        } else {
            updates[property] = parseFloat(value) || value;
        }

        // Handle special cases
        if (property === 'autoLayout.enabled' && value) {
            const currentObject = objectStateManager.getObject(objectId);
            if (currentObject?.isContainer && !currentObject.autoLayout?.direction) {
                updates.autoLayout.direction = 'x'; // Default direction
            }
        }

        // SINGLE CALL DOES EVERYTHING: Updates 3D scene, triggers layout, notifies UI
        objectStateManager.updateObject(objectId, updates);
    }

    // ==================================================================================
    // MESSAGE HANDLING (PostMessage & Direct)
    // ==================================================================================

    /**
     * Setup PostMessage handling for iframe mode
     */
    function setupIframeMessageHandling() {
        window.addEventListener('message', (event) => {
            if (!event.origin.startsWith('http://localhost:')) {
                console.warn('⚠️ PostMessage rejected - invalid origin:', event.origin);
                return;
            }

            const { type, data } = event.data;

            switch (type) {
                case 'property-update':
                    handlePropertyUpdate(data.objectId, data.property, data.value);
                    break;
                case 'tool-activation':
                    activateTool(data.toolName);
                    break;
                case 'snap-toggle':
                    toggleSnapping();
                    break;
            }
        });
    }

    /**
     * Setup direct message handling for non-iframe mode
     */
    function setupDirectMessageHandling() {
        // Listen to postMessage calls in direct mode
        window.addEventListener('message', (event) => {
            const { type, data } = event.data;

            if (type === 'property-update') {
                handlePropertyUpdate(data.objectId, data.property, data.value);
            }
        });

        // Make handlePropertyUpdate globally available for direct calls
        window.handlePropertyUpdate = handlePropertyUpdate;
    }

    // ==================================================================================
    // UI NOTIFICATION (Replaces complex PropertyPanelSync)
    // ==================================================================================

    /**
     * Notify UI systems of state changes
     */
    function notifyUISystems(message) {
        if (iframeMode) {
            // Send to parent window (main app)
            try {
                window.parent.postMessage(message, '*');
            } catch (error) {
                console.error('❌ Failed to notify parent window:', error);
            }
        } else {
            // Direct mode - notify iframe panels
            notifyIframePanels(message);
        }
    }

    /**
     * Notify iframe panels in direct mode
     */
    function notifyIframePanels(message) {
        // Find iframe panels and send message
        const iframes = document.querySelectorAll('iframe');
        iframes.forEach(iframe => {
            try {
                iframe.contentWindow?.postMessage(message, '*');
            } catch (error) {
                // Ignore cross-origin errors
            }
        });
    }

    // ==================================================================================
    // TOOL INTEGRATION (Simplified)
    // ==================================================================================

    function activateTool(toolName) {
        const toolController = window.modlerComponents?.toolController;
        toolController?.switchToTool(toolName);
    }

    function toggleSnapping() {
        const snapController = window.modlerComponents?.snapController;
        if (snapController) {
            snapController.setEnabled(!snapController.getEnabled());
        }
    }

    // ==================================================================================
    // SCENE EVENT INTEGRATION (Simplified)
    // ==================================================================================

    /**
     * Setup SceneController event listeners
     */
    function setupSceneEventListeners() {
        const sceneController = window.modlerComponents?.sceneController;
        if (!sceneController) return;

        // Listen to object creation/deletion
        sceneController.on?.('objectAdded', (objectData) => {
            console.log('🎯 objectAdded event:', objectData.name);

            // Import new object to ObjectStateManager
            const objectStateManager = window.modlerComponents?.objectStateManager;
            if (objectStateManager) {
                objectStateManager.importFromSceneController();
            }
        });

        sceneController.on?.('objectRemoved', (objectData) => {
            console.log('🎯 objectRemoved event:', objectData.name);

            // Remove from ObjectStateManager
            const objectStateManager = window.modlerComponents?.objectStateManager;
            if (objectStateManager) {
                objectStateManager.objects.delete(objectData.id);
                objectStateManager.rebuildHierarchy();
            }
        });
    }

    // ==================================================================================
    // AUTO-INITIALIZATION
    // ==================================================================================

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        // DOM already loaded
        setTimeout(initialize, 100);
    }

    // Also try to setup scene listeners when components are available
    setTimeout(setupSceneEventListeners, 500);

    // Export for manual initialization if needed
    window.initializeUnifiedIntegration = initialize;

})();