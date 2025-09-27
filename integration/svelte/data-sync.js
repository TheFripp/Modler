/**
 * Svelte Data Synchronization Module
 * Handles bidirectional data communication between main app and Svelte UI
 */

class SvelteDataSync {
    constructor(panelManager) {
        this.panelManager = panelManager;
        this.updateThrottle = null;
        this.THROTTLE_DELAY = 16; // ~60fps
        this.lastUpdateType = null;
    }

    /**
     * Serialize Three.js object for transmission to Svelte
     */
    serializeThreeObject(obj) {
        if (!obj || !obj.userData) return null;

        const sceneController = window.modlerComponents?.sceneController;
        if (!sceneController) return null;

        const objectData = sceneController.getObjectByMesh(obj);
        if (!objectData) return null;

        // Build serialized object with all necessary data
        const serialized = {
            id: objectData.id,
            name: objectData.name,
            type: objectData.type || 'object',
            isContainer: objectData.isContainer || false,
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
            scale: {
                x: parseFloat(obj.scale.x.toFixed(3)),
                y: parseFloat(obj.scale.y.toFixed(3)),
                z: parseFloat(obj.scale.z.toFixed(3))
            }
        };

        // Add dimensions for objects with geometry using centralized GeometryUtils
        if (obj.geometry) {
            const geometryUtils = window.GeometryUtils;
            if (geometryUtils) {
                // Use GeometryUtils to get actual dimensions from bounding box (works for modified geometries)
                const dimensions = geometryUtils.getGeometryDimensions(obj.geometry);
                if (dimensions) {
                    serialized.dimensions = {
                        x: parseFloat(dimensions.x.toFixed(3)),
                        y: parseFloat(dimensions.y.toFixed(3)),
                        z: parseFloat(dimensions.z.toFixed(3))
                    };
                    console.log('📏 SERIALIZE: Calculated dimensions for', obj.userData?.id, ':', serialized.dimensions);
                } else {
                    console.warn('⚠️ SERIALIZE: GeometryUtils failed to get dimensions for', obj.userData?.id);
                }
            } else {
                // Fallback to geometry parameters for basic geometries
                if (obj.geometry.parameters) {
                    const params = obj.geometry.parameters;
                    serialized.dimensions = {
                        x: parseFloat((params.width || 1).toFixed(3)),
                        y: parseFloat((params.height || 1).toFixed(3)),
                        z: parseFloat((params.depth || 1).toFixed(3))
                    };
                }
            }
        }

        // Add material properties
        if (obj.material) {
            serialized.material = {
                color: obj.material.color ? obj.material.color.getHexString() : 'ffffff',
                opacity: obj.material.opacity !== undefined ? obj.material.opacity : 1,
                transparent: obj.material.transparent || false
            };
        }

        // Add container-specific data
        if (objectData.isContainer) {
            serialized.children = objectData.children || [];
            serialized.layout = objectData.layout || null;
            serialized.autoLayout = objectData.autoLayout || null;
        }

        // Add parent relationship - use consistent field name throughout system
        // IMPORTANT: Always use 'parentContainer' not 'parent' for consistency
        // Scene Controller stores as 'parentContainer', UI expects 'parentContainer'
        serialized.parentContainer = objectData.parentContainer || null;


        return serialized;
    }

    /**
     * Send full data update to all Svelte panels
     */
    sendFullDataUpdate(selectedObjects, updateType = 'data-update') {
        if (!selectedObjects) return;

        console.log('🚀 DATA-SYNC: sendFullDataUpdate called with:', selectedObjects.length, 'objects, updateType:', updateType);

        // Serialize all objects
        const serializedObjects = [];
        for (const obj of selectedObjects) {
            const serialized = this.serializeThreeObject(obj);
            if (serialized) {
                serializedObjects.push(serialized);
            }
        }

        // Get navigation state
        const navigationController = window.modlerComponents?.navigationController;
        const containerContext = navigationController?.getCurrentContainer() || null;

        // Build complete data package
        const data = {
            selectedObjects: serializedObjects,
            containerContext: containerContext ? {
                id: containerContext.id,
                name: containerContext.name,
                mesh: containerContext.mesh ? 'present' : null
            } : null,
            timestamp: Date.now(),
            updateType: updateType
        };

        this.sendDataToSveltePanels(data);
        this.lastUpdateType = updateType;
    }

