import * as THREE from 'three';

/**
 * YardCommandHandler - Handles all Yard (Material Library) commands
 *
 * Extracted from CommandRouter to reduce its size.
 * Manages yard CRUD operations, material placement, and materials list broadcasting.
 */

class YardCommandHandler {
    constructor(commandRouter) {
        this.commandRouter = commandRouter;

        // Subscribe to lifecycle events to update materials list on create/delete/undo
        if (window.objectEventBus) {
            window.objectEventBus.subscribe(
                window.objectEventBus.EVENT_TYPES.LIFECYCLE,
                () => { this._broadcastMaterialsList(); }
            );
        }
    }

    get sceneController() {
        return this.commandRouter.sceneController;
    }

    get objectStateManager() {
        return this.commandRouter.objectStateManager;
    }

    get historyManager() {
        return this.commandRouter.historyManager;
    }

    handleYardGetLibrary(data) {
        const yardManager = window.modlerComponents?.yardManager;
        if (!yardManager) return;

        const libraryData = yardManager.getLibraryData();

        // Send response to the requesting iframe
        if (data.sourceWindow) {
            try {
                data.sourceWindow.postMessage({
                    type: 'yard-library-response',
                    data: libraryData
                }, '*');
            } catch (e) { /* sourceWindow may be closed */ }
        } else if (window.simpleCommunication) {
            window.simpleCommunication.sendToAllIframes({
                type: 'yard-library-response',
                data: libraryData
            });
        }
    }

    handleYardAddItem(data) {
        const yardManager = window.modlerComponents?.yardManager;
        if (!yardManager) return;

        const itemData = data.data?.item || data.item;
        if (!itemData) return;

        yardManager.addItem(itemData);
        this._broadcastYardUpdate();
    }

    handleYardUpdateItem(data) {
        const yardManager = window.modlerComponents?.yardManager;
        if (!yardManager) return;

        const itemId = data.data?.itemId || data.itemId;
        const updates = data.data?.updates || data.updates;
        if (!itemId || !updates) return;

        yardManager.updateItem(itemId, updates);
        this._broadcastYardUpdate();
    }

    handleYardRemoveItem(data) {
        const yardManager = window.modlerComponents?.yardManager;
        if (!yardManager) return;

        const itemId = data.data?.itemId || data.itemId;
        if (!itemId) return;

        yardManager.removeItem(itemId);
        this._broadcastYardUpdate();
    }

    handleYardPlaceItem(data) {
        const yardManager = window.modlerComponents?.yardManager;
        if (!yardManager || !this.sceneController || !this.historyManager) return;

        const itemId = data.data?.itemId || data.itemId;
        if (!itemId) return;

        const item = yardManager.getItem(itemId);
        if (!item) return;

        const dim = item.dimensions;
        const geometry = new THREE.BoxGeometry(dim.x, dim.y, dim.z);

        const colorHex = item.material?.color || '#888888';
        const color = parseInt(colorHex.replace('#', ''), 16);
        const material = new THREE.MeshLambertMaterial({
            color,
            opacity: item.material?.opacity ?? 1,
            transparent: item.material?.transparent ?? false
        });

        const command = new CreateObjectCommand(geometry, material, {
            name: item.name,
            type: 'box',
            position: { x: 0, y: dim.y / 2, z: 0 },
            dimensions: { x: dim.x, y: dim.y, z: dim.z },
            yardItemId: item.id,
            yardFixed: item.fixedDimensions
        });

        this.historyManager.executeCommand(command);
    }

    handleYardGetMaterialsList(data) {
        const materialsList = this._computeMaterialsList();
        if (data.sourceWindow) {
            try {
                data.sourceWindow.postMessage({
                    type: 'yard-materials-list',
                    data: materialsList
                }, '*');
            } catch (e) { /* sourceWindow may be closed */ }
        } else if (window.simpleCommunication) {
            window.simpleCommunication.sendToAllIframes({
                type: 'yard-materials-list',
                data: materialsList
            });
        }
    }

    handleYardToggleDimensionLock(data) {
        if (!this.objectStateManager) return;

        const objectId = data.objectId;
        const axis = data.axis;
        if (!objectId || !axis) return;

        const object = this.objectStateManager.getObject(objectId);
        if (!object) return;

        // Toggle the yardFixed flag for this axis
        const currentFixed = object.yardFixed || { x: false, y: false, z: false };
        const newFixed = { ...currentFixed, [axis]: !currentFixed[axis] };

        // Update through ObjectStateManager (single source of truth)
        this.objectStateManager.updateObject(objectId, { yardFixed: newFixed });
    }

    _broadcastYardUpdate() {
        const yardManager = window.modlerComponents?.yardManager;
        if (!yardManager || !window.simpleCommunication) return;

        window.simpleCommunication.sendToAllIframes({
            type: 'yard-library-updated',
            data: yardManager.getLibraryData()
        });
    }

    _computeMaterialsList() {
        const yardManager = window.modlerComponents?.yardManager;
        if (!this.sceneController || !yardManager) return [];

        const counts = new Map();
        for (const [id, objectData] of this.sceneController.objects) {
            if (objectData.yardItemId) {
                counts.set(objectData.yardItemId, (counts.get(objectData.yardItemId) || 0) + 1);
            }
        }

        const materialsList = [];
        for (const [yardItemId, count] of counts) {
            const item = yardManager.getItem(yardItemId);
            if (item) {
                materialsList.push({
                    yardItemId,
                    name: item.name,
                    category: item.category,
                    subcategory: item.subcategory,
                    count,
                    dimensions: item.dimensions
                });
            }
        }
        return materialsList;
    }

    _broadcastMaterialsList() {
        if (!window.simpleCommunication) return;
        const materialsList = this._computeMaterialsList();
        window.simpleCommunication.sendToAllIframes({
            type: 'yard-materials-list',
            data: materialsList
        });
    }
}

window.YardCommandHandler = YardCommandHandler;
