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

    get containerManager() {
        return window.modlerComponents?.containerManager;
    }

    get unifiedContainerManager() {
        return window.modlerComponents?.unifiedContainerManager;
    }

    /**
     * Handle container layout property changes from property panel
     * Implements the corrected flow from container-architecture-master.md lines 138-151
     */
    handleContainerLayoutPropertyChange(containerId, property, newValue) {

        if (!this.sceneController || !this.containerManager || !this.unifiedContainerManager) {
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
            console.log('🔧 Final autoLayout config:', objectData.autoLayout);

            console.log('🔧 Layout mode activated for container:', objectData.name);

            // Step 5: PropertyUpdateHandler → sceneController.updateLayout(objectData.id)
            console.log('🔧 Calling sceneController.updateLayout with container:', {
                containerId: objectData.id,
                containerName: objectData.name,
                autoLayout: objectData.autoLayout,
                hasUpdateLayoutMethod: !!this.sceneController.updateLayout
            });
            const layoutResult = sceneController.updateLayout(objectData.id);
            console.log('🔧 Layout result:', layoutResult);

            if (layoutResult && layoutResult.success) {
                // Step 10: PropertyUpdateHandler → containerManager.resizeContainerToLayoutBounds(layoutBounds)
                if (layoutResult.layoutBounds) {
                    this.containerManager.resizeContainerToLayoutBounds(objectData, layoutResult.layoutBounds);
                }

                // Step 13: PropertyUpdateHandler → unifiedContainerManager.showContainer(containerId, true)
                this.unifiedContainerManager.showContainer(objectData.id, true);

                // Show layout axis guides when layout is enabled
                const visualEffects = window.modlerComponents?.visualEffects;
                if (visualEffects && objectData.mesh && objectData.autoLayout.direction) {
                    visualEffects.showLayoutAxisGuides(objectData.mesh, objectData.autoLayout.direction);
                }

                console.log('✅ Container switched to LAYOUT mode with smart rule-based positioning');
                return true;
            } else {
                console.error('Layout update failed for container:', containerId);
                return false;
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
     * Handle general property changes - routes to appropriate handler
     */
    handlePropertyChange(objectId, property, value) {
        console.log('🔧 PropertyUpdateHandler.handlePropertyChange called with:', { objectId, property, value });

        // CRITICAL FIX: Use the same SceneController instance as PropertyManager
        const sceneController = window.modlerComponents?.sceneController || this.sceneController;
        const objectData = sceneController?.getObject(objectId);
        console.log('🔧 Object data found:', {
            hasObjectData: !!objectData,
            objectName: objectData?.name,
            isContainer: objectData?.isContainer,
            objectType: objectData?.type
        });

        const isLayoutProp = this.isLayoutProperty(property);
        console.log('🔧 Property classification:', {
            property: property,
            isLayoutProperty: isLayoutProp,
            layoutProperties: ['direction', 'gap', 'padding.top', 'padding.bottom', 'padding.left', 'padding.right', 'padding.front', 'padding.back']
        });

        // Check if this is a container layout property change
        if (objectData && objectData.isContainer && isLayoutProp) {
            console.log('🔧 Routing to handleContainerLayoutPropertyChange');
            return this.handleContainerLayoutPropertyChange(objectId, property, value);
        }

        // Handle other property changes here in the future
        console.log('🔧 Property change (non-layout):', { objectId, property, value, reason: {
            hasObjectData: !!objectData,
            isContainer: objectData?.isContainer,
            isLayoutProperty: isLayoutProp
        }});
        return true;
    }
}

// Make PropertyUpdateHandler available globally
if (typeof window !== 'undefined') {
    window.PropertyUpdateHandler = PropertyUpdateHandler;
}