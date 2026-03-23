# Undo/Redo System

## Architecture Overview

All undoable actions use a **post-hoc snapshot pattern**:

1. Action is performed (state already changed)
2. Command created with before/after state snapshots
3. `historyManager.executeCommand(command)` registers it
4. `execute()` is a no-op (`return true`) — action already happened
5. `undo()` restores the before-snapshot via `objectStateManager.updateObject()`
6. `redo()` re-applies the after-snapshot

## Key Components

### HistoryManager (`/application/managers/history-manager.js`)

- Maintains undo/redo stacks (max 50 steps)
- Sets `isUndoing`/`isRedoing`/`isExecuting` flags during replay to prevent recursive command creation
- `redo()` calls `command.redo()` if available, otherwise `command.execute()`

### CommandRouter (`/application/command-router.js`)

Central intercept point for wrapping property updates with undo commands:

1. `handlePropertyUpdate()` — wraps generic property changes (dimensions, position, rotation, material, name) with `UpdatePropertySnapshotCommand`
2. `_handleAutoLayoutPropertyUpdate()` — wraps layout property changes with `UpdateLayoutPropertyCommand`
3. `_handleTileRepeatUpdate()` — wraps tile repeat count changes with `UpdateTileRepeatCommand`
4. `handleFillModeToggle()` — wraps fill toggle with `UpdatePropertySnapshotCommand`

**Guards**: All paths skip command wrapping when `historyManager.isUndoing || isRedoing`.

**Excluded**: `containerMode`/`sizingMode` changes — already have their own command in `PropertyUpdateHandler.handleContainerSizingChange()`.

### PropertyUpdateHandler (`/application/handlers/property-update-handler.js`)

Pure state-update mechanism. **Command-unaware** — never creates or references commands. All undo wrapping happens in CommandRouter above it.

## Command Classes

| Command | File | What it wraps |
|---------|------|---------------|
| `UpdatePropertySnapshotCommand` | `commands/update-property-snapshot-command.js` | Generic property panel changes + fill toggle |
| `UpdateLayoutPropertyCommand` | `commands/update-layout-property-command.js` | Container layout property changes |
| `CreateTileContainerCommand` | `commands/create-tile-container-command.js` | TileTool container creation |
| `UpdateTileRepeatCommand` | `commands/update-tile-repeat-command.js` | Tile repeat count changes (child add/remove) |
| `CreateObjectCommand` | `commands/create-object-command.js` | Box creation tool |
| `DeleteObjectCommand` | `commands/delete-object-command.js` | Object deletion |
| `MoveObjectCommand` | `commands/move-object-command.js` | Move tool drag-end |
| `RotateObjectCommand` | `commands/rotate-object-command.js` | Rotation tool drag-end |
| `PushFaceCommand` | `commands/push-face-command.js` | Push tool drag-end |
| `DuplicateObjectCommand` | `commands/duplicate-object-command.js` | Duplicate (Cmd+D, Cmd+drag) |
| `CreateContainerCommand` | `commands/create-container-command.js` | Wrap selection in container |
| `UpdatePropertyCommand` | `commands/update-property-command.js` | Container mode/sizing changes |

## Design Decisions

### Tile instance sync is derivative

`TileInstanceManager.handleInstanceChange()` syncs geometry/material across siblings via events. When a source property change is undone, the event bus re-triggers the sync automatically. No command wrapping needed.

### Layout-safe snapshots

`UpdatePropertySnapshotCommand._filterLayoutSafeSnapshot()` strips position/rotation from snapshots when the object is in layout mode, since the layout system manages those.

### Snapshot scope by property

- `dimensions.*` → captures `{ dimensions, position, layoutProperties }` (push-tool and fill mode side-effects)
- `position.*` → captures `{ position }` (reads from `mesh.position`, not stale `obj.position`)
- `rotation.*` → captures `{ rotation }`
- `material.*` → captures `{ material }`
- `name` → captures `{ name }`

## Adding New Undoable Actions

1. Keep the action logic in its handler/tool (don't add history awareness)
2. In CommandRouter (or the tool's drag-end handler):
   - Capture before-snapshot
   - Perform the action
   - Capture after-snapshot
   - Create command if state changed
   - `historyManager.executeCommand(command)`
3. Create a command class extending `BaseCommand` with `execute()` (no-op), `undo()`, and `redo()`
4. Register the script in `index.html`
