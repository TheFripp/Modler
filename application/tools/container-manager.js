// Modler V2 - Layout Tool Container Management
// Container creation, configuration, and lifecycle management
// Target: ~200 lines - focused container operations

class ContainerManager {
    constructor() {
        // ContainerManager initialized
    }
    
    /**
     * Create auto layout container from selected objects
     * @param {Array} selectedObjects - Array of selected mesh objects
     * @returns {boolean} True if container was successfully created
     */
    createContainerFromSelection(selectedObjects) {
        const sceneController = window.modlerComponents?.sceneController;
        if (!sceneController || !selectedObjects || selectedObjects.length === 0) {
            return false;
        }
        
        // CRITICAL FIX: Calculate bounds and position container correctly from the start
        // This prevents objects from moving when the container is repositioned later
        const bounds = LayoutGeometry.calculateSelectionBounds(selectedObjects);
        
        // Create container with clean edge visualization
        const containerData = LayoutGeometry.createContainerGeometry(bounds.size);
        const edgeContainer = containerData.mesh;
        
        // CRITICAL FIX: Position container at the bounds center from the start
        // This ensures objects don't move when we later call resizeContainerToFitChildren
        const containerObject = sceneController.addObject(edgeContainer, null, {
            name: sceneController.generateContainerName(),
            type: 'container',
            position: bounds.center.clone(), // Position at bounds center from the start
            isContainer: true,
            selectable: true
        });
        
        console.log('📦 CREATED PARENT CONTAINER:', {
            name: containerObject.name,
            id: containerObject.id,
            position: bounds.center.clone(),
            boundsSize: bounds.size.clone(),
            selectedObjectsCount: selectedObjects.length
        });
        
        if (!containerObject) {
            console.error('Failed to create container object');
            return false;
        }
        
        // Register container with unified ContainerManager (new architecture)
        const unifiedContainerManager = window.modlerComponents?.unifiedContainerManager;
        if (unifiedContainerManager) {
            unifiedContainerManager.registerContainer(containerObject);
        }

        // DEPRECATED: Keep old manager registrations for backward compatibility during transition
        // LEGACY MANAGER REMOVED: containerVisibilityManager registration disabled
        // Only UnifiedContainerManager handles visibility now

        // LEGACY MANAGER REMOVED: containerSupportManager registration disabled
        // Only UnifiedContainerManager handles container support now
        
        // ARCHITECTURAL FIX: Use centralized PositionTransform utility for coordinate space handling
        // This eliminates coordinate space confusion and ensures proper position preservation
        
        // Move all selected objects to container using proper coordinate transformations
        const objectsToMove = [];
        selectedObjects.forEach(obj => {
            const objectData = sceneController.getObjectByMesh(obj);
            if (objectData) {
                objectsToMove.push(obj);
            }
        });
        
        // Use centralized position preservation system
        const success = PositionTransform.preserveWorldPositions(objectsToMove, containerObject.mesh);
        if (!success) {
            console.error('Failed to preserve world positions during container creation');
            return false;
        }
        
        // Set metadata relationships after successful position preservation
        selectedObjects.forEach(obj => {
            const objectData = sceneController.getObjectByMesh(obj);
            if (objectData) {
                if (!objectData.isContainer) {
                    // Regular object: set parent relationship
                    sceneController.setParentContainer(objectData.id, containerObject.id, false);
                    
                    // LEGACY MANAGER REMOVED: visibilityManager.registerChildObject() disabled
                    // UnifiedContainerManager handles child object visibility now
                } else {
                    // Container object: only set its parent, don't affect its children
                    objectData.parentContainer = containerObject.id;
                    
                    // Keep child container wireframes visible when they have a parent
                    if (obj.visible === false) {
                        obj.visible = true;
                    }
                }
            }
        });
        
        // Container created and positioned successfully
        
        // CRITICAL FIX: Only resize geometry, don't reposition container during creation
        // Container is already positioned correctly at bounds.center
        this.resizeContainerGeometry(containerObject, bounds.size);
        
        // Select the newly created container
        // CRITICAL FIX: Avoid triggering container hide operations during container creation
        // by directly updating selection state without visual updates for old containers
        const selectionController = window.modlerComponents?.selectionController;
        if (selectionController && containerObject.mesh) {
            console.log('🎯 SELECTING NEW PARENT CONTAINER:', {
                containerName: containerObject.name,
                containerPosition: containerObject.mesh.position.clone(),
                containerVisible: containerObject.mesh.visible,
                hasChildren: containerObject.mesh.children.length
            });
            // CRITICAL FIX: Clean up edge highlights from individual objects before container selection
            // Store currently selected objects to clean up their visual state
            const objectsToDeselect = Array.from(selectionController.selectedObjects);
            
            // Remove edge highlights from individual objects (they're now represented by container)
            const selectionVisualizer = window.modlerComponents?.selectionVisualizer;
            objectsToDeselect.forEach(object => {
                if (selectionVisualizer) {
                    selectionVisualizer.removeEdgeHighlight(object);
                }
            });
            
            // Clear selection set (no visual updates needed since we handled them above)
            selectionController.selectedObjects.clear();
            
            // Clear property panel and object list
            if (window.clearPropertyPanel) {
                window.clearPropertyPanel();
            }
            if (window.updateObjectListSelection) {
                window.updateObjectListSelection([]);
            }
            
            // Select the new container normally (will show its wireframe)
            selectionController.select(containerObject.mesh);
        }
        
        // Update object list to show new hierarchy AFTER selection is updated
        // Use setTimeout to ensure selection state is fully propagated
        if (window.populateObjectList) {
            setTimeout(() => {
                window.populateObjectList();
                
                // Ensure object list selection highlighting updates after population
                if (window.updateObjectListSelection && containerObject.mesh.name) {
                    setTimeout(() => {
                        window.updateObjectListSelection([containerObject.mesh.name]);
                    }, 5);
                }
            }, 10);
        }
        
        return containerObject;
    }
    
