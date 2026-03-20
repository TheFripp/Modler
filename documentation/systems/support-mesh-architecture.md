# Support Mesh Architecture - "Create Once, Show/Hide Only"

## Overview

The support mesh architecture implements a "create once, show/hide only" pattern where all visualization elements (wireframes, face highlights, interaction meshes) are created as children at object creation time, then only shown/hidden during operations. All visual state changes flow through a centralized pipeline: **VisualizationManager → Visualizer → SupportMeshFactory**.

## Core Principle

**Master Object Authority**: Only the main object needs manipulation; support meshes automatically follow as children, ensuring inseparable architecture and coordinate space consistency.

## Support Mesh Types

### Regular Objects
```javascript
{
  selectionWireframe: THREE.LineSegments,  // Orange wireframe, visible when selected (renderOrder: 9999)
  hoverWireframe: THREE.LineSegments,      // Light orange wireframe, visible on hover (renderOrder: 9998)
  faceHighlight: THREE.Mesh,              // Semi-transparent plane for tool interactions
  cadWireframe: THREE.LineSegments         // Thin grey edges, always visible for CAD clarity (renderOrder: 998)
}
```

### Containers
```javascript
{
  cadWireframe: THREE.LineSegments,   // Green wireframe, shown on selection/context (renderOrder: 9999)
  faceHighlight: THREE.Mesh,         // Face highlight for tools
  interactiveMesh: THREE.Mesh        // Invisible solid BoxGeometry for raycasting (Layer 0+1)
}
```

## Visual State Pipeline

All visual state changes flow through one centralized pipeline:

```
SelectionController / SelectTool / CommandRouter (object-hover)
  ↓
VisualizationManager.setState(object, state)
  ↓ (state priority guard: selected > context > hovered > normal)
getVisualizerFor(object) → ObjectVisualizer or ContainerVisualizer
  ↓
applyStateVisuals(object, newState, oldState)
  ↓
SupportMeshFactory visibility API (showX / hideX)
  ↓
mesh.visible = true/false
```

### Visual States

| State | Objects | Containers |
|-------|---------|------------|
| `normal` | No wireframe | No wireframe |
| `hovered` | Light orange hoverWireframe | cadWireframe at 50% opacity |
| `selected` | Orange selectionWireframe | Green cadWireframe (full opacity) + padding viz + child containers |
| `multi-selected` | Same as selected | Same as selected |
| `context` | N/A | cadWireframe at 30% opacity |
| `selected-in-context` | N/A | cadWireframe at full opacity |

## Implementation Flow

1. **Object Creation**: `SceneController.addObject()` → `SupportMeshFactory.createObjectSupportMeshes(mesh)`
2. **Hover**: `VisualizationManager.setState(mesh, 'hovered')` → ObjectVisualizer/ContainerVisualizer → SupportMeshFactory
3. **Selection**: `VisualizationManager.setState(mesh, 'selected')` → shows selectionWireframe (objects) or cadWireframe (containers)
4. **Face Highlighting**: `VisualizationManager.showFaceHighlight()` → SupportMeshFactory positions + shows faceHighlight
5. **Geometry Update**: `SupportMeshFactory.updateSupportMeshGeometries()` — recreates wireframe geometries
6. **Cleanup**: `SceneController.removeObject()` → `SupportMeshFactory.cleanupSupportMeshes(mesh)`

## Integration with ObjectTree (Hierarchy Panel)

- **Tree → 3D hover**: ObjectTree sends `object-hover` postMessage → CommandRouter → VisualizationManager
- **Tree → 3D selection**: ObjectTree sends `object-select` postMessage → CommandRouter → SelectionController
- **3D → Tree selection**: SelectionController → ObjectEventBus → SimpleCommunication → `selection-changed` postMessage → Svelte stores

## Factory Integration

Support meshes are created through centralized factory systems for consistency and performance:
- **Geometry**: `GeometryFactory.createEdgeGeometry()` for wireframes
- **Materials**: `MaterialManager` for all material creation (selection edge, hover edge, container wireframe, face highlight, etc.)
- **Visibility**: `SupportMeshFactory` visibility API (`showSelectionWireframe`, `hideHoverWireframe`, `showContainerHoverWireframe`, etc.)
- **Cleanup**: Automatic return to resource pools when support meshes are disposed

## Key Files

| File | Responsibility |
|------|---------------|
| `interaction/visualization-manager.js` | Central orchestrator, state priority, delegates to visualizers |
| `interaction/object-visualizer.js` | Base visualization for regular objects |
| `interaction/container-visualizer.js` | Container-specific states, padding viz, child container display |
| `interaction/support-mesh-factory.js` | Mesh creation, geometry updates, visibility API |
| `application/utilities/material-manager.js` | Centralized material creation and pooling |
| `application/tools/select-tool.js` | Emits hover states on mouse movement |
| `application/command-router.js` | Routes `object-hover` from UI tree to VisualizationManager |

## Architecture Rules

- **NEVER create support meshes dynamically** — they exist as children from object creation
- **NEVER set `.visible` directly** — use SupportMeshFactory visibility API
- **NEVER modify support mesh geometry directly** — update parent geometry via SupportMeshFactory
- **ALWAYS route visual state changes through VisualizationManager** — it enforces state priority
- Support meshes inherit all transforms automatically as Three.js children

## Coordinate Space Consistency

Support meshes inherit parent transforms automatically:

```javascript
// CORRECT: Support meshes move with parent automatically
parentObject.position.x += 1.0;  // Support meshes follow automatically

// WRONG: Manual support mesh positioning
supportMesh.position.copy(parentObject.position);  // Unnecessary and error-prone
```

## Architecture Compliance Checklist

- All object creation goes through SceneController.addObject()
- Support meshes created only once at object creation
- Visualization systems show/hide pre-created meshes via SupportMeshFactory API
- Geometry updates handled by SupportMeshFactory.updateSupportMeshGeometries()
- Object deletion cleans up support meshes
- Hover state flows through VisualizationManager (never direct `.visible` assignment)
- State priority enforced: selected/multi-selected cannot be downgraded to hovered
