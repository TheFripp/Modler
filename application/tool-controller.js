/**
 * Tool Controller
 * Manages tool registration, switching, and active state
 * Target: ~100 lines - thin coordinator, integrates with consolidated InputController
 */

class ToolController {
    constructor(inputController, selectionController, visualEffects) {
        this.inputController = inputController;
        this.selectionController = selectionController;
        this.visualEffects = visualEffects;
        
        this.tools = new Map();
        this.activeTool = null;
        this.activeToolName = null;
        
        this.setupKeyboardShortcuts();
    }
    
    /**
     * Register a tool with the controller
     */
    registerTool(name, toolClass) {
        if (this.tools.has(name)) {
            console.warn(`Tool '${name}' already registered, replacing`);
        }
        
        let tool;
        try {
            // Instantiate the tool with dependencies
            tool = new toolClass(this.selectionController, this.visualEffects);
            this.tools.set(name, tool);
        } catch (error) {
            console.error(`Error creating ${name} tool:`, error);
            throw error;
        }
        
        // Also add as direct property for compatibility with existing code
        this.tools[name] = tool;
        
        // Register tool behaviors with InputController
        this.inputController.toolBehaviors[name] = {
            onHover: (hit) => tool.onHover ? tool.onHover(hit) : undefined,
            onClick: (hit, event) => tool.onClick ? tool.onClick(hit, event) : undefined,
            onDoubleClick: (hit, event) => tool.onDoubleClick ? tool.onDoubleClick(hit, event) : undefined,
            onMouseDown: (hit, event) => tool.onMouseDown ? tool.onMouseDown(hit, event) : undefined,
            onMouseUp: (hit, event) => tool.onMouseUp ? tool.onMouseUp(hit, event) : undefined,
            onMouseMove: (hit, event) => tool.onMouseMove ? tool.onMouseMove(hit, event) : undefined,
            onKeyDown: (event) => tool.onKeyDown ? tool.onKeyDown(event) : undefined,
            hasActiveHighlight: () => tool.hasActiveHighlight ? tool.hasActiveHighlight() : false
        };
        
        return tool;
    }
    
    /**
     * Switch to a different tool
     */
    switchToTool(toolName) {
        if (!this.tools.has(toolName)) {
            console.error(`Tool '${toolName}' not found`);
            return false;
        }
        
        // Deactivate current tool if there is one
        if (this.activeTool && this.activeTool.deactivate) {
            this.activeTool.deactivate();
        }
        
        // Update InputController's current tool
        this.inputController.currentTool = toolName;
        this.activeTool = this.tools.get(toolName);
        this.activeToolName = toolName;
        
        // Activate new tool
        if (this.activeTool && this.activeTool.activate) {
            this.activeTool.activate();
        }
        
        return true;
    }
    
    /**
     * Get the currently active tool
     */
    getActiveTool() {
        return this.activeTool;
    }
    
    /**
     * Get the name of the currently active tool
     */
    getActiveToolName() {
        return this.activeToolName;
    }
    
    /**
     * Check if a specific tool is active
     */
    isToolActive(toolName) {
        return this.activeToolName === toolName;
    }
    
    /**
     * Get all registered tool names
     */
    getToolNames() {
        return Array.from(this.tools.keys());
    }

    /**
     * Check if the current tool is actively dragging objects
     */
    isDragging() {
        if (!this.activeTool) return false;

        // Check if tool has isDragging property
        return this.activeTool.isDragging === true;
    }

    /**
     * Check if the current tool is actively pushing faces
     */
    isPushing() {
        if (!this.activeTool) return false;

        // Check if tool has isPushing property
        return this.activeTool.isPushing === true;
    }
    
    /**
     * Setup keyboard shortcuts for tool switching
     * Note: Basic tool switching (Q,W,E,R) is handled by InputController
     * This handles advanced shortcuts like Cmd+F
     */
    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (event) => {
            // Skip if any input field is focused (handled by InputController)
            const activeElement = document.activeElement;
            const isInputFocused = activeElement && (
                activeElement.tagName === 'INPUT' || 
                activeElement.tagName === 'TEXTAREA' ||
                activeElement.contentEditable === 'true'
            );
            
            if (isInputFocused) {
                return;
            }
            
            switch (event.key) {
                case 'f':
                case 'F':
                    // Cmd+F or Ctrl+F: Create auto layout container from selection
                    if (event.metaKey || event.ctrlKey) {
                        event.preventDefault();
                        event.stopPropagation();
                        event.stopImmediatePropagation();
                        this.createLayoutContainer();
                        return false;
                    }
                    break;
            }
        });
    }
    
    /**
     * Create auto layout container from selected objects
     */
    createLayoutContainer() {
        const selectedObjects = this.selectionController.getSelectedObjects();
        
        if (selectedObjects.length === 0) {
            console.log('No objects selected for container creation');
            return false;
        }
        
        // Filter out non-selectable objects (like floor grid) to ensure clean container bounds
        const sceneController = window.modlerComponents?.sceneController;
        const selectableObjects = selectedObjects.filter(obj => {
            if (!sceneController) return true; // Fallback: include all if SceneController unavailable
            const objectData = sceneController.getObjectByMesh(obj);
            return objectData && objectData.selectable === true;
        });
        
        if (selectableObjects.length === 0) {
            console.log('No selectable objects in selection for container creation');
            return false;
        }
        
        if (selectableObjects.length !== selectedObjects.length) {
            console.log(`Filtered out ${selectedObjects.length - selectableObjects.length} non-selectable objects from container creation`);
        }
        
        // Direct container creation - no tool dependency
        const containerManager = window.modlerComponents?.containerManager;
        if (!containerManager) {
            console.error('ContainerManager not available');
            return false;
        }

        // Create container directly from ContainerManager
        const success = containerManager.createContainerFromSelection(selectableObjects);
        
        if (success) {
            console.log(`Created auto layout container from ${selectableObjects.length} selected objects`);
            
            // REMOVED: Automatic tool switching - user controls tool selection
            // Only the user should switch tools, not automatic behavior
        }
        
        return success;
    }

    /**
     * Get tool capabilities - used by UI to show available actions
     */
    getToolCapabilities(toolName) {
        const tool = this.tools.get(toolName);
        return tool ? tool.getCapabilities() : null;
    }
    
    /**
     * Shutdown all tools
     */
    shutdown() {
        if (this.activeTool) {
            this.activeTool.deactivate();
        }
        
        this.tools.forEach(tool => {
            if (tool.shutdown) {
                tool.shutdown();
            }
        });
        
        this.tools.clear();
        this.activeTool = null;
        this.activeToolName = null;
    }
}