    /**
     * Create new empty container at specific position
     * @param {THREE.Vector3} position - Container position
     * @returns {Object|null} Created container object or null if failed
     */
    createEmptyContainer(position = new THREE.Vector3(0, 0, 0)) {
        const sceneController = window.modlerComponents?.sceneController;
        if (!sceneController) return null;
        
        const size = new THREE.Vector3(0.5, 0.5, 0.5);
        const containerData = LayoutGeometry.createContainerGeometry(size);
        const edgeContainer = containerData.mesh;
        
        const containerObject = sceneController.addObject(edgeContainer, null, {
            name: sceneController.generateContainerName(),
            type: 'container',
            position,
            isContainer: true,
            selectable: true
        });

        // Register container with unified ContainerManager (new architecture)
        const unifiedContainerManager = window.modlerComponents?.unifiedContainerManager;
        if (unifiedContainerManager && containerObject) {
            unifiedContainerManager.registerContainer(containerObject);
        }

        // LEGACY MANAGERS REMOVED: Only UnifiedContainerManager handles containers now
        // Legacy containerSupportManager registration removed to prevent conflicts

        return containerObject;
    }
    
    /**
     * Toggle container state for an object
     * @param {Object} objectData - Object data from SceneController
     * @returns {boolean} New container state
     */
    toggleContainerState(objectData) {
        const sceneController = window.modlerComponents?.sceneController;
        if (!sceneController) return false;
        
        if (objectData.isContainer) {
            // Disable container and auto layout
            objectData.isContainer = false;
            if (objectData.autoLayout) {
                sceneController.disableAutoLayout(objectData.id);
            }
            // Container removed
            return false;
        } else {
            // Enable container
            objectData.isContainer = true;
            // Object converted to container
            return true;
        }
    }
    
