# State Ownership Decision Matrix

**Version**: 1.0.0
**Date**: 2025-10-13
**Status**: Current - Reflects Phase 4-5 Refactoring
**Related**: [STATE-OWNERSHIP.md](STATE-OWNERSHIP.md), [SCENE-CONTROLLER-SPLIT.md](SCENE-CONTROLLER-SPLIT.md)

---

## Purpose

This document provides **clear decision rules** for choosing the correct system when writing code. After Phase 4-5 refactoring, we now have:

- **1 Coordinator**: ObjectStateManager
- **1 Scene Coordinator**: SceneController
- **4 Specialized Managers**: LayoutPropagationManager, SceneHierarchyManager, SceneLayoutManager, SceneLifecycleManager

This matrix tells you **exactly which to use** for any given task.

---

## Quick Decision Tree

```
Need to change state?
├─ YES → Use ObjectStateManager.updateObject()
│  └─ It will route to appropriate systems
│
└─ NO, just reading or internal operation?
   ├─ Reading object data? → SceneController.getObject()
   ├─ Creating/deleting objects? → SceneController (delegates to SceneLifecycleManager)
   ├─ Parent/child operations? → SceneController (delegates to SceneHierarchyManager)
   ├─ Layout calculation? → SceneController (delegates to SceneLayoutManager)
   └─ Layout propagation? → ObjectStateManager (delegates to LayoutPropagationManager)
```

---

## The Systems: What Each One Does

### ObjectStateManager (Coordination Hub)

**Role**: Single entry point for ALL state changes

**Responsibilities**:
- Route property updates to correct systems
- Emit ObjectEventBus events for UI synchronization
- Delegate layout propagation to LayoutPropagationManager
- Ensure update consistency across systems

**Never does**:
- Store geometry data
- Calculate layout
- Manipulate meshes directly

**When to use**: Anytime you want to change state from outside the scene layer

```javascript
// ✅ CORRECT: Change state via ObjectStateManager
objectStateManager.updateObject(objectId, {
    dimensions: { x: 100, y: 50, z: 30 }
}, 'dimension-input');

// ❌ WRONG: Direct mesh manipulation
mesh.geometry.dispose();
mesh.geometry = new THREE.BoxGeometry(100, 50, 30); // Bypasses events!
```

---

### SceneController (3D Coordinator)

**Role**: Facade and coordinator for 3D scene operations

**Responsibilities**:
- Maintain public API for backward compatibility
- Delegate to specialized managers (Hierarchy, Layout, Lifecycle)
- Subscribe to geometry events for hug container updates
- Provide unified access point for scene operations

**Never does**:
- Implement most operations directly (delegates instead)
- Store duplicate state

**When to use**:
- Reading 3D data
- Scene operations from within scene layer
- Public API access point

```javascript
// ✅ CORRECT: Read through SceneController
const objectData = sceneController.getObject(objectId);
const children = sceneController.getChildObjects(containerId);

// ✅ CORRECT: Scene operations
sceneController.addObject(geometry, material, options);
sceneController.removeObject(objectId);
```

---

### LayoutPropagationManager (Layout Coordinator)

**Role**: Propagate layout updates bottom-up through container hierarchy

**Responsibilities**:
- Schedule parent layout updates
- Process updates in correct order (deepest-first)
- Maintain depth caching for efficiency
- Batch deferred propagations

**When to use**: NEVER directly - ObjectStateManager delegates to it

```javascript
// ✅ CORRECT: Via ObjectStateManager
objectStateManager.updateObject(objectId, { dimensions: {...} });
// ObjectStateManager automatically schedules layout propagation

// ❌ WRONG: Direct call
layoutPropagationManager.scheduleParentLayoutUpdate(objectId); // Don't!
```

---

### SceneHierarchyManager (Parent-Child Manager)

**Role**: Manage parent-child relationships and hierarchy validation

**Responsibilities**:
- Track parent-child relationships
- Validate hierarchy operations (prevent circular refs)
- Calculate nesting depth
- Manage root-level ordering
- Handle parent changes with layout updates

**When to use**: NEVER directly - SceneController delegates to it

```javascript
// ✅ CORRECT: Via SceneController
sceneController.setParentContainer(objectId, newParentId);
const children = sceneController.getChildObjects(containerId);

// ❌ WRONG: Direct call
sceneHierarchyManager.setParentContainer(objectId, newParentId); // Don't!
```

---

### SceneLayoutManager (Layout Calculator)

**Role**: Calculate and apply layout for containers

**Responsibilities**:
- Enable/disable auto-layout
- Calculate layout via LayoutEngine
- Apply calculated positions/sizes to children
- Update hug containers to fit children
- Manage container sizing modes (fixed/fill/hug)

