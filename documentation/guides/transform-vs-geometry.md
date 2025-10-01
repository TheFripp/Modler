# Transform vs Geometry: Developer Guide

**Version**: 1.0.0
**Status**: Current
**Last Updated**: 2025-01-30

## The Golden Rule

> **CAD Geometry**: ALWAYS use geometry-based manipulation, NEVER visual transforms
>
> — CLAUDE.md line 25

This guide explains when to use transforms vs geometry operations, and how to avoid common mistakes.

---

## Quick Decision Tree

```
Is the operation changing the SIZE or SHAPE of an object?
│
├─ YES → Use CAD Geometry (GeometryUtils)
│         Examples: Resize box, push face, extrude
│
└─ NO  → Use Transforms (TransformationManager)
          Examples: Move object, rotate object, scale visual
```

---

## CAD Geometry Operations

### What They Do

Modify the **actual vertices** of the geometry, changing the object's true dimensions.

### When to Use

- ✅ Resizing objects (dimension changes)
- ✅ Pushing/pulling faces
- ✅ Extrusion operations
- ✅ Parametric dimension updates
- ✅ Any operation that changes "what the object IS"

### Implementation

**Always use GeometryUtils**:

```javascript
// ✅ CORRECT: CAD geometry operation
const GeometryUtils = window.GeometryUtils;
GeometryUtils.scaleGeometryAlongAxis(geometry, 'x', 2.0);
```

### How It Works

```javascript
// geometry-utils.js - Direct vertex manipulation
static scaleGeometryAlongAxis(geometry, axis, newDimension) {
    const positions = geometry.getAttribute('position');
    const vertices = positions.array;
    const axisIndex = { x: 0, y: 1, z: 2 }[axis];

    // Modify vertices directly
    for (let i = 0; i < vertices.length; i += 3) {
        const vertexIndex = i + axisIndex;
        const distanceFromCenter = vertices[vertexIndex] - center;
        vertices[vertexIndex] = center + (distanceFromCenter * scaleFactor);
    }

    positions.needsUpdate = true;
    geometry.computeBoundingBox();
}
```

### Complete Example: Push Tool

```javascript
// 1. Tool calculates delta
const delta = calculatePushDistance(mouseDelta);

// 2. Use GeometryUtils for CAD operation
const success = GeometryUtils.pushGeometryFace(
    mesh.geometry,
    axis,        // 'x', 'y', or 'z'
    direction,   // 1 or -1
    delta        // distance in world units
);

// 3. Update support meshes
GeometryUtils.updateSupportMeshGeometries(mesh);

// 4. Update state
const dimensions = GeometryUtils.getGeometryDimensions(mesh.geometry);
objectStateManager.updateObject(objectId, { dimensions });
```

**File**: `application/tools/push-tool.js:415`

---

## Transform Operations

### What They Do

Modify the **visual position, rotation, or scale** of the object without changing its geometry.

### When to Use

- ✅ Moving objects
- ✅ Rotating objects
- ✅ Parent-child coordinate conversions
- ✅ Layout positioning
- ✅ Any operation that changes "where the object IS"

### Implementation

**Always use TransformationManager**:

```javascript
// ✅ CORRECT: Transform operation
const transformationManager = new TransformationManager();
transformationManager.setPosition(object, position, {
    isWorldSpace: true,
    batchUpdate: false
});
```

### How It Works

```javascript
// transformation-manager.js - Visual transform only
setPosition(object, position, options = {}) {
    const { isWorldSpace = false } = options;

    if (isWorldSpace && object.parent) {
        // Convert world position to local
        const worldMatrix = object.parent.matrixWorld.clone().invert();
        const localPosition = position.clone().applyMatrix4(worldMatrix);
        object.position.copy(localPosition);
    } else {
        // Direct local position
        object.position.copy(position);
    }

    // Update matrix (NO geometry modification)
    object.updateMatrix();

    // Notify systems
    this.completeTransformation(object, 'position');
}
```

### Complete Example: Move Tool

```javascript
// 1. Tool calculates new position
const newPosition = calculateMovePosition(mouseDelta);

// 2. Use TransformationManager
const transformationManager = window.modlerComponents?.transformationManager;
transformationManager.setPosition(selectedObject, newPosition, {
    isWorldSpace: true,
    batchUpdate: false
});

// 3. State automatically updated via completeTransformation()
// which calls ObjectStateManager.updateObject()
```

