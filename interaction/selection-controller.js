// Modler V2 - Core Selection State Management
// Handles selection state only - visual effects delegated to SelectionVisualizer
// Target: ~150 lines - streamlined from 793 lines

class SelectionController {
    constructor() {
        // Core selection state
        this.selectedObjects = new Set();
        this.selectionHistory = [];
        this.maxHistorySize = 10;

        // Component references (set during initialization)
        this.visualizationManager = null;
        // containerContextManager removed - NavigationController handles all container context

        // Double-click tracking for container step-in (moved from BaseSelectionBehavior)
        this.lastClickedChildObject = null;
        this.lastClickTime = 0;

    }

    /**
     * Initialize with dependent components
     */
    initialize(visualizationManager) {
        this.visualizationManager = visualizationManager;
        // containerContextManager removed - NavigationController handles all container context
    }

    // Core selection methods
    select(object) {
        if (!object) {
            return false;
        }

        const sceneController = window.modlerComponents?.sceneController;
        if (!sceneController) {
            return false;
        }

        // Get object data for container logic
        const objectData = sceneController.getObjectByMesh(object);
        const isInContainerContext = this.isInContainerContext();
        const currentContainerContext = this.getContainerContext();

        // CONTAINER CONTEXT SELECTION LOGIC
        let targetObject = object;
        let shouldStepIntoContainer = false;

        // Check if we're in container context and clicking within same container
        if (isInContainerContext && currentContainerContext && objectData) {
            const isPartOfCurrentContainer = this.isObjectPartOfContainer(objectData, currentContainerContext);

            if (isPartOfCurrentContainer) {
                // CASE 1: In container context, clicking object in same container
                // → Direct selection (bypass container-first logic)
                targetObject = object;
            } else {
                // CASE 2: In container context, clicking object outside current container
                // → Step out first, then apply normal selection logic
                const navigationController = window.modlerComponents?.navigationController;
                if (navigationController) {
                    navigationController.navigateUp();
                } else {
                    // Fallback: Navigate up if NavigationController unavailable
                    console.warn('SelectionController: NavigationController unavailable for step out');
                }

                // ARCHITECTURAL CHANGE: Direct selection, no container-first
                if (objectData.parentContainer) {
                    // Select the child object directly, no container redirection
                    targetObject = object;
                    shouldStepIntoContainer = false;
                } else if (objectData.isContainer) {
                    // Clicking on a different container - direct selection
                    targetObject = object;
                }
            }
        } else if (objectData && objectData.parentContainer) {
            // CASE 3: NOT in container context, clicking child object
            // → CONTAINER-FIRST: Select parent container instead of child
            const sceneController = window.modlerComponents?.sceneController;
            const parentContainer = sceneController?.getObject(objectData.parentContainer);

            if (parentContainer && parentContainer.mesh) {
                targetObject = parentContainer.mesh; // Select parent container first
                shouldStepIntoContainer = false;
            } else {
                // Fallback to direct selection if parent not found
                targetObject = object;
                shouldStepIntoContainer = false;
            }
        } else {
            // CASE 4: NOT in container context, clicking top-level object/container
            // → Direct selection
            targetObject = object;
        }

        // Add to selection
        this.selectedObjects.add(targetObject);
        this.addToHistory('select', targetObject);

        // Handle container step-in after selection using NavigationController
        if (shouldStepIntoContainer) {
            const navigationController = window.modlerComponents?.navigationController;
            const sceneController = window.modlerComponents?.sceneController;
            if (navigationController && sceneController) {
                const objectData = sceneController.getObjectByMesh(targetObject);
                if (objectData) {
                    navigationController.navigateToContainer(objectData.id);
                    return true; // Skip normal visual updates - NavigationController handles them
                }
            }
        }

        // Delegate visual updates to VisualizationManager
        if (this.visualizationManager) {
            this.visualizationManager.setState(targetObject, 'selected');
        }

        // Update property panel with the selected object
        if (window.updatePropertyPanelFromObject) {
            window.updatePropertyPanelFromObject(targetObject);
        }

        // Update object list selection with all currently selected objects
        if (window.updateObjectListSelection) {
            const allSelectedNames = Array.from(this.selectedObjects).map(obj => obj.name);
            window.updateObjectListSelection(allSelectedNames);
        }

        // Notify tools about selection change
        this.notifySelectionChange();

        return true;
    }

    deselect(object) {
        if (!object || !this.selectedObjects.has(object)) return false;

        this.selectedObjects.delete(object);
        this.addToHistory('deselect', object);

        // Delegate visual updates to VisualizationManager
        if (this.visualizationManager) {
            this.visualizationManager.setState(object, 'normal');
        }

        return true;
    }

