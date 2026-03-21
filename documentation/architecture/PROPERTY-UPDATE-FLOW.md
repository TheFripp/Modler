# Property Update Flow Architecture

**Version**: 1.0.0
**Date**: 2025-01-13
**Status**: Active
**Part of**: Refactoring Plan 2025-Q1

---

## Executive Summary

This document maps the **complete flow** of property updates through Modler V2, from user input to 3D visualization. Understanding this flow is critical for:

- Performance optimization
- Debugging update issues
- Adding new property types
- Preventing circular updates

**Current State**: 9-step chain for full updates
**Target State**: 6-7 steps with optimized paths (Q1 2025 refactoring)

---

## Complete Update Flow

### Full Chain (User Input → 3D → UI)

```
┌─────────────────────────────────────────────────────────────────┐
│ STEP 1: UI Input Layer (Svelte)                                │
│ User types in property panel or drags object                   │
└───────────────┬─────────────────────────────────────────────────┘
                ↓
┌───────────────────────────────────────────────────────────────┐
│ STEP 2: PropertyController (UI-side)                         │
│ - Validates input against constraints                        │
│ - Batches/throttles rapid changes                           │
│ - Converts UI format to internal format                     │
└───────────────┬───────────────────────────────────────────────┘
                ↓
┌───────────────────────────────────────────────────────────────┐
│ STEP 3: UnifiedCommunication (PostMessage)                   │
│ - Serializes update for postMessage                         │
│ - Sends to main window                                      │
│ - Handles iframe boundaries                                 │
└───────────────┬───────────────────────────────────────────────┘
                ↓
┌───────────────────────────────────────────────────────────────┐
│ STEP 4: PropertyUpdateHandler (Main App Router)              │
│ - Routes to appropriate handler                             │
│ - Detects property type (dimension/transform/material)      │
│ - Creates undo command                                      │
└───────────────┬───────────────────────────────────────────────┘
                ↓
┌───────────────────────────────────────────────────────────────┐
│ STEP 5: ObjectStateManager (Coordination)                    │
│ - Parses nested property paths                              │
│ - Batches updates                                           │
│ - Schedules propagation                                     │
└───────────────┬───────────────────────────────────────────────┘
                ↓
┌───────────────────────────────────────────────────────────────┐
│ STEP 6: SceneController (Geometry Application)               │
│ - Applies to THREE.js mesh                                  │
│ - Updates geometry buffers                                  │
│ - Reads back fresh values                                   │
└───────────────┬───────────────────────────────────────────────┘
                ↓
┌───────────────────────────────────────────────────────────────┐
│ STEP 7: LayoutEngine (If dimension/container changed)        │
│ - Recalculates child positions                              │
│ - Applies fill sizing                                       │
│ - Propagates to parent containers                          │
└───────────────┬───────────────────────────────────────────────┘
                ↓
┌───────────────────────────────────────────────────────────────┐
│ STEP 8: ObjectEventBus (Change Notification)                 │
│ - Emits GEOMETRY/TRANSFORM/MATERIAL event                   │
│ - Throttles for performance                                 │
│ - Distributes to subscribers                                │
└───────────────┬───────────────────────────────────────────────┘
                ↓
┌───────────────────────────────────────────────────────────────┐
│ STEP 9: PropertyPanelSync (UI Update)                        │
│ - Catches event                                             │
│ - Serializes for postMessage                                │
│ - Sends to UI panels                                        │
└───────────────┬───────────────────────────────────────────────┘
                ↓
            [UI Updates Display]
```

**Total Latency**: 50-150ms depending on property type and system load

---

## Property Type: Dimensions

### Flow: User Changes Dimension in Property Panel

**Example**: User types `width: 10` in property panel

