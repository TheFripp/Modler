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

        // Hierarchy manager (Phase 5.1 refactoring)
        this.hierarchyManager = null;

        // Layout manager (Phase 5.2 refactoring)
        this.layoutManager = null;

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

    getHierarchyManager() {
        if (!this.hierarchyManager) {
            this.hierarchyManager = window.modlerComponents?.sceneHierarchyManager;
        }
        return this.hierarchyManager;
    }

    getLayoutManager() {
        if (!this.layoutManager) {
            this.layoutManager = window.modlerComponents?.sceneLayoutManager;
        }
        return this.layoutManager;
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
     * Update container size to hug its children (DELEGATED to SceneLayoutManager)
     */
    updateHugContainerSize(containerId) {
        const manager = this.getLayoutManager();
        if (manager) {
            manager.updateHugContainerSize(containerId);
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

        // Generate unique ID (use provided ID for deserialization, generate new for creation)
        const id = options.id || this.nextId++;

        // If using a restored ID, ensure nextId counter stays above it
        if (options.id && options.id >= this.nextId) {
            this.nextId = options.id + 1;
        }

        // Set up object metadata
        const objectData = this.createObjectMetadata(id, mesh, options);

        // Configure mesh
        this.configureMesh(mesh, objectData, options);

        // ARCHITECTURE: Dimensions are now managed by DimensionManager
        // No caching needed - dimensions are read directly from geometry on demand
        // This eliminates the circular Save→Load→Recalculate dependency

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

        // Track root-level objects in order (delegated to hierarchy manager)
        if (!objectData.parentContainer) {
            const manager = this.getHierarchyManager();
            if (manager) {
                manager.addToRootOrder(id);
            } else {
                this.rootChildrenOrder.push(id); // Fallback during initialization
            }
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

        // Remove from hierarchy tracking (delegated to hierarchy manager)
        const manager = this.getHierarchyManager();
        if (manager) {
            manager.removeFromParentOrder(id, objectData.parentContainer);
        } else {
            // Fallback during cleanup
            if (!objectData.parentContainer) {
                const index = this.rootChildrenOrder.indexOf(id);
                if (index !== -1) {
                    this.rootChildrenOrder.splice(index, 1);
                }
            }
        }

        // Remove from registry
        this.objects.delete(id);

        // Remove from ObjectStateManager for unified state management
        if (this.objectStateManager) {
            this.objectStateManager.objects.delete(id);
            // Note: Hierarchy is rebuilt on-demand via getHierarchy(), no need to rebuild here
        }

        // UNIFIED ARCHITECTURE: Emit ObjectEventBus LIFECYCLE event for FileManager auto-save
        if (window.objectEventBus) {
            window.objectEventBus.emit(
                window.objectEventBus.EVENT_TYPES?.LIFECYCLE || 'object:lifecycle',
                objectData.id,
                {
                    operation: 'deleted',
                    objectType: objectData.type,
                    objectData: {
                        id: objectData.id,
                        name: objectData.name,
                        type: objectData.type
                    }
                },
                { immediate: true, source: 'SceneController.removeObject' }
            );
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
     * Enable auto layout on a container (DELEGATED to SceneLayoutManager)
     */
    enableAutoLayout(containerId, layoutConfig) {
        const manager = this.getLayoutManager();
        return manager ? manager.enableAutoLayout(containerId, layoutConfig) : false;
    }
    
    /**
     * Reset child positions (DELEGATED to SceneLayoutManager)
     */
    resetChildPositionsForLayout(containerId) {
        const manager = this.getLayoutManager();
        if (manager) {
            manager.resetChildPositionsForLayout(containerId);
        }
    }

    /**
     * Calculate objects center (DELEGATED to SceneLayoutManager)
     */
    calculateObjectsCenter(objectsData) {
        const manager = this.getLayoutManager();
        return manager ? manager.calculateObjectsCenter(objectsData) : new THREE.Vector3(0, 0, 0);
    }

    /**
     * Disable auto layout (DELEGATED to SceneLayoutManager)
     */
    disableAutoLayout(containerId) {
        const manager = this.getLayoutManager();
        return manager ? manager.disableAutoLayout(containerId) : false;
    }
    
    /**
     * Update layout (DELEGATED to SceneLayoutManager)
     */
    updateLayout(containerId, pushContext = null) {
        const manager = this.getLayoutManager();
        return manager ? manager.updateLayout(containerId, pushContext) : { success: false, reason: 'LayoutManager not available' };
    }
    
    /**
     * Get container size (DELEGATED to SceneLayoutManager)
     */
    getContainerSize(container) {
        const manager = this.getLayoutManager();
        return manager ? manager.getContainerSize(container) : new THREE.Vector3(1, 1, 1);
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
    /**
     * Get child objects (DELEGATED to SceneHierarchyManager)
     */
    getChildObjects(containerId) {
        const manager = this.getHierarchyManager();
        return manager ? manager.getChildObjects(containerId) : [];
    }
    
    /**
     * Apply layout positions and sizes (DELEGATED to SceneLayoutManager)
     */
    applyLayoutPositionsAndSizes(objects, positions, sizes, container = null, pushContext = null) {
        const manager = this.getLayoutManager();
        if (manager) {
            manager.applyLayoutPositionsAndSizes(objects, positions, sizes, container, pushContext);
        }
    }
    
    /**
     * Set parent container (DELEGATED to SceneHierarchyManager)
     */
    setParentContainer(objectId, parentId, updateLayout = true) {
        const manager = this.getHierarchyManager();
        if (!manager) return false;

        // Build callbacks object for layout updates
        const callbacks = {
            updateLayout: (containerId) => this.updateLayout(containerId),
            updateHugContainerSize: (containerId) => this.updateHugContainerSize(containerId),
            resizeToLayoutBounds: (container, layoutBounds) => {
                const containerCrudManager = this.getContainerCrudManager();
                if (containerCrudManager) {
                    containerCrudManager.resizeContainerToLayoutBounds(container, layoutBounds);
                }
            }
        };

        return manager.setParentContainer(objectId, parentId, callbacks, updateLayout);
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

            // Dimensions automatically updated via DimensionManager getter from geometry

            // Use centralized completion pattern
            TransformNotificationUtils.completeDimensionChange(mesh, axis);

            return true;

        } catch (error) {
            console.error('Failed to update object dimensions:', error);
            return false;
        }
    }

    /**
     * Update a single axis of an object's position
     * @param {string} objectId - ID of the object to update
     * @param {string} axis - Axis to update ('x', 'y', or 'z')
     * @param {number} value - New position value
     * @returns {boolean} - Success status
     */
    updateObjectPosition(objectId, axis, value) {
        // Validate input parameters
        if (typeof value !== 'number' || isNaN(value)) {
            console.warn('Cannot update position: invalid value', value);
            return false;
        }

        const objectData = this.getObject(objectId);
        if (!objectData || !objectData.mesh) {
            console.warn('Cannot update position: object not found', objectId);
            return false;
        }

        try {
            // Update the mesh position directly
            objectData.mesh.position[axis] = value;
            return true;
        } catch (error) {
            console.error('Failed to update object position:', error);
            return false;
        }
    }

    /**
     * Update a single axis of an object's rotation
     * @param {string} objectId - ID of the object to update
     * @param {string} axis - Axis to update ('x', 'y', or 'z')
     * @param {number} valueDegrees - New rotation value in degrees
     * @returns {boolean} - Success status
     */
    updateObjectRotation(objectId, axis, valueDegrees) {
        // Validate input parameters
        if (typeof valueDegrees !== 'number' || isNaN(valueDegrees)) {
            console.warn('Cannot update rotation: invalid value', valueDegrees);
            return false;
        }

        const objectData = this.getObject(objectId);
        if (!objectData || !objectData.mesh) {
            console.warn('Cannot update rotation: object not found', objectId);
            return false;
        }

        try {
            // Convert degrees to radians (THREE.js uses radians)
            const valueRadians = (valueDegrees * Math.PI) / 180;

            // Update the mesh rotation directly
            objectData.mesh.rotation[axis] = valueRadians;
            return true;
        } catch (error) {
            console.error('Failed to update object rotation:', error);
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
    /**
     * Hierarchy methods (DELEGATED to SceneHierarchyManager)
     */
    wouldCreateCircularReference(containerAId, containerBId) {
        const manager = this.getHierarchyManager();
        return manager ? manager.wouldCreateCircularReference(containerAId, containerBId) : false;
    }

    isDescendantContainer(potentialDescendantId, ancestorId) {
        const manager = this.getHierarchyManager();
        return manager ? manager.isDescendantContainer(potentialDescendantId, ancestorId) : false;
    }

    getContainerNestingDepth(containerId) {
        const manager = this.getHierarchyManager();
        return manager ? manager.getContainerNestingDepth(containerId) : 0;
    }

    getNestedContainers(parentContainerId) {
        const manager = this.getHierarchyManager();
        return manager ? manager.getNestedContainers(parentContainerId) : [];
    }

    /**
     * Create object metadata structure
     * @param {number} id - Object ID
     * @param {THREE.Object3D} mesh - Three.js mesh
     * @param {Object} options - Object creation options
     * @returns {Object} Object metadata
     */
    createObjectMetadata(id, mesh, options) {
        const metadata = {
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

            // Container-specific properties
            childrenOrder: [], // Explicit child ordering for layout
            layoutMode: null, // Layout mode for containers

            layoutProperties: {
                sizeX: options.sizeX || 'fixed', // 'fixed', 'fill', 'hug'
                sizeY: options.sizeY || 'fixed',
                sizeZ: options.sizeZ || 'fixed',
                fixedSize: options.fixedSize || null // Used when size mode is 'fixed'
            }
        };

        // ARCHITECTURE: Add dimensions getter for backward compatibility
        // Dimensions are NO LONGER cached - always read from geometry via DimensionManager
        Object.defineProperty(metadata, 'dimensions', {
            get() {
                return window.dimensionManager?.getDimensions(this.mesh) || { x: 1, y: 1, z: 1 };
            },
            enumerable: true,
            configurable: true
        });

        return metadata;
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
        mesh.userData.isContainer = objectData.isContainer || false;

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
     * Get object dimensions from geometry (via DimensionManager)
     * @deprecated Use window.dimensionManager.getDimensions(objectId) instead
     * @param {THREE.Object3D} mesh - Mesh to analyze
     * @returns {Object|null} Dimensions {x, y, z}
     */
    getObjectDimensions(mesh) {
        // Forward to DimensionManager (backwards compatibility)
        return window.dimensionManager?.getDimensions(mesh) || null;
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