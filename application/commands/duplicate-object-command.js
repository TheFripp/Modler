/**
 * Duplicate Object Command
 * Undoable command for duplicating objects in the scene
 */
class DuplicateObjectCommand extends BaseCommand {
    /**
     * @param {number} sourceObjectId - ID of the object to duplicate
     */
    constructor(sourceObjectId) {
        super();
        this.sourceObjectId = sourceObjectId;
        this.duplicatedObjectId = null;
        this.objectSnapshot = null;
    }

    execute() {
        const sceneController = window.modlerComponents?.sceneController;
        if (!sceneController) {
            logger.error('DuplicateObjectCommand: SceneController not available');
            return false;
        }

        try {
            // Get source object
            const sourceObject = sceneController.getObject(this.sourceObjectId);
            if (!sourceObject) {
                logger.error('DuplicateObjectCommand: Source object not found');
                return false;
            }

            // Create new geometry using GeometryFactory
            const geometryFactory = new GeometryFactory();
            const geometry = geometryFactory.createBoxGeometry(
                sourceObject.dimensions.x,
                sourceObject.dimensions.y,
                sourceObject.dimensions.z
            );

            // Clone material
            const material = sourceObject.mesh.material.clone();

            // Extract position from mesh
            const position = sourceObject.mesh ? {
                x: sourceObject.mesh.position.x,
                y: sourceObject.mesh.position.y,
                z: sourceObject.mesh.position.z
            } : { x: 0, y: 0, z: 0 };

            // Extract rotation from mesh (if not default)
            const rotation = sourceObject.mesh &&
                (sourceObject.mesh.rotation.x !== 0 ||
                 sourceObject.mesh.rotation.y !== 0 ||
                 sourceObject.mesh.rotation.z !== 0) ? {
                x: sourceObject.mesh.rotation.x,
                y: sourceObject.mesh.rotation.y,
                z: sourceObject.mesh.rotation.z
            } : null;

            // Create duplicate options based on source object
            const options = {
                name: `${sourceObject.name} Copy`,
                type: sourceObject.type,
                position: position,
                dimensions: { ...sourceObject.dimensions },
                parentContainer: sourceObject.parentContainer, // Keep in same container
                fillAxes: sourceObject.fillAxes ? [...sourceObject.fillAxes] : []
            };

            // Only include rotation if it's not default (0,0,0)
            if (rotation) {
                options.rotation = rotation;
            }

            // Create the duplicate object
            const duplicatedObject = sceneController.addObject(geometry, material, options);

            if (!duplicatedObject) {
                logger.error('DuplicateObjectCommand: Failed to create duplicate');
                return false;
            }

            this.duplicatedObjectId = duplicatedObject.id;

            // Store snapshot for undo
            this.objectSnapshot = this.createObjectSnapshot(duplicatedObject);

            // If in a container, add to the container's childrenOrder after the source object
            if (sourceObject.parentContainer) {
                const parentContainer = sceneController.getObject(sourceObject.parentContainer);
                if (parentContainer && parentContainer.childrenOrder) {
                    const sourceIndex = parentContainer.childrenOrder.indexOf(this.sourceObjectId);
                    if (sourceIndex !== -1) {
                        // Insert duplicate right after source
                        parentContainer.childrenOrder.splice(sourceIndex + 1, 0, this.duplicatedObjectId);

                        // Trigger layout update if container has auto-layout
                        if (parentContainer.autoLayout?.enabled) {
                            sceneController.updateLayout(parentContainer.id);
                        }
                    }
                }
            }

            logger.info(`✨ Duplicated object ${this.sourceObjectId} → ${this.duplicatedObjectId}`);
            return true;

        } catch (error) {
            logger.error('DuplicateObjectCommand: Execute failed:', error);
            return false;
        }
    }

    undo() {
        if (!this.duplicatedObjectId) {
            logger.warn('DuplicateObjectCommand: No duplicated object ID to undo');
            return false;
        }

        const sceneController = window.modlerComponents?.sceneController;
        if (!sceneController) {
            logger.error('DuplicateObjectCommand: SceneController not available for undo');
            return false;
        }

        try {
            // Get parent container before removing
            const duplicatedObject = sceneController.getObject(this.duplicatedObjectId);
            const parentContainerId = duplicatedObject?.parentContainer;

            // Remove the duplicated object
            sceneController.removeObject(this.duplicatedObjectId);

            // Notify via ObjectStateManager
            const objectStateManager = window.modlerComponents?.objectStateManager;
            if (objectStateManager) {
                objectStateManager.notifyObjectDeleted(this.duplicatedObjectId);
            }

            // Trigger layout update if was in a container
            if (parentContainerId) {
                const parentContainer = sceneController.getObject(parentContainerId);
                if (parentContainer?.autoLayout?.enabled) {
                    sceneController.updateLayout(parentContainerId);
                }
            }

            logger.info(`↩️ Undid duplicate: removed ${this.duplicatedObjectId}`);
            return true;

        } catch (error) {
            logger.error('DuplicateObjectCommand: Undo failed:', error);
            return false;
        }
    }