```
UI Input (width: 10)
  ↓
PropertyController.updateProperty('objectId', 'dimensions.x', 10)
  ↓ [Validation: min=0.1, step=0.1]
  ↓ [Converts to internal units]
  ↓
UnifiedCommunication.postMessage({
  type: 'property-update',
  objectId: 'objectId',
  property: 'dimensions.x',
  value: 10
})
  ↓
PropertyUpdateHandler.handlePropertyChange()
  ↓ [Routes to handleObjectDimensionChange()]
  ↓ [Creates UpdatePropertyCommand for undo]
  ↓
ObjectStateManager.updateObject('objectId', {
  dimensions: { x: 10 }
})
  ↓ [applyUpdates() parses nested path]
  ↓ [Creates _pendingDimensionUpdates: { x: 10 }]
  ↓ [scheduleUpdate() batches]
  ↓
propagateChanges()
  ↓
updateSceneController([{object, source}])
  ↓ [applyGeometryUpdate('Dimension', ...)]
  ↓
SceneController.updateObjectDimensions('objectId', 'x', 10, 'center')
  ↓ [GeometryUtils.resizeGeometry()]
  ↓ [Updates THREE.js BufferGeometry]
  ↓ [Reads back: dimensions = dimensionManager.getDimensions(mesh)]
  ↓
  ↓ [Triggers parent layout if object in container]
  ↓
SceneController.updateContainer(parentContainerId)
  ↓
LayoutEngine.calculateLayout(children, config, containerSize)
  ↓ [5-pass calculation: categorize, gaps, sizes, positions, bounds]
  ↓ [Returns new positions and sizes]
  ↓
SceneController.applyLayoutPositionsAndSizes()
  ↓ [Updates child mesh positions]
  ↓ [Applies fill sizing]
  ↓
ObjectEventBus.emit(EVENT_TYPES.GEOMETRY, 'objectId', {
  changeType: 'dimensions',
  axis: 'x',
  value: 10
})
  ↓ [Throttled to 60fps]
  ↓
PropertyPanelSync.handleGeometryEvent()
  ↓ [SKIPS if object is selected - handled by refreshSelectionUI]
  ↓
ObjectStateManager.refreshSelectionUI()
  ↓ [Builds fresh object structure from SceneController]
  ↓ [Calls selectionChangeCallback OR syncSelectionFromThreeJS]
  ↓
PropertyController receives update
  ↓
UI displays new dimension: "10.0 mm"
```

**Latency Breakdown**:
- Steps 1-5: 5-10ms (UI → coordination)
- Step 6: 10-30ms (geometry update)
- Step 7: 20-80ms (layout calculation - varies with nesting)
- Steps 8-9: 10-20ms (event → UI)
- **Total: 45-140ms**

---

## Property Type: Position/Rotation

### Flow: User Moves Object with Move Tool

**Example**: User drags object to new position

```
MoveTool detects drag
  ↓ [Calculates delta from mouse movement]
  ↓
ObjectStateManager.updateObject('objectId', {
  position: { x: newX, y: newY, z: newZ }
}, 'move-tool')
  ↓ [Source: 'move-tool' for context]
  ↓
propagateChanges()
  ↓
updateSceneController([{object, source: 'move-tool'}])
  ↓ [applyGeometryUpdate('Position', ...)]
  ↓
SceneController.updateObjectPosition('objectId', 'x', newX)
  ↓ [Direct mesh property assignment]
  ↓ [mesh.position.x = newX]
  ↓ [No layout trigger for position changes]
  ↓
ObjectEventBus.emit(EVENT_TYPES.TRANSFORM, 'objectId', {
  changeType: 'position',
  position: {x: newX, y: newY, z: newZ}
})
  ↓ [Throttled to 60fps during drag]
  ↓
PropertyPanelSync: SKIPPED (Transform events not subscribed)
  ↓
ObjectStateManager.refreshSelectionUI() [For selected objects only]
  ↓
UI updates immediately via direct store sync
```

**Latency Breakdown**:
- Tool → ObjectStateManager: <5ms
- Geometry update: <10ms (simple property change)
- UI refresh: <5ms (direct store update)
- **Total: <20ms** (fast enough for 60fps drag)

**Key Optimization**: Transform events don't go through PropertyPanelSync to avoid competing updates. Selected objects use direct store sync for real-time feedback.

---

## Property Type: Material (Color/Opacity)

### Flow: User Changes Object Color

**Example**: User picks red color in property panel

