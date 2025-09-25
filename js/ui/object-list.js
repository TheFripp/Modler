// Object list management
class ObjectList {
    constructor() {
        this.setupEventListeners();
    }

    setupEventListeners() {
        console.log('📋 SETUP EVENT LISTENERS - DOM state:', document.readyState);
        if (document.readyState === 'loading') {
            console.log('📋 DOM LOADING - adding DOMContentLoaded listener');
            document.addEventListener('DOMContentLoaded', () => {
                console.log('📋 DOM CONTENT LOADED - binding object list events');
                this.bindObjectListEvents();
            });
        } else {
            console.log('📋 DOM READY - binding object list events immediately');
            this.bindObjectListEvents();
        }
    }

    bindObjectListEvents() {

        // Check if object list container exists
        const objectListContainer = document.getElementById('object-list');

        // Try to populate the object list immediately to test
        if (window.populateObjectList) {
                window.populateObjectList();
        } else {
            console.log('📋 populateObjectList NOT AVAILABLE');
        }

        // Check if any object items exist after population
        setTimeout(() => {
            }, 100);


        // Set up click handlers for object list items
        document.addEventListener('click', (event) => {
            const objectItem = event.target.closest('.object-item');
            if (objectItem) {
                // CRITICAL FIX: Stop event propagation to prevent triggering other click handlers
                event.stopPropagation();
                event.preventDefault();

                const objectName = objectItem.querySelector('.object-name').textContent;
                this.selectObjectFromList(objectName, event);
            }
        });

        // Set up drag and drop event handlers
        this.setupDragAndDropHandlers();
    }

    setupDragAndDropHandlers() {
        let draggedItem = null;
        let draggedData = null;

        // Debug: Add mousedown listener to verify interaction
        document.addEventListener('mousedown', (event) => {
            const objectItem = event.target.closest('.object-item');
            if (objectItem) {
                // Object item found for interaction
            }
        });

        // Drag start - when user starts dragging an object
        document.addEventListener('dragstart', (event) => {

            const objectItem = event.target.closest('.object-item');
            if (!objectItem) {
                return;
            }


            draggedItem = objectItem;
            draggedData = {
                objectId: objectItem.dataset.objectId,
                objectName: objectItem.dataset.objectName,
                isContainer: objectItem.dataset.isContainer === 'true',
                parentContainer: objectItem.dataset.parentContainer || null
            };


            // Set drag data for browser compatibility
            event.dataTransfer.setData('text/plain', draggedData.objectId);
            event.dataTransfer.effectAllowed = 'move';

            // Add visual feedback
            objectItem.classList.add('dragging');

            // Store drag data globally for access in other events
            this.currentDrag = draggedData;
        });

        // Drag end - cleanup when drag operation ends
        document.addEventListener('dragend', (event) => {
            const objectItem = event.target.closest('.object-item');
            if (objectItem) {
                objectItem.classList.remove('dragging');
            }

            // Clear all drop indicators and highlights
            this.clearAllDropIndicators();

            // Reset drag state
            draggedItem = null;
            draggedData = null;
            this.currentDrag = null;
        });

        // Drag over - enable dropping and show visual feedback
        document.addEventListener('dragover', (event) => {
            event.preventDefault(); // Enable dropping

            if (!this.currentDrag) return;

            const dropTarget = this.getDropTarget(event.target);
            if (dropTarget) {
                event.dataTransfer.dropEffect = 'move';
                this.showDropFeedback(dropTarget, event);
            }
        });

        // Drag enter - show hover effects
        document.addEventListener('dragenter', (event) => {
            if (!this.currentDrag) return;

            const dropTarget = this.getDropTarget(event.target);
            if (dropTarget) {
                this.showDropHover(dropTarget);
            }
        });

        // Drag leave - remove hover effects
        document.addEventListener('dragleave', (event) => {
            if (!this.currentDrag) return;

            // Only remove hover if we're actually leaving the target
            const relatedTarget = event.relatedTarget;
            const currentTarget = this.getDropTarget(event.target);

            if (currentTarget && (!relatedTarget || !currentTarget.contains(relatedTarget))) {
                this.removeDropHover(currentTarget);
            }
        });

        // Drop - execute the move operation
        document.addEventListener('drop', (event) => {
            event.preventDefault();

            if (!this.currentDrag) return;

            const dropTarget = this.getDropTarget(event.target);
            if (dropTarget && this.isValidDrop(this.currentDrag, dropTarget)) {
                this.executeDrop(this.currentDrag, dropTarget);
            }

            // Clear all visual feedback
            this.clearAllDropIndicators();
        });
    }

