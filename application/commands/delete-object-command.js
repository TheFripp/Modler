import * as THREE from 'three';
// Modler V2 - Delete Object Command
// Reversible object deletion for undo/redo system

class DeleteObjectCommand extends BaseCommand {
    constructor(objectIds) {
        super('delete-object', `Delete ${Array.isArray(objectIds) ? objectIds.length : 1} object(s)`);

        // Ensure objectIds is always an array
        this.objectIds = Array.isArray(objectIds) ? objectIds : [objectIds];

        // Stored object data for restoration
        this.deletedObjects = [];

        // Component references
        this.sceneController = null;
        this.selectionController = null;
        this.visualizationManager = null;
    }

    /**
     * Execute the deletion
     */
    execute() {
        try {
            // Get component references
            this.sceneController = window.modlerComponents?.sceneController;
            this.selectionController = window.modlerComponents?.selectionController;
            this.visualizationManager = window.modlerComponents?.visualizationManager;

            if (!this.sceneController) {
                console.error('DeleteObjectCommand: SceneController not available');
                return false;
            }

            // Store object data before deletion for restoration
            this.deletedObjects = [];

            // Collect all objects to delete, including children of containers
            const objectsToDelete = new Set(this.objectIds);

            for (const objectId of this.objectIds) {
                const objectData = this.sceneController.getObject(objectId);
                if (objectData && objectData.isContainer) {
                    // If deleting a container, also delete all its children
                    const children = this.sceneController.getChildObjects(objectId);
                    children.forEach(child => objectsToDelete.add(child.id));
                }
            }

            // Create snapshots for all objects to delete
            for (const objectId of objectsToDelete) {
                const objectData = this.sceneController.getObject(objectId);
                if (objectData) {
                    // Create deep copy of object data for restoration
                    const objectSnapshot = this.createObjectSnapshot(objectData);
                    this.deletedObjects.push(objectSnapshot);
                } else {
                    console.warn(`DeleteObjectCommand: Object ${objectId} not found`);
                }
            }

            // Update objectIds to include children
            this.objectIds = Array.from(objectsToDelete);

            if (this.deletedObjects.length === 0) {
                console.warn('DeleteObjectCommand: No valid objects to delete');
                return false;
            }

            // Clear selection before deletion to prevent phantom objects in UI
            // clearSelection() calls notifySelectionChange() which emits selection-changed to UI
            if (this.selectionController) {
                this.selectionController.clearSelection();
            }

            // Collect parent container IDs before deletion (for layout re-flow)
            const affectedParents = new Set();
            for (const objectId of this.objectIds) {
                const objectData = this.sceneController.getObject(objectId);
                if (objectData?.parentContainer) {
                    affectedParents.add(objectData.parentContainer);
                }
            }

            // Delete objects from scene
            let deletedCount = 0;
            for (const objectId of this.objectIds) {
                if (this.sceneController.removeObject(objectId)) {
                    deletedCount++;
                }
            }

            if (deletedCount === 0) {
                console.warn('DeleteObjectCommand: No objects were successfully deleted');
                return false;
            }

            // Trigger layout re-flow on parent containers (remaining children reposition)
            for (const parentId of affectedParents) {
                if (this.sceneController.getObject(parentId)) {
                    this.sceneController.updateContainer(parentId, { reason: 'hierarchy-changed' });
                }
            }

            // Phase 3: UI notification happens automatically via ObjectEventBus → MainAdapter

            return true;

        } catch (error) {
            console.error('DeleteObjectCommand: Error during execution:', error);
            return false;
        }
    }