```
UI Input (color: #ff0000)
  ↓
PropertyController.updateProperty('objectId', 'material.color', '#ff0000')
  ↓ [Validates hex format]
  ↓
UnifiedCommunication.postMessage(...)
  ↓
PropertyUpdateHandler.handlePropertyChange()
  ↓ [Routes to handleObjectMaterialChange()]
  ↓
ObjectStateManager.updateObject('objectId', {
  material: { color: '#ff0000' }
})
  ↓
propagateChanges()
  ↓
updateSceneController([{object, source}])
  ↓ [Updates material property in SceneController object data]
  ↓ [Applies to THREE.js material]
  ↓ [mesh.material.color.setHex(0xff0000)]
  ↓ [NO LAYOUT TRIGGER]
  ↓
ObjectEventBus.emit(EVENT_TYPES.MATERIAL, 'objectId', {
  changeType: 'color',
  value: '#ff0000'
})
  ↓
PropertyPanelSync.handleMaterialEvent()
  ↓ [SKIPS if object is selected]
  ↓
ObjectStateManager.refreshSelectionUI()
  ↓
UI updates color picker
```

**Latency Breakdown**:
- Steps 1-5: 5-10ms
- Material update: <5ms (simple property)
- Event → UI: 5-10ms
- **Total: 15-25ms** (very fast)

**Optimization Opportunity**: Material changes could skip even more steps (Phase 6 of refactoring).

---

## Property Type: Container Layout

### Flow: User Changes Layout Direction

**Example**: User sets layout direction to 'y' (vertical)

```
UI Input (autoLayout.direction: 'y')
  ↓
PropertyController.updateProperty('containerId', 'autoLayout.direction', 'y')
  ↓
UnifiedCommunication.postMessage(...)
  ↓
PropertyUpdateHandler.handlePropertyChange()
  ↓ [Detects container layout property]
  ↓ [Routes to handleContainerLayoutPropertyChange()]
  ↓
PropertyUpdateHandler.executeLayoutPropertyChangeCommand()
  ↓ [Creates UpdateLayoutPropertyCommand for undo]
  ↓ [HistoryManager.executeCommand()]
  ↓
PropertyUpdateHandler.handleContainerLayoutPropertyChange()
  ↓ [Updates containerData.autoLayout.direction = 'y']
  ↓ [Disables isHug mode if enabled]
  ↓
SceneController.updateContainer(containerId)
  ↓ [Resets child positions via resetChildPositionsForLayout()]
  ↓
LayoutEngine.calculateLayout(children, {direction: 'y'}, containerSize)
  ↓ [Calculates new positions along Y axis]
  ↓ [Applies fill sizing if any children have fill]
  ↓ [Centers layout group]
  ↓ [Returns layoutBounds]
  ↓
ContainerCrudManager.resizeContainerToLayoutBounds(container, bounds)
  ↓ [Resizes container mesh to fit laid-out children]
  ↓ [Updates container geometry]
  ↓
ObjectEventBus.emit(EVENT_TYPES.HIERARCHY, containerId, {
  type: 'layout-property-changed',
  property: 'direction',
  value: 'y'
})
  ↓
PropertyPanelSync.handleHierarchyEvent()
  ↓ [Triggers refreshCompleteHierarchy()]
  ↓ [Serializes all objects]
  ↓ [Sends to left panel]
  ↓
ObjectStateManager.refreshSelectionUI()
  ↓ [Updates property panel if container selected]
  ↓
UI updates:
  - Object tree (left panel)
  - Property panel (right panel)
  - 3D view (via THREE.js render loop)
```

**Latency Breakdown**:
- Steps 1-5: 10-20ms
- Layout calculation: 30-100ms (depends on child count and nesting)
- Container resize: 10-30ms
- Event → UI: 20-40ms
- **Total: 70-190ms**

**Performance Note**: Layout updates are the most expensive operations. Nested containers multiply this cost.

---

## Special Case: Push Tool (Dimension + Anchor)

### Flow: User Pushes Face to Resize Object

**Example**: User drags face handle to resize box

