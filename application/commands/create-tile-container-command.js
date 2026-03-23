import * as THREE from 'three';
/**
 * Create Tile Container Command
 * Undoable command for TileTool's createTiledContainer() operation.
 * Undo: removes instance children, moves original object back, removes container.
 * Redo: re-creates the tiled container from stored config.
 */
class CreateTileContainerCommand extends BaseCommand {
    /**
     * @param {Object} params
     * @param {string} params.containerId - ID of the created container
     * @param {string} params.originalObjectId - ID of the original (source) object
     * @param {string|null} params.originalParentId - Parent container the original was in (or null for root)
     * @param {Object} params.originalPosition - {x,y,z} world position of original object before tiling
     * @param {Object} params.config - Tile config {axis, repeat, gap}
     * @param {string[]} params.instanceChildIds - IDs of cloned instance children (NOT the original)
     */
    constructor(params) {
        super('create-tile-container', 'Create tiled container');
        this.containerId = params.containerId;
        this.originalObjectId = params.originalObjectId;
        this.originalParentId = params.originalParentId;
        this.originalPosition = params.originalPosition;
        this.config = params.config;
        this.instanceChildIds = params.instanceChildIds || [];
        this.originalName = params.originalName;
    }

    execute() {
        // Tile container already created by TileTool — post-hoc registration
        return true;
    }

    undo() {
        try {
            const sceneController = window.modlerComponents?.sceneController;
            const selectionController = window.modlerComponents?.selectionController;

            if (!sceneController) {
                console.error('CreateTileContainerCommand: SceneController not available for undo');
                return false;
            }

            // Clear selection first
            if (selectionController) {
                selectionController.clearSelection();
            }

            // Step 1: Remove cloned instance children (not the original)
            for (const childId of this.instanceChildIds) {
                if (sceneController.getObject(childId)) {
                    sceneController.removeObject(childId);
                }
            }

            // Step 2: Move original object back to its old parent (or root)
            const originalObj = sceneController.getObject(this.originalObjectId);
            if (originalObj) {
                sceneController.setParentContainer(this.originalObjectId, this.originalParentId || null, false);

                // Restore original position
                if (this.originalPosition && originalObj.mesh) {
                    originalObj.mesh.position.set(
                        this.originalPosition.x,
                        this.originalPosition.y,
                        this.originalPosition.z
                    );
                    originalObj.position = { ...this.originalPosition };
                }
            }

            // Step 3: Remove the container itself
            if (sceneController.getObject(this.containerId)) {
                sceneController.removeObject(this.containerId);
            }

            // Step 4: Re-select the original object
            if (originalObj?.mesh && selectionController) {
                selectionController.select(originalObj.mesh);
            }

            // Step 5: Trigger parent layout if original was in a container
            if (this.originalParentId && sceneController.getObject(this.originalParentId)) {
                sceneController.updateContainer(this.originalParentId);
            }

            return true;
        } catch (error) {
            console.error('CreateTileContainerCommand: Undo failed:', error);
            return false;
        }
    }

    redo() {
        try {
            const sceneController = window.modlerComponents?.sceneController;
            const containerCrudManager = window.modlerComponents?.containerCrudManager;
            const objectStateManager = window.modlerComponents?.objectStateManager;
            const selectionController = window.modlerComponents?.selectionController;

            if (!sceneController || !containerCrudManager) {
                console.error('CreateTileContainerCommand: Required components not available for redo');
                return false;
            }

            const originalObj = sceneController.getObject(this.originalObjectId);
            if (!originalObj) {
                console.error('CreateTileContainerCommand: Original object not found for redo');
                return false;
            }

            const { axis, repeat, gap } = this.config;

            // Calculate container size
            const objectSize = new THREE.Vector3();
            originalObj.mesh.geometry.computeBoundingBox();
            const bbox = originalObj.mesh.geometry.boundingBox;
            objectSize.set(bbox.max.x - bbox.min.x, bbox.max.y - bbox.min.y, bbox.max.z - bbox.min.z);

            const containerSize = objectSize.clone();
            containerSize[axis] = (objectSize[axis] * repeat) + (gap * (repeat - 1));

            // Re-create container
            const containerData = containerCrudManager.createContainerGeometryAtPosition(
                containerSize,
                { position: originalObj.mesh.position.clone() }
            );

            if (!containerData) return false;

            const addedContainer = sceneController.addObject(containerData.mesh, null, {
                name: this.originalName || originalObj.name,
                parentContainer: this.originalParentId,
                isContainer: true,
                containerMode: 'layout'
            });

            // Update stored container ID for future undo/redo
            this.containerId = addedContainer.id;

            // Move original into container
            sceneController.setParentContainer(this.originalObjectId, addedContainer.id);

            // Create instances with matching rotation
            const sourceRotation = {
                x: (originalObj.mesh.rotation.x * 180) / Math.PI,
                y: (originalObj.mesh.rotation.y * 180) / Math.PI,
                z: (originalObj.mesh.rotation.z * 180) / Math.PI
            };

            this.instanceChildIds = [];
            for (let i = 1; i < repeat; i++) {
                const clonedGeometry = originalObj.mesh.geometry.clone();
                const clonedMaterial = originalObj.mesh.material.clone();

                const instance = sceneController.addObject(clonedGeometry, clonedMaterial, {
                    name: originalObj.name,
                    parentContainer: addedContainer.id,
                    position: { x: 0, y: 0, z: 0 },
                    rotation: sourceRotation
                });
                this.instanceChildIds.push(instance.id);
            }

            // Apply tile layout config
            const autoLayout = {
                ...(window.ObjectDataFormat?.createDefaultAutoLayout?.() || {
                    enabled: false, direction: null, gap: 0,
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
                    sourceObjectId: this.originalObjectId
                }
            };

            if (objectStateManager) {
                objectStateManager.updateObject(addedContainer.id, {
                    autoLayout,
                    ...ObjectStateManager.buildContainerModeUpdate('layout')
                }, 'tile-tool-redo');
            }

            // Select the container
            if (selectionController) {
                selectionController.clearSelection();
                selectionController.select(addedContainer.mesh);
            }

            return true;
        } catch (error) {
            console.error('CreateTileContainerCommand: Redo failed:', error);
            return false;
        }
    }
}

window.CreateTileContainerCommand = CreateTileContainerCommand;
