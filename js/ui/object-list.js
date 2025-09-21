// Object list management
class ObjectList {
    constructor() {
        this.setupEventListeners();
    }

    setupEventListeners() {
        document.addEventListener('DOMContentLoaded', () => {
            this.bindObjectListEvents();
        });
    }

    bindObjectListEvents() {
        // Set up click handlers for object list items
        document.addEventListener('click', (event) => {
            const objectItem = event.target.closest('.object-item');
            if (objectItem) {
                const objectName = objectItem.querySelector('.object-name').textContent;
                this.selectObjectFromList(objectName, event);
            }
        });
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
                // Single-select mode: clear previous selection and select this object
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

// Global function to populate object list from scene
window.populateObjectList = function() {
    const objectListContainer = document.getElementById('object-list');
    if (!objectListContainer) return;

    const sceneController = window.modlerComponents?.sceneController;
    if (!sceneController) return;

    // Clear existing list
    objectListContainer.innerHTML = '';

    // Get all objects from scene controller
    const objects = sceneController.getAllObjects();

    objects.forEach(objectData => {
        // Skip ground plane and other special objects
        if (objectData.name === 'Ground Plane' || objectData.name === 'FloorGrid') return;

        const objectItem = document.createElement('div');
        objectItem.className = 'object-item';

        const objectIcon = document.createElement('span');
        objectIcon.className = 'object-icon';
        objectIcon.textContent = objectData.isContainer ? '📦' : '🟦';

        const objectName = document.createElement('span');
        objectName.className = 'object-name';
        objectName.textContent = objectData.name;

        const objectType = document.createElement('span');
        objectType.className = 'object-type';
        objectType.textContent = objectData.isContainer ? 'Container' : objectData.type || 'Object';

        objectItem.appendChild(objectIcon);
        objectItem.appendChild(objectName);
        objectItem.appendChild(objectType);

        objectListContainer.appendChild(objectItem);
    });

    // If no objects, show a message
    if (objects.length === 0) {
        const emptyMessage = document.createElement('div');
        emptyMessage.className = 'object-list-empty';
        emptyMessage.textContent = 'No objects in scene';
        objectListContainer.appendChild(emptyMessage);
    }
};