**File**: `application/utilities/transformation-manager.js:71`

---

## Common Mistakes

### ❌ Using Transforms for CAD Operations

```javascript
// ❌ WRONG: Using scale transform for dimension change
mesh.scale.x = newDimension / oldDimension;

// WHY IT'S WRONG:
// - Doesn't change actual geometry vertices
// - Breaks dimension calculations
// - Support meshes desync
// - Property panel shows wrong dimensions
```

**Fix**:
```javascript
// ✅ CORRECT: Use CAD geometry operation
GeometryUtils.scaleGeometryAlongAxis(
    mesh.geometry,
    'x',
    newDimension
);
GeometryUtils.updateSupportMeshGeometries(mesh);
```

### ❌ Direct Mesh Manipulation

```javascript
// ❌ WRONG: Bypassing ObjectStateManager
mesh.position.x = 10;

// WHY IT'S WRONG:
// - Bypasses state management
// - No UI updates
// - No event emission
// - State desync
```

**Fix**:
```javascript
// ✅ CORRECT: Use ObjectStateManager
objectStateManager.updateObject(objectId, {
    position: { x: 10, y: mesh.position.y, z: mesh.position.z }
});
```

### ❌ Mixed Operations

```javascript
// ❌ WRONG: Mixing geometry and transforms
GeometryUtils.scaleGeometryAlongAxis(geometry, 'x', 2.0);
mesh.scale.y = 1.5; // Visual scale mixed with CAD scale

// WHY IT'S WRONG:
// - Inconsistent dimension reporting
// - Support mesh calculation errors
// - Unpredictable behavior
```

**Fix**:
```javascript
// ✅ CORRECT: Consistent CAD operations
GeometryUtils.scaleGeometryAlongAxis(geometry, 'x', 2.0);
GeometryUtils.scaleGeometryAlongAxis(geometry, 'y', 1.5);
```

---

## Support Mesh Synchronization

After CAD geometry operations, **ALWAYS** update support meshes:

```javascript
// ✅ REQUIRED after geometry changes
GeometryUtils.updateSupportMeshGeometries(mesh);
```

### Why?

Support meshes (wireframes, highlights) are separate Three.js objects. When geometry vertices change, wireframes must be regenerated to match.

### Automatic Sync Points

SceneController automatically syncs after dimension updates:

```javascript
// scene-controller.js:767
updateObjectDimensions(objectId, axis, newDimension) {
    GeometryUtils.scaleGeometryAlongAxis(geometry, axis, newDimension);
    GeometryUtils.updateSupportMeshGeometries(mesh); // Automatic sync
}
```

### Manual Sync During Operations

Push tool syncs in real-time during drag:

```javascript
// push-tool.js:436
refreshVisualFeedback() {
    geometryUtils.updateSupportMeshGeometries(meshToUpdate);
}
```

---

## Integration Patterns

### Pattern 1: Dimension Change (CAD)

```javascript
// 1. Calculate new dimension
const newDimension = calculateNewSize();

// 2. Use ObjectStateManager (recommended)
objectStateManager.updateObject(objectId, {
    dimensions: { x: newDimension, y: oldY, z: oldZ }
});

// ObjectStateManager automatically:
// - Calls SceneController.updateObjectDimensions()
// - Which calls GeometryUtils.scaleGeometryAlongAxis()
// - Which updates support meshes
// - Which emits events for UI
```

### Pattern 2: Direct CAD Operation

```javascript
// 1. Perform CAD operation
const success = GeometryUtils.pushGeometryFace(
    mesh.geometry,
    axis,
    direction,
    delta
);

// 2. Update support meshes
GeometryUtils.updateSupportMeshGeometries(mesh);

// 3. Calculate new dimensions
const dimensions = GeometryUtils.getGeometryDimensions(mesh.geometry);

// 4. Update state
objectStateManager.updateObject(objectId, { dimensions });
```

### Pattern 3: Position Change (Transform)

```javascript
// 1. Use TransformationManager
transformationManager.setPosition(object, newPosition, {
    isWorldSpace: true
});

// TransformationManager automatically:
// - Updates mesh.position
// - Calls completeTransformation()
// - Which calls ObjectStateManager.updateObject()
// - Which emits events for UI
```

---

## Coordinate Spaces

### World Space vs Local Space

Transforms support coordinate space conversion:

