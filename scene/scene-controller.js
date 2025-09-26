// Modler V2 - Scene Layer
// Scene Controller - Object lifecycle management without complexity

class SceneController {
    constructor(scene) {
        this.scene = scene;
        this.objects = new Map(); // id -> object data
        this.nextId = 1;
        this.eventCallbacks = {}; // Event system for UI notifications

        // Sequential naming counters
        this.nextBoxNumber = 1;
        this.nextContainerNumber = 1;

        // Centralized transformation system
        this.transformationManager = null;

        // Initialize transformation manager after components are loaded
        setTimeout(() => {
            this.transformationManager = window.modlerComponents?.transformationManager;
        }, 100);
        
        // Setup CAD lighting - balanced illumination to show face differences clearly
        // Key light from front-top-right for primary illumination
        const keyLight = new THREE.DirectionalLight(0xffffff, 0.8);
        keyLight.position.set(2, 3, 2);
        this.scene.add(keyLight);
        
        // Fill light from back-left to soften shadows and reveal back faces
        const fillLight = new THREE.DirectionalLight(0xffffff, 0.4);
        fillLight.position.set(-1, 1, -1);
        this.scene.add(fillLight);
        
        // Low ambient to maintain face contrast while avoiding pure black shadows
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.2);
        this.scene.add(ambientLight);
        
