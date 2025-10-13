# Communication Architecture

**Version**: 1.0.0 - Pre-Consolidation Baseline
**Date**: 2025-01-13
**Status**: Documentation of Current State (To Be Refactored)
**Part of**: Refactoring Plan 2025-Q1, Phase 3

---

## Executive Summary

**Problem**: Modler V2 currently has **3 separate communication systems** handling UI ↔ Main window data synchronization. This creates:
- Duplicate logic (~2092 LOC total)
- Competing update pathways
- Difficult debugging
- Potential for circular updates

**Solution**: Phase 3 of Q1 refactoring will consolidate into **1 bidirectional communication bridge** (~800 LOC).

This document serves as the baseline for understanding the current architecture before consolidation.

---

## Current Architecture: 3 Systems

### System 1: PropertyPanelSync (Main → UI)

**Location**: `integration/svelte/property-panel-sync.js`
**Size**: 1258 lines
**Direction**: Main window → UI (one-way)
**Purpose**: Sends 3D state changes to UI for display

**Responsibilities**:
- Subscribe to ObjectEventBus events
- Serialize object data for postMessage
- Throttle/debounce updates
- Handle hierarchy changes
- Maintain object tree state

**Key Methods**:
```javascript
// Event handlers
handleGeometryEvent(event)
handleTransformEvent(event)
handleMaterialEvent(event)
handleHierarchyEvent(event)

// UI sync methods
refreshSelectionUI(selectedObjectIds)
refreshCompleteHierarchy()
syncSelectionFromThreeJS(selectedObjects)

// PostMessage senders
sendObjectUpdate(objectData)
sendHierarchyUpdate(hierarchyData)
```

**Data Flow**:
```
ObjectEventBus events
  ↓
PropertyPanelSync handlers
  ↓
Serialize via ObjectDataFormat
  ↓
window.postMessage()
  ↓
UI receives message
```

### System 2: UnifiedCommunication (UI → Main)

**Location**: `svelte-ui/src/lib/services/unified-communication.ts`
**Size**: 295 lines
**Direction**: UI → Main window (one-way)
**Purpose**: Send user actions to main window

**Responsibilities**:
- Provide API for UI components
- Serialize property updates
- Send commands (create, delete, tool activation)
- Handle request/response pattern (limited)

**Key Methods**:
```typescript
// Property updates
async updateProperty(objectId, property, value)

// Object operations
async createObject(type, options)
async deleteObject(objectId)
async duplicateObject(objectId)

// Tool operations
async activateTool(toolName)
async deactivateTool()

// Hierarchy operations
async moveObjectToContainer(objectId, containerId)
async reorderObjects(containerId, newOrder)
```

**Data Flow**:
```
UI component calls UnifiedCommunication
  ↓
Serialize data
  ↓
window.parent.postMessage()
  ↓
Main window receives
  ↓
Routes to PropertyUpdateHandler or ToolController
```

### System 3: PropertyController (UI-side State)

**Location**: `svelte-ui/src/lib/services/property-controller.ts`
**Size**: 539 lines
**Direction**: Internal UI state management
**Purpose**: Validate, batch, and manage UI-side property state

**Responsibilities**:
- Property validation (constraints)
- Batching rapid changes
- Throttling/debouncing
- Rate limiting
- Format conversion (UI ↔ internal)

**Key Methods**:
```typescript
// Update methods
updateProperty(objectId, property, value)
updatePropertyDebounced(objectId, property, value, source, delay)
updatePropertyImmediate(objectId, property, value)
updatePropertiesBatched(objectId, properties)

// Validation
validateValue(property, value)
getConstraints(property)

// Utilities
incrementProperty(objectId, property, direction)
flushPendingUpdates()
```

**Data Flow**:
```
UI input
  ↓
PropertyController validation & batching
  ↓
UnifiedCommunication.updateProperty()
  ↓
Main window
```

---

## Current Problems

### Problem 1: Duplicate Validation Logic

**PropertyController** validates constraints:
```typescript
// svelte-ui/src/lib/services/property-controller.ts:159
validateValue(property: PropertyPath, value: any): {valid: boolean, value: any} {
  const constraints = this.constraints.get(property);
  if (constraints.min !== undefined && value < constraints.min) {
    value = constraints.min;
  }
  // ... more validation
}
```

