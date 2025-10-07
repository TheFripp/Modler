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
    let settingsHandler = null;

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
            } else {
                console.warn('⚠️ SettingsHandler not loaded - settings management will be limited');
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

            // Initialize PropertyPanelSync for direct communication
            if (window.PropertyPanelSync) {
                propertyPanelSync = new window.PropertyPanelSync(window.objectEventBus, directComponentManager);
                window.modlerComponents.propertyPanelSync = propertyPanelSync;

                // Expose global hierarchy notification function for backward compatibility
                window.notifyObjectHierarchyChanged = function() {
                    if (propertyPanelSync && propertyPanelSync.refreshCompleteHierarchy) {
                        propertyPanelSync.refreshCompleteHierarchy();
                    } else {
                        console.warn('   ⚠️ PropertyPanelSync.refreshCompleteHierarchy not available');
                    }
                };
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


            // Step 3: Wait for Modler components to be ready
            await waitForModlerComponents();

            // Step 4: Initialize iframe panel management
            panelManager = new window.SveltePanelManager(portDetector);

            // Step 5: Initialize PropertyPanelSync for iframe communication
            if (window.PropertyPanelSync) {
                propertyPanelSync = new window.PropertyPanelSync(window.objectEventBus, panelManager);
                window.modlerComponents.propertyPanelSync = propertyPanelSync;

                // Expose global hierarchy notification function for backward compatibility
                window.notifyObjectHierarchyChanged = function() {
                    if (propertyPanelSync && propertyPanelSync.refreshCompleteHierarchy) {
                        propertyPanelSync.refreshCompleteHierarchy();
                    } else {
                        console.warn('   ⚠️ PropertyPanelSync.refreshCompleteHierarchy not available');
                    }
                };
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

            // Get current hierarchy from SceneController (single source of truth)
            const sceneController = window.modlerComponents?.sceneController;
            const hierarchy = sceneController ? sceneController.getAllObjects() : [];

            // Serialize hierarchy for PostMessage (remove circular references)
            const ObjectDataFormat = window.ObjectDataFormat;
            const postMessageHierarchy = hierarchy.map(obj =>
                ObjectDataFormat ? ObjectDataFormat.serializeForPostMessage(obj) : obj
            ).filter(Boolean);

            // Get PostMessage-ready data directly from ObjectStateManager
            const postMessageSelectedObjects = selectedObjectsData.map(obj =>
                objectStateManager.getObjectForPostMessage ?
                objectStateManager.getObjectForPostMessage(obj.id) : obj
            ).filter(Boolean);

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
        // NOTE: LIFECYCLE events (create/delete) are handled by PropertyPanelSync
        // This avoids duplicate hierarchy updates sent to UI

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

            const { type, data } = event.data;

            // SCHEMA VALIDATION: Validate incoming message against protocol schema
            if (window.messageProtocolValidator) {
                const validation = window.messageProtocolValidator.validate(
                    type,
                    data,
                    window.MESSAGE_DIRECTION.UI_TO_MAIN
                );

                if (!validation.isValid) {
                    console.error('❌ PostMessage validation failed:', {
                        type: type,
                        errors: validation.errors,
                        data: data
                    });
                    // Log to stats but continue processing (graceful degradation)
                    // In production, you might want to reject invalid messages entirely
                }
            }

            switch (type) {
                case 'left-panel-ready':
                    // Left panel is ready - send initial hierarchy immediately
                    if (propertyPanelSync && propertyPanelSync.refreshCompleteHierarchy) {
                        propertyPanelSync.refreshCompleteHierarchy();
                    }
                    break;
                case 'object-select':
                    // Handle object selection from UI list
                    const sceneController = window.modlerComponents?.sceneController;
                    const selectionController = window.modlerComponents?.selectionController;
                    const navigationController = window.modlerComponents?.navigationController;

                    if (data.useNavigationController && navigationController) {
                        // Use NavigationController for container-aware selection
                        const objectData = sceneController.getObject(data.objectId);

                        if (objectData) {
                            if (objectData.isContainer) {
                                // Container selected: select without stepping in
                                if (selectionController && objectData.mesh) {
                                    if (!data.isShiftClick) {
                                        selectionController.clearSelection();
                                    }
                                    selectionController.select(objectData.mesh);
                                }
                            } else if (objectData.parentContainer) {
                                // Child object: step into parent container and select child
                                navigationController.navigateToObject(data.objectId, {
                                    addToSelection: data.isShiftClick
                                });
                            } else {
                                // Root-level object: navigate to object
                                navigationController.navigateToObject(data.objectId, {
                                    addToSelection: data.isShiftClick
                                });
                            }
                        }
                    } else if (sceneController && selectionController) {
                        // Fallback to direct selection
                        const objectData = sceneController.getObject(data.objectId);
                        if (objectData && objectData.mesh) {
                            // Clear current selection and select the object (unless shift-click)
                            if (!data.isShiftClick) {
                                selectionController.clearSelection();
                            }
                            selectionController.select(objectData.mesh);
                        }
                    }
                    break;
                case 'property-update':
                    handlePropertyUpdate(data.objectId, data.property, data.value, data.source);
                    break;
                case 'tool-activation':
                    activateTool(data.toolName);
                    break;
                case 'tool-switch':
                    activateTool(data.toolName);
                    break;
                case 'clear-selection':
                    window.modlerComponents?.selectionController?.clearSelection();
                    break;
                case 'create-layout-container':
                    const toolController = window.modlerComponents?.toolController;
                    if (toolController) {
                        toolController.createLayoutContainer();
                    }
                    break;
                case 'undo':
                    const undoToolController = window.modlerComponents?.toolController;
                    if (undoToolController) {
                        undoToolController.undo();
                    }
                    break;
                case 'redo':
                    const redoToolController = window.modlerComponents?.toolController;
                    if (redoToolController) {
                        redoToolController.redo();
                    }
                    break;
                case 'duplicate-object':
                    handleDuplicateObject();
                    break;
                case 'snap-toggle':
                    handleSnapToggle();
                    break;
                case 'fill-button-check':
                    handleFillButtonCheck(event.source, data.objectId);
                    break;
                case 'fill-button-toggle':
                    handleFillButtonToggle(data.objectId, data.axis);
                    break;
                case 'fill-button-get-states':
                    handleFillButtonGetStates(event.source, data.objectId);
                    break;
                case 'check-layout-mode':
                    handleCheckLayoutMode(event.source, data.objectId);
                    break;
                case 'cad-wireframe-settings-changed':
                    settingsHandler?.handleCadWireframeSettingsUpdate(data.settings);
                    break;
                case 'get-cad-wireframe-settings':
                    settingsHandler?.handleGetCadWireframeSettings(event.source);
                    break;
                case 'visual-settings-changed':
                    settingsHandler?.handleVisualSettingsUpdate(data.settings);
                    break;
                case 'get-visual-settings':
                    settingsHandler?.handleGetVisualSettings(event.source);
                    break;
                case 'scene-settings-changed':
                    settingsHandler?.handleSceneSettingsUpdate(data.settings);
                    break;
                case 'get-scene-settings':
                    settingsHandler?.handleGetSceneSettings(event.source);
                    break;
                case 'interface-settings-changed':
                    settingsHandler?.handleInterfaceSettingsUpdate(data.settings);
                    break;
                case 'get-interface-settings':
                    settingsHandler?.handleGetInterfaceSettings(event.source);
                    break;
                case 'object-move-to-container':
                case 'object-container-move-to-container':
                    handleMoveToContainer(data.objectId, data.targetContainerId);
                    break;
                case 'object-move-to-root':
                    handleMoveToRoot(data.objectId);
                    break;
                case 'request-hierarchy-refresh':
                    // Force immediate hierarchy refresh after drag-drop
                    if (propertyPanelSync) {
                        propertyPanelSync.refreshCompleteHierarchy();
                    }
                    break;
                case 'object-reorder':
                    handleObjectReorder(data.objectId, data.targetId, data.position, data.parentId);
                    break;
                case 'fill-button-hover':
                    handleFillButtonHover(data.objectId, data.axis, data.isHovering);
                    break;
                case 'create-tiled-container':
                    handleCreateTiledContainer(data.objectId, data.axis, data.repeat, data.gap);
                    break;
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

    /**
     * Handle fill button visibility check from PropertyPanel
     */
    function handleFillButtonCheck(source, objectId) {
        const propertyManager = window.modlerComponents?.propertyManager;
        if (!propertyManager) {
            source.postMessage({ type: 'fill-button-check-response', data: { shouldShow: false } }, '*');
            return;
        }

        const shouldShow = propertyManager.isInLayoutContainer(objectId);
        source.postMessage({ type: 'fill-button-check-response', data: { objectId, shouldShow } }, '*');
    }

    /**
     * Handle fill button state request from PropertyPanel
     */
    function handleFillButtonGetStates(source, objectId) {
        const propertyManager = window.modlerComponents?.propertyManager;
        if (!propertyManager) {
            source.postMessage({ type: 'fill-button-states-response', data: { states: {} } }, '*');
            return;
        }

        const states = {
            x: propertyManager.isAxisFilled(objectId, 'x'),
            y: propertyManager.isAxisFilled(objectId, 'y'),
            z: propertyManager.isAxisFilled(objectId, 'z')
        };
        source.postMessage({ type: 'fill-button-states-response', data: { objectId, states } }, '*');
    }

    /**
     * Handle fill button toggle from PropertyPanel
     */
    function handleFillButtonToggle(objectId, axis) {
        const propertyManager = window.modlerComponents?.propertyManager;
        if (propertyManager) {
            propertyManager.toggleFillProperty(axis);
        }
    }

    /**
     * Handle tile container creation from PropertyPanel
     */
    function handleCreateTiledContainer(objectId, axis, repeat, gap) {
        const toolController = window.modlerComponents?.toolController;
        if (!toolController) {
            console.error('❌ ToolController not available for tile creation');
            return;
        }

        const tileTool = toolController.tools.get('tile');
        if (!tileTool) {
            console.error('❌ TileTool not registered');
            return;
        }

        // Create tiled container using tile tool
        tileTool.createTiledContainer({ axis, repeat, gap });
    }

    /**
     * Handle moving object to container (drag and drop)
     */
    function handleMoveToContainer(objectId, targetContainerId) {
        const sceneController = window.modlerComponents?.sceneController;
        if (!sceneController) {
            console.warn('❌ SceneController not available for move operation');
            return;
        }

        // Get the object and target container
        const objectData = sceneController.getObject(objectId);
        const targetContainer = sceneController.getObject(targetContainerId);

        if (!objectData || !targetContainer) {
            console.warn('❌ Object or target container not found:', { objectId, targetContainerId });
            return;
        }

        if (!targetContainer.isContainer) {
            console.warn('❌ Target is not a container:', targetContainerId);
            return;
        }

        // Use ObjectStateManager to move the object (proper event flow)
        // SceneController.setParentContainer handles layout updates automatically
        const objectStateManager = window.modlerComponents?.objectStateManager;
        if (objectStateManager) {
            objectStateManager.updateObject(objectId, {
                parentContainer: targetContainerId
            });
        } else {
            // Fallback to direct scene controller (shouldn't happen)
            sceneController.setParentContainer(objectId, targetContainerId, true);
        }

        // After moving to container, select the object and navigate into the container
        const navigationController = window.modlerComponents?.navigationController;
        const selectionController = window.modlerComponents?.selectionController;

        if (navigationController && selectionController) {
            // Navigate into the container
            navigationController.navigateToContainer(targetContainerId);

            // Select the moved object
            const movedObjectMesh = sceneController.getObject(objectId)?.mesh;
            if (movedObjectMesh) {
                selectionController.clearSelection();
                selectionController.select(movedObjectMesh);
            }
        }
    }

    /**
     * Handle moving object to root level (drag and drop)
     */
    function handleMoveToRoot(objectId) {
        const sceneController = window.modlerComponents?.sceneController;
        if (!sceneController) {
            console.warn('❌ SceneController not available for move operation');
            return;
        }

        // Get the object
        const objectData = sceneController.getObject(objectId);
        if (!objectData) {
            console.warn('❌ Object not found:', objectId);
            return;
        }

        // Use ObjectStateManager to move the object to root (proper event flow)
        // SceneController.setParentContainer handles layout updates automatically
        const objectStateManager = window.modlerComponents?.objectStateManager;
        if (objectStateManager) {
            objectStateManager.updateObject(objectId, {
                parentContainer: null
            });
        } else {
            // Fallback to direct scene controller (shouldn't happen)
            sceneController.setParentContainer(objectId, null, true);
        }
    }

    /**
     * Handle reordering objects within a container or at root
     */
    function handleObjectReorder(objectId, targetId, position, parentId) {
        const sceneController = window.modlerComponents?.sceneController;
        if (!sceneController) {
            console.warn('❌ SceneController not available for reorder operation');
            return;
        }

        const draggedObj = sceneController.getObject(objectId);

        // Get the parent's children array
        let childrenArray;
        if (parentId) {
            const parent = sceneController.getObject(parentId);
            if (!parent || !parent.isContainer) {
                console.warn('❌ Parent container not found or invalid:', parentId);
                return;
            }
            // Get or initialize childrenOrder array
            if (!parent.childrenOrder || !Array.isArray(parent.childrenOrder)) {
                // Initialize from current children
                const currentChildren = sceneController.getChildObjects(parentId);
                parent.childrenOrder = currentChildren.map(child => child.id);
            }
            childrenArray = [...parent.childrenOrder];
        } else {
            // Root level - use rootChildrenOrder
            if (!sceneController.rootChildrenOrder || !Array.isArray(sceneController.rootChildrenOrder)) {
                // Initialize from current root objects
                sceneController.rootChildrenOrder = Array.from(sceneController.objects.values())
                    .filter(obj => !obj.parentContainer)
                    .map(obj => obj.id);
            }
            childrenArray = [...sceneController.rootChildrenOrder];
        }

        // Find current indices
        const draggedIndex = childrenArray.indexOf(objectId);
        const targetIndex = childrenArray.indexOf(targetId);

        if (targetIndex === -1) {
            console.warn('❌ Target object not found in children array');
            return;
        }

        // If dragged object is not in the array, it's being moved from another parent
        // In this case, we need to update its parentContainer first
        if (draggedIndex === -1 && draggedObj) {
            // Object is being moved from a different parent
            // First, update its parent
            const objectStateManager = window.modlerComponents?.objectStateManager;
            if (objectStateManager) {
                objectStateManager.updateObject(objectId, {
                    parentContainer: parentId
                });
            } else {
                sceneController.setParentContainer(objectId, parentId, true);
            }

            // Add to the new parent's order array
            childrenArray.push(objectId);
        } else if (draggedIndex !== -1) {
            // Object is already in this parent, just remove it for reordering
            childrenArray.splice(draggedIndex, 1);
        } else {
            console.warn('❌ Dragged object not found');
            return;
        }

        // Calculate new index
        let newIndex = targetIndex;
        if (draggedIndex !== -1 && draggedIndex < targetIndex) {
            // Dragged from before target, adjust for removal
            newIndex--;
        }

        if (position === 'after') {
            newIndex++;
        }

        // Insert at new position
        childrenArray.splice(newIndex, 0, objectId);

        // Update stored order
        if (parentId) {
            const parent = sceneController.getObject(parentId);

            // CRITICAL: Store the new order in the parent container
            parent.childrenOrder = childrenArray;

            if (parent && parent.mesh) {
                // Reorder children in Three.js parent
                const childMesh = sceneController.getObject(objectId)?.mesh;
                if (childMesh) {
                    // Remove and re-add at correct position
                    parent.mesh.remove(childMesh);
                    parent.mesh.children.splice(newIndex, 0, childMesh);
                    parent.mesh.add(childMesh);
                }
            }

            // Trigger layout update if parent has layout enabled
            const parentObj = sceneController.getObject(parentId);
            if (parentObj && parentObj.autoLayout && parentObj.autoLayout.enabled) {
                sceneController.updateLayout(parentId);
            }
        } else {
            // Root level - store the new order
            sceneController.rootChildrenOrder = childrenArray;

            // Reorder in Three.js scene
            const objectMesh = sceneController.getObject(objectId)?.mesh;
            if (objectMesh) {
                // Remove and re-add at correct position in scene
                sceneController.scene.remove(objectMesh);
                sceneController.scene.children.splice(newIndex, 0, objectMesh);
                sceneController.scene.add(objectMesh);
            }
        }

        // Refresh UI
        if (propertyPanelSync) {
            propertyPanelSync.refreshCompleteHierarchy();
        }
    }

    /**
     * Check if object is in a layout-enabled container
     */
    function handleCheckLayoutMode(source, objectId) {
        const sceneController = window.modlerComponents?.sceneController;
        if (!sceneController) {
            source.postMessage({
                type: 'layout-mode-response',
                data: { objectId, inLayoutMode: false }
            }, '*');
            return;
        }

        const objectData = sceneController.getObject(objectId);
        let inLayoutMode = false;

        if (objectData && objectData.parentContainer) {
            const container = sceneController.getObject(objectData.parentContainer);
            inLayoutMode = container && container.autoLayout && container.autoLayout.enabled;
        }

        source.postMessage({
            type: 'layout-mode-response',
            data: { objectId, inLayoutMode }
        }, '*');
    }

    /**
     * Handle fill button hover - show/hide face highlight
     * Uses see-through rendering so highlights are visible even when occluded
     */
    function handleFillButtonHover(objectId, axis, isHovering) {
        const sceneController = window.modlerComponents?.sceneController;
        const visualizationManager = window.modlerComponents?.visualizationManager;

        if (!sceneController || !visualizationManager) {
            return;
        }

        const objectData = sceneController.getObject(objectId);
        if (!objectData || !objectData.mesh) {
            return;
        }

        const supportMeshes = objectData.mesh.userData?.supportMeshes;
        if (!supportMeshes?.faceHighlight) {
            return;
        }

        if (isHovering) {
            // Create a synthetic face for the axis
            // Face normal points along the axis (positive direction)
            const normal = new THREE.Vector3();
            if (axis === 'x') normal.set(1, 0, 0);
            else if (axis === 'y') normal.set(0, 1, 0);
            else if (axis === 'z') normal.set(0, 0, 1);

            const face = { normal };

            // Enable see-through rendering for fill button highlights
            // This allows highlights to be visible even when occluded by other objects
            if (supportMeshes.faceHighlight.material) {
                supportMeshes.faceHighlight.material.depthTest = false;
                supportMeshes.faceHighlight.material.renderOrder = 1001; // Render after other highlights
            }

            // Show face highlight using visualization manager
            visualizationManager.getVisualizerFor(objectData.mesh)?.showFaceHighlight(objectData.mesh, face);
        } else {
            // Restore normal depth testing when hiding
            if (supportMeshes.faceHighlight.material) {
                supportMeshes.faceHighlight.material.depthTest = true;
                supportMeshes.faceHighlight.material.renderOrder = 1000;
            }

            // Hide face highlight
            const face = { normal: new THREE.Vector3() }; // Dummy face for hide
            visualizationManager.getVisualizerFor(objectData.mesh)?.hideFaceHighlight(objectData.mesh, face);
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
        } else if (propertyPanelSync) {
            propertyPanelSync.sendToolStateUpdate(toolName, { snapEnabled });
        }
        // Silently skip if UI not initialized yet - will sync when ready
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