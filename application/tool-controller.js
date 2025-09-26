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
            return false;
        }

        // Clear any active face highlights from previous tool
        this.clearActiveToolHighlights();

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

        // Notify tool state change for UI synchronization
        if (window.notifyToolStateChanged) {
            window.notifyToolStateChanged(toolName);
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
     * Clear any active face highlights from the current tool
     * Used when performing operations that should reset tool state (like Cmd+F)
     */
    clearActiveToolHighlights() {
        if (!this.activeTool) return;

        // Clear face highlights for face-based tools
        if (this.activeTool.clearHover && typeof this.activeTool.clearHover === 'function') {
            this.activeTool.clearHover();
        }

        // Also clear visual effects highlights as fallback
        if (this.visualEffects && this.visualEffects.clearHighlight) {
            this.visualEffects.clearHighlight();
        }
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
     * ENHANCED: Create container or handle nesting scenarios from selected objects
     * Supports multiple scenarios:
     * - Objects only: Create new container (existing behavior)
     * - Container + objects: Add objects to existing container
     * - Container + container: Nest one container inside another
     * - Multiple containers: Smart nesting (first contains others)
     */
    createLayoutContainer() {
        // Clear any active face highlights from tools before creating container
        this.clearActiveToolHighlights();

        const selectedObjects = this.selectionController.getSelectedObjects();

        if (selectedObjects.length === 0) {
            return false;
        }

        // Get required components
        const sceneController = window.modlerComponents?.sceneController;
        const containerCrudManager = window.modlerComponents?.containerCrudManager;

        if (!sceneController || !containerCrudManager) {
            console.error('Required components not available');
            return false;
        }

        // Filter out non-selectable objects and get object data
        const selectableObjectData = [];
        for (const mesh of selectedObjects) {
            const objectData = sceneController.getObjectByMesh(mesh);
            console.log('🔍 Checking object:', {
                name: objectData?.name,
                id: objectData?.id,
                isContainer: objectData?.isContainer,
                selectable: objectData?.selectable,
                hasObjectData: !!objectData
            });

            // Include containers even if selectable is not explicitly true
            // This is because containers might have different selectable logic
            if (objectData && (objectData.selectable === true || objectData.isContainer)) {
                selectableObjectData.push(objectData);
            }
        }

        if (selectableObjectData.length === 0) {
            return false;
        }

        // Debug: Log what we found
        console.log('🔍 Selection analysis:', {
            totalObjects: selectableObjectData.length,
            objectDetails: selectableObjectData.map(obj => ({
                id: obj.id,
                name: obj.name,
                isContainer: obj.isContainer,
                type: obj.type
            }))
        });

        // Analyze selection to determine the appropriate action
        const containers = selectableObjectData.filter(obj => obj.isContainer);
        const regularObjects = selectableObjectData.filter(obj => !obj.isContainer);


        // Scenario 1: Objects only - Create new container (existing behavior)
        if (containers.length === 0 && regularObjects.length > 0) {
            const selectableMeshes = regularObjects.map(obj => obj.mesh);
            return this.executeContainerCreationCommand(selectableMeshes);
        }

        // Scenario 2: Container + objects - Create NEW container containing everything
        if (containers.length === 1 && regularObjects.length > 0) {
            ;

            // Combine all meshes (both containers and objects)
            const allMeshes = [
                ...containers.map(obj => obj.mesh),
                ...regularObjects.map(obj => obj.mesh)
            ];

            return this.executeContainerCreationCommand(allMeshes);
        }

        // Scenario 3: Container + container - Nest one container inside another
        if (containers.length === 2 && regularObjects.length === 0) {
            const [containerA, containerB] = containers;

            // Check which nesting makes sense (avoid circular references)
            const canNestAIntoB = !sceneController.wouldCreateCircularReference(containerA.id, containerB.id);
            const canNestBIntoA = !sceneController.wouldCreateCircularReference(containerB.id, containerA.id);

            if (canNestAIntoB && !canNestBIntoA) {
                // Only A can go into B
                console.log(`🏠 Nesting container ${containerA.name} into ${containerB.name}`);
                return containerCrudManager.addContainerToContainer(containerA, containerB);
            } else if (canNestBIntoA && !canNestAIntoB) {
                // Only B can go into A
                console.log(`🏠 Nesting container ${containerB.name} into ${containerA.name}`);
                return containerCrudManager.addContainerToContainer(containerB, containerA);
            } else if (canNestAIntoB && canNestBIntoA) {
                // Both are possible - choose based on size or hierarchy
                const depthA = sceneController.getContainerNestingDepth(containerA.id);
                const depthB = sceneController.getContainerNestingDepth(containerB.id);

                if (depthA > depthB) {
                    // A is deeper, put A into B
                    console.log(`🏠 Nesting deeper container ${containerA.name} (depth ${depthA}) into ${containerB.name} (depth ${depthB})`);
                    return containerCrudManager.addContainerToContainer(containerA, containerB);
                } else {
                    // B is deeper or equal, put B into A
                    console.log(`🏠 Nesting deeper container ${containerB.name} (depth ${depthB}) into ${containerA.name} (depth ${depthA})`);
                    return containerCrudManager.addContainerToContainer(containerB, containerA);
                }
            } else {
                console.error('❌ Cannot nest these containers - would create circular reference');
                return false;
            }
        }

        // Scenario 4: Multiple containers (2+ containers, no regular objects) - Create new container containing all
        if (containers.length >= 2 && regularObjects.length === 0) {
            ;

            const allMeshes = containers.map(obj => obj.mesh);
            return this.executeContainerCreationCommand(allMeshes);
        }

        // Scenario 5: Mixed selection with multiple containers + objects - Create new container containing everything
        if (containers.length > 1 && regularObjects.length > 0) {
            ;

            // Combine all meshes (both containers and objects)
            const allMeshes = [
                ...containers.map(obj => obj.mesh),
                ...regularObjects.map(obj => obj.mesh)
            ];

            return this.executeContainerCreationCommand(allMeshes);
        }

        // Fallback: Single container selected
        if (containers.length === 1 && regularObjects.length === 0) {
            return false;
        }

        console.warn('⚠️ Unhandled selection scenario');
        return false;
    }

    /**
     * Execute container creation as an undoable command
     * @param {Array} selectedMeshes - Meshes to include in container
     * @returns {boolean} True if command was executed successfully
     */
    executeContainerCreationCommand(selectedMeshes) {
        const historyManager = window.modlerComponents?.historyManager;

        if (!historyManager) {
            console.warn('ToolController: HistoryManager not available, creating container without undo support');
            // Fallback to direct creation
            const containerCrudManager = window.modlerComponents?.containerCrudManager;
            return containerCrudManager?.createContainerFromSelection(selectedMeshes);
        }

        // Create and execute the command
        const command = new CreateContainerCommand(selectedMeshes);
        const success = historyManager.executeCommand(command);

        if (success) {
        } else {
            console.error('❌ Failed to execute container creation command');
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