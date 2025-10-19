/**
 * UNIFIED Main Integration - Centralized State & Communication Hub
 *
 * ARCHITECTURAL OVERVIEW:
 * This file is the INTEGRATION LAYER that connects:
 * - ObjectStateManager (data/state management)
 * - MainAdapter/UIAdapter (UI communication via Phase 3 architecture)
 * - Svelte UI panels (user interface)
 *
 * THREE-LAYER ARCHITECTURE (Phase 3):
 * ┌─────────────────────────────────────────────────────────────┐
 * │ Layer 1: DATA LAYER (ObjectStateManager)                    │
 * │ - Single source of truth for all object state               │
 * │ - Handles state updates, validation, propagation            │
 * │ - Emits ObjectEventBus events for all state changes         │
 * └─────────────────────────────────────────────────────────────┘
 *                              ↓
 * ┌─────────────────────────────────────────────────────────────┐
 * │ Layer 2: INTEGRATION LAYER (this file)                      │
 * │ - Handles PostMessage from UI → ObjectStateManager          │
 * │ - Manages tool activation, settings, file operations        │
 * │ - Coordinates DirectComponentManager for panel communication│
 * └─────────────────────────────────────────────────────────────┘
 *                              ↓
 * ┌─────────────────────────────────────────────────────────────┐
 * │ Layer 3: COMMUNICATION LAYER (MainAdapter/UIAdapter)        │
 * │ - MainAdapter: Subscribes to ObjectEventBus events          │
 * │ - Translates events → MessageProtocol → postMessage         │
 * │ - UIAdapter: Receives messages → Updates Svelte stores      │
 * │ - Handles all event types: geometry, material, selection,   │
 * │   hierarchy, lifecycle, tool state                          │
 * └─────────────────────────────────────────────────────────────┘
 *
 * DATA FLOW FOR PROPERTY UPDATES (Phase 3):
 * UI Input → PostMessage → handlePropertyUpdate() → ObjectStateManager.updateObject()
 *   → ObjectEventBus.emit() → MainAdapter.handleEvent() → CommunicationBridge
 *   → postMessage → UIAdapter.receive() → Svelte stores → UI Update
 */

