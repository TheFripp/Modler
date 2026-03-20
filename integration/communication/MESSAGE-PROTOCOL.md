# Message Protocol Reference

**Version**: 1.0.0
**Date**: 2025-10-22
**Status**: Living Document

## Overview

This document defines the message protocol for UI ↔ Main communication via `postMessage`. All messages are routed through **CommandRouter** which provides centralized action handling.

## Architecture

```
UI (Svelte) → postMessage → SimpleCommunication.initializeUIToMain → CommandRouter.execute → Handler
```

## Message Structure

All messages follow this structure:

```typescript
{
  type: string;           // Required: Message type (maps to CommandRouter handler)
  ...parameters           // Message-specific parameters
}
```

## Message Types

### Property Updates

#### `update-property`
Update any object property.

**Parameters:**
- `objectId: number` - ID of object to update
- `property: string` - Property path (e.g., "dimensions.x", "material.color")
- `value: any` - New value
- `source?: string` - Optional source identifier (default: "input")

**Aliases:** `property-update`

**Example:**
```javascript
window.parent.postMessage({
  type: 'update-property',
  objectId: 42,
  property: 'dimensions.x',
  value: 100
}, '*');
```

#### `update-dimension`
Shorthand for dimension updates.

**Parameters:**
- `objectId: number`
- `axis: 'x' | 'y' | 'z'`
- `value: number`
- `source?: string`

**Maps to:** `update-property` with `property: 'dimensions.{axis}'`

#### `update-position`
Shorthand for position updates.

**Parameters:**
- `objectId: number`
- `axis: 'x' | 'y' | 'z'`
- `value: number`
- `source?: string`

**Maps to:** `update-property` with `property: 'position.{axis}'`

#### `update-rotation`
Shorthand for rotation updates.

**Parameters:**
- `objectId: number`
- `axis: 'x' | 'y' | 'z'`
- `value: number` (in degrees)
- `source?: string`

**Maps to:** `update-property` with `property: 'rotation.{axis}'`

#### `update-color`
Shorthand for material color updates.

**Parameters:**
- `objectId: number`
- `value: string` (hex color)
- `source?: string`

**Maps to:** `update-property` with `property: 'material.color'`

#### `update-opacity`
Shorthand for material opacity updates.

**Parameters:**
- `objectId: number`
- `value: number` (0-1)
- `source?: string`

**Maps to:** `update-property` with `property: 'material.opacity'`

---

### Layout Operations

#### `toggle-fill-mode`
Toggle fill mode on a specific axis.

**Parameters:**
- `objectId: number`
- `axis: 'x' | 'y' | 'z'`

**Aliases:** `fill-button-toggle`

**Example:**
```javascript
window.parent.postMessage({
  type: 'toggle-fill-mode',
  objectId: 42,
  axis: 'x'
}, '*');
```

#### `button-hover`
**CONSOLIDATED (v1.1.0)**: Unified visual feedback for all button hover interactions (face highlighting).

**Parameters:**
- `buttonType: 'fill' | 'layout'` - Type of button (optional for backward compatibility)
- `objectId: number` - ID of object to highlight
- `axis: 'x' | 'y' | 'z'` - Axis/face to highlight
- `isHovering: boolean` - True when hovering, false when leaving

**Legacy Aliases:** `fill-button-hover`, `layout-button-hover` (supported for backward compatibility)

**Note:** Visual-only, does not modify state. Used by fill buttons, layout buttons, and tile controls.

**Example:**
```javascript
window.parent.postMessage({
  type: 'button-hover',
  buttonType: 'fill',
  objectId: 42,
  axis: 'x',
  isHovering: true
}, '*');
```

#### `update-layout-property`
Update layout-related properties.

**Parameters:**
- `objectId: number`
- `property: string` (e.g., "sizeX", "sizeY", "sizeZ")
- `value: any`

#### `toggle-hug-mode`
Toggle hug mode on a container.

**Parameters:**
- `objectId: number`

#### `update-layout-direction`
Update layout direction for a container.

**Parameters:**
- `objectId: number`
- `direction: 'x' | 'y' | 'z'`

**Maps to:** `update-property` with `property: 'autoLayout.direction'`

#### `update-layout-gap`
Update gap between children in a layout container.

**Parameters:**
- `objectId: number`
- `gap: number`

