// Property Update Handler - Property-panel driven layout system
// Implements the corrected architecture from container-architecture-master.md

class PropertyUpdateHandler {
    constructor() {
        // Don't store references during construction - get them on demand
        // This prevents initialization order issues
    }

    get objectStateManager() {
        return window.modlerComponents?.objectStateManager;
    }

    // Get components on demand to avoid initialization order issues
    get sceneController() {
        return window.modlerComponents?.sceneController;
    }

    get containerCrudManager() {
        return window.modlerComponents?.containerCrudManager;
    }

    // get unifiedContainerManager() {
    //     return window.modlerComponents?.unifiedContainerManager;
    // }

    /**
     * Handle container layout property changes from property panel
     * Implements the corrected flow from container-architecture-master.md lines 138-151
     */
    handleContainerLayoutPropertyChange(containerId, property, newValue) {

        if (!this.sceneController || !this.containerCrudManager) {
            console.error('Required components not available for PropertyUpdateHandler');
            return false;
        }

        try {
            // Step 2: PropertyUpdateHandler → detects container layout property change
            // CRITICAL FIX: Use the same SceneController instance as PropertyManager
            const sceneController = window.modlerComponents?.sceneController || this.sceneController;
            const objectData = sceneController.getObject(containerId);
            if (!objectData || !objectData.isContainer) {
                console.error('Object is not a container:', containerId);
                return false;
            }

            // Step 3: PropertyUpdateHandler → handle layout enable/disable
            if (!objectData.autoLayout) {
                objectData.autoLayout = {
                    enabled: false,
                    direction: null,
                    gap: 0,
                    padding: { width: 0, height: 0, depth: 0 }
                };
            }

            // If direction is null, disable layout mode (preserve positions)
            if (newValue === null) {
                objectData.autoLayout.enabled = false;
                objectData.autoLayout.direction = null;

                // Switch container back to hug mode when layout is disabled
                objectData.isHug = true;

                // No layout update needed - just preserve current positions
                return true;
            }

            // Enable layout mode and disable hug mode (they are mutually exclusive)
            objectData.autoLayout.enabled = true;
            objectData.isHug = false;

            // Step 4: PropertyUpdateHandler → objectData.autoLayout[property] = newValue
            if (property.startsWith('autoLayout.')) {
                // Handle nested autoLayout properties (e.g., 'autoLayout.direction' -> 'direction')
                const nestedProperty = property.split('.')[1];
                if (nestedProperty === 'padding') {
                    // Handle padding sub-properties
                    const paddingDirection = property.split('.')[2];
                    objectData.autoLayout.padding[paddingDirection] = newValue;
                } else {
                    objectData.autoLayout[nestedProperty] = newValue;
                }
            } else if (property.startsWith('padding.')) {
                const paddingDirection = property.split('.')[1];
                objectData.autoLayout.padding[paddingDirection] = newValue;
            } else {
                objectData.autoLayout[property] = newValue;
            }
            // Only proceed with layout if enabled and has valid direction
            if (objectData.autoLayout.enabled && objectData.autoLayout.direction && objectData.autoLayout.direction !== '') {
                const layoutResult = sceneController.updateLayout(objectData.id);

                if (layoutResult && layoutResult.success) {
                // Step 10: PropertyUpdateHandler → containerCrudManager.resizeContainerToLayoutBounds(layoutBounds)
                if (layoutResult.layoutBounds) {
                    this.containerCrudManager.resizeContainerToLayoutBounds(objectData, layoutResult.layoutBounds);
                }

                // Step 13: PropertyUpdateHandler → containerCrudManager.showContainer(containerId, true)
                this.containerCrudManager.showContainer(objectData.id, true);


                return true;
                } else {
                    console.error('Layout update failed for container:', containerId);
                    return false;
                }
            } else {
                return true;
            }

        } catch (error) {
            console.error('PropertyUpdateHandler error:', error);
            return false;
        }
    }

