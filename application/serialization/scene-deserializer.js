/**
 * SceneDeserializer - Complete Scene Import System
 *
 * Rebuilds complete application state from JSON file data.
 * Handles version migration, validation, and reference repair.
 *
 * Used by FileManager for load operations.
 */

class SceneDeserializer {
    constructor() {
        // Component references (lazy-loaded)
        this.sceneController = null;
        this.cameraController = null;
        this.configurationManager = null;
        this.geometryFactory = null;
        this.materialManager = null;
        this.objectStateManager = null;

        // Version handlers for migration
        this.versionHandlers = {
            '1.0.0': this.deserializeV1_0_0.bind(this)
        };

        // Statistics for debugging
        this.stats = {
            deserializations: 0,
            lastDeserializationTime: 0,
            objectsRestored: 0,
            migrationOccurred: false
        };
    }

    /**
     * Initialize component references
     * Called automatically on first use
     */
    initializeComponents() {
        if (!this.sceneController) {
            this.sceneController = window.modlerComponents?.sceneController;
        }
        if (!this.cameraController) {
            this.cameraController = window.modlerComponents?.cameraController;
        }
        if (!this.configurationManager) {
            this.configurationManager = window.modlerComponents?.configurationManager;
        }
        if (!this.geometryFactory) {
            this.geometryFactory = window.modlerComponents?.geometryFactory;
        }
        if (!this.materialManager) {
            this.materialManager = window.modlerComponents?.materialManager;
        }
        if (!this.objectStateManager) {
            this.objectStateManager = window.modlerComponents?.objectStateManager;
        }
    }

