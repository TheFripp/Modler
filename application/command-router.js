import * as THREE from 'three';

/**
 * CommandRouter - Central Action Router
 *
 * Single entry point for ALL user actions regardless of source.
 * Routes commands to appropriate handlers based on action type.
 *
 * ALL actions funnel through here:
 * - UI property changes → postMessage → CommandRouter
 * - Tool interactions → CommandRouter
 * - Keyboard shortcuts → CommandRouter
 * - Object tree operations → postMessage → CommandRouter
 * - File operations → CommandRouter
 *
 * Part of: Communication Simplification (replaces Phase 3)
 * Version: 1.0.0
 * Date: 2025-10-13
 */

class CommandRouter {
    constructor() {
        this.handlers = new Map();
        this.initialized = false;

        // Statistics for debugging
        this.stats = {
            commandsExecuted: 0,
            errors: 0,
            unknownActions: 0
        };

        // Component references (initialized lazily)
        this.propertyUpdateHandler = null;
        this.selectionController = null;
        this.sceneController = null;
        this.objectStateManager = null;
        this.toolController = null;
        this.containerCrudManager = null;
        this.historyManager = null;
    }

    /**
     * Initialize components and register handlers
     */
    initialize() {
        if (this.initialized) {
            console.warn('CommandRouter: Already initialized');
            return;
        }

        // Initialize component references
        this.initializeComponents();

        // Register all action handlers
        this.registerHandlers();

        this.initialized = true;
        console.log('✅ CommandRouter initialized');
    }

    /**
     * Initialize component references
     */
    initializeComponents() {
        const components = window.modlerComponents;

        if (!components) {
            // Listen for modlerV2Ready event to re-initialize components
            window.addEventListener('modlerV2Ready', () => {
                this.initializeComponents();
            }, { once: true });

            return;
        }

        this.propertyUpdateHandler = components.propertyUpdateHandler;
        this.selectionController = components.selectionController;
        this.sceneController = components.sceneController;
        this.objectStateManager = components.objectStateManager;
        this.toolController = components.toolController;
        this.containerCrudManager = components.containerCrudManager;
        this.historyManager = components.historyManager;
    }