    // Identify valid drop targets
    getDropTarget(element) {
        // Check for drop indicator
        const dropIndicator = element.closest('.drop-indicator');
        if (dropIndicator) return dropIndicator;

        // Check for object item (container target)
        const objectItem = element.closest('.object-item');
        if (objectItem && objectItem.dataset.isContainer === 'true') return objectItem;

        // Check for root drop zone
        const rootDropZone = element.closest('.root-drop-zone');
        if (rootDropZone) return rootDropZone;

        return null;
    }

    // Show visual feedback for drop targets
    showDropFeedback(dropTarget, event) {
        this.clearAllDropIndicators();

        if (dropTarget.classList.contains('drop-indicator')) {
            dropTarget.classList.add('active');
        } else if (dropTarget.classList.contains('object-item')) {
            dropTarget.classList.add('drag-over');
        } else if (dropTarget.classList.contains('root-drop-zone')) {
            dropTarget.style.borderColor = '#4a9eff';
            dropTarget.style.backgroundColor = 'rgba(74, 158, 255, 0.1)';
        }
    }

    // Show hover effects
    showDropHover(dropTarget) {
        if (dropTarget.classList.contains('object-item')) {
            dropTarget.classList.add('drag-over');
        }
    }

    // Remove hover effects
    removeDropHover(dropTarget) {
        if (dropTarget.classList.contains('object-item')) {
            dropTarget.classList.remove('drag-over');
        }
    }

    // Clear all visual indicators
    clearAllDropIndicators() {
        // Clear drop indicators
        document.querySelectorAll('.drop-indicator').forEach(indicator => {
            indicator.classList.remove('active');
        });

        // Clear object hover states and enhanced styling
        document.querySelectorAll('.object-item').forEach(item => {
            item.classList.remove('drag-over');
            item.style.boxShadow = '';
            item.style.borderColor = '';
        });

        // Clear root drop zone styling
        document.querySelectorAll('.root-drop-zone').forEach(zone => {
            zone.style.borderColor = '';
            zone.style.backgroundColor = '';
        });
    }

    // Validate if a drop operation is allowed
    isValidDrop(dragData, dropTarget) {
        if (!dragData || !dropTarget) return false;

        // Get drop target information
        const dropType = this.getDropType(dropTarget);
        const targetId = this.getDropTargetId(dropTarget);

        // Prevent dropping on itself
        if (targetId === dragData.objectId) return false;

        // Prevent circular dependencies (container dropping into its own child)
        if (dragData.isContainer && this.wouldCreateCircularDependency(dragData.objectId, targetId)) {
            return false;
        }

        return true;
    }

    // Get the type of drop operation
    getDropType(dropTarget) {
        if (dropTarget.classList.contains('drop-indicator')) {
            return dropTarget.dataset.dropType; // 'reorder', 'container-child'
        } else if (dropTarget.classList.contains('object-item')) {
            return 'container-add'; // Adding to container
        } else if (dropTarget.classList.contains('root-drop-zone')) {
            return 'move-to-root'; // Moving to root level
        }
        return null;
    }

    // Get the target ID for the drop operation
    getDropTargetId(dropTarget) {
        if (dropTarget.classList.contains('drop-indicator')) {
            return dropTarget.dataset.parentId;
        } else if (dropTarget.classList.contains('object-item')) {
            return dropTarget.dataset.objectId;
        } else if (dropTarget.classList.contains('root-drop-zone')) {
            return 'root';
        }
        return null;
    }

    // Check for circular dependencies
    wouldCreateCircularDependency(containerId, targetId) {
        const sceneController = window.modlerComponents?.sceneController;
        if (!sceneController || targetId === 'root') return false;

        // Check if targetId is a descendant of containerId
        const checkDescendant = (parentId) => {
            const children = sceneController.getChildObjects(parentId);
            for (const child of children) {
                if (child.id === targetId) return true;
                if (child.isContainer && checkDescendant(child.id)) return true;
            }
            return false;
        };

        return checkDescendant(containerId);
    }