    redo() {
        // For redo, we can't use the original execute() because geometry/material might be disposed
        // Instead, we need to recreate from the snapshot
        const sceneController = window.modlerComponents?.sceneController;
        if (!sceneController || !this.objectSnapshot) {
            logger.error('DuplicateObjectCommand: Cannot redo - missing dependencies');
            return false;
        }

        try {
            // Recreate geometry from snapshot using GeometryFactory
            const geometryFactory = new GeometryFactory();
            const geometry = geometryFactory.createBoxGeometry(
                this.objectSnapshot.dimensions.x,
                this.objectSnapshot.dimensions.y,
                this.objectSnapshot.dimensions.z
            );

            // Recreate material from snapshot
            const material = new THREE.MeshLambertMaterial({
                color: this.objectSnapshot.material.color
            });

            // Recreate with same options
            const options = {
                name: this.objectSnapshot.name,
                type: this.objectSnapshot.type,
                position: { ...this.objectSnapshot.position },
                dimensions: { ...this.objectSnapshot.dimensions },
                parentContainer: this.objectSnapshot.parentContainer,
                fillAxes: this.objectSnapshot.fillAxes ? [...this.objectSnapshot.fillAxes] : []
            };

            // Only include rotation if it exists in snapshot
            if (this.objectSnapshot.rotation) {
                options.rotation = { ...this.objectSnapshot.rotation };
            }

            const duplicatedObject = sceneController.addObject(geometry, material, options);

            if (!duplicatedObject) {
                logger.error('DuplicateObjectCommand: Redo failed to create object');
                return false;
            }

            this.duplicatedObjectId = duplicatedObject.id;

            // Re-add to container's childrenOrder if needed
            if (this.objectSnapshot.parentContainer) {
                const parentContainer = sceneController.getObject(this.objectSnapshot.parentContainer);
                if (parentContainer && parentContainer.childrenOrder) {
                    const sourceIndex = parentContainer.childrenOrder.indexOf(this.sourceObjectId);
                    if (sourceIndex !== -1) {
                        parentContainer.childrenOrder.splice(sourceIndex + 1, 0, this.duplicatedObjectId);

                        if (parentContainer.autoLayout?.enabled) {
                            sceneController.updateLayout(parentContainer.id);
                        }
                    }
                }
            }

            logger.info(`↪️ Redid duplicate: ${this.duplicatedObjectId}`);
            return true;

        } catch (error) {
            logger.error('DuplicateObjectCommand: Redo failed:', error);
            return false;
        }
    }

    getMetadata() {
        return {
            type: 'duplicate-object',
            objectId: this.sourceObjectId,
            duplicatedId: this.duplicatedObjectId,
            description: `Duplicate object ${this.sourceObjectId}`
        };
    }

    /**
     * Create a snapshot of object data for redo
     */
    createObjectSnapshot(objectData) {
        // Extract position from mesh
        const position = objectData.mesh ? {
            x: objectData.mesh.position.x,
            y: objectData.mesh.position.y,
            z: objectData.mesh.position.z
        } : { x: 0, y: 0, z: 0 };

        const snapshot = {
            id: objectData.id,
            name: objectData.name,
            type: objectData.type,
            position: position,
            dimensions: { ...objectData.dimensions },
            parentContainer: objectData.parentContainer,
            fillAxes: objectData.fillAxes ? [...objectData.fillAxes] : [],
            material: {
                color: objectData.mesh.material.color.getHex()
            }
        };

        // Only include rotation if it's not default (0,0,0)
        if (objectData.mesh &&
            (objectData.mesh.rotation.x !== 0 ||
             objectData.mesh.rotation.y !== 0 ||
             objectData.mesh.rotation.z !== 0)) {
            snapshot.rotation = {
                x: objectData.mesh.rotation.x,
                y: objectData.mesh.rotation.y,
                z: objectData.mesh.rotation.z
            };
        }

        return snapshot;
    }
}

// Make available globally
window.DuplicateObjectCommand = DuplicateObjectCommand;