    /**
     * Register all action handlers
     */
    registerHandlers() {
        // ═══════════════════════════════════════════════════════════
        // PROPERTY UPDATES
        // ═══════════════════════════════════════════════════════════
        this.handlers.set('update-property', this.handlePropertyUpdate.bind(this));
        this.handlers.set('property-update', this.handlePropertyUpdate.bind(this)); // Alias

        // Property shortcut handlers — all delegate to handlePropertyUpdate
        const propertyShortcuts = {
            'update-dimension': (d) => `dimensions.${d.axis}`,
            'update-position': (d) => `position.${d.axis}`,
            'update-rotation': (d) => `rotation.${d.axis}`,
            'update-color': () => 'material.color',
            'update-opacity': () => 'material.opacity',
            'rename-object': () => 'name',
        };
        for (const [action, getProperty] of Object.entries(propertyShortcuts)) {
            this.handlers.set(action, (data) => {
                this.handlePropertyUpdate({
                    objectId: data.objectId,
                    property: getProperty(data),
                    value: data.value ?? data.name,
                    source: data.source
                });
            });
        }

        // ═══════════════════════════════════════════════════════════
        // LAYOUT OPERATIONS
        // ═══════════════════════════════════════════════════════════
        this.handlers.set('toggle-fill-mode', this.handleFillModeToggle.bind(this));
        this.handlers.set('fill-button-toggle', this.handleFillModeToggle.bind(this)); // Alias
        this.handlers.set('button-hover', this.handleButtonHover.bind(this)); // Consolidated hover handler
        this.handlers.set('fill-button-hover', this.handleButtonHover.bind(this)); // Legacy alias
        this.handlers.set('layout-button-hover', this.handleButtonHover.bind(this)); // Legacy alias

        // ═══════════════════════════════════════════════════════════
        // SELECTION OPERATIONS
        // ═══════════════════════════════════════════════════════════
        this.handlers.set('select-object', this.handleSelectObject.bind(this));
        this.handlers.set('object-select', this.handleSelectObject.bind(this)); // Alias
        this.handlers.set('deselect-all', this.handleDeselectAll.bind(this));
        this.handlers.set('multi-select', this.handleMultiSelect.bind(this));
        this.handlers.set('object-hover', this.handleObjectHover.bind(this));

        // ═══════════════════════════════════════════════════════════
        // HIERARCHY OPERATIONS
        // ═══════════════════════════════════════════════════════════
        this.handlers.set('reorder-children', this.handleReorderChildren.bind(this));
        this.handlers.set('object-reorder', this.handleReorderChildren.bind(this)); // Alias
        this.handlers.set('move-to-container', this.handleMoveToContainer.bind(this));
        this.handlers.set('move-to-root', this.handleMoveToRoot.bind(this));
        this.handlers.set('move-and-reorder', this.handleMoveAndReorder.bind(this));

        // ═══════════════════════════════════════════════════════════
        // OBJECT LIFECYCLE
        // ═══════════════════════════════════════════════════════════
        this.handlers.set('delete-object', this.handleDeleteObject.bind(this));
        this.handlers.set('object-delete', this.handleDeleteObject.bind(this)); // Alias
        this.handlers.set('duplicate-object', this.handleDuplicateObject.bind(this));

        // ═══════════════════════════════════════════════════════════
        // CONTAINER OPERATIONS
        // ═══════════════════════════════════════════════════════════
        this.handlers.set('create-container', this.handleCreateContainer.bind(this));
        this.handlers.set('create-layout-container', this.handleCreateContainer.bind(this)); // Alias
        this.handlers.set('wrap-selection-in-container', this.handleWrapSelectionInContainer.bind(this));
        this.handlers.set('create-tiled-container', this.handleCreateTiledContainer.bind(this));

        // ═══════════════════════════════════════════════════════════
        // TOOL OPERATIONS
        // ═══════════════════════════════════════════════════════════
        this.handlers.set('activate-tool', this.handleActivateTool.bind(this));
        this.handlers.set('tool-activate', this.handleActivateTool.bind(this)); // Alias
        this.handlers.set('tool-activation', this.handleActivateTool.bind(this)); // Alias (toolbar sends this)
        this.handlers.set('snap-toggle', this.handleSnapToggle.bind(this));

        // ═══════════════════════════════════════════════════════════
        // HISTORY OPERATIONS
        // ═══════════════════════════════════════════════════════════
        this.handlers.set('undo', this.handleUndo.bind(this));
        this.handlers.set('redo', this.handleRedo.bind(this));

        // ═══════════════════════════════════════════════════════════
        // SYSTEM OPERATIONS (Panel ready, file manager, settings)
        // ═══════════════════════════════════════════════════════════
        this.handlers.set('ui-panel-ready', this.handleUIPanelReady.bind(this));
        this.handlers.set('left-panel-ready', this.handleUIPanelReady.bind(this)); // Alias

        // File manager operations — delegate to FileManagerHandler
        this.handlers.set('request-file-manager-ready', (data) => {
            const fileManagerHandler = window.modlerComponents?.fileManagerHandler;
            if (fileManagerHandler) {
                fileManagerHandler.handleRequestFileManagerReady(data.sourceWindow);
            }
        });
        this.handlers.set('file-manager-request', (data) => {
            const fileManagerHandler = window.modlerComponents?.fileManagerHandler;
            if (fileManagerHandler) {
                fileManagerHandler.handleFileRequest(data, data.sourceWindow);
            }
        });
        // Settings operations — update and get handlers follow identical patterns
        const settingsRoutes = {
            'cad-wireframe': 'CadWireframe',
            'visual': 'Visual',
            'scene': 'Scene',
            'interface': 'Interface',
            'unit': 'Unit',
        };
        for (const [prefix, methodSuffix] of Object.entries(settingsRoutes)) {
            this.handlers.set(`${prefix}-settings-changed`, (data) => {
                this.delegateSettingsUpdate(`handle${methodSuffix}SettingsUpdate`, data);
            });
            this.handlers.set(`get-${prefix}-settings`, (data) => {
                this.delegateSettingsGet(`handleGet${methodSuffix}Settings`, data);
            });
        }
        // ═══════════════════════════════════════════════════════════
        // EXPORT/IMPORT OPERATIONS
        // ═══════════════════════════════════════════════════════════
        this.handlers.set('export-scene', this.handleExportScene.bind(this));
        this.handlers.set('import-scene', this.handleImportScene.bind(this));
        this.handlers.set('export-object', this.handleExportObject.bind(this));
        this.handlers.set('import-object', this.handleImportObject.bind(this));

        // ═══════════════════════════════════════════════════════════
        // YARD OPERATIONS (Material Library)
        // ═══════════════════════════════════════════════════════════
        this.handlers.set('yard-get-library', this.handleYardGetLibrary.bind(this));
        this.handlers.set('yard-add-item', this.handleYardAddItem.bind(this));
        this.handlers.set('yard-update-item', this.handleYardUpdateItem.bind(this));
        this.handlers.set('yard-remove-item', this.handleYardRemoveItem.bind(this));
        this.handlers.set('yard-place-item', this.handleYardPlaceItem.bind(this));
        this.handlers.set('yard-get-materials-list', this.handleYardGetMaterialsList.bind(this));

        console.log(`✅ CommandRouter: Registered ${this.handlers.size} action handlers`);

        // Subscribe to lifecycle events to update materials list on create/delete/undo
        if (window.objectEventBus) {
            window.objectEventBus.subscribe(
                window.objectEventBus.EVENT_TYPES.LIFECYCLE,
                () => { this._broadcastMaterialsList(); }
            );
        }
    }