    /**
     * Send data to all active Svelte panels
     */
    sendDataToSveltePanels(data) {
        const iframes = this.panelManager.getIframes();

        // Send to property panel (right)
        if (iframes.right && iframes.right.contentWindow) {
            try {
                iframes.right.contentWindow.postMessage({
                    type: 'data-update',
                    data: data
                }, '*');
            } catch (error) {
                console.warn('Failed to send data to property panel:', error);
            }
        }

        // Send to left panel
        if (iframes.left && iframes.left.contentWindow) {
            try {
                iframes.left.contentWindow.postMessage({
                    type: 'data-update',
                    data: data
                }, '*');
                // Sent to left panel
            } catch (error) {
                console.warn('Failed to send data to left panel:', error);
            }
        }

        // Send to toolbars
        if (iframes.mainToolbar && iframes.mainToolbar.contentWindow) {
            try {
                iframes.mainToolbar.contentWindow.postMessage({
                    type: 'data-update',
                    data: data
                }, '*');
            } catch (error) {
                console.warn('Failed to send data to main toolbar:', error);
            }
        }

        // System toolbar disabled to prevent duplicate snap button UI
        // if (iframes.systemToolbar && iframes.systemToolbar.contentWindow) {
        //     try {
        //         iframes.systemToolbar.contentWindow.postMessage({
        //             type: 'data-update',
        //             data: data
        //         }, '*');
        //     } catch (error) {
        //         console.warn('Failed to send data to system toolbar:', error);
        //     }
        // }
    }

    /**
     * Refresh property panel with current selection
     */
    refreshPropertyPanel() {
        const selectionController = window.modlerComponents?.selectionController;
        if (!selectionController) return;

        const selectedObjects = Array.from(selectionController.selectedObjects);
        if (selectedObjects.length > 0) {
            this.sendFullDataUpdate(selectedObjects, 'property-refresh');
        }
    }