```
PushTool detects drag
  ↓ [Calculates new dimension from face movement]
  ↓ [Determines anchor mode based on pushed face]
  ↓
ObjectStateManager.updateObject('objectId', {
  dimensions: { x: newDimension }
}, 'push-tool')
  ↓ [Source: 'push-tool' enables special handling]
  ↓
propagateChanges()
  ↓
updateSceneController([{object, source: 'push-tool'}])
  ↓
  ↓ [CRITICAL: shouldTriggerLayout = false for push-tool]
  ↓ [Suppresses layout during drag for performance]
  ↓
SceneController.updateObjectDimensions('objectId', 'x', newDim, anchorMode)
  ↓ [anchorMode: 'min', 'max', or 'center']
  ↓
GeometryUtils.resizeGeometry(geometry, 'x', newDim, anchorMode)
  ↓ [Vertices moved relative to anchor]
  ↓ [Object stays fixed at anchor face]
  ↓
  ↓ [Layout update SKIPPED during drag]
  ↓
ObjectEventBus.emit(EVENT_TYPES.GEOMETRY, ...)
  ↓
ObjectStateManager.refreshSelectionUI()
  ↓ [Real-time dimension display updates]
  ↓
[On drag end]
PushTool.onDragEnd()
  ↓ [Triggers deferred layout update]
  ↓
LayoutPropagationManager.scheduleParentLayoutUpdate(objectId)
  ↓ [Queues parent container for layout]
  ↓ [Processed in next frame]
  ↓
Container resizes to fit new child dimensions
```

**Latency During Drag**:
- Dimension update: <10ms (fast, no layout)
- UI refresh: <5ms
- **Total: <15ms** (smooth 60fps drag)

**Latency On Release**:
- Layout calculation: 30-100ms (deferred)
- Container resize: 10-30ms
- **Total: 40-130ms** (acceptable for release event)

---

## Performance Characteristics

### By Property Type

| Property Type | Steps | Latency (p90) | Layout? | Optimizable? |
|--------------|-------|---------------|---------|--------------|
| Material | 6 | 20ms | No | Yes ⚡ |
| Position | 7 | 25ms | No | Yes ⚡ |
| Rotation | 7 | 25ms | No | Yes ⚡ |
| Dimension (no parent) | 8 | 50ms | No | Maybe |
| Dimension (in container) | 9 | 80-150ms | Yes | No |
| Container layout | 9 | 100-200ms | Yes | No |

⚡ = Phase 6 optimization target

### Bottlenecks Identified

1. **Step 7: LayoutEngine** (30-100ms)
   - 5-pass calculation algorithm
   - Scales with child count and nesting depth
   - **Mitigation**: Suppress during drag, process on release

2. **Step 9: PropertyPanelSync serialization** (10-30ms)
   - Full object serialization on every update
   - **Mitigation**: Partial updates for selected objects only

3. **Step 2-4: Communication overhead** (10-20ms)
   - PostMessage serialization
   - iframe boundary crossing
   - **Mitigation**: Phase 3 consolidation reduces steps

---

## Optimization Strategies

### Current Optimizations

✅ **Throttling** (Step 8)
- ObjectEventBus throttles to 60fps
- Prevents event flood during rapid changes

✅ **Batching** (Step 5)
- ObjectStateManager batches multiple property changes
- Single propagation cycle for batch

✅ **Selective Updates** (Step 9)
- PropertyPanelSync skips non-selected objects
- Only selected objects get real-time UI updates

✅ **Layout Suppression** (Push Tool)
- Layout updates suppressed during drag
- Deferred to drag release

### Planned Optimizations (Q1 2025)

🔄 **Property Update Router** (Phase 6)
- Material updates: Skip layout checks (6 steps → 4 steps)
- Transform updates: Direct SceneController (7 steps → 5 steps)
- Dimension updates: Keep full validation

🔄 **Communication Consolidation** (Phase 3)
- Reduce PostMessage overhead
- Single bidirectional bridge
- Target: 50% reduction in communication latency

🔄 **Layout Propagation Extraction** (Phase 4)
- Dedicated LayoutPropagationManager
- Better caching and batching
- Target: 30% reduction in layout calculation time

---

## Debugging Guide

### How to Trace a Property Update

1. **Set breakpoint in PropertyController.updateProperty()**
   - `svelte-ui/src/lib/services/property-controller.ts:203`

2. **Log ObjectStateManager.updateObject() call**
   - `core/object-state-manager.js:338`
   - Check `updates` object and `source` parameter

