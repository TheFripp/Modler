# Object Tree Drag & Drop Reordering System
**Version**: 4.0.0
**Status**: Current (2026-03-21)
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
    ↓ ObjectStateManager.updateObject(parentId, { childrenOrder }) — proper event propagation
    ↓ triggers layout recalculation for layout/hug containers via getContainerMode()
SimpleCommunication receives event
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
- Shows visual drop indicator via inset box-shadow on the hovered item wrapper
- State: `activeDropZone = { parentId, index, containerId, targetIndex, position }`
- `dropIndicatorStyle(index, parentId)` returns inset box-shadow CSS for top/bottom indicator
- Container three-zone detection: top 25% = before, middle 50% = into, bottom 25% = after
- Regular objects: top 50% = before, bottom 50% = after
- Same-parent: sends `reorder-children` message
- Cross-level: sends atomic `move-and-reorder` message (no setTimeout)
- Validates container nesting before cross-level moves

**2. drag-drop.ts** (`/svelte-ui/src/lib/components/object-tree/drag-drop.ts`)
- Pure business logic: `resolveDrop()`, `calcDropZone()`, nesting validation
- `calcDropZone()` returns `DropZone` with `targetIndex` + `position` for indicator tracking
- Self-drop guard: returns null when `targetObject.id === draggedObject.id`

**3. CommandRouter** (`/application/command-router.js`)
- `reorder-children` → `handleReorderChildren()`
- `move-and-reorder` → `handleMoveAndReorder()` (atomic move + reorder)
- `move-to-container` → `handleMoveToContainer()`
- `move-to-root` → `handleMoveToRoot()`
- Routes `childrenOrder` updates through `ObjectStateManager.updateObject()` (proper event propagation)
- Uses `objectStateManager.getContainerMode()` to determine if layout recalculation is needed

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
- CommandRouter updates via `ObjectStateManager.updateObject(parentId, { childrenOrder })` during reorder
- SceneHierarchyManager maintains it during `setParentContainer()` (add/remove from parent)
- Layout recalculation uses `objectStateManager.getContainerMode()` (not `autoLayout?.enabled`)

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

Each item calculates its own drop zone based on cursor Y position within its bounds. The visual indicator is an **inset box-shadow** on the hovered item's wrapper div (immune to overflow clipping from parent containers).

```
┌─────────────────────┐
│▓▓ blue inset top ▓▓▓│  ← cursor in top half → "before" indicator
│   List Item 1       │
│▓▓ blue inset bot ▓▓▓│  ← cursor in bottom half → "after" indicator
└─────────────────────┘
```

**Regular objects** — two-zone:
- Top 50% → `position: 'before'` (inset shadow at top edge)
- Bottom 50% → `position: 'after'` (inset shadow at bottom edge)

**Containers** — three-zone:
- Top 25% → `position: 'before'`
- Middle 50% → `position: 'into'` (container highlight, no line indicator)
- Bottom 25% → `position: 'after'`

**Why inset box-shadow?** The ObjectTree sits inside `overflow-hidden` (left-panel tab content) and `overflow-y-auto` (tree scroller). Regular outset box-shadows are clipped by these overflow containers. Inset shadows render inside the element and cannot be clipped.

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

**Last Updated**: 2026-03-21
