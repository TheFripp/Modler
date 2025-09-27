// Property Update Handler - Property-panel driven layout system
// Implements the corrected architecture from container-architecture-master.md

class PropertyUpdateHandler {
    constructor() {
        // Don't store references during construction - get them on demand
        // This prevents initialization order issues
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
                    padding: { top: 0, bottom: 0, left: 0, right: 0, front: 0, back: 0 }
                };
            }

            // If direction is null, disable layout mode (preserve positions)
            if (newValue === null) {
                objectData.autoLayout.enabled = false;
                objectData.autoLayout.direction = null;

                // Switch container to hug mode without moving objects
                // No layout update needed - just preserve current positions
                return true;
            }

            // Enable layout mode
            objectData.autoLayout.enabled = true;

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
        const layoutProperties = ['direction', 'gap', 'padding.top', 'padding.bottom', 'padding.left', 'padding.right', 'padding.front', 'padding.back'];
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

        // Handle dimension property changes through centralized system
        if (property.startsWith('dimensions.')) {
            return this.handleObjectDimensionChange(objectId, property, value);
        }

        // Handle transform property changes (position, rotation)
        if (property.startsWith('position.') || property.startsWith('rotation.')) {
            return this.handleObjectTransformChange(objectId, property, value);
        }

        // Handle material property changes
        if (property.startsWith('material.')) {
            return this.handleObjectMaterialChange(objectId, property, value);
        }

        // Handle container sizing property changes
        if (objectData && objectData.isContainer && this.isContainerSizingProperty(property)) {
            return this.handleContainerSizingChange(objectId, property, value);
        }

        // Handle other property changes here in the future
        return true;
    }

    /**
     * Handle object dimension changes using centralized system
     */
    handleObjectDimensionChange(objectId, property, value) {
        if (!this.sceneController) {
            console.error('SceneController not available for dimension change');
            return false;
        }

        try {
            const axis = property.split('.')[1];
            if (!['x', 'y', 'z'].includes(axis)) {
                console.error('Invalid dimension axis:', axis);
                return false;
            }

            // Use SceneController's updateObjectDimensions for CAD-style updates
            const success = this.sceneController.updateObjectDimensions(objectId, axis, value);

            if (success) {

                // Trigger container updates if object is in a container
                const objectData = this.sceneController.getObject(objectId);
                if (objectData?.parentContainer) {
                    // Use MovementUtils for consistent container update behavior
                    const MovementUtils = window.MovementUtils;
                    if (MovementUtils) {
                        MovementUtils.updateParentContainer(objectData.mesh, false, null, null, true);
                    }
                }

                return true;
            } else {
                console.error('Failed to update dimension:', { objectId, property, value });
                return false;
            }
        } catch (error) {
            console.error('PropertyUpdateHandler dimension error:', error);
            return false;
        }
    }

    /**
     * Handle object transform changes (position, rotation)
     */
    handleObjectTransformChange(objectId, property, value) {
        if (!this.sceneController) {
            console.error('SceneController not available for transform change');
            return false;
        }

        try {
            const objectData = this.sceneController.getObject(objectId);
            if (!objectData?.mesh) {
                console.error('Object or mesh not found:', objectId);
                return false;
            }

            const mesh = objectData.mesh;

            // Handle position updates
            if (property.startsWith('position.')) {
                const axis = property.split('.')[1];
                if (['x', 'y', 'z'].includes(axis)) {
                    mesh.position[axis] = value;

                    // Trigger transform notification for container updates
                    this.sceneController.notifyObjectTransformChanged(objectId);
                    return true;
                }
            }

            // Handle rotation updates
            if (property.startsWith('rotation.')) {
                const axis = property.split('.')[1];
                if (['x', 'y', 'z'].includes(axis)) {
                    // Convert degrees to radians
                    mesh.rotation[axis] = value * Math.PI / 180;

                    // Trigger transform notification
                    this.sceneController.notifyObjectTransformChanged(objectId);
                    return true;
                }
            }

            return false;
        } catch (error) {
            console.error('PropertyUpdateHandler transform error:', error);
            return false;
        }
    }

    /**
     * Handle object material changes using centralized system
     */
    handleObjectMaterialChange(objectId, property, value) {
        if (!this.sceneController) {
            console.error('SceneController not available for material change');
            return false;
        }

        try {
            const objectData = this.sceneController.getObject(objectId);
            if (!objectData?.mesh?.material) {
                console.error('Object, mesh, or material not found:', objectId);
                return false;
            }

            const mesh = objectData.mesh;
            const materialProp = property.split('.')[1];

            // Handle different material properties
            if (materialProp === 'color') {
                const colorValue = typeof value === 'string' ? value.replace('#', '0x') : value;
                mesh.material.color.setHex(colorValue);
            } else if (materialProp === 'opacity') {
                mesh.material.opacity = value;
                mesh.material.transparent = value < 1;
            } else {
                console.error('Unknown material property:', materialProp);
                return false;
            }

            // Mark material for update and trigger visual completion
            mesh.material.needsUpdate = true;

            // Use completeObjectModification pattern for consistency
            const MovementUtils = window.MovementUtils;
            if (MovementUtils) {
                MovementUtils.completeObjectModification(mesh, 'material', true);
            }

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