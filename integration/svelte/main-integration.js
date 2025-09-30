/**
 * UNIFIED Main Integration - Centralized State & Communication Hub
 *
 * ARCHITECTURAL OVERVIEW:
 * This file is the INTEGRATION LAYER that connects:
 * - ObjectStateManager (data/state management)
 * - PropertyPanelSync (UI communication)
 * - Svelte UI panels (user interface)
 *
 * THREE-LAYER ARCHITECTURE:
 * ┌─────────────────────────────────────────────────────────────┐
 * │ Layer 1: DATA LAYER (ObjectStateManager)                    │
 * │ - Single source of truth for all object state               │
 * │ - Handles state updates, validation, propagation            │
 * │ - Emits 'objects-changed' and 'selection-changed' events    │
 * └─────────────────────────────────────────────────────────────┘
 *                              ↓
 * ┌─────────────────────────────────────────────────────────────┐
 * │ Layer 2: INTEGRATION LAYER (this file)                      │
 * │ - Listens to ObjectStateManager events                      │
 * │ - Routes transform/selection updates via unified-update     │
 * │ - Handles PostMessage from UI → ObjectStateManager          │
 * │ - Coordinates PropertyPanelSync for specialized events      │
 * └─────────────────────────────────────────────────────────────┘
 *                              ↓
 * ┌─────────────────────────────────────────────────────────────┐
 * │ Layer 3: COMMUNICATION LAYER (PropertyPanelSync)            │
 * │ - Translates ObjectEventBus events → PostMessage format     │
 * │ - Handles iframe communication complexity                   │
 * │ - Routes to specific panels (left, right, toolbars)         │
 * │ - Handles geometry, material, selection, hierarchy events   │
 * └─────────────────────────────────────────────────────────────┘
 *
 * DATA FLOW FOR PROPERTY UPDATES:
 * UI Input → PostMessage → handlePropertyUpdate() → ObjectStateManager.updateObject()
 *   → propagateChanges() → emits events → main-integration catches events
 *   → notifyUISystems() → PropertyPanelSync.sendToUI() → PostMessage → UI Update
 *
 * WHY TWO PATHS (ObjectStateManager + PropertyPanelSync)?
 * - ObjectStateManager: Handles transform/selection (complete object data)
 * - PropertyPanelSync: Handles geometry/material/hierarchy (event-specific data)
 * - This division prevents data conflicts and optimizes network traffic
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
    let propertyPanelSync = null;
    let splitPanelController = null;

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

            if (iframeMode) {
                console.log('📱 Running in iframe mode');
                setupIframeMessageHandling();
            } else {
                // Running in direct mode (logging removed to reduce console noise)
                setupDirectMessageHandling();

                // Initialize UI system with automatic fallback
                await initializeUISystem();

                // Initialize Split.js panel resizing system
                await initializeSplitPanels();
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

            console.log('⏳ Waiting for modlerV2Ready event...');
        });
    }

    /**
     * Initialize UI system with automatic fallback
     */
    async function initializeUISystem() {
        console.log('🔧 Initializing UI System with fallback support...');

        // Try direct component mounting first
        const directSuccess = await tryDirectComponentMounting();

        if (directSuccess) {
            console.log('✅ Direct component mounting successful');
            return;
        }

        // Fallback to iframe-based system
        console.log('🔄 Falling back to iframe-based panel system...');
        const iframeSuccess = await tryIframePanelSystem();

        if (iframeSuccess) {
            console.log('✅ Iframe fallback system successful');
        } else {
            console.error('❌ Both direct mounting and iframe fallback failed');
        }
    }

    /**
     * Initialize Split.js panel system for professional resizing
     */
    async function initializeSplitPanels() {
        try {
            console.log('🎯 Initializing Split.js Panel System...');

            if (!window.SplitPanelController) {
                console.error('❌ SplitPanelController not available');
                return false;
            }

            // Create and initialize Split panel controller
            splitPanelController = new window.SplitPanelController();

            // Wait longer to ensure DOM and UI components are fully loaded
            setTimeout(() => {
                splitPanelController.initialize();
            }, 1000);

            console.log('✅ Split.js Panel System initialized successfully');
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

            // Initialize PropertyPanelSync for direct communication
            if (window.PropertyPanelSync) {
                propertyPanelSync = new window.PropertyPanelSync(window.objectEventBus, directComponentManager);
                console.log('✅ PropertyPanelSync initialized for direct communication');
            }

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

            console.log('✅ Svelte server detected:', portDetector.getBaseUrl());

            // Step 3: Wait for Modler components to be ready
            await waitForModlerComponents();

            // Step 4: Initialize iframe panel management
            panelManager = new window.SveltePanelManager(portDetector);

            // Step 5: Initialize PropertyPanelSync for iframe communication
            if (window.PropertyPanelSync) {
                propertyPanelSync = new window.PropertyPanelSync(window.objectEventBus, panelManager);
                console.log('✅ PropertyPanelSync initialized for iframe communication');
            }

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
        console.log('📺 Creating iframe panels...');
        panelManager.createLeftOverlay();
        panelManager.createRightOverlay();
        panelManager.createMainToolbar();
        console.log('✅ Iframe panels created successfully');
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
                    // Svelte classes are available (logging removed to reduce console noise)
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
                        console.log('⏳ Waiting for Svelte classes...');
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
                    console.log('⏳ Waiting for Modler components...');
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
            const { objects, hierarchy, selection } = event.detail;

            // Skip full object updates during drag operations to prevent flickering
            // Individual property updates are still sent via object:property-changed
            if (isDraggingProperty) {
                return;
            }

            // Get PostMessage-ready data
            const postMessageSelection = selection.map(objectId =>
                objectStateManager.getObjectForPostMessage ?
                objectStateManager.getObjectForPostMessage(objectId) :
                objectStateManager.getObject(objectId)
            ).filter(Boolean);

            const postMessageHierarchy = objectStateManager.getHierarchyForPostMessage ?
                objectStateManager.getHierarchyForPostMessage() : hierarchy;

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

        objectStateManager.addEventListener('selection-changed', (event) => {
            const { selection } = event.detail;

            // Retrieve full object data for selected objects
            const selectedObjectsData = selection.map(objectId => {
                const objectData = objectStateManager.getObject(objectId);
                if (!objectData) {
                    console.warn(`⚠️ Object ${objectId} not found in ObjectStateManager`);
                    return null;
                }
                return objectData;
            }).filter(Boolean);

            // Get current hierarchy for context
            const hierarchy = objectStateManager.getHierarchy();

            // Use standard format directly from ObjectStateManager
            // NO MORE FLAT PROPERTIES - ObjectStateManager already provides standard format

            // Get PostMessage-ready data directly from ObjectStateManager
            const postMessageSelectedObjects = selectedObjectsData.map(obj =>
                objectStateManager.getObjectForPostMessage ?
                objectStateManager.getObjectForPostMessage(obj.id) : obj
            ).filter(Boolean);

            const postMessageHierarchy = objectStateManager.getHierarchyForPostMessage ?
                objectStateManager.getHierarchyForPostMessage() : hierarchy;

            // Notify UI systems with standard format data
            notifyUISystems({
                type: 'data-update',
                data: {
                    selectedObjects: postMessageSelectedObjects,
                    objectHierarchy: postMessageHierarchy,
                    updateType: 'selection-change'
                }
            });

            // Selection update sent to UI (logging removed to reduce console noise)
        });
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

        // Listen to object lifecycle events (create, delete)
        window.objectEventBus.subscribe('object:lifecycle', (event) => {

            if (event.changeData.action === 'create') {
                // Object created - ensure ObjectStateManager is synchronized
                setTimeout(() => {
                    // Trigger re-import to capture newly created objects
                    if (objectStateManager.importFromSceneController) {
                        objectStateManager.importFromSceneController();
                    }

                    // Get the newly created object data for property panels
                    const newObject = objectStateManager.getObject(event.objectId);
                    const postMessageNewObject = objectStateManager.getObjectForPostMessage ?
                        objectStateManager.getObjectForPostMessage(event.objectId) : newObject;
                    const postMessageHierarchy = objectStateManager.getHierarchyForPostMessage ?
                        objectStateManager.getHierarchyForPostMessage() : objectStateManager.getHierarchy();

                    // Notify UI of new object with standard format data
                    notifyUISystems({
                        type: 'data-update',
                        data: {
                            selectedObjects: [],
                            objectHierarchy: postMessageHierarchy,
                            updateType: 'object-created',
                            newObjectId: event.objectId,
                            newObjectData: postMessageNewObject
                        }
                    });

                    // Also send object list update
                    notifyUISystems({
                        type: 'object-list-update',
                        data: {
                            hierarchy: postMessageHierarchy,
                            updateType: 'object-added',
                            addedObjectId: event.objectId
                        }
                    });
                }, 50); // Small delay to ensure object is fully processed
            }

            if (event.changeData.action === 'delete') {
                // Object deleted - notify UI to update
                const postMessageHierarchy = objectStateManager.getHierarchyForPostMessage ?
                    objectStateManager.getHierarchyForPostMessage() : objectStateManager.getHierarchy();

                notifyUISystems({
                    type: 'data-update',
                    data: {
                        selectedObjects: [],
                        objectHierarchy: postMessageHierarchy,
                        updateType: 'object-deleted',
                        deletedObjectId: event.objectId
                    }
                });

                // Also send object list update
                notifyUISystems({
                    type: 'object-list-update',
                    data: {
                        hierarchy: postMessageHierarchy,
                        updateType: 'object-removed',
                        removedObjectId: event.objectId
                    }
                });
            }
        });

        // Listen to transform events (position, rotation, scale changes)
        window.objectEventBus.subscribe('object:transform', (event) => {
            // Transform events are frequent during tools - only log errors

            // Update ObjectStateManager with transform changes
            if (event.changeData.position || event.changeData.rotation || event.changeData.scale) {
                objectStateManager.updateObject(event.objectId, event.changeData);
            }
        });

        // Listen to selection events
        window.objectEventBus.subscribe('object:selection', (event) => {
            // ObjectEventBus selection event received (logging removed to reduce console noise)

            // Sync selection state
            if (event.changeData.selected) {
                objectStateManager.setSelection([event.objectId]);
            }
        });

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
                    handlePropertyUpdate(data.objectId, data.property, data.value, data.source);
                    break;
                case 'tool-activation':
                    activateTool(data.toolName);
                    break;
                case 'snap-toggle':
                    handleSnapToggle();
                    break;
                case 'cad-wireframe-settings-changed':
                    handleCadWireframeSettingsUpdate(data.settings);
                    break;
                case 'get-cad-wireframe-settings':
                    handleGetCadWireframeSettings(event.source);
                    break;
                case 'visual-settings-changed':
                    handleVisualSettingsUpdate(data.settings);
                    break;
                case 'get-visual-settings':
                    handleGetVisualSettings(event.source);
                    break;
                case 'scene-settings-changed':
                    handleSceneSettingsUpdate(data.settings);
                    break;
                case 'get-scene-settings':
                    handleGetSceneSettings(event.source);
                    break;
                case 'interface-settings-changed':
                    handleInterfaceSettingsUpdate(data.settings);
                    break;
                case 'get-interface-settings':
                    handleGetInterfaceSettings(event.source);
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

    // Throttling for UI updates
    let lastUpdateTime = 0;
    let updateTimeout = null;
    let pendingUpdate = null;

    /**
     * Notify UI systems of state changes (throttled)
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

        // Use direct component communication or PropertyPanelSync
        if (directComponentManager) {
            try {
                // Direct communication with mounted components
                directComponentManager.broadcastToAll(message);
            } catch (error) {
                console.error('❌ Direct component communication failed:', error);
            }
        } else if (propertyPanelSync) {
            try {
                // Map message types to PropertyPanelSync methods
                if (message.type === 'data-update') {
                    // Map data-update to sendToUI with appropriate updateType
                    const data = message.data;
                    propertyPanelSync.sendToUI(data.updateType || 'data-update', data.selectedObjects || [], {
                        hierarchy: data.objectHierarchy,
                        containerContext: data.containerContext,
                        newObjectId: data.newObjectId,
                        newObjectData: data.newObjectData,
                        deletedObjectId: data.deletedObjectId
                    });
                } else if (message.type === 'property-update') {
                    // Use sendToUI for property updates
                    propertyPanelSync.sendToUI('property-refresh', message.data.updatedObject ? [message.data.updatedObject] : [], {
                        property: message.data.property,
                        value: message.data.value,
                        objectId: message.data.objectId,
                        source: message.data.updateSource
                    });
                } else if (message.type === 'tool-state-update') {
                    // Use sendToolStateUpdate for tool state changes
                    propertyPanelSync.sendToolStateUpdate(message.data.toolState?.activeTool || 'unknown', message.data);
                } else if (message.type === 'object-list-update') {
                    // Map object-list-update to hierarchy-changed
                    propertyPanelSync.sendToUI('hierarchy-changed', [], {
                        hierarchy: message.data.hierarchy,
                        updateType: message.data.updateType,
                        addedObjectId: message.data.addedObjectId,
                        removedObjectId: message.data.removedObjectId
                    });
                } else {
                    // Fallback for other message types - use sendToUI with custom type
                    propertyPanelSync.sendToUI(message.type, message.data?.selectedObjects || [], {
                        ...message.data
                    });
                }
            } catch (error) {
                console.error('❌ PropertyPanelSync communication failed:', error);
                // Fallback to legacy behavior only on error
                fallbackToLegacyPostMessage(message);
            }
        } else {
            console.warn('⚠️ No communication system available');
            fallbackToLegacyPostMessage(message);
        }
    }

    /**
     * Fallback to PropertyPanelSync when main communication fails
     * CRITICAL FIX: Remove direct postMessage bypass - always route through PropertyPanelSync
     */
    function fallbackToLegacyPostMessage(message) {
        // BYPASS ELIMINATED: No longer use direct postMessage - force through PropertyPanelSync
        console.warn('❌ PropertyPanelSync should have handled this message:', message.type);
        console.warn('❌ This indicates a communication bypass that needs investigation');

        // Don't create parallel communication paths - let the failure be visible
        // This forces proper PropertyPanelSync usage and prevents race conditions
    }

    /**
     * Sanitize data for PostMessage - SIMPLIFIED VERSION
     * ObjectStateManager now provides clean standard format data
     */
    function sanitizeForPostMessage(obj) {
        // ObjectStateManager should already provide clean data via getObjectForPostMessage()
        // This function is now just a safety fallback for edge cases

        if (obj === null || obj === undefined) return obj;
        if (typeof obj === 'function') return '[Function]';
        if (obj instanceof Date) return obj.toISOString();
        if (Array.isArray(obj)) return obj.map(sanitizeForPostMessage);

        if (typeof obj === 'object') {
            // Skip Three.js objects that shouldn't be in standard format data
            if (obj.constructor?.name?.includes('Mesh') ||
                obj.constructor?.name?.includes('Three') ||
                obj.constructor?.name?.includes('WebGL')) {
                return `[${obj.constructor.name}]`;
            }

            // Simple object cloning - ObjectDataFormat should have already cleaned the data
            try {
                return JSON.parse(JSON.stringify(obj));
            } catch (error) {
                console.warn('sanitizeForPostMessage: JSON serialization failed, using fallback');
                const sanitized = {};
                for (const [key, value] of Object.entries(obj)) {
                    if (key.startsWith('_') || key === 'mesh') continue;
                    sanitized[key] = sanitizeForPostMessage(value);
                }
                return sanitized;
            }
        }

        return obj;
    }

    /**
     * Notify iframe panels via PropertyPanelSync (BYPASS ELIMINATED)
     * CRITICAL FIX: Replace direct iframe access with PropertyPanelSync routing
     */
    function notifyIframePanels(message) {
        // BYPASS ELIMINATED: No longer use direct iframe.contentWindow access
        if (propertyPanelSync) {
            try {
                // Route through PropertyPanelSync instead of direct iframe access
                // This ensures consistent message authorization and monitoring
                propertyPanelSync.sendToUI(message.type, message.data?.selectedObjects || [], {
                    messageData: message.data
                });
            } catch (error) {
                console.error('❌ PropertyPanelSync communication failed:', error);
            }
        } else {
            console.error('❌ PropertyPanelSync not available - cannot send message:', message.type);
            console.error('❌ Direct iframe access bypass eliminated to prevent race conditions');
        }
    }

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
            } else {
                console.warn('❌ Failed to switch to tool:', toolName);
            }
        }
    }

    /**
     * Handle CAD wireframe settings update from Svelte toolbar
     */
    function handleCadWireframeSettingsUpdate(settings) {
        console.log('⚙️ Updating CAD wireframe settings:', settings);

        const configurationManager = window.modlerComponents?.configurationManager;
        if (!configurationManager) {
            console.warn('❌ ConfigurationManager not available for CAD wireframe settings');
            return;
        }

        // Update configuration using proper ConfigurationManager methods
        // The ConfigurationManager will handle persistence and notifications automatically
        for (const [key, value] of Object.entries(settings)) {
            configurationManager.set(key, value);
        }

        console.log('✅ CAD wireframe settings updated via ConfigurationManager');
    }

    /**
     * Handle request for current CAD wireframe settings
     */
    function handleGetCadWireframeSettings(source) {
        const configurationManager = window.modlerComponents?.configurationManager;
        if (!configurationManager) {
            console.warn('❌ ConfigurationManager not available for getting CAD wireframe settings');
            return;
        }

        // Get current settings from ConfigurationManager
        const currentSettings = {
            color: configurationManager.get('visual.cad.wireframe.color') || '#666666',
            opacity: configurationManager.get('visual.cad.wireframe.opacity') || 0.5,
            lineWidth: configurationManager.get('visual.cad.wireframe.lineWidth') || 1
        };

        // Send response back to requesting iframe
        source.postMessage({
            type: 'cad-wireframe-settings-response',
            settings: currentSettings
        }, '*');
    }

    /**
     * Handle visual settings update from Svelte left panel
     */
    function handleVisualSettingsUpdate(settings) {
        const configurationManager = window.modlerComponents?.configurationManager;
        if (!configurationManager) {
            console.warn('❌ ConfigurationManager not available for visual settings');
            return;
        }

        // Update configuration using proper ConfigurationManager methods
        // The ConfigurationManager will handle persistence and notifications automatically
        for (const [key, value] of Object.entries(settings)) {
            configurationManager.set(key, value);
        }
    }

    /**
     * Handle scene settings update from Svelte left panel
     */
    function handleSceneSettingsUpdate(settings) {
        const configurationManager = window.modlerComponents?.configurationManager;
        if (!configurationManager) {
            console.warn('❌ ConfigurationManager not available for scene settings');
            return;
        }

        // Update configuration using proper ConfigurationManager methods
        // The ConfigurationManager will handle persistence and notifications automatically
        for (const [key, value] of Object.entries(settings)) {
            configurationManager.set(key, value);
        }
    }

    /**
     * Handle request for current scene settings
     */
    function handleGetSceneSettings(source) {
        const configurationManager = window.modlerComponents?.configurationManager;
        if (!configurationManager) {
            console.warn('❌ ConfigurationManager not available for getting scene settings');
            return;
        }

        // Get current settings from ConfigurationManager
        const currentSettings = {
            backgroundColor: configurationManager.get('scene.backgroundColor') || '#1a1a1a',
            gridMainColor: configurationManager.get('scene.gridMainColor') || '#444444',
            gridSubColor: configurationManager.get('scene.gridSubColor') || '#222222'
        };

        // Send response back to requesting iframe
        source.postMessage({
            type: 'scene-settings-response',
            settings: currentSettings
        }, '*');
    }

    /**
     * Handle interface settings update from Svelte left panel
     */
    function handleInterfaceSettingsUpdate(settings) {
        const configurationManager = window.modlerComponents?.configurationManager;
        if (!configurationManager) {
            console.warn('❌ ConfigurationManager not available for interface settings');
            return;
        }

        // Update configuration using proper ConfigurationManager methods
        // The ConfigurationManager will handle persistence and notifications automatically
        for (const [key, value] of Object.entries(settings)) {
            configurationManager.set(key, value);
        }
    }

    /**
     * Handle request for current interface settings
     */
    function handleGetInterfaceSettings(source) {
        const configurationManager = window.modlerComponents?.configurationManager;
        if (!configurationManager) {
            console.warn('❌ ConfigurationManager not available for getting interface settings');
            return;
        }

        // Get current settings from ConfigurationManager
        const currentSettings = {
            accentColor: configurationManager.get('interface.accentColor') || '#4a9eff',
            toolbarOpacity: configurationManager.get('interface.toolbarOpacity') || 0.95
        };

        // Send response back to requesting iframe
        source.postMessage({
            type: 'interface-settings-response',
            settings: currentSettings
        }, '*');
    }

    /**
     * Handle request for current visual settings
     */
    function handleGetVisualSettings(source) {
        const configurationManager = window.modlerComponents?.configurationManager;
        if (!configurationManager) {
            console.warn('❌ ConfigurationManager not available for getting visual settings');
            return;
        }

        // Get current settings from ConfigurationManager
        const currentSettings = {
            selection: {
                color: configurationManager.get('visual.selection.color') || '#ff6600',
                lineWidth: configurationManager.get('visual.selection.lineWidth') || 2,
                opacity: configurationManager.get('visual.selection.opacity') || 0.8
            },
            containers: {
                wireframeColor: configurationManager.get('visual.containers.wireframeColor') || '#00ff00',
                lineWidth: configurationManager.get('visual.containers.lineWidth') || 1,
                opacity: configurationManager.get('visual.containers.opacity') || 0.8
            }
        };

        // Send response back to requesting iframe
        source.postMessage({
            type: 'visual-settings-response',
            settings: currentSettings
        }, '*');
    }

    /**
     * Handle snap toggle from Svelte toolbar
     */
    function handleSnapToggle() {
        const snapController = window.modlerComponents?.snapController;
        if (snapController) {
            snapController.toggle();
            console.log('✅ Snap toggled:', snapController.getEnabled());
        } else {
            console.warn('❌ SnapController not available');
        }
    }

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
            console.log(`📡 Tool state update sent via DirectComponentManager: ${toolName} (snap: ${snapEnabled})`);
        } else if (propertyPanelSync) {
            propertyPanelSync.sendToolStateUpdate(toolName, { snapEnabled });
            console.log(`📡 Tool state update sent via PropertyPanelSync: ${toolName} (snap: ${snapEnabled})`);
        } else {
            console.debug('🔧 No communication system available for tool state update');
        }
    }

    function toggleSnapping() {
        const snapController = window.modlerComponents?.snapController;
        if (snapController) {
            snapController.setEnabled(!snapController.getEnabled());

            // Send updated tool state after snap toggle
            const toolController = window.modlerComponents?.toolController;
            const currentTool = toolController ? toolController.getActiveToolName() : 'select';
            sendToolStateUpdate(currentTool);
        }
    }

    // Bridge function: Notify tool state changed (for keyboard shortcuts)
    window.notifyToolStateChanged = function(toolName) {
        console.log(`🔔 Tool state changed notification: ${toolName}`);
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
        sceneController.on?.('objectAdded', (objectData) => {
            // Object events during creation are frequent - only log errors

            // Import new object to ObjectStateManager
            const objectStateManager = window.modlerComponents?.objectStateManager;
            if (objectStateManager) {
                objectStateManager.importFromSceneController();
            }
        });

        sceneController.on?.('objectRemoved', (objectData) => {
            // Object events during manipulation are frequent - only log errors

            // Remove from ObjectStateManager
            const objectStateManager = window.modlerComponents?.objectStateManager;
            if (objectStateManager) {
                objectStateManager.objects.delete(objectData.id);
                objectStateManager.rebuildHierarchy();
            }
        });
    }

    // ==================================================================================
    // SCENE UPDATE FUNCTIONS (Bridge functions for ConfigurationManager)
    // ==================================================================================

    /**
     * Update scene background color from configuration
     */
    window.updateSceneBackground = function(backgroundColor) {
        const scene = window.modlerComponents?.scene;
        if (!scene) return;

        try {
            // Parse color and update scene background
            if (typeof backgroundColor === 'string') {
                const colorHex = parseInt(backgroundColor.replace('#', ''), 16);
                scene.background = new THREE.Color(colorHex);
            } else if (typeof backgroundColor === 'number') {
                scene.background = new THREE.Color(backgroundColor);
            }
        } catch (error) {
            console.error('❌ Failed to update scene background:', error);
        }
    };

    /**
     * Update grid main color from configuration
     */
    window.updateGridMainColor = function(gridMainColor) {
        // Find and update the main grid lines
        const scene = window.modlerComponents?.scene;
        if (!scene) return;

        try {
            const color = new THREE.Color(gridMainColor);
            // Look for the floor grid object and update its main lines
            scene.traverse((child) => {
                if (child.name === 'Floor Grid' || child.userData?.gridType === 'main') {
                    if (child.material && child.material.color) {
                        child.material.color.copy(color);
                        child.material.needsUpdate = true;
                    }
                }
            });
        } catch (error) {
            console.error('❌ Failed to update grid main color:', error);
        }
    };

    /**
     * Update grid sub color from configuration
     */
    window.updateGridSubColor = function(gridSubColor) {
        // Find and update the sub grid lines
        const scene = window.modlerComponents?.scene;
        if (!scene) return;

        try {
            const color = new THREE.Color(gridSubColor);
            // Look for the floor grid object and update its sub lines
            scene.traverse((child) => {
                if (child.name === 'Floor Grid' || child.userData?.gridType === 'sub') {
                    if (child.material && child.material.color) {
                        child.material.color.copy(color);
                        child.material.needsUpdate = true;
                    }
                }
            });
        } catch (error) {
            console.error('❌ Failed to update grid sub color:', error);
        }
    };

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
        }, 200); // Small delay to let v2-main.js start first
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