**Maps to:** `update-property` with `property: 'autoLayout.gap'`

---

### Selection Operations

#### `select-object`
Select an object (replace current selection).

**Parameters:**
- `objectId: number`
- `addToSelection?: boolean` - Add to selection instead of replace
- `isShiftClick?: boolean` - Alternative to addToSelection
- `directSelection?: boolean` - Bypass container-first logic

**Aliases:** `object-select`

**Example:**
```javascript
window.parent.postMessage({
  type: 'object-select',
  objectId: 42,
  directSelection: true  // Select from ObjectTree bypasses container-first
}, '*');
```

#### `deselect-all`
Clear all selections.

**Parameters:** None

#### `multi-select`
Select multiple objects at once.

**Parameters:**
- `objectIds: number[]` - Array of object IDs to select

---

### Hierarchy Operations

#### `move-to-container`
Move an object into a container.

**Parameters:**
- `objectId: number` - Object to move
- `targetContainerId: number` - Container to move into

**Aliases:** `object-move-to-container`

**Note:** CommandRouter supports legacy `containerId` parameter for backward compatibility, but `targetContainerId` is preferred.

**Example:**
```javascript
window.parent.postMessage({
  type: 'move-to-container',
  objectId: 42,
  targetContainerId: 100
}, '*');
```

#### `move-to-root`
Move an object to root level (remove from container).

**Parameters:**
- `objectId: number` - Object to move

**Aliases:** `object-move-to-root`

#### `reorder-children`
Reorder children within a container or at root level.

**Parameters:**
- `objectId: number` - Object being moved
- `targetId: number` - Object to position relative to
- `position: 'before' | 'after'` - Position relative to target
- `parentId: number | null` - Parent container ID (null for root level)

**Aliases:** `object-reorder`

**Legacy Support:** Also accepts `childId`, `newIndex`, `childrenOrder` for backward compatibility

**Example:**
```javascript
window.parent.postMessage({
  type: 'reorder-children',
  objectId: 18,
  targetId: 19,
  position: 'after',
  parentId: 20  // null for root level
}, '*');
```

#### `reverse-child-order`
Reverse the order of all children in a container.

**Parameters:**
- `parentId: number | null` - Parent container ID (null for root level)

---

### Object Lifecycle

#### `delete-object`
Delete one or more objects.

**Parameters:**
- `objectId?: number` - Single object to delete
- `objectIds?: number[]` - Multiple objects to delete

**Aliases:** `object-delete`

**Example:**
```javascript
// Delete single object
window.parent.postMessage({
  type: 'delete-object',
  objectIds: [42, 43, 44]
}, '*');
```

#### `duplicate-object`
Duplicate an object.

**Parameters:**
- `objectId: number`

#### `rename-object`
Rename an object.

**Parameters:**
- `objectId: number`
- `name: string`

**Maps to:** `update-property` with `property: 'name'`

---

### Container Operations

#### `create-container`
Convert an object into a layout container.

**Parameters:**
- `objectId: number`
- `direction?: 'x' | 'y' | 'z'` - Layout direction (default: 'x')
- `gap?: number` - Gap between children (default: 10)

**Aliases:** `create-layout-container`

#### `create-tiled-container`
Create a tiled container (repeated pattern).

**Parameters:**
- `objectId: number`
- `axis?: 'x' | 'y' | 'z'` - Tile direction (default: 'x')
- `repeat?: number` - Number of repetitions (default: 3)
- `gap?: number` - Gap between tiles (default: 10)

**Example:**
```javascript
window.parent.postMessage({
  type: 'create-tiled-container',
  objectId: 42,
  axis: 'x',
  repeat: 5,
  gap: 20
}, '*');
```

---

### Tool Operations

#### `activate-tool`
Activate a specific tool.

**Parameters:**
- `toolId: string` - Tool identifier (e.g., "select", "box-creation", "push", "move")

**Aliases:** `tool-activate`

#### `snap-toggle`
Toggle grid snapping on/off.

**Parameters:** None

---

### History Operations

#### `undo`
Undo last action.

**Parameters:** None

#### `redo`
Redo last undone action.

**Parameters:** None

---

### System Operations

#### `ui-panel-ready`
Notify Main that UI panel has loaded and is ready.

**Parameters:** None

**Aliases:** `left-panel-ready`

