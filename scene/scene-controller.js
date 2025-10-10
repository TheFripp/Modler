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

        // Root-level object ordering (similar to container childrenOrder)
        this.rootChildrenOrder = [];

        // Unified state management system
        this.objectStateManager = null;

        // Hug container update control
        this.hugUpdatesEnabled = true;
        
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

        // Subscribe to geometry changes to update hug containers
        this.subscribeToGeometryEvents();

        // SceneController initialized
    }

    // ====== COMPONENT GETTERS (reduce repeated lookups) ======

    getSupportMeshFactory() {
        return window.modlerComponents?.supportMeshFactory;
    }

    getObjectStateManager() {
        return window.modlerComponents?.objectStateManager;
    }

    getNavigationController() {
        return window.modlerComponents?.navigationController;
    }

    getContainerCrudManager() {
        return window.modlerComponents?.containerCrudManager;
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

    /**
     * Subscribe to geometry change events to update hug containers
     */
    subscribeToGeometryEvents() {
        const eventBus = window.objectEventBus;
        if (!eventBus) {
            console.warn('SceneController: ObjectEventBus not available, hug containers will not auto-update');
            return;
        }

        eventBus.subscribe(eventBus.EVENT_TYPES.GEOMETRY, (event) => {
            try {
                // Skip if hug updates are temporarily disabled (e.g., during layout calculation)
                if (!this.hugUpdatesEnabled) {
                    return;
                }

                const { objectId } = event;
                const objectData = this.getObject(objectId);

                if (!objectData || !objectData.parentContainer) {
                    return;
                }

                // Check if parent container has isHug enabled
                const parentData = this.getObject(objectData.parentContainer);
                if (!parentData || !parentData.isContainer || !parentData.isHug) {
                    return;
                }

                // Recalculate container size based on children
                this.updateHugContainerSize(parentData.id);

            } catch (error) {
                console.error('SceneController: Error handling geometry event for hug container:', error);
            }
        }, { subscriberId: 'SceneController_HugContainerUpdate' });
    }

    /**
     * Temporarily disable hug container updates (e.g., during push operations)
     */
    disableHugUpdates() {
        this.hugUpdatesEnabled = false;
    }

    /**
     * Re-enable hug container updates
     */
    enableHugUpdates() {
        this.hugUpdatesEnabled = true;
    }

    /**
     * Update container size to hug its children
     * @param {string} containerId - ID of the container to update
     */
    updateHugContainerSize(containerId) {
        const containerData = this.getObject(containerId);
        if (!containerData || !containerData.isContainer || !containerData.mesh) {
            return;
        }

        // Get all children
        const children = this.getChildObjects(containerId);
        if (children.length === 0) {
            return;
        }

        // Calculate bounding box that contains all children in LOCAL space (relative to container)
        const bbox = new THREE.Box3();
        children.forEach(child => {
            if (child.mesh && child.mesh.geometry) {
                // Get child's bounding box in its local space
                child.mesh.geometry.computeBoundingBox();
                const childBox = child.mesh.geometry.boundingBox.clone();

                // Transform to child's world space
                childBox.applyMatrix4(child.mesh.matrixWorld);

                // Then transform to container's local space
                const containerWorldMatrixInverse = containerData.mesh.matrixWorld.clone().invert();
                childBox.applyMatrix4(containerWorldMatrixInverse);

                bbox.union(childBox);
            }
        });

        // Get the center of the bounding box in container's local space
        const bboxCenter = bbox.getCenter(new THREE.Vector3());

        // Calculate new dimensions
        const newSize = bbox.getSize(new THREE.Vector3());

        // CRITICAL: The container needs to move so that its center aligns with the bbox center
        // This keeps the children in the same position relative to world space
        containerData.mesh.position.add(bboxCenter);
        containerData.mesh.updateMatrixWorld(true);

        // Now update all children positions to compensate for the container movement
        children.forEach(child => {
            if (child.mesh) {
                child.mesh.position.sub(bboxCenter);
                child.mesh.updateMatrixWorld(true);
            }
        });

        // Update container geometry (now centered at origin in its local space)
        const geometryUtils = window.GeometryUtils;
        if (geometryUtils && containerData.mesh.geometry) {
            geometryUtils.resizeGeometry(containerData.mesh.geometry, 'x', newSize.x, 'center');
            geometryUtils.resizeGeometry(containerData.mesh.geometry, 'y', newSize.y, 'center');
            geometryUtils.resizeGeometry(containerData.mesh.geometry, 'z', newSize.z, 'center');

            // Update stored dimensions
            containerData.dimensions = {
                x: newSize.x,
                y: newSize.y,
                z: newSize.z
            };

            // Update support meshes (selection box, wireframe)
            const supportMeshFactory = this.getSupportMeshFactory();
            if (supportMeshFactory) {
                supportMeshFactory.updateSupportMeshGeometries(containerData.mesh, false);
            }

            // console.log(`📦 Updated hug container ${containerId} to size:`, newSize, 'center offset:', bboxCenter);
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
        const supportMeshFactory = this.getSupportMeshFactory();
        if (supportMeshFactory) {
            // Create support meshes for all objects (factory handles containers vs regular objects)
            supportMeshFactory.createObjectSupportMeshes(mesh);
        }


        // Add to scene and registry
        this.scene.add(mesh);
        this.objects.set(id, objectData);

        // Track root-level objects in order
        if (!objectData.parentContainer) {
            this.rootChildrenOrder.push(id);
        }

        // Sync to ObjectStateManager for unified state management
        this.syncObjectToStateManager(objectData);

        // UNIFIED ARCHITECTURE: Emit ObjectEventBus events for UI synchronization
        if (window.objectEventBus) {
            window.objectEventBus.emit(
                window.objectEventBus.EVENT_TYPES?.LIFECYCLE || 'object:lifecycle',
                objectData.id,
                {
                    operation: 'created',
                    objectType: objectData.type,
                    objectData: {
                        name: objectData.name,
                        isContainer: objectData.isContainer,
                        position: objectData.mesh ? {
                            x: objectData.mesh.position.x,
                            y: objectData.mesh.position.y,
                            z: objectData.mesh.position.z
                        } : null,
                        dimensions: objectData.dimensions
                    }
                },
                { immediate: true, source: 'SceneController.addObject' }
            );
        }

        // Emit legacy event for backward compatibility
        this.emit('objectAdded', objectData);

        return objectData;
    }
    
    // Remove object from scene
    removeObject(id) {
        const objectData = this.objects.get(id);
        if (!objectData) {
            return false;
        }
        
        // Clean up support meshes first
        const supportMeshFactory = this.getSupportMeshFactory();
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

        // Remove from root order tracking if it was at root level
        if (!objectData.parentContainer) {
            const index = this.rootChildrenOrder.indexOf(id);
            if (index !== -1) {
                this.rootChildrenOrder.splice(index, 1);
            }
        }

        // Remove from registry
        this.objects.delete(id);

        // Remove from ObjectStateManager for unified state management
        if (this.objectStateManager) {
            this.objectStateManager.objects.delete(id);
            // Note: Hierarchy is rebuilt on-demand via getHierarchy(), no need to rebuild here
        }

        // Emit event for UI updates
        this.emit('objectRemoved', objectData);

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
        const allObjects = Array.from(this.objects.values());

        // Sort objects based on stored order (rootChildrenOrder and childrenOrder)
        // This ensures UI displays objects in the order they were created or manually reordered
        return allObjects.sort((a, b) => {
            // If objects have different parents, compare by parent hierarchy
            if (a.parentContainer !== b.parentContainer) {
                // Root objects come before nested objects (for hierarchy display)
                if (!a.parentContainer) return -1;
                if (!b.parentContainer) return 1;
                return 0;
            }

            // Same parent (or both at root) - use stored order
            let orderArray;
            if (!a.parentContainer) {
                // Root level
                orderArray = this.rootChildrenOrder;
            } else {
                // Inside container
                const parent = this.objects.get(a.parentContainer);
                orderArray = parent?.childrenOrder || [];
            }

            const aIndex = orderArray.indexOf(a.id);
            const bIndex = orderArray.indexOf(b.id);

            // If both found in order array, use that order
            if (aIndex !== -1 && bIndex !== -1) {
                return aIndex - bIndex;
            }

            // If only one found, it comes first
            if (aIndex !== -1) return -1;
            if (bIndex !== -1) return 1;

            // Neither found (shouldn't happen), maintain current order
            return 0;
        });
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
     * @param {Object} layoutConfig.padding - Padding configuration {width, height, depth} - inset from container walls
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
            padding: layoutConfig.padding || { width: 0, height: 0, depth: 0 },
            ...layoutConfig
        };

        const layoutResult = this.updateLayout(containerId);

        // Resize container to fit the laid out objects
        // SKIP for hug containers - they automatically resize based on children
        if (layoutResult && layoutResult.success && layoutResult.layoutBounds && !container.isHug) {
            const containerCrudManager = this.getContainerCrudManager();
            if (containerCrudManager) {
                containerCrudManager.resizeContainerToLayoutBounds(container, layoutResult.layoutBounds, pushContext);
            }
        }

        return true;
    }
    
    /**
     * Reset child positions to prepare for layout calculation
     * Centers children along all axes so layout starts from container center
     * @param {number} containerId - Container object ID
     */
    resetChildPositionsForLayout(containerId) {
        const childObjects = this.getChildObjects(containerId);
        if (childObjects.length === 0) return;

        const container = this.objects.get(containerId);
        if (!container || !container.mesh || !container.autoLayout) return;

        const layoutDirection = container.autoLayout.direction;

        // Get container world position for coordinate conversion
        const containerWorldPosition = container.mesh.getWorldPosition(new THREE.Vector3());

        // Use origin as layout anchor to center the layout properly
        container.layoutAnchor = new THREE.Vector3(0, 0, 0);

        // Calculate the center of all children in container's local space
        const childCenters = { x: 0, y: 0, z: 0 };
        let count = 0;

        childObjects.forEach((childData) => {
            if (childData.mesh) {
                const worldPos = childData.mesh.getWorldPosition(new THREE.Vector3());
                const relativePos = worldPos.clone().sub(containerWorldPosition);
                childCenters.x += relativePos.x;
                childCenters.y += relativePos.y;
                childCenters.z += relativePos.z;
                count++;
            }
        });

        if (count > 0) {
            childCenters.x /= count;
            childCenters.y /= count;
            childCenters.z /= count;
        }

        // Convert each child to container-relative coordinates and center ALL axes
        // This ensures the layout group is centered in the container
        childObjects.forEach((childData) => {
            if (childData.mesh) {
                const worldPos = childData.mesh.getWorldPosition(new THREE.Vector3());
                const relativePos = worldPos.clone().sub(containerWorldPosition);

                // Center children on ALL axes (layout will redistribute them along layout axis)
                relativePos.x -= childCenters.x;
                relativePos.y -= childCenters.y;
                relativePos.z -= childCenters.z;

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
    updateLayout(containerId, pushContext = null) {
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
            // Disable hug updates during layout to prevent intermediate updates
            const wasHugEnabled = this.hugUpdatesEnabled;
            this.hugUpdatesEnabled = false;

            try {
                // Get container size for fill calculations
                // CRITICAL: Always pass containerSize when layout is enabled, even for hug containers
                // Fill objects need the container size to calculate their dimensions
                const containerSize = this.getContainerSize(container);

                // Pass the layout anchor if it exists (preserves original center when switching to layout mode)
                const layoutAnchor = container.layoutAnchor || null;
                const layoutResult = window.LayoutEngine.calculateLayout(children, container.autoLayout, containerSize, layoutAnchor, pushContext);

                this.applyLayoutPositionsAndSizes(children, layoutResult.positions, layoutResult.sizes, container, pushContext);

            // Store calculated gap directly on container for display (no recursion)
            if (layoutResult.calculatedGap !== undefined) {
                container.calculatedGap = layoutResult.calculatedGap;

                // CRITICAL: Also update ObjectStateManager's copy so it's included in serialization
                const objectStateManager = this.getObjectStateManager();
                if (objectStateManager) {
                    const osmObject = objectStateManager.getObject(container.id);
                    if (osmObject) {
                        osmObject.calculatedGap = layoutResult.calculatedGap;
                    }
                }

                // Notify UI directly via event bus (triggers PostMessage with updated calculatedGap)
                if (window.objectEventBus && container.id) {
                    window.objectEventBus.emit(
                        window.objectEventBus.EVENT_TYPES.HIERARCHY,
                        container.id,
                        {
                            type: 'layout-property-changed',
                            property: 'calculatedGap',
                            value: layoutResult.calculatedGap
                        },
                        { immediate: true, source: 'SceneController.updateLayout' }
                    );
                }
            }

                // Use bounds directly from LayoutEngine (architectural improvement)
                const layoutBounds = layoutResult.bounds;

                // Resize container to match new layout bounds (for non-hug containers)
                if (!container.isHug && layoutBounds && layoutBounds.size) {
                    const containerCrudManager = this.getContainerCrudManager();
                    if (containerCrudManager) {
                        containerCrudManager.resizeContainerToLayoutBounds(container, layoutBounds, pushContext);
                    }
                }

                return { success: true, layoutBounds };

            } finally {
                // Re-enable hug updates
                this.hugUpdatesEnabled = wasHugEnabled;

                // If this is a hug container, trigger a single update now that layout is complete
                if (container.isHug) {
                    this.updateHugContainerSize(containerId);
                }
            }
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
        const container = this.objects.get(containerId);

        // If container has explicit child order, use it
        if (container && container.childrenOrder && Array.isArray(container.childrenOrder)) {
            // Map IDs to actual objects, filtering out any invalid IDs
            const orderedChildren = [];
            for (const childId of container.childrenOrder) {
                const child = this.objects.get(childId);
                if (child && child.parentContainer === containerId) {
                    orderedChildren.push(child);
                }
            }

            // Add any children not in the order array (shouldn't happen, but defensive)
            for (const obj of this.objects.values()) {
                if (obj.parentContainer === containerId && !container.childrenOrder.includes(obj.id)) {
                    orderedChildren.push(obj);
                }
            }

            return orderedChildren;
        }

        // Fallback: return children in iteration order
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
    applyLayoutPositionsAndSizes(objects, positions, sizes, container = null, pushContext = null) {

        if (objects.length !== positions.length || objects.length !== sizes.length) {
            return;
        }

        objects.forEach((obj, index) => {
            const layoutPosition = positions[index];
            const layoutSize = sizes[index];

            // Apply fill-based sizing BEFORE positioning
            if (layoutSize && obj.layoutProperties) {
                // Check each axis for fill behavior
                ['x', 'y', 'z'].forEach(axis => {
                    const sizeProperty = `size${axis.toUpperCase()}`;
                    if (obj.layoutProperties[sizeProperty] === 'fill') {
                        // Only update if size has actually changed to avoid unnecessary geometry updates
                        const currentDim = obj.dimensions?.[axis] || 1;
                        const newDim = layoutSize[axis];

                        // Validate dimension is a valid number
                        if (typeof newDim === 'number' && !isNaN(newDim) && newDim > 0) {
                            if (Math.abs(currentDim - newDim) > 0.001) {
                                // CRITICAL: Determine anchor mode based on push context
                                // If pushing on this axis, use push anchor mode
                                // Otherwise, use center to maintain symmetric resize
                                let anchorMode = 'center';
                                if (pushContext && pushContext.axis === axis) {
                                    anchorMode = pushContext.anchorMode;
                                }

                                this.updateObjectDimensions(obj.id, axis, newDim, anchorMode);
                            }
                        }
                    }
                });
            }

            // CRITICAL: During push operations, decide whether to update positions
            // - With fill objects: Skip positions (objects stay fixed, fill resizes via anchor)
            // - Without fill objects: Update positions (space-between redistribution)
            const isDuringPush = pushContext !== null;
            let shouldUpdatePosition = !isDuringPush; // Default: update unless pushing

            if (isDuringPush) {
                // Check if ANY object in container has fill on push axis
                const hasFillObjects = objects.some(o =>
                    o.layoutProperties?.[`size${pushContext.axis.toUpperCase()}`] === 'fill'
                );

                // Only update positions if using space-between (no fill objects)
                shouldUpdatePosition = !hasFillObjects;
            }

            if (shouldUpdatePosition) {
                // Normal layout update - apply positions
                // CRITICAL FIX: Use local positions when objects are children of container
                // Layout positions are already relative to container coordinate space
                if (container && container.mesh && obj.mesh.parent === container.mesh) {
                    // Object is child of container - use layout position directly as local position
                    const oldPos = obj.mesh.position.clone();
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
            }
            // During push: positions are NOT updated - objects stay where they are

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

        // Track old parent for childrenOrder updates
        const oldParentId = obj.parentContainer;

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

                // Initialize or update childrenOrder array
                if (!parentContainer.childrenOrder || !Array.isArray(parentContainer.childrenOrder)) {
                    // Initialize from current children
                    const currentChildren = this.getChildObjects(parentId);
                    parentContainer.childrenOrder = currentChildren.map(child => child.id);
                }

                // Add this object to childrenOrder if not already present
                if (!parentContainer.childrenOrder.includes(objectId)) {
                    parentContainer.childrenOrder.push(objectId);
                }
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

            // Add to rootChildrenOrder if not already present
            if (!this.rootChildrenOrder.includes(objectId)) {
                this.rootChildrenOrder.push(objectId);
            }
        }

        // Remove from old parent's childrenOrder if it exists
        if (oldParentId && oldParentId !== parentId) {
            const oldParent = this.objects.get(oldParentId);
            if (oldParent && oldParent.childrenOrder && Array.isArray(oldParent.childrenOrder)) {
                const index = oldParent.childrenOrder.indexOf(objectId);
                if (index !== -1) {
                    oldParent.childrenOrder.splice(index, 1);
                }
            }
        } else if (!oldParentId && parentId) {
            // Moving from root to a container - remove from rootChildrenOrder
            const index = this.rootChildrenOrder.indexOf(objectId);
            if (index !== -1) {
                this.rootChildrenOrder.splice(index, 1);
            }
        }

        // Update metadata
        obj.parentContainer = parentId;

        // PERFORMANCE: Clear depth cache since hierarchy changed
        const objectStateManager = this.getObjectStateManager();
        if (objectStateManager?.clearDepthCache) {
            objectStateManager.clearDepthCache();
        }

        // BYPASS ELIMINATED: Use ObjectEventBus instead of legacy window.notifyObjectModified
        if (window.objectEventBus) {
            window.objectEventBus.emit(
                window.objectEventBus.EVENT_TYPES?.HIERARCHY || 'object:hierarchy',
                objectId,
                {
                    type: 'parent-changed',
                    parentId: parentId,
                    previousParentId: obj.parentContainer,
                    childId: String(objectId)
                },
                { immediate: true, source: 'SceneController.setParentContainer' }
            );
        }

        // Update matrix world to ensure visual updates
        mesh.updateMatrixWorld(true);

        // Update layout of the new parent container only if requested
        if (parentId && updateLayout) {
            const container = this.objects.get(parentId);
            if (container) {
                // Handle hug containers
                if (container.isHug) {
                    this.updateHugContainerSize(parentId);
                }
                // Handle layout mode containers
                else if (container.autoLayout && container.autoLayout.enabled) {
                    console.log('🔄 Updating layout for container after object drop:', parentId);
                    const layoutResult = this.updateLayout(parentId);

                    // Resize container to fit new children
                    if (layoutResult && layoutResult.success && layoutResult.layoutBounds) {
                        const containerCrudManager = this.getContainerCrudManager();
                        if (containerCrudManager) {
                            containerCrudManager.resizeContainerToLayoutBounds(container, layoutResult.layoutBounds);
                        }
                    }
                }
            }
        }

        // Update layout of old parent container if it had one
        if (oldParentId && oldParentId !== parentId && updateLayout) {
            const oldContainer = this.objects.get(oldParentId);
            if (oldContainer) {
                // Handle hug containers
                if (oldContainer.isHug) {
                    this.updateHugContainerSize(oldParentId);
                }
                // Handle layout mode containers
                else if (oldContainer.autoLayout && oldContainer.autoLayout.enabled) {
                    const layoutResult = this.updateLayout(oldParentId);

                    // Resize container to fit remaining children
                    if (layoutResult && layoutResult.success && layoutResult.layoutBounds) {
                        const containerCrudManager = this.getContainerCrudManager();
                        if (containerCrudManager) {
                            containerCrudManager.resizeContainerToLayoutBounds(oldContainer, layoutResult.layoutBounds);
                        }
                    }
                }
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
    updateObjectDimensions(objectId, axis, newDimension, anchorMode = 'center') {
        // Validate input parameters
        if (typeof newDimension !== 'number' || isNaN(newDimension) || newDimension <= 0) {
            console.warn('Cannot update dimensions: invalid dimension value', newDimension);
            return false;
        }

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

            // Use UNIFIED resize method with anchor mode
            const success = GeometryUtils.resizeGeometry(geometry, axis, newDimension, anchorMode);
            if (!success) {
                console.error('Failed to resize geometry along axis:', axis);
                return false;
            }

            // Update support mesh geometries (wireframes for both objects and containers)
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

        // Update support meshes (wireframes, highlights, etc.) but suppress container wireframes during container context
        const geometryUtils = window.GeometryUtils;
        if (geometryUtils) {
            // Check if we're in container context and this is the container we're stepped into
            const navigationController = this.getNavigationController();
            const isInContainerContext = navigationController?.isInContainerContext() || false;
            const containerContext = navigationController?.getCurrentContainer()?.mesh;

            if (isInContainerContext && obj.isContainer && obj.mesh === containerContext) {
                // Skip wireframe updates for the container we're stepped into - ContainerInteractionManager handles its visualization
                return;
            }

            geometryUtils.updateSupportMeshGeometries(obj.mesh);
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

            // Preview/temporary flag for hiding from object tree
            isTemporary: options.isTemporary || false,
            isPreview: options.isPreview || false,

            // Auto layout properties
            isContainer: options.isContainer || false,
            autoLayout: null, // Will contain layout config when enabled
            parentContainer: options.parentContainer || null,

            // Container sizing mode (hug = auto-size to fit children)
            isHug: options.sizingMode === 'hug' || options.isHug || false,

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
            if (options.position.isVector3) {
                mesh.position.copy(options.position);
            } else {
                mesh.position.set(
                    options.position.x ?? 0,
                    options.position.y ?? 0,
                    options.position.z ?? 0
                );
            }
        }

        if (options.rotation) {
            if (options.rotation.isEuler) {
                mesh.rotation.copy(options.rotation);
            } else {
                // Convert from degrees to radians and set
                mesh.rotation.set(
                    (options.rotation.x ?? 0) * Math.PI / 180,
                    (options.rotation.y ?? 0) * Math.PI / 180,
                    (options.rotation.z ?? 0) * Math.PI / 180,
                    options.rotation.order || 'XYZ'
                );
            }
        }

        // CAD PRINCIPLE: Scale must always be (1, 1, 1) for exact measurements
        // Dimensions are defined by geometry, NOT by mesh.scale
        // If options.scale is provided during restoration, validate it
        if (options.scale) {
            // Only allow (1,1,1) - reject any other scale values
            if (Math.abs(options.scale.x - 1) > 0.001 ||
                Math.abs(options.scale.y - 1) > 0.001 ||
                Math.abs(options.scale.z - 1) > 0.001) {
                console.warn(`CAD violation: Attempted to set non-uniform scale ${options.scale.x},${options.scale.y},${options.scale.z} - forcing to (1,1,1)`);
            }
        }
        // Always enforce (1,1,1) scale for CAD precision
        mesh.scale.set(1, 1, 1);
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

    /**
     * Sync an object to ObjectStateManager for unified state management
     * Converts SceneController object data to ObjectStateManager format
     * @param {Object} objectData - Object data from SceneController
     */
    syncObjectToStateManager(objectData) {
        if (!objectData) {
            console.warn('SceneController: Cannot sync null objectData to ObjectStateManager');
            return;
        }

        // Get ObjectStateManager reference dynamically (handles initialization timing)
        const objectStateManager = this.getObjectStateManager();

        if (!objectStateManager) {
            // Defer sync until ObjectStateManager is available (retry up to 10 times)
            this.retryObjectSync(objectData, 0);
            return;
        }


        // Extract mesh position if available
        const meshPosition = objectData.mesh ? {
            x: objectData.mesh.position.x,
            y: objectData.mesh.position.y,
            z: objectData.mesh.position.z
        } : { x: 0, y: 0, z: 0 };

        // Extract mesh rotation if available
        const meshRotation = objectData.mesh ? {
            x: objectData.mesh.rotation.x,
            y: objectData.mesh.rotation.y,
            z: objectData.mesh.rotation.z
        } : { x: 0, y: 0, z: 0 };

        // Extract dimensions from geometry if available
        let dimensions = objectData.dimensions || { x: 1, y: 1, z: 1 };
        if (!objectData.dimensions && objectData.mesh && objectData.mesh.geometry) {
            const geometryDimensions = window.GeometryUtils?.getGeometryDimensions(objectData.mesh.geometry);
            if (geometryDimensions) {
                dimensions = {
                    x: geometryDimensions.x,
                    y: geometryDimensions.y,
                    z: geometryDimensions.z
                };
            }
        }

        // Create complete object state for ObjectStateManager
        const objectState = {
            // Core identity
            id: objectData.id,
            name: objectData.name || `Object ${objectData.id}`,
            type: objectData.type || 'box',

            // 3D properties from mesh
            position: meshPosition,
            rotation: meshRotation,
            dimensions: dimensions,

            // Container properties
            isContainer: objectData.isContainer || false,
            parentContainer: objectData.parentContainer || null,
            autoLayout: objectData.autoLayout || { enabled: false, direction: 'x' },

            // Material properties
            material: objectData.material || { color: 0x888888 },

            // Internal references
            mesh: objectData.mesh,
            _sceneObjectData: objectData
        };

        // Use importObjectFromScene instead of updateObject to avoid "not found" errors
        if (typeof objectStateManager.importObjectFromScene === 'function') {
            objectStateManager.importObjectFromScene(objectData);
        } else {
            objectStateManager.updateObject(objectData.id, objectState);
        }

        // Rebuild hierarchy to ensure UI gets updated
        if (typeof objectStateManager.rebuildHierarchy === 'function') {
            objectStateManager.rebuildHierarchy();
        }
    }

    /**
     * Retry object sync with exponential backoff and limited attempts
     * @param {Object} objectData - Object data to sync
     * @param {number} attempt - Current attempt number
     */
    retryObjectSync(objectData, attempt) {
        const MAX_ATTEMPTS = 10;
        const BASE_DELAY = 50; // Start with 50ms

        if (attempt >= MAX_ATTEMPTS) {
            console.error(`SceneController: Failed to sync object ${objectData.id} after ${MAX_ATTEMPTS} attempts`);
            return;
        }

        // Check if ObjectStateManager is now available
        const objectStateManager = this.getObjectStateManager();

        if (objectStateManager) {
            this.syncObjectToStateManager(objectData);
            return;
        }

        // Exponential backoff: 50ms, 100ms, 200ms, etc.
        const delay = BASE_DELAY * Math.pow(2, attempt);

        setTimeout(() => {
            this.retryObjectSync(objectData, attempt + 1);
        }, delay);
    }

    /**
     * Refresh all CAD wireframes with updated settings
     */
    refreshCadWireframes() {

        const supportMeshFactory = this.getSupportMeshFactory();
        if (!supportMeshFactory) {
            console.warn('❌ SupportMeshFactory not available for CAD wireframe refresh');
            return;
        }

        let refreshedCount = 0;

        // Iterate through all objects and refresh their CAD wireframes
        for (const [id, objectData] of this.objects) {
            const mesh = objectData.mesh;
            if (!mesh || !mesh.userData.supportMeshes) continue;

            const cadWireframe = mesh.userData.supportMeshes.cadWireframe;
            if (!cadWireframe) continue;

            // Remove old CAD wireframe
            mesh.remove(cadWireframe);

            // Create new CAD wireframe with updated settings
            // Use correct method based on object type (containers use different wireframe material)
            const isContainer = mesh.userData.isContainer;
            const newCadWireframe = isContainer
                ? supportMeshFactory.createContainerWireframe(mesh)
                : supportMeshFactory.createCadWireframe(mesh);

            if (newCadWireframe) {
                mesh.add(newCadWireframe);
                newCadWireframe.visible = true; // Ensure visibility

                // Update reference
                mesh.userData.supportMeshes.cadWireframe = newCadWireframe;
                refreshedCount++;
            }
        }

    }

    /**
     * Update grid colors from configuration
     */
    updateGridMainColor(color) {
        // Find the grid object
        for (const [id, objectData] of this.objects.entries()) {
            if (objectData.type === 'grid' && objectData.name === 'Floor Grid') {
                const gridMesh = objectData.mesh;
                if (gridMesh && gridMesh.children) {
                    // Find the LineSegments child (the actual grid)
                    const lineSegments = gridMesh.children.find(child => child.type === 'LineSegments');
                    if (lineSegments && lineSegments.geometry) {
                        // Update colors in the geometry
                        const colors = lineSegments.geometry.attributes.color;
                        if (colors) {
                            const mainColor = new THREE.Color(color);
                            // Update main grid lines (every other set of vertices)
                            for (let i = 0; i < colors.count; i += 2) {
                                colors.setXYZ(i, mainColor.r, mainColor.g, mainColor.b);
                            }
                            colors.needsUpdate = true;
                        }
                    }
                }
                break;
            }
        }
    }

    updateGridSubColor(color) {
        // Find the grid object
        for (const [id, objectData] of this.objects.entries()) {
            if (objectData.type === 'grid' && objectData.name === 'Floor Grid') {
                const gridMesh = objectData.mesh;
                if (gridMesh && gridMesh.children) {
                    // Find the LineSegments child (the actual grid)
                    const lineSegments = gridMesh.children.find(child => child.type === 'LineSegments');
                    if (lineSegments && lineSegments.geometry) {
                        // Update colors in the geometry
                        const colors = lineSegments.geometry.attributes.color;
                        if (colors) {
                            const subColor = new THREE.Color(color);
                            // Update sub grid lines (every other set of vertices offset by 1)
                            for (let i = 1; i < colors.count; i += 2) {
                                colors.setXYZ(i, subColor.r, subColor.g, subColor.b);
                            }
                            colors.needsUpdate = true;
                        }
                    }
                }
                break;
            }
        }
    }

    // Memory cleanup
    destroy() {
        this.clear();
        this.objects.clear();
    }
}

// Export for use in main application
window.SceneController = SceneController;