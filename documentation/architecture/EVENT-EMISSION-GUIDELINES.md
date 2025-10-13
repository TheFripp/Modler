# Event Emission Guidelines

**Version**: 1.0.0
**Date**: 2025-10-13
**Status**: Active
**Part of**: Refactoring Plan 2025-Q1, Phase 7

---

## Executive Summary

This document establishes guidelines for event emission in Modler V2. All state changes must flow through ObjectEventBus to maintain UI consistency and enable proper undo/redo functionality.

**Key Principle**: ObjectStateManager is the **single entry point** for all state changes. Never manipulate meshes directly.

---

## Event Flow Architecture

```
UI Input → PropertyUpdateRouter → ObjectStateManager → SceneController → ObjectEventBus → MainAdapter → UI
```

### Critical Rule
❌ **NEVER**:
- Directly manipulate `mesh.position`, `mesh.rotation`, `mesh.scale`
- Directly modify geometry vertices
- Call `window.postMessage` directly
- Bypass ObjectStateManager for state changes

✅ **ALWAYS**:
- Use `ObjectStateManager.updateObject()` for ALL state changes
- Let SceneController emit events automatically
- Use PropertyUpdateRouter for optimized paths
- Trust the event propagation system

---

## Event Types & Sources

### 1. Geometry Events
**Source**: SceneController (via ObjectStateManager)
**Types**:
- `object:geometry` - Dimensions changed
- `object:transform` - Position/rotation changed
- `object:material` - Color/opacity changed

**Legitimate Emitters**:
- `ObjectStateManager.updateSceneController()`
- `SceneController.updateObjectDimensions()`
- `SceneController.updateObjectPosition()`
- `SceneController.updateObjectRotation()`

### 2. Hierarchy Events
**Source**: SceneController
**Types**:
- `object:hierarchy` - Parent-child relationships changed
- `object:lifecycle` - Object created/deleted

**Legitimate Emitters**:
- `SceneController.addObject()`
- `SceneController.removeObject()`
- `SceneController.setParentContainer()`

### 3. Selection Events
**Source**: SelectionController
**Type**: `selection:changed`

**Legitimate Emitters**:
- `SelectionController.select()`
- `SelectionController.clearSelection()`

### 4. Tool Events
**Source**: ToolController
**Type**: `tool:state`

**Legitimate Emitters**:
- `ToolController.activateTool()`

---

## Whitelisted Direct Mutations

Some systems **legitimately** manipulate geometry directly:

### SceneController Methods
- `updateObjectDimensions()` - Applies dimension changes to geometry
- `updateObjectPosition()` - Applies position changes
- `updateObjectRotation()` - Applies rotation changes
- `updateLayout()` - Applies layout calculations

**Why**: SceneController is the single source of truth for 3D geometry.

### LayoutEngine
- `applyLayoutPositionsAndSizes()` - Applies calculated layout

**Why**: Layout calculations need to position multiple children atomically.

### Commands (Undo/Redo)
- `CreateObjectCommand.execute()` - Initial object creation
- `PushFaceCommand.execute()` - Tool operations

**Why**: Commands apply pre-calculated changes during undo/redo.

### Visualization Systems
- `VisualizationResourcePool` - Creates temporary visual indicators
- `AxisGizmo` - Creates gizmo geometry
- `SnapVisualizer` - Creates snap indicators

**Why**: Visual-only objects don't affect scene state.

---

## DevelopmentValidator Integration

### Monitored Violations

1. **Direct Mesh Manipulation**
```javascript
// ❌ BAD - Direct manipulation
mesh.position.x = 5;

// ✅ GOOD - Through ObjectStateManager
objectStateManager.updateObject(objectId, { position: { x: 5 } });
```

2. **Direct Geometry Manipulation**
```javascript
// ❌ BAD - Direct vertex manipulation
geometry.attributes.position.array[0] = 1.0;

// ✅ GOOD - Through GeometryUtils
GeometryUtils.updateGeometry(mesh, newDimensions);
```

