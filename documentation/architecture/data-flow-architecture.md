# Data Flow Architecture

**Version**: 1.0.0
**Status**: Current
**Last Updated**: 2025-01-30

## Overview

Modler V2 implements a **unidirectional data flow** architecture with clear separation between CAD geometry operations and visual transform operations. This document maps the complete data flow from user interaction to UI updates.

---

## Core Principles

### 1. Single Source of Truth
- **SceneController** owns all 3D geometry data
- **ObjectStateManager** coordinates state updates
- **GeometryUtils** performs CAD vertex manipulation
- **TransformationManager** handles visual positioning

### 2. Unidirectional Flow
```
User Input → Tool → ObjectStateManager → SceneController → GeometryUtils → UI Update
```

### 3. Separation of Concerns
- **CAD Operations**: Modify geometry vertices directly
- **Transform Operations**: Modify visual position/rotation/scale
- **State Management**: Coordinate updates between systems
- **UI Communication**: PropertyPanelSync is ONLY postMessage source

---

## CAD Operation Data Flow

### Example: Push Tool (Face Extrusion)

```
┌─────────────────────────────────────────────────────────────┐
│ 1. USER INTERACTION                                         │
│    User drags face with Push Tool                           │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. TOOL LAYER (push-tool.js)                                │
│    - modifyRegularGeometry(delta)                           │
│    - GeometryUtils.pushGeometryFace(geometry, axis, dir, Δ) │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. CAD GEOMETRY LAYER (geometry-utils.js)                   │
│    - Direct vertex manipulation:                            │
│      vertices[i + axisIndex] += delta                       │
│    - positions.needsUpdate = true                           │
│    - geometry.computeBoundingBox()                          │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. REAL-TIME FEEDBACK (push-tool.js)                        │
│    - refreshVisualFeedback()                                │
│    - GeometryUtils.updateSupportMeshGeometries(mesh)        │
│    - Wireframes update immediately                          │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│ 5. STATE COORDINATION (push-tool.js → finalizePush)         │
│    - dimensions = GeometryUtils.getGeometryDimensions()     │
│    - ObjectStateManager.updateObject(id, { dimensions })    │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│ 6. STATE PROPAGATION (object-state-manager.js)              │
│    - propagateChanges()                                     │
│    - updateSceneController(changedObjects)                  │
│    - Apply dimension updates                                │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│ 7. SCENE CONTROLLER (scene-controller.js)                   │
│    - updateObjectDimensions(objectId, axis, newDimension)   │
│    - GeometryUtils.scaleGeometryAlongAxis()                 │
│    - GeometryUtils.updateSupportMeshGeometries()            │
│    - TransformNotificationUtils.completeDimensionChange()   │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│ 8. EVENT EMISSION (transform-notification-utils.js)         │
│    - ObjectEventBus.emit(GEOMETRY, objectId, data)          │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│ 9. UI COMMUNICATION (property-panel-sync.js)                │
│    - Listens to ObjectEventBus GEOMETRY events              │
│    - sendToUI('object-modified-geometry', objects)          │
│    - iframe.contentWindow.postMessage(data, '*')            │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│ 10. UI UPDATE (svelte-ui/PropertyPanel.svelte)              │
│     - Receives postMessage                                  │
│     - Updates dimension input fields                        │
│     - User sees new dimensions                              │
└─────────────────────────────────────────────────────────────┘
```

**Key Code Locations**:
- Push Tool: `application/tools/push-tool.js:415`
- CAD Geometry: `application/utilities/geometry-utils.js:162`
- State Manager: `core/object-state-manager.js:261`
- Scene Controller: `scene/scene-controller.js:742`
- UI Sync: `integration/svelte/property-panel-sync.js:388`

---

## Transform Operation Data Flow

### Example: Move Tool (Position Change)

```
┌─────────────────────────────────────────────────────────────┐
│ 1. USER INTERACTION                                         │
│    User drags object with Move Tool                         │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. TOOL LAYER (move-tool.js)                                │
│    - handleDrag(delta)                                      │
│    - Calculate new position                                 │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. TRANSFORM LAYER (transformation-manager.js)              │
│    - setPosition(object, position, options)                 │
│    - object.position.copy(localPosition)                    │
│    - object.updateMatrix()                                  │
│    - NO GEOMETRY MODIFICATION                               │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. COMPLETION NOTIFICATION (transformation-manager.js)       │
│    - completeTransformation(object, 'position')             │
│    - ObjectStateManager.updateObject(id, { position })      │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│ 5. STATE PROPAGATION (object-state-manager.js)              │
│    - propagateChanges()                                     │
│    - updateSceneController(changedObjects)                  │
│    - Apply position updates                                 │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│ 6. SCENE CONTROLLER (scene-controller.js)                   │
│    - updateObjectPosition(objectId, axis, value)            │
│    - mesh.position[axis] = newPosition                      │
│    - TransformNotificationUtils.completeTransformChange()   │
│    - NO GEOMETRY MODIFICATION                               │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│ 7. EVENT EMISSION (transform-notification-utils.js)         │
│    - ObjectEventBus.emit(TRANSFORM, objectId, data)         │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│ 8. UI COMMUNICATION (main-integration.js)                   │
│    - ObjectStateManager 'objects-changed' event             │
│    - PropertyPanelSync.sendToUI('unified-update', objects)  │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│ 9. UI UPDATE (svelte-ui/PropertyPanel.svelte)               │
│    - Updates position input fields                          │
│    - User sees new position                                 │
└─────────────────────────────────────────────────────────────┘
```

