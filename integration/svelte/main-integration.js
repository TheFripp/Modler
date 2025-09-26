/**
 * Modler V2 - Main Svelte Integration
 * Coordinates between modular integration components
 */

(function() {
    'use strict';

    // Integration enabled check
    const INTEGRATION_ENABLED = window.location.hostname === 'localhost' || window.location.protocol === 'file:';

    if (!INTEGRATION_ENABLED) {
        console.log('🚫 Svelte integration disabled - not in development environment');
        return;
    }

    // Integration components
    let portDetector = null;
    let panelManager = null;
    let dataSync = null;

    /**
     * Initialize the Svelte integration system
     */
    async function initialize() {
        try {
            console.log('🚀 Initializing Svelte integration...');

            // Step 1: Detect Svelte dev server
            portDetector = new SveltePortDetector();
            const serverDetected = await portDetector.detectPort();

            if (!serverDetected) {
                showSvelteError('Svelte dev server not detected');
                return;
            }

            // Step 2: Wait for Modler components to be ready
            await waitForModlerComponents();

            // Step 3: Initialize panel management
            panelManager = new SveltePanelManager(portDetector);

            // Step 4: Create panels
            createPanels();

            // Step 5: Initialize data synchronization
            dataSync = new SvelteDataSync(panelManager);
            dataSync.setupDataSync();

            // Step 6: Setup component synchronization
            initializeComponentSync();

            // Step 7: Setup message listener for UI interactions
            setupMessageListener();

            // Step 8: Show panels
            panelManager.showPanels();

            // Step 9: Delayed initial sync to ensure iframes are ready
            setTimeout(() => {
                // Performing delayed initial object list sync...
                window.populateObjectList();
            }, 1000); // 1 second delay to ensure panels are loaded

            // showActivationNotification('Svelte UI Active'); // Disabled toast notification

        } catch (error) {
            console.error('❌ Svelte integration initialization failed:', error);
            showSvelteError(`Initialization failed: ${error.message}`);
        }
    }

    /**
     * Setup message listener for commands from Svelte panels
     */
    function setupMessageListener() {
        window.addEventListener('message', (event) => {
            // Only accept messages from our Svelte panels
            const sveltePort = portDetector?.detectedPort;
            if (!sveltePort || event.origin !== `http://localhost:${sveltePort}`) {
                return;
            }

            const { type, data } = event.data;

            try {
                switch (type) {
                    case 'tool-switch':
                        handleToolSwitch(data.tool);
                        break;
                    case 'object-select':
                        handleObjectSelection(data.objectId);
                        break;
                    case 'property-update':
                        handlePropertyUpdate(data.objectId, data.property, data.value);
                        break;
                    case 'container-create':
                        handleContainerCreate(data);
                        break;
                    case 'snap-toggle':
                        handleSnapToggle();
                        break;
                    default:
                        console.warn('🤷 Unknown message type from Svelte panel:', type);
                }
            } catch (error) {
                console.error('❌ Error handling Svelte panel message:', error);
            }
        });
    }

    /**
     * Handle tool switching from Svelte UI
     */
    function handleToolSwitch(toolName) {
        const toolController = window.modlerComponents?.toolController;
        if (!toolController) {
            console.warn('❌ ToolController not available for tool switch');
            return;
        }

        const success = toolController.switchToTool(toolName);

        if (success) {
            // Send updated tool state to all panels
            sendToolStateUpdate(toolName);
        } else {
            console.warn('❌ Failed to switch to tool:', toolName);
        }
    }

    /**
     * Send tool state update to all Svelte panels
     */
    function sendToolStateUpdate(toolName) {
        if (!dataSync || !panelManager) return;

        // Get current snap state
        const snapController = window.modlerComponents?.snapController;
        const snapEnabled = snapController ? snapController.getEnabled() : false;

        // Create tool state data
        const toolStateData = {
            activeTool: toolName,
            snapEnabled: snapEnabled
        };


        // Send tool state update via data sync
        const iframes = panelManager.getIframes();

        // Send to main toolbar
        if (iframes.mainToolbar && iframes.mainToolbar.contentWindow) {
            try {
                iframes.mainToolbar.contentWindow.postMessage({
                    type: 'tool-state-update',
                    data: { toolState: toolStateData }
                }, '*');
            } catch (error) {
                console.warn('Failed to send tool state to main toolbar:', error);
            }
        }

        // Send to other panels for consistency
        if (iframes.left && iframes.left.contentWindow) {
            try {
                iframes.left.contentWindow.postMessage({
                    type: 'tool-state-update',
                    data: { toolState: toolStateData }
                }, '*');
            } catch (error) {
                console.warn('Failed to send tool state to left panel:', error);
            }
        }

        if (iframes.right && iframes.right.contentWindow) {
            try {
                iframes.right.contentWindow.postMessage({
                    type: 'tool-state-update',
                    data: { toolState: toolStateData }
                }, '*');
            } catch (error) {
                console.warn('Failed to send tool state to right panel:', error);
            }
        }
    }

    /**
     * Handle object selection from Svelte UI
     */
    function handleObjectSelection(objectId) {
        const sceneController = window.modlerComponents?.sceneController;
        const selectionController = window.modlerComponents?.selectionController;

        if (!sceneController || !selectionController) {
            console.warn('❌ Scene or Selection controller not available for object selection');
            return;
        }

        // Find object by ID and select it
        const objectData = sceneController.getObjectById(objectId);
        if (objectData && objectData.mesh) {
            selectionController.select(objectData.mesh);
        } else {
            console.warn('❌ Object not found for selection:', objectId);
        }
    }

    /**
     * Handle property updates from Svelte UI
     */
    function handlePropertyUpdate(objectId, property, value) {
        const sceneController = window.modlerComponents?.sceneController;

        if (!sceneController) {
            console.warn('❌ SceneController not available for property update');
            return;
        }

        const objectData = sceneController.getObjectById(objectId);
        if (objectData && objectData.mesh) {
            // Apply property update based on type
            switch (property) {
                case 'position.x':
                case 'position.y':
                case 'position.z':
                    const axis = property.split('.')[1];
                    objectData.mesh.position[axis] = parseFloat(value);
                    break;
                case 'rotation.x':
                case 'rotation.y':
                case 'rotation.z':
                    const rotAxis = property.split('.')[1];
                    objectData.mesh.rotation[rotAxis] = parseFloat(value);
                    break;
                case 'scale.x':
                case 'scale.y':
                case 'scale.z':
                    const scaleAxis = property.split('.')[1];
                    objectData.mesh.scale[scaleAxis] = parseFloat(value);
                    break;
                default:
                    console.warn('❌ Unknown property update:', property);
                    return;
            }

            // Notify system of object modification
            if (window.notifyObjectModified) {
                window.notifyObjectModified(objectData.mesh, 'property-change');
            }

        } else {
            console.warn('❌ Object not found for property update:', objectId);
        }
    }

    /**
     * Handle container creation from Svelte UI
     */
    function handleContainerCreate(data) {
        const containerCrudManager = window.modlerComponents?.containerCrudManager;

        if (!containerCrudManager) {
            console.warn('❌ ContainerCrudManager not available for container creation');
            return;
        }

        console.log('📦 Creating container from UI:', data);
        // Container creation logic would go here
        // This depends on the specific container creation API
    }

    /**
     * Handle snap toggle from Svelte UI
     */
    function handleSnapToggle() {
        const snapController = window.modlerComponents?.snapController;

        if (!snapController) {
            console.warn('❌ SnapController not available for snap toggle');
            return;
        }

        // Toggle snap state
        const currentState = snapController.getEnabled();
        snapController.setEnabled(!currentState);

        console.log('🧲 Snap toggled:', !currentState ? 'enabled' : 'disabled');

        // Send updated tool state to all panels
        const toolController = window.modlerComponents?.toolController;
        const currentTool = toolController ? toolController.getActiveToolName() : 'select';
        sendToolStateUpdate(currentTool);
    }

    /**
     * Create all Svelte panels
     */
    function createPanels() {
        // Creating Svelte panels...

        panelManager.createLeftOverlay();
        panelManager.createRightOverlay();
        panelManager.createMainToolbar();
        // Disabled: System toolbar creates duplicate floating snap button over properties panel
        // panelManager.createSystemToolbar();
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
                    resolve();
                } else {
                    setTimeout(checkComponents, 100);
                }
            };
            checkComponents();
        });
    }

    /**
     * Initialize component synchronization
     */
    function initializeComponentSync() {
        const selectionController = window.modlerComponents?.selectionController;
        const toolController = window.modlerComponents?.toolController;

        // Clear initial selection to ensure clean startup state
        if (dataSync) {
            dataSync.sendFullDataUpdate([], 'legacy-clear-selection');
        }

        if (selectionController) {
            // Listen for selection changes using SelectionController's callback system
            selectionController.onSelectionChange((selectedObjects) => {
                if (dataSync && selectedObjects) {
                    dataSync.sendFullDataUpdate(selectedObjects, 'selection-change');
                }
            });

            // Initial data sync - send all scene objects to populate object list
            const sceneController = window.modlerComponents?.sceneController;

            if (sceneController && sceneController.getAllObjects) {
                const allObjects = sceneController.getAllObjects();

                if (allObjects && allObjects.length > 0) {
                    const allMeshes = allObjects.map(obj => obj.mesh).filter(mesh => mesh);

                    if (allMeshes.length > 0) {
                        dataSync.sendFullDataUpdate(allMeshes, 'scene-objects');
                    } else {
                        console.warn('❌ No scene objects with meshes found - objects without meshes:', allObjects.filter(obj => !obj.mesh));
                    }
                } else {
                    console.warn('❌ getAllObjects returned empty or null array');
                }
            } else {
                console.warn('❌ SceneController or getAllObjects not available');
            }

            // Also sync current selection
            const currentSelection = Array.from(selectionController.selectedObjects || []);
            if (currentSelection.length > 0) {
                dataSync.sendFullDataUpdate(currentSelection, 'initial-sync');
            }

            // Send initial tool state
            const currentTool = toolController ? toolController.getActiveToolName() : 'select';
            sendToolStateUpdate(currentTool);
        }

        if (toolController) {
            // TODO: ToolController doesn't have event system yet
            // Initial tool state already sent above
        }
    }


    /**
     * Show activation notification
     */
    function showActivationNotification(message) {
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(34, 197, 94, 0.9);
            color: white;
            padding: 12px 24px;
            border-radius: 8px;
            font-family: Arial, sans-serif;
            font-size: 14px;
            font-weight: 500;
            z-index: 1000000;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
            animation: slideDown 0.3s ease-out;
        `;

        notification.textContent = message;
        document.body.appendChild(notification);

        setTimeout(() => {
            if (notification.parentNode) {
                notification.style.animation = 'slideUp 0.3s ease-in forwards';
                setTimeout(() => {
                    if (notification.parentNode) {
                        notification.remove();
                    }
                }, 300);
            }
        }, 2000);
    }

    /**
     * Show error message
     */
    function showSvelteError(message) {
        console.error('❌ Svelte Integration Error:', message);

        const errorDiv = document.createElement('div');
        errorDiv.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(239, 68, 68, 0.9);
            color: white;
            padding: 12px 24px;
            border-radius: 8px;
            font-family: Arial, sans-serif;
            font-size: 14px;
            z-index: 1000000;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        `;

        errorDiv.textContent = `Svelte UI Error: ${message}`;
        document.body.appendChild(errorDiv);

        setTimeout(() => {
            if (errorDiv.parentNode) {
                errorDiv.remove();
            }
        }, 5000);
    }

    // Add required CSS animations
    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideDown {
            from { transform: translateX(-50%) translateY(-20px); opacity: 0; }
            to { transform: translateX(-50%) translateY(0); opacity: 1; }
        }
        @keyframes slideUp {
            from { transform: translateX(-50%) translateY(0); opacity: 1; }
            to { transform: translateX(-50%) translateY(-20px); opacity: 0; }
        }
    `;
    document.head.appendChild(style);

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        initialize();
    }


    /**
     * Bridge functions for backward compatibility with legacy selection system
     */

    // Bridge function: Update property panel when object is selected/deselected
    window.updatePropertyPanelFromObject = function(selectedMesh) {
        if (!dataSync) return;

        if (selectedMesh) {
            // Send the selected object to Svelte panels
            dataSync.sendFullDataUpdate([selectedMesh], 'legacy-selection');
        } else {
            // Clear property panel
            dataSync.sendFullDataUpdate([], 'legacy-clear-selection');
        }
    };

    // Bridge function: Update object list selection (already handled by dataSync but keeping for compatibility)
    window.updateObjectListSelection = function(selectedNames) {
        // This is handled automatically by sendFullDataUpdate, but we can add specific logic if needed
    };

    // Bridge function: Populate object list in left panel
    window.populateObjectList = function() {
        // populateObjectList() called
        if (!dataSync) return;

        const sceneController = window.modlerComponents?.sceneController;
        if (!sceneController) {
            console.warn('📋 Main Integration: SceneController not available');
            return;
        }

        try {
            const allObjects = sceneController.getAllObjects();
            // Found ${allObjects.length} objects from SceneController

            if (allObjects && allObjects.length > 0) {
                const allMeshes = allObjects.map(obj => obj.mesh).filter(mesh => mesh);
                if (allMeshes.length > 0) {
                    dataSync.sendFullDataUpdate(allMeshes, 'object-list-populate');
                } else {
                    console.log('📋 Main Integration: No meshes found, sending clear');
                    dataSync.sendFullDataUpdate([], 'object-list-clear');
                }
            } else {
                console.log('📋 Main Integration: No objects found, sending clear');
                dataSync.sendFullDataUpdate([], 'object-list-clear');
            }
        } catch (error) {
            console.warn('❌ Error populating object list:', error);
        }
    };

    // Bridge function: Notify object hierarchy changed (containers, parents, children)
    window.notifyObjectHierarchyChanged = function() {
        console.log('📋 Main Integration: notifyObjectHierarchyChanged() called');
        if (!dataSync) return;

        // Update the full object list to reflect hierarchy changes
        window.populateObjectList();

        // Also update current selection to reflect any hierarchy changes
        const selectionController = window.modlerComponents?.selectionController;
        if (selectionController) {
            const currentSelection = Array.from(selectionController.selectedObjects || []);
            if (currentSelection.length > 0) {
                dataSync.sendFullDataUpdate(currentSelection, 'hierarchy-change-selection');
            }
        }
    };

    // Bridge function: Notify object modified (properties, transforms, etc.)
    window.notifyObjectModified = function(objectOrId, modificationType = 'geometry') {
        if (!dataSync) return;

        const sceneController = window.modlerComponents?.sceneController;
        if (!sceneController) return;

        try {
            let targetObject = null;

            // Handle both object and ID inputs
            if (typeof objectOrId === 'string' || typeof objectOrId === 'number') {
                // ID passed - find the object
                const objectData = sceneController.getObjectById(objectOrId);
                targetObject = objectData ? objectData.mesh : null;
            } else {
                // Object passed directly
                targetObject = objectOrId;
            }

            if (targetObject) {
                // Support mesh updates (wireframes, highlights) are handled centrally by GeometryUtils

                // Send specific update based on modification type
                dataSync.sendFullDataUpdate([targetObject], `object-modified-${modificationType}`);

                // If this is the currently selected object, also update property panel
                const selectionController = window.modlerComponents?.selectionController;
                if (selectionController && selectionController.selectedObjects.has(targetObject)) {
                    dataSync.sendFullDataUpdate([targetObject], 'property-update');
                }
            }
        } catch (error) {
            console.warn('❌ Error notifying object modification:', error);
        }
    };

    // Bridge function: Update scene background from configuration
    window.updateSceneBackground = function(backgroundColor) {
        // Scene background update: ${backgroundColor}

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

            // Notify panels of background change if needed
            if (dataSync) {
                const bgData = {
                    backgroundColor: backgroundColor,
                    timestamp: Date.now()
                };

                const iframes = panelManager.getIframes();
                Object.values(iframes).forEach(iframe => {
                    if (iframe && iframe.contentWindow) {
                        try {
                            iframe.contentWindow.postMessage({
                                type: 'background-update',
                                data: bgData
                            }, '*');
                        } catch (error) {
                            console.warn('Failed to send background update:', error);
                        }
                    }
                });
            }
        } catch (error) {
            console.warn('❌ Error updating scene background:', error);
        }
    };

    // Bridge function: Update config UI from values
    window.updateConfigUIFromValues = function(configValues) {
        if (!dataSync || !panelManager) return;


        try {
            const configData = {
                config: configValues || {},
                timestamp: Date.now()
            };

            const iframes = panelManager.getIframes();
            Object.values(iframes).forEach(iframe => {
                if (iframe && iframe.contentWindow) {
                    try {
                        iframe.contentWindow.postMessage({
                            type: 'config-update',
                            data: configData
                        }, '*');
                    } catch (error) {
                        console.warn('Failed to send config update:', error);
                    }
                }
            });
        } catch (error) {
            console.warn('❌ Error updating config UI:', error);
        }
    };

    // Bridge function: Update property panel dimensions (for box creation tool)
    window.updatePropertyPanelDimensions = function(width, height, depth) {
        if (!dataSync || !panelManager) return;

        // Debug: Property panel dimensions update (removed to reduce log spam)

        try {
            const dimensionData = {
                dimensions: { width, height, depth },
                timestamp: Date.now()
            };

            const iframes = panelManager.getIframes();
            Object.values(iframes).forEach(iframe => {
                if (iframe && iframe.contentWindow) {
                    try {
                        iframe.contentWindow.postMessage({
                            type: 'dimension-update',
                            data: dimensionData
                        }, '*');
                    } catch (error) {
                        console.warn('Failed to send dimension update:', error);
                    }
                }
            });
        } catch (error) {
            console.warn('❌ Error updating property panel dimensions:', error);
        }
    };

    // Bridge function: Update selected object info (for creation tools)
    window.updateSelectedObjectInfo = function(object) {
        if (!dataSync) return;

        try {
            if (object) {
                dataSync.sendFullDataUpdate([object], 'creation-object-info');
            }
        } catch (error) {
            console.warn('❌ Error updating selected object info:', error);
        }
    };

    // Bridge function: Notify tool state changed (for keyboard shortcuts)
    window.notifyToolStateChanged = function(toolName) {
        sendToolStateUpdate(toolName);
    };

    // Bridge function: Toggle snapping on/off
    window.toggleSnapping = function() {
        const snapController = window.modlerComponents?.snapController;

        if (!snapController) {
            console.warn('❌ SnapController not available for snap toggle');
            return;
        }

        // Toggle snap state
        const currentState = snapController.getEnabled();
        snapController.setEnabled(!currentState);

        console.log('🧲 Snapping toggled:', !currentState ? 'enabled' : 'disabled');
        return !currentState;
    };

    // Bridge function: Activate tool by name
    window.activateTool = function(toolName) {
        const toolController = window.modlerComponents?.toolController;

        if (!toolController) {
            console.warn('❌ ToolController not available for tool activation');
            return;
        }

        return toolController.switchToTool(toolName);
    };

    // Export for debugging/external access
    window.SvelteIntegration = {
        portDetector: () => portDetector,
        panelManager: () => panelManager,
        dataSync: () => dataSync,
        reinitialize: initialize
    };

})();