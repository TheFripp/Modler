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
            console.error('CommandRouter: modlerComponents not available');
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
        this.handlers.set('update-dimension', this.handleDimensionUpdate.bind(this));
        this.handlers.set('update-position', this.handlePositionUpdate.bind(this));
        this.handlers.set('update-rotation', this.handleRotationUpdate.bind(this));
        this.handlers.set('update-color', this.handleColorUpdate.bind(this));
        this.handlers.set('update-opacity', this.handleOpacityUpdate.bind(this));

        // ═══════════════════════════════════════════════════════════
        // LAYOUT OPERATIONS
        // ═══════════════════════════════════════════════════════════
        this.handlers.set('toggle-fill-mode', this.handleFillModeToggle.bind(this));
        this.handlers.set('fill-button-toggle', this.handleFillModeToggle.bind(this)); // Alias
        this.handlers.set('update-layout-property', this.handleLayoutPropertyUpdate.bind(this));
        this.handlers.set('toggle-hug-mode', this.handleHugModeToggle.bind(this));
        this.handlers.set('update-layout-direction', this.handleLayoutDirectionUpdate.bind(this));
        this.handlers.set('update-layout-gap', this.handleLayoutGapUpdate.bind(this));

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
        this.handlers.set('move-to-container', this.handleMoveToContainer.bind(this));
        this.handlers.set('object-move-to-container', this.handleMoveToContainer.bind(this)); // Alias
        this.handlers.set('move-to-root', this.handleMoveToRoot.bind(this));
        this.handlers.set('object-move-to-root', this.handleMoveToRoot.bind(this)); // Alias
        this.handlers.set('reorder-children', this.handleReorderChildren.bind(this));
        this.handlers.set('object-reorder', this.handleReorderChildren.bind(this)); // Alias
        this.handlers.set('reverse-child-order', this.handleReverseChildOrder.bind(this));

        // ═══════════════════════════════════════════════════════════
        // OBJECT LIFECYCLE
        // ═══════════════════════════════════════════════════════════
        this.handlers.set('delete-object', this.handleDeleteObject.bind(this));
        this.handlers.set('object-delete', this.handleDeleteObject.bind(this)); // Alias
        this.handlers.set('duplicate-object', this.handleDuplicateObject.bind(this));
        this.handlers.set('rename-object', this.handleRenameObject.bind(this));

        // ═══════════════════════════════════════════════════════════
        // CONTAINER OPERATIONS
        // ═══════════════════════════════════════════════════════════
        this.handlers.set('create-container', this.handleCreateContainer.bind(this));
        this.handlers.set('create-layout-container', this.handleCreateContainer.bind(this)); // Alias
        this.handlers.set('create-tiled-container', this.handleCreateTiledContainer.bind(this));

        // ═══════════════════════════════════════════════════════════
        // TOOL OPERATIONS
        // ═══════════════════════════════════════════════════════════
        this.handlers.set('activate-tool', this.handleActivateTool.bind(this));
        this.handlers.set('tool-activate', this.handleActivateTool.bind(this)); // Alias

        // ═══════════════════════════════════════════════════════════
        // HISTORY OPERATIONS
        // ═══════════════════════════════════════════════════════════
        this.handlers.set('undo', this.handleUndo.bind(this));
        this.handlers.set('redo', this.handleRedo.bind(this));

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

    handleDimensionUpdate(data) {
        const { objectId, axis, value, source } = data;

        this.handlePropertyUpdate({
            objectId,
            property: `dimensions.${axis}`,
            value,
            source
        });
    }

    handlePositionUpdate(data) {
        const { objectId, axis, value, source } = data;

        this.handlePropertyUpdate({
            objectId,
            property: `position.${axis}`,
            value,
            source
        });
    }

    handleRotationUpdate(data) {
        const { objectId, axis, value, source } = data;

        this.handlePropertyUpdate({
            objectId,
            property: `rotation.${axis}`,
            value,
            source
        });
    }

    handleColorUpdate(data) {
        const { objectId, value, source } = data;

        this.handlePropertyUpdate({
            objectId,
            property: 'material.color',
            value,
            source
        });
    }

    handleOpacityUpdate(data) {
        const { objectId, value, source } = data;

        this.handlePropertyUpdate({
            objectId,
            property: 'material.opacity',
            value,
            source
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

    handleLayoutPropertyUpdate(data) {
        const { objectId, property, value } = data;

        if (!this.propertyUpdateHandler) {
            console.error('CommandRouter: PropertyUpdateHandler not available');
            return;
        }

        this.propertyUpdateHandler.handleLayoutPropertyUpdate(objectId, property, value);
    }

    handleHugModeToggle(data) {
        const { objectId } = data;

        if (!this.sceneController) {
            console.error('CommandRouter: SceneController not available');
            return;
        }

        this.sceneController.toggleHugMode(objectId);
    }

    handleLayoutDirectionUpdate(data) {
        const { objectId, direction } = data;

        this.handlePropertyUpdate({
            objectId,
            property: 'autoLayout.direction',
            value: direction
        });
    }

    handleLayoutGapUpdate(data) {
        const { objectId, gap } = data;

        this.handlePropertyUpdate({
            objectId,
            property: 'autoLayout.gap',
            value: gap
        });
    }

    handleSelectObject(data) {
        const { objectId, addToSelection } = data;

        if (!this.selectionController) {
            console.error('CommandRouter: SelectionController not available');
            return;
        }

        if (addToSelection) {
            this.selectionController.addToSelection(objectId);
        } else {
            this.selectionController.selectObject(objectId);
        }
    }

    handleDeselectAll(data) {
        if (!this.selectionController) {
            console.error('CommandRouter: SelectionController not available');
            return;
        }

        this.selectionController.clearSelection();
    }

    handleMultiSelect(data) {
        const { objectIds } = data;

        if (!this.selectionController) {
            console.error('CommandRouter: SelectionController not available');
            return;
        }

        this.selectionController.setSelection(objectIds);
    }

    handleMoveToContainer(data) {
        const { objectId, containerId, targetContainerId } = data;

        // Support both naming conventions
        const targetId = containerId || targetContainerId;

        if (!this.sceneController) {
            console.error('CommandRouter: SceneController not available');
            return;
        }

        this.sceneController.moveObjectToContainer(objectId, targetId);
    }

    handleMoveToRoot(data) {
        const { objectId } = data;

        if (!this.sceneController) {
            console.error('CommandRouter: SceneController not available');
            return;
        }

        this.sceneController.moveObjectToRoot(objectId);
    }

    handleReorderChildren(data) {
        const { parentId, childId, newIndex, childrenOrder } = data;

        if (!this.sceneController) {
            console.error('CommandRouter: SceneController not available');
            return;
        }

        if (childrenOrder) {
            // Full reorder
            this.sceneController.reorderChildren(parentId, childrenOrder);
        } else if (childId !== undefined && newIndex !== undefined) {
            // Move single child to index
            this.sceneController.moveChildToIndex(parentId, childId, newIndex);
        }
    }

    handleReverseChildOrder(data) {
        const { parentId } = data;

        if (!this.sceneController) {
            console.error('CommandRouter: SceneController not available');
            return;
        }

        this.sceneController.reverseChildOrder(parentId);
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

        if (!this.sceneController) {
            console.error('CommandRouter: SceneController not available');
            return;
        }

        this.sceneController.duplicateObject(objectId);
    }

    handleRenameObject(data) {
        const { objectId, name } = data;

        this.handlePropertyUpdate({
            objectId,
            property: 'name',
            value: name
        });
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

    handleCreateTiledContainer(data) {
        const { objectId, axis, repeat, gap } = data;

        if (!this.containerCrudManager) {
            console.error('CommandRouter: ContainerCrudManager not available');
            return;
        }

        this.containerCrudManager.createTiledContainer(objectId, {
            axis: axis || 'x',
            repeat: repeat || 3,
            gap: gap || 10
        });
    }

    handleActivateTool(data) {
        const { toolId } = data;

        if (!this.toolController) {
            console.error('CommandRouter: ToolController not available');
            return;
        }

        this.toolController.activateTool(toolId);
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