    /**
     * Check if a property change should trigger layout mode activation
     */
    isLayoutProperty(property) {
        const layoutProperties = ['direction', 'gap', 'padding.width', 'padding.height', 'padding.depth'];
        return layoutProperties.includes(property);
    }

    /**
     * Check if a property is a container sizing property
     */
    isContainerSizingProperty(property) {
        const sizingProperties = ['sizingMode'];
        return sizingProperties.includes(property);
    }

    /**
     * Handle general property changes - routes to appropriate handler
     */
    handlePropertyChange(objectId, property, value) {
        // CRITICAL FIX: Use the same SceneController instance as PropertyManager
        const sceneController = window.modlerComponents?.sceneController || this.sceneController;
        const objectData = sceneController?.getObject(objectId);
        const isLayoutProp = this.isLayoutProperty(property);

        // Check if this is a container layout property change
        if (objectData && objectData.isContainer && isLayoutProp) {
            return this.executeLayoutPropertyChangeCommand(objectId, property, value);
        }

        // For all other properties, wrap in UpdatePropertyCommand for undo support
        // Get old value before making the change
        const oldValue = this.getPropertyValue(objectData, property);

        let success = false;

        // Handle dimension property changes through centralized system
        if (property.startsWith('dimensions.')) {
            success = this.handleObjectDimensionChange(objectId, property, value);
        }
        // Handle transform property changes (position, rotation)
        else if (property.startsWith('position.') || property.startsWith('rotation.')) {
            success = this.handleObjectTransformChange(objectId, property, value);
        }
        // Handle material property changes
        else if (property.startsWith('material.')) {
            success = this.handleObjectMaterialChange(objectId, property, value);
        }
        // Handle container sizing property changes
        else if (objectData && objectData.isContainer && this.isContainerSizingProperty(property)) {
            success = this.handleContainerSizingChange(objectId, property, value);
        }
        // Handle other property changes here in the future
        else {
            success = true;
        }

        // Register as undoable command if the change was successful
        if (success && oldValue !== value) {
            const historyManager = window.modlerComponents?.historyManager;
            if (historyManager) {
                const command = new UpdatePropertyCommand(objectId, property, oldValue, value);
                // ARCHITECTURAL FIX: Commands must go through executeCommand() for proper undo/redo
                // The command's execute() is a no-op since the update already happened
                historyManager.executeCommand(command);
                logger.debug(`📝 Registered property change in history: ${property}`);
            }
        }

        return success;
    }

    /**
     * Get current property value from object data
     */
    getPropertyValue(objectData, property) {
        if (!objectData) return undefined;

        const parts = property.split('.');
        let value = objectData;

        for (const part of parts) {
            if (value && typeof value === 'object' && part in value) {
                value = value[part];
            } else {
                return undefined;
            }
        }

        return value;
    }

    /**
     * Check if object has fill enabled for specific axis
     */
    isAxisFilled(objectId, axis) {
        const sceneController = window.modlerComponents?.sceneController;
        if (!sceneController) return false;

        const objectData = sceneController.getObject(objectId);
        if (!objectData || !objectData.layoutProperties) return false;

        const sizeProperty = `size${axis.toUpperCase()}`;
        return objectData.layoutProperties[sizeProperty] === 'fill';
    }

    /**
     * Check if object is in a layout-enabled container
     */
    isInLayoutContainer(objectId) {
        const sceneController = window.modlerComponents?.sceneController;
        if (!sceneController) return false;

        const objectData = sceneController.getObject(objectId);
        if (!objectData || !objectData.parentContainer) return false;

        const container = sceneController.getObject(objectData.parentContainer);
        return container && container.autoLayout && container.autoLayout.enabled;
    }

