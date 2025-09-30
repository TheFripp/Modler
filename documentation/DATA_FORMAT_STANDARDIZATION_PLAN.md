# Data Format Standardization Project Plan
## Unified ObjectData Format Implementation

### Executive Summary
Standardize all object data communication between Three.js scene and Svelte UI to use a single, consistent format throughout the entire system. This eliminates 5+ different formats and 6+ conversion points that are causing errors.

---

## Phase 1: Analysis & Documentation
### 1.1 Current State Audit
- [ ] Document all existing data formats in the system
  - [ ] Three.js mesh objects raw format
  - [ ] ObjectStateManager storage format
  - [ ] PostMessage serialized format (flat properties)
  - [ ] Svelte store format (nested objects)
  - [ ] Property panel display format
- [ ] Map all conversion points
  - [ ] ObjectStateManager → PostMessage conversion
  - [ ] PostMessage → Svelte store conversion
  - [ ] Property panel → PostMessage conversion
  - [ ] Tool updates → ObjectStateManager conversion
  - [ ] Scene events → UI notification conversion
  - [ ] UI actions → Scene command conversion
- [ ] Identify all entry/exit points
  - [ ] Tool operations (move, rotate, scale, push)
  - [ ] Selection changes
  - [ ] Property panel updates
  - [ ] Container context changes
  - [ ] Hierarchy updates
  - [ ] Object creation/deletion

### 1.2 Format Design
- [ ] Define the canonical ObjectData format specification
  - [ ] Core properties (id, name, type, parentContainer)
  - [ ] Transform properties (position, rotation, scale as nested objects)
  - [ ] Physical properties (dimensions, material, color)
  - [ ] Container properties (isContainer, layoutMode, childIds)
  - [ ] Metadata properties (locked, visible, selected)
- [ ] Create TypeScript interface definition
- [ ] Document serialization rules for PostMessage
- [ ] Define validation schema

---

## Phase 2: Core Infrastructure Updates
### 2.1 Create Central Format Module
- [ ] Create `/application/serialization/object-data-format.js`
  - [ ] Implement `standardizeObjectData()` function
  - [ ] Implement `validateObjectData()` function
  - [ ] Implement `serializeForPostMessage()` function
  - [ ] Implement `deserializeFromPostMessage()` function
- [ ] Create TypeScript definitions in `/svelte-ui/src/lib/types/object-data.ts`
  - [ ] Define ObjectData interface
  - [ ] Define transform types (Position, Rotation, Scale)
  - [ ] Define container types
  - [ ] Export type guards

### 2.2 Update ObjectSerializer
- [ ] Modify `/application/serialization/object-serializer.js`
  - [ ] Remove all format conversion logic
  - [ ] Use standardizeObjectData() for all serialization
  - [ ] Ensure single format output
  - [ ] Add format version field for future migrations
  - [ ] Remove deprecated conversion functions

---

## Phase 3: Three.js Scene Side Updates
### 3.1 ObjectStateManager Updates
- [ ] Update `/application/state/object-state-manager.js`
  - [ ] Store objects in standardized format
  - [ ] Remove flat property storage
  - [ ] Update getObject() to return standard format
  - [ ] Update setObject() to expect standard format
  - [ ] Add migration for existing stored objects

### 3.2 Tool Updates
- [ ] Update `/application/tools/move-tool.js`
  - [ ] Use nested position object format
  - [ ] Remove flat property updates
  - [ ] Ensure ObjectEventBus events use standard format
- [ ] Update `/application/tools/rotate-tool.js`
  - [ ] Use nested rotation object format
  - [ ] Ensure consistent event format
- [ ] Update `/application/tools/scale-tool.js`
  - [ ] Use nested scale object format
  - [ ] Ensure consistent event format
- [ ] Update `/application/tools/push-tool.js`
  - [ ] Use standard format for position updates
- [ ] Update `/application/tools/box-creation-tool.js`
  - [ ] Create objects with standard format from start

### 3.3 Event System Updates
- [ ] Update `/application/events/object-event-bus.js`
  - [ ] Ensure all events carry standard format data
  - [ ] Add format validation before emit
  - [ ] Remove any format conversion logic

---

## Phase 4: Communication Bridge Updates
### 4.1 Main Integration Updates
- [ ] Update `/integration/svelte/main-integration.js`
  - [ ] Remove sanitizeForPostMessage complexity
  - [ ] Use serializeForPostMessage from central module
  - [ ] Remove all format conversion logic
  - [ ] Ensure all PostMessage sends standard format
  - [ ] Add format version to all messages

### 4.2 Property Panel Sync Updates
- [ ] Update `/integration/svelte/property-panel-sync.js`
  - [ ] Remove flat property conversion
  - [ ] Send standard format directly
  - [ ] Remove redundant transformations
  - [ ] Validate format before sending

### 4.3 Remove Deprecated Systems
- [ ] Remove `/integration/svelte/data-sync.js` completely
- [ ] Remove any legacy conversion functions
- [ ] Clean up unused format transformation code

---

## Phase 5: Svelte UI Updates
### 5.1 Store Updates
- [ ] Update `/svelte-ui/src/lib/stores/modler.ts`
  - [ ] Remove isSerializedObject checks
  - [ ] Remove convertFromSerializedFormat
  - [ ] Remove convertToEditableFormat
  - [ ] Expect and maintain standard format only
  - [ ] Update TypeScript types to match

