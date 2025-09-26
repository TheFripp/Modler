# Support Mesh Architecture - "Create Once, Show/Hide Only"

## Overview

The support mesh architecture implements a "create once, show/hide only" pattern where all visualization elements (selection wireframes, face highlights, interaction meshes) are created as children at object creation time, then only shown/hidden during operations.

## Core Principle

**Master Object Authority**: Only the main object needs manipulation; support meshes automatically follow as children, ensuring inseparable architecture and coordinate space consistency.

## Support Mesh Types

### Regular Objects
```javascript
{
  selectionWireframe: THREE.LineSegments,  // Orange wireframe for selection
  faceHighlight: THREE.Mesh               // Green highlight for tool interactions
}
```

### Containers
```javascript
{
  selectionWireframe: THREE.LineSegments,    // Green wireframe for container selection
  faceHighlight: THREE.Mesh,                // Face highlight for tools
  interactiveMesh: THREE.Mesh,              // Invisible raycast target
  contextHighlight: THREE.LineSegments      // Faded wireframe for step-in context
}
```

## Implementation Flow

1. **Object Creation**: `SceneController.addObject()` → `SupportMeshFactory.createObjectSupportMeshes(mesh)`
2. **Selection**: `VisualizationManager.createEdgeHighlight()` → Shows `mesh.userData.supportMeshes.selectionWireframe`
3. **Face Highlighting**: `VisualEffects.showFaceHighlight()` → Shows `mesh.userData.supportMeshes.faceHighlight`
4. **Cleanup**: `SceneController.removeObject()` → `SupportMeshFactory.cleanupSupportMeshes(mesh)`

## Factory Integration

Support meshes are created through centralized factory systems for consistency and performance:
- **Geometry**: `GeometryFactory.createEdgeGeometry()` for wireframes and highlights
- **Materials**: `MaterialManager.createPreviewWireframeMaterial()` for selection wireframes
- **Cleanup**: Automatic return to resource pools when support meshes are disposed

## Architecture Rules

- **NEVER create support meshes dynamically** - they exist as children from object creation
- **NEVER modify support mesh geometry directly** - update parent geometry via SupportMeshFactory
- **ALWAYS use `visible` property** for show/hide operations
- Support meshes inherit all transforms automatically as Three.js children

## Coordinate Space Consistency

Support meshes inherit parent transforms automatically:

```javascript
// ✅ CORRECT: Support meshes move with parent automatically
parentObject.position.x += 1.0;  // Support meshes follow automatically

// ❌ WRONG: Manual support mesh positioning
supportMesh.position.copy(parentObject.position);  // Unnecessary and error-prone
```

## Benefits

- **Performance**: Show/hide operations instead of expensive create/destroy geometry cycles
- **Memory Management**: No geometry leaks from repeated creation/destruction
- **Inseparable Architecture**: Face highlights and wireframes are direct children, always move together
- **Coordinate Consistency**: Support meshes automatically inherit parent transforms

## Reference Implementation

- Object creation: `SceneController.addObject()` lines 146-158
- Selection visualization: `VisualizationManager.createEdgeHighlight()` lines 183-194
- Face highlighting: `VisualEffects.showFaceHighlight()` lines 802-813
- Support mesh factory: `SupportMeshFactory` (complete implementation)

## Architecture Compliance Checklist

- ✅ All object creation goes through SceneController.addObject()
- ✅ Support meshes created only once at object creation
- ✅ Visualization systems show/hide pre-created meshes
- ✅ Geometry updates handled by SupportMeshFactory
- ✅ Object deletion cleans up support meshes