    toggle(object) {
        if (this.isSelected(object)) {
            const result = this.deselect(object);
            // After deselecting, update property panel with remaining selection or clear
            this.updatePropertyPanelForCurrentSelection();
            return result;
        } else {
            return this.select(object);
        }
    }

    updatePropertyPanelForCurrentSelection() {
        // Update object list selection with current selection
        if (window.updateObjectListSelection) {
            const allSelectedNames = Array.from(this.selectedObjects).map(obj => obj.name);
            window.updateObjectListSelection(allSelectedNames);
        }

        if (this.selectedObjects.size === 0) {
            // No selection - clear property panel
            if (window.clearPropertyPanel) {
                window.clearPropertyPanel();
            }
        } else {
            // Show properties for the most recently selected object
            const lastSelected = Array.from(this.selectedObjects)[this.selectedObjects.size - 1];
            if (window.updatePropertyPanelFromObject) {
                window.updatePropertyPanelFromObject(lastSelected);
            }
        }
    }

    clearSelection(reason = 'normal') {
        const objectsToDeselect = Array.from(this.selectedObjects);


        // Container context handled by NavigationController
        // Selection clearing no longer needs to handle container context directly

        // Deselect all currently selected objects
        objectsToDeselect.forEach(object => {
            // Delegate visual updates to VisualizationManager
            if (this.visualizationManager) {
                this.visualizationManager.setState(object, 'normal');
            }
        });

        this.selectedObjects.clear();
        this.addToHistory('clear', null);

        // Update property panel to show no selection
        if (window.updatePropertyPanelFromObject) {
            window.updatePropertyPanelFromObject(null);
        }

        // Update object list selection to show no selection
        if (window.updateObjectListSelection) {
            window.updateObjectListSelection([]);
        }

        // Notify tools about selection change
        this.notifySelectionChange();

        return objectsToDeselect.length;
    }

    // Container context delegation - REMOVED LEGACY METHODS
    // All container navigation now handled exclusively by NavigationController
    // These methods are no longer needed as SelectionController focuses only on selection state

    isInContainerContext() {
        // Delegate to NavigationController as single source of truth
        const navigationController = window.modlerComponents?.navigationController;
        return navigationController ? navigationController.isInContainerContext() : false;
    }

    getContainerContext() {
        // Delegate to NavigationController as single source of truth
        const navigationController = window.modlerComponents?.navigationController;
        return navigationController ? navigationController.getCurrentContainer()?.mesh : null;
    }

    /**
     * Check if an object is part of a specific container context
     * @param {Object} objectData - Object data from scene controller
     * @param {THREE.Object3D} containerMesh - Container mesh to check against
     * @returns {boolean} Whether object is part of the container
     */
    isObjectPartOfContainer(objectData, containerMesh) {
        if (!objectData || !containerMesh) return false;

        // Check if object is the container itself
        if (objectData.mesh === containerMesh) return true;

        // Check if object is a child of the container
        if (objectData.parentContainer) {
            const sceneController = window.modlerComponents?.sceneController;
            const parentContainer = sceneController?.getObject(objectData.parentContainer);
            if (parentContainer?.mesh === containerMesh) return true;
        }

        // Check if object is a visual component of the container (wireframe, interactive mesh, etc.)
        if (objectData.mesh && objectData.mesh.parent === containerMesh) return true;

        return false;
    }

    updateContainerEdgeHighlight() {
        // REMOVED: Container edge highlighting handled by NavigationController/ContainerVisualizer
        // SelectionController no longer manages container visuals directly
    }

    // Query methods
    isSelected(object) {
        return this.selectedObjects.has(object);
    }

    getSelectedObjects() {
        return Array.from(this.selectedObjects);
    }

    getSelectedCount() {
        return this.selectedObjects.size;
    }

    hasSelection() {
        return this.selectedObjects.size > 0;
    }


    // Selection history
    addToHistory(action, object) {
        const historyEntry = {
            action: action,
            object: object,
            objectName: object ? (object.name || 'unnamed') : null,
            timestamp: Date.now(),
            selectionCount: this.selectedObjects.size
        };

        this.selectionHistory.push(historyEntry);

        // Keep history size manageable
        if (this.selectionHistory.length > this.maxHistorySize) {
            this.selectionHistory.shift();
        }
    }



    // Wireframe synchronization (no longer needed - support meshes are self-contained children)
    updateSelectionWireframe(object) {
        if (!object) return;

        // Support meshes are now children and inherit transforms automatically
        // No manual synchronization needed
    }

