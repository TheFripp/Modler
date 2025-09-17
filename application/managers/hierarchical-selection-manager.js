// Modler V2 - Hierarchical Selection Manager
// Manages container-first selection and drill-down navigation
// Implements proper hierarchical selection behavior for container systems

class HierarchicalSelectionManager {
    constructor(selectionController) {
        this.selectionController = selectionController;
        
        // Selection mode: 'container-first' (default) or 'drill-down' (direct child selection)
        this.mode = 'container-first';
        
        // Navigation state for drill-down mode
        this.drillDownPath = []; // Stack of containers we've drilled into
        this.activeContainer = null; // Current container in drill-down mode
        
        // HierarchicalSelectionManager initialized in container-first mode
    }
    
    /**
     * Main selection handler - replaces direct SelectionController calls
     * Implements hierarchical selection logic based on current mode
     * @param {THREE.Object3D} object - Clicked object
     * @param {Event} event - Mouse event
     * @returns {boolean} True if selection was handled
     */
    handleObjectSelection(object, event) {
        if (!object) return false;
        
        // Note: Selecting object in current mode
        
        if (this.mode === 'container-first') {
            return this.handleContainerFirstSelection(object, event);
        } else if (this.mode === 'drill-down') {
            return this.handleDrillDownSelection(object, event);
        }
        
        return false;
    }
    
    /**
     * Handle selection in container-first mode
     * Child clicks select their parent containers
     * @param {THREE.Object3D} object - Clicked object
     * @param {Event} event - Mouse event
     * @returns {boolean} True if selection was handled
     */
    handleContainerFirstSelection(object, event) {
        const sceneController = window.modlerComponents?.sceneController;
        if (!sceneController) return false;
        
        // Get object data to check for parent container
        const objectData = sceneController.getObjectByMesh(object);
        if (!objectData || !objectData.selectable) {
            return false;
        }
        
        // Check if object has a parent container (including temporary scene children)
        let parentContainer = null;
        
        // First check if object is temporarily moved to scene root
        if (object.userData.temporarySceneChild && object.userData.originalParentContainerId) {
            parentContainer = sceneController.getObject(object.userData.originalParentContainerId);
        } else if (objectData.parentContainer) {
            parentContainer = sceneController.getObject(objectData.parentContainer);
        }
        
        // Debug: Track container-first selection logic
        console.log(`🎯 CONTAINER-FIRST SELECTION:`, {
            clickedObject: objectData.name,
            hasParentContainer: !!parentContainer,
            parentContainerName: parentContainer?.name,
            temporarySceneChild: !!object.userData.temporarySceneChild,
            originalParentContainerId: object.userData.originalParentContainerId,
            metadataParentContainer: objectData.parentContainer
        });
        
        // Determine selection target - always prefer parent container over child
        // This allows reselecting hidden containers by clicking their children
        let targetObject = object;
        if (parentContainer && parentContainer.mesh) {
            targetObject = parentContainer.mesh;
            console.log(`📦 SELECTING PARENT CONTAINER: ${parentContainer.name} instead of child ${objectData.name}`);
            // SelectionController.showContainerWireframe will handle making hidden containers visible again
        } else {
            console.log(`🎯 SELECTING DIRECT OBJECT: ${objectData.name} (no parent container)`);
        }
        
        // Apply selection
        const isMultiSelect = event.ctrlKey || event.metaKey || event.shiftKey;
        
        if (isMultiSelect) {
            this.selectionController.toggle(targetObject);
        } else {
            this.selectionController.clearSelection('hierarchical-selection');
            this.selectionController.select(targetObject);
        }
        
        return true;
    }
    
    /**
     * Handle selection in drill-down mode
     * Direct child selection within active container
     * @param {THREE.Object3D} object - Clicked object  
     * @param {Event} event - Mouse event
     * @returns {boolean} True if selection was handled
     */
    handleDrillDownSelection(object, event) {
        const sceneController = window.modlerComponents?.sceneController;
        if (!sceneController) return false;
        
        const objectData = sceneController.getObjectByMesh(object);
        if (!objectData || !objectData.selectable) {
            return false;
        }
        
        // In drill-down mode, check if clicked object belongs to active container
        if (this.activeContainer) {
            const belongsToActiveContainer = this.isObjectInContainer(objectData, this.activeContainer);
            
            if (!belongsToActiveContainer) {
                return false; // Object not in active container
            }
        }
        
        // Apply direct selection
        const isMultiSelect = event.ctrlKey || event.metaKey || event.shiftKey;
        
        if (isMultiSelect) {
            this.selectionController.toggle(object);
        } else {
            this.selectionController.clearSelection('drill-down-selection');
            this.selectionController.select(object);
        }
        
        return true;
    }
    