**PropertyPanelSync** also validates during serialization:
```javascript
// integration/svelte/property-panel-sync.js:892
serializeForPostMessage(objectData) {
  // Format conversion and validation here
}
```

**Impact**: Same logic in two places, potential inconsistency.

### Problem 2: Competing Update Pathways

**Scenario**: User changes dimension while layout is updating

```
Path 1 (User):
UI Input → PropertyController → UnifiedCommunication → PropertyUpdateHandler
  → ObjectStateManager → SceneController → ObjectEventBus

Path 2 (Layout):
LayoutEngine → SceneController → ObjectEventBus → PropertyPanelSync → UI

If these overlap, which wins? Answer: Undefined behavior.
```

**Evidence**: Comment in property-panel-sync.js line 256:
```javascript
// Suppress competing updates with stale data during selection changes
```

### Problem 3: Circular Update Risk

**Potential Loop**:
```
PropertyPanelSync sends update to UI
  ↓
UI store updates
  ↓
Store subscriber triggers re-render
  ↓
Component calls updateProperty()
  ↓
UnifiedCommunication sends back to main
  ↓
ObjectStateManager applies update
  ↓
ObjectEventBus emits event
  ↓
PropertyPanelSync receives event
  ↓
[LOOP BACK TO START]
```

**Current Mitigation**:
- PropertyPanelSync skips updates for selected objects (relies on refreshSelectionUI)
- Transform events not subscribed to avoid conflicts
- Manual guards in various places

**Problem**: Fragile, relies on implicit knowledge.

### Problem 4: High Latency from Multiple Hops

**Current Chain**:
```
UI → PropertyController (validate) → UnifiedCommunication (serialize)
  → postMessage → PropertyUpdateHandler (route) → ObjectStateManager
```

**5 hops** before reaching state manager!

**Impact**: 10-20ms communication overhead on every property change.

### Problem 5: Inconsistent Error Handling

**PropertyController** returns boolean:
```typescript
updateProperty(): boolean
```

**UnifiedCommunication** returns Promise:
```typescript
async updateProperty(): Promise<void>
```

**PropertyPanelSync** logs errors:
```javascript
catch (error) {
  console.error('PropertyPanelSync error:', error);
}
```

**Impact**: No unified error reporting, hard to debug failures.

---

## Message Formats (Current State)

### PropertyPanelSync → UI Messages

```typescript
// Object selection update
{
  type: 'object-selected',
  objectData: {
    id: string,
    type: string,
    name: string,
    position: {x, y, z},
    rotation: {x, y, z},
    dimensions: {x, y, z},
    material: {color, opacity},
    // ... more properties
  }
}

// Multi-selection update
{
  type: 'multi-selection',
  count: number,
  commonProperties: {
    // Only properties shared by all selected objects
  }
}

// Hierarchy update
{
  type: 'hierarchy-update',
  objects: Array<ObjectData>,
  rootObjects: Array<objectId>
}
```

### UnifiedCommunication → Main Messages

```typescript
// Property update
{
  type: 'property-update',
  objectId: string,
  property: string, // e.g., 'dimensions.x'
  value: any
}

// Object creation
{
  type: 'create-object',
  objectType: string,
  options: {
    position?: {x, y, z},
    dimensions?: {x, y, z},
    // ... creation options
  }
}

// Tool activation
{
  type: 'activate-tool',
  toolName: string,
  options?: any
}
```

---

## Performance Characteristics (Current)

### Latency Measurements (Estimated)

| Operation | Current Latency | Consolidation Target |
|-----------|----------------|----------------------|
| Property update (UI → Main) | 10-20ms | 5-10ms |
| Selection update (Main → UI) | 20-40ms | 10-20ms |
| Hierarchy refresh (Main → UI) | 50-100ms | 30-60ms |
| Error propagation | Not measured | <10ms |

### Message Throughput (Estimated)

- **Normal usage**: 10-30 messages/second
- **Rapid drag operations**: 60+ messages/second (throttled)
- **Complex hierarchy changes**: Burst of 100+ messages

