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

        // ═══════════════════════════════════════════════════════════
        // HIERARCHY OPERATIONS
        // ═══════════════════════════════════════════════════════════
        this.handlers.set('reorder-children', this.handleReorderChildren.bind(this));
        this.handlers.set('object-reorder', this.handleReorderChildren.bind(this)); // Alias

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
        // Settings operations — update and get handlers follow identical patterns
        const settingsRoutes = {
            'cad-wireframe': 'CadWireframe',
            'visual': 'Visual',
            'scene': 'Scene',
            'interface': 'Interface',
        };
        for (const [prefix, methodSuffix] of Object.entries(settingsRoutes)) {
            this.handlers.set(`${prefix}-settings-changed`, (data) => {
                this.delegateSettingsUpdate(`handle${methodSuffix}SettingsUpdate`, data);
            });
            this.handlers.set(`get-${prefix}-settings`, (data) => {
                this.delegateSettingsGet(`handleGet${methodSuffix}Settings`, data);
            });
        }
        console.log(`✅ CommandRouter: Registered ${this.handlers.size} action handlers`);
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
                return false;
            }

            // Execute handler
            handler(data);
            this.stats.commandsExecuted++;
            return true;

        } catch (error) {
            console.error('CommandRouter: Command execution failed', error, command);
            this.stats.errors++;
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

        this.propertyUpdateHandler.handlePropertyUpdate({
            objectId,
            property,
            value,
            source: source || 'command-router'
        });
    }

    handleFillModeToggle(data) {
        const { objectId, axis } = data;

        if (!this.propertyUpdateHandler) {
            console.error('CommandRouter: PropertyUpdateHandler not available');
            return;
        }

        this.propertyUpdateHandler.handleFillButtonToggle(objectId, axis);
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

        // Update childrenOrder in state
        if (parentId) {
            // Container child order
            const containerData = this.sceneController.getObject(parentId);
            if (containerData) {
                this.objectStateManager.updateObject(parentId, {
                    childrenOrder: currentOrder
                }, 'reorder');
            }
        } else {
            // Root level order
            this.sceneController.setRootOrder(currentOrder);
        }
    }

    // Update children order array
    updateChildrenOrder(parentId, childrenOrder) {
        if (parentId) {
            this.objectStateManager.updateObject(parentId, {
                childrenOrder: childrenOrder
            }, 'reorder');
        } else {
            this.sceneController.setRootOrder(childrenOrder);
        }
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

    handleDeleteObject(data) {
        const { objectId, objectIds } = data;

        if (!this.sceneController) {
            console.error('CommandRouter: SceneController not available');
            return;
        }

        if (objectIds && Array.isArray(objectIds)) {
            // Delete multiple objects
            objectIds.forEach(id => this.sceneController.removeObject(id));
        } else if (objectId) {
            // Delete single object
            this.sceneController.removeObject(objectId);
        }
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
