# Selection System

Container-first selection with direct object access through double-click. Centralized resolution, bidirectional hover, and consistent highlighting between 3D scene and UI tree.

## Core Pattern

### Container-First Logic
- **Single-click child object** → selects parent container (when not in container context)
- **Single-click child object** → selects child directly (when already stepped into parent container)
- **Double-click child object** → steps into container, selects child directly
- **Double-click empty space** → navigates up one level
- **Escape** → navigates up one level
- **Selection priority**: Context-aware container logic > Individual object

### Selection Operations
All paths go through `resolveSelectionTarget(object, options)` — the single source of truth for "what should get selected":
- `selectionController.select(object)` — context-aware selection with container-first logic
- `selectionController.select(object, { direct: true })` — UI-initiated, selects exact object and navigates to parent container
- `selectionController.select(object, { skipResolution: true })` — target already resolved, skips resolution
- `selectionController.deselect(object)`
- `selectionController.toggle(object)`
- `selectionController.clearSelection()`

### Hover (Bidirectional)
- **3D → Tree**: Tools emit `interaction:hover` via ObjectEventBus → SimpleCommunication → `hover-changed` postMessage → `hoveredObjectId` Svelte store → ObjectTree highlights
- **Tree → 3D**: ObjectTree sends `object-hover` postMessage → CommandRouter → `VisualizationManager.setState('hovered')`
- Hover store (`hoveredObjectId` in modler.ts) is shared — both paths update it

### Container Context Communication
- `notifySelectionChange()` piggybacks `containerContext` on the `object:selection` event
- SimpleCommunication forwards it in `selection-changed` → threejs-bridge → `syncContainerContextFromThreeJS()` → `containerContext` Svelte store
- ObjectTree uses `$containerContext` for context-aware highlighting

## PropertyPanel Display Target

The PropertyPanel always shows data from the `displayObject` derived store, which uses this priority chain:

```
displayObject = multiSelection || selectedObject || contextDisplayObject
```

- **multiSelection**: When 2+ objects selected, a merged object with shared/mixed properties
- **selectedObject**: When exactly 1 object selected, its full ObjectData
- **contextDisplayObject**: When nothing is selected but inside a container context, the container's full ObjectData (ensures tile/layout sections show)

### How contextDisplayObject flows:
1. NavigationController.navigateToContainer() clears selection
2. SelectionController.notifySelectionChange() emits `object:selection` with `containerContext`
3. SimpleCommunication.handleSelectionEvent() extracts full container data via `getCompleteObjectData(containerId)`
4. `selection-changed` postMessage carries `contextContainerData` alongside `selectedObjects` and `containerContext`
5. threejs-bridge calls `syncSelectionEventFromThreeJS()` which batches all three store updates
6. PropertyPanel reactively displays tile/layout sections from contextDisplayObject

### Store batching
`syncSelectionEventFromThreeJS()` in modler.ts groups three store updates into one call:
- `syncSelectionFromThreeJS(selectedObjects)`
- `syncContainerContextFromThreeJS(containerContext)`
- `syncContextDisplayFromThreeJS(contextContainerData)`

This prevents displayObject from recalculating 2-3 times per selection change.

## Architecture

### SelectionController
**File**: `interaction/selection-controller.js`
- Core selection state (Set of meshes)
- `resolveSelectionTarget(object, options)` — **single source of truth** for selection resolution
  - Returns `{ target: mesh, navigateTo: containerId|null }`
  - `options.direct` → UI tree: select as-is, navigate to parent
  - `options.skipResolution` → already resolved, return as-is
  - Default → 3D click: container-first walk to root container
- Click handling: `handleObjectClick()` → `resolveSelectionTarget()` → `select({ skipResolution: true })`
- Double-click delegates to NavigationController
- `notifySelectionChange()` emits selection + containerContext via ObjectEventBus

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
3. `resolveSelectionTarget()` applies container-first logic (child → parent container)
4. `select({ skipResolution: true })` updates state, visualization, emits events
5. ObjectEventBus → SimpleCommunication → UI panels update (includes containerContext)

### Double-Click → Step In
1. InputController detects double-click, uses `raycastForDoubleClick()` (returns actual child, not parent)
2. SelectTool delegates to `SelectionController.handleDoubleClick()`
3. NavigationController.handleDoubleClick() → `navigateToContainer()` or `navigateToObject()`
4. ContainerVisualizer applies faded wireframe, disables interactive mesh
5. Subsequent clicks select children directly (in-context)

### UI → Scene Selection
1. ObjectTree click → postMessage `object-select` with `directSelection: true`
2. CommandRouter → `SelectionController.select(mesh, { direct: true })`
3. `resolveSelectionTarget({ direct: true })` returns `{ target: mesh, navigateTo: parentId }`
4. NavigationController automatically navigates to parent container

### Hover (Bidirectional)
**3D hover → Tree highlight:**
1. Tool `onHover()` → `VisualizationManager.setState('hovered')` + `BaseTool.emitHoverChange(objectId)`
2. ObjectEventBus `interaction:hover` → SimpleCommunication → `hover-changed` postMessage
3. threejs-bridge → `syncHoverFromThreeJS()` → `hoveredObjectId` store
4. ObjectTree reactively highlights `$hoveredObjectId === object.id`

**Tree hover → 3D highlight:**
1. ObjectTree `handleObjectMouseEnter()` → `hoveredObjectId.set(id)` + postMessage `object-hover`
2. CommandRouter.handleObjectHover() → `VisualizationManager.setState('hovered')`

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
- `resolveSelectionTarget(object, options)` — unified resolution returning `{ target, navigateTo }`
- `isObjectPartOfContainer(objectData, containerMesh)` — context validation

### BaseTool
- `emitHoverChange(objectId)` — emits `interaction:hover` via ObjectEventBus
- `clearHover()` — clears visual state and emits hover change

### NavigationController
- `navigateToContainer(containerId, options)` — step into container
- `navigateToObject(objectId, options)` — navigate to any object atomically
- `navigateUp()` — step out one level
- `navigateToRoot(options)` — exit all containers
- `isInContainerContext()` — check current state
- `getContextStackMeshes()` — full stack as meshes
