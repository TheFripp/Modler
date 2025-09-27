# Unified Notification System - Implementation Plan

## Overview

This document provides a detailed, step-by-step implementation plan for migrating from the current fragmented notification system to the unified ObjectEventBus architecture. Each step includes specific tasks, verification criteria, and rollback procedures.

## Pre-Implementation Checklist

- [x] Current state backed up to GitHub (commit: 1e24f94)
- [ ] Create feature branch for unified system
- [ ] Set up testing environment
- [ ] Document current system behavior for comparison

## Phase 1: Foundation (Days 1-2)

### Day 1: Core Infrastructure

#### Task 1.1: Create ObjectEventBus
**Estimated Time**: 3-4 hours

**Files to Create:**
- `/application/events/object-event-bus.js`

**Specific Implementation:**
```javascript
class ObjectEventBus {
    constructor() {
        this.subscribers = new Map(); // eventType -> Set<callback>
        this.throttleMap = new Map(); // eventType+objectId -> timeout
        this.batchQueue = new Map(); // eventType -> Array<events>
        this.THROTTLE_DELAY = 16; // ~60fps
    }

    emit(eventType, objectId, changeData, options = {}) {
        // Implementation with throttling and batching
    }

    subscribe(eventType, callback) {
        // Subscription management
    }

    // Batch processing for performance
    processBatch(eventType) {
        // Batch multiple events for same object
    }
}
```

**Verification Criteria:**
- [ ] Event emission works correctly
- [ ] Subscription/unsubscription functions
- [ ] Throttling prevents excessive calls
- [ ] Batch processing combines events
- [ ] Memory leaks test (subscribe/unsubscribe cycles)

**Testing Commands:**
```bash
# Unit tests for ObjectEventBus
npm test -- object-event-bus.test.js
```

#### Task 1.2: Create ObjectSerializer
**Estimated Time**: 4-5 hours

**Files to Create:**
- `/application/serialization/object-serializer.js`

**Specific Implementation:**
```javascript
class ObjectSerializer {
    constructor() {
        this.geometryUtils = null;
        this.transformationManager = null;
        this.sceneController = null;
    }

    initializeComponents() {
        // Get references to existing systems
    }

    serializeObject(object, changeType = 'general') {
        // Consolidated serialization logic
        // Use GeometryUtils for dimensions
        // Use existing transform logic
        // Consistent field naming
    }

    serializeBatch(objects, changeType) {
        // Efficient batch serialization
    }
}
```

**Migration Strategy:**
1. Extract existing serialization logic from data-sync.js
2. Consolidate dimension calculation methods
3. Ensure compatibility with existing data format
4. Add comprehensive error handling

**Verification Criteria:**
- [ ] Serialization output matches existing format
- [ ] GeometryUtils integration works
- [ ] Handles all object types (regular, containers)
- [ ] Performance comparable to existing system
- [ ] Error handling for invalid objects

**Testing Commands:**
```bash
# Compare serialization output
node test/compare-serialization.js
```

### Day 2: Communication Layer

#### Task 2.1: Create PropertyPanelSync
**Estimated Time**: 4-5 hours

**Files to Create:**
- `/integration/svelte/property-panel-sync.js`

**Specific Implementation:**
```javascript
class PropertyPanelSync {
    constructor(eventBus, panelManager) {
        this.eventBus = eventBus;
        this.panelManager = panelManager;
        this.serializer = new ObjectSerializer();
        this.setupEventSubscriptions();
    }

    setupEventSubscriptions() {
        this.eventBus.subscribe('object:transform', this.handleTransformEvent.bind(this));
        this.eventBus.subscribe('object:geometry', this.handleGeometryEvent.bind(this));
        // etc.
    }

    handleTransformEvent(eventData) {
        // Convert event to UI update
    }

    sendToUI(updateType, data) {
        // Centralized PostMessage handling
    }
}
```

**Integration Points:**
- Subscribe to ObjectEventBus events
- Use ObjectSerializer for data preparation
- Use existing panelManager for PostMessage delivery
- Maintain compatibility with Svelte UI expectations

**Verification Criteria:**
- [ ] Events reach PropertyPanelSync correctly
- [ ] PostMessages sent to correct panels
- [ ] Data format compatible with Svelte bridge
- [ ] No duplicate messages sent
- [ ] Error handling for communication failures

#### Task 2.2: Integration Wiring
**Estimated Time**: 2-3 hours

**Files to Modify:**
- `/integration/svelte/main-integration.js`

**Changes:**
1. Initialize ObjectEventBus
2. Initialize ObjectSerializer
3. Initialize PropertyPanelSync
4. Keep existing `window.notifyObjectModified` as legacy bridge (temporarily)

**Verification Criteria:**
- [ ] All systems initialize correctly
- [ ] Legacy system continues working
- [ ] New system ready for tool integration

## Phase 2: Tool Integration (Days 3-4)

### Day 3: Move Tool Migration

#### Task 3.1: Update TransformationManager
**Estimated Time**: 2-3 hours

**Files to Modify:**
- `/application/utilities/transformation-manager.js`

**Changes:**
```javascript
// Add ObjectEventBus integration
completeTransformation(object, transformType) {
    // Existing logic...

    // NEW: Emit event instead of direct notification
    if (this.eventBus) {
        this.eventBus.emit('object:transform', object.userData.id, {
            changeType: transformType,
            position: object.position.toArray(),
            rotation: object.rotation.toArray(),
            scale: object.scale.toArray()
        });
    }

    // Remove old notifyObjectModified call
}
```

**Verification Criteria:**
- [ ] Move tool position updates work in property panel
- [ ] Real-time updates during dragging
- [ ] No duplicate notifications
- [ ] Performance maintained

