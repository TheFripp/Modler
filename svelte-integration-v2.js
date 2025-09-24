/**
 * Modler V2 - Svelte UI Integration Script V2
 * Replaces both left and right panels with Svelte components
 */

(function() {
    'use strict';

    // Configuration - Dynamic port detection
    let SVELTE_BASE_URL = null;
    let SVELTE_PROPERTY_PANEL_URL = null;
    let SVELTE_LEFT_PANEL_URL = null;
    let SVELTE_MAIN_TOOLBAR_URL = null;
    let SVELTE_SYSTEM_TOOLBAR_URL = null;
    const INTEGRATION_ENABLED = window.location.hostname === 'localhost' || window.location.protocol === 'file:';

    // Detect Svelte dev server port with caching and parallel requests
    async function detectSveltePort() {
        const ports = [5173, 5174, 5175, 5176, 5177]; // Common Vite dev server ports

        // Try cached port first for instant loading
        const cachedPort = localStorage.getItem('svelte-dev-port');
        if (cachedPort && ports.includes(parseInt(cachedPort))) {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 200);

                const response = await fetch(`http://localhost:${cachedPort}/main-toolbar`, {
                    method: 'HEAD',
                    signal: controller.signal
                });

                clearTimeout(timeoutId);

                if (response.ok) {
                    SVELTE_BASE_URL = `http://localhost:${cachedPort}`;
                    SVELTE_PROPERTY_PANEL_URL = `${SVELTE_BASE_URL}/property-panel`;
                    SVELTE_LEFT_PANEL_URL = `${SVELTE_BASE_URL}/left-panel`;
                    SVELTE_MAIN_TOOLBAR_URL = `${SVELTE_BASE_URL}/main-toolbar`;
                    SVELTE_SYSTEM_TOOLBAR_URL = `${SVELTE_BASE_URL}/system-toolbar`;
                    console.log(`✅ Using cached Svelte dev server at port ${cachedPort}`);
                    return true;
                }
            } catch (error) {
                // Cached port failed, clear cache and continue with parallel detection
                localStorage.removeItem('svelte-dev-port');
            }
        }

        // Parallel port detection for faster loading
        const portPromises = ports.map(async (port) => {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 300);

                const response = await fetch(`http://localhost:${port}/main-toolbar`, {
                    method: 'HEAD',
                    signal: controller.signal
                });

                clearTimeout(timeoutId);

                if (response.ok) {
                    return port;
                }
            } catch (error) {
                // Port not available or timeout
            }
            return null;
        });

        try {
            const results = await Promise.allSettled(portPromises);
            const successfulPort = results.find(result =>
                result.status === 'fulfilled' && result.value !== null
            )?.value;

            if (successfulPort) {
                // Cache the successful port for next time
                localStorage.setItem('svelte-dev-port', successfulPort.toString());

                SVELTE_BASE_URL = `http://localhost:${successfulPort}`;
                SVELTE_PROPERTY_PANEL_URL = `${SVELTE_BASE_URL}/property-panel`;
                SVELTE_LEFT_PANEL_URL = `${SVELTE_BASE_URL}/left-panel`;
                SVELTE_MAIN_TOOLBAR_URL = `${SVELTE_BASE_URL}/main-toolbar`;
                SVELTE_SYSTEM_TOOLBAR_URL = `${SVELTE_BASE_URL}/system-toolbar`;
                console.log(`✅ Found Svelte dev server at port ${successfulPort}`);
                return true;
            }
        } catch (error) {
            console.error('❌ Error during parallel port detection:', error);
        }

        console.error('❌ Could not find Svelte dev server on any port');
        return false;
    }


    // Only activate on localhost for development
    if (!INTEGRATION_ENABLED) {
        return;
    }


    let svelteRightOverlay = null;
    let svelteLeftOverlay = null;
    let svelteMainToolbar = null;
    let svelteSystemToolbar = null;
    let isOverlayVisible = false;
    let rightPanelIframe = null;
    let leftPanelIframe = null;
    let mainToolbarIframe = null;
    let systemToolbarIframe = null;

    /**
     * Update the viewport area based on panel sizes (only for side panels, not floating toolbars)
     */
    function updateViewportArea() {
        const viewportArea = document.querySelector('.viewport-area');
        if (!viewportArea) return;

        const leftWidth = svelteLeftOverlay ? parseInt(window.getComputedStyle(svelteLeftOverlay).width, 10) : 0;
        const rightWidth = svelteRightOverlay ? parseInt(window.getComputedStyle(svelteRightOverlay).width, 10) : 0;

        // Only adjust for side panels, floating toolbars don't affect viewport
        viewportArea.style.left = leftWidth + 'px';
        viewportArea.style.right = rightWidth + 'px';
        viewportArea.style.top = '0px'; // Floating toolbars don't need top offset
    }

    /**
     * Create the Svelte left panel overlay (load content into existing container)
     */
    function createSvelteLeftOverlay() {
        // Clear loading state and set up for iframe
        if (!svelteLeftOverlay) {
            svelteLeftOverlay = document.createElement('div');
            svelteLeftOverlay.id = 'svelte-left-overlay';
            document.body.appendChild(svelteLeftOverlay);
        }

        // Update container styling for iframe content
        svelteLeftOverlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 280px;
            height: 100vh;
            background: #171717;
            border-right: 1px solid #2E2E2E;
            z-index: 99999;
            transform: translateX(0);
            overflow: hidden;
            font-family: Arial, sans-serif;
            pointer-events: auto;
            min-width: 200px;
            max-width: 50vw;
        `;

        // Create resize handle for left panel
        const leftResizeHandle = document.createElement('div');
        leftResizeHandle.style.cssText = `
            position: absolute;
            top: 0;
            right: -4px;
            width: 8px;
            height: 100%;
            cursor: ew-resize;
            z-index: 100000;
            background: transparent;
        `;

        leftResizeHandle.addEventListener('mousedown', (e) => {
            e.preventDefault();
            e.stopPropagation();

            document.body.style.cursor = 'ew-resize';
            document.body.style.userSelect = 'none';

            const startX = e.clientX;
            const startWidth = parseInt(window.getComputedStyle(svelteLeftOverlay).width, 10);
            let isDragging = true;

            const handleMouseMove = (e) => {
                if (!isDragging) return;
                e.preventDefault();
                e.stopPropagation();

                const width = startWidth + (e.clientX - startX);
                const minWidth = 200;
                const maxWidth = window.innerWidth * 0.5;
                const clampedWidth = Math.max(minWidth, Math.min(maxWidth, width));

                svelteLeftOverlay.style.width = clampedWidth + 'px';
                updateViewportArea();
            };

            const cleanup = (e) => {
                if (!isDragging) return;
                isDragging = false;

                document.body.style.cursor = '';
                document.body.style.userSelect = '';

                // Remove all event listeners from multiple elements for better coverage
                document.removeEventListener('mousemove', handleMouseMove, true);
                document.removeEventListener('mouseup', cleanup, true);
                document.removeEventListener('keydown', handleEscape, true);
                document.removeEventListener('mouseleave', cleanup, true);
                document.documentElement.removeEventListener('mousemove', handleMouseMove, true);
                document.documentElement.removeEventListener('mouseup', cleanup, true);
                document.documentElement.removeEventListener('mouseleave', cleanup, true);
                window.removeEventListener('blur', cleanup, true);

                clearTimeout(timeoutId);
            };

            const handleEscape = (e) => {
                if (e.key === 'Escape') {
                    cleanup(e);
                }
            };

            // Auto-cleanup after 10 seconds to prevent infinite drag
            const timeoutId = setTimeout(() => cleanup(), 10000);

            // Use capture phase and multiple elements to ensure events are caught even during fast dragging
            document.addEventListener('mousemove', handleMouseMove, true);
            document.addEventListener('mouseup', cleanup, true);
            document.addEventListener('keydown', handleEscape, true);
            document.addEventListener('mouseleave', cleanup, true);

            // Also add to documentElement for better coverage
            document.documentElement.addEventListener('mousemove', handleMouseMove, true);
            document.documentElement.addEventListener('mouseup', cleanup, true);
            document.documentElement.addEventListener('mouseleave', cleanup, true);

            window.addEventListener('blur', cleanup, true); // Handle window losing focus
        });

        // Create iframe for Svelte left panel
        const leftIframe = document.createElement('iframe');
        leftIframe.loading = 'eager'; // Load immediately for instant UI
        leftIframe.src = SVELTE_LEFT_PANEL_URL;
        leftPanelIframe = leftIframe;
        leftIframe.style.cssText = `
            width: 100%;
            height: 100vh;
            border: none;
            background: #171717;
        `;

        // Add error handling for iframe
        leftIframe.onerror = () => {
            console.error('❌ Failed to load Svelte Left Panel from:', SVELTE_LEFT_PANEL_URL);
        };

        leftIframe.onload = () => {
            // Send current data once the iframe is ready
            if (window.modlerComponents) {
                const currentSelection = window.modlerComponents.selectionController?.getSelectedObjects() || [];
                sendFullDataUpdate(currentSelection, 'panel-ready');
            }
        };

        // Clear loading content and add iframe
        svelteLeftOverlay.innerHTML = '';
        svelteLeftOverlay.appendChild(leftIframe);
        svelteLeftOverlay.appendChild(leftResizeHandle);
    }

    /**
     * Create the Svelte right panel overlay (load content into existing container)
     */
    function createSvelteRightOverlay() {
        // Clear loading state and set up for iframe
        if (!svelteRightOverlay) {
            svelteRightOverlay = document.createElement('div');
            svelteRightOverlay.id = 'svelte-right-overlay';
            document.body.appendChild(svelteRightOverlay);
        }
        svelteRightOverlay.id = 'svelte-right-overlay';
        svelteRightOverlay.style.cssText = `
            position: fixed;
            top: 0;
            right: 0;
            width: 320px;
            height: 100vh;
            background: #171717;
            border-left: 1px solid #2E2E2E;
            z-index: 99999;
            transform: translateX(0);
            overflow: hidden;
            font-family: Arial, sans-serif;
            pointer-events: auto;
            min-width: 250px;
            max-width: 50vw;
        `;

        // Create resize handle for right panel
        const rightResizeHandle = document.createElement('div');
        rightResizeHandle.style.cssText = `
            position: absolute;
            top: 0;
            left: -4px;
            width: 8px;
            height: 100%;
            cursor: ew-resize;
            z-index: 100000;
            background: transparent;
        `;

        rightResizeHandle.addEventListener('mousedown', (e) => {
            e.preventDefault();
            e.stopPropagation();

            document.body.style.cursor = 'ew-resize';
            document.body.style.userSelect = 'none';

            const startX = e.clientX;
            const startWidth = parseInt(window.getComputedStyle(svelteRightOverlay).width, 10);
            let isDragging = true;

            const handleMouseMove = (e) => {
                if (!isDragging) return;
                e.preventDefault();
                e.stopPropagation();

                const width = startWidth - (e.clientX - startX); // Subtract for right panel
                const minWidth = 250;
                const maxWidth = window.innerWidth * 0.5;
                const clampedWidth = Math.max(minWidth, Math.min(maxWidth, width));

                svelteRightOverlay.style.width = clampedWidth + 'px';
                updateViewportArea();
            };

            const cleanup = (e) => {
                if (!isDragging) return;
                isDragging = false;

                document.body.style.cursor = '';
                document.body.style.userSelect = '';

                // Remove all event listeners from multiple elements for better coverage
                document.removeEventListener('mousemove', handleMouseMove, true);
                document.removeEventListener('mouseup', cleanup, true);
                document.removeEventListener('keydown', handleEscape, true);
                document.removeEventListener('mouseleave', cleanup, true);
                document.documentElement.removeEventListener('mousemove', handleMouseMove, true);
                document.documentElement.removeEventListener('mouseup', cleanup, true);
                document.documentElement.removeEventListener('mouseleave', cleanup, true);
                window.removeEventListener('blur', cleanup, true);

                clearTimeout(timeoutId);
            };

            const handleEscape = (e) => {
                if (e.key === 'Escape') {
                    cleanup(e);
                }
            };

            // Auto-cleanup after 10 seconds to prevent infinite drag
            const timeoutId = setTimeout(() => cleanup(), 10000);

            // Use capture phase and multiple elements to ensure events are caught even during fast dragging
            document.addEventListener('mousemove', handleMouseMove, true);
            document.addEventListener('mouseup', cleanup, true);
            document.addEventListener('keydown', handleEscape, true);
            document.addEventListener('mouseleave', cleanup, true);

            // Also add to documentElement for better coverage
            document.documentElement.addEventListener('mousemove', handleMouseMove, true);
            document.documentElement.addEventListener('mouseup', cleanup, true);
            document.documentElement.addEventListener('mouseleave', cleanup, true);

            window.addEventListener('blur', cleanup, true); // Handle window losing focus
        });

        // Create iframe for Svelte property panel (no header)
        const rightIframe = document.createElement('iframe');
        rightIframe.loading = 'eager'; // Load immediately for instant UI
        rightIframe.src = SVELTE_PROPERTY_PANEL_URL;
        rightPanelIframe = rightIframe;
        rightIframe.style.cssText = `
            width: 100%;
            height: 100vh;
            border: none;
            background: #171717;
        `;

        // Add error handling for iframe
        rightIframe.onerror = () => {
            console.error('❌ Failed to load Svelte Property Panel from:', SVELTE_PROPERTY_PANEL_URL);
        };

        rightIframe.onload = () => {
            console.log('✅ Right panel iframe loaded, sending current data');
            // Send current data once the iframe is ready
            if (window.modlerComponents) {
                const currentSelection = window.modlerComponents.selectionController?.getSelectedObjects() || [];
                sendFullDataUpdate(currentSelection, 'panel-ready');
            }
        };

        // Clear loading content and add iframe
        svelteRightOverlay.innerHTML = '';
        svelteRightOverlay.appendChild(rightIframe);
        svelteRightOverlay.appendChild(rightResizeHandle);
    }

    /**
     * Create the Svelte main toolbar (floating, centered)
     */
    function createSvelteMainToolbar() {
        // Create main toolbar container
        svelteMainToolbar = document.createElement('div');
        svelteMainToolbar.id = 'svelte-main-toolbar';
        svelteMainToolbar.style.cssText = `
            position: absolute;
            top: 16px;
            left: 50%;
            transform: translateX(-50%);
            z-index: 100000;
            overflow: hidden;
            pointer-events: auto;
        `;

        // Load Svelte main toolbar
        mainToolbarIframe = document.createElement('iframe');
        mainToolbarIframe.src = SVELTE_MAIN_TOOLBAR_URL;
        mainToolbarIframe.style.cssText = `
            width: 250px;
            height: 64px;
            border: none;
            background: transparent;
        `;

        mainToolbarIframe.onload = () => {
            console.log('✅ Main toolbar iframe loaded successfully');
            // Verify communication channel
            if (mainToolbarIframe.contentWindow) {
                console.log('✅ Main toolbar communication channel ready');
            } else {
                console.warn('⚠️ Main toolbar communication channel not available');
            }
        };

        mainToolbarIframe.onerror = () => {
            console.error('❌ Failed to load Svelte Main Toolbar from:', SVELTE_MAIN_TOOLBAR_URL);
        };

        svelteMainToolbar.appendChild(mainToolbarIframe);
        document.body.appendChild(svelteMainToolbar);
    }

    /**
     * Create the Svelte system toolbar (floating, right of center)
     */
    function createSvelteSystemToolbar() {
        // Create system toolbar container
        svelteSystemToolbar = document.createElement('div');
        svelteSystemToolbar.id = 'svelte-system-toolbar';
        svelteSystemToolbar.style.cssText = `
            position: absolute;
            top: 16px;
            left: calc(50% + 140px);
            z-index: 100000;
            overflow: hidden;
            pointer-events: auto;
        `;

        // Load Svelte system toolbar
        systemToolbarIframe = document.createElement('iframe');
        systemToolbarIframe.src = SVELTE_SYSTEM_TOOLBAR_URL;
        systemToolbarIframe.style.cssText = `
            width: 80px;
            height: 64px;
            border: none;
            background: transparent;
        `;

        systemToolbarIframe.onload = () => {
            console.log('✅ System toolbar iframe loaded successfully');
            // Verify communication channel
            if (systemToolbarIframe.contentWindow) {
                console.log('✅ System toolbar communication channel ready');
            } else {
                console.warn('⚠️ System toolbar communication channel not available');
            }
        };

        systemToolbarIframe.onerror = () => {
            console.error('❌ Failed to load Svelte System Toolbar from:', SVELTE_SYSTEM_TOOLBAR_URL);
        };

        svelteSystemToolbar.appendChild(systemToolbarIframe);
        document.body.appendChild(svelteSystemToolbar);
    }

    /**
     * Show the Svelte UI overlays (permanent)
     */
    function showSvelteOverlays() {
        if (!svelteMainToolbar) {
            createSvelteMainToolbar();
        }
        if (!svelteSystemToolbar) {
            createSvelteSystemToolbar();
        }
        if (!svelteLeftOverlay) {
            createSvelteLeftOverlay();
        }
        if (!svelteRightOverlay) {
            createSvelteRightOverlay();
        }

        isOverlayVisible = true;

        // INSTANT layout adjustment - no delay for immediate UI response
        updateViewportArea();

        // Set up data synchronization immediately for instant UI
        setupDataSync();
    }

    /**
     * Show activation notification
     */
    function showActivationNotification(message) {
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(16, 185, 129, 0.95);
            color: white;
            padding: 20px 30px;
            border-radius: 12px;
            font-size: 18px;
            font-weight: bold;
            z-index: 999999;
            box-shadow: 0 8px 32px rgba(16, 185, 129, 0.4);
            animation: slideIn 0.3s ease;
        `;
        notification.textContent = message;
        document.body.appendChild(notification);

        // Remove after 2 seconds
        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, 2000);
    }

    /**
     * Hide the Svelte UI overlays
     */
    function hideSvelteOverlays() {
        if (!svelteLeftOverlay || !svelteRightOverlay) return;

        showActivationNotification('🔄 Returning to Standard UI...');

        svelteLeftOverlay.style.transform = 'translateX(-100%)';
        svelteRightOverlay.style.transform = 'translateX(100%)';
        isOverlayVisible = false;

        // Update button appearance
        const toggleButton = document.getElementById('svelte-ui-toggle');
        if (toggleButton) {
            toggleButton.style.background = '#10b981';
            toggleButton.innerHTML = 'S';
            toggleButton.title = 'Toggle Svelte UI Panels';
        }

        // Show the vanilla JS panels again
        const leftPanel = document.querySelector('.left-panel');
        const rightPanel = document.querySelector('.right-panel');

        if (leftPanel) {
            leftPanel.style.display = 'block';
        }
        if (rightPanel) {
            rightPanel.style.display = 'block';
        }
    }

    /**
     * Toggle the Svelte UI overlays
     */
    function toggleSvelteOverlays() {
        if (isOverlayVisible) {
            hideSvelteOverlays();
        } else {
            showSvelteOverlays();
        }
    }

    // Toggle button removed - panels are now permanent

    /**
     * Convert Three.js object to serializable data
     */
    function serializeThreeObject(obj) {
        if (!obj) return null;

        // Handle both mesh objects and object data from SceneController
        let mesh = null;
        let objectData = null;

        if (obj.mesh && obj.id) {
            // This is object data from SceneController.getAllObjects()
            objectData = obj;
            mesh = obj.mesh;
        } else if (obj.userData) {
            // This is a Three.js mesh object
            mesh = obj;
            if (window.modlerComponents?.sceneController && obj.userData?.id) {
                objectData = window.modlerComponents.sceneController.getObject(obj.userData.id);
            }
        } else {
            return null;
        }

        // Try multiple ways to detect containers
        const isContainer = mesh?.userData?.isContainer ||
                           mesh?.userData?.type === 'container' ||
                           mesh?.name?.toLowerCase().includes('container') ||
                           objectData?.isContainer ||
                           objectData?.autoLayout ||
                           false;

        // Extract serializable properties with safety checks
        const extractedId = objectData?.id || mesh?.userData?.id || mesh?.uuid;

        const serialized = {
            id: extractedId,
            name: objectData?.name || mesh?.userData?.name || mesh?.name || 'Object',
            type: objectData?.type || mesh?.userData?.type || 'object',
            isContainer: isContainer,
            position: {
                x: parseFloat((mesh?.position?.x || 0).toFixed(3)),
                y: parseFloat((mesh?.position?.y || 0).toFixed(3)),
                z: parseFloat((mesh?.position?.z || 0).toFixed(3))
            },
            rotation: {
                x: parseFloat(((mesh?.rotation?.x || 0) * 180 / Math.PI).toFixed(1)),
                y: parseFloat(((mesh?.rotation?.y || 0) * 180 / Math.PI).toFixed(1)),
                z: parseFloat(((mesh?.rotation?.z || 0) * 180 / Math.PI).toFixed(1))
            },
            dimensions: objectData?.dimensions || mesh?.userData?.dimensions || { x: 1, y: 1, z: 1 },
            parentContainer: objectData?.parentContainer || null
        };

        // Add material if available
        if (mesh?.material && (objectData?.material || mesh?.userData?.material)) {
            serialized.material = {
                color: (objectData?.material?.color || mesh?.userData?.material?.color || '#6b7280'),
                opacity: (objectData?.material?.opacity || mesh?.userData?.material?.opacity || 1.0)
            };
        }

        // Add container-specific properties
        if (isContainer) {
            // Get autoLayout from SceneController objectData (primary source) or fallback to default
            if (objectData?.autoLayout) {
                serialized.autoLayout = objectData.autoLayout;
            } else {
                // Provide default autoLayout structure if missing
                serialized.autoLayout = {
                    enabled: false,
                    direction: 'x',
                    gap: 0.2,
                    padding: { top: 0.1, bottom: 0.1, left: 0.1, right: 0.1, front: 0.1, back: 0.1 }
                };
            }

            serialized.sizingMode = objectData?.sizingMode || 'fixed';
        }

        return serialized;
    }

    /**
     * Send complete data update including selection, hierarchy, tool state, and container context
     */
    function sendFullDataUpdate(selectedObjects, updateType = 'data-update') {
        const sceneController = window.modlerComponents?.sceneController;
        const toolController = window.modlerComponents?.toolController;
        const snapController = window.modlerComponents?.snapController;
        const selectionController = window.modlerComponents?.selectionController;

        const allObjects = sceneController?.getAllObjects() || [];

        // Include current tool state in all data updates
        const currentToolState = {
            activeTool: toolController?.getActiveToolName() || 'select',
            snapEnabled: snapController?.getEnabled() || false
        };

        // Get current container context
        let containerContext = null;
        if (selectionController?.isInContainerContext()) {
            const contextMesh = selectionController.getContainerContext();
            if (contextMesh && sceneController) {
                const contextData = sceneController.getObjectByMesh(contextMesh);
                if (contextData) {
                    containerContext = {
                        containerId: contextData.id,
                        containerName: contextData.name,
                        steppedIntoAt: Date.now()
                    };
                }
            }
        }

        sendDataToSveltePanels({
            selectedObjects: selectedObjects || [],
            objectHierarchy: allObjects,
            toolState: currentToolState,
            containerContext: containerContext,
            type: updateType
        });
    }

    /**
     * Send data to Svelte panels via postMessage
     */
    function sendDataToSveltePanels(data) {
        try {
            // If Svelte detection is still in progress, queue the message
            if (!SVELTE_BASE_URL) {
                return;
            }

            // Serialize the data to avoid DataCloneError
            const serializedData = {
                ...data,
                selectedObjects: data.selectedObjects ? data.selectedObjects.map(serializeThreeObject).filter(Boolean) : [],
                objectHierarchy: data.objectHierarchy ? data.objectHierarchy.map(serializeThreeObject).filter(Boolean) : []
            };

            const messageData = {
                type: 'modler-data',
                data: serializedData
            };

            // Data sending is working correctly - no need for continuous logging

            // Send to each iframe with connection verification
            let messagesSent = 0;

            if (rightPanelIframe && rightPanelIframe.contentWindow) {
                try {
                    rightPanelIframe.contentWindow.postMessage(messageData, SVELTE_BASE_URL);
                    messagesSent++;
                } catch (error) {
                    console.error('❌ Failed to send to right panel:', error);
                }
            }

            if (leftPanelIframe && leftPanelIframe.contentWindow) {
                try {
                    leftPanelIframe.contentWindow.postMessage(messageData, SVELTE_BASE_URL);
                    messagesSent++;
                } catch (error) {
                    console.error('❌ Failed to send to left panel:', error);
                }
            }

            if (mainToolbarIframe && mainToolbarIframe.contentWindow) {
                try {
                    mainToolbarIframe.contentWindow.postMessage(messageData, SVELTE_BASE_URL);
                    messagesSent++;
                } catch (error) {
                    console.error('❌ Failed to send to main toolbar:', error);
                }
            }

            if (systemToolbarIframe && systemToolbarIframe.contentWindow) {
                try {
                    systemToolbarIframe.contentWindow.postMessage(messageData, SVELTE_BASE_URL);
                    messagesSent++;
                } catch (error) {
                    console.error('❌ Failed to send to system toolbar:', error);
                }
            }

            if (messagesSent === 0) {
                console.warn('⚠️ No messages sent - iframes may not be ready yet');
            }
        } catch (error) {
            console.error('❌ Failed to send data to Svelte panels:', error);
        }
    }

    /**
     * Handle property updates from Svelte panels
     */
    function handlePropertyUpdate(objectId, property, value, source = 'input') {
        if (!window.modlerComponents?.sceneController) {
            return;
        }

        const sceneController = window.modlerComponents.sceneController;

        // Get the object from SceneController
        const objectData = sceneController.getObject(objectId);
        if (!objectData) {
            return;
        }

        const mesh = objectData.mesh;
        if (!mesh) {
            return;
        }

        // Detect drag operations for performance optimization
        const isDragOperation = source === 'drag';

        // Handle different property types
        if (property.startsWith('position.')) {
            const axis = property.split('.')[1];
            if (mesh.position && ['x', 'y', 'z'].includes(axis)) {
                mesh.position[axis] = value;
                // Use immediate sync for drag operations, standard sync for others
                completeObjectModification(mesh, 'transform', isDragOperation);
            }
        } else if (property.startsWith('rotation.')) {
            const axis = property.split('.')[1];
            if (mesh.rotation && ['x', 'y', 'z'].includes(axis)) {
                // Convert degrees to radians
                mesh.rotation[axis] = value * Math.PI / 180;
                // Use immediate sync for drag operations, standard sync for others
                completeObjectModification(mesh, 'transform', isDragOperation);
            }
        } else if (property.startsWith('dimensions.')) {
            // Handle dimension changes (requires geometry updates)
            const axis = property.split('.')[1];
            if (['x', 'y', 'z'].includes(axis)) {

                // Use SceneController for geometry modifications if available
                const sceneController = window.modlerComponents?.sceneController;
                if (sceneController && sceneController.updateObjectDimensions) {
                    sceneController.updateObjectDimensions(objectId, axis, value);
                } else {
                    // Fallback: Basic scaling approach (less accurate but functional)
                    const currentScale = mesh.scale[axis];
                    const scaleFactor = value / currentScale;
                    mesh.scale[axis] = value;

                    // Update userData for dimension tracking
                    if (!mesh.userData.dimensions) mesh.userData.dimensions = { x: 1, y: 1, z: 1 };
                    mesh.userData.dimensions[axis] = value;
                }

                // Trigger mesh synchronization for geometry changes
                completeObjectModification(mesh, 'geometry', true);
            }
        } else if (property.startsWith('material.')) {
            // Handle material property changes
            const materialProp = property.split('.')[1];

            if (mesh.material) {
                if (materialProp === 'color') {
                    // Handle color updates (convert hex string to Three.js color)
                    const colorValue = typeof value === 'string' ? value.replace('#', '0x') : value;
                    mesh.material.color.setHex(colorValue);
                } else if (materialProp === 'opacity') {
                    // Handle opacity updates
                    mesh.material.opacity = value;
                    mesh.material.transparent = value < 1;
                }
                mesh.material.needsUpdate = true;

                // Trigger mesh synchronization for material changes
                completeObjectModification(mesh, 'material', true);
            }
        } else if (property.startsWith('autoLayout.') || property === 'sizingMode') {
            // Handle container layout properties - route to PropertyUpdateHandler

            // Validate layout direction values
            if (property === 'autoLayout.direction' && (!value || !['x', 'y', 'z'].includes(value))) {
                console.error('❌ Invalid layout direction value:', value);
                return;
            }

            const propertyUpdateHandler = window.modlerComponents?.propertyUpdateHandler;
            if (propertyUpdateHandler && propertyUpdateHandler.handleContainerLayoutPropertyChange) {
                propertyUpdateHandler.handleContainerLayoutPropertyChange(objectId, property, value);
            } else {
                console.warn('⚠️ PropertyUpdateHandler not available for layout property:', property);
            }

            // Trigger mesh synchronization for layout changes
            completeObjectModification(mesh, 'layout', true);
        }

        // Refresh property panel with optimized delay for drag operations
        const refreshDelay = isDragOperation ? 8 : 50; // 8ms for 120fps during drag, 50ms for others
        setTimeout(() => refreshSveltePropertyPanel(), refreshDelay);
    }

    /**
     * Complete object modification using the exact pattern from move tool
     * This ensures selection boxes stay synchronized during real-time updates
     */
    function completeObjectModification(mesh, changeType = 'transform', immediateVisuals = false) {
        const meshSynchronizer = window.modlerComponents?.meshSynchronizer;

        // Use exact pattern from move-tool.js:227 for smooth real-time updates
        if (meshSynchronizer) {
            meshSynchronizer.syncAllRelatedMeshes(mesh, changeType, immediateVisuals);
        } else {
            // Fallback to legacy sync method (same as move tool)
            window.CameraMathUtils.syncSelectionWireframes(mesh);
        }
    }

    /**
     * Refresh Svelte property panel with current selection data
     * Called when objects are modified by tools to keep property panel in sync
     */
    function refreshSveltePropertyPanel() {
        const selectionController = window.modlerComponents?.selectionController;
        if (selectionController) {
            const selectedObjects = selectionController.getSelectedObjects();
            sendFullDataUpdate(selectedObjects, 'object-modified');
        }
    }


    // Throttling for property panel updates during real-time operations
    let lastPanelUpdateTime = 0;
    const PANEL_UPDATE_THROTTLE = 8; // 120fps max updates (optimized for drag operations)
    const PANEL_UPDATE_THROTTLE_NORMAL = 16; // 60fps for non-drag operations

    /**
     * Step into container by ID (for direct communication)
     */
    window.stepIntoContainerById = function(containerId) {
        const selectionController = window.modlerComponents?.selectionController;
        const sceneController = window.modlerComponents?.sceneController;

        if (selectionController && sceneController) {
            const containerData = sceneController.getObject(containerId);
            if (containerData && containerData.mesh) {
                selectionController.stepIntoContainer(containerData.mesh);
                return true;
            }
        }
        return false;
    };

    /**
     * Handle object selection from hierarchy panel
     */
    function handleObjectSelection(objectId, parentContainer = null) {
        const selectionController = window.modlerComponents?.selectionController;
        const sceneController = window.modlerComponents?.sceneController;

        if (selectionController && sceneController) {
            // If object is a child of a container, step into the container first
            if (parentContainer) {
                const containerData = sceneController.getObject(parentContainer);
                if (containerData && containerData.mesh) {
                    // Step into the parent container
                    selectionController.stepIntoContainer(containerData.mesh);
                }
            }

            // Get object data from SceneController
            const objectData = sceneController.getObject(objectId);
            if (objectData && objectData.mesh) {
                // Clear current selection
                selectionController.clearSelection();

                // If object has a parent container, select the container instead of the child
                if (parentContainer) {
                    const containerData = sceneController.getObject(parentContainer);
                    if (containerData && containerData.mesh) {
                        selectionController.select(containerData.mesh);
                    } else {
                        // Fallback: select the child object if container not found
                        selectionController.select(objectData.mesh);
                    }
                } else {
                    // No parent container, select the object directly
                    selectionController.select(objectData.mesh);
                }
            } else {
            }
        } else {
        }
    }

    /**
     * Central object modification notification system
     * Called by MovementUtils after any tool modifies objects
     * Provides unified property panel sync across all tools
     */
    window.notifyObjectModified = function(object, modificationType = 'geometry') {

        // Update legacy HTML property panel (backward compatibility)
        if (window.updatePropertyPanelFromObject) {
            window.updatePropertyPanelFromObject(object);
        }

        // Throttle Svelte panel updates with optimized rates for different operations
        const now = Date.now();
        const isDragOperation = modificationType === 'transform';
        const throttleDelay = isDragOperation ? PANEL_UPDATE_THROTTLE : PANEL_UPDATE_THROTTLE_NORMAL;

        if (isDragOperation && now - lastPanelUpdateTime < throttleDelay) {
            return; // Skip this update to prevent spam
        }
        lastPanelUpdateTime = now;

        // Update both selection and hierarchy data
        refreshSveltePropertyPanel();
    };

    /**
     * Object creation/deletion notification system
     * Called when objects are created or deleted in the scene
     */
    window.notifyObjectHierarchyChanged = function() {
        const selectionController = window.modlerComponents?.selectionController;
        const selectedObjects = selectionController?.getSelectedObjects() || [];
        sendFullDataUpdate(selectedObjects, 'hierarchy-changed');
    };

    /**
     * Tool state change notification system
     * Called when tools are activated by keyboard shortcuts or direct activation
     */
    window.notifyToolStateChanged = function() {
        sendToolStateUpdate();
    };

    /**
     * Set up toolbar state synchronization between main app and Svelte UI
     */
    function setupToolbarStateSynchronization() {
        const toolController = window.modlerComponents?.toolController;
        const snapController = window.modlerComponents?.snapController;

        if (!toolController || !snapController) {
            console.warn('⚠️ Missing controllers for toolbar synchronization');
            return;
        }


        // Hook into tool controller to detect tool changes
        const originalSetActiveTool = toolController.setActiveTool;
        if (originalSetActiveTool) {
            toolController.setActiveTool = function(toolName) {
                // Call original method
                const result = originalSetActiveTool.call(this, toolName);

                // Sync to Svelte panels
                sendToolStateUpdate();

                return result;
            };
        }

        // Hook into snap controller to detect snap changes
        const originalSetEnabled = snapController.setEnabled;
        if (originalSetEnabled) {
            snapController.setEnabled = function(enabled) {
                // Call original method
                const result = originalSetEnabled.call(this, enabled);

                // Sync to Svelte panels
                sendToolStateUpdate();

                // Update toolbar button visual state
                const snapButton = document.getElementById('snap-toggle');
                if (snapButton) {
                    if (enabled) {
                        snapButton.classList.add('active');
                    } else {
                        snapButton.classList.remove('active');
                    }
                }

                return result;
            };
        }

        // Send initial toolbar state
        sendToolStateUpdate();
    }

    /**
     * Send current tool state to Svelte panels
     */
    function sendToolStateUpdate() {
        const toolController = window.modlerComponents?.toolController;
        const snapController = window.modlerComponents?.snapController;

        if (!toolController || !snapController) return;

        const toolState = {
            activeTool: toolController.getActiveToolName() || 'select',
            snapEnabled: snapController.getEnabled()
        };


        sendDataToSveltePanels({
            type: 'tool-state-update',
            toolState: toolState
        });
    }

    /**
     * Handle tool activation from Svelte panels
     */
    function handleToolActivation(toolName) {
        try {
            if (window.activateTool) {
                window.activateTool(toolName);
            } else if (window.keyboardShortcuts) {
                window.keyboardShortcuts.activateTool(toolName);
            } else {
                console.error('❌ No tool activation method available');
                return;
            }

            // Force immediate tool state update after activation
            setTimeout(() => {
                sendToolStateUpdate();
            }, 50); // Small delay to ensure tool activation completes

        } catch (error) {
            console.error('❌ Tool activation failed:', error);
        }
    }

    /**
     * Handle snap toggle from Svelte panels
     */
    function handleSnapToggle() {

        if (window.toggleSnapping) {
            window.toggleSnapping();
        } else if (window.keyboardShortcuts) {
            window.keyboardShortcuts.toggleSnapping();
        }
    }

    /**
     * Handle object move to container from Svelte drag and drop
     */
    function handleObjectMoveToContainer(objectId, targetContainerId) {
        try {
            console.log('🚚 Moving object to container:', objectId, 'to', targetContainerId);

            if (!window.modlerComponents?.sceneController || !window.modlerComponents?.containerCrudManager) {
                console.error('Required components not available for move operation');
                return;
            }

            const sceneController = window.modlerComponents.sceneController;
            const containerManager = window.modlerComponents.containerCrudManager;

            const objectData = sceneController.getObject(objectId);
            const targetContainer = sceneController.getObject(targetContainerId);

            if (!objectData) {
                console.error('Object not found:', objectId);
                return;
            }

            if (!targetContainer || !targetContainer.isContainer) {
                console.error('Target container not found or invalid:', targetContainerId);
                return;
            }

            // Remove from current container if needed
            if (objectData.parentContainer) {
                const removeSuccess = containerManager.removeObjectFromContainer(objectData);
                if (!removeSuccess) {
                    console.error('Failed to remove object from current container');
                    return;
                }
            }

            // Add to new container
            const success = containerManager.addObjectToContainer(objectData, targetContainer);
            if (success) {
                console.log('✅ Successfully moved object to container');

                // Show auto layout notification if container has layout enabled
                if (targetContainer.autoLayout?.enabled) {
                    console.log(`📐 Object moved to ${targetContainer.autoLayout.direction?.toUpperCase()}-axis layout container`);
                }
            } else {
                console.error('❌ Failed to move object to container');
            }

        } catch (error) {
            console.error('Error moving object to container:', error);
        }
    }

    /**
     * Handle object move to root from Svelte drag and drop
     */
    function handleObjectMoveToRoot(objectId) {
        try {
            console.log('🚚 Moving object to root:', objectId);

            if (!window.modlerComponents?.sceneController || !window.modlerComponents?.containerCrudManager) {
                console.error('Required components not available for move operation');
                return;
            }

            const sceneController = window.modlerComponents.sceneController;
            const containerManager = window.modlerComponents.containerCrudManager;

            const objectData = sceneController.getObject(objectId);

            if (!objectData) {
                console.error('Object not found:', objectId);
                return;
            }

            if (!objectData.parentContainer) {
                console.log('Object is already at root level');
                return;
            }

            // Remove from current container
            const success = containerManager.removeObjectFromContainer(objectData);
            if (success) {
                console.log('✅ Successfully moved object to root level');
            } else {
                console.error('❌ Failed to move object to root level');
            }

        } catch (error) {
            console.error('Error moving object to root:', error);
        }
    }

    /**
     * Handle object reordering at root level from Svelte drag and drop
     */
    function handleObjectReorderAtRoot(draggedObjectId, targetObjectId, position) {
        try {
            console.log('🔄 Reordering object at root:', draggedObjectId, position, targetObjectId);

            if (!window.modlerComponents?.sceneController) {
                console.error('SceneController not available for reorder operation');
                return;
            }

            const sceneController = window.modlerComponents.sceneController;
            const draggedObject = sceneController.getObject(draggedObjectId);
            const targetObject = sceneController.getObject(targetObjectId);

            if (!draggedObject || !targetObject) {
                console.error('Objects not found for reordering:', { draggedObject, targetObject });
                return;
            }

            // For now, we'll just trigger a hierarchy update since the UI handles the visual order
            // In a more advanced implementation, we could modify the actual object order in the scene
            console.log('✅ Root reordering requested - UI will handle visual order');

            // Trigger hierarchy update
            if (window.notifyObjectHierarchyChanged) {
                window.notifyObjectHierarchyChanged();
            }

        } catch (error) {
            console.error('Error reordering object at root:', error);
        }
    }

    /**
     * Handle object reordering within container from Svelte drag and drop
     */
    function handleObjectReorderInContainer(draggedObjectId, targetObjectId, containerId, position) {
        try {
            console.log('🔄 Reordering object in container:', draggedObjectId, position, targetObjectId, 'container:', containerId);

            if (!window.modlerComponents?.sceneController || !window.modlerComponents?.containerCrudManager) {
                console.error('Required components not available for container reorder operation');
                return;
            }

            const sceneController = window.modlerComponents.sceneController;
            const containerManager = window.modlerComponents.containerCrudManager;

            const draggedObject = sceneController.getObject(draggedObjectId);
            const targetObject = sceneController.getObject(targetObjectId);
            const container = sceneController.getObject(containerId);

            if (!draggedObject || !targetObject || !container) {
                console.error('Objects not found for container reordering:', { draggedObject, targetObject, container });
                return;
            }

            // For now, we'll just trigger a hierarchy update and container resize
            // In a more advanced implementation, we could modify the actual object order within the container
            console.log('✅ Container reordering requested - UI will handle visual order');

            // Trigger container recalculation if it has auto-layout
            if (container.autoLayout?.enabled) {
                // Preserve container position during reordering to avoid moving child objects
                containerManager.resizeContainerToFitChildren(container, null, true);
            }

            // Trigger hierarchy update
            if (window.notifyObjectHierarchyChanged) {
                window.notifyObjectHierarchyChanged();
            }

        } catch (error) {
            console.error('Error reordering object in container:', error);
        }
    }

    /**
     * Set up data synchronization with main app
     */
    function setupDataSync() {
        // Set up postMessage listener for incoming property updates from Svelte (always needed)
        window.addEventListener('message', (event) => {
            // Verify origin for security (allow detected Svelte dev server)
            if (!SVELTE_BASE_URL || event.origin !== SVELTE_BASE_URL) {
                return;
            }

            if (event.data && event.data.type === 'property-update') {
                const { objectId, property, value, source } = event.data.data;
                handlePropertyUpdate(objectId, property, value, source);
            } else if (event.data && event.data.type === 'object-select') {
                // Handle object selection from hierarchy
                const { objectId, parentContainer } = event.data.data;
                handleObjectSelection(objectId, parentContainer);
            } else if (event.data && event.data.type === 'tool-activate') {
                // Handle tool activation from Svelte UI
                const { toolName } = event.data.data;
                handleToolActivation(toolName);
            } else if (event.data && event.data.type === 'snap-toggle') {
                // Handle snap toggle from Svelte UI
                handleSnapToggle();
            } else if (event.data && event.data.type === 'object-move-to-container') {
                // Handle drag and drop move to container
                const { objectId, targetContainerId } = event.data.data;
                handleObjectMoveToContainer(objectId, targetContainerId);
            } else if (event.data && event.data.type === 'object-move-to-root') {
                // Handle drag and drop move to root
                const { objectId } = event.data.data;
                handleObjectMoveToRoot(objectId);
            } else if (event.data && event.data.type === 'object-reorder-root') {
                // Handle reordering objects at root level
                const { draggedObjectId, targetObjectId, position } = event.data.data;
                handleObjectReorderAtRoot(draggedObjectId, targetObjectId, position);
            } else if (event.data && event.data.type === 'object-reorder-container') {
                // Handle reordering objects within a container
                const { draggedObjectId, targetObjectId, containerId, position } = event.data.data;
                handleObjectReorderInContainer(draggedObjectId, targetObjectId, containerId, position);
            }
        });

        // Wait for modlerComponents to be available and set up synchronization
        waitForModlerComponents();
    }

    /**
     * Wait for modlerComponents to be available and set up synchronization
     */
    function waitForModlerComponents() {
        const maxAttempts = 50; // 5 seconds maximum wait
        let attempts = 0;

        const checkComponents = () => {
            attempts++;

            if (window.modlerComponents) {
                    initializeComponentSync();
                return;
            }

            if (attempts < maxAttempts) {
                setTimeout(checkComponents, 100);
            } else {
                console.warn('⚠️ modlerComponents not found after 5 seconds, will retry when panels load');
            }
        };

        checkComponents();
    }

    /**
     * Initialize component synchronization once modlerComponents is available
     */
    function initializeComponentSync() {
        const selectionController = window.modlerComponents.selectionController;
        if (selectionController) {
            // Set up the selection callback to send data to Svelte panels
            selectionController.selectionChangeCallback = (selectedObjects) => {
                sendFullDataUpdate(selectedObjects, 'selection-change');
            };
        }

        // Set up toolbar state synchronization
        setupToolbarStateSynchronization();

        // Send initial state immediately
        setTimeout(() => {
            const initialSelection = window.modlerComponents.selectionController?.getSelectedObjects() || [];
            sendFullDataUpdate(initialSelection, 'initial-state');
        }, 50);

        // Send periodic updates less frequently to ensure panels stay in sync
        setInterval(() => {
            if (window.modlerComponents) {
                const currentSelection = window.modlerComponents.selectionController?.getSelectedObjects() || [];
                sendFullDataUpdate(currentSelection, 'periodic-update');
            }
        }, 10000); // Every 10 seconds
    }

    /**
     * Initialize the integration with immediate UI display
     */
    async function initialize() {
        // Wait for DOM to be ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initialize);
            return;
        }

        // Show UI panels immediately with loading state
        showSvelteOverlaysImmediate();

        // Detect Svelte dev server port asynchronously
        const portDetected = await detectSveltePort();
        if (!portDetected) {
            console.error('❌ Cannot initialize without Svelte dev server');
            showSvelteError();
            return;
        }

        // Load Svelte content into existing panels
        loadSvelteContent();
    }

    /**
     * Show panel containers immediately with loading state
     */
    function showSvelteOverlaysImmediate() {
        // Create panel containers immediately
        createPanelContainers();
        isOverlayVisible = true;
        updateViewportArea();
    }

    /**
     * Create empty panel containers for instant display
     */
    function createPanelContainers() {
        // Create left panel container
        if (!svelteLeftOverlay) {
            svelteLeftOverlay = document.createElement('div');
            svelteLeftOverlay.id = 'svelte-left-overlay';
            svelteLeftOverlay.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 280px;
                height: 100vh;
                background: #171717;
                border-right: 1px solid #2E2E2E;
                z-index: 99999;
                overflow: hidden;
                display: flex;
                align-items: center;
                justify-content: center;
                color: #888;
                font-size: 14px;
            `;
            svelteLeftOverlay.innerHTML = '<div>Loading...</div>';
            document.body.appendChild(svelteLeftOverlay);
        }

        // Create right panel container
        if (!svelteRightOverlay) {
            svelteRightOverlay = document.createElement('div');
            svelteRightOverlay.id = 'svelte-right-overlay';
            svelteRightOverlay.style.cssText = `
                position: fixed;
                top: 0;
                right: 0;
                width: 320px;
                height: 100vh;
                background: #171717;
                border-left: 1px solid #2E2E2E;
                z-index: 99999;
                overflow: hidden;
                display: flex;
                align-items: center;
                justify-content: center;
                color: #888;
                font-size: 14px;
            `;
            svelteRightOverlay.innerHTML = '<div>Loading...</div>';
            document.body.appendChild(svelteRightOverlay);
        }
    }

    /**
     * Load Svelte content into existing containers
     */
    function loadSvelteContent() {
        // Load left panel content
        if (svelteLeftOverlay && SVELTE_LEFT_PANEL_URL) {
            createSvelteLeftOverlay();
        }

        // Load right panel content
        if (svelteRightOverlay && SVELTE_PROPERTY_PANEL_URL) {
            createSvelteRightOverlay();
        }

        // Load toolbars
        if (!svelteMainToolbar) {
            createSvelteMainToolbar();
        }
        if (!svelteSystemToolbar) {
            createSvelteSystemToolbar();
        }

        // Set up data synchronization
        setupDataSync();
    }

    /**
     * Show error state in panels
     */
    function showSvelteError() {
        if (svelteLeftOverlay) {
            svelteLeftOverlay.innerHTML = '<div style="color: #ff6666;">Dev server not found</div>';
        }
        if (svelteRightOverlay) {
            svelteRightOverlay.innerHTML = '<div style="color: #ff6666;">Dev server not found</div>';
        }
    }

    // Start initialization
    initialize();

})();