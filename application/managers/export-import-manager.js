/**
 * ExportImportManager - File Download/Upload for Scenes and Objects
 *
 * Enables sharing scenes and objects via file download/upload.
 * Uses existing SceneSerializer/SceneDeserializer for scene-level operations.
 * Uses DataExtractor.extractSubtreeData for object-level operations.
 *
 * File extensions:
 * - .modler  — complete scene file
 * - .modler-object — single object or subtree
 */

class ExportImportManager {
    constructor() {
        this.FILE_EXTENSION_SCENE = '.modler';
        this.FILE_EXTENSION_OBJECT = '.modler-object';
    }

    // ====== SCENE EXPORT/IMPORT ======

    /**
     * Export current scene as a downloadable .modler file
     * @param {Object} [options] - Export options
     * @param {string} [options.fileName] - Custom file name (without extension)
     */
    exportScene(options = {}) {
        const fileManager = window.modlerComponents?.fileManager;
        if (!fileManager?.serializer) {
            console.error('ExportImportManager: FileManager/Serializer not available');
            return;
        }

        const sceneData = fileManager.serializer.serializeScene({
            fileName: fileManager.currentFileName || 'Untitled',
            createdTimestamp: fileManager.createdTimestamp
        });

        const fileName = (options.fileName || fileManager.currentFileName || 'Untitled')
            .replace(/[^a-zA-Z0-9_\- ]/g, '_');

        this._downloadJSON(sceneData, `${fileName}${this.FILE_EXTENSION_SCENE}`);
    }

    /**
     * Import a scene from an uploaded .modler file
     * Creates a new scene in storage (does not overwrite current scene).
     * @returns {Promise<Object>} Result { success: boolean, fileId?: string, error?: string }
     */
    async importScene() {
        try {
            const file = await this._pickFile(this.FILE_EXTENSION_SCENE, '.json');
            if (!file) return { success: false, error: 'No file selected' };

            const text = await file.text();
            let sceneData;
            try {
                sceneData = JSON.parse(text);
            } catch (e) {
                return { success: false, error: 'Invalid JSON format' };
            }

            // Validate basic structure
            if (!sceneData.version || !sceneData.scene || !sceneData.metadata) {
                return { success: false, error: 'Invalid scene file: missing required fields' };
            }

            const fileManager = window.modlerComponents?.fileManager;
            if (!fileManager) {
                return { success: false, error: 'FileManager not available' };
            }

            // Generate new UUIDs for all objects to avoid any collision with existing scenes
            this._remapSceneIds(sceneData);

            // Create new file ID and save to storage
            const fileId = fileManager.generateFileId();
            const importedName = sceneData.metadata.name
                ? `${sceneData.metadata.name} (imported)`
                : `Imported Scene`;

            sceneData.metadata.name = importedName;
            sceneData.metadata.modified = Date.now();

            await fileManager.storage.set(fileId, sceneData);

            return { success: true, fileId, name: importedName };
        } catch (error) {
            console.error('ExportImportManager: Import failed:', error);
            return { success: false, error: error.message };
        }
    }

    // ====== OBJECT EXPORT/IMPORT ======

    /**
     * Export a single object (and its descendants) as a downloadable file
     * @param {string} objectId - ID of the object to export
     */
    exportObject(objectId) {
        const sceneController = window.modlerComponents?.sceneController;
        if (!sceneController) {
            console.error('ExportImportManager: SceneController not available');
            return;
        }

        const subtreeData = window.DataExtractor.extractSubtreeData(sceneController, objectId);
        if (!subtreeData) {
            console.error('ExportImportManager: Failed to extract subtree for object', objectId);
            return;
        }

        const obj = sceneController.getObject(objectId);
        const name = (obj?.name || 'Object').replace(/[^a-zA-Z0-9_\- ]/g, '_');

        this._downloadJSON(subtreeData, `${name}${this.FILE_EXTENSION_OBJECT}`);
    }

    /**
     * Import an object subtree from an uploaded file into the current scene
     * All objects get new UUIDs to guarantee uniqueness.
     * @returns {Promise<Object>} Result { success: boolean, rootId?: string, error?: string }
     */
    async importObject() {
        try {
            const file = await this._pickFile(this.FILE_EXTENSION_OBJECT, '.json');
            if (!file) return { success: false, error: 'No file selected' };

            const text = await file.text();
            let subtreeData;
            try {
                subtreeData = JSON.parse(text);
            } catch (e) {
                return { success: false, error: 'Invalid JSON format' };
            }

            if (!subtreeData.root) {
                return { success: false, error: 'Invalid object file: missing root object' };
            }

            const sceneController = window.modlerComponents?.sceneController;
            if (!sceneController) {
                return { success: false, error: 'SceneController not available' };
            }

            // Remap all IDs in the subtree to new UUIDs
            const allObjects = [subtreeData.root, ...(subtreeData.children || [])];
            const idMap = new Map();
            for (const obj of allObjects) {
                idMap.set(String(obj.id), crypto.randomUUID());
            }
            window.ObjectDataFormat.remapObjectIds(allObjects, idMap);

            // Phase 1: Create all objects WITHOUT hierarchy (children at origin)
            for (const obj of allObjects) {
                this._addObjectToScene(sceneController, obj);
            }

            // Phase 2: Establish hierarchy and restore positions for children
            for (const obj of allObjects) {
                if (obj.parentContainer) {
                    sceneController.setParentContainer(obj.id, obj.parentContainer, false, { skipCoordinateConversion: true });

                    // Restore saved local position for non-layout children
                    const parentObj = sceneController.getObject(obj.parentContainer);
                    const childObj = sceneController.getObject(obj.id);
                    if (parentObj?.containerMode !== 'layout' && childObj?.mesh && obj.position) {
                        childObj.mesh.position.set(obj.position.x ?? 0, obj.position.y ?? 0, obj.position.z ?? 0);
                    }
                }
            }

            // Phase 3: Update layout containers
            for (const obj of allObjects) {
                if (obj.isContainer && obj.containerMode === 'layout' && obj.childrenOrder?.length > 0) {
                    sceneController.updateContainer(obj.id);
                }
            }

            return { success: true, rootId: subtreeData.root.id };
        } catch (error) {
            console.error('ExportImportManager: Object import failed:', error);
            return { success: false, error: error.message };
        }
    }

