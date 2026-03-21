# Object Tree Drag & Drop Reordering System
**Version**: 4.1.0
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
    ↓ applyChildrenOrder(): writes to SceneController, emits HIERARCHY, triggers layout
    ↓ layout recalculation for layout/hug containers via getContainerMode()
SimpleCommunication receives event
    ↓ sends 'hierarchy-changed' to all iframes
ObjectTree rebuilds tree with new ordering
```

**Cross-level move (e.g. root → container):**
```
ObjectTree (UI)
    ↓ postMessage({ type: 'move-and-reorder', objectId, targetParentId, targetId, position })
SimpleCommunication → CommandRouter.handleMoveAndReorder()
    ↓ Step 1: setParentContainer(objectId, parentId, false) — layout suppressed
    ↓ Step 2: reorderChildByPosition() → applyChildrenOrder() → updateContainer()
    ↓ Single layout trigger for all modes (layout/hug/manual)
    ↓ emits HIERARCHY event
ObjectTree rebuilds tree
```

### Key Components

**1. ObjectTree.svelte** (`/svelte-ui/src/lib/components/ObjectTree.svelte`)
- Handles drag events (dragstart, dragover, drop)
- Drop indicator: absolutely positioned `<div>` with `bg-blue-500` inside `relative` wrapper, left edge indented to `depth * 16 + 8` px
- Indicator normalization: "before item N" (N>0) maps to "after item N-1" to prevent duplicate lines
- State: `activeDropZone = { parentId, index, containerId, targetIndex, position }`
- Reactive `$: dropIndicator` declaration drives indicator visibility (explicit Svelte dependency tracking)
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
- Shared `applyChildrenOrder(parentId, childrenOrder)`: writes to SceneController (owner), emits HIERARCHY event, triggers `updateContainer()` with `{ reason: 'hierarchy-changed' }` for all modes

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
- CommandRouter writes directly via `applyChildrenOrder()` during reorder
- SceneHierarchyManager maintains it during `setParentContainer()` (add/remove from parent)
- Layout recalculation uses `objectStateManager.getContainerMode()` (not `autoLayout?.enabled`)

### containerMode Sync
- **OSM → SC sync**: `updateSceneController()` syncs `containerMode` to SceneController objects
- **SceneLayoutManager gate**: `updateContainer()` routes by `containerMode` — layout, hug, or manual
- Without this sync, mode changes via property panel wouldn't propagate to the layout gate

### Container Resize on Drag-Drop
All three container modes respond to hierarchy changes via `updateContainer({ reason: 'hierarchy-changed' })`:
- **Layout**: Full layout recalculation — positions children, resizes container on non-fill axes
- **Hug**: Resize to fit all children with padding
- **Manual**: One-shot expand-to-fit — grows container if children extend beyond bounds, never shrinks

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

Each item calculates its own drop zone based on cursor Y position within its bounds. The visual indicator is an **absolutely positioned div** (`bg-blue-500`, `z-10`, `pointer-events-none`) inside the item's `relative` wrapper.

```
┌─────────────────────┐
│▓▓ blue line top ▓▓▓▓│  ← cursor in top half → "before" indicator
│   List Item 1       │
│▓▓ blue line bot ▓▓▓▓│  ← cursor in bottom half → "after" indicator
└─────────────────────┘
```

**Indicator normalization**: To prevent duplicate lines at the boundary between two items, "before item N" (N>0) is normalized to "after item N-1". Only the first item can show a "before" indicator.

**Depth-aware indentation**: The indicator line's left edge is set to `depth * 16 + 8` px — matching the content indentation of items at that hierarchy level. This visually communicates which parent level the drop target belongs to (e.g., root items start at 8px, first-level children at 24px).

**Regular objects** — two-zone:
- Top 50% → `position: 'before'`
- Bottom 50% → `position: 'after'`

**Containers** — three-zone:
- Top 25% → `position: 'before'`
- Middle 50% → `position: 'into'` (container highlight, no line indicator)
- Bottom 25% → `position: 'after'`

**Why absolute divs?** Previous approaches (outset box-shadow, inset box-shadow) failed due to overflow clipping by `overflow-hidden`/`overflow-y-auto` ancestors and CSS paint order issues where child backgrounds covered parent shadows. Absolute divs with `z-10` are immune to both problems.

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
