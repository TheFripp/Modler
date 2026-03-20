const logger = window.logger;
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
     * Convert dot-notation property path to nested object
     * Example: ('dimensions.x', 1.5) → { dimensions: { x: 1.5 } }
     *
     * @param {string} property - Property path (e.g., 'dimensions.x', 'autoLayout.gap')
     * @param {any} value - Value to set
     * @returns {Object} Nested object structure
     */
    parsePropertyPath(property, value) {
        const parts = property.split('.');

        if (parts.length === 1) {
            return { [property]: value };
        }

        // Build nested object
        let result = {};
        let current = result;

        for (let i = 0; i < parts.length - 1; i++) {
            current[parts[i]] = {};
            current = current[parts[i]];
        }

        current[parts[parts.length - 1]] = value;
        return result;
    }

    /**
     * Generic property update handler - routes to ObjectStateManager
     * This is the PRIMARY entry point for ALL UI property changes
     *
     * Flow: UI → CommandRouter → PropertyUpdateHandler → ObjectStateManager
     *
     * @param {Object} data - Property update data
     * @param {string|number} data.objectId - Object ID
     * @param {string} data.property - Property path (can be nested like 'dimensions.x')
     * @param {any} data.value - New value
     * @param {string} data.source - Source of the update (for debugging)
     * @returns {boolean} Success status
     */
    handlePropertyUpdate(data) {
        const { objectId, property, value, source } = data;

        if (!this.objectStateManager) {
            console.error('PropertyUpdateHandler: ObjectStateManager not available');
            return false;
        }

        // Special handling for container layout properties
        // These need custom logic beyond simple state updates
        // Also catch property === 'autoLayout' (whole-object update from LayoutSection)
        if (property === 'autoLayout' || property.startsWith('autoLayout.') || property === 'layoutMode') {
            return this.handleContainerLayoutPropertyChange(objectId, property, value);
        }

        // Container mode changes need buildContainerModeUpdate to sync legacy flags
        if (property === 'containerMode' || property === 'sizingMode') {
            return this.handleContainerSizingChange(objectId, property, value);
        }

        // Generic property update: route to ObjectStateManager
        // ObjectStateManager.updateObject() handles:
        // - State update
        // - Layout propagation (if needed)
        // - Event emission (which triggers SimpleCommunication → UI update)
        try {
            // Parse property path into nested object structure
            const updates = this.parsePropertyPath(property, value);

            // SPECIAL CASE: If updating dimensions on an object with fill mode active,
            // automatically disable fill mode for that axis
            if (property.startsWith('dimensions.')) {
                const axis = property.split('.')[1]; // 'x', 'y', or 'z'
                const obj = this.sceneController?.getObject(objectId);

                if (obj && obj.layoutProperties) {
                    const sizeProperty = `size${axis.toUpperCase()}`;
                    const currentMode = obj.layoutProperties[sizeProperty];

                    if (currentMode === 'fill') {
                        // User is manually setting dimension → disable fill mode
                        updates.layoutProperties = {
                            ...obj.layoutProperties,
                            [sizeProperty]: 'fixed'
                        };
                    }
                }

                // PUSH TOOL INTEGRATION: Check if this dimension was manipulated by push tool
                // If so, adjust position to keep the opposite face stationary
                const inputFocusManager = window.inputFocusManager;
                if (inputFocusManager) {
                    const lastManipulation = inputFocusManager.getLastManipulated();
                    if (lastManipulation &&
                        lastManipulation.objectId === objectId &&
                        lastManipulation.property === property &&
                        lastManipulation.context &&
                        lastManipulation.context.pushDirection) {

                        // Get current dimensions and position
                        const currentDim = obj.dimensions[axis];
                        const newDim = value;
                        const dimChange = newDim - currentDim;

                        // Calculate position offset to keep opposite face stationary
                        // pushDirection: 1 = pushed in positive direction, -1 = negative
                        const pushDirection = lastManipulation.context.pushDirection;
                        const positionOffset = (dimChange / 2) * pushDirection;

                        // Add position update to keep opposite face fixed
                        if (!updates.position) {
                            updates.position = { ...obj.position };
                        }
                        updates.position[axis] = obj.position[axis] + positionOffset;
                    }
                }
            }

            this.objectStateManager.updateObject(objectId, updates, {
                source: source || 'property-panel',
                immediate: true
            });

            return true;
        } catch (error) {
            console.error('PropertyUpdateHandler: Failed to update property', error);
            return false;
        }
    }

    /**
     * Handle container layout property changes from property panel
     * Implements the corrected flow from container-architecture-master.md lines 138-151
     */
    handleContainerLayoutPropertyChange(containerId, property, newValue) {

        if (!this.sceneController || !this.containerCrudManager || !this.objectStateManager) {
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
            // Create a copy of autoLayout to modify
            const updatedAutoLayout = objectData.autoLayout ? { ...objectData.autoLayout } : {
                enabled: false,
                direction: null,
                gap: 0,
                padding: { width: 0, height: 0, depth: 0 },
                alignment: { x: 'center', y: 'center', z: 'center' },
                reversed: false
            };

            // If direction is null, disable layout mode (preserve positions)
            if (newValue === null) {
                updatedAutoLayout.enabled = false;
                updatedAutoLayout.direction = null;

                // Persist via ObjectStateManager
                this.objectStateManager.updateObject(containerId, {
                    autoLayout: updatedAutoLayout,
                    ...ObjectStateManager.buildContainerModeUpdate('hug')
                }, { source: 'property-panel', immediate: true });

                // No layout update needed - just preserve current positions
                return true;
            }

            // Handle full autoLayout object replacement (sent by LayoutSection via updateThreeJSProperty)
            if (property === 'autoLayout' && typeof newValue === 'object') {
                const fullAutoLayout = { ...updatedAutoLayout, ...newValue };
                const mode = fullAutoLayout.enabled ? 'layout' : 'manual';

                this.objectStateManager.updateObject(containerId, {
                    autoLayout: fullAutoLayout,
                    ...ObjectStateManager.buildContainerModeUpdate(mode)
                }, { source: 'property-panel', immediate: true });

                // Trigger layout update if enabled with valid direction
                if (fullAutoLayout.enabled && fullAutoLayout.direction && fullAutoLayout.direction !== '') {
                    const layoutResult = sceneController.updateLayout(containerId);
                    if (layoutResult?.success && layoutResult.layoutBounds) {
                        this.containerCrudManager.resizeContainer(objectData, {
                            reason: 'layout-updated',
                            layoutBounds: layoutResult.layoutBounds,
                            immediate: true
                        });
                    }
                    this.containerCrudManager.showContainer(containerId, true);
                }
                return true;
            }

            // Enable layout mode and disable hug mode (they are mutually exclusive)
            updatedAutoLayout.enabled = true;

            // Step 4: PropertyUpdateHandler → autoLayout[property] = newValue
            if (property.startsWith('autoLayout.')) {
                // Handle nested autoLayout properties (e.g., 'autoLayout.direction' -> 'direction')
                const nestedProperty = property.split('.')[1];
                if (nestedProperty === 'padding') {
                    // Handle padding sub-properties
                    const paddingDirection = property.split('.')[2];
                    if (!updatedAutoLayout.padding) {
                        updatedAutoLayout.padding = { width: 0, height: 0, depth: 0 };
                    }
                    updatedAutoLayout.padding = { ...updatedAutoLayout.padding, [paddingDirection]: newValue };
                } else {
                    updatedAutoLayout[nestedProperty] = newValue;
                }
            } else if (property.startsWith('padding.')) {
                const paddingDirection = property.split('.')[1];
                if (!updatedAutoLayout.padding) {
                    updatedAutoLayout.padding = { width: 0, height: 0, depth: 0 };
                }
                updatedAutoLayout.padding = { ...updatedAutoLayout.padding, [paddingDirection]: newValue };
            } else {
                updatedAutoLayout[property] = newValue;
            }

            // CRITICAL FIX: Persist via ObjectStateManager instead of direct mutation
            this.objectStateManager.updateObject(containerId, {
                autoLayout: updatedAutoLayout,
                ...ObjectStateManager.buildContainerModeUpdate('layout')
            }, { source: 'property-panel', immediate: true });

            // Only proceed with layout if enabled and has valid direction
            if (updatedAutoLayout.enabled && updatedAutoLayout.direction && updatedAutoLayout.direction !== '') {
                const layoutResult = sceneController.updateLayout(containerId);

                if (layoutResult && layoutResult.success) {
                // UNIFIED API: Layout properties changed via UI
                if (layoutResult.layoutBounds) {
                    this.containerCrudManager.resizeContainer(objectData, {
                        reason: 'layout-updated',
                        layoutBounds: layoutResult.layoutBounds,
                        immediate: true
                    });
                }

                // Step 13: PropertyUpdateHandler → containerCrudManager.showContainer(containerId, true)
                this.containerCrudManager.showContainer(containerId, true);


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
        const sizingProperties = ['sizingMode', 'containerMode'];
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
     * DEPRECATED: Use objectStateManager.hasFillEnabled() instead
     */
    isAxisFilled(objectId, axis) {
        // Use centralized state machine
        return this.objectStateManager?.hasFillEnabled(objectId, axis) || false;
    }

    /**
     * Check if object is in a layout-enabled container
     * DEPRECATED: Use objectStateManager.isLayoutMode() instead
     */
    isInLayoutContainer(objectId) {
        const sceneController = window.modlerComponents?.sceneController;
        if (!sceneController) return false;

        const objectData = sceneController.getObject(objectId);
        if (!objectData || !objectData.parentContainer) return false;

        // Use centralized state machine
        return this.objectStateManager?.isLayoutMode(objectData.parentContainer) || false;
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

        // Use centralized state machine
        if (!this.objectStateManager?.isLayoutMode(objectData.parentContainer)) {
            console.warn('PropertyUpdateHandler: Parent container does not have layout enabled');
            return;
        }

        const container = sceneController.getObject(objectData.parentContainer);

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

        // Toggle fill state for the axis (using centralized state machine)
        const currentState = this.objectStateManager?.getChildSizeMode(objectData.id, axis) || 'fixed';
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

            // Handle sizing mode changes (accepts both 'sizingMode' and 'containerMode')
            if (property === 'sizingMode' || property === 'containerMode') {
                // Get old value for undo
                const oldValue = objectData.containerMode || objectData.sizingMode;

                // Update object data — set containerMode and keep legacy flags in sync
                const modeUpdate = ObjectStateManager.buildContainerModeUpdate(value);
                Object.assign(objectData, modeUpdate);

                // Trigger container update with new sizing mode
                if (objectData.mesh) {
                    // UNIFIED API: User changed sizing mode from UI
                    const success = this.containerCrudManager.resizeContainer(objectData, {
                        reason: 'mode-changed',
                        immediate: true
                    });

                    if (success) {
                        // Register with history manager for undo/redo support
                        if (oldValue !== value) {
                            const historyManager = window.modlerComponents?.historyManager;
                            if (historyManager) {
                                const command = new UpdatePropertyCommand(objectId, property, oldValue, value);
                                historyManager.executeCommand(command);
                                logger.debug(`📝 Registered sizing mode change in history: ${property}`);
                            }
                        }
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
     * Handle fill button toggle for child objects in layout containers
     * Toggles layoutProperties.sizeX/Y/Z between 'fixed' and 'fill'
     *
     * @param {string|number} objectId - Object ID
     * @param {string} axis - Axis to toggle ('x', 'y', or 'z')
     * @returns {boolean} Success status
     */
    handleFillButtonToggle(objectId, axis) {
        if (!this.objectStateManager || !this.sceneController) {
            console.error('PropertyUpdateHandler: Required components not available');
            return false;
        }

        const obj = this.sceneController.getObject(objectId);
        if (!obj) {
            console.error('PropertyUpdateHandler: Object not found:', objectId);
            return false;
        }

        // Initialize layoutProperties if not exists
        if (!obj.layoutProperties) {
            obj.layoutProperties = {
                sizeX: 'fixed',
                sizeY: 'fixed',
                sizeZ: 'fixed',
                fixedSize: null
            };
        }

        // Initialize fixedSize storage if not exists
        if (!obj.layoutProperties.fixedSize) {
            obj.layoutProperties.fixedSize = { x: null, y: null, z: null };
        }

        // Determine property name based on axis
        const propertyName = `size${axis.toUpperCase()}`;

        // Toggle between 'fixed' and 'fill' (using centralized state machine)
        const currentValue = this.objectStateManager.getChildSizeMode(objectId, axis);
        const newValue = currentValue === 'fill' ? 'fixed' : 'fill';

        const updates = {
            layoutProperties: {
                ...obj.layoutProperties,
                [propertyName]: newValue
            }
        };

        // When enabling fill → store current dimension
        // When disabling fill → restore stored dimension (if exists)
        if (newValue === 'fill') {
            // Store current dimension before filling - use object's dimensions property directly
            // DimensionManager.getDimension() may fail for objects in fill mode
            const currentDimension = obj.dimensions?.[axis];

            if (currentDimension !== null && currentDimension !== undefined) {
                updates.layoutProperties.fixedSize = {
                    ...obj.layoutProperties.fixedSize,
                    [axis]: currentDimension
                };
            }
        } else {
            // Restore stored dimension when disabling fill
            const storedDimension = obj.layoutProperties.fixedSize?.[axis];

            if (storedDimension !== null && storedDimension !== undefined) {
                // Set dimension to stored value
                const dimensionUpdate = {};
                dimensionUpdate[axis] = storedDimension;
                updates.dimensions = dimensionUpdate;
            }
        }


        try {

            this.objectStateManager.updateObject(objectId, updates, {
                source: 'fill-button-toggle',
                immediate: true
            });


            // Trigger layout update on parent container to apply the fill change
            if (obj.parentContainer) {
                const layoutResult = this.sceneController.updateLayout(obj.parentContainer);

                // CRITICAL FIX: Force UI refresh after fill toggle
                // When dimensions don't change (hug container), layout doesn't emit events
                // but UI still needs to refresh to show updated fill button state
                const updatedObj = this.sceneController.getObject(objectId);
                if (updatedObj) {
                    this.objectStateManager.updateObject(objectId, {
                        dimensions: { ...updatedObj.dimensions }
                    }, {
                        source: 'fill-button-ui-refresh',
                        immediate: true
                    });
                }
            }


            return true;
        } catch (error) {
            console.error('PropertyUpdateHandler: Failed to toggle fill mode', error);
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