#### Task 3.2: Update Move Tool
**Estimated Time**: 1-2 hours

**Files to Modify:**
- `/application/tools/move-tool.js` (if exists)

**Changes:**
- Remove any direct `notifyObjectModified` calls
- Ensure all updates go through TransformationManager
- Verify real-time update flow

**Verification Criteria:**
- [ ] Move tool works identically to before
- [ ] Property panel updates in real-time
- [ ] No console errors

### Day 4: Push Tool Migration

#### Task 4.1: Update Push Tool
**Estimated Time**: 3-4 hours

**Files to Modify:**
- `/application/tools/push-tool.js`

**Changes:**
```javascript
refreshVisualFeedback() {
    // Existing logic...

    // NEW: Emit event instead of direct notification
    if (window.objectEventBus) {
        window.objectEventBus.emit('object:geometry', this.pushedObject.userData.id, {
            changeType: 'dimension',
            axis: this.pushAxis,
            newDimensions: this.getCurrentDimensions()
        });
    }

    // Remove old notifyObjectModified call
}
```

**Key Fixes:**
1. Use unified object reference (pushedObject consistently)
2. Emit geometry events during real-time updates
3. Remove direct notification calls
4. Ensure geometry synchronization

**Verification Criteria:**
- [ ] Push tool dimension updates work in real-time
- [ ] No object reference mismatches
- [ ] Geometry modifications reflected immediately
- [ ] Performance during rapid pushing

#### Task 4.2: Update Box Creation Tool
**Estimated Time**: 2-3 hours

**Files to Modify:**
- `/application/tools/box-creation-tool.js`

**Changes:**
- Replace direct notifications with event emissions
- Standardize creation flow
- Ensure real-time updates during resize

**Verification Criteria:**
- [ ] Box creation shows live dimension updates
- [ ] Final dimensions correct after creation
- [ ] No interference with other tools

## Phase 3: Legacy System Removal (Days 5-6)

### Day 5: Clean Up Redundant Systems

#### Task 5.1: Simplify Data-Sync
**Estimated Time**: 3-4 hours

**Files to Modify:**
- `/integration/svelte/data-sync.js`

**Changes:**
1. Remove `sendFullDataUpdate` method
2. Keep only basic serialization helpers
3. Remove redundant PostMessage logic
4. Update remaining references

**Verification Strategy:**
- Test each tool after each removal
- Ensure no broken functionality
- Verify property panel still works

#### Task 5.2: Update Main Integration
**Estimated Time**: 2-3 hours

**Files to Modify:**
- `/integration/svelte/main-integration.js`

**Changes:**
1. Remove old `notifyObjectModified` implementation
2. Clean up redundant initialization
3. Simplify panel communication

### Day 6: Svelte Integration Update

#### Task 6.1: Simplify Svelte Bridge
**Estimated Time**: 2-3 hours

**Files to Modify:**
- `/svelte-ui/src/lib/bridge/threejs-bridge.ts`

**Changes:**
1. Consolidate PostMessage handling
2. Remove redundant message processing
3. Simplify store updates

#### Task 6.2: Remove Debug Logging
**Estimated Time**: 1-2 hours

**Files to Modify:**
- All files with temporary debugging

**Changes:**
1. Remove temporary console.log statements
2. Keep essential error logging
3. Add permanent debug levels if needed

## Phase 4: Testing & Documentation (Day 7)

### Day 7: Comprehensive Testing

#### Task 7.1: Functional Testing
**Estimated Time**: 3-4 hours

**Test Matrix:**
| Tool | Action | Expected Result | Status |
|------|--------|----------------|--------|
| Move | Drag object | Position updates real-time | [ ] |
| Push | Push face | Dimensions update real-time | [ ] |
| Box Create | Resize during creation | Live dimension updates | [ ] |
| Keyboard | Press Q,W,E,R | Tool switching with UI highlight | [ ] |
| Multi-select | Select multiple objects | All properties shown | [ ] |

#### Task 7.2: Performance Testing
**Estimated Time**: 2-3 hours

**Tests:**
- [ ] Real-time updates with no lag
- [ ] Memory usage stable over time
- [ ] No event listener leaks
- [ ] UI responsiveness maintained

#### Task 7.3: Error Handling Testing
**Estimated Time**: 1-2 hours

**Tests:**
- [ ] Invalid object IDs handled gracefully
- [ ] Network failures don't break system
- [ ] Tool errors don't stop notifications

## Rollback Procedures

### Emergency Rollback
If critical issues arise:
```bash
git reset --hard 1e24f94
npm run dev:main
cd svelte-ui && npm run dev
```

### Partial Rollback
For specific component issues:
1. Identify problematic component
2. Revert specific file changes
3. Test isolated functionality
4. Re-implement with fixes

## Success Criteria

### Must Have
- [ ] All tools show real-time property updates
- [ ] No regression in existing functionality
- [ ] Performance maintained or improved
- [ ] Clean, maintainable code

### Nice to Have
- [ ] Improved error handling
- [ ] Better debugging capabilities
- [ ] Foundation for future features
- [ ] Reduced code complexity

## Post-Implementation

### Documentation Updates
- [ ] Update API documentation
- [ ] Create tool integration guide
- [ ] Update architecture diagrams
- [ ] Document event types and patterns

### Future Enhancements
- [ ] Undo/redo system integration
- [ ] Real-time collaboration support
- [ ] Advanced debugging tools
- [ ] Performance monitoring

This implementation plan provides a structured approach to migrating the notification system while maintaining stability and ensuring nothing is missed.