    /**
     * Toggle fill property for an axis
     */
    toggleFillProperty(axis) {
        const sceneController = window.modlerComponents?.sceneController;
        const selectionController = window.modlerComponents?.selectionController;

        if (!sceneController || !selectionController) return;

        const selectedObjects = selectionController.getSelectedObjects();
        if (!selectedObjects || selectedObjects.length === 0) return;

        const mesh = selectedObjects[0];
        if (!mesh.userData?.id) return;

        const objectData = sceneController.getObject(mesh.userData.id);
        if (!objectData) return;

        // Check if object is in a layout container
        if (!objectData.parentContainer) {
            console.warn('PropertyUpdateHandler: Object is not in a container, cannot toggle fill');
            return;
        }

        const container = sceneController.getObject(objectData.parentContainer);
        if (!container || !container.autoLayout || !container.autoLayout.enabled) {
            console.warn('PropertyUpdateHandler: Parent container does not have layout enabled');
            return;
        }

        // Initialize layoutProperties if needed
        if (!objectData.layoutProperties) {
            objectData.layoutProperties = {
                sizeX: 'fixed',
                sizeY: 'fixed',
                sizeZ: 'fixed'
            };
        }

        // Initialize savedDimensions storage if needed
        if (!objectData.savedDimensions) {
            objectData.savedDimensions = { x: null, y: null, z: null };
        }

        // Toggle fill state for the axis
        const sizeProperty = `size${axis.toUpperCase()}`;
        const currentState = objectData.layoutProperties[sizeProperty];
        const newState = currentState === 'fill' ? 'fixed' : 'fill';

        if (newState === 'fill') {
            // Save current dimension before applying fill
            const currentDimension = objectData.dimensions?.[axis] || 1;
            objectData.savedDimensions[axis] = currentDimension;
        } else {
            // Restore saved dimension when toggling fill off
            if (objectData.savedDimensions[axis] !== null) {
                sceneController.updateObjectDimensions(objectData.id, axis, objectData.savedDimensions[axis]);
                objectData.savedDimensions[axis] = null;
            }
        }

        // Direct mutation - layout properties are SceneController-managed, not ObjectStateManager-managed
        // This is the correct pattern for layout engine configuration
        objectData.layoutProperties[sizeProperty] = newState;

        // Apply layout update (emits hierarchy event automatically via SceneController - whitelisted in DevelopmentValidator)
        sceneController.updateLayout(container.id);
    }

    /**
     * Handle object dimension changes using ObjectStateManager
     */
    handleObjectDimensionChange(objectId, property, value) {
        if (!this.objectStateManager) {
            console.error('ObjectStateManager not available for dimension change');
            return false;
        }

        try {
            const axis = property.split('.')[1];
            if (!['x', 'y', 'z'].includes(axis)) {
                console.error('Invalid dimension axis:', axis);
                return false;
            }

            // Use ObjectStateManager for unified dimension updates
            const updates = {
                dimensions: {
                    [axis]: value
                }
            };

            this.objectStateManager.updateObject(objectId, updates);
            return true;

        } catch (error) {
            console.error('PropertyUpdateHandler dimension error:', error);
            return false;
        }
    }

    /**
     * Handle object transform changes using ObjectStateManager
     */
    handleObjectTransformChange(objectId, property, value) {
        if (!this.objectStateManager) {
            console.error('ObjectStateManager not available for transform change');
            return false;
        }

        try {
            const updates = {};

            // Handle position updates
            if (property.startsWith('position.')) {
                const axis = property.split('.')[1];
                if (['x', 'y', 'z'].includes(axis)) {
                    updates.position = {
                        [axis]: value
                    };
                }
            }

            // Handle rotation updates
            if (property.startsWith('rotation.')) {
                const axis = property.split('.')[1];
                if (['x', 'y', 'z'].includes(axis)) {
                    // Convert degrees to radians for internal storage
                    updates.rotation = {
                        [axis]: value * Math.PI / 180
                    };
                }
            }

            if (Object.keys(updates).length > 0) {
                this.objectStateManager.updateObject(objectId, updates);
                return true;
            }

            return false;
        } catch (error) {
            console.error('PropertyUpdateHandler transform error:', error);
            return false;
        }
    }

