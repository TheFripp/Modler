# State Ownership Architecture

**Version**: 1.0.0
**Date**: 2025-01-13
**Status**: Active
**Part of**: Refactoring Plan 2025-Q1

---

## Executive Summary

Modler V2 uses a **dual-manager architecture** for state management:

- **SceneController**: Owns 3D geometry and spatial data (position, dimensions, rotation)
- **ObjectStateManager**: Coordinates state changes and propagates updates across systems

This document clarifies **who owns what**, **when to use each**, and **how they interact**.

---

## Core Principle: Geometry vs. Coordination

### SceneController = Geometry Owner (Single Source of Truth)

**What it owns**:
- THREE.js mesh objects
- Geometry buffers (vertices, faces)
- Spatial properties (position, rotation, scale)
- Dimensions (via geometry, not cached)
- Scene graph hierarchy (parent/child relationships)
- Visual rendering state

**Key insight**: SceneController is the **ground truth for all 3D data**. Everything else reads from it.

### ObjectStateManager = Coordination Layer (Update Orchestrator)

**What it does**:
- Routes property updates to appropriate systems
- Coordinates layout propagation (bottom-up and top-down)
- Emits ObjectEventBus events for UI synchronization
- Manages update batching and throttling
- Ensures consistency across systems

**Key insight**: ObjectStateManager **never stores geometry data**. It only coordinates updates and reads back from SceneController.

---

## Decision Matrix: When to Use What?

### Use SceneController Directly When:

✅ **Reading 3D data**
```javascript
// Get object position
const objectData = sceneController.getObject(objectId);
const position = objectData.mesh.position;

// Get dimensions
const dimensions = dimensionManager.getDimensions(objectData.mesh);

// Get children
const children = sceneController.getChildObjects(containerId);
```

✅ **Internal 3D operations** (within SceneController or managers it owns)
```javascript
// During layout calculation
sceneController.updateLayout(containerId);

// Direct geometry manipulation
sceneController.updateObjectDimensions(objectId, 'x', newValue, 'center');
```

✅ **Scene graph operations**
```javascript
// Add to scene
sceneController.addObject(geometry, material, options);

// Remove from scene
sceneController.removeObject(objectId);

// Change hierarchy
sceneController.setParentContainer(objectId, parentId);
```

### Use ObjectStateManager When:

✅ **User-initiated property changes** (from UI or tools)
```javascript
// User changes dimension in property panel
objectStateManager.updateObject(objectId, {
  dimensions: { x: 5 }
});

// User moves object with move tool
objectStateManager.updateObject(objectId, {
  position: { x: 10, y: 5, z: 0 }
});
```

✅ **Changes requiring UI synchronization**
```javascript
// Material change needs to update property panel
objectStateManager.updateObject(objectId, {
  material: { color: '#ff0000' }
});
```

✅ **Changes requiring layout propagation**
```javascript
// Child dimension changed, parent container needs to resize
objectStateManager.updateObject(objectId, {
  dimensions: { x: 10 }
}); // Automatically triggers parent layout update
```

✅ **Multi-system coordination**
```javascript
// Container layout property changed
objectStateManager.updateObject(containerId, {
  'autoLayout.gap': 2.0
}); // Updates SceneController, triggers layout, emits events, updates UI
```

---

## Data Flow Architecture

### Read Flow: Always from SceneController

```
UI Request → SceneController.getObject() → mesh.position/rotation/etc
                                         → dimensionManager.getDimensions()
                                         → Return to UI
```

**Key point**: No caching in ObjectStateManager. Always read fresh from SceneController.

### Write Flow: Through ObjectStateManager

```
UI Input → ObjectStateManager.updateObject()
           ↓
        applyUpdates() (parse nested properties)
           ↓
        scheduleUpdate() (batch/throttle)
           ↓
        propagateChanges()
           ↓
        ┌─────────────────────────────────────┐
        │ updateSceneController()             │
        │  → Apply geometry via SC methods    │
        │  → Read back from mesh (fresh data) │
        │  → Trigger layout if needed         │
        └─────────────────────────────────────┘
           ↓
        ObjectEventBus.emit()
           ↓
        PropertyPanelSync → UI Update
```

---

## Common Patterns

### Pattern 1: Simple Property Update

**Scenario**: User changes object position in property panel

```javascript
// ✅ CORRECT: Use ObjectStateManager
objectStateManager.updateObject(objectId, {
  position: { x: 10 }
});

// ❌ INCORRECT: Direct mesh manipulation
const mesh = sceneController.getObject(objectId).mesh;
mesh.position.x = 10; // Bypasses events, no UI update
```

**Why**: ObjectStateManager ensures UI synchronization and event emission.

### Pattern 2: Tool-Driven Updates

**Scenario**: Push tool modifies geometry during drag

```javascript
// ✅ CORRECT: Use ObjectStateManager with source context
objectStateManager.updateObject(objectId, {
  dimensions: { x: newDimension }
}, 'push-tool');

// Special handling in ObjectStateManager:
// - Suppresses layout updates during drag (line 601)
// - Batches updates for performance
// - Still maintains sync with SceneController
```

