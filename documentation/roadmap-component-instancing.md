# Component Instancing - Future Feature

## Overview
Allow users to create reusable component masters and instances, where changes to the master automatically propagate to all instances (one-way sync).

## Use Case
- Create a chair design as a master component
- Duplicate it multiple times as instances
- When you modify the master chair, all instance chairs update automatically
- Instances maintain their own position, rotation, and container relationships

## Current State
**Implemented**: Basic object duplication (Option-drag with move tool)
- Creates completely independent copies
- Each object has its own geometry, material, and properties
- No relationship between original and duplicate

**Not Implemented**: Component instancing system

## Planned Implementation

### 1. Data Model
Add to object schema (`object-data-format.js`):
```javascript
{
  // Component master properties
  isMasterComponent: boolean,
  componentInstances: string[],  // Array of instance IDs

  // Component instance properties
  isComponentInstance: boolean,
  masterComponentId: string|null,
  instanceOverrides: {           // Properties that instances can override
    position: boolean,
    rotation: boolean,
    parentContainer: boolean
  }
}
```

### 2. Property Sync System
Use existing `PropertySchemaRegistry` (already supports master-instance relationships):
- One-way sync: Master → Instances
- Sync properties: dimensions, material, geometry type
- Preserve instance properties: position, rotation, parent container

### 3. User Interface
**Creating Components**:
- Right-click object → "Convert to Component"
- Object becomes master, gets special visual indicator

**Creating Instances**:
- Option-drag a master component → creates instance (not independent copy)
- Right-click master → "Create Instance"

**Editing**:
- Edit master: all instances update automatically
- Edit instance: only that instance changes (creates override)
- Visual feedback: instances show they're linked to master

### 4. Event System
Leverage existing `ObjectEventBus` events:
- `MASTER_CHANGE` - fired when master component changes
- `INSTANCE_UPDATE` - fired when instance syncs from master
- Already defined in `PropertySchemaRegistry`

### 5. Implementation Files
- **Schema updates**: `/application/serialization/object-data-format.js`
- **Sync logic**: `/application/schemas/property-schema-registry.js` (already has foundation)
- **UI indicators**: `/interaction/object-visualizer.js`
- **Event handling**: `/application/events/object-event-bus.js`

## Benefits
- Rapid iteration on repeated designs
- Consistent updates across multiple objects
- Parametric design workflows
- Furniture layout optimization

## Technical Notes
- PropertySchemaRegistry already has `createInstanceRelationship()` and `propagateMasterChange()` methods
- Need to hook these into the duplication workflow
- Consider undo/redo for instance creation and master edits
- Performance: batch updates when master changes affect many instances

## Related Features
- Parametric properties (already partially implemented in PropertySchemaRegistry)
- Component libraries (future: save/load component masters)
- Override visualization (show which instance properties are overridden)

---
**Status**: Planned for future release
**Dependencies**: None (foundation already exists)
**Estimated Effort**: Medium (2-3 days)
