# Unified Notification System Architecture

## Executive Summary

The current Modler V2 notification system consists of multiple disconnected pathways that have grown organically, leading to inconsistent behavior, race conditions, and difficult debugging. This document outlines a unified notification highway architecture to replace the fragmented system with a single, reliable, and extensible solution.

## Current State Analysis

### Existing Notification Pathways

1. **Tool-Direct Notifications**
   - `window.notifyObjectModified()` → main-integration.js
   - Direct calls from tools (push-tool.js, move-tool.js)
   - Inconsistent object references and timing

2. **Data Sync System**
   - `dataSync.sendFullDataUpdate()` → data-sync.js
   - Multiple serialization points
   - Redundant PostMessage calls

3. **Transformation Manager**
   - `TransformationManager.completeTransformation()`
   - Centralized for move operations only
   - Not used by all tools consistently

4. **Direct PostMessage Calls**
   - Scattered throughout integration files
   - Different message formats and structures
   - No central coordination

### Identified Problems

#### 1. **Multiple Sources of Truth**
```javascript
// Push tool modifies actualPushedMesh.geometry
actualPushedMesh.geometry = modifiedGeometry;
// But notifies about pushedObject
window.notifyObjectModified(pushedObject, 'geometry');
// Data sync serializes pushedObject (old geometry)
```

#### 2. **Inconsistent Update Types**
- Base: 'geometry', 'transform', 'hierarchy'
- Derived: 'object-modified-geometry', 'object-modified-transform'
- UI: 'property-update', 'property-refresh'
- Communication: 'data-update', 'tool-state-update'

#### 3. **Race Conditions**
```javascript
// Two separate calls for same operation
notifyObjectModified(object, 'geometry');           // Path 1
dataSync.sendFullDataUpdate([object], 'property-update'); // Path 2
```

#### 4. **Debugging Complexity**
- 4+ different notification pathways
- Inconsistent logging and tracing
- No centralized error handling

#### 5. **Tool Integration Inconsistency**
- Move tool: Uses TransformationManager (works)
- Push tool: Direct notifyObjectModified (partially works)
- Box creation: Mixed approach (inconsistent)

## Unified System Architecture

### Core Principles

1. **Single Source of Truth**: One event bus for all object changes
2. **Consistent Interface**: All tools use same notification pattern
3. **Centralized Serialization**: One serializer for all object data
4. **Reliable Communication**: One PostMessage pathway to UI
5. **Extensible Design**: Easy to add new tools and notifications

### System Components

#### 1. ObjectEventBus (Central Hub)
```javascript
class ObjectEventBus {
    // Single notification hub for all object changes
    emit(eventType, objectId, changeData, options = {})
    subscribe(eventType, callback)
    unsubscribe(eventType, callback)
}
```

**Event Types (Standardized):**
- `object:transform` - Position, rotation, scale changes
- `object:geometry` - Dimension, vertex modifications
- `object:material` - Color, opacity, texture changes
- `object:hierarchy` - Parent-child relationships
- `object:lifecycle` - Create, delete operations

#### 2. ObjectSerializer (Single Serialization)
```javascript
class ObjectSerializer {
    // One function handles all object serialization
    serializeObject(object, changeType)
    serializeBatch(objects, changeType)
}
```

**Features:**
- Uses GeometryUtils for dimensions
- Uses TransformationManager for transforms
- Consistent field naming throughout
- Single serialization pathway

#### 3. PropertyPanelSync (UI Communication)
```javascript
class PropertyPanelSync {
    // Single UI synchronization system
    constructor(eventBus, panelManager)
    handleObjectEvent(eventType, objectData)
    sendToUI(updateType, data)
}
```

**Features:**
- Subscribes to ObjectEventBus
- Handles PostMessage to Svelte panels
- Built-in throttling for real-time updates
- Centralized error handling

#### 4. Tool Integration Pattern
```javascript
// Standard pattern for all tools
class ExampleTool {
    modifyObject(object, modification) {
        // 1. Apply modification
        this.applyModification(object, modification);

        // 2. Emit event (ObjectEventBus handles the rest)
        objectEventBus.emit('object:geometry', object.userData.id, {
            changeType: 'dimension',
            axis: 'x',
            newValue: modification.value
        });
    }
}
```

### Data Flow Architecture

```
Tool Action → ObjectEventBus → [ObjectSerializer + PropertyPanelSync] → Svelte UI
     ↓                ↓                      ↓                           ↓
  Modify Object    Emit Event         Serialize & Send            Update Store
```

