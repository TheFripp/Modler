# Modler V2 - Quick Patterns

**Code templates for 80% of common tasks**

**NOTE**: All import paths use **kebab-case** file names (e.g., `object-state-manager.js`)

---

## State Management Patterns

### 1. Update Object State

```javascript
// ALWAYS use ObjectStateManager for state changes
// ObjectStateManager is available globally via window.modlerComponents
const ObjectStateManager = window.modlerComponents.objectStateManager;

// Update object properties
ObjectStateManager.updateObject(objectId, {
    position: { x: 0, y: 5, z: 0 },
    dimensions: { width: 10, height: 10, depth: 10 },
    rotation: { x: 0, y: Math.PI / 4, z: 0 }
});

// Update container properties
ObjectStateManager.updateObject(containerId, {
    layoutDirection: 'x',
    gap: 2,
    padding: 1,
    sizingMode: 'hug'
});

// Update custom properties
ObjectStateManager.updateObject(objectId, {
    customProperty: 'value',
    metadata: { key: 'value' }
});
```

### 2. Get Object State

```javascript
// Get single object
const objectData = ObjectStateManager.getObject(objectId);

// Get all objects
const allObjects = ObjectStateManager.getAllObjects();

// Check if object exists
if (ObjectStateManager.getObject(objectId)) {
    // Object exists
}
```

---

## UI Communication Patterns

### 1. Send Data to UI (3D → UI)

```javascript
// ALWAYS use PropertyPanelSync
// Available globally via window.modlerComponents
const PropertyPanelSync = window.modlerComponents.propertyPanelSync;

// Notify UI of object update
PropertyPanelSync.sendToUI('objectUpdated', {
    objectId: objectId,
    updates: { position, dimensions, rotation }
});

// Notify UI of selection change
PropertyPanelSync.sendToUI('selectionChanged', {
    selectedId: objectId,
    objectData: ObjectStateManager.getObject(objectId)
});

// Notify UI of object addition
PropertyPanelSync.sendToUI('objectAdded', {
    objectId: newId,
    objectData: ObjectStateManager.getObject(newId)
});

// Notify UI of object deletion
PropertyPanelSync.sendToUI('objectDeleted', {
    objectId: deletedId
});
```

### 2. Handle UI Commands (UI → 3D)

```javascript
// In property-update-handler.js or similar
handlePropertyChange(objectId, propertyName, value) {
    // Validate input
    if (!objectId || !propertyName) return;

    // Route to ObjectStateManager
    ObjectStateManager.updateObject(objectId, {
        [propertyName]: value
    });

    // UI will be notified automatically via ObjectStateManager events
}
```

---

## Container Operations

### 1. Create Container from Selection

```javascript
// Use ContainerCrudManager (available globally)
const containerManager = window.modlerComponents.containerCrudManager;

// Create container from selected objects
const containerId = containerManager.createContainerFromSelection();

// Container is auto-sized to fit children (hug mode)
```

### 2. Update Container Layout

```javascript
// Update layout properties
ObjectStateManager.updateObject(containerId, {
    layoutDirection: 'x',  // 'x', 'y', 'z', 'grid-xy', 'grid-xyz'
    gap: 2,                // Space between children
    padding: 1             // Space around children
});

// Resize container
ObjectStateManager.updateObject(containerId, {
    dimensions: { width: 20, height: 15, depth: 10 }
});
```

### 3. Resize Container for Content

```javascript
// Use ContainerCrudManager to auto-resize
// LayoutEngine available at: /layout/layout-engine.js
const LayoutEngine = window.LayoutEngine;

// Calculate bounds for all children
const bounds = LayoutEngine.calculateUnifiedBounds(
    childObjects,
    containerData.gap || 0,
    containerData.padding || 0
);

// Update container to fit
containerManager.resizeContainerToLayoutBounds(containerId, bounds);
```

---

## Geometry Manipulation

### 1. Push Face

```javascript
// GeometryUtils is a static class: /application/utilities/geometry-utils.js
const GeometryUtils = window.GeometryUtils;

// Get object
const objectData = ObjectStateManager.getObject(objectId);
const geometry = objectData.geometry;

// Push face
const newGeometry = GeometryUtils.pushGeometryFace(
    geometry,
    faceIndex,
    pushDistance
);

// Update via ObjectStateManager
ObjectStateManager.updateObject(objectId, {
    geometry: newGeometry
});
```

### 2. Create Box Geometry