    /**
     * Undo the deletion by restoring objects
     */
    undo() {
        try {
            if (!this.sceneController) {
                console.error('DeleteObjectCommand: SceneController not available for undo');
                return false;
            }

            if (this.deletedObjects.length === 0) {
                console.warn('DeleteObjectCommand: No object data available for restoration');
                return false;
            }

            // Sort deleted objects: containers first, then children
            // This ensures parents are restored before children for proper hierarchy
            const sortedObjects = [...this.deletedObjects].sort((a, b) => {
                // Containers (no parentContainer) come first
                const aIsRoot = !a.parentContainer;
                const bIsRoot = !b.parentContainer;
                if (aIsRoot && !bIsRoot) return -1;
                if (!aIsRoot && bIsRoot) return 1;
                return 0;
            });

            // Restore objects to scene
            let restoredCount = 0;
            for (const objectSnapshot of sortedObjects) {
                if (this.restoreObjectFromSnapshot(objectSnapshot)) {
                    restoredCount++;
                }
            }

            if (restoredCount === 0) {
                console.warn('DeleteObjectCommand: No objects were successfully restored');
                return false;
            }

            // Restore original childrenOrder for containers
            // Children are added via push() during setParentContainer(), which may not
            // preserve the original ordering — overwrite with snapshot order
            for (const snapshot of sortedObjects) {
                if (snapshot.isContainer && snapshot.childrenOrder?.length > 0) {
                    const containerData = this.sceneController.getObject(snapshot.id);
                    if (containerData) {
                        containerData.childrenOrder = [...snapshot.childrenOrder];
                    }
                }
            }

            // Trigger layout re-flow on parent containers of restored objects
            const affectedParents = new Set();
            for (const snapshot of sortedObjects) {
                if (snapshot.parentContainer) {
                    affectedParents.add(snapshot.parentContainer);
                }
            }
            for (const parentId of affectedParents) {
                if (this.sceneController.getObject(parentId)) {
                    this.sceneController.updateContainer(parentId, { reason: 'hierarchy-changed' });
                }
            }

            // Phase 3: UI notification happens automatically via ObjectEventBus → MainAdapter

            return true;

        } catch (error) {
            console.error('DeleteObjectCommand: Error during undo:', error);
            return false;
        }
    }

    /**
     * Create a deep snapshot of object data for restoration
     */
    createObjectSnapshot(objectData) {
        const snapshot = {
            id: objectData.id,
            name: objectData.name,
            type: objectData.type,
            isContainer: objectData.isContainer,
            parentContainer: objectData.parentContainer,

            // Geometry data - ensure position is captured from both object data and mesh
            position: objectData.position ? { ...objectData.position } :
                     (objectData.mesh ? { x: objectData.mesh.position.x, y: objectData.mesh.position.y, z: objectData.mesh.position.z } : null),
            rotation: objectData.rotation ? { ...objectData.rotation } : null,
            scale: objectData.scale ? { ...objectData.scale } : null,
            dimensions: objectData.dimensions ? { ...objectData.dimensions } : null,

            // Material data
            materialConfig: objectData.materialConfig ? { ...objectData.materialConfig } : null,

            // Container-specific data
            containerMode: objectData.containerMode || null,
            autoLayout: objectData.autoLayout ? this.safeCloneObject(objectData.autoLayout) : null,

            // Hierarchy data
            childrenOrder: objectData.childrenOrder ? [...objectData.childrenOrder] : [],

            // Metadata (safe serialization)
            metadata: objectData.metadata ? this.safeCloneObject(objectData.metadata) : {},

            // Additional object properties
            selectable: objectData.selectable,
            visible: objectData.visible,

            // Store original mesh data (most authoritative for positioning)
            meshData: this.captureMeshData(objectData.mesh),

            // Enhanced geometry data for restoration
            geometryData: this.captureGeometryData(objectData.mesh)
        };

        return snapshot;
    }

    /**
     * Capture essential mesh data for restoration
     */
    captureMeshData(mesh) {
        if (!mesh) return null;

        return {
            position: mesh.position.clone(),
            rotation: mesh.rotation.clone(),
            scale: mesh.scale.clone(),
            visible: mesh.visible,
            userData: this.safeCloneObject(mesh.userData || {})
        };
    }

    /**
     * Safe object cloning that avoids circular references
     */
    safeCloneObject(obj, maxDepth = 10, currentDepth = 0) {
        if (currentDepth > maxDepth) {
            return '[Max depth reached]';
        }

        if (obj === null || typeof obj !== 'object') {
            return obj;
        }

        // Handle arrays
        if (Array.isArray(obj)) {
            return obj.map(item => this.safeCloneObject(item, maxDepth, currentDepth + 1));
        }

        // Handle Three.js objects and other complex objects
        if (obj.isVector3 || obj.isEuler || obj.isMatrix4 || obj.isQuaternion) {
            return obj.clone();
        }

        // Skip Three.js mesh/object references
        if (obj.isMesh || obj.isObject3D || obj.isGeometry || obj.isMaterial) {
            return '[Three.js object reference]';
        }

        // Handle regular objects
        const cloned = {};
        for (const key in obj) {
            if (obj.hasOwnProperty(key)) {
                try {
                    cloned[key] = this.safeCloneObject(obj[key], maxDepth, currentDepth + 1);
                } catch (error) {
                    cloned[key] = '[Cloning error]';
                }
            }
        }
        return cloned;
    }

