const logger = window.logger;
// Property Update Handler - Property-panel driven layout system
// Single entry point: handlePropertyUpdate() routes all UI property changes to ObjectStateManager

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
        if (property === 'autoLayout' || property.startsWith('autoLayout.')) {
            return this.handleContainerLayoutPropertyChange(objectId, property, value);
        }

        // Container mode changes route through buildContainerModeUpdate
        if (property === 'containerMode') {
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

                        // Calculate position offset based on anchor mode
                        // anchorMode determines which edge stays fixed during resize
                        const anchorMode = lastManipulation.context.anchorMode;
                        let positionOffset;

                        if (anchorMode === 'center') {
                            // Symmetric resize: no position change needed
                            positionOffset = 0;
                        } else if (anchorMode === 'min') {
                            // Min face fixed: center shifts toward max
                            positionOffset = dimChange / 2;
                        } else if (anchorMode === 'max') {
                            // Max face fixed: center shifts toward min
                            positionOffset = -dimChange / 2;
                        } else {
                            // Fallback: original pushDirection-based behavior
                            const pushDirection = lastManipulation.context.pushDirection;
                            positionOffset = (dimChange / 2) * pushDirection;
                        }

                        // Add position update to keep aligned edge fixed
                        // Read from mesh.position (live) not obj.position (stale creation-time value)
                        if (positionOffset !== 0) {
                            const meshPos = obj.mesh.position;
                            if (!updates.position) {
                                updates.position = { x: meshPos.x, y: meshPos.y, z: meshPos.z };
                            }
                            updates.position[axis] = meshPos[axis] + positionOffset;
                        }
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
            const updatedAutoLayout = objectData.autoLayout
                ? { ...objectData.autoLayout }
                : window.ObjectDataFormat.createDefaultAutoLayout();

            // If direction is null, disable layout mode (preserve positions)
            if (newValue === null) {
                updatedAutoLayout.enabled = false; // Serialization compat — containerMode (set below) is the runtime authority
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
                const currentMode = this.objectStateManager.getContainerMode(containerId);
                const mode = ObjectStateManager.resolveAutoLayoutMode(currentMode);

                this.objectStateManager.updateObject(containerId, {
                    autoLayout: fullAutoLayout,
                    ...ObjectStateManager.buildContainerModeUpdate(mode)
                }, { source: 'property-panel', immediate: true });

                // Trigger layout update for layout-capable containers
                if (this.objectStateManager.isLayoutCapableMode(containerId)) {
                    sceneController.updateContainer(containerId);
                    this.containerCrudManager.showContainer(containerId, true);
                }
                return true;
            }

            // Derive enabled from containerMode (serialization compat — containerMode is the runtime authority)
            updatedAutoLayout.enabled = this.objectStateManager.isLayoutMode(containerId);

            // Step 4: PropertyUpdateHandler → autoLayout[property] = newValue
            if (property.startsWith('autoLayout.')) {
                // Handle nested autoLayout properties (e.g., 'autoLayout.direction' -> 'direction')
                const parts = property.split('.');
                const nestedProperty = parts[1];
                if (nestedProperty === 'padding') {
                    // Handle padding sub-properties (e.g., 'autoLayout.padding.width')
                    const paddingDirection = parts[2];
                    if (!updatedAutoLayout.padding) {
                        updatedAutoLayout.padding = window.ObjectDataFormat.createDefaultPadding();
                    }
                    updatedAutoLayout.padding = { ...updatedAutoLayout.padding, [paddingDirection]: newValue };
                } else if (parts.length >= 3) {
                    // Handle 3+ level deep paths (e.g., 'autoLayout.tileMode.repeat')
                    const deepProperty = parts[2];
                    if (!updatedAutoLayout[nestedProperty] || typeof updatedAutoLayout[nestedProperty] !== 'object') {
                        updatedAutoLayout[nestedProperty] = {};
                    }
                    updatedAutoLayout[nestedProperty] = { ...updatedAutoLayout[nestedProperty], [deepProperty]: newValue };
                } else {
                    updatedAutoLayout[nestedProperty] = newValue;
                }
            } else if (property.startsWith('padding.')) {
                const paddingDirection = property.split('.')[1];
                if (!updatedAutoLayout.padding) {
                    updatedAutoLayout.padding = window.ObjectDataFormat.createDefaultPadding();
                }
                updatedAutoLayout.padding = { ...updatedAutoLayout.padding, [paddingDirection]: newValue };
            } else {
                updatedAutoLayout[property] = newValue;
            }

            // Persist via ObjectStateManager — resolve mode via centralized policy
            const currentMode = this.objectStateManager.getContainerMode(containerId);
            const targetMode = ObjectStateManager.resolveAutoLayoutMode(currentMode);
            this.objectStateManager.updateObject(containerId, {
                autoLayout: updatedAutoLayout,
                ...ObjectStateManager.buildContainerModeUpdate(targetMode)
            }, { source: 'property-panel', immediate: true });

            // Trigger layout update for layout-capable containers
            if (this.objectStateManager.isLayoutCapableMode(containerId)) {
                const layoutResult = sceneController.updateContainer(containerId);

                if (layoutResult && layoutResult.success) {
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
                    // Pass degrees directly — SceneController.updateObjectRotation() converts to radians
                    updates.rotation = {
                        [axis]: value
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

            // Handle container mode changes
            if (property === 'containerMode') {
                // Get old value for undo — containerMode is the sole authority
                const oldValue = objectData.containerMode;

                // Route through ObjectStateManager — single entry point for all state changes
                const modeUpdate = ObjectStateManager.buildContainerModeUpdate(value);
                this.objectStateManager.updateObject(objectId, modeUpdate, {
                    source: 'property-panel',
                    immediate: true
                });

                // Trigger container resize for the new mode
                if (objectData.mesh) {
                    this.containerCrudManager.resizeContainer(objectData, {
                        reason: 'mode-changed',
                        immediate: true
                    });

                    // Register with history manager for undo/redo support
                    if (oldValue !== value) {
                        const historyManager = window.modlerComponents?.historyManager;
                        if (historyManager) {
                            const command = new UpdatePropertyCommand(objectId, property, oldValue, value);
                            historyManager.executeCommand(command);
                        }
                    }
                    return true;
                }
            }

            return false;

        } catch (error) {
            console.error('PropertyUpdateHandler sizing error:', error);
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
                const layoutResult = this.sceneController.updateContainer(obj.parentContainer);

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

}

// Make PropertyUpdateHandler available globally
if (typeof window !== 'undefined') {
    window.PropertyUpdateHandler = PropertyUpdateHandler;
}