    /**
     * Handle property update from Svelte UI
     */
    handlePropertyUpdate(objectId, property, value, source = 'input') {
        const sceneController = window.modlerComponents?.sceneController;
        if (!sceneController) {
            console.warn('❌ SceneController not available for property update');
            return;
        }

        // Find the object by ID
        const objectData = sceneController.getObject(objectId);
        if (!objectData || !objectData.mesh) {
            console.warn('❌ Object or mesh not found for property update:', objectId);
            return;
        }

        // Object found for property update
        const mesh = objectData.mesh;

        // Apply the property update based on type
        switch (property) {
            case 'position.x':
            case 'position.y':
            case 'position.z':
                const axis = property.split('.')[1];
                const newPosition = mesh.position.clone();
                newPosition[axis] = parseFloat(value);

                // Use TransformationManager for centralized transforms
                const transformationManager = window.modlerComponents?.transformationManager;
                if (transformationManager) {
                    transformationManager.setPosition(mesh, newPosition, { source: 'svelte-ui' });
                } else {
                    mesh.position[axis] = parseFloat(value);
                }
                break;

            case 'rotation.x':
            case 'rotation.y':
            case 'rotation.z':
                const rotAxis = property.split('.')[1];
                const newRotation = mesh.rotation.clone();
                // Convert degrees to radians since Three.js uses radians internally
                newRotation[rotAxis] = parseFloat(value) * Math.PI / 180;

                // Use TransformationManager for centralized transforms
                const rotationTransformationManager = window.modlerComponents?.transformationManager;
                if (rotationTransformationManager) {
                    rotationTransformationManager.setRotation(mesh, newRotation, { source: 'svelte-ui' });
                } else {
                    mesh.rotation[rotAxis] = parseFloat(value) * Math.PI / 180;
                }
                break;

            case 'dimensions.x':
            case 'dimensions.y':
            case 'dimensions.z':
                // Handle dimension changes (geometry updates)
                const dimAxis = property.split('.')[1];
                const newValue = parseFloat(value);
                this._updateObjectDimension(mesh, dimAxis, newValue);
                break;

            case 'material.color':
                if (mesh.material) {
                    mesh.material.color.setHex(parseInt(value.replace('#', ''), 16));
                }
                break;

            case 'material.opacity':
                if (mesh.material) {
                    mesh.material.opacity = parseFloat(value);
                    mesh.material.transparent = mesh.material.opacity < 1;
                }
                break;

            case 'autoLayout.enabled':
                // Handle auto layout mode changes for containers
                if (objectData.isContainer) {
                    const sceneController = window.modlerComponents?.sceneController;
                    if (sceneController) {
                        const enabled = value === true || value === 'true';
                        if (enabled) {
                            // Enable auto layout with current direction or default to 'x'
                            // SceneController will handle container resizing automatically
                            const direction = objectData.autoLayout?.direction || 'x';
                            sceneController.enableAutoLayout(objectData.id, { direction });
                        } else {
                            sceneController.disableAutoLayout(objectData.id);
                        }

                        // Refresh property panel to show/hide layout controls
                        setTimeout(() => {
                            this.refreshPropertyPanel();
                        }, 50);
                    }
                }
                break;

            case 'autoLayout.direction':
                // Handle auto layout direction changes for containers
                if (objectData.isContainer && objectData.autoLayout?.enabled) {
                    const sceneController = window.modlerComponents?.sceneController;
                    if (sceneController) {
                        // Update layout with new direction (enableAutoLayout will handle container resizing)
                        sceneController.enableAutoLayout(objectData.id, {
                            direction: value,
                            gap: objectData.autoLayout.gap || 0,
                            padding: objectData.autoLayout.padding || { top: 0, bottom: 0, left: 0, right: 0, front: 0, back: 0 }
                        });

                        // Refresh property panel to update layout controls
                        setTimeout(() => {
                            this.refreshPropertyPanel();
                        }, 50);
                    }
                }
                break;

            case 'autoLayout.gap':
                // Handle auto layout gap changes for containers
                if (objectData.isContainer && objectData.autoLayout?.enabled) {
                    const sceneController = window.modlerComponents?.sceneController;
                    if (sceneController) {
                        // Update layout with new gap value
                        sceneController.enableAutoLayout(objectData.id, {
                            direction: objectData.autoLayout.direction,
                            gap: parseFloat(value),
                            padding: objectData.autoLayout.padding || { top: 0, bottom: 0, left: 0, right: 0, front: 0, back: 0 }
                        });
                    }
                }
                break;

            case 'autoLayout.padding.top':
            case 'autoLayout.padding.bottom':
            case 'autoLayout.padding.left':
            case 'autoLayout.padding.right':
            case 'autoLayout.padding.front':
            case 'autoLayout.padding.back':
                // Handle auto layout padding changes for containers
                if (objectData.isContainer && objectData.autoLayout?.enabled) {
                    const sceneController = window.modlerComponents?.sceneController;
                    if (sceneController) {
                        const paddingSide = property.split('.')[2]; // Extract 'top', 'bottom', etc.
                        const currentPadding = objectData.autoLayout.padding || { top: 0, bottom: 0, left: 0, right: 0, front: 0, back: 0 };

                        // Update the specific padding side
                        const updatedPadding = {
                            ...currentPadding,
                            [paddingSide]: parseFloat(value)
                        };

                        // Update layout with new padding
                        sceneController.enableAutoLayout(objectData.id, {
                            direction: objectData.autoLayout.direction,
                            gap: objectData.autoLayout.gap || 0,
                            padding: updatedPadding
                        });
                    }
                }
                break;

            default:
                console.warn('Unknown property update:', property, value);
                return;
        }

        // Notify the system of geometry changes for visual updates (only for dimension changes)
        if (property.startsWith('dimensions.') && window.notifyObjectModified) {
            window.notifyObjectModified(mesh, 'geometry');
        }

        // Complete the modification with visual updates
        // Skip throttled update for dimension changes to prevent feedback loop
        const skipThrottledUpdate = property.startsWith('dimensions.');
        this.completeObjectModification(mesh, 'property-update', skipThrottledUpdate);
    }