3. **PostMessage Bypass**
```javascript
// ❌ BAD - Direct postMessage
window.parent.postMessage({ type: 'update' }, '*');

// ✅ GOOD - Through MainAdapter
mainAdapter.sendMessage('STATE_CHANGED', data);
```

4. **Event Emission Bypass**
```javascript
// ❌ BAD - Direct store update
selectedObject.set(newValue);

// ✅ GOOD - Through ObjectStateManager (emits events automatically)
objectStateManager.updateObject(objectId, updates);
```

### Viewing Violations

```javascript
// Get current violations
window.developmentValidator.getViolations();

// Get statistics
window.developmentValidator.getStats();

// Clear violations
window.developmentValidator.clearViolations();
```

---

## Phase 6 Optimization Integration

### Property Update Router

PropertyUpdateRouter optimizes event flow based on property type:

```javascript
// Material updates - Skip layout propagation
propertyUpdateRouter.routeUpdate(objectId, 'material.color', '#ff0000');
// → ObjectStateManager (skipLayoutPropagation: true)
// → SceneController (material only)
// → ObjectEventBus (MATERIAL event)
// → UI update

// Transform updates - Skip layout propagation
propertyUpdateRouter.routeUpdate(objectId, 'position.x', 5);
// → ObjectStateManager (skipLayoutPropagation: true)
// → SceneController (position only)
// → ObjectEventBus (TRANSFORM event)
// → UI update

// Dimension updates - Full propagation
propertyUpdateRouter.routeUpdate(objectId, 'dimensions.x', 10);
// → ObjectStateManager (full propagation)
// → SceneController (geometry + layout)
// → LayoutPropagationManager (parent containers)
// → ObjectEventBus (GEOMETRY event)
// → UI update
```

---

## Event Flow Examples

### Example 1: User Changes Color

```
1. User types in PropertyPanel color input
2. UI → postMessage('property-update', {objectId, property: 'material.color', value})
3. handlePropertyUpdate() → PropertyUpdateRouter.routeUpdate()
4. Router classifies as material → routeMaterialUpdate()
5. ObjectStateManager.updateObject(id, {material: {color}}, {skipLayoutPropagation: true})
6. ObjectStateManager.updateSceneController() → SceneController applies material
7. ObjectEventBus.emit('object:material', {objectId, changes})
8. MainAdapter receives event → buildMessage('STATE_CHANGED')
9. postMessage → UI
10. UI updates PropertyPanel display
```

**Optimization**: Steps 6-10 happen in <10ms (material budget)

### Example 2: User Changes Dimension

```
1. User types in PropertyPanel width input
2. UI → postMessage('property-update', {objectId, property: 'dimensions.x', value})
3. handlePropertyUpdate() → PropertyUpdateRouter.routeUpdate()
4. Router classifies as dimension → routeDimensionUpdate()
5. ObjectStateManager.updateObject(id, {dimensions: {x}})
6. ObjectStateManager.updateSceneController() → SceneController applies geometry
7. GeometryUtils.updateGeometry() → Rebuilds mesh geometry
8. LayoutPropagationManager.scheduleParentLayoutUpdate() → Triggers parent container layout
9. SceneController.updateLayout() → Recalculates container positions
10. ObjectEventBus.emit('object:geometry', {objectId, changes})
11. MainAdapter receives event → buildMessage('STATE_CHANGED')
12. postMessage → UI
13. UI updates PropertyPanel + ObjectTree
```

**Full Chain**: Steps 6-13 happen in <50ms (dimension budget)

---

## Testing Checklist

### Event Emission Tests

- [ ] Material change emits `object:material` event
- [ ] Position change emits `object:transform` event
- [ ] Dimension change emits `object:geometry` event
- [ ] Object creation emits `object:lifecycle` event
- [ ] Object deletion emits `object:lifecycle` event
- [ ] Hierarchy change emits `object:hierarchy` event
- [ ] Selection change emits `selection:changed` event
- [ ] Tool switch emits `tool:state` event

