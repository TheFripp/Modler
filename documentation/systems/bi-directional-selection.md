# Bi-Directional Selection Sync

How selection state flows between 3D scene and UI panels.

## Scene → UI

```
SelectionController.notifySelectionChange()
  → ObjectEventBus emits 'object:selection' (with containerContext)
  → SimpleCommunication.handleSelectionEvent()
    → DataExtractor extracts selectedObjects + contextContainerData
    → postMessage 'selection-changed' to all UI iframes
  → threejs-bridge.ts receives message
    → syncSelectionEventFromThreeJS() batches three store updates:
      1. syncSelectionFromThreeJS(selectedObjects)
      2. syncContainerContextFromThreeJS(containerContext)
      3. syncContextDisplayFromThreeJS(contextContainerData)
  → displayObject derived store recalculates
  → PropertyPanel, ObjectTree react
```

## UI → Scene

```
ObjectTree click
  → postMessage 'object-select' { objectId, directSelection, isShiftClick }
  → main-integration.js receives
  → CommandRouter.handleObjectSelect()
    → SelectionController.select(mesh, { direct: true })
    → resolveSelectionTarget() returns { target, navigateTo }
    → NavigationController.navigateToContainer() if needed
    → notifySelectionChange() → flows back via Scene → UI path
```

## Hover (Bidirectional)

**3D → Tree:**
1. Tool `onHover()` → `VisualizationManager.setState('hovered')` + `BaseTool.emitHoverChange(objectId)`
2. ObjectEventBus `interaction:hover` → SimpleCommunication → `hover-changed` postMessage
3. threejs-bridge → `syncHoverFromThreeJS()` → `hoveredObjectId` store → ObjectTree highlights

**Tree → 3D:**
1. ObjectTree mouseEnter → `hoveredObjectId.set(id)` + postMessage `object-hover`
2. CommandRouter.handleObjectHover() → `VisualizationManager.setState('hovered')`

## Key Files

| File | Role |
|------|------|
| `interaction/selection-controller.js` | Selection state, resolution, click handling |
| `application/managers/navigation-controller.js` | Container context stack |
| `integration/communication/simple-postmessage.js` | Main → UI event bridge |
| `svelte-ui/src/lib/bridge/threejs-bridge.ts` | UI-side message receiver |
| `svelte-ui/src/lib/stores/modler.ts` | Svelte stores, sync functions |
| `application/command-router.js` | UI → Main command routing |

## Message Format

### selection-changed (Main → UI)
```json
{
  "type": "selection-changed",
  "data": {
    "selectedObjectIds": [1, 2],
    "selectedObjects": [{ "id": 1, ... }, { "id": 2, ... }],
    "containerContext": { "containerId": 3, "containerName": "Group" },
    "contextContainerData": { "id": 3, "autoLayout": { "tileMode": {...} }, ... }
  }
}
```

### object-select (UI → Main)
```json
{
  "type": "object-select",
  "objectId": 1,
  "directSelection": true,
  "isShiftClick": false
}
```