    /**
     * Add object to container
     * @param {Object} objectData - Object to add
     * @param {Object} containerData - Target container
     * @returns {boolean} Success status
     */
    addObjectToContainer(objectData, containerData) {
        const sceneController = window.modlerComponents?.sceneController;
        if (!sceneController) return false;
        
        const obj = objectData.mesh;
        const containerMesh = containerData.mesh;
        
        if (!obj || !containerMesh) {
            console.error('Missing mesh objects for container addition');
            return false;
        }
        
        // ARCHITECTURAL FIX: Use centralized PositionTransform for coordinate handling
        // Eliminates matrix calculation errors and coordinate space confusion
        if (!PositionTransform.preserveWorldPosition(obj, containerMesh)) {
            console.error('Failed to preserve world position during container addition');
            return false;
        }
        
        // Setting parent-child relationship
        
        // Set metadata parent relationship (don't trigger layout update yet)
        sceneController.setParentContainer(objectData.id, containerData.id, false);
        
        // LEGACY MANAGER REMOVED: containerVisibilityManager.registerChildObject() disabled
        // UnifiedContainerManager handles child object registration now
        
        // Object added to container successfully
        
        // Resize container to fit all children (including newly added one)
        this.resizeContainerToFitChildren(containerData);
        
        // Update related meshes for moved object through MeshSynchronizer
        const meshSynchronizer = window.modlerComponents?.meshSynchronizer;
        if (meshSynchronizer) {
            meshSynchronizer.syncAllRelatedMeshes(obj, 'transform');
        }
        
        // Update object list to reflect new hierarchy
        if (window.populateObjectList) {
            setTimeout(() => {
                window.populateObjectList();
            }, 10);
        }
        
        return true;
    }
    
    /**
     * Remove object from container
     * @param {Object} objectData - Object to remove from container
     * @returns {boolean} Success status
     */
    removeObjectFromContainer(objectData) {
        const sceneController = window.modlerComponents?.sceneController;
        if (!sceneController || !objectData.parentContainer) return false;
        
        const parentContainer = sceneController.getObject(objectData.parentContainer);
        const obj = objectData.mesh;
        
        // Validate hierarchy consistency
        if (obj && parentContainer && obj.parent !== parentContainer.mesh) {
            console.error(`Hierarchy inconsistency: ${objectData.name} metadata vs Three.js parent mismatch`);
        }
        
        if (obj && obj.parent && parentContainer) {
            // ARCHITECTURAL FIX: Use centralized PositionTransform for coordinate handling
            // Move object back to scene while preserving world position
            if (!PositionTransform.preserveWorldPosition(obj, sceneController.scene)) {
                console.error('Failed to preserve world position during container removal');
                return false;
            }
        }
        
        // Remove metadata parent relationship
        sceneController.setParentContainer(objectData.id, null);
        // Parent container metadata cleared
        
        // Resize parent container if it still exists
        if (parentContainer) {
            this.resizeContainerToFitChildren(parentContainer);
        }
        
        return true;
    }
    
    /**
     * Update container bounds based on current child positions (used during real-time dragging)
     * @param {string} containerId - Container ID to update
     * @returns {boolean} Success status
     */
    updateContainerBounds(containerId) {
        const sceneController = window.modlerComponents?.sceneController;
        if (!sceneController || !containerId) {
            return false;
        }
        
        const containerData = sceneController.getObject(containerId);
        if (!containerData || !containerData.isContainer) {
            return false;
        }
        
        // Use the simplified resize method for real-time updates
        return this.resizeContainerToFitChildren(containerData);
    }
    