    /**
     * Update object dimensions
     */
    _updateObjectDimension(mesh, axis, newValue) {
        if (!mesh.geometry || !mesh.geometry.parameters) return;

        // Use GeometryUtils for CAD-style vertex manipulation (no geometry recreation)
        const geometryUtils = window.GeometryUtils;
        if (geometryUtils) {
            const success = geometryUtils.scaleGeometryAlongAxis(mesh.geometry, axis, newValue);
            if (success) {
                // Update all support meshes (wireframes, highlights, etc.) centrally
                geometryUtils.updateSupportMeshGeometries(mesh);
            }
        }
    }

    /**
     * Complete object modification with proper updates
     */
    completeObjectModification(mesh, changeType = 'transform', skipThrottledUpdate = false) {
        // Update object data in SceneController
        const sceneController = window.modlerComponents?.sceneController;
        if (sceneController && sceneController.updateObject) {
            sceneController.updateObject(mesh);
        }

        // Send updated data back to Svelte panels (throttled) - skip for dimension changes to prevent feedback loops
        if (!skipThrottledUpdate) {
            this._throttledPropertyUpdate(mesh, changeType);
        }
    }

    /**
     * Throttled property panel update to prevent excessive updates during real-time operations
     */
    _throttledPropertyUpdate(mesh, changeType) {
        if (this.updateThrottle) {
            clearTimeout(this.updateThrottle);
        }

        this.updateThrottle = setTimeout(() => {
            const selectionController = window.modlerComponents?.selectionController;
            if (selectionController) {
                const selectedObjects = Array.from(selectionController.selectedObjects);
                if (selectedObjects.length > 0) {
                    this.sendFullDataUpdate(selectedObjects, `throttled-${changeType}`);
                }
            }
            this.updateThrottle = null;
        }, this.THROTTLE_DELAY);
    }

    /**
     * Setup data synchronization listeners
     */
    setupDataSync() {
        // Listen for messages from Svelte panels
        window.addEventListener('message', (event) => {
            this._handleSvelteMessage(event);
        });

        // Data synchronization setup complete
    }

    /**
     * Handle messages from Svelte panels
     */
    _handleSvelteMessage(event) {
        if (!event.data || typeof event.data !== 'object') return;

        const { type, data } = event.data;

        switch (type) {
            case 'property-update':
                // Received property-update message
                if (data.objectId && data.property !== undefined && data.value !== undefined) {
                    this.handlePropertyUpdate(data.objectId, data.property, data.value, data.source);
                } else {
                    console.warn('❌ Invalid property-update message data:', data);
                }
                break;

            case 'request-data-refresh':
                this.refreshPropertyPanel();
                break;

            case 'object-selection':
                this._handleObjectSelection(data.objectId);
                break;

            case 'tool-activation':
                this._handleToolActivation(data.toolName);
                break;

            default:
                // Allow other message types to be handled elsewhere
                break;
        }
    }

    /**
     * Handle object selection from Svelte UI
     */
    _handleObjectSelection(objectId) {
        const sceneController = window.modlerComponents?.sceneController;
        const selectionController = window.modlerComponents?.selectionController;

        if (!sceneController || !selectionController) return;

        const objectData = sceneController.getObject(objectId);
        if (objectData && objectData.mesh) {
            selectionController.clearSelection('svelte-ui-selection');
            selectionController.select(objectData.mesh);
        }
    }

    /**
     * Handle tool activation from Svelte UI
     */
    _handleToolActivation(toolName) {
        const toolController = window.modlerComponents?.toolController;
        if (toolController && toolController.switchToTool) {
            const success = toolController.switchToTool(toolName);

            // Send tool state update if successful
            if (success) {
                this._sendToolStateUpdate(toolName);
            }
        }
    }

    /**
     * Send tool state update to all Svelte panels
     */
    _sendToolStateUpdate(toolName) {
        // Get current snap state
        const snapController = window.modlerComponents?.snapController;
        const snapEnabled = snapController ? snapController.getEnabled() : false;

        // Create tool state data
        const toolStateData = {
            activeTool: toolName,
            snapEnabled: snapEnabled
        };

        // Send to all panels
        this.sendDataToSveltePanels({
            toolState: toolStateData,
            timestamp: Date.now(),
            updateType: 'tool-state-update'
        });
    }
}

// Export for use in main integration file
window.SvelteDataSync = SvelteDataSync;