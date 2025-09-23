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
     * Generate next sequential box name
     * @returns {string} Box name like "Box 001"
     */
    generateBoxName() {
        const name = `Box ${this.nextBoxNumber.toString().padStart(3, '0')}`;
        this.nextBoxNumber++;
        return name;
    }
    
    /**
     * Generate next sequential container name  
     * @returns {string} Container name like "Container 001"
     */
    generateContainerName() {
        const name = `Container ${this.nextContainerNumber.toString().padStart(3, '0')}`;
        this.nextContainerNumber++;
        return name;
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
        const objectData = {
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
        
        // Configure mesh
        mesh.name = objectData.name;
        mesh.userData.id = id;
        mesh.userData.type = objectData.type;
        
        // No shadows - keep it simple
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        
        // Position if specified
        if (options.position) {
            mesh.position.copy(options.position);
        }
        
        // Rotation if specified
        if (options.rotation) {
            mesh.rotation.copy(options.rotation);
        }
        
        // Scale if specified
        if (options.scale) {
            mesh.scale.copy(options.scale);
        }

        // Calculate dimensions from geometry for property panel consistency
        if (mesh.geometry && mesh.geometry.computeBoundingBox) {
            mesh.geometry.computeBoundingBox();
            const box = mesh.geometry.boundingBox;
            if (box) {
                objectData.dimensions = {
                    x: Math.abs(box.max.x - box.min.x),
                    y: Math.abs(box.max.y - box.min.y),
                    z: Math.abs(box.max.z - box.min.z)
                };
            }
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
        
        // Update transform properties
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
    
    // Find objects by name pattern
    // Removed unused findObjectsByName method
    
    // Get selectable objects (for raycasting)
    getSelectableObjects() {
        return this.getAllObjects()
            .filter(obj => obj.selectable && obj.visible)
            .map(obj => obj.mesh);
    }
    
    // Removed unused updateObjectMetadata method - dead code elimination
    
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
     * Moves children to container-relative positions near (0,0,0) so layout can position them correctly
     * @param {number} containerId - Container object ID
     */
    resetChildPositionsForLayout(containerId) {
        const childObjects = this.getChildObjects(containerId);
        if (childObjects.length === 0) return;


        // Reset each child to container-relative position at (0,0,0)
        childObjects.forEach((childData, index) => {
            if (childData.mesh) {
                // Position all children at (0,0,0) - layout calculation will position them properly
                // Removing the index * 0.1 offset that was causing layout positioning issues
                childData.mesh.position.set(0, 0, 0);
                childData.mesh.updateMatrixWorld();
            }
        });
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

            // CENTERING FIX: Store original container center to preserve position
            const originalContainerCenter = container.mesh.position.clone();

            const layoutResult = window.LayoutEngine.calculateLayout(children, container.autoLayout, containerSize);

            this.applyLayoutPositionsAndSizes(children, layoutResult.positions, layoutResult.sizes, container);

            // Calculate the bounds needed for container to wrap the layout, preserving original center
            const layoutBounds = this.calculateLayoutBounds(layoutResult.positions, layoutResult.sizes, originalContainerCenter);

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

        // Force geometry bounds recalculation
        container.mesh.geometry.computeBoundingBox();
        const box = container.mesh.geometry.boundingBox;

        if (box) {
            return new THREE.Vector3(
                box.max.x - box.min.x,
                box.max.y - box.min.y,
                box.max.z - box.min.z
            );
        }

        return new THREE.Vector3(1, 1, 1); // Fallback
    }

    /**
     * Calculate layout bounds from positions and sizes
     * @param {Array} positions - Array of THREE.Vector3 positions
     * @param {Array} sizes - Array of THREE.Vector3 sizes
     * @param {THREE.Vector3} originalCenter - Original container center to preserve (optional)
     * @returns {Object} Layout bounds with center and size
     */
    calculateLayoutBounds(positions, sizes, originalCenter = null) {
        if (!positions || !sizes || positions.length === 0) {
            return { center: new THREE.Vector3(), size: new THREE.Vector3(1, 1, 1) };
        }

        let minX = Infinity, maxX = -Infinity;
        let minY = Infinity, maxY = -Infinity;
        let minZ = Infinity, maxZ = -Infinity;

        for (let i = 0; i < positions.length && i < sizes.length; i++) {
            const pos = positions[i];
            const size = sizes[i];

            const halfSize = size.clone().multiplyScalar(0.5);

            minX = Math.min(minX, pos.x - halfSize.x);
            maxX = Math.max(maxX, pos.x + halfSize.x);
            minY = Math.min(minY, pos.y - halfSize.y);
            maxY = Math.max(maxY, pos.y + halfSize.y);
            minZ = Math.min(minZ, pos.z - halfSize.z);
            maxZ = Math.max(maxZ, pos.z + halfSize.z);
        }

        // Use original center if provided, otherwise calculate from layout bounds
        const center = originalCenter ?
            originalCenter.clone() :
            new THREE.Vector3(
                (minX + maxX) / 2,
                (minY + maxY) / 2,
                (minZ + maxZ) / 2
            );

        const size = new THREE.Vector3(
            maxX - minX,
            maxY - minY,
            maxZ - minZ
        );

        return { center, size };
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
            const layoutSize = sizes[index];

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

            // Apply size to object mesh if it's a box geometry
            if (obj.mesh.geometry && obj.mesh.geometry.type === 'BoxGeometry') {
                const newGeometry = new THREE.BoxGeometry(
                    layoutSize.x,
                    layoutSize.y,
                    layoutSize.z
                );

                // Dispose old geometry
                obj.mesh.geometry.dispose();
                obj.mesh.geometry = newGeometry;

                // Update object data dimensions
                obj.width = layoutSize.x;
                obj.height = layoutSize.y;
                obj.depth = layoutSize.z;
            }

            // Notify of transform change for selection wireframe updates
            this.syncSelectionWireframes(obj.id);
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
     * Sync selection wireframes for a specific object
     * Updates the wireframe transform to match the object's current transform
     * @param {string} objectId - ID of the object whose wireframe needs syncing
     */
    syncSelectionWireframes(objectId) {
        const obj = this.objects.get(objectId);
        if (!obj) {
            // Skip wireframe sync - object not found
            return;
        }


        // Selection wireframe sync is now handled by direct mesh sync from property panel
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
            // Force geometry bounds recalculation
            geometry.computeBoundingBox();
            const bbox = geometry.boundingBox;

            // Calculate current dimension and scale factor
            const axisIndex = { x: 0, y: 1, z: 2 }[axis];
            const currentDimension = bbox.max[axis] - bbox.min[axis];
            const scaleFactor = newDimension / currentDimension;
            const center = (bbox.max[axis] + bbox.min[axis]) * 0.5;

            // Modify vertices directly for true CAD behavior
            const positions = geometry.getAttribute('position');
            const vertices = positions.array;

            for (let i = 0; i < vertices.length; i += 3) {
                const vertexIndex = i + axisIndex;
                const distanceFromCenter = vertices[vertexIndex] - center;
                vertices[vertexIndex] = center + (distanceFromCenter * scaleFactor);
            }

            // Update geometry and trigger proper updates
            positions.needsUpdate = true;
            geometry.computeBoundingBox();

            // Update object metadata
            if (!objectData.dimensions) objectData.dimensions = { x: 1, y: 1, z: 1 };
            objectData.dimensions[axis] = newDimension;

            // Trigger transform change notification for container updates
            this.notifyObjectTransformChanged(objectId);

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
        
        // Visual updates and container operations are now handled by MovementUtils.completeObjectModification
        // This ensures property panel uses the exact same proven pattern as push tool
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