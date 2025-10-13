/**
 * Tile Tool
 * Creates tiled arrays of objects using container + layout system
 * Supports bidirectional activation: tool→object or object→tool
 * Target: ~150 lines - clean tool architecture
 */

class TileTool {
    constructor(selectionController, visualEffects) {
        this.selectionController = selectionController;
        this.visualEffects = visualEffects;

        // Track which object is being tiled
        this.targetObject = null;
        this.hoveredObject = null;

        // Get scene controller reference
        this.sceneController = null;
    }

    /**
     * Tool activation - called when tool is switched to
     */
    activate() {
        // Get scene controller
        this.sceneController = window.modlerComponents?.sceneController;

        // Check if there's already a selected object
        const selectedObjects = this.selectionController.getSelectedObjects?.() || [];
        if (selectedObjects.length === 1) {
            const objectData = this.sceneController?.getObjectByMesh?.(selectedObjects[0]);
            if (objectData && !objectData.isContainer) {
                this.targetObject = selectedObjects[0];
                this.notifyUIStateChange(true);
            }
        }
    }

    /**
     * Tool deactivation - cleanup when switching to another tool
     */
    deactivate() {
        this.clearHover();
        this.targetObject = null;
        this.notifyUIStateChange(false);
    }

    /**
     * Handle mouse hover - track hoverable objects (no visual highlight)
     */
    onHover(hit, isAltPressed) {
        if (hit && hit.object) {
            const objectData = this.sceneController?.getObjectByMesh?.(hit.object);

            // Only track non-container objects
            if (objectData && !objectData.isContainer && objectData.selectable) {
                this.hoveredObject = hit.object;
                return;
            }
        }

        this.clearHover();
    }

    /**
     * Handle click - select object to be tiled
     */
    onClick(hit, event) {
        if (hit && hit.object) {
            const objectData = this.sceneController?.getObjectByMesh?.(hit.object);

            // Filter out floor grid and non-selectable objects
            if (objectData && objectData.selectable !== false && !objectData.isContainer) {
                // Use selection controller to handle selection
                this.selectionController.handleObjectClick(hit.object, event, { toolType: 'TileTool' });

                // Track this as the target object
                this.targetObject = hit.object;
                this.notifyUIStateChange(true);
                return;
            }
        }

        // Empty space click (or non-selectable object) - clear target
        this.selectionController.handleEmptySpaceClick(event);
        this.targetObject = null;
        this.notifyUIStateChange(false);
    }

    /**
     * Create tiled container from current target object
     * Called by PropertyPanel when user configures tiling
     * @param {Object} config - {axis: 'x'|'y'|'z', repeat: number, gap: number}
     */
    createTiledContainer(config) {
        if (!this.targetObject) {
            console.error('TileTool: No target object selected');
            return null;
        }

        const { axis, repeat, gap } = config;

        if (!axis || !['x', 'y', 'z'].includes(axis)) {
            console.error('TileTool: Invalid axis:', axis);
            return null;
        }

        if (!repeat || repeat < 2) {
            console.error('TileTool: Repeat must be at least 2:', repeat);
            return null;
        }

        const objectData = this.sceneController?.getObjectByMesh?.(this.targetObject);
        if (!objectData) {
            console.error('TileTool: Could not find object data');
            return null;
        }

        // Store original object properties
        const originalPosition = objectData.mesh.position.clone();
        const originalParent = objectData.parentContainer;

        // Create container at original object position
        const containerCrud = window.modlerComponents?.containerCrudManager;
        if (!containerCrud) {
            console.error('TileTool: ContainerCrudManager not available');
            return null;
        }

        // Calculate container size based on object dimensions and tiling
        const objectSize = new THREE.Vector3();
        objectData.mesh.geometry.computeBoundingBox();
        const bbox = objectData.mesh.geometry.boundingBox;
        objectSize.set(
            bbox.max.x - bbox.min.x,
            bbox.max.y - bbox.min.y,
            bbox.max.z - bbox.min.z
        );

        const containerSize = objectSize.clone();
        containerSize[axis] = (objectSize[axis] * repeat) + (gap * (repeat - 1));

        // Create container
        const containerData = containerCrud.createContainerGeometryAtPosition(
            containerSize,
            { position: originalPosition }
        );

        if (!containerData) {
            console.error('TileTool: Failed to create container');
            return null;
        }

        // Add container to scene with same name as original object
        const addedContainer = this.sceneController.addObject(containerData.mesh, null, {
            name: objectData.name,
            parentContainer: originalParent,
            isContainer: true
        });

        // Configure container with tileMode
        const autoLayout = {
            enabled: true,
            direction: axis,
            gap: gap,
            padding: { width: 0, height: 0, depth: 0 },
            tileMode: {
                enabled: true,
                repeat: repeat,
                sourceObjectId: objectData.id
            }
        };

        // Move original object into container as first child
        this.sceneController.setParentContainer(objectData.id, addedContainer.id);

        // Create additional instances (repeat - 1) times
        for (let i = 1; i < repeat; i++) {
            // Clone the geometry and material
            const clonedGeometry = objectData.mesh.geometry.clone();
            const clonedMaterial = objectData.mesh.material.clone();

            // Create new object in the container
            const newObject = this.sceneController.addObject(clonedGeometry, clonedMaterial, {
                name: objectData.name,
                parentContainer: addedContainer.id,
                position: { x: 0, y: 0, z: 0 }
            });
        }

        // Apply layout configuration
        const objectStateManager = window.modlerComponents?.objectStateManager;
        if (objectStateManager) {
            objectStateManager.updateObject(
                addedContainer.id,
                { autoLayout: autoLayout },
                'tile-tool'
            );
        }

        // Select the container (which has the same name as the original object)
        this.selectionController.clearSelection();
        this.selectionController.select(addedContainer.mesh);

        return addedContainer;
    }

    /**
     * Check if tool has active highlight (for camera coordination)
     */
    hasActiveHighlight() {
        return this.hoveredObject !== null;
    }

    /**
     * Clear hover highlights
     */
    clearHover() {
        if (this.hoveredObject) {
            this.visualEffects.clearHighlight();
            this.hoveredObject = null;
        }
    }

    /**
     * Notify UI of tile tool state change
     */
    notifyUIStateChange(hasTarget) {
        if (window.notifyTileToolStateChanged) {
            window.notifyTileToolStateChanged({
                active: true,
                hasTarget: hasTarget,
                targetObjectId: this.targetObject ?
                    this.sceneController?.getObjectByMesh?.(this.targetObject)?.id : null
            });
        }
    }

    /**
     * Get current target object (for UI to query)
     */
    getTargetObject() {
        if (!this.targetObject) return null;
        return this.sceneController?.getObjectByMesh?.(this.targetObject);
    }
}

// Export to window
window.TileTool = TileTool;