    // Selection events
    onSelectionChange(callback) {
        // Simple callback system - could expand to full event system later if needed
        if (typeof callback === 'function') {
            this.selectionChangeCallback = callback;
        }
    }

    notifySelectionChange() {
        const selectedObjects = this.getSelectedObjects();
        // Notify registered callback
        if (this.selectionChangeCallback) {
            this.selectionChangeCallback(selectedObjects);
        }

        // Notify active tool about selection change
        const toolController = window.modlerComponents?.toolController;
        if (toolController) {
            const currentTool = toolController.getActiveTool();
            if (currentTool && currentTool.onSelectionChange) {
                currentTool.onSelectionChange(selectedObjects);
            }
        }
    }

    // Statistics
    getStats() {
        return {
            selectedCount: this.selectedObjects.size,
            historyEntries: this.selectionHistory.length,
            lastAction: this.selectionHistory.length > 0 ? this.selectionHistory[this.selectionHistory.length - 1] : null
        };
    }

    // Cleanup
    destroy() {
        this.clearSelection();
        this.selectionHistory = [];
        this.selectionChangeCallback = null;

        // Clean up dependent components
        if (this.visualizationManager) {
            this.visualizationManager.destroy();
        }
        // containerContextManager removed - managed by NavigationController

    }

    // ====== OBJECT INTERACTION METHODS (moved from BaseSelectionBehavior) ======

    /**
     * Handle clicking on an object - main selection entry point for tools
     * @param {THREE.Object3D} object - Clicked object
     * @param {Event} event - Mouse event
     * @param {Object} options - Tool-specific options
     * @returns {boolean} True if selection was handled
     */
    handleObjectClick(object, event, options = {}) {
        if (!object) {
            return false;
        }

        // Only handle selectable objects
        const isSelectable = this.isSelectableObject(object);
        if (!isSelectable) {
            // Treat non-selectable object clicks as empty space
            this.handleEmptySpaceClick(event);
            return false;
        }

        const sceneController = window.modlerComponents?.sceneController;
        if (!sceneController) return false;

        let objectData = sceneController.getObjectByMesh(object);
        let targetObject = object;

        // INTERACTIVE MESH HANDLING: DISABLED - No longer resolve interactive mesh to container
        // This prevents empty space clicks inside containers from selecting the container
        if (!objectData && object.userData && object.userData.isContainerInteractive) {
            // DISABLED: Legacy logic for old interactive mesh architecture
            // Clicking interactive meshes should NOT select containers
            // const containerId = object.userData.parentContainer;
            // if (containerId) {
            //     const containerData = sceneController.getObject(containerId);
            //     if (containerData?.mesh) {
            //         objectData = containerData;
            //         targetObject = containerData.mesh;
            //     }
            // }
        } else if (objectData && objectData.type === 'container-interactive') {
            // DISABLED: NEW ARCHITECTURE interactive mesh resolution
            // Clicking interactive meshes should NOT select containers
            // const containerMesh = object.userData.containerMesh;
            // if (containerMesh) {
            //     const containerData = sceneController.getObjectByMesh(containerMesh);
            //     if (containerData?.mesh) {
            //         objectData = containerData;
            //         targetObject = containerData.mesh;
            //     }
            // }
        }

        if (!objectData) return false;

        // CONTAINER DIRECT CLICK PREVENTION: Containers can only be selected via their children
        if (objectData.isContainer) {
            // Check if this is a direct click on container (not via child object)
            const isInContainerContext = this.isInContainerContext();
            const currentContainerContext = this.getContainerContext();

            // Allow container clicks only if we're already stepped into that container
            if (!isInContainerContext || currentContainerContext !== objectData.mesh) {
                // Prevent direct container selection - treat as empty space click
                this.handleEmptySpaceClick(event);
                return false;
            }
        }

        // CONTAINER-FIRST SELECTION LOGIC: Clicking a child object selects its parent container
        // CONSISTENT ACROSS ALL TOOLS - Only visual feedback (face highlighting) differs between tools
        if (objectData.parentContainer) {
            const parentContainer = sceneController.getObject(objectData.parentContainer);

            if (parentContainer?.mesh) {
                // Check if we're already stepped into this parent container
                const isInContainerContext = this.isInContainerContext();
                const currentContainerContext = this.getContainerContext();

                if (isInContainerContext && currentContainerContext === parentContainer.mesh) {
                    // Already in this container's context - allow direct selection of child
                    // ALWAYS track child object clicks for double-click detection
                    this.lastClickedChildObject = object;
                    this.lastClickTime = Date.now();
                    // Don't change targetObject, let the child be selected directly
                } else {
                    // CONTAINER-FIRST: Clicking child object selects parent container
                    this.lastClickedChildObject = object;
                    this.lastClickTime = Date.now();
                    // Change target to parent container
                    targetObject = parentContainer.mesh;
                    objectData = parentContainer;
                }
            }
        } else if (objectData.parentContainer && isFaceBasedTool) {
            // For face-based tools, always track clicks but don't change selection target
            this.lastClickedChildObject = object;
            this.lastClickTime = Date.now();
            // targetObject remains the original clicked object for face manipulation
        } else {
            // Only clear child tracking for non-container objects (preserve tracking for containers)
            if (!objectData.isContainer) {
                this.lastClickedChildObject = null;
            } else {
                // Update lastClickTime for container clicks to enable proper double-click timing
                this.lastClickTime = Date.now();
            }
        }

        const isMultiSelect = event.ctrlKey || event.metaKey || event.shiftKey;

        if (isMultiSelect) {
            this.toggle(targetObject);
        } else {
            this.clearSelection('object-selection');
            this.select(targetObject);
        }

        return true;
    }