```javascript
// Create box at position
const boxGeometry = GeometryUtils.createBoxAtPosition(
    position,    // {x, y, z}
    dimensions   // {width, height, depth}
);

// Add to scene via SceneController
const sceneController = window.modlerComponents.sceneController;
sceneController.addObject({
    type: 'box',
    geometry: boxGeometry,
    position: position,
    dimensions: dimensions
});
```

### 3. Resize Geometry

```javascript
// Resize existing object
const currentData = ObjectStateManager.getObject(objectId);

ObjectStateManager.updateObject(objectId, {
    dimensions: {
        width: newWidth,
        height: newHeight,
        depth: newDepth
    }
});

// Geometry will be updated automatically
```

---

## Visual Effects & Support Meshes

### 1. Show Support Mesh

```javascript
// ALWAYS show/hide, NEVER recreate
// VisualizationManager: /interaction/visualization-manager.js
const visualizationManager = window.modlerComponents.visualizationManager;

// Show edges
visualizationManager.showSupportMesh(objectId, 'edges');

// Show measurements
visualizationManager.showSupportMesh(objectId, 'measurements');

// Hide support mesh
visualizationManager.hideSupportMesh(objectId, 'edges');
```

### 2. Highlight Object

```javascript
// Highlight face
visualizationManager.highlightFace(objectId, faceIndex, color);

// Highlight edge
visualizationManager.highlightEdge(objectId, edgeIndex, color);

// Clear highlight
visualizationManager.clearHighlight(objectId);

// Highlight selected object
visualizationManager.highlightObject(objectId);
```

### 3. Update Support Mesh

```javascript
// Support meshes update automatically when geometry changes
// via GeometryUtils.updateSupportMeshes()

// Manual update if needed
const mesh = sceneController.getMeshByObjectId(objectId);
GeometryUtils.updateSupportMeshes(mesh);
```

---

## Tool Development Template

### 1. Basic Tool Structure

```javascript
// File location: /application/tools/[tool-name].js

export class MyTool {
    constructor(sceneController, inputController, selectionController) {
        this.sceneController = sceneController;
        this.inputController = inputController;
        this.selectionController = selectionController;

        this.isActive = false;
        this.currentHighlight = null;
    }

    activate() {
        this.isActive = true;
        // Setup tool state
    }

    deactivate() {
        this.isActive = false;
        this.clearHighlight();
    }

    onMouseMove(event, raycaster) {
        if (!this.isActive) return;

        // Raycast to find objects
        const hit = this.raycastObjects(raycaster);
        if (hit) {
            this.showHighlight(hit);
        } else {
            this.clearHighlight();
        }
    }

    onClick(event, raycaster) {
        if (!this.isActive) return;

        const hit = this.raycastObjects(raycaster);
        if (hit) {
            this.handleClick(hit);
        }
    }

    onDrag(event, raycaster, dragStart) {
        if (!this.isActive) return;

        // Handle drag operation
    }

    hasActiveHighlight() {
        return this.currentHighlight !== null;
    }

    raycastObjects(raycaster) {
        // Implement raycasting logic
        const intersects = raycaster.intersectObjects(
            this.sceneController.getInteractableObjects(),
            true
        );
        return intersects.length > 0 ? intersects[0] : null;
    }

    showHighlight(hit) {
        this.currentHighlight = hit;
        // Show visual feedback via VisualizationManager
    }

    clearHighlight() {
        this.currentHighlight = null;
        // Clear visual feedback
    }
}
```

### 2. Tool with State Changes

```javascript
handleClick(hit) {
    const objectId = hit.object.userData.objectId;

    // Update state via ObjectStateManager
    const ObjectStateManager = window.modlerComponents.objectStateManager;
    ObjectStateManager.updateObject(objectId, {
        property: newValue
    });

    // UI notification happens automatically
}
```

### 3. Tool with Undo/Redo

```javascript
// Commands: /application/commands/[command-name].js
class MyCommand {
    constructor(objectId, oldValue, newValue) {
        this.objectId = objectId;
        this.oldValue = oldValue;
        this.newValue = newValue;
    }

    execute() {
        const ObjectStateManager = window.modlerComponents.objectStateManager;
        ObjectStateManager.updateObject(this.objectId, {
            property: this.newValue
        });
    }

    undo() {
        const ObjectStateManager = window.modlerComponents.objectStateManager;
        ObjectStateManager.updateObject(this.objectId, {
            property: this.oldValue
        });
    }
}

// In tool
handleAction(objectId, newValue) {
    const ObjectStateManager = window.modlerComponents.objectStateManager;
    const oldValue = ObjectStateManager.getObject(objectId).property;

    const command = new MyCommand(objectId, oldValue, newValue);
    const historyManager = window.modlerComponents.historyManager;
    historyManager.executeCommand(command);
}
```

