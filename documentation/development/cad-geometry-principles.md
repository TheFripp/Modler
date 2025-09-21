# CAD Geometry Principles

## Overview
Modler V2 implements true CAD geometry manipulation rather than visual transforms. This ensures accurate modeling behavior, proper bounding box calculations, and reliable container updates.

## Geometry-Based vs Transform-Based Approach

### ❌ Transform-Based (Deprecated)
```javascript
// WRONG: Visual scaling only
object.scale[axis] = newValue;
// Problems:
// - Underlying geometry unchanged
// - Inaccurate bounding box calculations
// - Container resizing issues
// - Not true CAD behavior
```

### ✅ Geometry-Based (Current)
```javascript
// CORRECT: Actual geometry modification
PropertyManager.updateObjectGeometryDimension(object, axis, targetDimension);
// Benefits:
// - Real geometry vertex manipulation
// - Accurate bounding box updates
// - Proper container resize triggers
// - True CAD modeling behavior
```

## Implementation Details

### Dimension Changes Process
1. **Calculate Current Bounds**: `geometry.computeBoundingBox()`
2. **Determine Scale Factor**: `targetDimension / currentDimension`
3. **Get Geometry Center**: `bbox.getCenter(center)` for centered scaling
4. **Modify Vertices**: Direct manipulation of `positions.array`
5. **Update Geometry**: Set `positions.needsUpdate = true`
6. **Recompute Bounds**: `computeBoundingBox()` and `computeBoundingSphere()`
7. **Sync Related Meshes**: Wireframes, collision meshes, etc.
8. **Trigger Container Updates**: Automatic parent container resizing

### Vertex Manipulation Pattern
```javascript
const positions = geometry.getAttribute('position');
const vertices = positions.array;

// Scale vertices along specified axis from center
for (let i = 0; i < vertices.length; i += 3) {
    const vertexCoord = vertices[i + axisIndex];
    const distanceFromCenter = vertexCoord - center.getComponent(axisIndex);
    vertices[i + axisIndex] = center.getComponent(axisIndex) + (distanceFromCenter * scaleFactor);
}

positions.needsUpdate = true;
```

## Consistency with Tool Operations

### Face-Based Tools (Push/Move)
- Modify geometry vertices directly
- Compute new bounding boxes
- Trigger container updates
- **Same underlying geometry manipulation**

### Property Panel Updates
- Use identical geometry modification approach
- Same vertex manipulation patterns
- Same container update triggers
- **Unified geometry system**

## Container Integration

### Automatic Container Updates
When geometry changes through property panel:
1. `PropertyManager.updateObjectGeometryDimension()` modifies vertices
2. `PropertyManager.notifyTransformChange()` called
3. `SceneController.notifyObjectTransformChanged()` triggered
4. Parent container automatically resized via `ContainerManager`

### Mesh Synchronization
```javascript
// Sync all related meshes (wireframes, collision, etc.)
const meshSynchronizer = window.modlerComponents?.meshSynchronizer;
if (meshSynchronizer) {
    meshSynchronizer.syncAllRelatedMeshes(object, 'geometry');
}
```

## Benefits

### CAD Accuracy
- True parametric modeling behavior
- Accurate dimension measurements
- Proper geometry-based calculations

### System Consistency
- Same geometry manipulation across all input methods
- Unified container update system
- Consistent bounding box calculations

### Performance
- Direct vertex manipulation (efficient)
- Proper bounds updates (accurate)
- Minimal computational overhead

## Best Practices

### When Implementing New Tools
1. **Always modify geometry directly** rather than using transforms
2. **Use vertex manipulation patterns** from existing tools
3. **Trigger `notifyObjectTransformChanged()`** for container updates
4. **Sync related meshes** for visual consistency

### Error Handling
- Validate geometry exists before manipulation
- Check for valid dimensions (> 0)
- Handle division by zero cases
- Provide meaningful error messages

### Performance Considerations
- Batch geometry updates when possible
- Use `positions.needsUpdate = true` efficiently
- Recompute bounds only when necessary
- Leverage existing mesh synchronization system

## File References
- `index.html` - `PropertyManager.updateObjectGeometryDimension()`
- `application/tools/push-tool.js` - Face-based geometry manipulation
- `scene/scene-controller.js` - `notifyObjectTransformChanged()`
- `interaction/mesh-synchronizer.js` - Related mesh coordination

## Migration Notes
This approach replaces the previous scale-based dimension changes (V2.0) with true geometry manipulation (V2.1), ensuring CAD-accurate behavior and proper container integration.