### 5.2 Bridge Updates
- [ ] Update `/svelte-ui/src/lib/bridge/threejs-bridge.ts`
  - [ ] Remove format conversion in handleDataUpdate
  - [ ] Use standard format for all operations
  - [ ] Remove format detection logic
  - [ ] Simplify data flow

### 5.3 Component Updates
- [ ] Update property panel components
  - [ ] Expect nested object format
  - [ ] Remove any flat property handling
  - [ ] Use TypeScript interfaces for type safety
- [ ] Update hierarchy panel
  - [ ] Use standard format for display
  - [ ] Remove format transformations
- [ ] Update toolbar
  - [ ] Send commands in standard format

---

## Phase 6: Testing & Validation
### 6.1 Create Test Suite
- [ ] Create `/test/format-validation-tests.html`
  - [ ] Test object creation with standard format
  - [ ] Test selection sync
  - [ ] Test property updates
  - [ ] Test tool operations
  - [ ] Test hierarchy updates

### 6.2 End-to-End Testing
- [ ] Test each tool individually
  - [ ] Move tool position updates
  - [ ] Rotate tool rotation updates
  - [ ] Scale tool dimension updates
  - [ ] Push tool interactions
  - [ ] Box creation tool
- [ ] Test UI → Scene flows
  - [ ] Property panel value changes
  - [ ] Hierarchy selection
  - [ ] Tool activation
  - [ ] Container operations
- [ ] Test Scene → UI flows
  - [ ] Object selection
  - [ ] Tool usage updates
  - [ ] Hierarchy changes
  - [ ] Container context updates

### 6.3 Performance Testing
- [ ] Measure PostMessage frequency
- [ ] Verify throttling works correctly
- [ ] Check for memory leaks
- [ ] Monitor console for warnings

---

## Phase 7: Migration & Cleanup
### 7.1 Data Migration
- [ ] Create migration script for saved projects
- [ ] Handle legacy format detection
- [ ] Convert old formats to new standard
- [ ] Backup original data

### 7.2 Code Cleanup
- [ ] Remove all console.log statements
- [ ] Remove deprecated functions
- [ ] Remove commented-out code
- [ ] Update inline documentation

### 7.3 Documentation Updates
- [ ] Update CLAUDE.md with new format standard
- [ ] Create format specification document
- [ ] Update API documentation
- [ ] Add migration guide

---

## Phase 8: Deployment & Monitoring
### 8.1 Staged Rollout
- [ ] Deploy to development environment
- [ ] Test all critical paths
- [ ] Deploy to staging
- [ ] Run full regression suite
- [ ] Deploy to production

### 8.2 Post-Deployment
- [ ] Monitor error logs for format issues
- [ ] Check for any conversion warnings
- [ ] Validate performance metrics
- [ ] Gather user feedback

---

## Critical Success Factors
1. **NO partial implementations** - Each phase must be complete before moving on
2. **Test after EVERY file change** - Don't batch changes without testing
3. **Keep old code commented until new code verified** - Easy rollback if needed
4. **Version the format** - Add version field for future migrations
5. **Validate at boundaries** - Check format at every entry/exit point

## Risk Mitigation
- **Risk**: Breaking existing functionality
  - **Mitigation**: Implement behind feature flag initially

- **Risk**: Missing conversion points
  - **Mitigation**: Comprehensive grep search for all data access patterns

- **Risk**: Performance degradation
  - **Mitigation**: Benchmark before and after each phase

## Implementation Order (Recommended)
1. Phase 1: Complete analysis (2 hours)
2. Phase 2: Build infrastructure (3 hours)
3. Phase 3-5: Update systems in parallel branches (6 hours)
4. Phase 6: Test thoroughly (2 hours)
5. Phase 7: Clean up (1 hour)
6. Phase 8: Deploy (1 hour)

**Total Estimated Time**: 15 hours of focused work

---

## Appendix A: Standard ObjectData Format (Proposed)
```javascript
{
  // Core identification
  id: "unique-id-123",
  name: "Object Name",
  type: "box|cylinder|sphere|container",

  // Hierarchy
  parentContainer: "parent-id" | null,
  childIds: ["child-1", "child-2"],

  // Transform (always nested objects)
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  scale: { x: 1, y: 1, z: 1 },

  // Physical properties
  dimensions: { width: 1, height: 1, depth: 1 },
  material: "wood|metal|plastic",
  color: "#hexcode",

  // Container properties
  isContainer: true|false,
  layoutMode: "manual|grid|stack" | null,
  layoutConfig: { ... } | null,

  // State flags
  selected: true|false,
  locked: true|false,
  visible: true|false,

  // Metadata
  formatVersion: "1.0.0",
  lastModified: timestamp
}
```

## Appendix B: Conversion Point Checklist
Use this checklist to ensure every conversion point is updated:

- [ ] ObjectStateManager.getObject()
- [ ] ObjectStateManager.setObject()
- [ ] ObjectSerializer.serializeObject()
- [ ] ObjectSerializer.serializeSelection()
- [ ] PropertyPanelSync.sendPropertyUpdate()
- [ ] PropertyPanelSync.handlePropertyChange()
- [ ] MainIntegration.sendDataToIframe()
- [ ] MainIntegration.handleMessageFromIframe()
- [ ] Move-tool.updateObjectPosition()
- [ ] Rotate-tool.updateObjectRotation()
- [ ] Scale-tool.updateObjectScale()
- [ ] BoxCreationTool.createObject()
- [ ] ThreeJSBridge.handleDataUpdate()
- [ ] modler.ts selectedObjects store
- [ ] modler.ts objectHierarchy store
- [ ] Property panel components getData()
- [ ] Property panel components updateValue()