---

## Selection Patterns

### 1. Select Object

```javascript
// SelectionController: /interaction/selection-controller.js
const selectionController = window.modlerComponents.selectionController;

// Select object
selectionController.selectObject(objectId);

// Get current selection
const selectedId = selectionController.getSelectedObjectId();

// Clear selection
selectionController.clearSelection();
```

### 2. Container-First Selection

```javascript
// Single click → select parent container
const objectData = ObjectStateManager.getObject(objectId);
const containerParent = objectData.parent;

if (containerParent) {
    const parentData = ObjectStateManager.getObject(containerParent);
    if (parentData && parentData.isContainer) {
        selectionController.selectObject(containerParent);
    }
}

// Double click → select direct child
selectionController.selectObject(objectId);
```

---

## Layout Engine Patterns

### 1. Calculate Layout

```javascript
// LayoutEngine: /layout/layout-engine.js
const LayoutEngine = window.LayoutEngine;

// Get container data
const containerData = ObjectStateManager.getObject(containerId);
const children = containerData.children || [];

// Calculate layout positions
const layoutConfig = {
    direction: containerData.layoutDirection || 'x',
    gap: containerData.gap || 0,
    padding: containerData.padding || 0
};

// Apply layout
children.forEach((childId, index) => {
    const childData = ObjectStateManager.getObject(childId);
    const newPosition = LayoutEngine.calculateChildPosition(
        index,
        childData,
        layoutConfig
    );

    ObjectStateManager.updateObject(childId, {
        position: newPosition
    });
});
```

### 2. Calculate Container Bounds

```javascript
// Get all children objects
const childrenObjects = children.map(id =>
    ObjectStateManager.getObject(id)
);

// Calculate unified bounds
const bounds = LayoutEngine.calculateUnifiedBounds(
    childrenObjects,
    containerData.gap || 0,
    containerData.padding || 0
);

// bounds = { width, height, depth, center }
```

---

## Event Handling Patterns

### 1. Listen to ObjectStateManager Events

```javascript
// ObjectStateManager extends EventTarget
const ObjectStateManager = window.modlerComponents.objectStateManager;

// Listen for object updates
ObjectStateManager.addEventListener('objectUpdated', (event) => {
    const { objectId, updates } = event.detail;
    // React to changes
});

// Listen for object addition
ObjectStateManager.addEventListener('objectAdded', (event) => {
    const { objectId } = event.detail;
    // React to new object
});

// Listen for object deletion
ObjectStateManager.addEventListener('objectDeleted', (event) => {
    const { objectId } = event.detail;
    // Clean up
});
```

### 2. Listen to UI Messages (Svelte)

```typescript
// In Svelte UI components: /svelte-ui/src/lib/services/
import { UnifiedCommunication } from '$lib/services/unified-communication';

UnifiedCommunication.on('objectUpdated', (data) => {
    // Update UI components
});
```

---

## Global Component Access

All major components are available via `window.modlerComponents`:

```javascript
const {
    objectStateManager,
    sceneController,
    selectionController,
    visualizationManager,
    historyManager,
    toolController,
    inputController,
    cameraController,
    containerCrudManager,
    propertyPanelSync
} = window.modlerComponents;
```

---

## Common Mistakes to Avoid

❌ **DON'T**:
```javascript
// Direct mesh manipulation
mesh.position.set(x, y, z);  // WRONG

// Direct material changes
mesh.material.color.set(0xff0000);  // WRONG

// Bypass ObjectStateManager
sceneController.updateObject(id, data);  // WRONG

// Direct postMessage
window.postMessage({type: 'update'});  // WRONG

// Recreate support meshes
createEdges(object);  // WRONG - show/hide only

// Wrong import paths
import { ObjectStateManager } from '../core/ObjectStateManager.js';  // WRONG (PascalCase)
```

✅ **DO**:
```javascript
// Use ObjectStateManager
ObjectStateManager.updateObject(id, {
    position: {x, y, z}
});

// Use PropertyPanelSync
PropertyPanelSync.sendToUI('objectUpdated', data);

// Show/hide support meshes
visualizationManager.showSupportMesh(id, 'edges');

// Correct import paths (kebab-case)
import { LayoutEngine } from '../layout/layout-engine.js';  // CORRECT

// Or use global components
const ObjectStateManager = window.modlerComponents.objectStateManager;
```

---

**For detailed system documentation**: See `/documentation/README.md`