**Why**: Source context allows smart handling (suppress layout during drag, trigger on release).

### Pattern 3: Internal Geometry Calculation

**Scenario**: Layout engine calculates new child positions

```javascript
// ✅ CORRECT: SceneController direct access
sceneController.applyLayoutPositionsAndSizes(children, positions, sizes);

// Inside applyLayoutPositionsAndSizes:
child.mesh.position.copy(layoutPosition); // Direct manipulation OK
sceneController.updateObjectDimensions(childId, 'x', fillSize); // Geometry update
```

**Why**: Internal to SceneController, no external coordination needed. Events emitted by SceneController.

### Pattern 4: Reading for Display

**Scenario**: UI needs to display current dimensions

```javascript
// ✅ CORRECT: Read from SceneController via ObjectDataFormat
const objectData = sceneController.getObject(objectId);
const serialized = ObjectDataFormat.serializeForPostMessage(objectData);
// serialized.dimensions comes from dimensionManager.getDimensions()

// ❌ INCORRECT: Read from ObjectStateManager cache
const cached = objectStateManager.getObject(objectId);
// May be stale if SceneController updated directly
```

**Why**: SceneController is single source of truth, always has fresh data.

---

## Anti-Patterns to Avoid

### ❌ Caching Geometry in ObjectStateManager

```javascript
// BAD: Storing dimensions separately
objectStateManager.objects.set(objectId, {
  dimensions: { x: 5, y: 10, z: 3 } // Will become stale
});

// GOOD: Using getter that reads from geometry
Object.defineProperty(objectData, 'dimensions', {
  get() {
    return dimensionManager.getDimensions(this.mesh);
  }
});
```

### ❌ Bypassing ObjectStateManager for User Updates

```javascript
// BAD: Direct SceneController call from UI
sceneController.updateObjectDimensions(objectId, 'x', 10);
// Missing: Event emission, UI sync, layout propagation

// GOOD: Through ObjectStateManager
objectStateManager.updateObject(objectId, { dimensions: { x: 10 } });
// Includes: All coordination, events, and propagation
```

### ❌ Circular Sync Loops

```javascript
// BAD: ObjectStateManager reading and writing in loop
objectStateManager.updateObject(objectId, updates);
  → sceneController.updateDimensions();
  → objectStateManager.syncFromSceneController(); // DON'T DO THIS
    → objectStateManager.updateObject(); // INFINITE LOOP

// GOOD: One-way sync
objectStateManager.updateObject(objectId, updates);
  → sceneController.updateDimensions();
  → Read back once: dimensions = dimensionManager.getDimensions(mesh);
  → Done
```

---

## Special Cases

### Container Layout Properties

**Ownership**: SceneController owns `autoLayout` configuration
**Coordination**: ObjectStateManager triggers layout recalculation

```javascript
// User changes layout direction
objectStateManager.updateObject(containerId, {
  'autoLayout.direction': 'y'
});

// Inside ObjectStateManager.propagateChanges():
sceneObject.autoLayout.direction = 'y'; // Update SceneController
sceneController.updateLayout(containerId); // Trigger recalculation
```

**Why**: Layout config belongs with the container object, but layout execution is SceneController's responsibility.

### Layout Propagation

**Ownership**: LayoutPropagationManager (extracted from ObjectStateManager)
**Trigger**: ObjectStateManager calls it after geometry updates

```javascript
// Child dimension changed
objectStateManager.updateObject(childId, { dimensions: { x: 10 } });

// Inside propagateChanges():
if (child.parentContainer) {
  layoutPropagationManager.scheduleParentLayoutUpdate(childId);
}

// Later, in next frame:
layoutPropagationManager.processScheduledLayouts();
  → sceneController.updateLayout(parentId);
  → containerCrudManager.resizeContainerToLayoutBounds();
```

**Why**: Separates layout propagation logic from core state management.

### Undo/Redo Commands

**Ownership**: HistoryManager owns command execution
**Integration**: Commands call ObjectStateManager for state changes

```javascript
// Undo dimension change
command.undo() {
  objectStateManager.updateObject(objectId, {
    dimensions: { x: oldValue }
  });
}
```

**Why**: Commands are imperative (do/undo), ObjectStateManager is declarative (update state).

---

## Migration Guide

### From Direct SceneController Calls

**Before**:
```javascript
const objectData = sceneController.getObject(objectId);
sceneController.updateObjectDimensions(objectId, 'x', 10);
objectEventBus.emit(objectEventBus.EVENT_TYPES.GEOMETRY, objectId, {});
```

**After**:
```javascript
objectStateManager.updateObject(objectId, {
  dimensions: { x: 10 }
});
// Events and coordination handled automatically
```

### From Property-Specific Methods

**Before**:
```javascript
propertyUpdateHandler.handleObjectDimensionChange(objectId, 'dimensions.x', 10);
propertyUpdateHandler.handleObjectTransformChange(objectId, 'position.x', 5);
```

**After**:
```javascript
objectStateManager.updateObject(objectId, {
  dimensions: { x: 10 },
  position: { x: 5 }
});
// Batch update, single propagation cycle
```

---

## Quick Reference