(function() {
    'use strict';

    // ==================================================================================
    // INITIALIZATION
    // ==================================================================================

    let isInitialized = false;
    let iframeMode = false;
    let portDetector = null;
    let panelManager = null;
    let directComponentManager = null;
    let splitPanelController = null;
    let settingsHandler = null;
    let fileManagerHandler = null;

    /**
     * Show visual error message to user with enhanced debugging info
     */
    function showInitializationError(message) {
        const timestamp = new Date().toLocaleTimeString();
        const debugInfo = {
            modlerComponents: !!window.modlerComponents,
            objectStateManager: !!window.modlerComponents?.objectStateManager,
            sceneController: !!window.modlerComponents?.sceneController,
            selectionController: !!window.modlerComponents?.selectionController,
            svelteClasses: {
                SveltePortDetector: !!window.SveltePortDetector,
                SveltePanelManager: !!window.SveltePanelManager
            }
        };

        console.error('🚨 Integration Error Details:', {
            message,
            timestamp,
            debugInfo,
            userAgent: navigator.userAgent
        });

        const errorDiv = document.createElement('div');
        errorDiv.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #842029;
            color: #f8d7da;
            padding: 15px 20px;
            border-radius: 5px;
            border: 1px solid #721c24;
            z-index: 10000;
            font-family: Arial, sans-serif;
            font-size: 14px;
            max-width: 450px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        `;
        errorDiv.innerHTML = `
            <strong>⚠️ Integration Error (${timestamp})</strong><br>
            ${message}<br><br>
            <details style="margin-top: 8px;">
                <summary style="cursor: pointer; font-weight: bold;">Debug Info</summary>
                <pre style="font-size: 11px; margin: 5px 0; overflow: auto; max-height: 100px;">${JSON.stringify(debugInfo, null, 2)}</pre>
            </details>
            <small>Check browser console for full details. Try refreshing the page.</small>
        `;
        document.body.appendChild(errorDiv);

        // Auto-remove after 15 seconds (longer for debugging)
        setTimeout(() => {
            if (errorDiv.parentNode) {
                errorDiv.parentNode.removeChild(errorDiv);
            }
        }, 15000);
    }

    /**
     * Initialize main integration system
     */
    async function initialize() {
        if (isInitialized) return;

        try {
            // Unified Main Integration initializing... (logging removed to reduce console noise)

            // Wait for components to be ready before proceeding
            await waitForComponentsReady();

            // Detect iframe mode
            iframeMode = window !== window.parent;

            // Setup unified message handling for both modes
            setupUnifiedMessageHandling();

            if (!iframeMode) {
                // Running in direct mode (logging removed to reduce console noise)
                // Initialize UI system with automatic fallback
                await initializeUISystem();

                // Initialize Split.js panel resizing system
                await initializeSplitPanels();
            }

            // Initialize centralized panel communication
            let panelCommunication = null;
            if (typeof window.PanelCommunication !== 'undefined') {
                const panelManager = directComponentManager || splitPanelController;
                panelCommunication = new window.PanelCommunication(panelManager);
                window.modlerComponents.panelCommunication = panelCommunication;
            } else {
                console.warn('⚠️ PanelCommunication not loaded - panel messaging will be limited');
            }

            // Initialize settings handler
            if (typeof window.SettingsHandler !== 'undefined') {
                settingsHandler = new window.SettingsHandler();
                if (panelCommunication) {
                    settingsHandler.initialize(panelCommunication);
                }
                // Register in modlerComponents for CommandRouter access
                window.modlerComponents.settingsHandler = settingsHandler;
            } else {
                console.warn('⚠️ SettingsHandler not loaded - settings management will be limited');
            }

            // Initialize file manager handler
            if (typeof window.FileManagerHandler !== 'undefined') {
                fileManagerHandler = new window.FileManagerHandler();
                const fileManager = window.modlerComponents?.fileManager;
                if (fileManager && panelCommunication) {
                    fileManagerHandler.initialize(fileManager, panelCommunication);
                    // Expose fileManagerHandler globally for switch statement access
                    window.modlerComponents.fileManagerHandler = fileManagerHandler;
                }
            } else {
                console.warn('⚠️ FileManagerHandler not loaded - file operations will be limited');
            }

            setupUnifiedEventHandlers();
            isInitialized = true;

            // Unified Main Integration ready

        } catch (error) {
            console.error('❌ Main Integration initialization failed:', error);
            showInitializationError(`Integration failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * Wait for modlerComponents to be properly initialized using event-based approach
     */
    async function waitForComponentsReady() {
        return new Promise((resolve, reject) => {
            const timeout = 10000; // 10 second timeout for complex initialization
            let timeoutId;

            // Check if components are already ready
            if (window.modlerComponents &&
                window.modlerComponents.objectStateManager &&
                window.modlerComponents.sceneController &&
                window.modlerComponents.selectionController) {
                // Components already ready for integration
                resolve();
                return;
            }

            // Listen for the modlerV2Ready event
            const handleReady = (event) => {
                const { success, error, components } = event.detail;

                clearTimeout(timeoutId);
                window.removeEventListener('modlerV2Ready', handleReady);

                if (success) {
                    // Components ready for integration via event

                    // Double-check that required components are available
                    if (window.modlerComponents &&
                        window.modlerComponents.objectStateManager &&
                        window.modlerComponents.sceneController &&
                        window.modlerComponents.selectionController) {
                        resolve();
                    } else {
                        const missingComponents = [];
                        if (!window.modlerComponents) missingComponents.push('modlerComponents');
                        if (!window.modlerComponents?.objectStateManager) missingComponents.push('objectStateManager');
                        if (!window.modlerComponents?.sceneController) missingComponents.push('sceneController');
                        if (!window.modlerComponents?.selectionController) missingComponents.push('selectionController');

                        const errorMsg = `Required components missing: ${missingComponents.join(', ')}`;
                        console.error('❌', errorMsg);
                        showInitializationError(errorMsg);
                        reject(new Error(errorMsg));
                    }
                } else {
                    console.error('❌ Components initialization failed:', error);
                    showInitializationError(`Component initialization failed: ${error}`);
                    reject(new Error(error || 'Component initialization failed'));
                }
            };

            // Set up event listener
            window.addEventListener('modlerV2Ready', handleReady);

            // Set up timeout fallback
            timeoutId = setTimeout(() => {
                window.removeEventListener('modlerV2Ready', handleReady);
                console.error('❌ Components initialization timeout after 10 seconds');
                showInitializationError('Components failed to initialize within 10 seconds. Check browser console for details.');
                reject(new Error('Components initialization timeout'));
            }, timeout);
        });
    }

    /**
     * Initialize UI system with automatic fallback
     */
    async function initializeUISystem() {
        // Try direct component mounting first
        const directSuccess = await tryDirectComponentMounting();

        if (directSuccess) {
            return;
        }

        // Fallback to iframe-based system
        const iframeSuccess = await tryIframePanelSystem();

        if (!iframeSuccess) {
            console.error('❌ Both direct mounting and iframe fallback failed');
        }
    }

    /**
     * Initialize Split.js panel system for professional resizing
     */
    async function initializeSplitPanels() {
        try {
            if (!window.SplitPanelController) {
                console.error('❌ SplitPanelController not available');
                return false;
            }

            // Create and initialize Split panel controller
            splitPanelController = new window.SplitPanelController();

            // Reduced delay for faster startup
            setTimeout(() => {
                splitPanelController.initialize();
            }, 100);

            return true;

        } catch (error) {
            console.error('❌ Failed to initialize Split.js Panel System:', error);
            return false;
        }
    }

    /**
     * Try direct component mounting system
     */
    async function tryDirectComponentMounting() {
        try {
            if (!window.DirectComponentManager) {
                console.warn('⚠️ DirectComponentManager not available, skipping direct mounting');
                return false;
            }

            directComponentManager = new window.DirectComponentManager();
            const success = await directComponentManager.initialize();

            if (!success) {
                console.warn('⚠️ DirectComponentManager initialization failed');
                return false;
            }

            // Phase 3: MainAdapter handles all Main → UI communication
            console.log('✅ Using MainAdapter for UI communication');

            return true;

        } catch (error) {
            console.warn('⚠️ Direct component mounting failed:', error);
            return false;
        }
    }

    /**
     * Fallback to iframe-based Svelte panels
     */
    async function tryIframePanelSystem() {
        try {
            // Step 1: Wait for Svelte classes to be loaded
            const classesReady = await waitForSvelteClasses();
            if (!classesReady) {
                console.error('❌ Svelte classes failed to load after timeout');
                return false;
            }

            // Step 2: Detect Svelte dev server
            portDetector = new window.SveltePortDetector();
            const serverDetected = await portDetector.detectPort();

            if (!serverDetected) {
                console.warn('⚠️ Svelte dev server not detected');
                return false;
            }


            // Step 3: Wait for Modler components to be ready
            await waitForModlerComponents();

            // Step 4: Initialize iframe panel management
            panelManager = new window.SveltePanelManager(portDetector);

            // Phase 3: MainAdapter handles all Main → UI communication
            console.log('✅ Using MainAdapter for UI communication');

            // Step 6: Create and show iframe panels
            createIframePanels();
            panelManager.showPanels();

            return true;

        } catch (error) {
            console.error('❌ Iframe panel system failed:', error);
            return false;
        }
    }

    /**
     * Create iframe panels (restored from original working system)
     */
    function createIframePanels() {
        panelManager.createLeftOverlay();
        panelManager.createRightOverlay();
        panelManager.createMainToolbar();
    }

    // createPanels() function removed - DirectComponentManager handles mounting automatically

    /**
     * Wait for Svelte classes to be loaded
     */
    function waitForSvelteClasses() {
        return new Promise((resolve) => {
            const timeout = 5000; // 5 second timeout
            const startTime = Date.now();

            const checkClasses = () => {
                if (window.SveltePortDetector && window.SveltePanelManager) {
                    const elapsed = Date.now() - startTime;
                    console.log(`✅ Svelte classes loaded in ${elapsed}ms`);
                    resolve(true);
                } else {
                    const elapsed = Date.now() - startTime;
                    if (elapsed > timeout) {
                        console.error('❌ Timeout waiting for Svelte classes');
                        console.error('Missing classes:', {
                            SveltePortDetector: !window.SveltePortDetector,
                            SveltePanelManager: !window.SveltePanelManager
                        });
                        resolve(false);
                    } else {
                        if (elapsed > 0 && elapsed % 500 === 0) {
                            console.log(`⏳ Waiting for Svelte classes... ${elapsed}ms`);
                        }
                        setTimeout(checkClasses, 100);
                    }
                }
            };
            checkClasses();
        });
    }

    /**
     * Wait for Modler components to be available
     */
    function waitForModlerComponents() {
        return new Promise((resolve) => {
            const checkComponents = () => {
                if (window.modlerComponents &&
                    window.modlerComponents.sceneController &&
                    window.modlerComponents.selectionController) {
                    // Modler components ready
                    resolve();
                } else {
                    setTimeout(checkComponents, 100);
                }
            };
            checkComponents();
        });
    }

    // ==================================================================================
    // UNIFIED EVENT HANDLING
    // ==================================================================================

    /**
     * Setup event handlers for ObjectStateManager and ObjectEventBus
     */
    function setupUnifiedEventHandlers() {
        const objectStateManager = window.modlerComponents?.objectStateManager;
        if (!objectStateManager) {
            console.warn('⚠️ ObjectStateManager not available');
            return;
        }

        // Setup ObjectEventBus listeners for complete data flow
        setupObjectEventBusListeners(objectStateManager);

        // Track if we're currently in a drag operation
        let isDraggingProperty = false;
        window.objectEventBus.subscribe('object:property-changed', (evt) => {
            if (evt.changeData?.source === 'drag') {
                isDraggingProperty = true;
                // Clear flag after a short delay (drag updates are continuous)
                setTimeout(() => { isDraggingProperty = false; }, 100);
            }
        });

        // Listen to unified state changes
        objectStateManager.addEventListener('objects-changed', (event) => {
            const { objects, selection } = event.detail;

            // Skip full object updates during drag operations to prevent flickering
            // Individual property updates are still sent via object:property-changed
            if (isDraggingProperty) {
                return;
            }

            // Get PostMessage-ready data for selected objects
            const postMessageSelection = selection.map(objectId =>
                objectStateManager.getObjectForPostMessage ?
                objectStateManager.getObjectForPostMessage(objectId) :
                objectStateManager.getObject(objectId)
            ).filter(Boolean);

            // Get current hierarchy from SceneController (single source of truth)
            const sceneController = window.modlerComponents?.sceneController;
            const hierarchy = sceneController ? sceneController.getAllObjects() : [];

            // Serialize hierarchy for PostMessage (remove circular references)
            const ObjectDataFormat = window.ObjectDataFormat;
            const postMessageHierarchy = hierarchy.map(obj =>
                ObjectDataFormat ? ObjectDataFormat.serializeForPostMessage(obj) : obj
            ).filter(Boolean);

            // Notify UI systems with standard format
            notifyUISystems({
                type: 'data-update',
                data: {
                    selectedObjects: postMessageSelection,
                    objectHierarchy: postMessageHierarchy,
                    updateType: 'unified-update'
                }
            });
        });

        // NOTE: Legacy selection-changed CustomEvent listener REMOVED
        // SimpleCommunication now handles all selection events through ObjectEventBus
        // This eliminates duplicate selection-changed messages
    }

    /**
     * Setup ObjectEventBus listeners for comprehensive scene → state → UI data flow
     */
    function setupObjectEventBusListeners(objectStateManager) {
        if (!window.objectEventBus) {
            console.warn('⚠️ ObjectEventBus not available');
            return;
        }

        // Setting up ObjectEventBus listeners for unified data flow
        // NOTE: LIFECYCLE events (create/delete) are handled by MainAdapter
        // UI receives updates via ObjectEventBus → MainAdapter → MessageProtocol

        // Listen to transform events (position, rotation, scale changes)
        window.objectEventBus.subscribe('object:transform', (event) => {
            // Transform events are frequent during tools - only log errors

            // Update ObjectStateManager with transform changes
            if (event.changeData.position || event.changeData.rotation || event.changeData.scale) {
                objectStateManager.updateObject(event.objectId, event.changeData);
            }
        });

        // Listen to selection events
        // NOTE: Phase 3 - Selection events are now handled by MainAdapter
        // MainAdapter subscribes to object:selection events and routes them to UIAdapter
        // This legacy listener is kept only for ObjectStateManager sync
        // SimpleCommunication: Selection events handled by SimpleCommunication
        // DO NOT re-call setSelection() here - causes infinite loop!
        // SelectionController → ObjectStateManager.setSelection() → ObjectEventBus.emit()
        // → SimpleCommunication handles UI updates

        // Listen to property change events for comprehensive UI updates
        window.objectEventBus.subscribe('object:property-changed', (event) => {
            // Skip UI updates during drag operations to prevent flickering
            // Drag updates happen at 60fps and should only update 3D scene
            // Final value will be synced when drag ends
            const updateSource = event.changeData.source || 'unknown';
            if (updateSource === 'drag') {
                return; // Skip UI notification during drag
            }

            // Send property update to UI systems using standard format
            // NOTE: Don't send updatedObject during property updates - causes flickering
            // The UI already has the object data and can update locally
            notifyUISystems({
                type: 'property-update',
                data: {
                    objectId: event.objectId,
                    property: event.changeData.property,
                    value: event.changeData.value,
                    updateSource: updateSource
                }
            });
        });

        // ObjectEventBus listeners setup complete
    }

    // ==================================================================================
    // SIMPLIFIED PROPERTY HANDLING
    // ==================================================================================

    /**
     * REVOLUTIONARY SIMPLIFICATION: All property updates in ~10 lines
     */
    function handlePropertyUpdate(objectId, property, value, source = 'input') {
        // PHASE 6: Try optimized router first, fallback to standard handler
        const propertyUpdateRouter = window.modlerComponents?.propertyUpdateRouter;

        if (propertyUpdateRouter) {
            // Use PropertyFormatConverter for proper type conversion
            const formatConverter = window.propertyFormatConverter;
            let convertedValue = value;

            if (formatConverter) {
                const result = formatConverter.convertToInternal(property, value);
                if (!result.isValid) {
                    console.warn(`❌ Property format validation failed for ${property}:`, result.error);
                }
                convertedValue = result.value;
            } else {
                convertedValue = parseFloat(value) || value;
            }

            // Route through optimized path
            const success = propertyUpdateRouter.routeUpdate(objectId, property, convertedValue);
            if (success) return; // Fast path succeeded
        }

        // Fallback to standard path (for special cases or if router not available)
        const objectStateManager = window.modlerComponents?.objectStateManager;
        if (!objectStateManager) {
            console.warn('❌ ObjectStateManager not available');
            return;
        }

        // Convert property path to update object with proper format conversion
        const updates = {};

        // Use PropertyFormatConverter for proper type conversion and validation
        const formatConverter = window.propertyFormatConverter;
        if (formatConverter) {
            const result = formatConverter.convertToInternal(property, value);
            if (!result.isValid) {
                console.warn(`❌ Property format validation failed for ${property}:`, result.error);
            }
            updates[property] = result.value;
        } else {
            // Fallback to basic conversion if PropertyFormatConverter not available
            updates[property] = parseFloat(value) || value;
        }

        // Handle special cases
        if (property === 'autoLayout.enabled' && value) {
            const currentObject = objectStateManager.getObject(objectId);
            if (currentObject?.isContainer && !currentObject.autoLayout?.direction) {
                // Initialize autoLayout object if it doesn't exist
                if (!updates.autoLayout) {
                    updates.autoLayout = {};
                }
                updates.autoLayout.direction = 'x'; // Default direction
            }
        }

        // Property updates are frequent during tools - only log errors

        // SINGLE CALL DOES EVERYTHING: Updates 3D scene, triggers layout, notifies UI
        // ObjectStateManager.propagateChanges() handles ALL event emissions automatically
        // ARCHITECTURAL FIX: Removed duplicate event emissions (was causing 4x updates and lag)
        objectStateManager.updateObject(objectId, updates, source);
    }

    // ==================================================================================
    // MESSAGE HANDLING (PostMessage & Direct)
    // ==================================================================================

    /**
     * Setup unified PostMessage handling for both iframe and direct modes
     * Consolidated from duplicate setupIframeMessageHandling() and setupDirectMessageHandling()
     */
    function setupUnifiedMessageHandling() {
        // Single PostMessage listener handles both iframe and direct modes
        window.addEventListener('message', (event) => {
            // Only validate origin in iframe mode (when we're the child)
            const isInIframe = window !== window.parent;
            if (isInIframe && !event.origin.startsWith('http://localhost:')) {
                console.warn('⚠️ PostMessage rejected - invalid origin:', event.origin);
                return;
            }

            const { type, ...data } = event.data;

            // NOTE: SimpleCommunication already handles UI → Main messages via CommandRouter
            // This listener only handles legacy messages not yet migrated (settings, file manager)

            switch (type) {
                case 'ui-panel-ready':
                case 'left-panel-ready':
                    // SimpleCommunication: Initial state sent automatically via ObjectEventBus subscriptions
                    // No action needed - SimpleCommunication handles this
                    break;
                // NOTE: All settings handlers now routed through SimpleCommunication → CommandRouter
                // Removed duplicate handlers to prevent race conditions:
                // - cad-wireframe-settings-changed, get-cad-wireframe-settings
                // - visual-settings-changed, get-visual-settings
                // - scene-settings-changed, get-scene-settings
                // - interface-settings-changed, get-interface-settings
                // - file-manager-request, request-file-manager-ready
            }
        });

        // Make handlePropertyUpdate globally available for direct calls
        window.handlePropertyUpdate = handlePropertyUpdate;
    }

    // ==================================================================================
    // UI NOTIFICATION (Phase 3: DirectComponentManager → MainAdapter)
    // ==================================================================================

    // Throttling for UI updates
    let lastUpdateTime = 0;
    let updateTimeout = null;
    let pendingUpdate = null;

    /**
     * Notify UI systems of state changes (throttled)
     *
     * TODO (SimpleCommunication): This function is REDUNDANT in iframe mode.
     * - SimpleCommunication already handles Main → UI via ObjectEventBus subscriptions
     * - DirectComponentManager is only for direct-mounted components (non-iframe mode)
     * - In production, all panels are iframes → SimpleCommunication handles everything
     *
     * NEXT STEP: Remove this function and all notifyUISystems() calls once verified
     */
    function notifyUISystems(message) {
        // Throttle rapid updates to prevent spam
        const now = Date.now();
        const timeSinceLastUpdate = now - lastUpdateTime;

        if (timeSinceLastUpdate < 50) { // 50ms throttle
            // Clear existing timeout and set new one
            if (updateTimeout) {
                clearTimeout(updateTimeout);
            }

            pendingUpdate = message;
            updateTimeout = setTimeout(() => {
                sendUIUpdate(pendingUpdate);
                pendingUpdate = null;
                updateTimeout = null;
            }, 50);
            return;
        }

        sendUIUpdate(message);
    }

    function sendUIUpdate(message) {
        lastUpdateTime = Date.now();

        // Phase 3: Use DirectComponentManager for iframe communication
        if (directComponentManager) {
            try {
                // Direct communication with mounted components
                directComponentManager.broadcastToAll(message);
            } catch (error) {
                console.error('❌ Direct component communication failed:', error);
            }
        } else {
            console.warn('⚠️ DirectComponentManager not available - this should not happen in Phase 3');
        }
    }

    /**
     * Phase 3: Legacy fallback removed
     * All communication now goes through DirectComponentManager → MainAdapter → UIAdapter
     */

    /**
     * Sanitize data for PostMessage - SIMPLIFIED VERSION
     * ObjectStateManager now provides clean standard format data
     */

    // ==================================================================================
    // TOOL INTEGRATION (Complete)
    // ==================================================================================

    function activateTool(toolName) {
        const toolController = window.modlerComponents?.toolController;
        if (toolController) {
            const success = toolController.switchToTool(toolName);
            if (success) {
                // Send updated tool state to all panels
                sendToolStateUpdate(toolName);

                // Auto-focus the main window so the tool can receive events
                if (window.focus) {
                    window.focus();
                }
            } else {
                console.warn('❌ Failed to switch to tool:', toolName);
            }
        } else {
            console.warn('❌ ToolController not available');
        }
    }

    // Expose tool activation for UI components
    window.activateTool = activateTool;

    // ==================================================================================
    // SETTINGS HANDLERS (Delegated to SettingsHandler class)
    // ==================================================================================


    // ==================================================================================
    // SNAP TOGGLE HANDLER
    // ==================================================================================

    /**
     * Handle snap toggle from Svelte toolbar
     */
    function handleSnapToggle() {
        const snapController = window.modlerComponents?.snapController;
        if (snapController) {
            snapController.toggle();
            // Send updated tool state after snap toggle
            const toolController = window.modlerComponents?.toolController;
            const currentTool = toolController?.getActiveToolName() || 'select';
            sendToolStateUpdate(currentTool);
        } else {
            console.warn('❌ SnapController not available');
        }
    }

    // Expose snap toggle for UI components
    window.toggleSnapping = handleSnapToggle;

    /**
     * Handle duplicate object command from UI
     */
    function handleDuplicateObject() {
        const selectionController = window.modlerComponents?.selectionController;
        const historyManager = window.modlerComponents?.historyManager;
        const sceneController = window.modlerComponents?.sceneController;

        if (!selectionController || !historyManager || !sceneController) {
            logger.warn('DuplicateObject: Missing required components');
            return;
        }

        const selectedObjects = selectionController.getSelectedObjects();
        if (selectedObjects.length === 0) {
            logger.info('DuplicateObject: No object selected');
            return;
        }

        // Get first selected object's ID
        const mesh = selectedObjects[0];
        const objectData = sceneController.getObjectByMesh(mesh);

        if (!objectData) {
            logger.warn('DuplicateObject: Could not find object data');
            return;
        }

        // Create and execute duplicate command
        const command = new DuplicateObjectCommand(objectData.id);
        historyManager.executeCommand(command);
    }

    // Phase 3 fill button handlers removed - now handled by CommandRouter → PropertyUpdateHandler

    // handleCreateTiledContainer removed - now handled by CommandRouter

    // handleMoveToContainer and handleMoveToRoot removed - now handled by CommandRouter

    // handleObjectReorder removed - now handled by CommandRouter

    // handleCheckLayoutMode removed - layout mode now provided automatically by StateSerializer

    // handleFillButtonHover, handleLayoutButtonHover, handleReverseChildOrder removed - now handled by CommandRouter

    /**
     * Send tool state update to all panels
     */
    function sendToolStateUpdate(toolName) {
        // Get current snap state
        const snapController = window.modlerComponents?.snapController;
        const snapEnabled = snapController ? snapController.getEnabled() : false;

        const toolStateMessage = {
            type: 'tool-state-update',
            data: {
                toolState: { activeTool: toolName },
                snapEnabled
            }
        };

        if (directComponentManager) {
            directComponentManager.broadcastToAll(toolStateMessage);
        }
        // Phase 3: Tool state automatically sent via ObjectEventBus → MainAdapter
    }


    // Bridge function: Notify tool state changed (for keyboard shortcuts)
    window.notifyToolStateChanged = function(toolName) {
        sendToolStateUpdate(toolName);
    };

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
        sceneController.on?.('objectAdded', () => {
            // Import new object to ObjectStateManager
            const objectStateManager = window.modlerComponents?.objectStateManager;
            if (objectStateManager) {
                objectStateManager.importFromSceneController();
            }
        });

        sceneController.on?.('objectRemoved', (objectData) => {
            // Remove from ObjectStateManager
            const objectStateManager = window.modlerComponents?.objectStateManager;
            if (objectStateManager) {
                objectStateManager.objects.delete(objectData.id);
                // Note: Hierarchy is rebuilt on-demand via getHierarchy(), no need to rebuild here
            }
        });
    }

    // ==================================================================================
    // SCENE UPDATE FUNCTIONS (Bridge functions for ConfigurationManager)
    // NOTE: These functions are now defined in scene-foundation.js
    // ==================================================================================

    /**
     * Update interface accent color from configuration
     */
    window.updateAccentColor = function(accentColor) {
        // Update CSS custom property for accent color
        try {
            document.documentElement.style.setProperty('--accent-color', accentColor);
        } catch (error) {
            console.error('❌ Failed to update accent color:', error);
        }
    };

    /**
     * Update toolbar opacity from configuration
     */
    window.updateToolbarOpacity = function(toolbarOpacity) {
        // Update CSS custom property for toolbar opacity
        try {
            document.documentElement.style.setProperty('--toolbar-opacity', toolbarOpacity.toString());
        } catch (error) {
            console.error('❌ Failed to update toolbar opacity:', error);
        }
    };

    // ==================================================================================
    // AUTO-INITIALIZATION
    // ==================================================================================

    /**
     * Smart initialization that waits for proper timing
     */
    function startIntegration() {
        // Main Integration starting... (logging removed to reduce console noise)

        // Give v2-main.js time to complete its initialization
        // Since both scripts listen to DOMContentLoaded, we need to wait
        setTimeout(() => {
            initialize().then(() => {
                // Setup scene listeners after successful integration
                setupSceneEventListeners();
            }).catch(error => {
                console.error('❌ Integration startup failed:', error);
            });
        }, 50); // Reduced delay for faster startup
    }

    // Initialize when DOM is ready with improved timing
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', startIntegration);
    } else if (document.readyState === 'interactive' || document.readyState === 'complete') {
        // DOM already loaded
        startIntegration();
    }

    // Export for manual initialization if needed
    window.initializeUnifiedIntegration = initialize;

})();