---

## Phase 3 Consolidation Plan

### Target Architecture: 1 Bidirectional Bridge

```
┌─────────────────────────────────────────────────────┐
│ UI (Svelte)                                         │
│                                                     │
│  ┌───────────────────────────┐                     │
│  │ UIAdapter                 │                     │
│  │ - PostMessage integration │                     │
│  │ - Store synchronization   │                     │
│  │ - Request/response pairing│                     │
│  └───────────┬───────────────┘                     │
│              │                                      │
└──────────────┼──────────────────────────────────────┘
               │
         [PostMessage]
               │
┌──────────────┼──────────────────────────────────────┐
│              │                                      │
│  ┌───────────▼───────────────┐                     │
│  │ CommunicationBridge       │                     │
│  │ - Message routing         │                     │
│  │ - Throttling/batching     │                     │
│  │ - Serialization           │                     │
│  │ - Error handling          │                     │
│  └───────────┬───────────────┘                     │
│              │                                      │
│  ┌───────────▼───────────────┐                     │
│  │ MainAdapter               │                     │
│  │ - ObjectEventBus integ.   │                     │
│  │ - ObjectStateManager integ│                     │
│  │ - Validation              │                     │
│  └───────────────────────────┘                     │
│                                                     │
│ Main Window                                         │
└─────────────────────────────────────────────────────┘
```

### Component Breakdown

**CommunicationBridge** (~400 LOC)
- Core bidirectional message routing
- Protocol definition
- Throttling strategies (immediate, throttled, batched)
- Serialization/deserialization
- Error handling and recovery
- Statistics and debugging

**MainAdapter** (~200 LOC)
- ObjectEventBus subscription
- ObjectStateManager integration
- Message validation
- Response generation
- Event → Message translation

**UIAdapter** (~200 LOC)
- PostMessage send/receive
- Svelte store integration
- Request/response pairing
- Message → Store updates
- UI-specific error handling

### Migration Strategy

**Phase 3.1: Design & Implement**
1. Design message protocol schema
2. Implement CommunicationBridge core
3. Implement MainAdapter
4. Implement UIAdapter
5. Add comprehensive tests

**Phase 3.2: Shadow Mode**
1. Run new system in parallel with old systems
2. Compare outputs for validation
3. Log discrepancies
4. Fix any behavioral differences

**Phase 3.3: Gradual Migration**
1. Route 10% of traffic through new system
2. Monitor errors and performance
3. Increase to 50%, then 100%
4. Keep old systems as fallback

**Phase 3.4: Deprecation**
1. Mark old systems as deprecated
2. 2-week validation period
3. Remove old code
4. Update all documentation

### Expected Benefits

**Code Reduction**:
- Current: 2092 LOC (3 files)
- Target: 800 LOC (3 files)
- **Reduction: 62%**

**Performance Improvement**:
- Latency reduction: 30-40%
- Fewer serialization passes
- Single validation layer
- Optimized message routing

**Maintainability**:
- Single system to understand
- Unified error handling
- Clear bidirectional contract
- Easier debugging

**Reliability**:
- No competing pathways
- Explicit circular update prevention
- Centralized throttling
- Request/response tracking

---

## Testing Strategy

### Unit Tests

```javascript
// CommunicationBridge routing
test('Routes messages to correct adapter', () => {
  const bridge = new CommunicationBridge(mainAdapter, uiAdapter);
  bridge.sendToUI('object-update', data);
  expect(uiAdapter.send).toHaveBeenCalledWith('object-update', data);
});

// MainAdapter event handling
test('Translates ObjectEventBus events to messages', () => {
  const adapter = new MainAdapter(mockBridge);
  objectEventBus.emit(EVENT_TYPES.GEOMETRY, objectId, changes);
  expect(mockBridge.sendToUI).toHaveBeenCalledWith('geometry-update', ...);
});

// UIAdapter store sync
test('Updates stores on message receipt', () => {
  const adapter = new UIAdapter(mockBridge);
  adapter.handleMessage({type: 'object-update', data: ...});
  expect(selectedObject.set).toHaveBeenCalled();
});
```