### Event Data Completeness Tests

- [ ] Event payload includes objectId
- [ ] Event payload includes changes object
- [ ] Event payload includes timestamp
- [ ] Event includes source information
- [ ] Nested changes properly serialized

### Event Ordering Tests

- [ ] Geometry event before layout event
- [ ] Layout event before hierarchy event
- [ ] No duplicate events for same change
- [ ] Events batched appropriately

### Performance Tests

- [ ] Material updates <10ms (P90)
- [ ] Transform updates <16ms (P90)
- [ ] Dimension updates <50ms (P90)
- [ ] Layout updates <100ms (P90)

---

## Common Pitfalls

### Pitfall 1: Direct Mesh Manipulation in Tools

```javascript
// ❌ BAD - Push tool directly moving mesh
onMouseMove(event) {
    const mesh = this.selectedMesh;
    mesh.position.y += delta;  // NO EVENT EMITTED!
}

// ✅ GOOD - Push tool using ObjectStateManager
onMouseMove(event) {
    objectStateManager.updateObject(mesh.userData.id, {
        position: { y: mesh.position.y + delta }
    }, 'push-tool');  // Source tracking for optimization
}
```

### Pitfall 2: Forgetting Layout Propagation

```javascript
// ❌ BAD - Changing child without updating parent container
objectStateManager.updateObject(childId, {
    dimensions: { x: newWidth }
}, { skipLayoutPropagation: true });  // Parent container won't resize!

// ✅ GOOD - Let propagation work
objectStateManager.updateObject(childId, {
    dimensions: { x: newWidth }
});  // Automatically triggers parent layout update
```

### Pitfall 3: Multiple Event Emissions

```javascript
// ❌ BAD - Manual event emission after ObjectStateManager
objectStateManager.updateObject(objectId, updates);
objectEventBus.emit('object:geometry', data);  // DUPLICATE EVENT!

// ✅ GOOD - Trust automatic emission
objectStateManager.updateObject(objectId, updates);
// Event emitted automatically via propagateChanges()
```

---

## Phase 7 Audit Results

### Direct Mutations Found
- ✅ `scene-controller.js` - Whitelisted (single source of truth)
- ✅ `scene-lifecycle-manager.js` - Whitelisted (object creation)
- ✅ `scene-deserializer.js` - Whitelisted (scene loading)
- ✅ `visualization-resource-pool.js` - Whitelisted (visual-only)
- ✅ `create-object-command.js` - Whitelisted (command execution)
- ✅ `push-face-command.js` - Whitelisted (command execution)
- ✅ `update-layout-property-command.js` - Whitelisted (command execution)

### Violations Found
**None** - All direct mutations are properly whitelisted and legitimate.

### DevelopmentValidator Status
✅ No violations detected during normal operation
✅ All event emissions flow through ObjectEventBus
✅ All state changes flow through ObjectStateManager

---

## Golden Rules

1. **Single Entry Point**: ObjectStateManager.updateObject() for ALL state changes
2. **Trust the System**: Event emission is automatic via propagateChanges()
3. **Source Tracking**: Always provide source for optimization ('input', 'push-tool', etc.)
4. **Use Router**: PropertyUpdateRouter optimizes based on property type
5. **No Surprises**: Every state change MUST emit corresponding event
6. **Validation**: DevelopmentValidator catches bypasses in development

---

## See Also

- [STATE-OWNERSHIP-MATRIX.md](STATE-OWNERSHIP-MATRIX.md) - State management decision matrix
- [PROPERTY-UPDATE-FLOW.md](PROPERTY-UPDATE-FLOW.md) - Complete update flow documentation
- [Phase 6 Optimization](../refactoring/REFACTORING-PLAN-2025-Q1.md#phase-6) - PropertyUpdateRouter details

---

**End of Event Emission Guidelines**
