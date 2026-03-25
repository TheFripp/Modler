/**
 * OsmSceneSync - SceneController synchronization for ObjectStateManager
 *
 * Extracted from ObjectStateManager to separate geometry application,
 * property sync, container update triggering, and padding visualization
 * from core state management.
 */

class OsmSceneSync {
    constructor(osm) {
        this.osm = osm;
    }

    get sceneController() { return this.osm.sceneController; }

    /**
     * Sync all changed objects to SceneController.
     * Applies geometry, syncs properties, triggers layout, and updates padding visuals.
     */
    sync(changedItems) {
        if (!this.sceneController) return;

        changedItems.forEach(({ object, source, options }) => {
            // PROXY PATTERN: Apply ALL geometry updates directly to SceneController
            // SceneController is the single source of truth for all 3D properties

            // Handle parent container changes (drag-and-drop in object tree)
            if (object._changedProperties?.has('parentContainer')) {
                this.sceneController.setParentContainer(object.id, object.parentContainer, true);
            }

            // Check if layout propagation should be skipped (optimization for material/transform changes)
            const skipLayoutPropagation = options?.skipLayoutPropagation || false;

            // Apply dimension updates (triggers parent layout on change, UNLESS source is push-tool or skipLayoutPropagation is true)
            // Push tool suppresses layout updates during drag for performance and to prevent container movement
            const shouldTriggerLayout = source !== 'push-tool' && !skipLayoutPropagation;
            this.applyGeometryUpdate(object, 'Dimension', 'updateObjectDimensions', shouldTriggerLayout);

            // Apply position updates
            this.applyGeometryUpdate(object, 'Position', 'updateObjectPosition', false);

            // Apply rotation updates (triggers parent layout — rotated AABB affects container sizing)
            this.applyGeometryUpdate(object, 'Rotation', 'updateObjectRotation', shouldTriggerLayout);

            // Sync non-geometry properties to SceneController first (needed for layout)
            const sceneObject = this.sceneController.getObject(object.id);
            if (sceneObject) {
                sceneObject.name = object.name;

                // Sync container mode so SceneLayoutManager gate checks match OSM
                if (object.isContainer && object.containerMode) {
                    sceneObject.containerMode = object.containerMode;
                }

                // SCHEMA-FIRST: Always sync autoLayout for containers, use schema defaults if needed
                if (object.isContainer) {
                    sceneObject.autoLayout = object.autoLayout ||
                        window.ObjectDataFormat.createDefaultAutoLayout();
                }

                // LAYOUT PROPERTIES: Sync layoutProperties for all objects (layout engine reads from SceneController)
                if (object.layoutProperties) {
                    sceneObject.layoutProperties = object.layoutProperties;
                }

                // Yard fixed dimensions — sync to SceneController and mesh.userData
                if (object._changedProperties?.has('yardFixed')) {
                    sceneObject.yardFixed = object.yardFixed;
                    if (sceneObject.mesh) {
                        sceneObject.mesh.userData.yardFixed = object.yardFixed;
                    }
                }
            }

            // Update container layout if needed (TOP-DOWN PROPAGATION)
            // UNIFIED: SceneLayoutManager.updateContainer() handles all mode routing
            if (object.isContainer && sceneObject) {
                if (this.shouldTriggerContainerUpdate(object.id, object._changedProperties, source, options)) {
                    this.sceneController.updateContainer(object.id);
                }

                // Show padding visualization if padding is set
                const visualEffects = this.osm.getVisualEffects();
                if (visualEffects && object.autoLayout?.padding) {
                    visualEffects.showPaddingVisualization(sceneObject.mesh, object.autoLayout.padding);
                } else if (visualEffects) {
                    visualEffects.hidePaddingVisualization(sceneObject.mesh);
                }

                // BOTTOM-UP PROPAGATION: Container size changed → schedule grandparent layout update
                this.osm.scheduleParentLayoutUpdate(object.id);
            }

            // CHILD LAYOUT PROPERTIES CHANGED: Trigger parent container layout update
            const layoutPropertiesChanged = object._changedProperties?.has('layoutProperties') ||
                Array.from(object._changedProperties || []).some(prop => prop.startsWith('layoutProperties.'));

            if (layoutPropertiesChanged && object.parentContainer && !object.isContainer) {
                // Child sizing changed → parent needs to recalculate layout
                this.sceneController.updateContainer(object.parentContainer);
            }
        });
    }

    /**
     * Apply geometry updates (dimension/position/rotation) to SceneController.
     * Handles the repeated pattern of: apply updates → sync back → trigger layout.
     */
    applyGeometryUpdate(object, updateType, sceneMethodName, triggerLayout = false) {
        const pendingKey = `_pending${updateType}Updates`;
        const propertyKey = updateType.toLowerCase();
        const sceneMethod = this.sceneController[sceneMethodName];

        if (!object[pendingKey] || !sceneMethod) return;

        // Apply updates to SceneController
        const updates = object[pendingKey];
        Object.entries(updates).forEach(([axis, value]) => {
            sceneMethod.call(this.sceneController, object.id, axis, value);
        });
        delete object[pendingKey];

        // Sync back from SceneController (single source of truth)
        // CRITICAL: Read directly from THREE.js mesh for position/rotation (tools mutate mesh directly)
        const sceneObject = this.sceneController.getObject(object.id);
        if (sceneObject?.mesh) {
            if (propertyKey === 'position' && sceneObject.mesh.position) {
                object.position = {
                    x: sceneObject.mesh.position.x,
                    y: sceneObject.mesh.position.y,
                    z: sceneObject.mesh.position.z
                };
            } else if (propertyKey === 'rotation' && sceneObject.mesh.rotation) {
                object.rotation = {
                    x: (sceneObject.mesh.rotation.x * 180) / Math.PI,
                    y: (sceneObject.mesh.rotation.y * 180) / Math.PI,
                    z: (sceneObject.mesh.rotation.z * 180) / Math.PI
                };
            } else if (propertyKey === 'dimension') {
                const dimensions = window.dimensionManager?.getDimensions(sceneObject.mesh);
                if (dimensions) {
                    object.dimensions = { ...dimensions };
                }
            }
        }

        // Trigger parent layout update if needed (BOTTOM-UP PROPAGATION)
        if (triggerLayout) {
            this.osm.scheduleParentLayoutUpdate(object.id);
        }
    }

    /**
     * Determine if container layout should be recalculated.
     */
    shouldTriggerContainerUpdate(objectId, changedProperties, source, options = {}) {
        if (source === 'push-tool' || options?.skipLayout) return false;

        const object = this.osm.getObject(objectId);
        if (!object?.isContainer) return false;

        return changedProperties.has('autoLayout') ||
            [...changedProperties].some(p => p.startsWith('autoLayout.')) ||
            changedProperties.has('dimensions');
    }
}

window.OsmSceneSync = OsmSceneSync;
