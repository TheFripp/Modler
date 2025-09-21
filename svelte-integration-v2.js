/**
 * Modler V2 - Svelte UI Integration Script V2
 * Replaces both left and right panels with Svelte components
 */

(function() {
    'use strict';

    // Configuration
    const SVELTE_PROPERTY_PANEL_URL = 'http://localhost:5173/property-panel';
    const SVELTE_LEFT_PANEL_URL = 'http://localhost:5173/left-panel';
    const INTEGRATION_ENABLED = window.location.hostname === 'localhost' || window.location.protocol === 'file:';


    // Only activate on localhost for development
    if (!INTEGRATION_ENABLED) {
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
            border-right: 1px solid #404040;
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

                document.removeEventListener('mousemove', handleMouseMove, true);
                document.removeEventListener('mouseup', cleanup, true);
                document.removeEventListener('keydown', handleEscape, true);
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

            // Use capture phase to ensure events are caught
            document.addEventListener('mousemove', handleMouseMove, true);
            document.addEventListener('mouseup', cleanup, true);
            document.addEventListener('keydown', handleEscape, true);
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
            border-left: 1px solid #404040;
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

                document.removeEventListener('mousemove', handleMouseMove, true);
                document.removeEventListener('mouseup', cleanup, true);
                document.removeEventListener('keydown', handleEscape, true);
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

            // Use capture phase to ensure events are caught
            document.addEventListener('mousemove', handleMouseMove, true);
            document.addEventListener('mouseup', cleanup, true);
            document.addEventListener('keydown', handleEscape, true);
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

        // INSTANT layout adjustment - no delay for immediate UI response
        updateViewportArea();

        // Set up data synchronization when panels are shown (reduced delay)
        setTimeout(() => {
            setupDataSync();
        }, 100);
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
            dimensions: objectData?.dimensions || mesh?.userData?.dimensions || { x: 1, y: 1, z: 1 }
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
     * Send complete data update including both selection and hierarchy
     */
    function sendFullDataUpdate(selectedObjects, updateType = 'data-update') {
        const sceneController = window.modlerComponents?.sceneController;
        const allObjects = sceneController?.getAllObjects() || [];

        sendDataToSveltePanels({
            selectedObjects: selectedObjects || [],
            objectHierarchy: allObjects,
            type: updateType
        });
    }

    /**
     * Send data to Svelte panels via postMessage
     */
    function sendDataToSveltePanels(data) {
        try {
            // Serialize the data to avoid DataCloneError
            const serializedData = {
                ...data,
                selectedObjects: data.selectedObjects ? data.selectedObjects.map(serializeThreeObject).filter(Boolean) : [],
                objectHierarchy: data.objectHierarchy ? data.objectHierarchy.map(serializeThreeObject).filter(Boolean) : []
            };

            if (rightPanelIframe && rightPanelIframe.contentWindow) {
                rightPanelIframe.contentWindow.postMessage({
                    type: 'modler-data',
                    data: serializedData
                }, '*');
            }

            if (leftPanelIframe && leftPanelIframe.contentWindow) {
                leftPanelIframe.contentWindow.postMessage({
                    type: 'modler-data',
                    data: serializedData
                }, '*');
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

        // Handle different property types
        if (property.startsWith('position.')) {
            const axis = property.split('.')[1];
            if (mesh.position && ['x', 'y', 'z'].includes(axis)) {
                mesh.position[axis] = value;
                // Use immediate sync pattern from move tool for smooth real-time updates
                completeObjectModification(mesh, 'transform', true);
            }
        } else if (property.startsWith('rotation.')) {
            const axis = property.split('.')[1];
            if (mesh.rotation && ['x', 'y', 'z'].includes(axis)) {
                // Convert degrees to radians
                mesh.rotation[axis] = value * Math.PI / 180;
                // Use immediate sync pattern from move tool for smooth real-time updates
                completeObjectModification(mesh, 'transform', true);
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

            const propertyUpdateHandler = window.modlerComponents?.propertyUpdateHandler;
            if (propertyUpdateHandler && propertyUpdateHandler.handleContainerLayoutPropertyChange) {
                propertyUpdateHandler.handleContainerLayoutPropertyChange(objectId, property, value);
            } else {
            }

            // Trigger mesh synchronization for layout changes
            completeObjectModification(mesh, 'layout', true);
        }
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
    const PANEL_UPDATE_THROTTLE = 16; // 60fps max updates

    /**
     * Handle object selection from hierarchy panel
     */
    function handleObjectSelection(objectId) {
        const selectionController = window.modlerComponents?.selectionController;
        const sceneController = window.modlerComponents?.sceneController;

        if (selectionController && sceneController) {
            // Get object data from SceneController
            const objectData = sceneController.getObject(objectId);
            if (objectData && objectData.mesh) {
                // Clear current selection and select the new object
                selectionController.clearSelection();
                selectionController.select(objectData.mesh);
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

        // Throttle Svelte panel updates during real-time operations (transform drag)
        const now = Date.now();
        if (modificationType === 'transform' && now - lastPanelUpdateTime < PANEL_UPDATE_THROTTLE) {
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
     * Set up data synchronization with main app
     */
    function setupDataSync() {
        // Check if modlerComponents is available
        if (typeof window !== 'undefined' && window.modlerComponents) {

            // Set up postMessage listener for incoming property updates from Svelte
            window.addEventListener('message', (event) => {
                // Verify origin for security (allow localhost for development)
                if (event.origin !== 'http://localhost:5173') {
                    return;
                }

                if (event.data && event.data.type === 'property-update') {
                    const { objectId, property, value, source } = event.data.data;
                    handlePropertyUpdate(objectId, property, value, source);
                } else if (event.data && event.data.type === 'object-select') {
                    // Handle object selection from hierarchy
                    const { objectId } = event.data.data;
                    handleObjectSelection(objectId);
                }
            });

            // Initialize the ThreeJSBridge by setting up the selection callback directly

            const selectionController = window.modlerComponents.selectionController;
            if (selectionController) {
                // Set up the selection callback to send data to Svelte panels
                selectionController.selectionChangeCallback = (selectedObjects) => {
                    sendFullDataUpdate(selectedObjects, 'selection-change');
                };
            } else {
            }

            // Send initial state
            setTimeout(() => {
                const initialSelection = window.modlerComponents.selectionController?.getSelectedObjects() || [];
                sendFullDataUpdate(initialSelection, 'initial-state');
            }, 1000);
        } else {
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