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

            // Step 7: Show panels
            panelManager.showPanels();

            console.log('✅ Svelte integration initialized successfully');
            showActivationNotification('Svelte UI Active');

            // Add debug button in development
            createDebugButton();

        } catch (error) {
            console.error('❌ Svelte integration initialization failed:', error);
            showSvelteError(`Initialization failed: ${error.message}`);
        }
    }

    /**
     * Create all Svelte panels
     */
    function createPanels() {
        console.log('🎨 Creating Svelte panels...');

        panelManager.createLeftOverlay();
        panelManager.createRightOverlay();
        panelManager.createMainToolbar();
        panelManager.createSystemToolbar();
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
                    console.log('✅ Modler components ready');
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

        if (selectionController) {
            // Listen for selection changes using SelectionController's callback system
            selectionController.onSelectionChange((selectedObjects) => {
                if (dataSync && selectedObjects) {
                    dataSync.sendFullDataUpdate(selectedObjects, 'selection-change');
                }
            });

            // Initial data sync - send all scene objects to populate object list
            const sceneController = window.modlerComponents?.sceneController;
            console.log('🔍 DEBUG: Checking sceneController:', !!sceneController);
            console.log('🔍 DEBUG: getAllObjects method exists:', !!(sceneController && sceneController.getAllObjects));

            if (sceneController && sceneController.getAllObjects) {
                const allObjects = sceneController.getAllObjects();
                console.log('🔍 DEBUG: getAllObjects returned:', allObjects);
                console.log('📋 Found scene objects:', allObjects.length);

                if (allObjects && allObjects.length > 0) {
                    console.log('🔍 DEBUG: First object structure:', allObjects[0]);
                    const allMeshes = allObjects.map(obj => obj.mesh).filter(mesh => mesh);
                    console.log('🔍 DEBUG: Meshes extracted:', allMeshes.length);
                    console.log('🔍 DEBUG: First mesh:', allMeshes[0]);

                    if (allMeshes.length > 0) {
                        console.log('📋 Sending scene objects to populate object list:', allMeshes.length);
                        dataSync.sendFullDataUpdate(allMeshes, 'scene-objects');
                    } else {
                        console.warn('❌ No scene objects with meshes found - objects without meshes:', allObjects.filter(obj => !obj.mesh));
                    }
                } else {
                    console.warn('❌ getAllObjects returned empty or null array');
                }
            } else {
                console.warn('❌ SceneController or getAllObjects not available');
                console.log('🔍 DEBUG: window.modlerComponents:', window.modlerComponents);
            }

            // Also sync current selection
            const currentSelection = Array.from(selectionController.selectedObjects || []);
            if (currentSelection.length > 0) {
                dataSync.sendFullDataUpdate(currentSelection, 'initial-sync');
            }
        }

        if (toolController) {
            // TODO: ToolController doesn't have event system yet
            // For now, send initial tool state only
            const currentTool = toolController.getCurrentTool ? toolController.getCurrentTool() : 'select';
            sendToolStateUpdate(currentTool);
        }
    }

    /**
     * Send tool state update to Svelte panels
     */
    function sendToolStateUpdate(toolName) {
        if (!dataSync || !panelManager) return;

        const toolData = {
            currentTool: toolName || 'select',
            timestamp: Date.now()
        };

        const iframes = panelManager.getIframes();

        // Send to all panels that need tool state
        Object.values(iframes).forEach(iframe => {
            if (iframe && iframe.contentWindow) {
                try {
                    iframe.contentWindow.postMessage({
                        type: 'tool-state-update',
                        data: toolData
                    }, '*');
                } catch (error) {
                    console.warn('Failed to send tool state update:', error);
                }
            }
        });
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
     * Test PostMessage communication
     */
    function testPostMessage() {
        console.log('🧪 Testing PostMessage communication...');

        if (!panelManager) {
            console.error('❌ PanelManager not available');
            return;
        }

        const iframes = panelManager.getIframes();
        console.log('🧪 Available iframes:', Object.keys(iframes));

        // Test sending to left panel
        if (iframes.left && iframes.left.contentWindow) {
            try {
                console.log('🧪 Sending test message to left panel');
                iframes.left.contentWindow.postMessage({
                    type: 'data-update',
                    data: {
                        selectedObjects: [
                            {
                                id: 'test-1',
                                name: 'Test Object 1',
                                type: 'box',
                                position: { x: 0, y: 0, z: 0 }
                            },
                            {
                                id: 'test-2',
                                name: 'Test Object 2',
                                type: 'box',
                                position: { x: 1, y: 1, z: 1 }
                            }
                        ],
                        updateType: 'communication-test',
                        timestamp: Date.now()
                    }
                }, '*');
                console.log('✅ Test message sent to left panel');
            } catch (error) {
                console.error('❌ Failed to send test message to left panel:', error);
            }
        } else {
            console.error('❌ Left panel iframe not available');
        }
    }

    /**
     * Create a debug button for easy testing
     */
    function createDebugButton() {
        // Create container for multiple buttons
        const container = document.createElement('div');
        container.style.cssText = `
            position: fixed;
            top: 80px;
            left: 50%;
            transform: translateX(-50%);
            display: flex;
            gap: 10px;
            z-index: 1000000;
        `;

        // Test PostMessage button
        const testButton = document.createElement('button');
        testButton.textContent = 'Test PostMessage';
        testButton.style.cssText = `
            background: #10B981;
            color: white;
            padding: 10px 20px;
            border: none;
            border-radius: 6px;
            font-family: Arial, sans-serif;
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        `;
        testButton.addEventListener('click', testPostMessage);

        // Create test box button
        const createButton = document.createElement('button');
        createButton.textContent = 'Create Test Box';
        createButton.style.cssText = `
            background: #3B82F6;
            color: white;
            padding: 10px 20px;
            border: none;
            border-radius: 6px;
            font-family: Arial, sans-serif;
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        `;
        createButton.addEventListener('click', createTestBox);

        container.appendChild(testButton);
        container.appendChild(createButton);
        document.body.appendChild(container);

        // Auto-remove after 15 seconds
        setTimeout(() => {
            if (container.parentNode) {
                container.remove();
            }
        }, 15000);
    }

    /**
     * Create a test box for debugging data flow
     */
    function createTestBox() {
        const sceneController = window.modlerComponents?.sceneController;
        if (!sceneController) {
            console.warn('❌ SceneController not available for test box creation');
            return;
        }

        try {
            console.log('🔧 Creating test box...');

            // Create box geometry and material
            const geometry = new THREE.BoxGeometry(1, 1, 1);
            const material = new THREE.MeshLambertMaterial({ color: 0x00ff00 });

            // Add the box to the scene using SceneController
            const boxData = sceneController.addObject(geometry, material, {
                type: 'box',
                name: 'Test Box',
                position: { x: 0, y: 0.5, z: 0 }
            });

            console.log('🔧 Created test box:', boxData);

            // Position the mesh if returned
            if (boxData && boxData.mesh) {
                boxData.mesh.position.set(0, 0.5, 0);
            }

            // Trigger data sync after a short delay
            setTimeout(() => {
                const allObjects = sceneController.getAllObjects();
                console.log('🔧 Objects after test box creation:', allObjects.length);

                if (dataSync && allObjects.length > 0) {
                    const meshes = allObjects.map(obj => obj.mesh).filter(mesh => mesh);
                    console.log('🔧 Triggering manual data sync with meshes:', meshes.length);
                    dataSync.sendFullDataUpdate(meshes, 'manual-test');
                }
            }, 100);
        } catch (error) {
            console.error('❌ Error creating test box:', error);
        }
    }

    // Export for debugging/external access
    window.SvelteIntegration = {
        portDetector: () => portDetector,
        panelManager: () => panelManager,
        dataSync: () => dataSync,
        reinitialize: initialize,
        createTestBox: createTestBox
    };

})();