    /**
     * Capture geometry data for accurate restoration
     */
    captureGeometryData(mesh) {
        if (!mesh || !mesh.geometry) return null;

        const geometry = mesh.geometry;
        const geometryData = {
            type: geometry.type || 'BufferGeometry'
        };

        // Capture parameters for standard geometries
        if (geometry.type === 'BoxGeometry') {
            geometryData.width = geometry.parameters?.width || 1;
            geometryData.height = geometry.parameters?.height || 1;
            geometryData.depth = geometry.parameters?.depth || 1;
        } else if (geometry.type === 'CylinderGeometry') {
            geometryData.radiusTop = geometry.parameters?.radiusTop || 1;
            geometryData.radiusBottom = geometry.parameters?.radiusBottom || 1;
            geometryData.height = geometry.parameters?.height || 1;
            geometryData.radialSegments = geometry.parameters?.radialSegments || 8;
        } else if (geometry.type === 'SphereGeometry') {
            geometryData.radius = geometry.parameters?.radius || 1;
            geometryData.widthSegments = geometry.parameters?.widthSegments || 32;
            geometryData.heightSegments = geometry.parameters?.heightSegments || 16;
        } else {
            // For unknown geometries, compute bounding box as fallback
            geometry.computeBoundingBox();
            if (geometry.boundingBox) {
                const size = geometry.boundingBox.getSize(new THREE.Vector3());
                geometryData.width = size.x;
                geometryData.height = size.y;
                geometryData.depth = size.z;
                geometryData.fallback = true; // Mark as fallback data
            }
        }

        // Capture material data
        if (mesh.material) {
            geometryData.materialData = {
                color: mesh.material.color ? mesh.material.color.getHex() : 0x808080,
                type: mesh.material.type || 'MeshLambertMaterial'
            };
        }

        return geometryData;
    }

    /**
     * Restore object from snapshot data
     */
    restoreObjectFromSnapshot(snapshot) {
        try {
            // Determine object type and use appropriate creation method
            if (snapshot.isContainer) {
                const containerData = this.restoreContainer(snapshot);
                if (containerData) {
                    // Properties are already restored in restoreContainer method
                    return true;
                } else {
                    return false;
                }
            } else {
                return this.restoreRegularObject(snapshot);
            }
        } catch (error) {
            console.error('DeleteObjectCommand: Error restoring object from snapshot:', error);
            return false;
        }
    }

    /**
     * Restore a container object
     */
    restoreContainer(snapshot) {
        try {
            // Use centralized container creation via ContainerCrudManager
            const containerCrudManager = window.modlerComponents?.containerCrudManager;
            if (!containerCrudManager) {
                console.error('DeleteObjectCommand: ContainerCrudManager not available for container restoration');
                return false;
            }

            // Create container geometry using centralized method with positioning
            const size = new THREE.Vector3(
                snapshot.dimensions?.x || snapshot.dimensions?.width || 2,
                snapshot.dimensions?.y || snapshot.dimensions?.height || 2,
                snapshot.dimensions?.z || snapshot.dimensions?.depth || 2
            );

            const transform = snapshot.meshData || { position: new THREE.Vector3(0, 0, 0) };
            const containerResult = containerCrudManager.createContainerGeometryAtPosition(size, transform);
            if (!containerResult?.mesh) {
                console.error('DeleteObjectCommand: Failed to create container geometry');
                return false;
            }

            // Route through standard addObject pipeline (handles ObjectStateManager,
            // ObjectEventBus, HierarchyManager, and support mesh creation)
            const restoredContainer = this.sceneController.addObject(containerResult.mesh, null, {
                id: snapshot.id,
                name: snapshot.name,
                type: snapshot.type,
                isContainer: true,
                containerMode: snapshot.containerMode || 'hug',
                autoLayout: snapshot.autoLayout || undefined,
                selectable: snapshot.selectable !== false,
                parentContainer: snapshot.parentContainer || null
            });

            if (!restoredContainer) {
                console.error('DeleteObjectCommand: Failed to restore container via addObject');
                return false;
            }

            // Restore additional properties not handled by addObject
            this.restoreAllObjectProperties(restoredContainer, snapshot);
            return restoredContainer;

        } catch (error) {
            console.error('DeleteObjectCommand: Error restoring container:', error);
            return false;
        }
    }