```javascript
// World space position (absolute in scene)
transformationManager.setPosition(object, worldPosition, {
    isWorldSpace: true  // Converts to local space automatically
});

// Local space position (relative to parent)
transformationManager.setPosition(object, localPosition, {
    isWorldSpace: false
});
```

### Why This Matters

```javascript
// Example: Moving object between parents
const worldPos = object.getWorldPosition(new THREE.Vector3());

// Change parent
newParent.add(object);

// Preserve world position
transformationManager.setPosition(object, worldPos, {
    isWorldSpace: true  // Automatically converts to new parent's local space
});
```

---

## API Reference

### GeometryUtils Methods

```javascript
class GeometryUtils {
    // CAD geometry operations
    static scaleGeometryAlongAxis(geometry, axis, newDimension): boolean
    static pushGeometryFace(geometry, axis, direction, delta): boolean

    // Geometry queries
    static getGeometryDimensions(geometry): {x, y, z}
    static getGeometryCenter(geometry): Vector3
    static validateGeometryForManipulation(geometry): boolean

    // Support mesh sync
    static updateSupportMeshGeometries(mesh): boolean
}
```

**File**: `application/utilities/geometry-utils.js`

### TransformationManager Methods

```javascript
class TransformationManager {
    // Transform operations
    setPosition(object, position, options): boolean
    setRotation(object, rotation, options): boolean
    setScale(object, scale, options): boolean

    // Combined transforms
    applyTransform(object, {position, rotation, scale}, options): boolean

    // Hierarchy transforms
    moveToParent(object, newParent, options): boolean
    copyTransform(sourceObject, targetObject, options): boolean

    // Completion notification (automatic)
    completeTransformation(object, transformType): void
}
```

**File**: `application/utilities/transformation-manager.js`

---

## Debugging Guide

### Problem: Dimensions Not Updating

**Symptom**: Object size changes but property panel shows old dimensions

**Cause**: Using transform instead of CAD geometry

**Fix**:
```javascript
// ❌ WRONG
mesh.scale.x = 2;

// ✅ CORRECT
GeometryUtils.scaleGeometryAlongAxis(mesh.geometry, 'x', newDimension);
objectStateManager.updateObject(objectId, {
    dimensions: GeometryUtils.getGeometryDimensions(mesh.geometry)
});
```

### Problem: Wireframes Desynchronized

**Symptom**: Selection wireframe doesn't match object

**Cause**: Forgot to update support meshes after geometry change

**Fix**:
```javascript
// After ANY geometry modification
GeometryUtils.updateSupportMeshGeometries(mesh);
```

### Problem: UI Not Updating

**Symptom**: 3D changes but property panel doesn't update

**Cause**: Bypassed ObjectStateManager

**Fix**:
```javascript
// ❌ WRONG
mesh.position.x = 10;

// ✅ CORRECT
objectStateManager.updateObject(objectId, {
    position: { x: 10, y: pos.y, z: pos.z }
});
```

---

## Testing Checklist

When implementing new CAD or transform features:

### CAD Operations
- [ ] Uses GeometryUtils for vertex manipulation
- [ ] Updates support meshes after geometry changes
- [ ] Calculates new dimensions using GeometryUtils.getGeometryDimensions()
- [ ] Updates ObjectStateManager with new dimensions
- [ ] Property panel shows correct dimensions
- [ ] Undo/redo works correctly

### Transform Operations
- [ ] Uses TransformationManager for position/rotation/scale
- [ ] No direct mesh.position/rotation/scale manipulation
- [ ] Updates ObjectStateManager with new transform
- [ ] Property panel shows correct position/rotation
- [ ] Support meshes move with object (no desync)
- [ ] Undo/redo works correctly

### Integration
- [ ] All updates go through ObjectStateManager
- [ ] Events emitted via ObjectEventBus
- [ ] UI updates via PropertyPanelSync
- [ ] No race conditions or flickering
- [ ] Performance acceptable for real-time operations

---

## Related Documentation

- [Data Flow Architecture](../architecture/data-flow-architecture.md)
- [Support Mesh Architecture](../systems/support-mesh-architecture.md)
- [ObjectStateManager API](../api/object-state-manager.md)
- [GeometryUtils API](../api/geometry-utils.md)
- [TransformationManager API](../api/transformation-manager.md)

---

## Revision History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2025-01-30 | Initial guide after foundation audit |
