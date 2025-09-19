// Modler V2 - Shared Selection Behavior
// Universal selection logic shared across all tools
// Ensures consistent hierarchical container selection behavior

class BaseSelectionBehavior {
    constructor(selectionController) {
        this.selectionController = selectionController;
        // Track the last clicked child object for proper double-click handling
        this.lastClickedChildObject = null;
        this.lastClickTime = 0;
    }
    
    /**
     * Handle clicking on an object - simple container-first logic
     * @param {THREE.Object3D} object - Clicked object
     * @param {Event} event - Mouse event
     * @returns {boolean} True if selection was handled
     */
    handleObjectClick(object, event) {

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

        // INTERACTIVE MESH HANDLING: Resolve interactive mesh to container
        if (!objectData && object.userData && object.userData.isContainerInteractive) {
            // Legacy logic for old interactive mesh architecture
            const containerId = object.userData.parentContainer;
            if (containerId) {
                const containerData = sceneController.getObject(containerId);
                if (containerData?.mesh) {
                    objectData = containerData;
                    targetObject = containerData.mesh;
                }
            }
        } else if (objectData && objectData.type === 'container-interactive') {
            // NEW ARCHITECTURE: Interactive mesh is registered separately
            // Resolve to the associated container mesh
            const containerMesh = object.userData.containerMesh;
            if (containerMesh) {
                const containerData = sceneController.getObjectByMesh(containerMesh);
                if (containerData?.mesh) {
                    objectData = containerData;
                    targetObject = containerData.mesh;
                }
            }
        }

        if (!objectData) return false;

        // ENHANCED CONTAINER LOGIC: Support direct selection within container context
        // (targetObject already set above for interactive meshes, or use object as fallback)

        // Check if we're in container context (stepped into a container)
        const isInContainerContext = this.selectionController.isInContainerContext();
        const currentContainerContext = this.selectionController.getContainerContext();


        if (objectData.parentContainer) {
            const parentContainer = sceneController.getObject(objectData.parentContainer);

            if (parentContainer?.mesh) {
                // ALWAYS track child object clicks for double-click detection
                this.lastClickedChildObject = object;
                this.lastClickTime = Date.now();

                // If we're inside the same container as the clicked object, select the object directly
                if (isInContainerContext && currentContainerContext === parentContainer.mesh) {
                    targetObject = object; // Select the child object directly
                } else {
                    // Regular container-first logic for objects outside current container context
                    targetObject = parentContainer.mesh; // Select the parent container
                }
            }
        } else {
            // Only clear child tracking for non-container objects (preserve tracking for containers)
            if (!objectData.isContainer) {
                this.lastClickedChildObject = null;
            } else {
                // Update lastClickTime for container clicks to enable proper double-click timing
                this.lastClickTime = Date.now();
            }
        }
        
        // Apply selection with modifier key support
        // Check if clicking outside current container objects
        if (isInContainerContext && currentContainerContext) {
            // Check if clicked object is part of current container context
            const clickedObjectData = sceneController.getObjectByMesh(targetObject);
            const isPartOfCurrentContainer = this.isObjectPartOfContainer(clickedObjectData, currentContainerContext);

            if (!isPartOfCurrentContainer) {
                this.selectionController.stepOutOfContainer();
            }
        }

        const isMultiSelect = event.ctrlKey || event.metaKey || event.shiftKey;

        if (isMultiSelect) {
            this.selectionController.toggle(targetObject);
        } else {
            this.selectionController.clearSelection('object-selection');
            this.selectionController.select(targetObject);
        }
        
        return true;
    }
    
    /**
     * Handle double-click events - step into container functionality
     * @param {Object} hit - Raycast hit result
     * @param {Event} event - Mouse event
     * @returns {boolean} True if double-click was handled
     */
    handleDoubleClick(hit, event) {
        if (!hit || !hit.object) {
            return false;
        }

        const sceneController = window.modlerComponents?.sceneController;
        if (!sceneController) {
            console.error('BaseSelectionBehavior: SceneController not available for double-click handling');
            return false;
        }

        let objectData = sceneController.getObjectByMesh(hit.object);
        let targetObject = hit.object;

        // INTERACTIVE MESH HANDLING: Apply same resolution logic as handleObjectClick
        if (!objectData && hit.object.userData && hit.object.userData.isContainerInteractive) {
            // Legacy logic for old interactive mesh architecture
            const containerId = hit.object.userData.parentContainer;
            if (containerId) {
                const containerData = sceneController.getObject(containerId);
                if (containerData?.mesh) {
                    objectData = containerData;
                    targetObject = containerData.mesh;
                }
            }
        } else if (objectData && objectData.type === 'container-interactive') {
            // NEW ARCHITECTURE: Interactive mesh is registered separately
            // Resolve to the associated container mesh
            const containerMesh = hit.object.userData.containerMesh;
            if (containerMesh) {
                const containerData = sceneController.getObjectByMesh(containerMesh);
                if (containerData?.mesh) {
                    objectData = containerData;
                    targetObject = containerData.mesh;
                }
            }
        }

        if (!objectData) {
            return false;
        }

        // Check if we're double-clicking on an object inside a container
        if (objectData.parentContainer) {
            const parentContainer = sceneController.getObject(objectData.parentContainer);
            if (parentContainer?.mesh) {
                // Step into the container and select the child object
                this.selectionController.stepIntoContainer(parentContainer.mesh);
                this.selectionController.clearSelection('step-into-container');
                this.selectionController.select(hit.object);
                return true;
            }
        } else if (objectData.isContainer) {
            // Check if this double-click on container was from clicking a child object recently
            const timeSinceLastClick = Date.now() - this.lastClickTime;

            if (this.lastClickedChildObject && timeSinceLastClick < 1000) {
                // Recent child object click - step into container and select the originally clicked child
                this.selectionController.stepIntoContainer(targetObject);
                this.selectionController.clearSelection('step-into-container');
                this.selectionController.select(this.lastClickedChildObject);
                // Clear tracking
                this.lastClickedChildObject = null;
                return true;
            } else {
                // Direct double-click on container itself OR expired child timing - step into container
                this.selectionController.stepIntoContainer(targetObject);
                this.selectionController.clearSelection('step-into-container');
                // Select the container so tools can show face highlights
                this.selectionController.select(targetObject);
                // Clear any stale child tracking
                this.lastClickedChildObject = null;
                return true;
            }
        } else {
            // Double-click on non-container object - direct selection
            this.selectionController.clearSelection('double-click-selection');
            this.selectionController.select(targetObject);
            return true;
        }

        return false;
    }
    
    /**
     * Handle clicking on empty space or non-selectable objects
     * @param {Event} event - Mouse event
     */
    handleEmptySpaceClick(event) {
        const isMultiSelect = event.ctrlKey || event.metaKey;

        if (!isMultiSelect) {
            // Step out of container when clicking empty space
            if (this.selectionController.isInContainerContext()) {
                this.selectionController.stepOutOfContainer();
            }

            // Clear selection when clicking empty space (unless multi-select modifier is held)
            this.selectionController.clearSelection('empty-space');
        }
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

// Export for use in tools
window.BaseSelectionBehavior = BaseSelectionBehavior;