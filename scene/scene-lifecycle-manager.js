import * as THREE from 'three';
/**
 * SceneLifecycleManager - Object Creation and Deletion Operations
 *
 * Extracted from SceneController as part of Phase 5 refactoring.
 * Manages all object lifecycle operations: creation, deletion, metadata, configuration.
 *
 * Responsibilities:
 * - Add objects to scene with metadata
 * - Remove objects from scene with cleanup
 * - Create object metadata structures
 * - Configure mesh properties and transforms
 * - Sync objects to ObjectStateManager
 * - Emit lifecycle events
 *
 * Dependencies:
 * - THREE.js - Mesh creation and scene management
 * - SupportMeshFactory - Support mesh creation and cleanup
 * - ObjectStateManager - Unified state synchronization
 * - ObjectEventBus - Lifecycle event notifications
 * - DimensionManager - Dimension extraction from geometry
 * - SceneHierarchyManager - Parent-child tracking
 *
 * @class SceneLifecycleManager
 */
class SceneLifecycleManager {
    constructor() {
        // Component references (lazy-loaded via getters or passed in)
        this.scene = null;
        this.objects = null; // Map reference from SceneController
        this.rootChildrenOrder = null; // Array reference from SceneController
        this.nextId = 1;
        this.nextBoxNumber = 1;
        this.nextContainerNumber = 1;

        // For legacy event system
        this.eventCallbacks = {};
    }

    /**
     * Initialize the lifecycle manager
     * @param {THREE.Scene} scene - Three.js scene
     * @param {Map} objects - Object map from SceneController
     * @param {Array} rootChildrenOrder - Root order array from SceneController
     * @param {Object} counters - ID and name counters {nextId, nextBoxNumber, nextContainerNumber}
     * @param {Object} eventCallbacks - Event callback registry
     */
    initialize(scene, objects, rootChildrenOrder, counters, eventCallbacks) {
        this.scene = scene;
        this.objects = objects;
        this.rootChildrenOrder = rootChildrenOrder;
        this.nextId = counters.nextId;
        this.nextBoxNumber = counters.nextBoxNumber;
        this.nextContainerNumber = counters.nextContainerNumber;
        this.eventCallbacks = eventCallbacks;
        return true;
    }

    /**
     * Get SupportMeshFactory (lazy-loaded)
     */
    getSupportMeshFactory() {
        return window.modlerComponents?.supportMeshFactory;
    }

    /**
     * Get ObjectStateManager (lazy-loaded)
     */
    getObjectStateManager() {
        return window.modlerComponents?.objectStateManager;
    }

    /**
     * Get SceneHierarchyManager (lazy-loaded)
     */
    getHierarchyManager() {
        return window.modlerComponents?.sceneHierarchyManager;
    }

    /**
     * Add object to scene with metadata
     * @param {THREE.BufferGeometry|THREE.Object3D} geometry - Geometry or Three.js object
     * @param {THREE.Material} material - Material (if geometry provided)
     * @param {Object} options - Configuration options
     * @returns {Object|null} Object data or null if creation failed
     */
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

        // CRITICAL: Force matrix update after position changes
        // This ensures getWorldPosition() returns correct values when setting parent
        mesh.updateMatrixWorld(true);

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