    /**
     * Resize container to fit its child objects with fill-aware layout support
     * ARCHITECTURAL FIX: Simplified single-path logic eliminates coordinate space confusion
     * Enhanced for push tool integration with dynamic fill object resizing
     * @param {Object} containerData - Container object data from SceneController
     * @param {THREE.Vector3} newContainerSize - Optional new container size for fill calculations
     * @param {boolean} preservePosition - If true, keep container position and only resize (for layout changes)
     * @returns {boolean} Success status
     */
    resizeContainerToFitChildren(containerData, newContainerSize = null, preservePosition = false) {
        const sceneController = window.modlerComponents?.sceneController;
        if (!sceneController || !containerData || !containerData.isContainer) {
            return false;
        }

        // Get all child objects
        const childObjects = sceneController.getChildObjects(containerData.id);
        if (childObjects.length === 0) {
            return false;
        }

        // Check if container has layout enabled with fill objects
        const hasLayoutWithFill = this.checkContainerHasLayoutWithFill(containerData, childObjects);

        if (hasLayoutWithFill && newContainerSize) {
            // Apply fill object resizing before calculating bounds
            this.resizeFillObjectsForNewContainerSize(containerData, childObjects, newContainerSize);
        }

        // Get child meshes for bounds calculation
        const childMeshes = childObjects
            .map(child => {
                if (child.isContainer && child.mesh) {
                    // For container children, use the collision mesh for bounds calculation
                    const collisionMesh = child.mesh.children.find(grandchild =>
                        grandchild.userData.isContainerCollision
                    );
                    if (collisionMesh) {
                        return collisionMesh;
                    }
                }
                return child.mesh;
            })
            .filter(mesh => mesh && mesh.geometry && mesh.geometry.type !== 'EdgesGeometry');

        if (childMeshes.length === 0) {
            return false;
        }

        // ARCHITECTURAL FIX: Use centralized bounds calculation with proper matrix updates
        const newBounds = PositionTransform.calculateObjectBounds(childMeshes);

        // Determine position based on preservePosition flag
        const targetPosition = preservePosition ? containerData.mesh.position : newBounds.center;

        // Update container geometry to wrap children exactly
        const success = LayoutGeometry.updateContainerGeometry(
            containerData.mesh,
            newBounds.size,
            targetPosition,
            !preservePosition // Only reposition if not preserving position
        );

        if (success) {
            // Update SceneController metadata
            sceneController.updateObject(containerData.id, {
                position: targetPosition
            });
        }

        return success;
    }
    
    /**
     * Check if container has layout enabled with fill objects
     * @param {Object} containerData - Container object data
     * @param {Array} childObjects - Child objects array
     * @returns {boolean} True if container has layout with fill objects
     */
    checkContainerHasLayoutWithFill(containerData, childObjects) {
        // Check if container has layout configuration
        if (!containerData.layoutProperties || !containerData.layoutProperties.direction) {
            return false;
        }

        // Check if any child objects have fill behavior
        return childObjects.some(child => {
            if (!child.layoutProperties) return false;
            const { sizeX, sizeY, sizeZ } = child.layoutProperties;
            return sizeX === 'fill' || sizeY === 'fill' || sizeZ === 'fill';
        });
    }

    /**
     * Resize fill objects based on new container size
     * @param {Object} containerData - Container object data
     * @param {Array} childObjects - Child objects array
     * @param {THREE.Vector3} newContainerSize - New container size
     */
    resizeFillObjectsForNewContainerSize(containerData, childObjects, newContainerSize) {
        const layoutConfig = containerData.layoutProperties;
        if (!layoutConfig || !layoutConfig.direction) return;

        // Calculate new sizes for fill objects using enhanced LayoutEngine
        const newObjectSizes = window.LayoutEngine.calculateFillObjectSizes(
            childObjects,
            layoutConfig,
            newContainerSize
        );

        // Apply the calculated sizes to the objects
        childObjects.forEach((child, index) => {
            if (!child.mesh || index >= newObjectSizes.length) return;

            const newSize = newObjectSizes[index];
            const currentBounds = new THREE.Box3().setFromObject(child.mesh);
            const currentSize = currentBounds.getSize(new THREE.Vector3());

            // Check if object needs resizing (has fill behavior and size changed significantly)
            const hasSignificantChange = Math.abs(currentSize.x - newSize.x) > 0.001 ||
                                       Math.abs(currentSize.y - newSize.y) > 0.001 ||
                                       Math.abs(currentSize.z - newSize.z) > 0.001;

            if (hasSignificantChange && this.objectHasFillBehavior(child, layoutConfig.direction)) {
                this.resizeObjectGeometry(child.mesh, newSize);
            }
        });
    }

    /**
     * Check if object has fill behavior for the given layout direction
     * @param {Object} objectData - Object data
     * @param {string} layoutDirection - Layout direction ('x', 'y', 'z')
     * @returns {boolean} True if object has fill behavior
     */
    objectHasFillBehavior(objectData, layoutDirection) {
        if (!objectData.layoutProperties) return false;

        const sizeProperty = layoutDirection === 'x' ? 'sizeX' :
                           layoutDirection === 'y' ? 'sizeY' : 'sizeZ';
        return objectData.layoutProperties[sizeProperty] === 'fill';
    }