**When to use**: NEVER directly - SceneController delegates to it

```javascript
// ✅ CORRECT: Via SceneController
sceneController.enableAutoLayout(containerId, layoutConfig);
sceneController.updateContainer(containerId);

// ❌ WRONG: Direct call
sceneLayoutManager.updateLayout(containerId); // Don't!
```

---

### SceneLifecycleManager (Object Creator/Destroyer)

**Role**: Create and delete objects in the scene

**Responsibilities**:
- Add objects to scene with metadata
- Remove objects with cleanup
- Generate unique IDs
- Generate sequential names (Box 001, Container 002)
- Sync objects to ObjectStateManager
- Create support meshes via SupportMeshFactory

**When to use**: NEVER directly - SceneController delegates to it

```javascript
// ✅ CORRECT: Via SceneController
sceneController.addObject(geometry, material, { type: 'box', name: 'My Box' });
sceneController.removeObject(objectId);

// ❌ WRONG: Direct call
sceneLifecycleManager.addObject(geometry, material, options); // Don't!
```

---

## Decision Matrix by Task

| Task | System to Use | Method | Notes |
|------|--------------|--------|-------|
| **Change any property** | ObjectStateManager | `updateObject(id, updates, source)` | Single entry point |
| **Read object data** | SceneController | `getObject(id)` | Returns full object data |
| **Read dimensions** | DimensionManager | `getDimensions(mesh)` | Always from geometry |
| **Create object** | SceneController | `addObject(geo, mat, opts)` | Delegates to lifecycle |
| **Delete object** | SceneController | `removeObject(id)` | Delegates to lifecycle |
| **Get children** | SceneController | `getChildObjects(id)` | Delegates to hierarchy |
| **Change parent** | SceneController | `setParentContainer(id, parentId)` | Delegates to hierarchy |
| **Enable layout** | SceneController | `enableAutoLayout(id, config)` | Delegates to layout |
| **Update container** | SceneController | `updateContainer(id, context)` | Unified entry for all container modes |
| **Trigger propagation** | ObjectStateManager | Automatic via `updateObject` | Delegates to propagation |
| **Emit UI event** | ObjectEventBus | `emit(type, id, data, metadata)` | Via ObjectStateManager |

---

## Common Scenarios

### Scenario 1: User Changes Dimension in UI

```javascript
// UI sends dimension change
// ✅ CORRECT Flow:

// 1. PropertyUpdateHandler receives message
const updates = { dimensions: { x: newValue } };

// 2. Route through ObjectStateManager
objectStateManager.updateObject(objectId, updates, 'dimension-input');

// 3. ObjectStateManager:
//    - Validates updates
//    - Calls sceneController.updateObjectDimensions()
//    - Emits geometry event via ObjectEventBus
//    - Schedules layout propagation (if in container)

// 4. LayoutPropagationManager:
//    - Processes scheduled updates bottom-up
//    - Calls sceneController.updateContainer() for each parent

// 5. SceneLayoutManager:
//    - Calculates new layout
//    - Applies positions/sizes to children
//    - Emits events for UI sync
```

**Key Point**: One entry (updateObject), automatic propagation

---

### Scenario 2: Tool Moves Object (Push/Move)

```javascript
// ✅ CORRECT: During drag (preview)
// Direct geometry update with 'push-tool' source
const updates = {
    position: { x: newX, y: newY, z: newZ }
};
objectStateManager.updateObject(objectId, updates, 'push-tool');
// MainAdapter filters 'push-tool' source → no UI sync during drag

// ✅ CORRECT: On drag end (finalize)
// Trigger layout propagation
objectStateManager.updateObject(objectId, {
    position: { x: finalX, y: finalY, z: finalZ }
}, 'push-tool-finalize');
// No source filter → UI syncs
```

**Key Point**: Use source tags to control event emission

---

### Scenario 3: Creating Container with Children

```javascript
// ✅ CORRECT Flow:

// 1. Create container
const containerId = sceneController.addObject(
    containerGeometry,
    containerMaterial,
    { type: 'container', name: 'Container 001' }
);
// SceneController → SceneLifecycleManager handles creation

// 2. Create children
const child1Id = sceneController.addObject(boxGeometry, boxMaterial, {
    type: 'box',
    parentId: containerId // Set parent immediately
});

// 3. Enable layout
sceneController.enableAutoLayout(containerId, {
    mode: 'vertical',
    gap: 10
});
// SceneController → SceneLayoutManager enables layout

// 4. Layout updates automatically
// SceneController.updateContainer() positions children via SceneLayoutManager
```

**Key Point**: SceneController facade provides clean API

---

### Scenario 4: Deleting Object in Container