        // CRITICAL FIX: Establish parent-child hierarchy if parentContainer specified
        // This ensures children are properly linked to parent in Three.js scene graph,
        // added to parent's childrenOrder, and positioned correctly
        if (objectData.parentContainer) {
            const hierarchyManager = this.getHierarchyManager();
            if (hierarchyManager) {
                // Get callback references for layout updates from SceneController
                const sceneController = window.modlerComponents?.sceneController;
                const callbacks = sceneController ? {
                    updateLayout: sceneController.updateLayout ? sceneController.updateLayout.bind(sceneController) : () => {},
                    updateHugContainerSize: sceneController.updateHugContainerSize ? sceneController.updateHugContainerSize.bind(sceneController) : () => {},
                    resizeToLayoutBounds: sceneController.resizeToLayoutBounds ? sceneController.resizeToLayoutBounds.bind(sceneController) : null
                } : {};

                // NOTE: Position in options is treated as LOCAL to parent (not world)
                // setParentContainer will handle hierarchy changes but won't convert coordinates
                // because mesh.position was already set as local in configureMesh()
                const success = hierarchyManager.setParentContainer(
                    id,
                    objectData.parentContainer,
                    callbacks,
                    false  // shouldUpdateLayout=false during creation
                );

                if (!success) {
                    console.warn(`SceneLifecycleManager: Failed to set parent ${objectData.parentContainer} for object ${id}`);
                }
            }
        } else {
            // Track root-level objects in order (delegated to hierarchy manager)
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
                { immediate: true, source: 'SceneLifecycleManager.addObject' }
            );
        }

        // Emit legacy event for backward compatibility
        this.emit('objectAdded', objectData);

        return objectData;
    }

    /**
     * Remove object from scene
     * @param {number} id - Object ID
     * @returns {boolean} True if successfully removed
     */
    removeObject(id) {
        const objectData = this.objects.get(id);
        if (!objectData) {
            return false;
        }

        // CRITICAL FIX: Recursively delete container children FIRST
        // This ensures all child objects are cleaned up when parent is deleted
        if (objectData.isContainer) {
            const hierarchyManager = this.getHierarchyManager();
            if (hierarchyManager) {
                const children = hierarchyManager.getChildObjects(id);
                if (children.length > 0) {
                    console.log(`SceneLifecycleManager: Recursively deleting ${children.length} children of container ${id} "${objectData.name}"`);
                    for (const child of children) {
                        console.log(`  Deleting child ${child.id} "${child.name}" (type: ${child.type})`);
                        this.removeObject(child.id); // Recursive deletion
                    }
                }
            }
        }

        // Clean up support meshes
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
        const objectStateManager = this.getObjectStateManager();
        if (objectStateManager) {
            objectStateManager.objects.delete(id);
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
                { immediate: true, source: 'SceneLifecycleManager.removeObject' }
            );
        }

        // Emit event for UI updates
        this.emit('objectRemoved', objectData);

        return true;
    }

    /**
     * Create object metadata structure using schema-based factory
     * ARCHITECTURE: Uses ObjectDataFormat.createObjectMetadata() for schema consistency
     *
     * @param {number} id - Object ID
     * @param {THREE.Object3D} mesh - Three.js mesh
     * @param {Object} options - Configuration options
     * @returns {Object} Object metadata
     */
    createObjectMetadata(id, mesh, options) {
        // Use schema-based factory for complete object metadata with proper defaults
        const objectDataFormat = window.ObjectDataFormat;

        if (objectDataFormat && objectDataFormat.createObjectMetadata) {
            // SCHEMA-FIRST: Use centralized factory (ensures autoLayout never null)
            const metadata = objectDataFormat.createObjectMetadata({
                ...options,
                id,
                mesh
            });

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

        // FALLBACK: If ObjectDataFormat not available (during initialization), use inline defaults
        console.warn('SceneLifecycleManager: ObjectDataFormat not available, using fallback');
        const metadata = {
            id: id,
            mesh: mesh,
            type: options.type || 'mesh',
            name: options.name || `object_${id}`,
            category: options.category || 'permanent',
            created: Date.now(),
            visible: true,
            selectable: options.selectable !== false,
            userData: options.userData || {},

            isTemporary: options.isTemporary || false,
            isPreview: options.isPreview || false,

            isContainer: options.isContainer || false,
            autoLayout: options.autoLayout || {
                enabled: false,
                direction: null,
                gap: 0,
                padding: { width: 0, height: 0, depth: 0 },
                alignment: { x: 'center', y: 'center', z: 'center' },
                reversed: false
            },
            parentContainer: options.parentContainer || null,

            containerMode: options.containerMode || (options.isContainer ? (options.sizingMode || 'hug') : null),
            // LEGACY flags - kept in sync for backward compat
            isHug: options.containerMode === 'hug' || options.sizingMode === 'hug' || options.isHug || false,
            sizingMode: options.containerMode || options.sizingMode || null,
            childrenOrder: options.childrenOrder || [],
            layoutMode: options.layoutMode || null,

            layoutProperties: options.layoutProperties || {
                sizeX: options.sizeX || 'fixed',
                sizeY: options.sizeY || 'fixed',
                sizeZ: options.sizeZ || 'fixed',
                fixedSize: options.fixedSize || null
            }
        };

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
     * Sync an object to ObjectStateManager for unified state management
     * Converts SceneController object data to ObjectStateManager format
     * @param {Object} objectData - Object data from SceneController
     */
    syncObjectToStateManager(objectData) {
        if (!objectData) {
            console.warn('SceneLifecycleManager: Cannot sync null objectData to ObjectStateManager');
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
            autoLayout: objectData.autoLayout || window.ObjectDataFormat.createDefaultAutoLayout(),

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
            console.error(`SceneLifecycleManager: Failed to sync object ${objectData.id} after ${MAX_ATTEMPTS} attempts`);
            return;
        }

        // Check if ObjectStateManager is now available
        const objectStateManager = this.getObjectStateManager();

        if (objectStateManager) {
            this.syncObjectToStateManager(objectData);
        } else {
            // Exponential backoff: 50ms, 100ms, 200ms, 400ms, ...
            const delay = BASE_DELAY * Math.pow(2, attempt);
            setTimeout(() => {
                this.retryObjectSync(objectData, attempt + 1);
            }, delay);
        }
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
                return `Object ${this.nextId}`;
        }
    }

    /**
     * Emit legacy event for backward compatibility
     * @param {string} event - Event name
     * @param {*} data - Event data
     */
    emit(event, data) {
        if (this.eventCallbacks[event]) {
            this.eventCallbacks[event].forEach(callback => callback(data));
        }
    }

    /**
     * Get current ID counters for external sync
     * @returns {Object} Counter values {nextId, nextBoxNumber, nextContainerNumber}
     */
    getCounters() {
        return {
            nextId: this.nextId,
            nextBoxNumber: this.nextBoxNumber,
            nextContainerNumber: this.nextContainerNumber
        };
    }

    /**
     * Set ID counters (used during scene deserialization)
     * @param {Object} counters - Counter values to set
     * @param {number} counters.nextId - Next available object ID
     * @param {number} counters.nextBoxNumber - Next box number for naming
     * @param {number} counters.nextContainerNumber - Next container number for naming
     */
    setCounters(counters) {
        if (counters.nextId !== undefined) {
            this.nextId = counters.nextId;
        }
        if (counters.nextBoxNumber !== undefined) {
            this.nextBoxNumber = counters.nextBoxNumber;
        }
        if (counters.nextContainerNumber !== undefined) {
            this.nextContainerNumber = counters.nextContainerNumber;
        }
    }

    /**
     * Reset all counters to 1 (used when clearing scene)
     */
    resetCounters() {
        this.nextId = 1;
        this.nextBoxNumber = 1;
        this.nextContainerNumber = 1;
    }
}

// Export for use in Modler V2
window.SceneLifecycleManager = SceneLifecycleManager;