### Integration Tests

```javascript
// Full round-trip
test('Property update flows UI → Main → UI', async () => {
  // UI sends update
  await uiAdapter.updateProperty(objectId, 'dimensions.x', 10);

  // Main applies update
  await waitForPropagation();

  // Verify Main state
  const objectData = sceneController.getObject(objectId);
  expect(getDimensions(objectData).x).toBe(10);

  // Verify UI receives update
  const uiObject = get(selectedObject);
  expect(uiObject.dimensions.x).toBe(10);
});

// Circular update prevention
test('Prevents circular updates', async () => {
  let updateCount = 0;
  mainAdapter.on('update', () => updateCount++);

  // Trigger update
  await uiAdapter.updateProperty(objectId, 'dimensions.x', 10);
  await waitForPropagation();

  // Should only process once, not loop
  expect(updateCount).toBe(1);
});
```

### Performance Tests

```javascript
// Latency measurement
test('Message latency < 10ms', async () => {
  const start = performance.now();
  await uiAdapter.updateProperty(objectId, 'material.color', '#ff0000');
  const latency = performance.now() - start;
  expect(latency).toBeLessThan(10);
});

// Throughput test
test('Handles 60 updates/second', async () => {
  const start = performance.now();
  for (let i = 0; i < 60; i++) {
    uiAdapter.updateProperty(objectId, 'position.x', i);
    await wait(16); // 60fps
  }
  const duration = performance.now() - start;
  expect(duration).toBeLessThan(1100); // Allow 10% overhead
});
```

---

## Migration Checklist

### Pre-Migration
- [ ] Complete design document
- [ ] Get team review and approval
- [ ] Set up test environment
- [ ] Create performance baseline measurements

### Implementation
- [ ] Implement CommunicationBridge
- [ ] Implement MainAdapter
- [ ] Implement UIAdapter
- [ ] Write unit tests (80%+ coverage)
- [ ] Write integration tests (critical paths)
- [ ] Write performance tests

### Validation
- [ ] Run shadow mode for 1 week
- [ ] Compare outputs with old systems
- [ ] Fix all discrepancies
- [ ] Performance tests pass
- [ ] No circular updates detected

### Migration
- [ ] Route 10% traffic through new system
- [ ] Monitor for 2 days
- [ ] Route 50% traffic
- [ ] Monitor for 3 days
- [ ] Route 100% traffic
- [ ] Monitor for 1 week

### Cleanup
- [ ] Mark old systems deprecated
- [ ] 2-week validation period
- [ ] Remove PropertyPanelSync
- [ ] Remove UnifiedCommunication adapter logic
- [ ] Simplify PropertyController
- [ ] Update all documentation
- [ ] Team training session

---

## Rollback Procedure

### If Issues Detected in Shadow Mode
```bash
# No rollback needed - old systems still active
# Fix issues in new system, re-test
```

### If Issues During Migration (10-50% traffic)
```javascript
// In CommunicationBridge constructor:
const TRAFFIC_PERCENTAGE = 10; // Reduce back to 0 or 10

// Or feature flag:
if (window.USE_LEGACY_COMMUNICATION) {
  // Route through old systems
}
```

### If Critical Issues at 100%
```bash
# Emergency rollback commit
git revert <consolidation-commit-range>
git push origin refactor/communication-and-state-consolidation --force

# Redeploy
npm run build
# Restart application
```

---

## References

- [STATE-OWNERSHIP.md](STATE-OWNERSHIP.md) - State management architecture
- [PROPERTY-UPDATE-FLOW.md](PROPERTY-UPDATE-FLOW.md) - Update flow details
- [Refactoring Plan](../refactoring/REFACTORING-PLAN-2025-Q1.md) - Phase 3 details
- [PropertyPanelSync](../../integration/svelte/property-panel-sync.js) - Current implementation
- [UnifiedCommunication](../../svelte-ui/src/lib/services/unified-communication.ts) - Current implementation
- [PropertyController](../../svelte-ui/src/lib/services/property-controller.ts) - Current implementation

---

**Version History**

- 1.0.0 (2025-01-13): Pre-consolidation baseline documentation