    /**
     * Handle object material changes using ObjectStateManager
     */
    handleObjectMaterialChange(objectId, property, value) {
        if (!this.objectStateManager) {
            console.error('ObjectStateManager not available for material change');
            return false;
        }

        try {
            const materialProp = property.split('.')[1];
            const updates = {};

            // Handle different material properties
            if (materialProp === 'color') {
                updates.material = {
                    color: value
                };
            } else if (materialProp === 'opacity') {
                updates.material = {
                    opacity: value
                };
            } else {
                console.error('Unknown material property:', materialProp);
                return false;
            }

            this.objectStateManager.updateObject(objectId, updates);
            return true;

        } catch (error) {
            console.error('PropertyUpdateHandler material error:', error);
            return false;
        }
    }

    /**
     * Handle container sizing property changes using centralized system
     */
    handleContainerSizingChange(objectId, property, value) {
        if (!this.sceneController || !this.containerCrudManager) {
            console.error('Required components not available for sizing change');
            return false;
        }

        try {
            const objectData = this.sceneController.getObject(objectId);
            if (!objectData?.isContainer) {
                console.error('Object is not a container:', objectId);
                return false;
            }

            // Handle sizing mode changes
            if (property === 'sizingMode') {
                // Update object data
                objectData.sizingMode = value;

                // Trigger container update with new sizing mode
                if (objectData.mesh) {
                    const success = this.containerCrudManager.resizeContainerToFitChildren(objectData, false, true);
                    if (success) {
                        return true;
                    } else {
                        console.error('Failed to update container sizing:', { objectId, property, value });
                        return false;
                    }
                }
            }

            return false;

        } catch (error) {
            console.error('PropertyUpdateHandler sizing error:', error);
            return false;
        }
    }

    /**
     * Execute layout property change as undoable command
     * @param {number} objectId - Container ID
     * @param {string} property - Property name (e.g., 'direction', 'gap')
     * @param {*} newValue - New property value
     * @returns {boolean} True if command was executed successfully
     */
    executeLayoutPropertyChangeCommand(objectId, property, newValue) {
        try {
            const sceneController = window.modlerComponents?.sceneController;
            const historyManager = window.modlerComponents?.historyManager;

            if (!sceneController) {
                console.error('SceneController not available for layout property command');
                return false;
            }

            // Get current value for undo
            const objectData = sceneController.getObject(objectId);
            if (!objectData || !objectData.isContainer) {
                console.error('Invalid container for layout property command');
                return false;
            }

            let oldValue = null;
            if (property.startsWith('autoLayout.')) {
                const nestedProperty = property.split('.').slice(1).join('.');
                oldValue = this.getNestedProperty(objectData.autoLayout, nestedProperty);
            } else if (property === 'direction') {
                oldValue = objectData.autoLayout?.direction;
            }

            // Create and execute command
            if (historyManager) {
                const command = new UpdateLayoutPropertyCommand(objectId, property, newValue, oldValue);
                const success = historyManager.executeCommand(command);

                if (success) {
                    return true;
                } else {
                    console.error('❌ Failed to execute layout property change command');
                    return false;
                }
            } else {
                // Fallback to direct execution without undo support
                console.warn('HistoryManager not available, executing layout property change without undo support');
                return this.handleContainerLayoutPropertyChange(objectId, property, newValue);
            }

        } catch (error) {
            console.error('PropertyUpdateHandler layout command error:', error);
            return false;
        }
    }

    /**
     * Helper to get nested property value
     * @param {Object} obj - Object to get property from
     * @param {string} path - Dot-separated property path
     * @returns {*} Property value
     */
    getNestedProperty(obj, path) {
        if (!obj || !path) return undefined;
        return path.split('.').reduce((current, key) => current?.[key], obj);
    }
}

// Make PropertyUpdateHandler available globally
if (typeof window !== 'undefined') {
    window.PropertyUpdateHandler = PropertyUpdateHandler;
}