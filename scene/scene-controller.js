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

        // Lifecycle manager (Phase 5.3 refactoring)
        this.lifecycleManager = null;

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

    getLifecycleManager() {
        if (!this.lifecycleManager) {
            this.lifecycleManager = window.modlerComponents?.sceneLifecycleManager;
        }
        return this.lifecycleManager;
    }

    /**
     * Generate sequential names for objects
     * @param {string} type - Object type ('box', 'container')
     * @returns {string} Generated name like "Box 001" or "Container 001"
     */
    generateObjectName(type) {
        const manager = this.getLifecycleManager();
        return manager ? manager.generateObjectName(type) : `Object ${Date.now()}`;
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

    /**
     * Add object to scene (DELEGATED to SceneLifecycleManager)
     */
    addObject(geometry, material, options = {}) {
        const manager = this.getLifecycleManager();
        if (!manager) {
            console.error('SceneController: LifecycleManager not initialized');
            return null;
        }
        return manager.addObject(geometry, material, options);
    }
    
    /**
     * Remove object from scene (DELEGATED to SceneLifecycleManager)
     */
    removeObject(id) {
        const manager = this.getLifecycleManager();
        if (!manager) {
            console.error('SceneController: LifecycleManager not initialized');
            return false;
        }
        return manager.removeObject(id);
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
    /**
     * Create object metadata (DELEGATED to SceneLifecycleManager)
     */
    createObjectMetadata(id, mesh, options) {
        const manager = this.getLifecycleManager();
        if (!manager) {
            console.error('SceneController: LifecycleManager not initialized');
            return null;
        }
        return manager.createObjectMetadata(id, mesh, options);
    }

    /**
     * Configure mesh properties and transforms
     * @param {THREE.Object3D} mesh - Mesh to configure
     * @param {Object} objectData - Object metadata
     * @param {Object} options - Configuration options
     */
    configureMesh(mesh, objectData, options) {
        const manager = this.getLifecycleManager();
        if (manager) {
            manager.configureMesh(mesh, objectData, options);
        }
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
     * Sync object to state (DELEGATED to SceneLifecycleManager)
     */
    syncObjectToStateManager(objectData) {
        const manager = this.getLifecycleManager();
        if (manager) {
            manager.syncObjectToStateManager(objectData);
        }
    }

    /**
     * Retry object sync (DELEGATED to SceneLifecycleManager)
     */
    retryObjectSync(objectData, attempt) {
        const manager = this.getLifecycleManager();
        if (manager) {
            manager.retryObjectSync(objectData, attempt);
        }
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