    /**
     * Handle double-click events for drill-down navigation
     * @param {THREE.Object3D} object - Double-clicked object
     * @param {Event} event - Mouse event
     * @returns {boolean} True if double-click was handled
     */
    handleDoubleClick(object, event) {
        if (!object) {
            // Double-click on empty space - exit drill-down mode
            if (this.mode === 'drill-down') {
                this.exitDrillDown();
                return true;
            }
            return false;
        }
        
        const sceneController = window.modlerComponents?.sceneController;
        if (!sceneController) return false;
        
        const objectData = sceneController.getObjectByMesh(object);
        if (!objectData) return false;
        
        if (objectData.isContainer) {
            // Double-click on container - enter drill-down mode
            this.enterDrillDown(objectData);
            return true;
        } else if (this.mode === 'drill-down') {
            // Double-click on child in drill-down mode - navigate deeper if child is also a container
            const childContainers = sceneController.getChildObjects(objectData.id).filter(child => child.isContainer);
            if (childContainers.length > 0) {
                this.enterDrillDown(objectData);
                return true;
            }
        }
        
        return false;
    }
    
    /**
     * Enter drill-down mode for a specific container
     * @param {Object} containerData - Container to drill into
     */
    enterDrillDown(containerData) {
        // Add current container to navigation path
        if (this.activeContainer) {
            this.drillDownPath.push(this.activeContainer);
        }
        
        this.mode = 'drill-down';
        this.activeContainer = containerData;
        
        // Select the container to show it and move children back
        this.selectionController.clearSelection('drill-down-enter');
        this.selectionController.select(containerData.mesh);
        
        // Show visual feedback for drill-down mode
        this.showDrillDownFeedback();
        
        // Entered drill-down mode for container
    }
    
    /**
     * Exit drill-down mode - return to container-first mode
     */
    exitDrillDown() {
        const previousContainer = this.activeContainer;
        
        if (this.drillDownPath.length > 0) {
            // Navigate back to parent container
            this.activeContainer = this.drillDownPath.pop();
        } else {
            // Exit drill-down completely
            this.mode = 'container-first';
            this.activeContainer = null;
        }
        
        // Show visual feedback for mode change
        this.showModeFeedback();
        
        // Mode transition complete
    }
    
    /**
     * Navigate up one level in the drill-down hierarchy
     */
    navigateUp() {
        if (this.mode === 'drill-down' && (this.drillDownPath.length > 0 || this.activeContainer)) {
            this.exitDrillDown();
        }
    }
    
    /**
     * Check if an object belongs to a container (directly or through hierarchy)
     * @param {Object} objectData - Object to check
     * @param {Object} containerData - Container to check against
     * @returns {boolean} True if object belongs to container
     */
    isObjectInContainer(objectData, containerData) {
        if (!objectData || !containerData) return false;
        
        // Direct parent relationship
        if (objectData.parentContainer === containerData.id) {
            return true;
        }
        
        // Check temporary scene child relationship
        if (objectData.mesh && objectData.mesh.userData.originalParentContainerId === containerData.id) {
            return true;
        }
        
        return false;
    }
    
    /**
     * Show visual feedback for drill-down mode
     */
    showDrillDownFeedback() {
        const info = document.querySelector('#info');
        if (info && this.activeContainer) {
            const sceneController = window.modlerComponents?.sceneController;
            const childCount = sceneController ? sceneController.getChildObjects(this.activeContainer.id).length : 0;
            
            info.style.backgroundColor = 'rgba(100,200,255,0.3)';
            info.innerHTML = `
                <strong>🔍 DRILL-DOWN MODE</strong><br>
                Active Container: ${this.activeContainer.name}<br>
                Children: ${childCount} | Depth: ${this.drillDownPath.length + 1}<br>
                Double-click empty space to exit | Esc to navigate up
            `;
        }
    }
    
    /**
     * Show visual feedback for current mode
     */
    showModeFeedback() {
        const info = document.querySelector('#info');
        if (info) {
            if (this.mode === 'container-first') {
                info.style.backgroundColor = 'rgba(0,150,255,0.3)';
                info.innerHTML = `
                    <strong>🏗️ CONTAINER-FIRST MODE</strong><br>
                    Click child objects → selects parent container<br>
                    Double-click container → enter drill-down mode<br>
                    Tools: 1=select, 2=move, 3=layout
                `;
            } else {
                this.showDrillDownFeedback();
            }
        }
    }
    
    /**
     * Handle keyboard shortcuts for navigation
     * @param {KeyboardEvent} event - Keyboard event
     * @returns {boolean} True if key was handled
     */
    handleKeyDown(event) {
        switch (event.code) {
            case 'Escape':
                if (this.mode === 'drill-down') {
                    this.navigateUp();
                    return true;
                }
                break;
        }
        
        return false;
    }
    
    /**
     * Get current selection mode and state
     * @returns {Object} Current state information
     */
    getState() {
        return {
            mode: this.mode,
            activeContainer: this.activeContainer ? {
                id: this.activeContainer.id,
                name: this.activeContainer.name
            } : null,
            navigationDepth: this.drillDownPath.length,
            drillDownPath: this.drillDownPath.map(container => ({
                id: container.id,
                name: container.name
            }))
        };
    }
    
    /**
     * Reset to container-first mode (for tool switching)
     */
    reset() {
        this.mode = 'container-first';
        this.activeContainer = null;
        this.drillDownPath = [];
        // Reset to container-first mode
    }
}

// Export for use in main application
window.HierarchicalSelectionManager = HierarchicalSelectionManager;