    /**
     * Handle double-click events - step into container functionality
     * @param {Object} hit - Raycast hit result
     * @param {Event} _event - Mouse event
     * @returns {boolean} True if double-click was handled
     */
    handleDoubleClick(hit, event) {
        const navigationController = window.modlerComponents?.navigationController;
        if (navigationController) {
            // Use NavigationController for unified double-click handling
            return navigationController.handleDoubleClick(hit?.object, event);
        }

        // Fallback for cases where NavigationController is not available
        if (!hit || !hit.object) {
            return false;
        }

        const sceneController = window.modlerComponents?.sceneController;
        if (!sceneController) {
            console.error('SelectionController: SceneController not available for double-click handling');
            return false;
        }

        let objectData = sceneController.getObjectByMesh(hit.object);
        let targetObject = hit.object;

        // INTERACTIVE MESH HANDLING: DISABLED - Apply same fix as handleObjectClick
        // This prevents double-clicks on interactive meshes from selecting containers
        if (!objectData && hit.object.userData && hit.object.userData.isContainerInteractive) {
            // DISABLED: Legacy logic for old interactive mesh architecture
            // Double-clicking interactive meshes should NOT select containers
            // const containerId = hit.object.userData.parentContainer;
            // if (containerId) {
            //     const containerData = sceneController.getObject(containerId);
            //     if (containerData?.mesh) {
            //         objectData = containerData;
            //         targetObject = containerData.mesh;
            //     }
            // }
        } else if (objectData && objectData.type === 'container-interactive') {
            // DISABLED: NEW ARCHITECTURE interactive mesh resolution
            // Double-clicking interactive meshes should NOT select containers
            // const containerMesh = hit.object.userData.containerMesh;
            // if (containerMesh) {
            //     const containerData = sceneController.getObjectByMesh(containerMesh);
            //     if (containerData?.mesh) {
            //         objectData = containerData;
            //         targetObject = containerData.mesh;
            //     }
            // }
        }

        if (!objectData) {
            return false;
        }

        // Check if we're double-clicking on an object inside a container
        if (objectData.parentContainer) {
            const parentContainer = sceneController.getObject(objectData.parentContainer);
            if (parentContainer?.mesh) {
                // STRICT HIERARCHY CHECK: Only step into containers that are direct children of current level
                const isDirectChild = this.isDirectChildOfCurrentContainer(parentContainer);

                if (!isDirectChild) {
                    // Container is not a direct child of current level - just select the object
                    this.clearSelection('double-click-selection');
                    this.select(hit.object);
                    return true;
                }

                // Container is valid for step-in - delegate to NavigationController
                const navigationController = window.modlerComponents?.navigationController;
                if (navigationController) {
                    navigationController.navigateToContainer(parentContainer.id);
                    // NavigationController handles selection, no need to manually select
                } else {
                    console.warn('NavigationController unavailable for container step-in');
                    this.clearSelection('step-into-container');
                    this.select(hit.object);
                }
                return true;
            }
        } else if (objectData.isContainer) {
            // STRICT HIERARCHY CHECK: Only step into containers that are direct children of current level
            const isDirectChild = this.isDirectChildOfCurrentContainer(objectData);

            if (!isDirectChild) {
                // Container is not a direct child of current level - just select the container
                this.clearSelection('double-click-selection');
                this.select(targetObject);
                return true;
            }

            // Container is valid for step-in - check for recent child click timing
            const timeSinceLastClick = Date.now() - this.lastClickTime;

            if (this.lastClickedChildObject && timeSinceLastClick < 1000) {
                // Recent child object click - delegate to NavigationController
                const navigationController = window.modlerComponents?.navigationController;
                const sceneController = window.modlerComponents?.sceneController;
                if (navigationController && sceneController) {
                    const childObjectData = sceneController.getObjectByMesh(this.lastClickedChildObject);
                    if (childObjectData) {
                        navigationController.navigateToObject(childObjectData.id);
                        // NavigationController handles both container entry and child selection
                    }
                } else {
                    console.warn('NavigationController unavailable for child object navigation');
                    this.clearSelection('step-into-container');
                    this.select(this.lastClickedChildObject);
                }
                // Clear tracking
                this.lastClickedChildObject = null;
                return true;
            } else {
                // Direct double-click on container itself OR expired child timing - delegate to NavigationController
                const navigationController = window.modlerComponents?.navigationController;
                if (navigationController) {
                    navigationController.navigateToContainer(objectData.id);
                    // NavigationController handles container entry and visual state
                } else {
                    console.warn('NavigationController unavailable for container navigation');
                    this.clearSelection('step-into-container');
                    this.select(targetObject);
                }
                // Clear any stale child tracking
                this.lastClickedChildObject = null;
                return true;
            }
        } else {
            // Double-click on non-container object - direct selection
            this.clearSelection('double-click-selection');
            this.select(targetObject);
            return true;
        }

        return false;
    }