    /**
     * Restore a regular object
     */
    restoreRegularObject(snapshot) {
        // Use appropriate creation method based on object type
        let restoredObjectData = null;

        switch (snapshot.type) {
            case 'box':
            case 'cube':
                restoredObjectData = this.restoreBox(snapshot);
                break;
            case 'test':
                // Handle demo/test objects - restore using generic method
                restoredObjectData = this.restoreTestObject(snapshot);
                break;
            default:
                console.warn(`DeleteObjectCommand: Unknown object type for restoration: ${snapshot.type}`);
                // Try generic restoration as fallback
                restoredObjectData = this.restoreGenericObject(snapshot);
                break;
        }

        if (restoredObjectData) {
            // Restore all additional object properties (ID and hierarchy already set via addObject)
            this.restoreAllObjectProperties(restoredObjectData, snapshot);
            return true;
        }

        return false;
    }

    /**
     * Restore a box object
     */
    restoreBox(snapshot) {
        try {
            // Recreate the geometry with original dimensions (dimensions use {x, y, z} format)
            const geometryFactory = window.modlerComponents?.geometryFactory;
            const dims = snapshot.dimensions || { x: 1, y: 1, z: 1 };
            const geometry = geometryFactory
                ? geometryFactory.createBoxGeometry(dims.x, dims.y, dims.z)
                : new THREE.BoxGeometry(dims.x, dims.y, dims.z);

            // Create material using captured data
            const materialManager = window.modlerComponents?.materialManager;
            const material = materialManager
                ? materialManager.createMeshLambertMaterial({
                    color: snapshot.materialConfig?.color || 0x808080
                  })
                : new THREE.MeshLambertMaterial({
                    color: snapshot.materialConfig?.color || 0x808080
                  });

            // Add object using SceneController's addObject method with original position
            // Priority: meshData.position > position > default
            const position = snapshot.meshData?.position || snapshot.position || { x: 0, y: 0, z: 0 };

            const boxData = this.sceneController.addObject(
                geometry,
                material,
                {
                    id: snapshot.id,
                    name: snapshot.name,
                    type: snapshot.type,
                    position: { x: position.x, y: position.y, z: position.z },
                    parentContainer: snapshot.parentContainer || null
                }
            );

            // Properties will be restored by restoreAllObjectProperties
            return boxData;

        } catch (error) {
            console.error('DeleteObjectCommand: Error restoring box:', error);
            return null;
        }
    }

    /**
     * Restore a test/demo object using addObject method
     */
    restoreTestObject(snapshot) {
        try {
            // Recreate the geometry based on mesh data
            const geometry = this.recreateGeometry(snapshot);
            if (!geometry) {
                console.error('DeleteObjectCommand: Failed to recreate geometry for test object');
                return null;
            }

            // Create material using captured data and centralized systems
            const materialData = snapshot.geometryData?.materialData || {};
            const materialManager = window.MaterialManager ? new MaterialManager() : null;

            let material;
            if (materialManager) {
                material = materialManager.createMeshLambertMaterial({
                    color: materialData.color || snapshot.materialConfig?.color || 0x808080
                });
            } else {
                material = new THREE.MeshLambertMaterial({
                    color: materialData.color || snapshot.materialConfig?.color || 0x808080
                });
            }

            // Add object using SceneController's addObject method
            const restoredObjectData = this.sceneController.addObject(
                geometry,
                material,
                {
                    id: snapshot.id,
                    name: snapshot.name,
                    type: snapshot.type,
                    position: snapshot.position,
                    parentContainer: snapshot.parentContainer || null
                }
            );

            // Properties will be restored by restoreAllObjectProperties

            return restoredObjectData;

        } catch (error) {
            console.error('DeleteObjectCommand: Error restoring test object:', error);
            return null;
        }
    }

    /**
     * Generic object restoration fallback
     */
    restoreGenericObject(snapshot) {
        try {
            // Try to use the test object restoration method as fallback
            return this.restoreTestObject(snapshot);
        } catch (error) {
            console.error('DeleteObjectCommand: Generic restoration failed:', error);
            return null;
        }
    }

