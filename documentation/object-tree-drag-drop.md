# Object Tree Drag & Drop Reordering System
**Version**: 3.0.0
**Status**: Current (2026-03-19)
**Currency**: Active - Core feature for layout containers

## Overview

Drag-and-drop reordering system for objects in the ObjectTree (left panel). Allows users to change the order of objects within containers, which directly affects how the layout engine positions objects in layout-enabled containers.

## Architecture

### Communication Flow

**Same-parent reorder:**
```
ObjectTree (UI)
    ↓ postMessage({ type: 'reorder-children', objectId, targetId, position, parentId })
SimpleCommunication → CommandRouter.handleReorderChildren()
    ↓ writes childrenOrder directly to container on SceneController
    ↓ emits HIERARCHY event via ObjectEventBus
    ↓ triggers layout recalculation if autoLayout enabled
SimpleCommunication.handleHierarchyEvent()
    ↓ sends 'hierarchy-changed' to all iframes
ObjectTree rebuilds tree with new ordering
```

**Cross-level move (e.g. root → container):**
```
ObjectTree (UI)
    ↓ postMessage({ type: 'move-and-reorder', objectId, targetParentId, targetId, position })
SimpleCommunication → CommandRouter.handleMoveAndReorder()
    ↓ Step 1: sceneController.moveObjectToContainer() or moveObjectToRoot()
    ↓ Step 2: reorderChildByPosition() (immediate, no setTimeout)
    ↓ emits HIERARCHY event
ObjectTree rebuilds tree
```

### Key Components

**1. ObjectTree.svelte** (`/svelte-ui/src/lib/components/ObjectTree.svelte`)
- Handles drag events (dragstart, dragover, drop)
- Shows visual drop indicators using independent drop zones
- State: `activeDropZone = { parentId: number | null, index: number }`
- Same-parent: sends `reorder-children` message
- Cross-level: sends atomic `move-and-reorder` message (no setTimeout)
- Validates container nesting before cross-level moves

**2. CommandRouter** (`/application/command-router.js`)
- `reorder-children` / `object-reorder` → `handleReorderChildren()`
- `move-and-reorder` → `handleMoveAndReorder()` (atomic move + reorder)
- `move-to-container` → `handleMoveToContainer()`
- `move-to-root` → `handleMoveToRoot()`
- Writes `childrenOrder` directly to SceneController objects (not through OSM)
- Emits HIERARCHY events directly via ObjectEventBus

**3. SceneHierarchyManager** (`/scene/scene-hierarchy-manager.js`)
- `getChildObjects(containerId)`: Returns children ordered by `childrenOrder` array
- `setParentContainer(objectId, parentId)`: Maintains `childrenOrder` when objects move

**4. SimpleCommunication** (`/integration/communication/simple-postmessage.js`)
- Subscribes to HIERARCHY events → sends filtered hierarchy to UI iframes
- Filters utility objects (Floor Grid, Interactive) before sending — UI never sees them
- Routes UI→Main messages to CommandRouter

## Data Structure

### Container Object with childrenOrder
```javascript
{
    id: "container-123",
    isContainer: true,
    childrenOrder: ["child-1", "child-3", "child-2"], // Explicit order
    autoLayout: { enabled: true, direction: "horizontal", ... }
}
```

### childrenOrder Ownership
- **SceneController owns childrenOrder** — it lives on container objects in the objects Map
- CommandRouter writes directly to `container.childrenOrder` during reorder operations
- SceneHierarchyManager maintains it during `setParentContainer()` (add/remove from parent)
- ObjectStateManager does NOT sync or manage childrenOrder

## Message Formats

### Same-parent reorder
```javascript
{ type: 'reorder-children', objectId, targetId, position: 'before'|'after', parentId }
```

### Cross-level move + reorder (atomic)
```javascript
{ type: 'move-and-reorder', objectId, targetParentId, targetId, position: 'before'|'after' }
```

### Direct move (without reorder)
```javascript
{ type: 'move-to-container', objectId, targetContainerId }
{ type: 'move-to-root', objectId }
```

## Drop Zone Architecture

Drop zones are **independent elements** between list items. Each zone represents the space between two items.

```
┌─────────────────────┐
│   List Item 1       │
└─────────────────────┘
  [Drop Zone index=1]   ← Blue line appears here
┌─────────────────────┐
│   List Item 2       │
└─────────────────────┘
```

Drop position calculated from cursor Y within item bounds:
- Top half → drop zone BEFORE item
- Bottom half → drop zone AFTER item

## Validation Rules

- Maximum nesting depth: 2 levels (from `ObjectDataFormat.MAX_NESTING_DEPTH`)
- Cannot nest container inside itself
- Cannot create circular references
- Validation runs before cross-level container moves in ObjectTree

## Related Systems

- **Layout Engine** (`/layout/layout-engine.js`) - Positions objects according to order
- **SceneLayoutManager** (`/scene/scene-layout-manager.js`) - Calls getChildObjects(), passes to LayoutEngine
- **CommandRouter** (`/application/command-router.js`) - Message routing and childrenOrder updates
- **ObjectEventBus** (`/integration/communication/object-event-bus.js`) - Event emission
- **SimpleCommunication** (`/integration/communication/simple-postmessage.js`) - Main ↔ UI bridge

---

**Last Updated**: 2026-03-19
