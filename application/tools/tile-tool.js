import * as THREE from 'three';
/**
 * Tile Tool
 * Creates tiled arrays of objects using container + layout system
 * Supports bidirectional activation: tool→object or object→tool
 * Extends BaseTool — default click delegation, lifecycle, component getters inherited
 */

class TileTool extends BaseTool {
    constructor(selectionController, visualEffects) {
        super(selectionController, visualEffects);
        this.targetObject = null;
    }

    activate() {
        // Check if there's already a selected object
        const selectedObjects = this.selectionController.getSelectedObjects?.() || [];
        if (selectedObjects.length === 1) {
            const objectData = this.getObjectData(selectedObjects[0]);
            if (objectData && !objectData.isContainer) {
                this.targetObject = selectedObjects[0];
                this.notifyUIStateChange(true);
            }
        }
    }

    deactivate() {
        this.clearHover();
        this.targetObject = null;
        this.notifyUIStateChange(false);
    }

    onHover(hit, isAltPressed) {
        if (hit && hit.object) {
            const objectData = this.getObjectData(hit.object);

            // Only track non-container objects
            if (objectData && !objectData.isContainer && objectData.selectable) {
                this.hoveredObject = hit.object;
                return;
            }
        }

        this.clearHover();
    }

    onClick(hit, event) {
        if (hit && hit.object) {
            const objectData = this.getObjectData(hit.object);

            // Filter out floor grid and non-selectable objects
            if (objectData && objectData.selectable !== false && !objectData.isContainer) {
                this.selectionController.handleObjectClick(hit.object, event, { toolType: 'TileTool' });
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

        const objectData = this.getObjectData(this.targetObject);
        if (!objectData) {
            console.error('TileTool: Could not find object data');
            return null;
        }

        // Store original object properties
        const originalPosition = objectData.mesh.position.clone();
        const originalParent = objectData.parentContainer;

        if (!this.containerCrudManager) {
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
        const containerData = this.containerCrudManager.createContainerGeometryAtPosition(
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
        // SCHEMA-FIRST: Start with default schema, then override specific properties
        const autoLayout = {
            ...(window.ObjectDataFormat?.createDefaultAutoLayout?.() || {
                enabled: false,
                direction: null,
                gap: 0,
                padding: { width: 0, height: 0, depth: 0 },
                alignment: { x: 'center', y: 'center', z: 'center' },
                reversed: false
            }),
            enabled: true,
            direction: axis,
            gap: gap,
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
            const clonedGeometry = objectData.mesh.geometry.clone();
            const clonedMaterial = objectData.mesh.material.clone();

            this.sceneController.addObject(clonedGeometry, clonedMaterial, {
                name: objectData.name,
                parentContainer: addedContainer.id,
                position: { x: 0, y: 0, z: 0 }
            });
        }

        // Apply layout configuration
        if (this.objectStateManager) {
            this.objectStateManager.updateObject(
                addedContainer.id,
                { autoLayout: autoLayout },
                'tile-tool'
            );
        }

        // Select the container
        this.selectionController.clearSelection();
        this.selectionController.select(addedContainer.mesh);

        return addedContainer;
    }

    hasActiveHighlight() {
        return this.hoveredObject !== null;
    }

    clearHover() {
        if (this.hoveredObject) {
            this.visualEffects.clearHighlight();
            this.hoveredObject = null;
        }
    }

    notifyUIStateChange(hasTarget) {
        if (window.notifyTileToolStateChanged) {
            window.notifyTileToolStateChanged({
                active: true,
                hasTarget: hasTarget,
                targetObjectId: this.targetObject ?
                    this.getObjectData(this.targetObject)?.id : null
            });
        }
    }

    getTargetObject() {
        if (!this.targetObject) return null;
        return this.getObjectData(this.targetObject);
    }
}

window.TileTool = TileTool;