**Note:** Triggers initial hierarchy and selection state sync from Main to UI

#### `keyboard-event`
Forward keyboard events from UI to Main.

**Parameters:**
- `key: string` - Key name (e.g., "Tab")
- `code: string` - Key code (e.g., "Tab")

**Example:**
```javascript
window.parent.postMessage({
  type: 'keyboard-event',
  key: 'Tab',
  code: 'Tab'
}, '*');
```

#### `request-file-manager-ready`
Request file manager initialization.

**Parameters:** None

#### `file-manager-request`
File management request (save, load, export).

**Parameters:**
- `data: object` - File operation data

---

### Settings Operations

#### `get-cad-wireframe-settings`
Request CAD wireframe settings.

**Parameters:** None

**Response:** Main sends settings via postMessage back to UI

#### `cad-wireframe-settings-changed`
Update CAD wireframe settings.

**Parameters:**
- `settings: object` - New wireframe settings

**Alternative format:**
- `data: { settings: object }` - Nested format

#### `get-visual-settings`
Request visual settings.

**Parameters:** None

#### `visual-settings-changed`
Update visual settings.

**Parameters:**
- `settings: object` - New visual settings

#### `get-scene-settings`
Request scene settings.

**Parameters:** None

#### `scene-settings-changed`
Update scene settings.

**Parameters:**
- `settings: object` - New scene settings

#### `get-interface-settings`
Request interface settings.

**Parameters:** None

#### `interface-settings-changed`
Update interface settings.

**Parameters:**
- `settings: object` - New interface settings

---

## Main → UI Messages

These messages are sent FROM Main TO UI via `SimpleCommunication.sendToAllIframes()`:

### `object-changed`
Sent when object properties change.

**Data:**
```javascript
{
  type: 'object-changed',
  data: {
    objectId: number,
    eventType: string,
    object: ObjectData  // Complete object data
  }
}
```

### `selection-changed`
Sent when selection changes.

**Data:**
```javascript
{
  type: 'selection-changed',
  data: {
    selectedObjectIds: number[],
    selectedObjects: ObjectData[]  // Complete data for each selected object
  }
}
```

### `hierarchy-changed`
Sent when object hierarchy changes (creation, deletion, reordering, parent change).

**Data:**
```javascript
{
  type: 'hierarchy-changed',
  data: {
    hierarchy: {
      objects: ObjectData[],           // Flat array of all objects
      rootChildrenOrder: number[]      // Root-level object ordering
    }
  }
}
```

### `tool-changed`
Sent when active tool changes.

**Data:**
```javascript
{
  type: 'tool-changed',
  data: {
    toolName: string,
    active: boolean,
    toolState: object
  }
}
```

---

## Best Practices

### 1. Use Typed Messages
Define TypeScript interfaces for all messages (see `/svelte-ui/src/lib/types/messages.ts`).

### 2. Prefer Specific Message Types
Use specific message types (`update-dimension`) over generic (`update-property`) when available for better type safety and clarity.

### 3. Include Source Parameter
Always include `source` parameter for property updates to aid debugging and prevent circular updates.

### 4. Use Aliases Consistently
Stick to primary message type names (e.g., `select-object` not `object-select`) unless maintaining legacy code.

### 5. Never Bypass CommandRouter
All UI → Main messages must go through `CommandRouter.execute()` via postMessage. Never call Main methods directly.

---

## Changelog

### v1.1.0 (2025-10-22)
- **Breaking Change (with backward compatibility)**: Consolidated `fill-button-hover` and `layout-button-hover` into single `button-hover` message type
- Added `buttonType` parameter to distinguish button types ('fill' | 'layout')
- Maintained legacy message type aliases for backward compatibility
- Settings messages already support both nested and flat formats (no changes needed)

### v1.0.0 (2025-10-22)
- Initial documentation
- Extracted from CommandRouter implementation
- Standardized `move-to-container` to use `targetContainerId`
- Added `reorder-children` with ObjectTree drag-drop format
- Documented all 40+ message types

---

## See Also

- `/application/command-router.js` - Handler implementations
- `/integration/communication/simple-postmessage.js` - Message routing
- `/svelte-ui/src/lib/types/messages.ts` - TypeScript type definitions
- `/documentation/refactoring/COMMUNICATION-SIMPLIFICATION-2025.md` - Architecture overview