**Benefits:**
- Single notification pathway
- Consistent serialization
- Centralized throttling and error handling
- Easy to trace and debug

## Implementation Plan

### Phase 1: Foundation (Days 1-2)
**Objective**: Create core system without breaking existing functionality

#### Step 1.1: Create ObjectEventBus
- Location: `/application/events/object-event-bus.js`
- Implement event emission, subscription, unsubscription
- Add throttling and batching capabilities
- **Verification**: Unit tests for event bus functionality

#### Step 1.2: Create ObjectSerializer
- Location: `/application/serialization/object-serializer.js`
- Consolidate existing serialization logic
- Use GeometryUtils and TransformationManager
- **Verification**: Compare serialization output with existing system

#### Step 1.3: Create PropertyPanelSync
- Location: `/integration/svelte/property-panel-sync.js`
- Subscribe to ObjectEventBus
- Handle PostMessage communication
- **Verification**: Test PostMessage delivery to Svelte UI

### Phase 2: Tool Integration (Days 3-4)
**Objective**: Migrate tools to use unified system

#### Step 2.1: Migrate Move Tool
- Update TransformationManager to emit events
- Remove direct notifyObjectModified calls
- **Verification**: Position updates work in property panel

#### Step 2.2: Migrate Push Tool
- Replace direct notifications with event emission
- Fix object reference issues
- **Verification**: Dimension updates work in property panel

#### Step 2.3: Migrate Box Creation Tool
- Standardize creation notifications
- Use unified event system
- **Verification**: Real-time dimension updates during creation

### Phase 3: Legacy System Removal (Days 5-6)
**Objective**: Clean up redundant systems

#### Step 3.1: Remove Redundant Notifications
- Remove multiple `sendFullDataUpdate` variants
- Simplify data-sync.js to only handle communication
- **Verification**: All property panel updates still work

#### Step 3.2: Update Svelte Integration
- Simplify threejs-bridge.ts
- Remove redundant PostMessage handling
- **Verification**: UI responsiveness maintained

#### Step 3.3: Remove Debug Logging
- Clean up temporary debugging code
- Add permanent logging at appropriate levels
- **Verification**: Clean console output

### Phase 4: Testing & Documentation (Day 7)
**Objective**: Ensure system reliability

#### Step 4.1: Comprehensive Testing
- Test all tools with property panel updates
- Test edge cases (rapid updates, errors)
- Performance testing with multiple objects

#### Step 4.2: Update Documentation
- Update API documentation
- Create tool integration guide
- Document event types and patterns

## Verification Strategy

### Functional Tests
1. **Move Tool**: Position updates in real-time
2. **Push Tool**: Dimension updates in real-time
3. **Box Creation**: Live dimension updates during creation
4. **Keyboard Shortcuts**: Tool switching works with UI updates
5. **Multiple Objects**: Batch operations work correctly

### Performance Tests
1. **Real-time Updates**: No lag during continuous operations
2. **Memory Usage**: No memory leaks from event subscriptions
3. **UI Responsiveness**: Smooth property panel updates

### Error Handling Tests
1. **Missing Objects**: Graceful handling of invalid object IDs
2. **Network Issues**: PostMessage failures handled correctly
3. **Tool Errors**: Notification system continues working

## Migration Safety

### Backup Strategy
- Current working state committed to GitHub
- Feature branch for unified system development
- Ability to rollback at any step

### Incremental Approach
- Each phase can be tested independently
- Existing system continues working during migration
- A/B testing possible between old and new systems

### Risk Mitigation
- Extensive logging during migration
- Fallback to existing system if issues arise
- Gradual tool migration (one at a time)

## Expected Benefits

### Immediate
- ✅ Reliable real-time property panel updates
- ✅ Consistent behavior across all tools
- ✅ Easier debugging with single notification pathway

### Long-term
- ✅ Easier to add new tools and features
- ✅ Better performance with centralized throttling
- ✅ More maintainable codebase
- ✅ Foundation for future features (undo/redo, collaboration)

## Conclusion

The unified notification system addresses fundamental architectural issues that have made the current system difficult to debug and maintain. By implementing this system incrementally over 7 days, we can achieve reliable real-time updates while maintaining system stability throughout the migration.

This document serves as the blueprint for implementation, with each step clearly defined and verifiable.