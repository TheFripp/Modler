# Message Protocol Reference

**Version**: 1.2.0
**Date**: 2026-03-20
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

#### `object-hover`
Highlight object in 3D scene from UI tree hover.

**Parameters:**
- `objectId: number` - Object to highlight
- `isHovering: boolean` - True when hovering, false when leaving

**Note:** Visual-only feedback. Does not change state of selected objects.

**Example:**
```javascript
window.parent.postMessage({
  type: 'object-hover',
  objectId: 42,
  isHovering: true
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

Settings follow a consistent request-response pattern. Each settings category has a paired `get-{prefix}-settings` request and `{prefix}-settings-changed` update message. Responses come back as `{prefix}-settings-response`.

**Pattern:**
```
UI sends:  get-{prefix}-settings         → Main responds: {prefix}-settings-response
UI sends:  {prefix}-settings-changed     → Main applies via ConfigurationManager
```

**Three-file contract for each settings category:**
1. **CommandRouter** (`settingsRoutes` object) — maps `{prefix}` to SettingsHandler method suffix
2. **SettingsHandler** — implements `handle{Suffix}SettingsUpdate(settings)` and `handleGet{Suffix}Settings(source)`
3. **SettingsPanel.svelte** — sends messages and handles `{prefix}-settings-response`

**Config key consistency:** The keys sent by SettingsPanel must match the keys in `CONFIGURATION_SCHEMA` (`configuration-schema.js`). SettingsHandler must read using the same keys.

#### Settings Categories

| Prefix | CommandRouter Suffix | Config Keys | Handler |
|--------|---------------------|-------------|---------|
| `cad-wireframe` | `CadWireframe` | `visual.cad.wireframe.*` | SettingsHandler |
| `visual` | `Visual` | `visual.selection.*`, `visual.containers.*` | SettingsHandler |
| `scene` | `Scene` | `scene.backgroundColor`, `scene.gridMainColor`, `scene.gridSubColor` | SettingsHandler |
| `interface` | `Interface` | `interface.*` | SettingsHandler |
| `unit` | `Unit` | Uses `UnitConverter.setUserUnit()` | SettingsHandler |

#### `get-{prefix}-settings`
Request current settings for a category.

**Parameters:** None

**Response:** Main sends `{prefix}-settings-response` with `{ settings: object }` back to requesting panel via PanelCommunication.

#### `{prefix}-settings-changed`
Update settings for a category.

**Parameters:**
- `settings: object` - Key-value pairs of config paths and values

**Alternative format:**
- `data: { settings: object }` - Nested format

**Example (scene settings):**
```javascript
// Request current scene settings
window.parent.postMessage({ type: 'get-scene-settings' }, '*');

// Update a scene setting
window.parent.postMessage({
  type: 'scene-settings-changed',
  settings: { 'scene.backgroundColor': '#2a2a2a' }
}, '*');

// Handle response
window.addEventListener('message', (event) => {
  if (event.data.type === 'scene-settings-response') {
    const { backgroundColor, gridMainColor, gridSubColor } = event.data.settings;
  }
});
```

**Example (unit settings):**
```javascript
// Request current unit
window.parent.postMessage({ type: 'get-unit-settings' }, '*');

// Change unit
window.parent.postMessage({
  type: 'unit-settings-changed',
  settings: { 'unit.current': 'cm' }
}, '*');

// Handle response
// event.data = { type: 'unit-settings-response', settings: { currentUnit: 'cm' } }
```

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

### Yard Operations (Material Library)

#### `yard-get-library`
Request full yard library data.
- **Direction**: UI → Main
- **Response**: `yard-library-response` sent back to requesting iframe

#### `yard-add-item`
Add a new user item to the yard.
- **Direction**: UI → Main
- **Parameters**: `{ item: { name, category, subcategory, tags, dimensions, fixedDimensions, material } }`
- **Effect**: Saves to localStorage, broadcasts `yard-library-updated`

#### `yard-update-item`
Update an existing user item.
- **Direction**: UI → Main
- **Parameters**: `{ itemId: string, updates: Partial<YardItem> }`

#### `yard-remove-item`
Remove a user item from the yard (builtins cannot be removed).
- **Direction**: UI → Main
- **Parameters**: `{ itemId: string }`

#### `yard-place-item`
Place a yard item into the scene as a new object.
- **Direction**: UI → Main
- **Parameters**: `{ itemId: string }`
- **Effect**: Creates object via `CreateObjectCommand` with `yardItemId` and `yardFixed` metadata

#### `yard-library-response` / `yard-library-updated`
- **Direction**: Main → UI
- **Data**: `{ items: YardItem[], categories: YardCategory[] }`

#### `show-add-to-yard-dialog`
- **Direction**: Main → UI (left panel)
- **Data**: `{ name, dimensions, material }` — pre-populated from right-clicked object
- **Effect**: Switches to Yard tab, opens Add to Yard dialog

#### `yard-get-materials-list`
Request the list of yard items currently placed in the scene.
- **Direction**: UI → Main
- **Parameters**: none

#### `yard-materials-list`
- **Direction**: Main → UI
- **Data**: `MaterialsListItem[]` — `{ yardItemId, name, category, subcategory, count, dimensions }`
- **Triggered by**: `yard-get-materials-list` request, or automatically on object lifecycle events (create/delete/undo)

---

## Changelog

### v1.4.0 (2026-03-22)
- Added `yard-get-materials-list` (UI→Main) and `yard-materials-list` (Main→UI) for tracking yard items in use
- Yard objects now display purple CAD wireframes to distinguish them from regular objects
- Dimension locking enforced in ObjectStateManager for yard-fixed axes
- Left panel restructured: Files/Settings moved to header icon buttons, Materials tab added

### v1.3.0 (2026-03-21)
- Added Yard (material library) operations: `yard-get-library`, `yard-add-item`, `yard-update-item`, `yard-remove-item`, `yard-place-item`
- Added `yard-library-response`, `yard-library-updated`, `show-add-to-yard-dialog` Main→UI messages
- Objects placed from Yard carry `yardItemId` and `yardFixed` metadata through DataExtractor pipeline

### v1.2.0 (2026-03-20)
- Added `object-hover` message type documentation (was missing)
- Added `unit-settings-changed` / `get-unit-settings` — unit settings now route through SettingsHandler like all other settings
- Documented settings handler pattern: three-file contract (CommandRouter settingsRoutes, SettingsHandler methods, SettingsPanel messages)
- Fixed scene settings config path mismatch (`scene.background.color` → `scene.backgroundColor` to match CONFIGURATION_SCHEMA)

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