    // Execute the drop operation
    executeDrop(dragData, dropTarget) {
        const dropType = this.getDropType(dropTarget);
        const targetId = this.getDropTargetId(dropTarget);


        const sceneController = window.modlerComponents?.sceneController;
        const containerManager = window.modlerComponents?.containerCrudManager;

        if (!sceneController || !containerManager) {
            console.error('Required components not available for drop operation');
            return false;
        }

        const draggedObject = sceneController.getObject(dragData.objectId);
        if (!draggedObject) {
            console.error('Dragged object not found:', dragData.objectId);
            return false;
        }

        let success = false;

        try {
            switch (dropType) {
                case 'move-to-root':
                    success = this.moveToRoot(draggedObject, containerManager);
                    break;

                case 'container-add':
                    success = this.moveToContainer(draggedObject, targetId, sceneController, containerManager);
                    break;

                case 'reorder':
                case 'container-child':
                    success = this.reorderObject(draggedObject, dropTarget, sceneController, containerManager);
                    break;

                default:
                    console.error('Unknown drop type:', dropType);
            }

            if (success) {
                // Refresh the object list to show new hierarchy
                setTimeout(() => {
                    window.populateObjectList();
                }, 50);
            }

        } catch (error) {
            console.error('Drop operation failed:', error);
            success = false;
        }

        return success;
    }

    // Move object to root level (remove from container)
    moveToRoot(objectData, containerManager) {
        if (!objectData.parentContainer) {
            return true;
        }

        return containerManager.removeObjectFromContainer(objectData);
    }

    // Move object to a container
    moveToContainer(objectData, containerId, sceneController, containerManager) {
        const targetContainer = sceneController.getObject(containerId);
        if (!targetContainer) {
            console.error('Target container not found:', containerId);
            return false;
        }

        if (!targetContainer.isContainer) {
            console.error('Target is not a container:', containerId);
            return false;
        }

        // Remove from current container if needed
        if (objectData.parentContainer) {
            const removeSuccess = containerManager.removeObjectFromContainer(objectData);
            if (!removeSuccess) {
                console.error('Failed to remove object from current container');
                return false;
            }
        }

        // Add to new container
        const success = containerManager.addObjectToContainer(objectData, targetContainer);

        if (success && targetContainer.autoLayout?.enabled) {
            this.showAutoLayoutNotification(targetContainer);
        }

        return success;
    }

    // Reorder object within same container or hierarchy
    reorderObject(objectData, dropTarget, sceneController, containerManager) {
        // For now, implement basic move - full reordering can be added later
        const targetParentId = dropTarget.dataset.parentId;

        if (targetParentId === 'root') {
            return this.moveToRoot(objectData, containerManager);
        } else {
            return this.moveToContainer(objectData, targetParentId, sceneController, containerManager);
        }
    }

