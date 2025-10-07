# Object Tree Drag & Drop Reordering System
**Version**: 1.0.0
**Status**: Current (2025-10-04)
**Currency**: 🟢 Active - Core feature for layout containers

## Overview

Drag-and-drop reordering system for objects in the ObjectTree (left panel). Allows users to change the order of objects within containers, which directly affects how the layout engine positions objects in layout-enabled containers.

## Architecture

### Communication Flow

```
ObjectTree (UI)
    ↓ unifiedCommunication.sendObjectMovement('reorder', {...})
PropertyPanelSync (validates operation)
    ↓ sends 'object-reorder' message
main-integration.js (handleObjectReorder)
    ↓ updates container.childrenOrder array
SceneController.getChildObjects()
    ↓ returns children in childrenOrder sequence
Layout Engine
    ↓ positions objects according to order
Hierarchy Refresh
    ↓ sends updated data including childrenOrder
ObjectTree (UI) displays persisted order
```

### Key Components

**1. ObjectTree.svelte** (`/svelte-ui/src/lib/components/ObjectTree.svelte`)
- Handles drag events (dragstart, dragover, drop)
- Shows visual drop indicators (before/after/into)
- Calls `unifiedCommunication.sendObjectMovement('reorder', {...})`
- Functions: `reorderObjectInContainer()`, `reorderObjectAtRoot()`

**2. unified-communication.ts** (`/svelte-ui/src/lib/services/unified-communication.ts`)
- Routes reorder messages to PropertyPanelSync or fallback PostMessage
- Operation sent: `'reorder'` → becomes `'object-reorder'` message

**3. property-panel-sync.js** (`/integration/svelte/property-panel-sync.js:908`)
- Validates operation types
- Valid operations: `['move-to-container', 'move-to-root', 'reorder-container', 'reorder-root', 'reorder', 'container-move-to-container']`

**4. main-integration.js** (`/integration/svelte/main-integration.js:1176`)
- `handleObjectReorder(objectId, targetId, position, parentId)`
- Initializes `container.childrenOrder` if missing
- Updates array with new order
- Triggers layout update if container has `autoLayout.enabled`

**5. scene-controller.js** (`/scene/scene-controller.js`)
- `getChildObjects(containerId)`: Returns children ordered by `childrenOrder` array
- `setParentContainer(objectId, parentId)`: Maintains `childrenOrder` when objects move
  - Adds object to new parent's `childrenOrder`
  - Removes object from old parent's `childrenOrder`

**6. object-data-format.js** (`/application/serialization/object-data-format.js:217`)
- `serializeForPostMessage()`: Includes `childrenOrder` in serialization
- Ensures order is transmitted from backend to UI

## Data Structure

### Container Object with childrenOrder
```javascript
{
    id: "container-123",
    name: "My Container",
    isContainer: true,
    autoLayout: {
        enabled: true,
        direction: "horizontal",
        // ...
    },
    childrenOrder: ["child-1", "child-3", "child-2"], // Explicit order
    // ... other properties
}
```

## Reorder Message Format

```javascript
{
    type: 'object-reorder',
    data: {
        objectId: 'child-2',      // Object being moved
        targetId: 'child-3',      // Reference object
        position: 'before',       // 'before' | 'after' | 'into'
        parentId: 'container-123' // Parent container ID (null for root)
    }
}
```

## Implementation Details

### Initialization of childrenOrder

When an object is added to a container (`SceneController.setParentContainer`):
```javascript
// Initialize from current children if not exists
if (!parentContainer.childrenOrder) {
    const currentChildren = this.getChildObjects(parentId);
    parentContainer.childrenOrder = currentChildren.map(child => child.id);
}

// Add new object
if (!parentContainer.childrenOrder.includes(objectId)) {
    parentContainer.childrenOrder.push(objectId);
}
```

### Reordering Logic

Algorithm in `handleObjectReorder`:
1. Get or initialize `childrenOrder` array
2. Find indices of dragged and target objects
3. Remove dragged object from array
4. Calculate new index based on position ('before'/'after')
5. Insert dragged object at new index
6. Store updated array in `container.childrenOrder`
7. Update Three.js scene graph order (optional visual consistency)
8. Trigger layout update if `autoLayout.enabled`
9. Refresh UI hierarchy

### Cleanup When Moving Between Containers

```javascript
// Remove from old parent's childrenOrder
if (oldParentId && oldParentId !== parentId) {
    const oldParent = this.objects.get(oldParentId);
    if (oldParent?.childrenOrder) {
        const index = oldParent.childrenOrder.indexOf(objectId);
        if (index !== -1) {
            oldParent.childrenOrder.splice(index, 1);
        }
    }
}
```

## Drop Position Calculation

Visual zones in ObjectTree:
```
┌─────────────────────┐
│     'before'        │ < 25% of height (containers only)
├─────────────────────┤
│      'into'         │   25% - 75% (containers only)
├─────────────────────┤
│     'after'         │ > 75% of height (containers)
└─────────────────────┘

For non-containers:
┌─────────────────────┐
│     'before'        │ < 40% of height
├─────────────────────┤
│     'after'         │ > 40% of height
└─────────────────────┘
```

## Layout Engine Integration

The layout engine uses `SceneController.getChildObjects()` which respects `childrenOrder`:
```javascript
getChildObjects(containerId) {
    const container = this.objects.get(containerId);

    if (container?.childrenOrder) {
        // Return children in specified order
        return container.childrenOrder
            .map(id => this.objects.get(id))
            .filter(child => child?.parentContainer === containerId);
    }

    // Fallback: iteration order
    return Array.from(this.objects.values())
        .filter(obj => obj.parentContainer === containerId);
}
```

## Validation Rules

**Container Nesting Limits**:
- Maximum depth: 3 levels (validated in `isValidContainerNesting`)
- Cannot nest container inside itself
- Cannot create circular references

**Valid Drop Operations**:
- Same parent: Reorder within container
- Different parent: Move to new container (preserves order at end)
- To root: Remove from container

## Troubleshooting

### Reorder Not Working
1. Check browser console for validation errors
2. Verify `container.autoLayout.enabled === true`
3. Ensure `childrenOrder` is in serialization
4. Check PropertyPanelSync validates 'reorder' operation

### Order Not Persisting
1. Verify `childrenOrder` is being serialized in `object-data-format.js`
2. Check `handleObjectReorder` is storing updated array
3. Ensure hierarchy refresh includes `childrenOrder`

### Visual Indicators Not Showing
1. Check `dragOverTarget` and `dropIndicatorPosition` state
2. Verify drag event handlers are firing
3. Ensure CSS for drop indicators is loaded

## Related Systems

- **Layout Engine** (`/layout/layout-engine.js`) - Positions objects according to order
- **Container Management** (`/application/managers/container-crud-manager.js`) - Container operations
- **Property Panel Sync** (`/integration/svelte/property-panel-sync.js`) - UI communication
- **Object Serialization** (`/application/serialization/`) - Data transmission format

## Future Enhancements

- Drag multiple objects simultaneously
- Keyboard shortcuts for reordering (Cmd+↑/↓)
- Undo/redo support for reorder operations
- Visual preview of layout changes before drop
- Persist childrenOrder in save files

---

**Last Updated**: 2025-10-04
**Related Documentation**:
- [Container Architecture](container-properties.md)
- [Layout System](../layout/README.md) (if exists)
- [UI Communication](../integration/README.md) (if exists)