    /**
     * Execute a command
     * @param {Object} command - Command object with action and data
     * @returns {boolean} Success status
     */
    execute(command) {
        try {
            if (!this.initialized) {
                this.initialize();
            }

            const { action, ...data } = command;

            if (!action) {
                console.error('CommandRouter: No action specified', command);
                this.stats.errors++;
                return false;
            }

            const handler = this.handlers.get(action);

            if (!handler) {
                console.warn(`CommandRouter: No handler for action "${action}"`, command);
                this.stats.unknownActions++;

                if (command.requestId && command.sourceWindow) {
                    try {
                        command.sourceWindow.postMessage({
                            type: 'command-response',
                            requestId: command.requestId,
                            success: false,
                            error: `Unknown action: ${action}`
                        }, '*');
                    } catch (e) { /* sourceWindow may be closed */ }
                }

                return false;
            }

            // Execute handler
            handler(data);
            this.stats.commandsExecuted++;

            // Send success response if requestId provided (opt-in correlation)
            if (command.requestId && command.sourceWindow) {
                try {
                    command.sourceWindow.postMessage({
                        type: 'command-response',
                        requestId: command.requestId,
                        success: true
                    }, '*');
                } catch (e) { /* sourceWindow may be closed */ }
            }

            return true;

        } catch (error) {
            console.error('CommandRouter: Command execution failed', error, command);
            this.stats.errors++;

            // Send error response if requestId provided
            if (command.requestId && command.sourceWindow) {
                try {
                    command.sourceWindow.postMessage({
                        type: 'command-response',
                        requestId: command.requestId,
                        success: false,
                        error: error.message || 'Command execution failed'
                    }, '*');
                } catch (e) { /* sourceWindow may be closed */ }
            }

            return false;
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // HANDLER IMPLEMENTATIONS
    // All handlers delegate to existing systems
    // ═══════════════════════════════════════════════════════════════

    handlePropertyUpdate(data) {
        const { objectId, property, value, source } = data;

        if (!this.propertyUpdateHandler) {
            console.error('CommandRouter: PropertyUpdateHandler not available');
            return;
        }

        // Skip command wrapping during undo/redo (commands replay through ObjectStateManager directly)
        if (this.historyManager?.isUndoing || this.historyManager?.isRedoing) {
            this._forwardPropertyUpdate(data);
            return;
        }

        // containerMode/sizingMode already has its own command in handleContainerSizingChange — skip
        if (property === 'containerMode' || property === 'sizingMode') {
            this._forwardPropertyUpdate(data);
            return;
        }

        // autoLayout properties are handled separately (layout undo + tile repeat undo)
        if (property === 'autoLayout' || property.startsWith('autoLayout.')) {
            this._handleAutoLayoutPropertyUpdate(data);
            return;
        }

        // Capture before-snapshot
        const beforeSnapshot = this._capturePropertySnapshot(objectId, property);
        if (!beforeSnapshot) {
            this._forwardPropertyUpdate(data);
            return;
        }

        // Perform the update
        this._forwardPropertyUpdate(data);

        // Capture after-snapshot
        const afterSnapshot = this._capturePropertySnapshot(objectId, property);

        // Register undoable command if state actually changed
        if (afterSnapshot && this._snapshotsDiffer(beforeSnapshot, afterSnapshot) && this.historyManager) {
            const command = new UpdatePropertySnapshotCommand(objectId, beforeSnapshot, afterSnapshot, `Update ${property}`);
            this.historyManager.executeCommand(command);
        }
    }

    /**
     * Forward a property update to PropertyUpdateHandler (no command wrapping)
     */
    _forwardPropertyUpdate(data) {
        const { objectId, property, value, source } = data;
        this.propertyUpdateHandler.handlePropertyUpdate({
            objectId, property, value,
            source: source || 'command-router'
        });
    }

    /**
     * Capture a property snapshot from the current object state.
     * Reads from mesh.position (live) rather than obj.position (can be stale).
     * Scope depends on which property is being changed.
     */
    _capturePropertySnapshot(objectId, property) {
        const obj = this.sceneController?.getObject(objectId);
        if (!obj) return null;

        const snapshot = {};

        if (property.startsWith('dimensions.') || property === 'dimensions') {
            // Dimension changes can also affect position (push-tool integration) and layoutProperties (fill mode)
            snapshot.dimensions = obj.dimensions ? { ...obj.dimensions } : null;
            snapshot.position = obj.mesh
                ? { x: obj.mesh.position.x, y: obj.mesh.position.y, z: obj.mesh.position.z }
                : (obj.position ? { ...obj.position } : null);
            if (obj.layoutProperties) {
                snapshot.layoutProperties = JSON.parse(JSON.stringify(obj.layoutProperties));
            }
        } else if (property.startsWith('position.') || property === 'position') {
            snapshot.position = obj.mesh
                ? { x: obj.mesh.position.x, y: obj.mesh.position.y, z: obj.mesh.position.z }
                : (obj.position ? { ...obj.position } : null);
        } else if (property.startsWith('rotation.') || property === 'rotation') {
            snapshot.rotation = obj.rotation ? { ...obj.rotation } : null;
        } else if (property.startsWith('material.') || property === 'material') {
            snapshot.material = obj.material ? { ...obj.material } : null;
        } else if (property === 'name') {
            snapshot.name = obj.name;
        } else {
            // Fallback: capture the top-level property
            const topProp = property.split('.')[0];
            const val = obj[topProp];
            snapshot[topProp] = (val && typeof val === 'object') ? JSON.parse(JSON.stringify(val)) : val;
        }

        return snapshot;
    }

    /**
     * Compare two snapshots to detect if state actually changed
     */
    _snapshotsDiffer(before, after) {
        return JSON.stringify(before) !== JSON.stringify(after);
    }

    /**
     * Handle autoLayout property updates with undo support (Phase 3 + Phase 5)
     * Separates tile repeat changes from general layout property changes.
     */
    _handleAutoLayoutPropertyUpdate(data) {
        const { objectId, property, value, source } = data;

        // Detect tile repeat changes — needs specialized command for child add/remove
        if (property === 'autoLayout.tileMode.repeat') {
            this._handleTileRepeatUpdate(objectId, property, value, source);
            return;
        }

        // General layout property change — wrap with UpdateLayoutPropertyCommand
        const container = this.sceneController?.getObject(objectId);
        if (!container) {
            this._forwardPropertyUpdate(data);
            return;
        }

        // Capture before-state
        const oldAutoLayout = container.autoLayout ? JSON.parse(JSON.stringify(container.autoLayout)) : null;
        const oldContainerMode = container.containerMode;
        const oldChildPositions = new Map();
        const children = this.sceneController.getChildObjects?.(objectId) || [];
        children.forEach(child => {
            if (child.mesh) {
                oldChildPositions.set(child.id, {
                    x: child.mesh.position.x,
                    y: child.mesh.position.y,
                    z: child.mesh.position.z
                });
            }
        });

        // Determine old value for the specific property
        let oldValue = null;
        if (property === 'autoLayout') {
            oldValue = oldAutoLayout;
        } else if (property.startsWith('autoLayout.')) {
            const nestedProp = property.replace('autoLayout.', '');
            oldValue = oldAutoLayout ? this._getNestedValue(oldAutoLayout, nestedProp) : null;
        }

        // Perform the update
        this._forwardPropertyUpdate(data);

        // Capture after-state
        const updatedContainer = this.sceneController.getObject(objectId);
        if (!updatedContainer) return;

        const newAutoLayout = updatedContainer.autoLayout ? JSON.parse(JSON.stringify(updatedContainer.autoLayout)) : null;
        const newContainerMode = updatedContainer.containerMode;

        // Register undoable command if state changed
        if (JSON.stringify(oldAutoLayout) !== JSON.stringify(newAutoLayout) || oldContainerMode !== newContainerMode) {
            if (this.historyManager) {
                const command = new UpdateLayoutPropertyCommand(objectId, property, value, oldValue);
                command.originalLayoutState = oldAutoLayout;
                command.newLayoutState = newAutoLayout;
                command.originalContainerMode = oldContainerMode;
                command.newContainerMode = newContainerMode;
                command.childPositionSnapshots = oldChildPositions;
                this.historyManager.executeCommand(command);
            }
        }
    }

    /**
     * Get nested value from object by dot-separated path
     */
    _getNestedValue(obj, path) {
        const parts = path.split('.');
        let current = obj;
        for (const part of parts) {
            if (current == null) return null;
            current = current[part];
        }
        return current;
    }

    /**
     * Handle tile repeat count change with undo support (Phase 5).
     * Captures child add/remove deltas so undo can reverse instance changes.
     */
    _handleTileRepeatUpdate(objectId, property, value, source) {
        const data = { objectId, property, value, source };
        const container = this.sceneController?.getObject(objectId);
        if (!container) {
            this._forwardPropertyUpdate(data);
            return;
        }

        // Capture before-state
        const oldAutoLayout = container.autoLayout ? JSON.parse(JSON.stringify(container.autoLayout)) : null;
        const oldRepeat = container.autoLayout?.tileMode?.repeat || 0;
        const sourceObjectId = container.autoLayout?.tileMode?.sourceObjectId;

        const children = this.sceneController.getChildObjects?.(objectId) || [];
        const childrenBefore = children.map(c => c.id);

        // Snapshot children that might be removed (for undo restoration)
        const childSnapshots = children.map(child => ({
            id: child.id,
            name: child.name,
            dimensions: child.dimensions ? { ...child.dimensions } : null,
            sourceObjectId
        }));

        // Perform the update (triggers TileInstanceManager via events)
        this._forwardPropertyUpdate(data);

        // Capture after-state
        const updatedContainer = this.sceneController.getObject(objectId);
        if (!updatedContainer) return;

        const newAutoLayout = updatedContainer.autoLayout ? JSON.parse(JSON.stringify(updatedContainer.autoLayout)) : null;
        const newRepeat = parseInt(value) || oldRepeat;

        // Get children after the change
        const childrenAfter = (this.sceneController.getChildObjects?.(objectId) || []).map(c => c.id);

        // Calculate deltas
        const addedChildIds = childrenAfter.filter(id => !childrenBefore.includes(id));
        const removedChildIds = childrenBefore.filter(id => !childrenAfter.includes(id));
        const removedChildSnapshots = childSnapshots.filter(s => removedChildIds.includes(s.id));

        // Register undoable command
        if (oldRepeat !== newRepeat && this.historyManager) {
            const command = new UpdateTileRepeatCommand({
                containerId: objectId,
                oldRepeat,
                newRepeat,
                addedChildIds,
                removedChildSnapshots,
                oldAutoLayout,
                newAutoLayout
            });
            this.historyManager.executeCommand(command);
        }
    }

    handleFillModeToggle(data) {
        const { objectId, axis } = data;

        if (!this.propertyUpdateHandler) {
            console.error('CommandRouter: PropertyUpdateHandler not available');
            return;
        }

        // Skip command wrapping during undo/redo
        if (this.historyManager?.isUndoing || this.historyManager?.isRedoing) {
            this.propertyUpdateHandler.handleFillButtonToggle(objectId, axis);
            return;
        }

        // Capture before-snapshot: layoutProperties + dimensions
        const obj = this.sceneController?.getObject(objectId);
        const beforeSnapshot = obj ? {
            layoutProperties: obj.layoutProperties ? JSON.parse(JSON.stringify(obj.layoutProperties)) : null,
            dimensions: obj.dimensions ? { ...obj.dimensions } : null
        } : null;

        // Perform the toggle
        this.propertyUpdateHandler.handleFillButtonToggle(objectId, axis);

        // Capture after-snapshot
        const updatedObj = this.sceneController?.getObject(objectId);
        const afterSnapshot = updatedObj ? {
            layoutProperties: updatedObj.layoutProperties ? JSON.parse(JSON.stringify(updatedObj.layoutProperties)) : null,
            dimensions: updatedObj.dimensions ? { ...updatedObj.dimensions } : null
        } : null;

        // Register undoable command
        if (beforeSnapshot && afterSnapshot && this._snapshotsDiffer(beforeSnapshot, afterSnapshot) && this.historyManager) {
            const command = new UpdatePropertySnapshotCommand(objectId, beforeSnapshot, afterSnapshot, `Toggle fill ${axis}`);
            this.historyManager.executeCommand(command);
        }
    }

    /**
     * Button hover handler - face highlighting for fill/layout/tile axis buttons
     * @param {Object} data - {objectId, axis, isHovering}
     */
    handleButtonHover(data) {
        const { objectId, axis, isHovering } = data;

        if (!objectId || !axis) {
            return;
        }

        const selectionController = window.modlerComponents?.selectionController;
        const visualEffects = window.modlerComponents?.visualEffects;
        const supportMeshFactory = window.modlerComponents?.supportMeshFactory;

        if (!selectionController || !visualEffects || !supportMeshFactory) {
            return;
        }

        // Get selected object - must be selected for highlighting
        const selectedObjects = selectionController.getSelectedObjects();
        if (selectedObjects.length === 0) {
            return;
        }

        const selectedObject = selectedObjects[0];

        // Verify object ID matches (buttons send objectId for verification)
        if (selectedObject.userData?.id !== objectId) {
            return;
        }

        // Get support meshes
        const supportMeshes = selectedObject.userData?.supportMeshes;
        if (!supportMeshes?.faceHighlight) {
            return;
        }

        if (isHovering) {
            // Enable button highlight mode to prevent tool hover from clearing
            visualEffects.setButtonHighlight(true);

            // Position face highlight for camera-facing face on axis
            supportMeshFactory.positionFaceHighlightForAxis(
                supportMeshes.faceHighlight,
                selectedObject,
                axis,
                true // camera-facing only
            );

            // Show face highlight via centralized visibility API
            if (supportMeshFactory) {
                supportMeshFactory.showFaceHighlight(selectedObject);
            }
        } else {
            // Disable button highlight mode and hide face highlight
            visualEffects.setButtonHighlight(false);
            if (supportMeshFactory) {
                supportMeshFactory.hideFaceHighlight(selectedObject);
            }
        }
    }

    handleSelectObject(data) {
        const { objectId, addToSelection, isShiftClick, directSelection } = data;

        if (!this.selectionController || !this.sceneController) {
            console.error('CommandRouter: SelectionController or SceneController not available');
            return;
        }

        // Get the mesh object from SceneController
        const obj = this.sceneController.getObject(objectId);

        if (!obj || !obj.mesh) {
            console.error('CommandRouter: Object or mesh not found for ID:', objectId);
            return;
        }

        // Support both parameter names (addToSelection and isShiftClick from schema)
        const shouldAdd = addToSelection || isShiftClick;

        if (!shouldAdd) {
            // Replace selection - clear first
            this.selectionController.clearSelection();
        }

        // Select the object (SelectionController handles visualization and events)
        // Pass directSelection flag to bypass container-first logic when selecting from UI list
        this.selectionController.select(obj.mesh, { direct: directSelection });
    }

    /**
     * Handle object hover from UI tree panel
     * @param {Object} data - {objectId, isHovering}
     */
    handleObjectHover(data) {
        const { objectId, isHovering } = data;
        if (!objectId) return;

        const visualizationManager = window.modlerComponents?.visualizationManager;
        if (!visualizationManager || !this.sceneController) return;

        const obj = this.sceneController.getObject(objectId);
        if (!obj || !obj.mesh) return;

        // Don't change state of selected objects
        if (this.selectionController?.isSelected(obj.mesh)) return;

        visualizationManager.setState(obj.mesh, isHovering ? 'hovered' : 'normal');
    }

    handleDeselectAll(data) {
        if (!this.selectionController) {
            console.error('CommandRouter: SelectionController not available');
            return;
        }

        // Clear selection (SelectionController handles visualization and events)
        this.selectionController.clearSelection();
        this.selectionController.notifySelectionChange();
    }

    handleMultiSelect(data) {
        const { objectIds } = data;

        if (!this.selectionController || !this.sceneController) {
            console.error('CommandRouter: SelectionController or SceneController not available');
            return;
        }

        // Clear existing selection
        this.selectionController.clearSelection();

        // Select all objects
        objectIds.forEach(objectId => {
            const obj = this.sceneController.getObject(objectId);
            if (obj && obj.mesh) {
                this.selectionController.select(obj.mesh);
            }
        });
    }

    handleReorderChildren(data) {
        const { parentId, childId, newIndex, childrenOrder, objectId, targetId, position } = data;

        if (!this.sceneController) {
            console.error('CommandRouter: SceneController not available');
            return;
        }

        // Handle ObjectTree drag-drop format (objectId, targetId, position)
        if (objectId && targetId && position) {
            this.reorderChildByPosition(objectId, targetId, position, parentId);
            return;
        }

        // Legacy format support
        if (childrenOrder) {
            // Full reorder
            this.updateChildrenOrder(parentId, childrenOrder);
        } else if (childId !== undefined && newIndex !== undefined) {
            // Move single child to index
            this.moveChildToIndex(parentId, childId, newIndex);
        }
    }

    // Reorder child based on drop position relative to target
    reorderChildByPosition(objectId, targetId, position, parentId) {
        // No-op if dragging onto self
        if (objectId === targetId) return;

        // Get children list from parent (or root)
        const children = parentId ?
            this.sceneController.getChildObjects(parentId) :
            this.sceneController.getRootObjects();

        // Build current childrenOrder array
        const currentOrder = children.map(child => child.id);

        // Remove dragged object from current position
        const draggedIndex = currentOrder.indexOf(objectId);
        if (draggedIndex === -1) {
            console.error('CommandRouter: Dragged object not found in children list');
            return;
        }
        currentOrder.splice(draggedIndex, 1);

        // Find target index
        let targetIndex = currentOrder.indexOf(targetId);
        if (targetIndex === -1) {
            console.error('CommandRouter: Target object not found in children list');
            return;
        }

        // Calculate new index based on position
        const newIndex = position === 'before' ? targetIndex : targetIndex + 1;

        // Insert at new position
        currentOrder.splice(newIndex, 0, objectId);

        // childrenOrder is SceneController-owned — write directly, then notify UI
        if (parentId) {
            this.applyChildrenOrder(parentId, currentOrder);
        } else {
            this.sceneController.setRootOrder(currentOrder);
        }
    }

    // Update children order array
    updateChildrenOrder(parentId, childrenOrder) {
        if (parentId) {
            this.applyChildrenOrder(parentId, childrenOrder);
        } else {
            this.sceneController.setRootOrder(childrenOrder);
        }
    }

    // Shared: write childrenOrder to SceneController, emit event, trigger layout if needed
    applyChildrenOrder(parentId, childrenOrder) {
        const container = this.sceneController.getObject(parentId);
        if (!container) return;

        container.childrenOrder = childrenOrder;

        if (window.objectEventBus) {
            window.objectEventBus.emit(
                window.objectEventBus.EVENT_TYPES.HIERARCHY,
                parentId,
                { type: 'children-reordered', childrenOrder },
                { source: 'CommandRouter.applyChildrenOrder' }
            );
        }

        // UNIFIED: Let updateContainer() handle mode routing (layout/hug/manual)
        this.sceneController.updateContainer(parentId, { reason: 'hierarchy-changed' });
    }

    // Move child to specific index
    moveChildToIndex(parentId, childId, newIndex) {
        const children = parentId ?
            this.sceneController.getChildObjects(parentId) :
            this.sceneController.getRootObjects();

        const currentOrder = children.map(child => child.id);
        const oldIndex = currentOrder.indexOf(childId);
        if (oldIndex === -1) return;

        // Remove from old position
        currentOrder.splice(oldIndex, 1);
        // Insert at new position
        currentOrder.splice(newIndex, 0, childId);

        this.updateChildrenOrder(parentId, currentOrder);
    }

    handleMoveToContainer(data) {
        const { objectId, targetContainerId } = data;

        if (!this.sceneController) {
            console.error('CommandRouter: SceneController not available');
            return;
        }

        this.sceneController.moveObjectToContainer(objectId, targetContainerId);
    }

    handleMoveToRoot(data) {
        const { objectId } = data;

        if (!this.sceneController) {
            console.error('CommandRouter: SceneController not available');
            return;
        }

        this.sceneController.moveObjectToRoot(objectId);
    }

    handleMoveAndReorder(data) {
        const { objectId, targetParentId, targetId, position } = data;

        if (!this.sceneController) {
            console.error('CommandRouter: SceneController not available');
            return;
        }

        // Capture old parent before move (needed to re-layout after child removal)
        const obj = this.sceneController.getObject(objectId);
        const oldParentId = obj?.parentContainer;

        // Step 1: Move to new parent (suppress layout — Step 2 will trigger it)
        this.sceneController.setParentContainer(objectId, targetParentId || null, false);

        // Step 2: Reorder within new parent → triggers layout once
        if (targetId && position) {
            this.reorderChildByPosition(objectId, targetId, position, targetParentId);
        }

        // Step 3: Re-layout old parent (remaining children need repositioning)
        if (oldParentId && oldParentId !== targetParentId) {
            this.sceneController.updateContainer(oldParentId, { reason: 'hierarchy-changed' });
        }
    }

    handleDeleteObject(data) {
        const { objectId, objectIds } = data;

        if (!this.historyManager) {
            console.error('CommandRouter: HistoryManager not available for delete');
            return;
        }

        // Normalize to array
        const idsToDelete = (objectIds && Array.isArray(objectIds)) ? objectIds : objectId ? [objectId] : [];
        if (idsToDelete.length === 0) return;

        // Route through DeleteObjectCommand for undo support + parent layout update
        const deleteCommand = new DeleteObjectCommand(idsToDelete);
        this.historyManager.executeCommand(deleteCommand);
    }

    handleDuplicateObject(data) {
        const { objectId } = data;

        if (!this.historyManager) {
            console.error('CommandRouter: HistoryManager not available');
            return;
        }

        const command = new DuplicateObjectCommand(objectId);
        this.historyManager.executeCommand(command);
    }

    handleCreateContainer(data) {
        const { objectId, direction, gap } = data;

        if (!this.containerCrudManager) {
            console.error('CommandRouter: ContainerCrudManager not available');
            return;
        }

        this.containerCrudManager.createContainerFromObject(objectId, {
            direction: direction || 'x',
            gap: gap || 10
        });
    }

    handleWrapSelectionInContainer() {
        if (!this.toolController) {
            console.error('CommandRouter: ToolController not available');
            return;
        }
        this.toolController.createLayoutContainer();
    }

    handleCreateTiledContainer(data) {
        const tileTool = this.toolController?.tools?.get('tile');
        if (!tileTool?.createTiledContainer) {
            console.error('CommandRouter: TileTool not available');
            return;
        }

        // Ensure tile tool has a target (the object to tile)
        if (!tileTool.targetObject) {
            const obj = this.sceneController?.getObject(data.objectId);
            if (obj?.mesh) {
                tileTool.targetObject = obj.mesh;
            }
        }

        tileTool.createTiledContainer({
            axis: data.axis,
            repeat: data.repeat ?? 3,
            gap: data.gap ?? 0
        });
    }

    handleActivateTool(data) {
        const toolId = data.toolId || data.toolName || data.data?.toolName;

        if (!this.toolController) {
            console.error('CommandRouter: ToolController not available');
            return;
        }

        this.toolController.switchToTool(toolId);
    }

    handleSnapToggle() {
        const snapController = window.modlerComponents?.snapController;
        if (!snapController) {
            console.error('CommandRouter: SnapController not available');
            return;
        }
        snapController.toggle();
    }

    handleUndo(data) {
        if (!this.historyManager) {
            console.error('CommandRouter: HistoryManager not available');
            return;
        }

        this.historyManager.undo();
    }

    handleRedo(data) {
        if (!this.historyManager) {
            console.error('CommandRouter: HistoryManager not available');
            return;
        }

        this.historyManager.redo();
    }

    handleUIPanelReady(data) {
        // UI panel is ready - send initial hierarchy and selection state
        // This ensures object list populates immediately when each panel loads

        if (!window.stateSerializer || !window.simpleCommunication) {
            console.warn('CommandRouter: StateSerializer or SimpleCommunication not available');
            return;
        }

        // Send initial hierarchy to the newly ready panel
        window.simpleCommunication.sendInitialHierarchySync(window.stateSerializer);

        // Send persisted snap state so UI reflects saved preference
        const snapController = window.modlerComponents?.snapController;
        if (snapController) {
            snapController.notifySnapStateChange();
        }
    }

    // Settings delegation helpers
    delegateSettingsUpdate(method, data) {
        const settingsHandler = window.modlerComponents?.settingsHandler;
        if (!settingsHandler) return;
        const settings = data.data?.settings || data.settings;
        if (!settings) return;
        settingsHandler[method](settings);
    }

    delegateSettingsGet(method, data) {
        const settingsHandler = window.modlerComponents?.settingsHandler;
        if (!settingsHandler) return;
        settingsHandler[method](data.sourceWindow);
    }

    // ═══════════════════════════════════════════════════════════════
    // EXPORT/IMPORT HANDLERS
    // ═══════════════════════════════════════════════════════════════

    handleExportScene(data) {
        const exportImportManager = window.modlerComponents?.exportImportManager;
        if (!exportImportManager) return;
        exportImportManager.exportScene({ fileName: data?.fileName });
    }

    async handleImportScene(data) {
        const exportImportManager = window.modlerComponents?.exportImportManager;
        if (!exportImportManager) return;

        const result = await exportImportManager.importScene();
        if (result.success && data?.sourceWindow) {
            data.sourceWindow.postMessage({
                type: 'scene-imported',
                fileId: result.fileId,
                name: result.name
            }, '*');
        }
    }

    handleExportObject(data) {
        const exportImportManager = window.modlerComponents?.exportImportManager;
        if (!exportImportManager || !data?.objectId) return;
        exportImportManager.exportObject(data.objectId);
    }

    async handleImportObject(data) {
        const exportImportManager = window.modlerComponents?.exportImportManager;
        if (!exportImportManager) return;

        const result = await exportImportManager.importObject();
        if (result.success && data?.sourceWindow) {
            data.sourceWindow.postMessage({
                type: 'object-imported',
                rootId: result.rootId
            }, '*');
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // YARD HANDLERS
    // ═══════════════════════════════════════════════════════════════

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

    /**
     * Get statistics
     */
    getStats() {
        return { ...this.stats };
    }

    /**
     * Get list of registered actions
     */
    getRegisteredActions() {
        return Array.from(this.handlers.keys());
    }
}

// Export singleton instance
window.CommandRouter = CommandRouter;
window.commandRouter = new CommandRouter();