**Key Code Locations**:
- Transform Manager: `application/utilities/transformation-manager.js:71`
- State Manager: `core/object-state-manager.js:486`
- Scene Controller: `scene/scene-controller.js:791`

---

## Critical Differences: CAD vs Transform

| Aspect | CAD Operations | Transform Operations |
|--------|----------------|---------------------|
| **What Changes** | Geometry vertices | Visual position/rotation/scale |
| **Example** | Push face, resize box | Move object, rotate object |
| **Implementation** | `vertices[i] += delta` | `mesh.position.copy(newPos)` |
| **Triggers** | GeometryUtils methods | TransformationManager methods |
| **Event Type** | `ObjectEventBus.GEOMETRY` | `ObjectEventBus.TRANSFORM` |
| **UI Update** | Dimension fields | Position/rotation fields |
| **Support Meshes** | Must be regenerated | No regeneration needed |

---

## Support Mesh Synchronization

Support meshes (wireframes, highlights) must stay synchronized with geometry changes.

### Sync Points

1. **After CAD Geometry Operations**:
```javascript
// scene-controller.js:767
GeometryUtils.updateSupportMeshGeometries(mesh);
```

2. **After Transform Operations**:
```javascript
// transformation-manager.js:522
geometryUtils.updateSupportMeshGeometries(object);
```

3. **Real-time During Push Tool**:
```javascript
// push-tool.js:436
geometryUtils.updateSupportMeshGeometries(meshToUpdate);
```

### Support Mesh Architecture

**Create Once Pattern**:
- Support meshes created at object creation
- Stored as children in `object.userData.supportMeshes`
- Updated when geometry changes
- Never destroyed/recreated

```javascript
object.userData.supportMeshes = {
    selectionWireframe: mesh,  // Selection highlight
    faceHighlight: mesh        // Push/move face highlight
};
```

---

## State Management Flow

### ObjectStateManager Role

ObjectStateManager is a **coordination layer**, NOT a duplicate data store.

```
┌──────────────────────────────────────────────────────────┐
│ ObjectStateManager (Coordinator)                         │
│ - Receives updates from tools                            │
│ - Batches changes for performance                        │
│ - Routes to SceneController (single source of truth)     │
│ - Emits events for UI systems                            │
└──────────────────────────────────────────────────────────┘
         │                              │
         ▼                              ▼
┌──────────────────┐          ┌──────────────────┐
│ SceneController  │          │  UI Systems      │
│ (3D Data Owner)  │          │  (React to events)│
│ - Geometry       │          │  - PropertyPanel │
│ - Meshes         │          │  - ObjectList    │
│ - Transforms     │          │  - Toolbars      │
└──────────────────┘          └──────────────────┘
```

### Update Flow

1. **Tool calls ObjectStateManager**:
```javascript
objectStateManager.updateObject(objectId, {
    dimensions: { x: 2, y: 3, z: 4 }
});
```

2. **ObjectStateManager batches and propagates**:
```javascript
propagateChanges() {
    this.updateSceneController(changedObjects);
    this.emitChangeEvents(changedItems);
}
```

3. **SceneController applies to 3D**:
```javascript
updateObjectDimensions(objectId, axis, value) {
    GeometryUtils.scaleGeometryAlongAxis(geometry, axis, value);
}
```

4. **Events trigger UI updates**:
```javascript
ObjectEventBus.emit(EVENT_TYPES.GEOMETRY, objectId, data);
```

---

## UI Communication Architecture

### PropertyPanelSync: Single PostMessage Source

**Rule**: ONLY PropertyPanelSync can call `postMessage()`.

**Why**:
- Port detection security
- Centralized message routing
- Consistent message formatting
- Easy debugging

### Correct Pattern

```javascript
// ✅ CORRECT
const propertyPanelSync = window.modlerComponents?.propertyPanelSync;
propertyPanelSync.sendToUI('data-update', objects, {
    throttle: false,
    panels: ['right']
});
```

### Violation Pattern

```javascript
// ❌ VIOLATION
iframe.contentWindow.postMessage({
    type: 'data-update',
    data: objects
}, '*');
```

**Enforcement**: All postMessage violations have been eliminated (see commit 93a6b0a).

---

## Integration Validation Checklist

When adding new features, verify:

- [ ] CAD operations use GeometryUtils vertex manipulation
- [ ] Transform operations use TransformationManager
- [ ] All state changes go through ObjectStateManager
- [ ] Support meshes updated after geometry changes
- [ ] UI updates via PropertyPanelSync (no direct postMessage)
- [ ] Events emitted via ObjectEventBus
- [ ] No duplicate state storage

---

## Performance Considerations

### Batching

ObjectStateManager batches updates for performance:

```javascript
scheduleUpdate() {
    if (!this.updateScheduled) {
        this.updateScheduled = true;
        requestAnimationFrame(() => {
            this.propagateChanges();
            this.updateScheduled = false;
        });
    }
}
```

### Real-time Feedback

Push tool updates support meshes immediately during drag:

```javascript
refreshVisualFeedback() {
    // Real-time updates during drag
    geometryUtils.updateSupportMeshGeometries(meshToUpdate);
}
```

### Throttling

UI updates are throttled to ~30fps:

```javascript
this.UI_THROTTLE_DELAY = 33; // ~30fps
```

---

## Related Documentation

- [Transform vs Geometry Guide](transform-vs-geometry.md)
- [Support Mesh Architecture](../systems/support-mesh-architecture.md)
- [ObjectStateManager API](../api/object-state-manager.md)
- [GeometryUtils Reference](../api/geometry-utils.md)

---

## Revision History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2025-01-30 | Initial documentation after foundation audit |
