/**
 * Create Object Command
 * Undoable command for creating new objects in the scene
 */
class CreateObjectCommand extends BaseCommand {
    /**
     * @param {Object} geometry - THREE.js geometry for the object
     * @param {Object} material - THREE.js material for the object
     * @param {Object} options - Object creation options (name, type, position, etc.)
     */
    constructor(geometry, material, options = {}) {
        super();
        this.geometry = geometry;
        this.material = material;
        this.options = options;
        this.createdObjectId = null;
        this.objectSnapshot = null;
    }

    execute() {
        const sceneController = window.modlerComponents?.sceneController;
        if (!sceneController) {
            logger.error('CreateObjectCommand: SceneController not available');
            return false;
        }

        try {
            // Create the object
            const objectData = sceneController.addObject(this.geometry, this.material, this.options);

            if (!objectData) {
                logger.error('CreateObjectCommand: Failed to create object');
                return false;
            }

            this.createdObjectId = objectData.id;

            // Store snapshot for undo (in case we need to restore exact state)
            this.objectSnapshot = this.createObjectSnapshot(objectData);

            logger.info(`✅ Created object: ${objectData.name} (${this.createdObjectId})`);
            return true;

        } catch (error) {
            logger.error('CreateObjectCommand: Execute failed:', error);
            return false;
        }
    }

    undo() {
        if (!this.createdObjectId) {
            logger.warn('CreateObjectCommand: No object ID to undo');
            return false;
        }

        const sceneController = window.modlerComponents?.sceneController;
        if (!sceneController) {
            logger.error('CreateObjectCommand: SceneController not available for undo');
            return false;
        }

        try {
            // Remove the created object
            sceneController.removeObject(this.createdObjectId);

            // Notify via ObjectStateManager
            const objectStateManager = window.modlerComponents?.objectStateManager;
            if (objectStateManager) {
                objectStateManager.notifyObjectDeleted(this.createdObjectId);
            }

            logger.info(`↩️ Undid object creation: ${this.createdObjectId}`);
            return true;

        } catch (error) {
            logger.error('CreateObjectCommand: Undo failed:', error);
            return false;
        }
    }

    redo() {
        const sceneController = window.modlerComponents?.sceneController;
        if (!sceneController) {
            logger.error('CreateObjectCommand: SceneController not available for redo');
            return false;
        }

        if (!this.objectSnapshot) {
            logger.error('CreateObjectCommand: No snapshot available for redo');
            return false;
        }

        try {
            // Recreate the object from snapshot
            const objectData = sceneController.addObject(
                this.geometry,
                this.material,
                {
                    ...this.options,
                    id: this.createdObjectId, // Restore same ID
                    position: this.objectSnapshot.position,
                    rotation: this.objectSnapshot.rotation,
                    dimensions: this.objectSnapshot.dimensions
                }
            );

            if (!objectData) {
                logger.error('CreateObjectCommand: Failed to redo object creation');
                return false;
            }

            // Update mesh properties from snapshot
            if (objectData.mesh) {
                objectData.mesh.position.set(
                    this.objectSnapshot.position.x,
                    this.objectSnapshot.position.y,
                    this.objectSnapshot.position.z
                );
                objectData.mesh.rotation.set(
                    this.objectSnapshot.rotation.x,
                    this.objectSnapshot.rotation.y,
                    this.objectSnapshot.rotation.z
                );
            }

            logger.info(`↪️ Redid object creation: ${this.createdObjectId}`);
            return true;

        } catch (error) {
            logger.error('CreateObjectCommand: Redo failed:', error);
            return false;
        }
    }

    /**
     * Create snapshot of object state for redo
     */
    createObjectSnapshot(objectData) {
        const mesh = objectData.mesh;

        return {
            id: objectData.id,
            name: objectData.name,
            type: objectData.type,
            position: {
                x: mesh.position.x,
                y: mesh.position.y,
                z: mesh.position.z
            },
            rotation: {
                x: mesh.rotation.x,
                y: mesh.rotation.y,
                z: mesh.rotation.z
            },
            dimensions: objectData.dimensions ? { ...objectData.dimensions } : { x: 1, y: 1, z: 1 },
            material: {
                color: mesh.material.color.getHex(),
                opacity: mesh.material.opacity,
                transparent: mesh.material.transparent
            }
        };
    }

    getDescription() {
        return `Create ${this.options.name || 'object'}`;
    }
}
