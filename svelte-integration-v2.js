/**
 * Modler V2 - Svelte UI Integration Script V2
 * Replaces both left and right panels with Svelte components
 */

(function() {
    'use strict';

    // Configuration
    const SVELTE_PROPERTY_PANEL_URL = 'http://localhost:5174/property-panel';
    const SVELTE_LEFT_PANEL_URL = 'http://localhost:5174/left-panel';
    const INTEGRATION_ENABLED = window.location.hostname === 'localhost' || window.location.protocol === 'file:';

    // Debug information
    console.log('🎨 Svelte Integration Script Loaded');

    // Only activate on localhost for development
    if (!INTEGRATION_ENABLED) {
        console.warn('❌ Svelte UI integration disabled - not on localhost or file:// protocol');
        return;
    }


    let svelteRightOverlay = null;
    let svelteLeftOverlay = null;
    let isOverlayVisible = false;
    let rightPanelIframe = null;
    let leftPanelIframe = null;

    /**
     * Update the viewport area based on panel sizes
     */
    function updateViewportArea() {
        const viewportArea = document.querySelector('.viewport-area');
        if (!viewportArea) return;

        const leftWidth = svelteLeftOverlay ? parseInt(window.getComputedStyle(svelteLeftOverlay).width, 10) : 0;
        const rightWidth = svelteRightOverlay ? parseInt(window.getComputedStyle(svelteRightOverlay).width, 10) : 0;

        viewportArea.style.left = leftWidth + 'px';
        viewportArea.style.right = rightWidth + 'px';
    }

    /**
     * Create the Svelte left panel overlay
     */
    function createSvelteLeftOverlay() {
        // Create LEFT overlay container (Object List & Settings)
        svelteLeftOverlay = document.createElement('div');
        svelteLeftOverlay.id = 'svelte-left-overlay';
        svelteLeftOverlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 280px;
            height: 100vh;
            background: #252525;
            border-right: 2px solid #404040;
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
            document.body.style.cursor = 'ew-resize';
            document.body.style.userSelect = 'none';

            const startX = e.clientX;
            const startWidth = parseInt(window.getComputedStyle(svelteLeftOverlay).width, 10);
            let isDragging = true;

            const handleMouseMove = (e) => {
                if (!isDragging) return;

                const width = startWidth + (e.clientX - startX);
                const minWidth = 200;
                const maxWidth = window.innerWidth * 0.5;
                const clampedWidth = Math.max(minWidth, Math.min(maxWidth, width));

                svelteLeftOverlay.style.width = clampedWidth + 'px';
                updateViewportArea();
            };

            const cleanup = () => {
                if (!isDragging) return;
                isDragging = false;

                document.body.style.cursor = '';
                document.body.style.userSelect = '';

                document.removeEventListener('mousemove', handleMouseMove);
                document.removeEventListener('mouseup', cleanup);
                document.removeEventListener('mouseleave', cleanup);
                document.removeEventListener('keydown', handleEscape);
                document.removeEventListener('visibilitychange', cleanup);

                clearTimeout(timeoutId);
            };

            const handleEscape = (e) => {
                if (e.key === 'Escape') {
                    cleanup();
                }
            };

            // Auto-cleanup after 30 seconds to prevent infinite drag
            const timeoutId = setTimeout(cleanup, 30000);

            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', cleanup);
            document.addEventListener('mouseleave', cleanup); // Handle mouse leaving window
            document.addEventListener('keydown', handleEscape); // Handle escape key
            document.addEventListener('visibilitychange', cleanup); // Handle window losing focus
        });

        // Create iframe for Svelte left panel
        const leftIframe = document.createElement('iframe');
        leftIframe.src = SVELTE_LEFT_PANEL_URL;
        leftPanelIframe = leftIframe;
        leftIframe.style.cssText = `
            width: 100%;
            height: 100vh;
            border: none;
            background: #252525;
        `;

        // Add error handling for iframe
        leftIframe.onerror = () => {
            console.error('❌ Failed to load Svelte Left Panel from:', SVELTE_LEFT_PANEL_URL);
        };

        leftIframe.onload = () => {
            // Left panel loaded successfully
        };

        svelteLeftOverlay.appendChild(leftIframe);
        svelteLeftOverlay.appendChild(leftResizeHandle);
        document.body.appendChild(svelteLeftOverlay);
    }

    /**
     * Create the Svelte right panel overlay
     */
    function createSvelteRightOverlay() {
        // Create RIGHT overlay container (Property Panel)
        svelteRightOverlay = document.createElement('div');
        svelteRightOverlay.id = 'svelte-right-overlay';
        svelteRightOverlay.style.cssText = `
            position: fixed;
            top: 0;
            right: 0;
            width: 320px;
            height: 100vh;
            background: #1a1a1a;
            border-left: 2px solid #404040;
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
            document.body.style.cursor = 'ew-resize';
            document.body.style.userSelect = 'none';

            const startX = e.clientX;
            const startWidth = parseInt(window.getComputedStyle(svelteRightOverlay).width, 10);
            let isDragging = true;

            const handleMouseMove = (e) => {
                if (!isDragging) return;

                const width = startWidth - (e.clientX - startX); // Subtract for right panel
                const minWidth = 250;
                const maxWidth = window.innerWidth * 0.5;
                const clampedWidth = Math.max(minWidth, Math.min(maxWidth, width));

                svelteRightOverlay.style.width = clampedWidth + 'px';
                updateViewportArea();
            };

            const cleanup = () => {
                if (!isDragging) return;
                isDragging = false;

                document.body.style.cursor = '';
                document.body.style.userSelect = '';

                document.removeEventListener('mousemove', handleMouseMove);
                document.removeEventListener('mouseup', cleanup);
                document.removeEventListener('mouseleave', cleanup);
                document.removeEventListener('keydown', handleEscape);
                document.removeEventListener('visibilitychange', cleanup);

                clearTimeout(timeoutId);
            };

            const handleEscape = (e) => {
                if (e.key === 'Escape') {
                    cleanup();
                }
            };

            // Auto-cleanup after 30 seconds to prevent infinite drag
            const timeoutId = setTimeout(cleanup, 30000);

            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', cleanup);
            document.addEventListener('mouseleave', cleanup); // Handle mouse leaving window
            document.addEventListener('keydown', handleEscape); // Handle escape key
            document.addEventListener('visibilitychange', cleanup); // Handle window losing focus
        });

        // Create iframe for Svelte property panel (no header)
        const rightIframe = document.createElement('iframe');
        rightIframe.src = SVELTE_PROPERTY_PANEL_URL;
        rightPanelIframe = rightIframe;
        rightIframe.style.cssText = `
            width: 100%;
            height: 100vh;
            border: none;
            background: #1a1a1a;
        `;

        // Add error handling for iframe
        rightIframe.onerror = () => {
            console.error('❌ Failed to load Svelte Property Panel from:', SVELTE_PROPERTY_PANEL_URL);
        };

        rightIframe.onload = () => {
            // Property panel loaded successfully
        };

        svelteRightOverlay.appendChild(rightIframe);
        svelteRightOverlay.appendChild(rightResizeHandle);
        document.body.appendChild(svelteRightOverlay);
    }

    /**
     * Show the Svelte UI overlays (permanent)
     */
    function showSvelteOverlays() {
        if (!svelteLeftOverlay) {
            createSvelteLeftOverlay();
        }
        if (!svelteRightOverlay) {
            createSvelteRightOverlay();
        }

        isOverlayVisible = true;

        // Update viewport area to account for panel sizes
        setTimeout(() => {
            updateViewportArea();
        }, 100);

        // Set up data synchronization when panels are shown
        setTimeout(() => {
            setupDataSync();
        }, 500);
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

        console.log('🔧 serializeThreeObject: Processing object:', obj.name, 'userData:', obj.userData);

        // Get the actual object data from SceneController if available
        let objectData = null;
        if (window.modlerComponents?.sceneController && obj.userData?.id) {
            objectData = window.modlerComponents.sceneController.getObject(obj.userData.id);
            console.log('🔧 serializeThreeObject: SceneController objectData:', objectData);
        }

        // Try multiple ways to detect containers
        const isContainer = obj.userData?.isContainer ||
                           obj.userData?.type === 'container' ||
                           obj.name?.toLowerCase().includes('container') ||
                           objectData?.isContainer ||
                           objectData?.autoLayout ||
                           false;

        console.log('🔧 serializeThreeObject: Container detection:', {
            userDataIsContainer: obj.userData?.isContainer,
            typeIsContainer: obj.userData?.type === 'container',
            nameIncludesContainer: obj.name?.toLowerCase().includes('container'),
            objectDataIsContainer: objectData?.isContainer,
            objectDataHasAutoLayout: !!objectData?.autoLayout,
            finalIsContainer: isContainer
        });

        // Extract serializable properties
        const serialized = {
            id: obj.userData?.id || obj.uuid,
            name: objectData?.name || obj.userData?.name || obj.name || 'Object',
            type: objectData?.type || obj.userData?.type || 'object',
            isContainer: isContainer,
            position: {
                x: parseFloat(obj.position.x.toFixed(3)),
                y: parseFloat(obj.position.y.toFixed(3)),
                z: parseFloat(obj.position.z.toFixed(3))
            },
            rotation: {
                x: parseFloat((obj.rotation.x * 180 / Math.PI).toFixed(1)),
                y: parseFloat((obj.rotation.y * 180 / Math.PI).toFixed(1)),
                z: parseFloat((obj.rotation.z * 180 / Math.PI).toFixed(1))
            },
            dimensions: objectData?.dimensions || obj.userData?.dimensions || { x: 1, y: 1, z: 1 }
        };

        // Add material if available
        if (obj.material && (objectData?.material || obj.userData?.material)) {
            serialized.material = {
                color: (objectData?.material?.color || obj.userData?.material?.color || '#6b7280'),
                opacity: (objectData?.material?.opacity || obj.userData?.material?.opacity || 1.0)
            };
        }

        // Add container-specific properties
        if (isContainer) {
            console.log('🔧 serializeThreeObject: Adding container properties from objectData:', objectData?.autoLayout);

            // Get autoLayout from SceneController objectData (primary source) or fallback to default
            if (objectData?.autoLayout) {
                serialized.autoLayout = objectData.autoLayout;
                console.log('🔧 serializeThreeObject: Using SceneController autoLayout:', serialized.autoLayout);
            } else {
                // Provide default autoLayout structure if missing
                serialized.autoLayout = {
                    enabled: false,
                    direction: 'x',
                    gap: 0.2,
                    padding: { top: 0.1, bottom: 0.1, left: 0.1, right: 0.1, front: 0.1, back: 0.1 }
                };
                console.log('🔧 serializeThreeObject: Using default autoLayout:', serialized.autoLayout);
            }

            serialized.sizingMode = objectData?.sizingMode || 'fixed';
        }

        console.log('🔧 serializeThreeObject: Final serialized object:', serialized);
        return serialized;
    }

    /**
     * Send data to Svelte panels via postMessage
     */
    function sendDataToSveltePanels(data) {
        try {
            // Serialize the data to avoid DataCloneError
            const serializedData = {
                ...data,
                selectedObjects: data.selectedObjects ? data.selectedObjects.map(serializeThreeObject) : []
            };

            console.log('📤 Integration: Sending data to Svelte panels:', serializedData);

            if (rightPanelIframe && rightPanelIframe.contentWindow) {
                rightPanelIframe.contentWindow.postMessage({
                    type: 'modler-data',
                    data: serializedData
                }, '*'); // Use '*' for development - iframe origin is correct
                console.log('📤 Integration: Sent to right panel iframe');
            }

            if (leftPanelIframe && leftPanelIframe.contentWindow) {
                leftPanelIframe.contentWindow.postMessage({
                    type: 'modler-data',
                    data: serializedData
                }, '*'); // Use '*' for development - iframe origin is correct
                console.log('📤 Integration: Sent to left panel iframe');
            }
        } catch (error) {
            console.error('❌ Failed to send data to Svelte panels:', error);
        }
    }

    /**
     * Handle property updates from Svelte panels
     */
    function handlePropertyUpdate(objectId, property, value) {
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

        // Handle different property types
        if (property.startsWith('position.')) {
            const axis = property.split('.')[1];
            if (mesh.position && ['x', 'y', 'z'].includes(axis)) {
                mesh.position[axis] = value;
            }
        } else if (property.startsWith('rotation.')) {
            const axis = property.split('.')[1];
            if (mesh.rotation && ['x', 'y', 'z'].includes(axis)) {
                // Convert degrees to radians
                mesh.rotation[axis] = value * Math.PI / 180;
            }
        } else if (property.startsWith('dimensions.')) {
            // Handle dimension changes (more complex - requires geometry updates)
            console.warn('Dimension changes not yet implemented');
        } else if (property.startsWith('autoLayout.')) {
            // Handle container layout properties
            console.log('AutoLayout property update:', property, value);
        }

        // Notify Three.js that object has been transformed
        if (window.modlerComponents.sceneController?.notifyObjectTransformChanged) {
            window.modlerComponents.sceneController.notifyObjectTransformChanged(objectId);
        }
    }

    /**
     * Set up data synchronization with main app
     */
    function setupDataSync() {
        // Check if modlerComponents is available
        if (typeof window !== 'undefined' && window.modlerComponents) {
            console.log('🔧 Integration: modlerComponents found, setting up data sync');

            // Set up postMessage listener for incoming property updates from Svelte
            window.addEventListener('message', (event) => {
                // Verify origin for security (allow localhost for development)
                if (event.origin !== 'http://localhost:5174') {
                    return;
                }

                if (event.data && event.data.type === 'property-update') {
                    const { objectId, property, value } = event.data.data;
                    handlePropertyUpdate(objectId, property, value);
                }
            });

            // Initialize the ThreeJSBridge by setting up the selection callback directly
            console.log('🔗 Integration: Setting up selection callback for ThreeJSBridge');

            const selectionController = window.modlerComponents.selectionController;
            if (selectionController) {
                // Set up the selection callback to send data to Svelte panels
                selectionController.selectionChangeCallback = (selectedObjects) => {
                    console.log('🔧 Integration: Selection changed, sending to Svelte panels:', selectedObjects.length);
                    sendDataToSveltePanels({
                        selectedObjects: selectedObjects,
                        type: 'selection-change'
                    });
                };
                console.log('🔗 Integration: Selection callback set up successfully');
            } else {
                console.warn('⚠️ selectionController not found in modlerComponents');
            }

            // Send initial state
            setTimeout(() => {
                const initialSelection = window.modlerComponents.selectionController?.getSelectedObjects() || [];
                sendDataToSveltePanels({
                    selectedObjects: initialSelection,
                    type: 'initial-state'
                });
            }, 1000);
        } else {
            console.warn('⚠️ modlerComponents not found - data sync disabled');
        }
    }

    /**
     * Initialize the integration
     */
    function initialize() {
        // Wait for DOM to be ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initialize);
            return;
        }

        // Automatically show Svelte panels (permanent)
        showSvelteOverlays();
    }

    // Start initialization
    initialize();

})();