    // ====== PRIVATE HELPERS ======

    /**
     * Remap all object IDs in a scene to new UUIDs
     * @param {Object} sceneData - Scene data to remap
     * @private
     */
    _remapSceneIds(sceneData) {
        const objects = sceneData.scene?.objects;
        if (!objects || !Array.isArray(objects)) return;

        const idMap = new Map();
        for (const obj of objects) {
            idMap.set(String(obj.id), crypto.randomUUID());
        }

        // Use shared utility for object-level remapping
        window.ObjectDataFormat.remapObjectIds(objects, idMap);

        // Also remap the scene-level root order
        if (Array.isArray(sceneData.scene.rootChildrenOrder)) {
            sceneData.scene.rootChildrenOrder = sceneData.scene.rootChildrenOrder.map(
                id => idMap.get(String(id)) || id
            );
        }
    }

    /**
     * Add a serialized object to the current scene
     * @param {Object} sceneController - SceneController instance
     * @param {Object} objData - Serialized object data
     * @private
     */
    /**
     * Create an object in the scene from serialized data (Phase 1 only — no hierarchy).
     * Hierarchy is established separately in Phase 2 to avoid double position conversion.
     * Follows the same pattern as SceneDeserializer.restoreObject().
     */
    _addObjectToScene(sceneController, objData) {
        const THREE = window.THREE;
        if (!THREE) return;

        const geometryFactory = window.modlerComponents?.geometryFactory;
        const materialManager = window.modlerComponents?.materialManager;

        // Create geometry
        const dims = objData.dimensions || { x: 1, y: 1, z: 1 };
        const geometry = geometryFactory
            ? geometryFactory.createBoxGeometry(dims.x, dims.y, dims.z)
            : new THREE.BoxGeometry(dims.x, dims.y, dims.z);

        // Create material (containers use invisible raycast material)
        let material;
        if (objData.isContainer) {
            material = materialManager
                ? materialManager.createInvisibleRaycastMaterial({ wireframe: false })
                : new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, colorWrite: false, depthWrite: false });
        } else {
            material = materialManager
                ? materialManager.createMeshLambertMaterial({
                    color: objData.material?.color || '#808080',
                    opacity: objData.material?.opacity ?? 1.0,
                    transparent: objData.material?.transparent ?? false
                })
                : new THREE.MeshLambertMaterial({
                    color: objData.material?.color || '#808080',
                    opacity: objData.material?.opacity ?? 1.0,
                    transparent: objData.material?.transparent ?? false
                });
        }

        // Create at origin for children (position restored after hierarchy in Phase 2)
        const createdObject = sceneController.addObject(geometry, material, {
            id: objData.id,
            name: objData.name,
            type: objData.type || 'box',
            isContainer: objData.isContainer || false,
            selectable: !(objData.isContainer || false),
            // parentContainer deliberately omitted — established in Phase 2
            position: objData.parentContainer ? { x: 0, y: 0, z: 0 } : (objData.position || { x: 0, y: 0, z: 0 }),
            rotation: objData.rotation || { x: 0, y: 0, z: 0 },
            autoLayout: objData.autoLayout,
            containerMode: objData.containerMode,
            childrenOrder: objData.childrenOrder,
            layoutProperties: objData.layoutProperties
        });

        // Restore additional state that addObject() doesn't handle
        if (createdObject) {
            createdObject.visible = objData.visible ?? true;
            createdObject.locked = objData.locked || false;
            if (objData.layoutProperties) {
                createdObject.layoutProperties = objData.layoutProperties;
            }
            if (objData.yardItemId) createdObject.yardItemId = objData.yardItemId;
            if (objData.yardFixed) createdObject.yardFixed = objData.yardFixed;
        }
    }

    /**
     * Trigger browser file download
     * @param {Object} data - Data to serialize as JSON
     * @param {string} fileName - File name with extension
     * @private
     */
    _downloadJSON(data, fileName) {
        const json = JSON.stringify(data, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();

        // Cleanup
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 100);
    }

    /**
     * Open browser file picker
     * @param {...string} extensions - Accepted file extensions (e.g., '.modler', '.json')
     * @returns {Promise<File|null>} Selected file or null
     * @private
     */
    _pickFile(...extensions) {
        return new Promise((resolve) => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = extensions.join(',');
            input.style.display = 'none';

            input.addEventListener('change', () => {
                resolve(input.files[0] || null);
                document.body.removeChild(input);
            });

            // Handle cancel
            input.addEventListener('cancel', () => {
                resolve(null);
                document.body.removeChild(input);
            });

            document.body.appendChild(input);
            input.click();
        });
    }
}

// Make globally available
if (typeof window !== 'undefined') {
    window.ExportImportManager = ExportImportManager;
}