    /**
     * Handle clicking on empty space or non-selectable objects
     * @param {Event} event - Mouse event
     */
    handleEmptySpaceClick(event) {
        const navigationController = window.modlerComponents?.navigationController;
        if (navigationController) {
            // Use NavigationController for unified empty space handling
            navigationController.handleEmptySpaceClick(event);
        } else {
            // Fallback to basic selection clearing
            const isMultiSelect = event.ctrlKey || event.metaKey;
            if (!isMultiSelect) {
                this.clearSelection('empty-space');
            }
        }
    }


    /**
     * Check if an object is a DIRECT child of the current container context
     * Enforces strict hierarchy: only allows stepping one level down
     * @param {Object} objectData - Object data from scene controller
     * @returns {boolean} True if object is a direct child of current container context
     */
    isDirectChildOfCurrentContainer(objectData) {
        if (!objectData) return false;

        const isInContainerContext = this.isInContainerContext();
        const currentContainerContext = this.getContainerContext();

        // If we're not in any container context, all top-level objects/containers are valid
        if (!isInContainerContext) {
            return !objectData.parentContainer; // Top-level objects (no parent)
        }

        // If we're in a container context, only direct children are valid
        if (currentContainerContext) {
            const sceneController = window.modlerComponents?.sceneController;
            const currentContainerData = sceneController?.getObjectByMesh(currentContainerContext);

            if (currentContainerData) {
                // Check if the object's parent is exactly the current container
                return objectData.parentContainer === currentContainerData.id;
            }
        }

        return false;
    }

    /**
     * Check if object is selectable using SceneController data
     * @param {THREE.Object3D} object - Object to check
     * @returns {boolean} True if object is selectable
     */
    isSelectableObject(object) {
        const sceneController = window.modlerComponents?.sceneController;
        if (!sceneController) {
            return false; // Fallback: no selection if SceneController unavailable
        }

        const objectData = sceneController.getObjectByMesh(object);

        // CONTAINER SELECTION: Allow containers to be selectable
        // Containers need to be selectable for face highlighting and tool operations
        if (objectData && objectData.isContainer) {
            return objectData.selectable === true;
        }

        if (!objectData) {
            // INTERACTIVE MESH HANDLING: Check if this is a container interactive mesh (legacy)
            if (object.userData && object.userData.isContainerInteractive) {
                const containerId = object.userData.parentContainer;
                if (containerId) {
                    const containerData = sceneController.getObject(containerId);
                    // Interactive mesh is selectable if its container is selectable
                    return containerData && containerData.selectable === true;
                }
            }

            // Check if a parent object is managed by SceneController
            let currentObject = object.parent;
            let depth = 0;
            while (currentObject && depth < 5) {
                const parentData = sceneController.getObjectByMesh(currentObject);
                if (parentData) {
                    // Use parent's selectability
                    return parentData.selectable === true;
                }

                currentObject = currentObject.parent;
                depth++;
            }

            return false; // Object not managed by SceneController
        }

        // Use the object's selectable property from SceneController
        return objectData.selectable === true;
    }
}

// Export for use in main application
window.SelectionController = SelectionController;