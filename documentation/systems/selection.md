# Selection System

Container-first selection with direct object access through double-click.

## Core Pattern

### Container-First Logic
- **Single-click child object** → selects parent container (when not in container context)
- **Single-click child object** → selects child directly (when already stepped into parent container)
- **Double-click child object** → steps into container, selects child directly
- **Double-click empty space** → navigates up one level
- **Escape** → navigates up one level
- **Selection priority**: Context-aware container logic > Individual object

### Selection Operations
- `selectionController.select(object)` — context-aware selection with container-first logic
- `selectionController.select(object, { direct: true })` — UI-initiated, bypasses container-first and navigates to parent
- `selectionController.select(object, { resolved: true })` — target already resolved, skips container-first resolution
- `selectionController.deselect(object)`
- `selectionController.toggle(object)`
- `selectionController.clearSelection()`

## Architecture

### SelectionController
**File**: `interaction/selection-controller.js`
- Core selection state (Set of meshes)
- Container-first resolution via `resolveSelectionTarget()`
- Click handling: `handleObjectClick()` → resolves target → `select({ resolved: true })`
- Double-click delegates to NavigationController
- Emits selection events via ObjectEventBus → SimpleCommunication → UI

### NavigationController
**File**: `application/managers/navigation-controller.js`
- **Single authority** for container hierarchy navigation state
- `navigationStack` + `currentContainer` — the canonical context stack
- `navigateToContainer()`, `navigateUp()`, `navigateToRoot()`, `navigateToObject()`
- `getContextStackMeshes()` — returns full stack as Three.js meshes
- Visual state applied via ContainerVisualizer
- Keyboard: Escape → `navigateUp()`

### ContainerVisualizer
**File**: `interaction/container-visualizer.js`
- Visual-only: wireframe states, padding visualization, child container visibility
- Reads navigation state from NavigationController (no local stack)
- `stepIntoContainer()` — applies faded wireframe, disables interactive mesh
- `exitAllContainerContexts()` — cleans up all container wireframes

### VisualizationManager
**File**: `interaction/visualization-manager.js`
- Unified visual state management (`setState(object, state)`)
- States: `normal`, `selected`, `hovered`, `multi-selected`, `context`, `selected-in-context`

## Selection Flow

### Click → Selection
1. InputController raycasts, resolves support meshes to main objects
2. SelectTool delegates to `SelectionController.handleObjectClick()`
3. SelectionController applies container-first logic (child → parent container)
4. `select({ resolved: true })` updates state, visualization, emits events
5. ObjectEventBus → SimpleCommunication → UI panels update

### Double-Click → Step In
1. InputController detects double-click, uses `raycastForDoubleClick()` (returns actual child, not parent)
2. SelectTool delegates to `SelectionController.handleDoubleClick()`
3. NavigationController.handleDoubleClick() → `navigateToContainer()` or `navigateToObject()`
4. ContainerVisualizer applies faded wireframe, disables interactive mesh
5. Subsequent clicks select children directly (in-context)

### UI → Scene Selection
1. ObjectTree click → postMessage `object-select` with `directSelection: true`
2. CommandRouter → `SelectionController.select(mesh, { direct: true })`
3. NavigationController automatically navigates to parent container

### Object Deletion → Selection Cleanup
Both deletion paths clear selection before removing objects:
1. **UI-initiated** (CommandRouter.handleDeleteObject): `clearSelection()` → `removeObject()`
2. **Keyboard** (DeleteObjectCommand.execute): `clearSelection()` → `removeObject()`
`clearSelection()` calls `notifySelectionChange()` which emits `selection-changed` through ObjectEventBus → SimpleCommunication → UI stores, preventing phantom objects in the property panel.

## Raycasting Layers
- **Layer 0**: Regular objects (default)
- **Layer 1**: Container interactive meshes
- When container selected: Layer 1 first (for face detection by move/push tools), fallback to Layer 0
- When no container selected: Layer 0 only

## Key Methods

### SelectionController
- `handleObjectClick(object, event)` — main click entry point
- `handleDoubleClick(hit, event)` — delegates to NavigationController
- `handleEmptySpaceClick(event)` — delegates to NavigationController
- `resolveSelectionTarget(object)` — container-first resolution
- `isObjectPartOfContainer(objectData, containerMesh)` — context validation

### NavigationController
- `navigateToContainer(containerId, options)` — step into container
- `navigateToObject(objectId, options)` — navigate to any object atomically
- `navigateUp()` — step out one level
- `navigateToRoot(options)` — exit all containers
- `isInContainerContext()` — check current state
- `getContextStackMeshes()` — full stack as meshes
