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

            for (const objectId of this.objectIds) {
                const objectData = this.sceneController.getObject(objectId);
                if (objectData) {
                    // Create deep copy of object data for restoration
                    const objectSnapshot = this.createObjectSnapshot(objectData);
                    this.deletedObjects.push(objectSnapshot);
                } else {
                    console.warn(`DeleteObjectCommand: Object ${objectId} not found`);
                }
            }

            if (this.deletedObjects.length === 0) {
                console.warn('DeleteObjectCommand: No valid objects to delete');
                return false;
            }

            // Clear selection of objects being deleted
            if (this.selectionController) {
                const selectedObjects = this.selectionController.getSelectedObjects();
                selectedObjects.forEach(selectedMesh => {
                    const objectData = this.sceneController.getObjectByMesh(selectedMesh);
                    if (objectData && this.objectIds.includes(objectData.id)) {
                        this.selectionController.deselect(selectedMesh);
                    }
                });
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

            // Notify UI of changes
            if (window.notifyObjectModified) {
                this.objectIds.forEach(id => window.notifyObjectModified(id));
            }

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

            // Restore objects to scene
            let restoredCount = 0;
            for (const objectSnapshot of this.deletedObjects) {
                if (this.restoreObjectFromSnapshot(objectSnapshot)) {
                    restoredCount++;
                }
            }

            if (restoredCount === 0) {
                console.warn('DeleteObjectCommand: No objects were successfully restored');
                return false;
            }

            // Notify UI of changes
            if (window.notifyObjectModified) {
                this.deletedObjects.forEach(snapshot => window.notifyObjectModified(snapshot.id));
            }

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

            // Container-specific data (safe serialization)
            layoutConfig: objectData.layoutConfig ? this.safeCloneObject(objectData.layoutConfig) : null,

            // Hierarchy data
            childObjects: objectData.childObjects ? [...objectData.childObjects] : [],

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
            // Use the same approach as normal container creation via LayoutGeometry
            if (!window.LayoutGeometry) {
                console.error('DeleteObjectCommand: LayoutGeometry not available for container restoration');
                return false;
            }

            // Create container geometry using the same method as normal creation
            const size = new THREE.Vector3(
                snapshot.dimensions?.width || 2,
                snapshot.dimensions?.height || 2,
                snapshot.dimensions?.depth || 2
            );

            const containerResult = window.LayoutGeometry.createContainerGeometry(size);
            if (!containerResult || !containerResult.mesh) {
                console.error('DeleteObjectCommand: Failed to create container geometry');
                return false;
            }

            const containerMesh = containerResult.mesh;

            // Position the container mesh
            if (snapshot.meshData) {
                containerMesh.position.copy(snapshot.meshData.position);
                containerMesh.rotation.copy(snapshot.meshData.rotation);
                containerMesh.scale.copy(snapshot.meshData.scale);
            }

            // Add to scene
            const scene = window.modlerComponents?.sceneFoundation?.scene;
            if (!scene) {
                console.error('DeleteObjectCommand: Scene not available for container restoration');
                return false;
            }
            scene.add(containerMesh);

            // Create object data structure
            const containerData = {
                id: snapshot.id,
                name: snapshot.name,
                type: snapshot.type,
                mesh: containerMesh,
                isContainer: true,
                dimensions: snapshot.dimensions ? { ...snapshot.dimensions } : { width: size.x, height: size.y, depth: size.z },
                position: snapshot.position || { x: containerMesh.position.x, y: containerMesh.position.y, z: containerMesh.position.z },
                layoutConfig: snapshot.layoutConfig || { type: 'none' },
                childObjects: snapshot.childObjects || [],
                selectable: snapshot.selectable !== false,
                visible: snapshot.visible !== false,
                metadata: snapshot.metadata || {}
            };

            // Set mesh userData
            containerMesh.userData.id = snapshot.id;
            containerMesh.userData.type = snapshot.type;
            containerMesh.userData.isContainer = true;

            // Add to scene controller registry
            this.sceneController.objects.set(snapshot.id, containerData);

            console.log('DeleteObjectCommand: Successfully restored container:', snapshot.name);
            return containerData;

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
            // Restore original ID and properties
            this.sceneController.objects.delete(restoredObjectData.id);
            restoredObjectData.id = snapshot.id;
            restoredObjectData.name = snapshot.name;
            this.sceneController.objects.set(snapshot.id, restoredObjectData);

            // Restore all additional object properties
            this.restoreAllObjectProperties(restoredObjectData, snapshot);

            return true;
        }

        return false;
    }

    /**
     * Restore a box object
     */
    restoreBox(snapshot) {
        // Create new box with original dimensions
        const boxData = this.sceneController.createBox(
            snapshot.dimensions.width,
            snapshot.dimensions.height,
            snapshot.dimensions.depth,
            snapshot.position,
            snapshot.name
        );

        // Properties will be restored by restoreAllObjectProperties

        return boxData;
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
                    name: snapshot.name,
                    type: snapshot.type,
                    position: snapshot.position
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
        // Restore parent relationship
        if (snapshot.parentContainer) {
            restoredObjectData.parentContainer = snapshot.parentContainer;
        }

        // Restore metadata
        if (snapshot.metadata) {
            restoredObjectData.metadata = snapshot.metadata;
        }

        // Restore additional properties
        if (typeof snapshot.selectable !== 'undefined') {
            restoredObjectData.selectable = snapshot.selectable;
        }

        if (typeof snapshot.visible !== 'undefined') {
            restoredObjectData.visible = snapshot.visible;
        }

        // Restore material configuration
        if (snapshot.materialConfig) {
            restoredObjectData.materialConfig = snapshot.materialConfig;
        }

        // Restore layout configuration for containers
        if (snapshot.isContainer && snapshot.layoutConfig) {
            restoredObjectData.layoutConfig = this.safeCloneObject(snapshot.layoutConfig);
        }

        // Restore child objects list
        if (snapshot.childObjects) {
            restoredObjectData.childObjects = [...snapshot.childObjects];
        }

        // Restore dimensions if available
        if (snapshot.dimensions) {
            restoredObjectData.dimensions = { ...snapshot.dimensions };
        }

        // Most importantly, restore the exact mesh positioning and properties
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

            // CRITICAL FIX: Ensure restored objects have support meshes
            // This matches the same pipeline as normal object creation
            this.ensureSupportMeshes(restoredObjectData.mesh, snapshot);
        }
    }

    /**
     * Ensure restored objects have proper support meshes (selection wireframes, etc.)
     * This matches the same support mesh creation that happens in SceneController.addObject
     */
    ensureSupportMeshes(mesh, snapshot) {
        if (!mesh) return;

        // Use the same SupportMeshFactory that SceneController uses
        const supportMeshFactory = window.modlerComponents?.supportMeshFactory;
        if (supportMeshFactory) {
            // For containers, the wireframes are already created by LayoutGeometry as children
            // For regular objects, we need to create support meshes
            if (!snapshot.isContainer) {
                // Create support meshes for regular objects (same as in SceneController.addObject)
                supportMeshFactory.createObjectSupportMeshes(mesh);
                console.log('DeleteObjectCommand: Created support meshes for restored object:', snapshot.name);
            } else {
                // Containers should already have their wireframe children from LayoutGeometry.createContainerGeometry()
                // But we might need additional support meshes for interaction
                const wireframeChild = mesh.children.find(child => child.userData.supportMeshType === 'wireframe');
                if (wireframeChild) {
                    console.log('DeleteObjectCommand: Container restored with wireframe child:', snapshot.name);

                    // Ensure container has proper support meshes for interaction
                    supportMeshFactory.createObjectSupportMeshes(mesh);
                } else {
                    console.warn('DeleteObjectCommand: Container missing wireframe child after restoration:', snapshot.name);
                    // Create all support meshes including wireframes as fallback
                    supportMeshFactory.createObjectSupportMeshes(mesh);
                }
            }
        } else {
            console.warn('DeleteObjectCommand: SupportMeshFactory not available for restored object:', snapshot.name);
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