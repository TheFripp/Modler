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
                x: parseFloat(obj.rotation.x.toFixed(3)),
                y: parseFloat(obj.rotation.y.toFixed(3)),
                z: parseFloat(obj.rotation.z.toFixed(3))
            },
            scale: {
                x: parseFloat(obj.scale.x.toFixed(3)),
                y: parseFloat(obj.scale.y.toFixed(3)),
                z: parseFloat(obj.scale.z.toFixed(3))
            }
        };

        // Add dimensions for objects with geometry
        if (obj.geometry && obj.geometry.parameters) {
            const params = obj.geometry.parameters;
            serialized.dimensions = {
                x: parseFloat((params.width || 1).toFixed(3)),
                y: parseFloat((params.height || 1).toFixed(3)),
                z: parseFloat((params.depth || 1).toFixed(3))
            };
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
        }

        // Add parent relationship
        serialized.parent = objectData.parent || null;

        return serialized;
    }

    /**
     * Send full data update to all Svelte panels
     */
    sendFullDataUpdate(selectedObjects, updateType = 'data-update') {
        if (!selectedObjects) return;

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
        // Sending data to Svelte panels

        // Send to property panel (right)
        if (iframes.right && iframes.right.contentWindow) {
            try {
                iframes.right.contentWindow.postMessage({
                    type: 'data-update',
                    data: data
                }, '*');
                // Sent to property panel
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
        // Handling property update

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
                newRotation[rotAxis] = parseFloat(value);

                // Use TransformationManager for centralized transforms
                const rotationTransformationManager = window.modlerComponents?.transformationManager;
                if (rotationTransformationManager) {
                    rotationTransformationManager.setRotation(mesh, newRotation, { source: 'svelte-ui' });
                } else {
                    mesh.rotation[rotAxis] = parseFloat(value);
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

            default:
                console.warn('Unknown property update:', property, value);
                return;
        }

        // Complete the modification with visual updates
        this.completeObjectModification(mesh, 'property-update', true);
    }

    /**
     * Update object dimensions
     */
    _updateObjectDimension(mesh, axis, newValue) {
        if (!mesh.geometry || !mesh.geometry.parameters) return;

        const params = mesh.geometry.parameters;
        const currentDimensions = {
            x: params.width || 1,
            y: params.height || 1,
            z: params.depth || 1
        };

        // Update the specific dimension
        currentDimensions[axis] = newValue;

        // Create new geometry with updated dimensions
        const geometryFactory = window.modlerComponents?.geometryFactory;
        if (geometryFactory && mesh.geometry.type === 'BoxGeometry') {
            const newGeometry = geometryFactory.createBoxGeometry(
                currentDimensions.x,
                currentDimensions.y,
                currentDimensions.z
            );

            // Replace the geometry
            const oldGeometry = mesh.geometry;
            mesh.geometry = newGeometry;

            // Return old geometry to factory for cleanup
            if (geometryFactory.returnGeometry) {
                geometryFactory.returnGeometry(oldGeometry, 'box');
            } else {
                oldGeometry.dispose();
            }
        }
    }

    /**
     * Complete object modification with proper updates
     */
    completeObjectModification(mesh, changeType = 'transform', immediateVisuals = false) {
        // Update object data in SceneController
        const sceneController = window.modlerComponents?.sceneController;
        if (sceneController && sceneController.updateObject) {
            sceneController.updateObject(mesh);
        }

        // Handle visual updates (legacy meshSynchronizer removed - support meshes now self-contained children)

        // Send updated data back to Svelte panels (throttled)
        this._throttledPropertyUpdate(mesh, changeType);
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