    // Show notification when object is moved to auto-layout container
    showAutoLayoutNotification(container) {
        if (!container.autoLayout?.enabled) return;

        const direction = container.autoLayout.direction?.toUpperCase() || 'unknown';
        const message = `Object added to ${direction}-axis layout container`;

        // Create temporary notification
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 50px;
            right: 20px;
            background: rgba(74, 158, 255, 0.9);
            color: white;
            padding: 8px 12px;
            border-radius: 4px;
            font-size: 11px;
            font-weight: 500;
            z-index: 10000;
            box-shadow: 0 2px 8px rgba(0,0,0,0.3);
            transform: translateX(100%);
            transition: transform 0.3s ease;
        `;
        notification.textContent = message;

        document.body.appendChild(notification);

        // Animate in
        requestAnimationFrame(() => {
            notification.style.transform = 'translateX(0)';
        });

        // Remove after 3 seconds
        setTimeout(() => {
            notification.style.transform = 'translateX(100%)';
            setTimeout(() => {
                document.body.removeChild(notification);
            }, 300);
        }, 3000);
    }

    // Enhanced drop feedback with container type information
    showDropFeedback(dropTarget, event) {
        this.clearAllDropIndicators();

        if (dropTarget.classList.contains('drop-indicator')) {
            dropTarget.classList.add('active');
        } else if (dropTarget.classList.contains('object-item')) {
            dropTarget.classList.add('drag-over');

            // Add special styling for auto-layout containers
            const containerId = dropTarget.dataset.objectId;
            const sceneController = window.modlerComponents?.sceneController;
            if (sceneController) {
                const containerData = sceneController.getObject(containerId);
                if (containerData?.autoLayout?.enabled) {
                    dropTarget.style.boxShadow = '0 0 12px rgba(0, 255, 0, 0.6)';
                    dropTarget.style.borderColor = '#00ff00';
                }
            }
        } else if (dropTarget.classList.contains('root-drop-zone')) {
            dropTarget.style.borderColor = '#4a9eff';
            dropTarget.style.backgroundColor = 'rgba(74, 158, 255, 0.1)';
        }
    }

    selectObjectFromList(objectName, event = null) {
        if (!window.modlerComponents?.sceneController || !window.modlerComponents?.selectionController) {
            return;
        }

        // Find the object by name in the scene
        const scene = window.modlerComponents.sceneController.scene;
        let targetObject = null;

        scene.traverse((child) => {
            if (child.name === objectName) {
                // Handle both regular objects (with geometry) and special objects like GridHelper
                if (child.geometry || child.type === 'GridHelper') {
                    targetObject = child;
                }
            }
        });

        if (targetObject) {
            const selectionController = window.modlerComponents.selectionController;

            // Check for multi-select modifiers
            const isMultiSelect = event && (event.shiftKey || event.ctrlKey || event.metaKey);

            if (isMultiSelect) {
                // Multi-select mode: toggle selection (keep existing selections)
                if (targetObject.geometry && targetObject.material) {
                    selectionController.toggle(targetObject);
                }
            } else {
                // Single-select mode: use NavigationController for smart navigation
                const navigationController = window.modlerComponents?.navigationController;
                const sceneController = window.modlerComponents?.sceneController;

                if (navigationController && sceneController) {
                    // Get object data for NavigationController
                    const objectData = sceneController.getObjectByMesh(targetObject);

                    if (objectData) {
                        // Use NavigationController for unified navigation
                        navigationController.navigateToObject(objectData.id);
                        return; // NavigationController handles everything
                    }
                }

                // Fallback to old behavior
                selectionController.clearSelection();

                // Only select if it's a regular mesh object (not grid helper)
                if (targetObject.geometry && targetObject.material) {
                    selectionController.select(targetObject);

                    // Update property panel
                    if (window.propertyPanel) {
                        window.propertyPanel.updateFromObject(targetObject);
                    }

                    // CRITICAL FIX: If this is a container, ensure proper visibility handling
                    const sceneController = window.modlerComponents.sceneController;
                    const visibilityManager = window.modlerComponents.containerVisibilityManager;
                    const objectData = sceneController.getObjectByMesh(targetObject);

                    if (objectData && objectData.isContainer && visibilityManager) {
                        // Container visibility is now handled by ContainerVisibilityManager
                        // through the SelectionController's showContainerWireframe method
                    }
                } else {
                    // For non-selectable objects like grid, just clear property panel
                    if (window.propertyPanel) {
                        window.propertyPanel.clear();
                    }
                }
            }

            // Update UI to show selection (handle both single and multi-selection)
            if (isMultiSelect) {
                // For multi-select, update with all currently selected object names
                const selectedObjects = selectionController.getSelectedObjects();
                const selectedNames = selectedObjects.map(obj => obj.name);
                this.updateSelection(selectedNames);
            } else {
                // For single select, update with just this object name
                this.updateSelection(targetObject.geometry && targetObject.material ? [objectName] : []);
            }
        }
    }

    updateSelection(selectedObjectNames) {
        // Handle both single selection (string) and multi-selection (array)
        const nameArray = Array.isArray(selectedObjectNames)
            ? selectedObjectNames
            : (selectedObjectNames ? [selectedObjectNames] : []);

        // Update visual selection in object list
        const objectItems = document.querySelectorAll('.object-item');
        objectItems.forEach(item => {
            const objectName = item.querySelector('.object-name').textContent;
            if (nameArray.includes(objectName)) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });
    }
}

// Initialize object list
window.objectList = new ObjectList();

// Global functions for backward compatibility
window.selectObjectFromList = function(objectName, event) {
    if (window.objectList) {
        window.objectList.selectObjectFromList(objectName, event);
    }
};

window.updateObjectListSelection = function(selectedObjectNames) {
    if (window.objectList) {
        window.objectList.updateSelection(selectedObjectNames);
    }
};

// Global function to populate object list from scene with hierarchy support
window.populateObjectList = function() {
    const objectListContainer = document.getElementById('object-list');
    if (!objectListContainer) {
        return;
    }

    const sceneController = window.modlerComponents?.sceneController;
    if (!sceneController) {
        return;
    }

    // Clear existing list
    objectListContainer.innerHTML = '';

    // Get all objects from scene controller
    const objects = sceneController.getAllObjects();

    // Filter out special objects
    const filteredObjects = objects.filter(obj =>
        obj.name !== 'Ground Plane' && obj.name !== 'FloorGrid'
    );

    // Build hierarchy structure
    const hierarchy = buildObjectHierarchy(filteredObjects);

    // Create root drop zone
    const rootDropZone = document.createElement('div');
    rootDropZone.className = 'root-drop-zone';
    rootDropZone.dataset.dropType = 'root';
    rootDropZone.textContent = 'Drop here to move to root level';
    objectListContainer.appendChild(rootDropZone);

    // Render hierarchy
    renderHierarchy(hierarchy, objectListContainer, 0);

    // If no objects, show a message
    if (filteredObjects.length === 0) {
        const emptyMessage = document.createElement('div');
        emptyMessage.className = 'object-list-empty';
        emptyMessage.textContent = 'No objects in scene';
        objectListContainer.appendChild(emptyMessage);
    }
};

// Build hierarchical object structure
function buildObjectHierarchy(objects) {
    const hierarchy = [];
    const objectMap = new Map();

    // Create map for quick lookup
    objects.forEach(obj => objectMap.set(obj.id, { ...obj, children: [] }));

    // Build parent-child relationships
    objects.forEach(obj => {
        const objectNode = objectMap.get(obj.id);
        if (obj.parentContainer && objectMap.has(obj.parentContainer)) {
            const parent = objectMap.get(obj.parentContainer);
            parent.children.push(objectNode);
        } else {
            // Root level object
            hierarchy.push(objectNode);
        }
    });

    return hierarchy;
}

// Render hierarchical object list
function renderHierarchy(objects, container, indentLevel = 0) {
    objects.forEach((objectData, index) => {
        // Create drop indicator before each item (except first at root level)
        if (!(indentLevel === 0 && index === 0)) {
            const dropIndicator = document.createElement('div');
            dropIndicator.className = 'drop-indicator';
            dropIndicator.dataset.dropType = 'reorder';
            dropIndicator.dataset.parentId = objectData.parentContainer || 'root';
            dropIndicator.dataset.insertIndex = index.toString();
            container.appendChild(dropIndicator);
        }

        // Create object item
        const objectItem = createObjectItem(objectData, indentLevel);
        container.appendChild(objectItem);

        // Render children if any
        if (objectData.children && objectData.children.length > 0) {
            renderHierarchy(objectData.children, container, indentLevel + 1);
        }

        // Add drop indicator after the last item for containers
        if (objectData.isContainer) {
            const containerDropIndicator = document.createElement('div');
            containerDropIndicator.className = 'drop-indicator';
            containerDropIndicator.dataset.dropType = 'container-child';
            containerDropIndicator.dataset.parentId = objectData.id;
            containerDropIndicator.dataset.insertIndex = objectData.children.length.toString();
            container.appendChild(containerDropIndicator);
        }
    });
}

// Create individual object item with drag and drop support
function createObjectItem(objectData, indentLevel) {
    const objectItem = document.createElement('div');
    objectItem.className = `object-item ${objectData.isContainer ? 'container' : ''} ${indentLevel > 0 ? 'child' : ''}`;
    objectItem.draggable = true;
    objectItem.setAttribute('draggable', 'true'); // Ensure compatibility
    objectItem.dataset.objectId = objectData.id;
    objectItem.dataset.objectName = objectData.name;
    objectItem.dataset.isContainer = objectData.isContainer;
    objectItem.dataset.parentContainer = objectData.parentContainer || '';


    // Add hierarchy indentation
    if (indentLevel > 0) {
        for (let i = 0; i < indentLevel; i++) {
            const indent = document.createElement('div');
            indent.className = 'hierarchy-indent';
            indent.style.pointerEvents = 'none'; // Prevent interference with drag
            objectItem.appendChild(indent);
        }
    }

    // Add expand/collapse button for containers with children
    if (objectData.isContainer && objectData.children && objectData.children.length > 0) {
        const expandButton = document.createElement('span');
        expandButton.className = 'expand-collapse';
        expandButton.textContent = '▼';
        expandButton.onclick = (e) => {
            e.stopPropagation();
            e.preventDefault(); // Prevent drag initiation
            toggleContainerExpansion(objectData.id);
        };
        objectItem.appendChild(expandButton);
    }

    const objectIcon = document.createElement('span');
    objectIcon.className = 'object-icon';
    objectIcon.textContent = objectData.isContainer ? '📦' : '🟦';
    objectIcon.style.pointerEvents = 'none'; // Prevent interference with drag

    const objectName = document.createElement('span');
    objectName.className = 'object-name';
    objectName.textContent = objectData.name;
    objectName.style.pointerEvents = 'none'; // Prevent interference with drag

    const objectType = document.createElement('span');
    objectType.className = 'object-type';
    objectType.textContent = objectData.isContainer ? 'Container' : objectData.type || 'Object';
    objectType.style.pointerEvents = 'none'; // Prevent interference with drag

    objectItem.appendChild(objectIcon);
    objectItem.appendChild(objectName);
    objectItem.appendChild(objectType);

    return objectItem;
}

// Toggle container expansion state (placeholder for future implementation)
function toggleContainerExpansion(containerId) {
    // TODO: Implement container expansion/collapse
}