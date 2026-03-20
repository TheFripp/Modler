import * as THREE from 'three';
const logger = window.logger;
/**
 * Duplicate Object Command
 * Undoable command for duplicating objects in the scene
 */
class DuplicateObjectCommand extends BaseCommand {
    /**
     * @param {number} sourceObjectId - ID of the object to duplicate
     */
    constructor(sourceObjectId, options = {}) {
        super();
        this.sourceObjectId = sourceObjectId;
        this.duplicatedObjectId = null;
        this.objectSnapshot = null;
        this.options = options; // { position, customName, skipChildren }
    }

    /**
     * Create geometry based on object type
     * Future-proof: supports box, sphere, cylinder, and extensible for new types
     */
    createGeometryForType(objectData) {
        const geometryFactory = new GeometryFactory();
        const dims = objectData.dimensions;

        switch(objectData.type) {
            case 'box':
            case 'cube': // Legacy type name
            case 'container': // containers use box geometry
                return geometryFactory.createBoxGeometry(dims.x, dims.y, dims.z);

            case 'sphere':
                // Calculate radius from dimensions (assuming spherical)
                const radius = Math.max(dims.x, dims.y, dims.z) / 2;
                return geometryFactory.createSphereGeometry(radius);

            case 'cylinder':
                // TODO: Add cylinder support when GeometryFactory implements it
                logger.warn('Cylinder duplication not yet implemented, using box fallback');
                return geometryFactory.createBoxGeometry(dims.x, dims.y, dims.z);

            default:
                // Default fallback for unknown types
                logger.warn(`Unknown object type "${objectData.type}", using box geometry as fallback`);
                return geometryFactory.createBoxGeometry(dims.x, dims.y, dims.z);
        }
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

            // If duplicating a container, use recursive container duplication
            if (sourceObject.isContainer) {
                return this.duplicateContainer(sourceObject, sceneController);
            }

            // Otherwise, duplicate as regular object
            return this.duplicateRegularObject(sourceObject, sceneController);

        } catch (error) {
            logger.error('DuplicateObjectCommand: Execute failed:', error);
            return false;
        }
    }

    duplicateRegularObject(sourceObject, sceneController) {
        // Create geometry based on object type (supports box, sphere, cylinder, etc.)
        const geometry = this.createGeometryForType(sourceObject);

        // Clone material
        const material = sourceObject.mesh.material.clone();

        // Use custom position if provided, otherwise use source position
        const position = this.options.position || (sourceObject.mesh ? {
            x: sourceObject.mesh.position.x,
            y: sourceObject.mesh.position.y,
            z: sourceObject.mesh.position.z
        } : { x: 0, y: 0, z: 0 });

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
            name: this.options.customName || `${sourceObject.name} Copy`,
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
    }

    duplicateContainer(sourceContainer, sceneController) {
        const objectStateManager = window.modlerComponents?.objectStateManager;
        const containerCrudManager = window.modlerComponents?.containerCrudManager;

        if (!objectStateManager || !containerCrudManager) {
            logger.error('DuplicateObjectCommand: Required managers not available');
            return false;
        }

        // Use custom position if provided (e.g., from Cmd+drag), otherwise use source position
        const position = this.options.position || (sourceContainer.mesh ? {
            x: sourceContainer.mesh.position.x,
            y: sourceContainer.mesh.position.y,
            z: sourceContainer.mesh.position.z
        } : { x: 0, y: 0, z: 0 });

        // Comprehensive logging for debugging
        logger.info(`=== CONTAINER DUPLICATION START ===`);
        logger.info(`  Source container: ${this.sourceObjectId} "${sourceContainer.name}"`);
        logger.info(`  Source position: (${sourceContainer.mesh?.position.x}, ${sourceContainer.mesh?.position.y}, ${sourceContainer.mesh?.position.z})`);
        logger.info(`  Options.position provided: ${this.options.position ? `(${this.options.position.x}, ${this.options.position.y}, ${this.options.position.z})` : 'NO - using source position'}`);
        logger.info(`  Target position: (${position.x}, ${position.y}, ${position.z})`);
        logger.info(`  Position delta: ${this.options.position ? `(${position.x - sourceContainer.mesh.position.x}, ${position.y - sourceContainer.mesh.position.y}, ${position.z - sourceContainer.mesh.position.z})` : 'N/A'}`);

        // Create container geometry using factory (same as createAndRegisterContainer)
        const size = new THREE.Vector3(
            sourceContainer.dimensions.x,
            sourceContainer.dimensions.y,
            sourceContainer.dimensions.z
        );
        const containerData = containerCrudManager.createContainerGeometryWithFactories(size);

        if (!containerData || !containerData.mesh) {
            logger.error('DuplicateObjectCommand: Failed to create container geometry');
            return false;
        }

        // Create the container copy with all container properties
        const containerOptions = {
            name: this.options.customName || `${sourceContainer.name} Copy`,
            type: sourceContainer.type,
            position: position,
            dimensions: { ...sourceContainer.dimensions },
            parentContainer: sourceContainer.parentContainer,
            isContainer: true,
            selectable: true,
            containerMode: sourceContainer.containerMode || sourceContainer.sizingMode || 'hug',
            autoLayout: sourceContainer.autoLayout ? {
                enabled: sourceContainer.autoLayout.enabled,
                mode: sourceContainer.autoLayout.mode,
                direction: sourceContainer.autoLayout.direction,
                gap: sourceContainer.autoLayout.gap,
                padding: { ...sourceContainer.autoLayout.padding },
                alignment: sourceContainer.autoLayout.alignment,
                sizing: sourceContainer.autoLayout.sizing ? { ...sourceContainer.autoLayout.sizing } : undefined,
                tileMode: sourceContainer.autoLayout.tileMode ? { ...sourceContainer.autoLayout.tileMode } : undefined
            } : {
                enabled: false,
                mode: 'manual',
                direction: 'horizontal',
                gap: 10,
                padding: { top: 10, right: 10, bottom: 10, left: 10 },
                alignment: 'start',
                sizing: { fill: 'hug' }
            }
        };

        // Add container to scene (same pattern as createAndRegisterContainer)
        const duplicatedContainer = sceneController.addObject(containerData.mesh, null, containerOptions);

        if (!duplicatedContainer) {
            logger.error('DuplicateObjectCommand: Failed to create duplicate container');
            return false;
        }

        this.duplicatedObjectId = duplicatedContainer.id;

        // Map to track old child ID → new child ID for childrenOrder
        const childIdMap = new Map();

        // Recursively duplicate all children
        // NOTE: We pre-calculate local positions relative to the NEW container
        // This avoids coordinate conversion race conditions
        const children = sceneController.getChildObjects(sourceContainer.id);
        logger.info(`  Duplicating ${children.length} children`);

        // CRITICAL: Update source container's matrix FIRST so children's world positions are correct
        sourceContainer.mesh.updateMatrixWorld(true);

        // Get new container's world position for local position calculations
        duplicatedContainer.mesh.updateMatrixWorld(true);
        const newContainerWorldPos = duplicatedContainer.mesh.getWorldPosition(new THREE.Vector3());
        logger.info(`  New container world position: (${newContainerWorldPos.x}, ${newContainerWorldPos.y}, ${newContainerWorldPos.z})`);

        // Get source container's world position for reference
        const sourceContainerWorldPos = sourceContainer.mesh.getWorldPosition(new THREE.Vector3());
        logger.info(`  Source container world position: (${sourceContainerWorldPos.x}, ${sourceContainerWorldPos.y}, ${sourceContainerWorldPos.z})`);

        for (const child of children) {
            // Force matrix update on child (parent matrix already updated above)
            child.mesh.updateMatrixWorld(true);
            const childWorldPos = child.mesh.getWorldPosition(new THREE.Vector3());
            logger.info(`    Child ${child.id} "${child.name}" at world: (${childWorldPos.x}, ${childWorldPos.y}, ${childWorldPos.z})`);

            // Pre-calculate local position relative to NEW container
            const localPosition = {
                x: childWorldPos.x - newContainerWorldPos.x,
                y: childWorldPos.y - newContainerWorldPos.y,
                z: childWorldPos.z - newContainerWorldPos.z
            };
            logger.info(`    -> Local position relative to new container: (${localPosition.x}, ${localPosition.y}, ${localPosition.z})`);

            // Pass local position directly - no coordinate conversion needed
            const childDuplicate = this.duplicateChild(child, duplicatedContainer.id, localPosition, sceneController);
            if (childDuplicate) {
                childIdMap.set(child.id, childDuplicate.id);
                const childMesh = childDuplicate.mesh;
                const finalWorldPos = childMesh ? childMesh.getWorldPosition(new THREE.Vector3()) : null;

                // COMPREHENSIVE LOGGING for debugging selection issues
                logger.info(`    -> Created ${childDuplicate.id}:`);
                logger.info(`       - Local position: (${childMesh?.position.x}, ${childMesh?.position.y}, ${childMesh?.position.z})`);
                logger.info(`       - World position: (${finalWorldPos?.x}, ${finalWorldPos?.y}, ${finalWorldPos?.z})`);
                logger.info(`       - parentContainer: ${childDuplicate.parentContainer}`);
                logger.info(`       - Parent mesh: ${childMesh?.parent?.userData?.id || 'NO PARENT'}`);
                logger.info(`       - Type: ${childDuplicate.type}`);
                logger.info(`       - Selectable: ${childDuplicate.selectable}`);
                logger.info(`       - Geometry: ${childMesh?.geometry?.type || 'NO GEOMETRY'}`);
                logger.info(`       - Raycastable: ${typeof childMesh?.raycast === 'function'}`);
            }
        }

        // Rebuild childrenOrder array with new child IDs
        if (sourceContainer.childrenOrder && sourceContainer.childrenOrder.length > 0) {
            const newChildrenOrder = sourceContainer.childrenOrder
                .map(oldId => childIdMap.get(oldId))
                .filter(newId => newId !== undefined);

            objectStateManager.updateObject(duplicatedContainer.id, {
                childrenOrder: newChildrenOrder
            }, 'duplicate');

            logger.info(`  Updated childrenOrder: [${newChildrenOrder.join(', ')}]`);
        }

        // Trigger layout update on the new container if it has auto-layout
        // NOTE: If container was moved (Cmd+drag), Phase 1 already positioned children correctly
        // Layout engine will reposition them according to layout rules if enabled
        if (duplicatedContainer.autoLayout?.enabled) {
            logger.info(`  Running layout update (autoLayout enabled)`);
            sceneController.updateLayout(duplicatedContainer.id);
        } else {
            logger.info(`  Skipping layout update (autoLayout disabled or manual mode)`);
        }

        logger.info(`=== CONTAINER DUPLICATION COMPLETE ===`);

        // If in a parent container, add to childrenOrder
        if (sourceContainer.parentContainer) {
            const parentContainer = sceneController.getObject(sourceContainer.parentContainer);
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

        logger.info(`✨ Duplicated container ${this.sourceObjectId} → ${this.duplicatedObjectId} with ${children.length} children`);
        return true;
    }

    duplicateChild(sourceChild, newParentId, localPosition, sceneController) {
        // Create geometry based on child's type (supports box, sphere, cylinder, etc.)
        const geometry = this.createGeometryForType(sourceChild);

        const material = sourceChild.mesh.material.clone();

        // Use pre-calculated local position (passed from duplicateContainer)
        // This position is already relative to the new parent container
        const position = localPosition;

        const rotation = sourceChild.mesh &&
            (sourceChild.mesh.rotation.x !== 0 ||
             sourceChild.mesh.rotation.y !== 0 ||
             sourceChild.mesh.rotation.z !== 0) ? {
            x: sourceChild.mesh.rotation.x,
            y: sourceChild.mesh.rotation.y,
            z: sourceChild.mesh.rotation.z
        } : null;

        const options = {
            name: sourceChild.name, // Keep original name for children
            type: sourceChild.type,
            position: position,
            dimensions: { ...sourceChild.dimensions },
            parentContainer: newParentId,
            fillAxes: sourceChild.fillAxes ? [...sourceChild.fillAxes] : []
        };

        if (rotation) {
            options.rotation = rotation;
        }

        return sceneController.addObject(geometry, material, options);
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
            // Recreate geometry from snapshot using type-aware helper
            const geometry = this.createGeometryForType(this.objectSnapshot);

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