```javascript
// ✅ CORRECT Flow:

// 1. Delete via SceneController
sceneController.removeObject(objectId);
// SceneController → SceneLifecycleManager:
//   - Removes from scene
//   - Cleans up support meshes
//   - Updates parent's childrenOrder array
//   - Emits hierarchy event

// 2. Layout propagation (automatic)
// ObjectEventBus hierarchy event triggers:
//   - LayoutPropagationManager schedules parent update
//   - SceneLayoutManager recalculates layout
//   - Remaining children reposition
```

**Key Point**: Cascade cleanup happens automatically

---

## Anti-Patterns to Avoid

### ❌ DON'T: Bypass ObjectStateManager

```javascript
// ❌ WRONG: Direct mesh manipulation
mesh.position.set(x, y, z);
mesh.scale.set(1, 1, 1);
// No events emitted, UI out of sync, no undo/redo

// ✅ CORRECT: Via ObjectStateManager
objectStateManager.updateObject(objectId, {
    position: { x, y, z }
}, 'your-source');
```

---

### ❌ DON'T: Call Managers Directly

```javascript
// ❌ WRONG: Direct manager calls
sceneLifecycleManager.addObject(geo, mat, opts);
sceneLayoutManager.updateLayout(id);
layoutPropagationManager.scheduleParentLayoutUpdate(id);

// ✅ CORRECT: Via coordinators
sceneController.addObject(geo, mat, opts);
sceneController.updateContainer(id);
objectStateManager.updateObject(id, updates); // Auto-propagates
```

---

### ❌ DON'T: Store Duplicate State

```javascript
// ❌ WRONG: Caching geometry data
class MyTool {
    constructor() {
        this.cachedDimensions = {}; // Duplicate state!
    }
}

// ✅ CORRECT: Always read from source of truth
class MyTool {
    getDimensions(objectId) {
        const obj = sceneController.getObject(objectId);
        return dimensionManager.getDimensions(obj.mesh);
    }
}
```

---

### ❌ DON'T: Emit Events Manually

```javascript
// ❌ WRONG: Manual event emission
window.objectEventBus.emit('geometry', objectId, {...});

// ✅ CORRECT: Via ObjectStateManager
objectStateManager.updateObject(objectId, updates, source);
// Events emitted automatically
```

---

## Integration Points

### UI → 3D

```
PropertyUpdateHandler
  → validates message
  → ObjectStateManager.updateObject()
    → SceneController (geometry updates)
    → LayoutPropagationManager (if needed)
    → ObjectEventBus.emit()
      → MainAdapter (filters and routes)
        → PropertyPanelSync.sendToUI()
```

**Entry Point**: Always `ObjectStateManager.updateObject()`

---

### 3D → UI

```
SceneController (geometry change)
  → ObjectEventBus.emit()
    → MainAdapter.handleGeometryEvent()
      → CommunicationBridge.send()
        → PropertyPanelSync.sendToUI()
          → UI updates
```

**Key**: Events emitted via ObjectEventBus, filtered by MainAdapter

---

### Tool → State

```
Tool (user interaction)
  → ObjectStateManager.updateObject()
    → SceneController (applies change)
    → ObjectEventBus.emit()
    → [rest of chain]
```

**Key**: Tools use ObjectStateManager, never direct manipulation

---

## Testing Checklist

When making state changes, verify:

1. ✅ Used ObjectStateManager.updateObject() as entry point
2. ✅ Changes reflected in 3D scene immediately
3. ✅ UI panels update correctly
4. ✅ Layout propagates to parents (if in container)
5. ✅ Undo/redo works (if using HistoryManager)
6. ✅ No console errors or circular update warnings
7. ✅ Changes persist after scene save/load

---

## Summary: The Golden Rules

1. **State changes ALWAYS go through ObjectStateManager.updateObject()**
2. **Read data from SceneController.getObject() (3D source of truth)**
3. **NEVER call specialized managers directly (they're internal)**
4. **SceneController delegates to managers (facade pattern)**
5. **ObjectStateManager delegates to LayoutPropagationManager (coordination)**
6. **Use source tags to control event filtering (preview vs. finalized)**
7. **Trust the delegation - don't bypass the architecture**

---

## When in Doubt

Ask yourself:
1. **Am I changing state?** → ObjectStateManager.updateObject()
2. **Am I reading data?** → SceneController.getObject()
3. **Am I creating/deleting?** → SceneController.addObject/removeObject()
4. **Everything else?** → Check this matrix!

**If still unsure**: Look for similar code in the codebase and follow the same pattern.

---

**End of State Ownership Decision Matrix**

*For detailed architectural context, see [STATE-OWNERSHIP.md](STATE-OWNERSHIP.md)*
*For SceneController split details, see [SCENE-CONTROLLER-SPLIT.md](SCENE-CONTROLLER-SPLIT.md)*