| Operation | System | Example |
|-----------|--------|---------|
| Read position | SceneController | `obj.mesh.position` |
| Read dimensions | DimensionManager | `dimensionManager.getDimensions(mesh)` |
| Read children | SceneController | `sceneController.getChildObjects(id)` |
| Update from UI | ObjectStateManager | `updateObject(id, {dimensions: {x: 10}})` |
| Update from tool | ObjectStateManager | `updateObject(id, updates, 'tool-name')` |
| Internal geometry | SceneController | `updateObjectDimensions(id, 'x', 10)` |
| Layout calculation | SceneController | `updateLayout(containerId)` |
| Add to scene | SceneController | `addObject(geometry, material)` |
| Remove from scene | SceneController | `removeObject(id)` |
| Change hierarchy | SceneController | `setParentContainer(id, parentId)` |
| Trigger layout | LayoutPropagationManager | `scheduleParentLayoutUpdate(id)` |

---

## Testing Guidelines

### Unit Tests: Test Each System Independently

```javascript
// Test SceneController geometry operations
test('SceneController updates dimensions correctly', () => {
  sceneController.updateObjectDimensions(objectId, 'x', 10);
  const dimensions = dimensionManager.getDimensions(mesh);
  expect(dimensions.x).toBe(10);
});

// Test ObjectStateManager coordination
test('ObjectStateManager propagates to SceneController', () => {
  objectStateManager.updateObject(objectId, { dimensions: { x: 10 } });
  const objectData = sceneController.getObject(objectId);
  expect(dimensionManager.getDimensions(objectData.mesh).x).toBe(10);
});
```

### Integration Tests: Test Full Flow

```javascript
test('Property update flows through full pipeline', async () => {
  // Simulate UI update
  objectStateManager.updateObject(objectId, { dimensions: { x: 10 } });

  // Wait for propagation
  await waitForPropagation();

  // Verify SceneController updated
  const objectData = sceneController.getObject(objectId);
  expect(dimensionManager.getDimensions(objectData.mesh).x).toBe(10);

  // Verify event emitted
  expect(eventBus.emit).toHaveBeenCalledWith(
    EVENT_TYPES.GEOMETRY,
    objectId,
    expect.any(Object)
  );

  // Verify UI synchronized
  expect(mockUIUpdate).toHaveBeenCalledWith(
    expect.objectContaining({ dimensions: { x: 10 } })
  );
});
```

---

## Troubleshooting

### Issue: UI Shows Stale Data

**Symptom**: Property panel displays old dimension after SceneController update

**Cause**: Direct SceneController update without ObjectEventBus event

**Solution**: Always use ObjectStateManager for user-facing updates, or emit events manually

```javascript
// If you must update SceneController directly:
sceneController.updateObjectDimensions(objectId, 'x', 10);
objectEventBus.emit(objectEventBus.EVENT_TYPES.GEOMETRY, objectId, {
  changeType: 'dimensions',
  axis: 'x',
  value: 10
});
```

### Issue: Circular Update Loop

**Symptom**: System hangs, infinite updates detected

**Cause**: ObjectStateManager update triggers event that triggers another update

**Solution**: Check event handlers for recursive updates, add guards

```javascript
// BAD: Event handler triggers new update
objectEventBus.subscribe(EVENT_TYPES.GEOMETRY, (event) => {
  objectStateManager.updateObject(event.objectId, {}); // LOOP!
});

// GOOD: Event handler reads data, doesn't update
objectEventBus.subscribe(EVENT_TYPES.GEOMETRY, (event) => {
  const objectData = sceneController.getObject(event.objectId);
  updateUI(objectData); // Read-only operation
});
```

### Issue: Layout Not Updating

**Symptom**: Child resized but parent container didn't adjust

**Cause**: Update source was 'push-tool', which suppresses layout during drag

**Solution**: Trigger layout manually when drag completes

```javascript
// During drag: suppress layout
objectStateManager.updateObject(objectId, updates, 'push-tool');

// On drag end: trigger layout
layoutPropagationManager.scheduleParentLayoutUpdate(objectId);
layoutPropagationManager.processScheduledLayouts();
```

---

## Future Improvements

### Planned for Q1 2025 Refactoring

1. **Extract LayoutPropagationManager** (Phase 4)
   - Move layout propagation out of ObjectStateManager
   - Cleaner separation of concerns
   - Easier testing

2. **Split SceneController** (Phase 5)
   - SceneLifecycleManager (create/delete)
   - SceneLayoutManager (layout calculations)
   - SceneHierarchyManager (parent/child)
   - Thinner coordinator

3. **Property Update Router** (Phase 6)
   - Smart routing based on property type
   - Short-circuit safe paths
   - Performance optimization

---

## References

- [CLAUDE.md](../../CLAUDE.md) - Project principles
- [Refactoring Plan](../refactoring/REFACTORING-PLAN-2025-Q1.md) - Full refactoring plan
- [ObjectStateManager](../../core/object-state-manager.js) - Implementation
- [SceneController](../../scene/scene-controller.js) - Implementation

---

**Version History**

- 1.0.0 (2025-01-13): Initial documentation as part of Q1 refactoring