3. **Watch SceneController geometry update**
   - `scene/scene-controller.js:1211` (dimensions)
   - `scene/scene-controller.js:1264` (position)
   - `scene/scene-controller.js:1294` (rotation)

4. **Monitor LayoutEngine if triggered**
   - `layout/layout-engine.js:15` (calculateLayout entry)
   - Check `objects`, `layoutConfig`, `containerSize`

5. **Verify event emission**
   - `application/events/object-event-bus.js:87` (emit method)
   - Check `eventType`, `objectId`, `changeData`

6. **Check UI update**
   - PropertyPanelSync.handleGeometryEvent() or refreshSelectionUI()
   - Verify postMessage sent to UI

### Common Issues

**Issue**: Property update doesn't reach 3D
- Check: ObjectStateManager.updateObject() called?
- Check: SceneController method executed?
- Check: Geometry actually changed? (read back dimensions)

**Issue**: 3D updates but UI doesn't
- Check: ObjectEventBus.emit() called?
- Check: PropertyPanelSync subscribed to event type?
- Check: postMessage sent to UI?

**Issue**: UI updates but 3D doesn't
- Check: UnifiedCommunication sending message?
- Check: PropertyUpdateHandler receiving message?
- Check: ObjectStateManager.updateObject() reached?

**Issue**: Layout not triggered
- Check: Is parent a container with autoLayout enabled?
- Check: Is update source 'push-tool'? (suppresses layout)
- Check: scheduleParentLayoutUpdate() called?

---

## Testing Scenarios

### Unit Test: Single Property Update

```javascript
test('Dimension update flows through full chain', async () => {
  // Arrange
  const objectId = createTestObject();
  const oldDimension = getDimension(objectId, 'x');

  // Act
  objectStateManager.updateObject(objectId, {
    dimensions: { x: 10 }
  });
  await waitForPropagation();

  // Assert
  const newDimension = getDimension(objectId, 'x');
  expect(newDimension).toBe(10);

  // Verify event emitted
  expect(mockEventBus.emit).toHaveBeenCalledWith(
    EVENT_TYPES.GEOMETRY,
    objectId,
    expect.objectContaining({ changeType: 'dimensions' })
  );
});
```

### Integration Test: Layout Propagation

```javascript
test('Child dimension change triggers parent layout', async () => {
  // Arrange
  const container = createContainer({ autoLayout: { enabled: true, direction: 'x' } });
  const child = createBoxInContainer(container.id, { dimensions: { x: 5 } });
  const initialContainerSize = getContainerSize(container.id);

  // Act
  objectStateManager.updateObject(child.id, {
    dimensions: { x: 10 } // Double child size
  });
  await waitForLayoutPropagation();

  // Assert
  const newContainerSize = getContainerSize(container.id);
  expect(newContainerSize.x).toBeGreaterThan(initialContainerSize.x);
});
```

### Performance Test: Rapid Updates

```javascript
test('Rapid property updates stay within 60fps budget', async () => {
  const objectId = createTestObject();
  const startTime = performance.now();

  // Simulate 60 updates in 1 second
  for (let i = 0; i < 60; i++) {
    objectStateManager.updateObject(objectId, {
      position: { x: i }
    });
    await wait(16); // 60fps = 16ms per frame
  }

  const endTime = performance.now();
  const totalTime = endTime - startTime;

  // Should complete in ~1 second (allowing 10% overhead)
  expect(totalTime).toBeLessThan(1100);
});
```

---

## References

- [STATE-OWNERSHIP.md](STATE-OWNERSHIP.md) - Who owns what
- [COMMUNICATION-ARCHITECTURE.md](COMMUNICATION-ARCHITECTURE.md) - Communication layer details
- [Refactoring Plan](../refactoring/REFACTORING-PLAN-2025-Q1.md) - Optimization plans
- [ObjectStateManager](../../core/object-state-manager.js) - Implementation
- [SceneController](../../scene/scene-controller.js) - Geometry updates
- [LayoutEngine](../../layout/layout-engine.js) - Layout calculations

---

**Version History**

- 1.0.0 (2025-01-13): Initial flow documentation for Q1 refactoring baseline