    /**
     * Resize object geometry to match new size
     * Uses same approach as push tool for consistent geometry modification
     * @param {THREE.Mesh} mesh - Object mesh to resize
     * @param {THREE.Vector3} newSize - Target size
     */
    resizeObjectGeometry(mesh, newSize) {
        if (!mesh || !mesh.geometry || !newSize) return;

        const geometry = mesh.geometry;
        const positions = geometry.attributes.position;
        const vertices = positions.array;

        // Calculate current bounds
        geometry.computeBoundingBox();
        const currentBounds = geometry.boundingBox;
        const currentSize = currentBounds.getSize(new THREE.Vector3());

        // Calculate scale factors for each axis
        const scaleX = currentSize.x > 0 ? newSize.x / currentSize.x : 1;
        const scaleY = currentSize.y > 0 ? newSize.y / currentSize.y : 1;
        const scaleZ = currentSize.z > 0 ? newSize.z / currentSize.z : 1;

        // Apply scaling to vertices
        for (let i = 0; i < vertices.length; i += 3) {
            vertices[i] *= scaleX;     // X coordinate
            vertices[i + 1] *= scaleY; // Y coordinate
            vertices[i + 2] *= scaleZ; // Z coordinate
        }

        // Update geometry
        positions.needsUpdate = true;
        geometry.computeBoundingBox();
        geometry.computeBoundingSphere();

        // Synchronize related meshes
        const meshSynchronizer = window.modlerComponents?.meshSynchronizer;
        if (meshSynchronizer) {
            meshSynchronizer.syncAllRelatedMeshes(mesh, 'geometry');
        }
    }

    /**
     * Resize container to match layout-calculated bounds
     * Uses pre-calculated layout bounds instead of recalculating from children
     * @param {Object} containerData - Container object data
     * @param {Object} layoutBounds - Layout bounds with center and size
     * @returns {boolean} Success status
     */
    resizeContainerToLayoutBounds(containerData, layoutBounds) {
        if (!containerData || !containerData.mesh || !layoutBounds || !layoutBounds.size) {
            return false;
        }

        const sceneController = window.modlerComponents?.sceneController;
        if (!sceneController) return false;

        // Use layout-calculated bounds for container geometry
        const success = LayoutGeometry.updateContainerGeometry(
            containerData.mesh,
            layoutBounds.size,
            layoutBounds.center,
            true // Reposition to layout-calculated center
        );

        if (success) {
            // Update SceneController metadata with new position
            sceneController.updateObject(containerData.id, {
                position: layoutBounds.center
            });
        }

        return success;
    }

    /**
     * Resize container geometry without repositioning
     * Used during container creation when position is already correct
     * @param {Object} containerData - Container object data
     * @param {THREE.Vector3} size - Container size
     * @returns {boolean} Success status
     */
    resizeContainerGeometry(containerData, size) {
        if (!containerData || !containerData.mesh || !size) {
            return false;
        }

        // Update container geometry without changing position
        const success = LayoutGeometry.updateContainerGeometry(
            containerData.mesh,
            size,
            containerData.mesh.position, // Keep current position
            false // Don't reposition
        );

        return success;
    }
    
    // ARCHITECTURAL CLEANUP: Removed expandContainerToFitChildren() method
    // Replaced with simplified single-path resizeContainerToFitChildren() logic
    // This eliminates coordinate space confusion and contradictory logic paths
    
    // Removed unused statistics method - dead code elimination
    
    // Removed unused container validation method - dead code elimination
    
    /**
     * Clean up container resources
     * @param {Object} containerData - Container object data
     * @returns {boolean} Success status
     */
    cleanupContainer(containerData) {
        if (!containerData || !containerData.mesh) return false;

        // Use UnifiedContainerManager for comprehensive cleanup
        const unifiedContainerManager = window.modlerComponents?.unifiedContainerManager;
        if (unifiedContainerManager) {
            unifiedContainerManager.removeContainer(containerData.id);
        }

        // Dispose geometry to prevent memory leaks
        if (containerData.mesh.geometry) {
            containerData.mesh.geometry.dispose();
        }

        // Dispose material
        if (containerData.mesh.material) {
            containerData.mesh.material.dispose();
        }

        // Container resources cleaned up
        return true;
    }
}

// Export for use in main application
window.ContainerManager = ContainerManager;