    /**
     * Deserialize complete scene from JSON
     * @param {Object|string} sceneData - Scene data (object or JSON string)
     * @param {Object} options - Deserialization options
     * @returns {Promise<Object>} Result { success: boolean, error?: string }
     */
    async deserializeScene(sceneData, options = {}) {
        const startTime = performance.now();

        try {
            this.initializeComponents();

            if (!this.sceneController) {
                throw new Error('SceneController not available');
            }

            // Parse if string
            let parsedData = sceneData;
            if (typeof sceneData === 'string') {
                try {
                    parsedData = JSON.parse(sceneData);
                } catch (parseError) {
                    throw new Error('Invalid JSON format');
                }
            }

            // Validate scene data
            const validation = this.validateSceneData(parsedData);
            if (!validation.valid) {
                throw new Error(`Invalid scene data: ${validation.errors.join(', ')}`);
            }

            // Migrate old versions if needed
            const migratedData = this.migrateVersion(parsedData);

            // Clear current scene
            await this.clearScene();

            // Restore scene content (objects and hierarchy)
            await this.restoreSceneContent(migratedData.scene);

            // Restore camera state
            this.restoreCameraState(migratedData.camera);

            // NOTE: Don't restore configuration - visual settings are app-wide, not per-file
            // Configuration (colors, opacity, etc.) persists separately in ConfigurationManager
            // this.restoreConfiguration(migratedData.configuration);

            // Repair any broken references
            this.repairBrokenReferences();

            // Trigger UI refresh
            this.refreshUI();

            // Update statistics
            const endTime = performance.now();
            this.stats.deserializations++;
            this.stats.lastDeserializationTime = endTime - startTime;
            this.stats.objectsRestored = migratedData.scene?.objects?.length || 0;
            this.stats.migrationOccurred = migratedData.version !== parsedData.version;

            return {
                success: true,
                metadata: migratedData.metadata,
                stats: {
                    objectsRestored: this.stats.objectsRestored,
                    deserializationTime: this.stats.lastDeserializationTime
                }
            };

        } catch (error) {
            console.error('SceneDeserializer: Failed to deserialize scene:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Validate scene data structure
     * @param {Object} sceneData - Scene data to validate
     * @returns {Object} Validation result { valid: boolean, errors: string[] }
     */
    validateSceneData(sceneData) {
        const errors = [];

        if (!sceneData || typeof sceneData !== 'object') {
            errors.push('Scene data must be an object');
            return { valid: false, errors };
        }

        // Check required properties
        if (!sceneData.version) {
            errors.push('Missing version property');
        }
        if (!sceneData.metadata) {
            errors.push('Missing metadata property');
        }
        if (!sceneData.scene) {
            errors.push('Missing scene property');
        }

        // Validate scene content
        if (sceneData.scene) {
            if (!Array.isArray(sceneData.scene.objects)) {
                errors.push('scene.objects must be an array');
            }
        }

        return {
            valid: errors.length === 0,
            errors: errors
        };
    }

    /**
     * Migrate old file versions to current format
     * @param {Object} sceneData - Original scene data
     * @returns {Object} Migrated scene data
     */
    migrateVersion(sceneData) {
        const version = sceneData.version;

        // If already current version, no migration needed
        if (version === '1.0.0') {
            return sceneData;
        }

        console.warn(`SceneDeserializer: Migrating from version ${version} to 1.0.0`);

        // Future: Add version migration logic here
        // For now, we only support 1.0.0

        return sceneData;
    }

    /**
     * Clear current scene
     * @returns {Promise<void>}
     */
    async clearScene() {
        // Initialize components if not already done
        this.initializeComponents();

        if (!this.sceneController) {
            throw new Error('SceneController not available');
        }

        // Get all object IDs (excluding system objects like floor grid)
        const allObjects = this.sceneController.getAllObjects();
        const objectIds = allObjects
            .filter(obj => obj.category !== 'system') // Keep system objects like floor grid
            .map(obj => obj.id);

        // Delete all objects in reverse order (children before parents)
        for (let i = objectIds.length - 1; i >= 0; i--) {
            const id = objectIds[i];
            try {
                this.sceneController.removeObject(id);
            } catch (error) {
                console.warn(`Failed to delete object ${id} during scene clear:`, error);
            }
        }

        // Reset scene counters
        this.sceneController.nextId = 1;
        this.sceneController.nextBoxNumber = 1;
        this.sceneController.nextContainerNumber = 1;
        this.sceneController.rootChildrenOrder = [];

        // Clear ObjectStateManager if available
        if (this.objectStateManager && this.objectStateManager.objects) {
            this.objectStateManager.objects.clear();
            this.objectStateManager.selection.clear();
        }
    }

    /**
     * Restore scene content from serialized data
     * @param {Object} sceneContent - Scene content data
     * @returns {Promise<void>}
     */
    async restoreSceneContent(sceneContent) {
        if (!sceneContent || !sceneContent.objects) {
            return;
        }

        // Restore scene counters
        if (sceneContent.nextId) {
            this.sceneController.nextId = sceneContent.nextId;
        }
        if (sceneContent.nextBoxNumber) {
            this.sceneController.nextBoxNumber = sceneContent.nextBoxNumber;
        }
        if (sceneContent.nextContainerNumber) {
            this.sceneController.nextContainerNumber = sceneContent.nextContainerNumber;
        }

        // Build dependency graph (parents before children)
        const objects = sceneContent.objects;
        const objectMap = new Map(objects.map(obj => [obj.id, obj]));
        const sortedObjects = this.topologicalSort(objects, objectMap);

        // Restore objects in dependency order
        for (const objData of sortedObjects) {
            await this.restoreObject(objData);
        }

        // CRITICAL: Establish THREE.js hierarchy after all objects are created
        // setParentContainer() must be called AFTER both parent and child exist
        for (const objData of sortedObjects) {
            if (objData.parentContainer) {
                // Don't update layout yet - we'll do that after all hierarchies are established
                this.sceneController.setParentContainer(objData.id, objData.parentContainer, false);
            }
        }

        // Now update layouts for all containers with children
        const containers = sortedObjects.filter(obj => obj.isContainer && obj.childrenOrder && obj.childrenOrder.length > 0);
        for (const container of containers) {
            if (container.autoLayout?.enabled) {
                this.sceneController.updateLayout(container.id);
            }
        }

        // Restore root children order
        if (sceneContent.rootChildrenOrder) {
            this.sceneController.rootChildrenOrder = [...sceneContent.rootChildrenOrder];
        }
    }

    /**
     * Topological sort objects (parents before children)
     * @param {Array} objects - Array of object data
     * @param {Map} objectMap - Map of id -> object
     * @returns {Array} Sorted array of objects
     */
    topologicalSort(objects, objectMap) {
        const sorted = [];
        const visited = new Set();
        const visiting = new Set();

        const visit = (obj) => {
            if (visited.has(obj.id)) return;
            if (visiting.has(obj.id)) {
                console.warn('Circular dependency detected for object:', obj.id);
                return;
            }

            visiting.add(obj.id);

            // Visit parent first
            if (obj.parentContainer && objectMap.has(obj.parentContainer)) {
                visit(objectMap.get(obj.parentContainer));
            }

            visiting.delete(obj.id);
            visited.add(obj.id);
            sorted.push(obj);
        };

        objects.forEach(obj => visit(obj));

        return sorted;
    }

    /**
     * Restore single object
     * @param {Object} objData - Object data to restore
     * @returns {Promise<void>}
     */
    async restoreObject(objData) {
        try {
            // Create geometry based on type
            let geometry;
            if (objData.isContainer) {
                geometry = this.geometryFactory
                    ? this.geometryFactory.createBoxGeometry(
                        objData.dimensions.x,
                        objData.dimensions.y,
                        objData.dimensions.z
                    )
                    : new THREE.BoxGeometry(
                        objData.dimensions.x,
                        objData.dimensions.y,
                        objData.dimensions.z
                    );
            } else if (objData.type === 'box') {
                geometry = this.geometryFactory
                    ? this.geometryFactory.createBoxGeometry(
                        objData.dimensions.x,
                        objData.dimensions.y,
                        objData.dimensions.z
                    )
                    : new THREE.BoxGeometry(
                        objData.dimensions.x,
                        objData.dimensions.y,
                        objData.dimensions.z
                    );
            } else {
                // Default to box for unknown types
                geometry = this.geometryFactory
                    ? this.geometryFactory.createBoxGeometry(1, 1, 1)
                    : new THREE.BoxGeometry(1, 1, 1);
            }

            // Create material using MaterialManager
            const material = this.materialManager
                ? this.materialManager.createMeshLambertMaterial({
                    color: objData.material?.color || '#808080',
                    opacity: objData.material?.opacity ?? 1.0,
                    transparent: objData.material?.transparent ?? false
                })
                : new THREE.MeshLambertMaterial({
                    color: objData.material?.color || '#808080',
                    opacity: objData.material?.opacity ?? 1.0,
                    transparent: objData.material?.transparent ?? false
                });

            // Add to scene using SceneController (position and rotation set via options)
            const createdObject = this.sceneController.addObject(geometry, material, {
                name: objData.name,
                type: objData.type || 'box',
                id: objData.id,
                isContainer: objData.isContainer || false,
                parentContainer: objData.parentContainer || null,
                position: {
                    x: objData.position.x,
                    y: objData.position.y,
                    z: objData.position.z
                },
                rotation: {
                    x: objData.rotation.x,
                    y: objData.rotation.y,
                    z: objData.rotation.z,
                    order: 'XYZ' // THREE.js default rotation order
                }
            });

            // Restore container properties
            if (objData.isContainer && createdObject) {
                createdObject.isHug = objData.isHug || false;
                createdObject.layoutMode = objData.layoutMode || null;
                createdObject.autoLayout = objData.autoLayout || {
                    enabled: false,
                    direction: null,
                    gap: 0,
                    padding: { top: 0, bottom: 0, left: 0, right: 0, front: 0, back: 0 }
                };
                createdObject.childrenOrder = objData.childrenOrder || [];
            }

            // Restore other properties
            if (createdObject) {
                createdObject.visible = objData.visible ?? true;
                createdObject.locked = objData.locked || false;
            }

        } catch (error) {
            console.error('Failed to restore object:', objData.id, error);
        }
    }

    /**
     * Restore camera state
     * @param {Object} cameraData - Camera state data
     */
    restoreCameraState(cameraData) {
        if (!cameraData || !this.cameraController || !this.cameraController.camera) {
            return;
        }

        const camera = this.cameraController.camera;

        // Restore position
        if (cameraData.position) {
            camera.position.set(
                cameraData.position.x,
                cameraData.position.y,
                cameraData.position.z
            );
        }

        // Restore rotation
        if (cameraData.rotation) {
            // Ensure rotation order is set (THREE.js default is XYZ)
            camera.rotation.order = 'XYZ';
            camera.rotation.set(
                cameraData.rotation.x,
                cameraData.rotation.y,
                cameraData.rotation.z
            );
        }

        // Restore orbit target
        if (cameraData.orbitTarget && this.cameraController.orbitTarget) {
            this.cameraController.orbitTarget.set(
                cameraData.orbitTarget.x,
                cameraData.orbitTarget.y,
                cameraData.orbitTarget.z
            );
        }

        // Update camera controller's internal state
        if (this.cameraController.updateSphericalFromCamera) {
            this.cameraController.updateSphericalFromCamera();
        }
    }

    /**
     * Flatten nested configuration object into dot-notation paths
     * @param {Object} obj - Nested configuration object
     * @param {string} prefix - Current path prefix
     * @returns {Object} Flattened object with dot-notation keys
     */
    flattenConfiguration(obj, prefix = '') {
        const flattened = {};

        for (const [key, value] of Object.entries(obj)) {
            const path = prefix ? `${prefix}.${key}` : key;

            if (value && typeof value === 'object' && !Array.isArray(value)) {
                // Recursively flatten nested objects
                Object.assign(flattened, this.flattenConfiguration(value, path));
            } else {
                // Leaf value - use the full path
                flattened[path] = value;
            }
        }

        return flattened;
    }

    /**
     * Restore configuration settings
     * @param {Object} configData - Configuration data
     */
    restoreConfiguration(configData) {
        if (!configData || !this.configurationManager) {
            return;
        }

        // Flatten nested configuration into dot-notation paths
        const flattenedConfig = this.flattenConfiguration(configData);

        // Apply each configuration setting
        Object.entries(flattenedConfig).forEach(([path, value]) => {
            // Skip null/undefined values - they're not valid configuration values
            if (value === null || value === undefined) {
                return;
            }

            try {
                if (this.configurationManager.set) {
                    this.configurationManager.set(path, value);
                }
            } catch (error) {
                console.warn(`Failed to restore configuration ${path}:`, error);
            }
        });
    }

    /**
     * Repair broken references (orphaned objects, missing parents, etc.)
     */
    repairBrokenReferences() {
        const allObjects = this.sceneController.getAllObjects();

        allObjects.forEach(obj => {
            // Check if parent container exists
            if (obj.parentContainer) {
                const parent = this.sceneController.getObject(obj.parentContainer);
                if (!parent) {
                    console.warn(`Object ${obj.id} references non-existent parent ${obj.parentContainer}, removing reference`);
                    obj.parentContainer = null;
                }
            }

            // Check if children exist (for containers)
            if (obj.isContainer && obj.childrenOrder) {
                const validChildren = obj.childrenOrder.filter(childId => {
                    const child = this.sceneController.getObject(childId);
                    return child !== null;
                });

                if (validChildren.length !== obj.childrenOrder.length) {
                    console.warn(`Container ${obj.id} had ${obj.childrenOrder.length - validChildren.length} invalid children, cleaned up`);
                    obj.childrenOrder = validChildren;
                }
            }
        });
    }

    /**
     * Trigger UI refresh after scene load
     */
    refreshUI() {
        // Use PropertyPanelSync to refresh UI (proper architectural pattern)
        const propertyPanelSync = window.modlerComponents?.propertyPanelSync;
        if (propertyPanelSync && propertyPanelSync.refreshCompleteHierarchy) {
            propertyPanelSync.refreshCompleteHierarchy();
        }

        // Clear selection
        const selectionController = window.modlerComponents?.selectionController;
        if (selectionController && selectionController.clearSelection) {
            selectionController.clearSelection();
        }
    }

    /**
     * Deserialize version 1.0.0 format (current version handler)
     * @param {Object} sceneData - Scene data
     * @returns {Object} Deserialized data
     */
    deserializeV1_0_0(sceneData) {
        // No migration needed, current version
        return sceneData;
    }

    /**
     * Get deserialization statistics
     * @returns {Object} Statistics object
     */
    getStats() {
        return { ...this.stats };
    }

    /**
     * Reset statistics
     */
    resetStats() {
        this.stats = {
            deserializations: 0,
            lastDeserializationTime: 0,
            objectsRestored: 0,
            migrationOccurred: false
        };
    }
}

// Make globally available
if (typeof window !== 'undefined') {
    window.SceneDeserializer = SceneDeserializer;
}