    /**
     * Recreate geometry from snapshot data
     */
    recreateGeometry(snapshot) {
        // Access centralized geometry factory
        const geometryFactory = window.GeometryFactory ? new GeometryFactory() : null;

        // Try to use enhanced geometry data first
        if (snapshot.geometryData) {
            const geoData = snapshot.geometryData;

            switch (geoData.type) {
                case 'BoxGeometry':
                    if (geometryFactory) {
                        return geometryFactory.createBoxGeometry(
                            geoData.width || 1,
                            geoData.height || 1,
                            geoData.depth || 1
                        );
                    }
                    return new THREE.BoxGeometry(
                        geoData.width || 1,
                        geoData.height || 1,
                        geoData.depth || 1
                    );

                case 'CylinderGeometry':
                    if (geometryFactory) {
                        return geometryFactory.createCylinderGeometry(
                            geoData.radiusTop || 1,
                            geoData.radiusBottom || 1,
                            geoData.height || 1,
                            geoData.radialSegments || 8
                        );
                    }
                    return new THREE.CylinderGeometry(
                        geoData.radiusTop || 1,
                        geoData.radiusBottom || 1,
                        geoData.height || 1,
                        geoData.radialSegments || 8
                    );

                case 'SphereGeometry':
                    if (geometryFactory) {
                        return geometryFactory.createSphereGeometry(
                            geoData.radius || 1,
                            geoData.widthSegments || 32,
                            geoData.heightSegments || 16
                        );
                    }
                    return new THREE.SphereGeometry(
                        geoData.radius || 1,
                        geoData.widthSegments || 32,
                        geoData.heightSegments || 16
                    );

                default:
                    // Use fallback data if available
                    if (geoData.width && geoData.height && geoData.depth) {
                        if (geometryFactory) {
                            return geometryFactory.createBoxGeometry(
                                geoData.width,
                                geoData.height,
                                geoData.depth
                            );
                        }
                        return new THREE.BoxGeometry(
                            geoData.width,
                            geoData.height,
                            geoData.depth
                        );
                    }
                    break;
            }
        }

        // Fallback to dimensions if available
        if (snapshot.dimensions) {
            const { width, height, depth } = snapshot.dimensions;

            // Check if it's a box-like geometry
            if (width && height && depth) {
                if (geometryFactory) {
                    return geometryFactory.createBoxGeometry(width, height, depth);
                }
                return new THREE.BoxGeometry(width, height, depth);
            }

            // Check if it's a cylinder (height and width/radius)
            if (height && width && !depth) {
                if (geometryFactory) {
                    return geometryFactory.createCylinderGeometry(width, width, height, 8);
                }
                return new THREE.CylinderGeometry(width, width, height, 8);
            }
        }

        // Final fallback to a basic box geometry
        if (geometryFactory) {
            return geometryFactory.createBoxGeometry(1, 1, 1);
        }
        return new THREE.BoxGeometry(1, 1, 1);
    }

    /**
     * Check if command can be undone
     */
    canUndo() {
        return this.deletedObjects.length > 0 && this.sceneController !== null;
    }

    /**
     * Restore all object properties from snapshot
     */
    restoreAllObjectProperties(restoredObjectData, snapshot) {
        // Note: parentContainer and hierarchy are now handled by addObject() via
        // hierarchyManager.setParentContainer() — no manual assignment needed

        // Restore metadata
        if (snapshot.metadata) {
            restoredObjectData.metadata = snapshot.metadata;
        }

        // Restore material configuration
        if (snapshot.materialConfig) {
            restoredObjectData.materialConfig = snapshot.materialConfig;
        }

        // Dimensions automatically restored via DimensionManager getter from geometry

        // Restore the exact mesh positioning and properties
        if (restoredObjectData.mesh && snapshot.meshData) {
            restoredObjectData.mesh.position.copy(snapshot.meshData.position);
            restoredObjectData.mesh.rotation.copy(snapshot.meshData.rotation);
            restoredObjectData.mesh.scale.copy(snapshot.meshData.scale);
            restoredObjectData.mesh.visible = snapshot.meshData.visible;

            // Update object data position to match mesh (authoritative)
            restoredObjectData.position = {
                x: snapshot.meshData.position.x,
                y: snapshot.meshData.position.y,
                z: snapshot.meshData.position.z
            };

            // Restore rotation and scale in object data
            if (snapshot.meshData.rotation) {
                restoredObjectData.rotation = {
                    x: snapshot.meshData.rotation.x,
                    y: snapshot.meshData.rotation.y,
                    z: snapshot.meshData.rotation.z
                };
            }

            if (snapshot.meshData.scale) {
                restoredObjectData.scale = {
                    x: snapshot.meshData.scale.x,
                    y: snapshot.meshData.scale.y,
                    z: snapshot.meshData.scale.z
                };
            }

            // Restore mesh userData
            if (snapshot.meshData.userData) {
                Object.assign(restoredObjectData.mesh.userData, snapshot.meshData.userData);
            }

            // Support meshes are created by addObject() via SupportMeshFactory — no manual creation needed
        }
    }

    /**
     * Clean up stored object data
     */
    cleanup() {
        this.deletedObjects = [];
    }
}

// Export for use in history system
window.DeleteObjectCommand = DeleteObjectCommand;