        // SceneController initialized
    }
    
    /**
     * Generate sequential names for objects
     * @param {string} type - Object type ('box', 'container')
     * @returns {string} Generated name like "Box 001" or "Container 001"
     */
    generateObjectName(type) {
        switch (type) {
            case 'box':
                const boxName = `Box ${this.nextBoxNumber.toString().padStart(3, '0')}`;
                this.nextBoxNumber++;
                return boxName;
            case 'container':
                const containerName = `Container ${this.nextContainerNumber.toString().padStart(3, '0')}`;
                this.nextContainerNumber++;
                return containerName;
            default:
                return `Object ${Date.now()}`;
        }
    }

    
    // Simple event system for object lifecycle notifications
    on(event, callback) {
        if (!this.eventCallbacks[event]) {
            this.eventCallbacks[event] = [];
        }
        this.eventCallbacks[event].push(callback);
    }
    
    emit(event, data) {
        if (this.eventCallbacks[event]) {
            this.eventCallbacks[event].forEach(callback => callback(data));
        }
    }
    
    // Add object to scene with metadata
    addObject(geometry, material, options = {}) {
        let mesh;
        
        // Handle different object types
        if (geometry && geometry.isObject3D) {
            // Direct Three.js object (like GridHelper, Group, etc.)
            mesh = geometry;
        } else if (geometry && material) {
            // Create Three.js mesh from geometry and material
            mesh = new THREE.Mesh(geometry, material);
        } else {
            return null;
        }
        
        // Generate unique ID
        const id = this.nextId++;
        
        // Set up object metadata
        const objectData = this.createObjectMetadata(id, mesh, options);
        
        // Configure mesh
        this.configureMesh(mesh, objectData, options);

        // Calculate dimensions from geometry for property panel consistency
        this.calculateObjectDimensions(mesh, objectData);

        // UNIFIED ARCHITECTURE: Create support meshes for all objects
        // Support mesh factory handles containers and regular objects differently
        const supportMeshFactory = window.modlerComponents?.supportMeshFactory;
        if (supportMeshFactory) {
            // Create support meshes for all objects (factory handles containers vs regular objects)
            supportMeshFactory.createObjectSupportMeshes(mesh);
        }


        // Add to scene and registry
        this.scene.add(mesh);


        this.objects.set(id, objectData);
        
        // Emit event for UI updates
        this.emit('objectAdded', objectData);
        
        // Object added successfully
        return objectData;
    }
    
    // Remove object from scene
    removeObject(id) {
        const objectData = this.objects.get(id);
        if (!objectData) {
            return false;
        }
        
        // Clean up support meshes first
        const supportMeshFactory = window.modlerComponents?.supportMeshFactory;
        if (supportMeshFactory) {
            supportMeshFactory.cleanupSupportMeshes(objectData.mesh);
        }

        // Remove from scene
        this.scene.remove(objectData.mesh);

        // Clean up geometry and material
        if (objectData.mesh.geometry) {
            objectData.mesh.geometry.dispose();
        }

        if (objectData.mesh.material) {
            if (Array.isArray(objectData.mesh.material)) {
                objectData.mesh.material.forEach(material => material.dispose());
            } else {
                objectData.mesh.material.dispose();
            }
        }
        
        // Remove from registry
        this.objects.delete(id);
        
        // Emit event for UI updates
        this.emit('objectRemoved', objectData);
        
        // Object removed successfully
        return true;
    }
    
    // Get object by ID
    getObject(id) {
        return this.objects.get(id) || null;
    }
    
    // Get object by mesh reference
    getObjectByMesh(mesh) {
        if (!mesh || !mesh.userData || !mesh.userData.id) {
            return null;
        }
        return this.getObject(mesh.userData.id);
    }
    
    // Get all objects
    getAllObjects() {
        return Array.from(this.objects.values());
    }
    
    // Get objects by type
    getObjectsByType(type) {
        return this.getAllObjects().filter(obj => obj.type === type);
    }
    
    // Check if object exists
    hasObject(id) {
        return this.objects.has(id);
    }
    
    // Set object visibility
    setObjectVisible(id, visible) {
        const objectData = this.objects.get(id);
        if (!objectData) {
            return false;
        }
        
        objectData.visible = visible;
        objectData.mesh.visible = visible;
        return true;
    }
    
    // Update object properties (position, rotation, scale, metadata)
    updateObject(id, updates) {
        const objectData = this.objects.get(id);
        if (!objectData) {
            return false;
        }
        
        const mesh = objectData.mesh;
        if (!mesh) {
            return false;
        }
        
        // Update transform properties using centralized TransformationManager
        if (this.transformationManager) {
            // Use centralized transformation system with batch processing for multiple transforms
            const transformUpdates = {};
            let hasTransforms = false;

            if (updates.position) {
                if (updates.position instanceof THREE.Vector3) {
                    transformUpdates.position = updates.position;
                } else {
                    transformUpdates.position = new THREE.Vector3(
                        updates.position.x ?? mesh.position.x,
                        updates.position.y ?? mesh.position.y,
                        updates.position.z ?? mesh.position.z
                    );
                }
                hasTransforms = true;
            }

            if (updates.rotation) {
                if (updates.rotation instanceof THREE.Euler) {
                    transformUpdates.rotation = updates.rotation;
                } else {
                    transformUpdates.rotation = new THREE.Euler(
                        updates.rotation.x ?? mesh.rotation.x,
                        updates.rotation.y ?? mesh.rotation.y,
                        updates.rotation.z ?? mesh.rotation.z
                    );
                }
                hasTransforms = true;
            }

            if (updates.scale) {
                if (updates.scale instanceof THREE.Vector3) {
                    transformUpdates.scale = updates.scale;
                } else {
                    transformUpdates.scale = new THREE.Vector3(
                        updates.scale.x ?? mesh.scale.x,
                        updates.scale.y ?? mesh.scale.y,
                        updates.scale.z ?? mesh.scale.z
                    );
                }
                hasTransforms = true;
            }

            // Apply all transforms in a single operation for better performance
            if (hasTransforms) {
                this.transformationManager.applyTransform(mesh, transformUpdates, { skipNotifications: false });
            }
        } else {
            // Fallback to direct manipulation if TransformationManager unavailable
            if (updates.position) {
                if (updates.position instanceof THREE.Vector3) {
                    mesh.position.copy(updates.position);
                } else {
                    mesh.position.set(updates.position.x || mesh.position.x,
                                    updates.position.y || mesh.position.y,
                                    updates.position.z || mesh.position.z);
                }
            }

            if (updates.rotation) {
                if (updates.rotation instanceof THREE.Euler) {
                    mesh.rotation.copy(updates.rotation);
                } else {
                    mesh.rotation.set(updates.rotation.x || mesh.rotation.x,
                                    updates.rotation.y || mesh.rotation.y,
                                    updates.rotation.z || mesh.rotation.z);
                }
            }

            if (updates.scale) {
                if (updates.scale instanceof THREE.Vector3) {
                    mesh.scale.copy(updates.scale);
                } else {
                    mesh.scale.set(updates.scale.x || mesh.scale.x,
                                 updates.scale.y || mesh.scale.y,
                                 updates.scale.z || mesh.scale.z);
                }
            }
        }
        
        // Update metadata properties
        const metadataUpdates = {};
        const transformKeys = ['position', 'rotation', 'scale'];
        for (const [key, value] of Object.entries(updates)) {
            if (!transformKeys.includes(key)) {
                metadataUpdates[key] = value;
            }
        }
        
        // Apply metadata updates if any
        if (Object.keys(metadataUpdates).length > 0) {
            Object.assign(objectData, metadataUpdates);
        }
        
        // Object updated successfully
        return true;
    }
    
    // Get object count
    getObjectCount() {
        return this.objects.size;
    }
    
    // Scene traversal utilities
    traverseObjects(callback) {
        for (const objectData of this.objects.values()) {
            callback(objectData);
        }
    }
    
    // Find objects by name pattern (if needed, can be added back)
    
    // Get selectable objects (for raycasting)
    getSelectableObjects() {
        return this.getAllObjects()
            .filter(obj => obj.selectable && obj.visible)
            .map(obj => obj.mesh);
    }
    
    // Clear all objects
    clear() {
        const ids = Array.from(this.objects.keys());
        ids.forEach(id => this.removeObject(id));
        // Scene cleared successfully
    }
    
    // Get statistics
    getStats() {
        const stats = {
            totalObjects: this.objects.size,
            visibleObjects: 0,
            selectableObjects: 0,
            types: {}
        };
        
        for (const obj of this.objects.values()) {
            if (obj.visible) stats.visibleObjects++;
            if (obj.selectable) stats.selectableObjects++;
            
            if (!stats.types[obj.type]) {
                stats.types[obj.type] = 0;
            }
            stats.types[obj.type]++;
        }
        
        return stats;
    }
    
    // Auto Layout Management Methods
    
    /**
     * Enable auto layout on a container object
     * @param {number} containerId - Container object ID
     * @param {Object} layoutConfig - Layout configuration
     * @param {string} layoutConfig.direction - Layout direction ('x', 'y', 'z', 'xy', 'xyz')
     * @param {number} layoutConfig.gap - Gap between objects in world units
     * @param {Object} layoutConfig.padding - Padding configuration {top, bottom, left, right, front, back}
     * @returns {boolean} True if layout was successfully enabled
     */
    enableAutoLayout(containerId, layoutConfig) {
        const container = this.objects.get(containerId);
        if (!container || !container.isContainer) {
            return false;
        }

        // CRITICAL FIX: Reset child positions to prepare for layout calculation
        // When layout is enabled on an existing container, children may be at preserved world positions
        // Layout system expects children to start from container-relative positions near (0,0,0)
        this.resetChildPositionsForLayout(containerId);

        container.autoLayout = {
            enabled: true,
            direction: layoutConfig.direction || 'x',
            gap: layoutConfig.gap || 0,
            padding: layoutConfig.padding || { top: 0, bottom: 0, left: 0, right: 0, front: 0, back: 0 },
            ...layoutConfig
        };

        this.updateLayout(containerId);
        return true;
    }
    
    /**
     * Reset child positions to prepare for layout calculation
     * Preserves the original center of child objects to prevent spatial offset during layout mode switch
     * @param {number} containerId - Container object ID
     */
    resetChildPositionsForLayout(containerId) {
        const childObjects = this.getChildObjects(containerId);
        if (childObjects.length === 0) return;

        const container = this.objects.get(containerId);
        if (!container || !container.mesh) return;

        // Calculate the size-weighted center of all child objects in world space
        // This preserves the visual balance of different-sized objects during layout transitions
        const originalCenter = this.calculateObjectsCenter(childObjects);

        // Convert original center to container-relative coordinates
        const containerWorldPosition = container.mesh.getWorldPosition(new THREE.Vector3());
        const originalCenterRelative = originalCenter.clone().sub(containerWorldPosition);

        // Store the original center as layout anchor for the layout engine
        container.layoutAnchor = originalCenterRelative.clone();


        // Convert each child to container-relative coordinates, preserving their relative positions
        childObjects.forEach((childData) => {
            if (childData.mesh) {
                const worldPos = childData.mesh.getWorldPosition(new THREE.Vector3());
                const relativePos = worldPos.clone().sub(containerWorldPosition);

                childData.mesh.position.copy(relativePos);
                childData.mesh.updateMatrixWorld();
            }
        });
    }

    /**
     * Calculate the center point of a collection of positions
     * @param {Array<THREE.Vector3>} positions - Array of position vectors
     * @returns {THREE.Vector3} Center point
     */
    /**
     * Calculate the size-weighted center position of multiple objects
     * @param {Array} objectsData - Array of object data with mesh and size information
     * @returns {THREE.Vector3} Size-weighted center position
     */
    calculateObjectsCenter(objectsData) {
        if (objectsData.length === 0) return new THREE.Vector3(0, 0, 0);

        let totalWeight = 0;
        const weightedSum = new THREE.Vector3(0, 0, 0);

        objectsData.forEach(objData => {
            if (!objData.mesh) return;

            // Get object position in world space
            const position = objData.mesh.getWorldPosition(new THREE.Vector3());

            // Calculate object size using LayoutEngine for consistency
            const size = window.LayoutEngine ?
                window.LayoutEngine.getObjectSize(objData) :
                new THREE.Vector3(1, 1, 1);

            // Calculate volume as weight (width × height × depth)
            const volume = size.x * size.y * size.z;

            // Add weighted position to sum
            weightedSum.add(position.clone().multiplyScalar(volume));
            totalWeight += volume;
        });

        // Return size-weighted center
        if (totalWeight > 0) {
            return weightedSum.divideScalar(totalWeight);
        } else {
            // Fallback to geometric center if no valid sizes
            const positions = objectsData.map(obj => obj.mesh.getWorldPosition(new THREE.Vector3()));
            const sum = positions.reduce((acc, pos) => acc.add(pos), new THREE.Vector3(0, 0, 0));
            return sum.divideScalar(positions.length);
        }
    }

    /**
     * Disable auto layout on a container
     * @param {number} containerId - Container object ID
     * @returns {boolean} True if layout was successfully disabled
     */
    disableAutoLayout(containerId) {
        const container = this.objects.get(containerId);
        if (!container) return false;

        container.autoLayout = null;
        return true;
    }
    
    /**
     * Update layout for a container and its children
     * @param {number} containerId - Container object ID
     * @returns {boolean} True if layout was successfully updated
     */
    updateLayout(containerId) {
        const container = this.objects.get(containerId);

        if (!container || !container.autoLayout || !container.autoLayout.enabled) {
            return { success: false, reason: 'container or autoLayout not ready' };
        }

        // Get child objects of this container
        const children = this.getChildObjects(containerId);
        if (children.length === 0) {
            return { success: true, reason: 'no children' };
        }
        
        // This will be implemented when we create the layout engine
        if (window.LayoutEngine) {
            // Get container size for fill calculations
            const containerSize = this.getContainerSize(container);


            // Pass the layout anchor if it exists (preserves original center when switching to layout mode)
            const layoutAnchor = container.layoutAnchor || null;
            const layoutResult = window.LayoutEngine.calculateLayout(children, container.autoLayout, containerSize, layoutAnchor);

            this.applyLayoutPositionsAndSizes(children, layoutResult.positions, layoutResult.sizes, container);

            // CRITICAL FIX: Use layoutResult.sizes (not recalculated sizes) for bounds calculation
            // layoutResult.positions corresponds to layoutResult.sizes from LayoutEngine
            // Recalculating sizes breaks the array index correspondence and causes position/size mismatch
            const layoutBounds = this.calculateLayoutBounds(layoutResult.positions, layoutResult.sizes, layoutAnchor);

            return { success: true, layoutBounds };
        } else {
        }

        return { success: false, reason: 'LayoutEngine not available' };
    }
    
    /**
     * Get container size from mesh geometry
     * @param {Object} container - Container object data
     * @returns {THREE.Vector3} Container size
     */
    getContainerSize(container) {
        if (!container || !container.mesh || !container.mesh.geometry) {
            return new THREE.Vector3(1, 1, 1); // Default size
        }

        const dimensions = GeometryUtils.getGeometryDimensions(container.mesh.geometry);
        if (dimensions) {
            return new THREE.Vector3(dimensions.x, dimensions.y, dimensions.z);
        }

        return new THREE.Vector3(1, 1, 1); // Fallback
    }

    /**
     * Calculate container size needed to wrap layout objects
     * SIMPLIFIED: Only calculates size, container position never changes
     * @param {Array} positions - Array of THREE.Vector3 positions (local space)
     * @param {Array} sizes - Array of THREE.Vector3 sizes
     * @param {THREE.Vector3} layoutAnchor - Optional layout anchor to subtract from positions (fixes double-offset)
     * @returns {THREE.Vector3} Container size needed to wrap all objects
     */
    calculateLayoutBounds(positions, sizes, layoutAnchor = null) {
        if (!positions || !sizes || positions.length === 0) {
            return { size: new THREE.Vector3(1, 1, 1) };
        }

        let minX = Infinity, maxX = -Infinity;
        let minY = Infinity, maxY = -Infinity;
        let minZ = Infinity, maxZ = -Infinity;

        for (let i = 0; i < positions.length && i < sizes.length; i++) {
            const pos = positions[i];
            const size = sizes[i];

            // Apply layout anchor offset correction to get origin-centered bounds
            // This fixes the double-offset issue when layoutAnchor was used in layout calculation
            const correctedPos = layoutAnchor ?
                new THREE.Vector3(
                    pos.x - layoutAnchor.x,
                    pos.y - layoutAnchor.y,
                    pos.z - layoutAnchor.z
                ) : pos;

            const halfSize = size.clone().multiplyScalar(0.5);

            minX = Math.min(minX, correctedPos.x - halfSize.x);
            maxX = Math.max(maxX, correctedPos.x + halfSize.x);
            minY = Math.min(minY, correctedPos.y - halfSize.y);
            maxY = Math.max(maxY, correctedPos.y + halfSize.y);
            minZ = Math.min(minZ, correctedPos.z - halfSize.z);
            maxZ = Math.max(maxZ, correctedPos.z + halfSize.z);
        }

        const size = new THREE.Vector3(
            maxX - minX,
            maxY - minY,
            maxZ - minZ
        );

        return { size };
    }

    /**
     * Get object data by ID (alias for getObject)
     * @param {number} id - Object ID
     * @returns {Object|null} Object data or null if not found
     */
    getObjectData(id) {
        return this.getObject(id);
    }

    /**
     * Get all child objects of a container
     * @param {number} containerId - Container object ID
     * @returns {Array} Array of child object data
     */
    getChildObjects(containerId) {
        const children = [];
        for (const obj of this.objects.values()) {
            if (obj.parentContainer === containerId) {
                children.push(obj);
            }
        }
        return children;
    }
    
    /**
     * Apply calculated positions and sizes to objects
     * @param {Array} objects - Array of object data
     * @param {Array} positions - Array of position vectors
     * @param {Array} sizes - Array of size vectors
     * @param {Object} container - Container object data
     */
    applyLayoutPositionsAndSizes(objects, positions, sizes, container = null) {

        if (objects.length !== positions.length || objects.length !== sizes.length) {
            return;
        }

        objects.forEach((obj, index) => {
            const layoutPosition = positions[index];
            // layoutSize available if needed: sizes[index]

            // CRITICAL FIX: Use local positions when objects are children of container
            // Layout positions are already relative to container coordinate space
            if (container && container.mesh && obj.mesh.parent === container.mesh) {
                // Object is child of container - use layout position directly as local position
                obj.mesh.position.copy(layoutPosition);

                // Update object data position to maintain consistency (world position)
                obj.position = obj.mesh.getWorldPosition(new THREE.Vector3());

            } else {
                // Object not in container hierarchy - use world position (fallback)
                const containerPosition = container && container.mesh ? container.mesh.position : new THREE.Vector3(0, 0, 0);
                const worldPosition = new THREE.Vector3()
                    .copy(layoutPosition)
                    .add(containerPosition);

                obj.mesh.position.copy(worldPosition);
                obj.position = worldPosition.clone();

            }

            // CAD PRINCIPLE: Never resize objects - maintain 1:1 scale
            // Objects keep their original geometry - layout only positions them

            // Transform change notification handled by mesh synchronizer
        });

    }
    
    /**
     * Set parent container for an object
     * @param {number} objectId - Object ID
     * @param {number} parentId - Parent container ID (null to remove from container)
     * @param {boolean} updateLayout - Whether to update layout automatically (default: true)
     * @returns {boolean} True if parent was successfully set
     */
    setParentContainer(objectId, parentId, updateLayout = true) {
        const obj = this.objects.get(objectId);
        if (!obj) return false;
        
        if (parentId && !this.objects.get(parentId)?.isContainer) {
            return false;
        }
        
        const mesh = obj.mesh;
        if (!mesh) return false;
        
        // Handle Three.js hierarchy changes
        if (parentId) {
            // Moving to a container
            const parentContainer = this.objects.get(parentId);
            if (parentContainer && parentContainer.mesh) {
                // CRITICAL FIX: Only handle hierarchy if object is not already a child
                // This prevents interference with ContainerManager's position calculations
                if (mesh.parent !== parentContainer.mesh) {
                    // Store world position before changing parent
                    const worldPosition = mesh.getWorldPosition(new THREE.Vector3());
                    
                    // Remove from current parent
                    if (mesh.parent) {
                        mesh.parent.remove(mesh);
                    }
                    
                    // Add to container
                    parentContainer.mesh.add(mesh);
                    
                    // Convert world position to local position relative to container
                    const containerWorldMatrix = parentContainer.mesh.matrixWorld;
                    const containerWorldMatrixInverse = new THREE.Matrix4().copy(containerWorldMatrix).invert();
                    const localPosition = worldPosition.applyMatrix4(containerWorldMatrixInverse);
                    mesh.position.copy(localPosition);
                }
                // If already a child, skip hierarchy changes (ContainerManager handled it)
            }
        } else {
            // Moving to root (removing from container)
            if (mesh.parent && mesh.parent !== this.scene) {
                // Store world position before changing parent
                const worldPosition = mesh.getWorldPosition(new THREE.Vector3());
                
                // Remove from container
                mesh.parent.remove(mesh);
                
                // Add to scene at world position
                this.scene.add(mesh);
                mesh.position.copy(worldPosition);
            }
        }
        
        // Update metadata
        obj.parentContainer = parentId;

        
        // Update layout of the new parent container only if requested
        if (parentId && updateLayout) {
            const container = this.objects.get(parentId);
            // Only update layout if container has auto layout enabled
            if (container && container.autoLayout && container.autoLayout.enabled) {
                this.updateLayout(parentId);
            }
        }
        
        return true;
    }
    
    /**
     * Update object dimensions using CAD-style geometry modification
     * Follows geometry-based manipulation principles from CLAUDE.md
     * @param {string} objectId - ID of the object to update
     * @param {string} axis - Axis to update ('x', 'y', or 'z')
     * @param {number} newDimension - New dimension value
     * @returns {boolean} - Success status
     */
    updateObjectDimensions(objectId, axis, newDimension) {
        const objectData = this.getObject(objectId);
        if (!objectData || !objectData.mesh || !objectData.mesh.geometry) {
            console.warn('Cannot update dimensions: object or geometry not found', objectId);
            return false;
        }

        const mesh = objectData.mesh;
        const geometry = mesh.geometry;

        try {
            // Validate geometry for manipulation
            if (!GeometryUtils.validateGeometryForManipulation(geometry)) {
                console.warn('Geometry is not valid for manipulation:', objectId);
                return false;
            }

            // Use GeometryUtils for CAD-style vertex manipulation
            const success = GeometryUtils.scaleGeometryAlongAxis(geometry, axis, newDimension);
            if (!success) {
                console.error('Failed to scale geometry along axis:', axis);
                return false;
            }

            // Update support mesh geometries using GeometryUtils wrapper
            GeometryUtils.updateSupportMeshGeometries(mesh);

            // Update object metadata
            if (!objectData.dimensions) objectData.dimensions = { x: 1, y: 1, z: 1 };
            objectData.dimensions[axis] = newDimension;

            // Use centralized completion pattern
            TransformNotificationUtils.completeDimensionChange(mesh, axis);

            return true;

        } catch (error) {
            console.error('Failed to update object dimensions:', error);
            return false;
        }
    }

    /**
     * Notify that an object's transform (position/rotation/scale) has changed
     * This triggers container resizing for parent containers AND selection wireframe updates
     * @param {string} objectId - ID of the object that changed
     */
    notifyObjectTransformChanged(objectId) {
        const obj = this.objects.get(objectId);
        if (!obj) {
            // Skip transform notification - object not found
            return;
        }

        // Update parent containers if this object is a child
        if (obj.parentContainer) {
            const MovementUtils = window.MovementUtils;
            if (MovementUtils) {
                // Use realTime = true to indicate this is a final update after drag completion
                MovementUtils.updateParentContainer(obj.mesh, true, null, null, true);
            }
        }

        // Update related meshes (selection wireframes, etc.) but suppress container wireframes during container context
        const meshSynchronizer = window.modlerComponents?.meshSynchronizer;
        if (meshSynchronizer) {
            // Check if we're in container context and this is the container we're stepped into
            const navigationController = window.modlerComponents?.navigationController;
            const isInContainerContext = navigationController?.isInContainerContext() || false;
            const containerContext = navigationController?.getCurrentContainer()?.mesh;

            if (isInContainerContext && obj.isContainer && obj.mesh === containerContext) {
                // Skip wireframe updates for the container we're stepped into - ContainerInteractionManager handles its visualization
                return;
            }

            meshSynchronizer.syncAllRelatedMeshes(obj.mesh, 'transform', true);
        }
    }

    /**
     * NESTED CONTAINER SUPPORT: Circular reference validation
     * Prevents containers from containing themselves or creating cycles
     */

    /**
     * Check if placing containerA inside containerB would create a circular reference
     * @param {string} containerAId - ID of container to be nested
     * @param {string} containerBId - ID of target parent container
     * @returns {boolean} true if would create circular reference, false if safe
     */
    wouldCreateCircularReference(containerAId, containerBId) {
        // Can't contain itself
        if (containerAId === containerBId) {
            return true;
        }

        // Check if containerB is already descendant of containerA
        return this.isDescendantContainer(containerBId, containerAId);
    }

    /**
     * Check if a container is a descendant of another container
     * @param {string} potentialDescendantId - Container that might be a descendant
     * @param {string} ancestorId - Container that might be an ancestor
     * @returns {boolean} true if descendant relationship exists
     */
    isDescendantContainer(potentialDescendantId, ancestorId) {
        const descendant = this.objects.get(potentialDescendantId);
        if (!descendant || !descendant.isContainer) {
            return false;
        }

        // Walk up the parent chain
        let currentId = potentialDescendantId;
        const visited = new Set(); // Prevent infinite loops in corrupted data

        while (currentId) {
            // Prevent infinite loops
            if (visited.has(currentId)) {
                // Circular reference detected - treat as circular to prevent further nesting
                return true;
            }
            visited.add(currentId);

            const current = this.objects.get(currentId);
            if (!current) break;

            // Check if current container's parent is our target ancestor
            if (current.parentContainer === ancestorId) {
                return true; // Found ancestor relationship
            }

            // Move up to parent
            currentId = current.parentContainer;
        }

        return false;
    }

    /**
     * Get the nesting depth of a container (how many levels deep it is)
     * @param {string} containerId - ID of container to check
     * @returns {number} nesting depth (0 = root level)
     */
    getContainerNestingDepth(containerId) {
        const container = this.objects.get(containerId);
        if (!container || !container.isContainer) {
            return 0;
        }

        let depth = 0;
        let currentId = container.parentContainer;
        const visited = new Set();

        while (currentId) {
            if (visited.has(currentId)) {
                // Circular reference in nesting depth calculation
                return -1; // Error state
            }
            visited.add(currentId);

            const parent = this.objects.get(currentId);
            if (!parent || !parent.isContainer) break;

            depth++;
            currentId = parent.parentContainer;
        }

        return depth;
    }

    /**
     * Get all nested containers within a parent container (recursive)
     * @param {string} parentContainerId - Parent container ID
     * @returns {Array<Object>} Array of nested container objects
     */
    getNestedContainers(parentContainerId) {
        const children = this.getChildObjects(parentContainerId);
        const nestedContainers = [];

        children.forEach(child => {
            if (child.isContainer) {
                nestedContainers.push(child);
                // Recursively get nested containers within this child container
                const deeplyNested = this.getNestedContainers(child.id);
                nestedContainers.push(...deeplyNested);
            }
        });

        return nestedContainers;
    }

    /**
     * Create object metadata structure
     * @param {number} id - Object ID
     * @param {THREE.Object3D} mesh - Three.js mesh
     * @param {Object} options - Object creation options
     * @returns {Object} Object metadata
     */
    createObjectMetadata(id, mesh, options) {
        return {
            id: id,
            mesh: mesh,
            type: options.type || 'mesh',
            name: options.name || `object_${id}`,
            category: options.category || 'permanent', // 'permanent', 'ui', 'system'
            created: Date.now(),
            visible: true,
            selectable: options.selectable !== false, // default true
            userData: options.userData || {},

            // Auto layout properties
            isContainer: options.isContainer || false,
            autoLayout: null, // Will contain layout config when enabled
            parentContainer: options.parentContainer || null,
            layoutProperties: {
                sizeX: options.sizeX || 'fixed', // 'fixed', 'fill', 'hug'
                sizeY: options.sizeY || 'fixed',
                sizeZ: options.sizeZ || 'fixed',
                fixedSize: options.fixedSize || null // Used when size mode is 'fixed'
            }
        };
    }

    /**
     * Configure mesh properties and transforms
     * @param {THREE.Object3D} mesh - Mesh to configure
     * @param {Object} objectData - Object metadata
     * @param {Object} options - Configuration options
     */
    configureMesh(mesh, objectData, options) {
        mesh.name = objectData.name;
        mesh.userData.id = objectData.id;
        mesh.userData.type = objectData.type;

        // No shadows - keep it simple
        mesh.castShadow = false;
        mesh.receiveShadow = false;

        // Apply transforms if specified
        if (options.position) {
            mesh.position.copy(options.position);
        }

        if (options.rotation) {
            mesh.rotation.copy(options.rotation);
        }

        if (options.scale) {
            mesh.scale.copy(options.scale);
        }
    }

    /**
     * Calculate object dimensions from geometry
     * @param {THREE.Object3D} mesh - Mesh to analyze
     * @param {Object} objectData - Object metadata to update
     */
    calculateObjectDimensions(mesh, objectData) {
        if (mesh.geometry) {
            const dimensions = GeometryUtils.getGeometryDimensions(mesh.geometry);
            if (dimensions) {
                objectData.dimensions = dimensions;
            }
        }
    }

    // Memory cleanup
    destroy() {
        this.clear();
        this.objects.clear();
        // SceneController destroyed
    }
}

// Export for use in main application
window.SceneController = SceneController;