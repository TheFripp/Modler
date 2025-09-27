---
title: Container System
version: 2.1.0
last_updated: September 26, 2025
maintained_by: Architecture Team
---

# Container System

Dual geometry containers (visual wireframes + collision meshes) with Three.js hierarchy management.

## Manager Separation

**ContainerCrudManager**: Pure CRUD operations (Create, Read, Update, Delete)
- Container lifecycle management
- Object addition/removal
- Geometry resizing operations
- Centralized helper methods for external systems
- Factory access consolidation for consistent container creation
- Focused on data operations with clear boundaries

**ContainerInteractionManager**: Pure interaction state management
- Step-into/step-out context
- Visual feedback and highlighting
- Collision state management
- 313 lines focused on user interaction

## Core Architecture

### Dual Geometry Components
- **Visual wireframe** - Green edges with `renderOrder: 999` for visibility
- **Collision mesh** - Invisible box geometry for click detection and face highlighting

### Selection Patterns
- **Single-click child** → selects parent container
- **Double-click child** → steps into container, selects child object
- **Double-click container** → steps into container, enables face highlights
- **Container context** → faded wireframe shows active container

## Key Operations

### Container Creation (ContainerCrudManager)
- **From selection**: `containerCrudManager.createContainerFromSelection(selectedObjects)`
- **Empty container**: `containerCrudManager.createEmptyContainer(position)`
- **Command**: Cmd+F triggers creation via ToolController

### Container Resizing (ContainerCrudManager)
- **Fit to children**: `resizeContainerToFitChildren(containerData, preservePosition)`
- **Layout bounds**: `resizeContainerToLayoutBounds(containerData, layoutBounds)`

### Centralized Helper Methods (September 2025)
**Purpose**: Eliminate direct LayoutGeometry access from external systems

- **Positioned Creation**: `createContainerGeometryAtPosition(size, transform)`
  - Used by: delete-object-command.js, position-transform.js
  - Handles: Factory access, positioning, transform application
  - Supports: Both simple position vectors and full transform objects

- **Push Tool Updates**: `updateContainerForPushTool(containerMesh, newSize)`
  - Used by: push-tool.js for container resizing during push operations
  - Handles: Factory access, layout direction handling, error checking
  - Optimized: No layout direction visualization during push (performance)

- **Factory Access**: `getFactories()`
  - Centralizes: geometryFactory and materialManager access
  - Eliminates: Scattered `window.modlerComponents?.geometryFactory` patterns
  - Ensures: Consistent factory access across all container operations

### Object Management (ContainerCrudManager)
- **Add to container**: `addObjectToContainer(objectData, containerData)`
- **Remove from container**: `removeObjectFromContainer(objectData)`

## Layout Integration

### Sizing Modes
- **'hug'**: Container fits content (default)
- **'fixed'**: Container maintains size, Push Tool switches to fixed mode

### Layout Properties
```javascript
autoLayout: {
    enabled: boolean,
    direction: 'x' | 'y' | 'z' | 'xy' | 'xz' | 'yz' | 'xyz',
    gap: number,
    padding: { top, bottom, left, right, front, back }
}
```

## Container Context Management

### Step-Into Functionality (ContainerInteractionManager)
- **Enter context**: `containerInteractionManager.stepIntoContainer(containerObject)`
- **Exit context**: `containerInteractionManager.stepOutOfContainer()`
- **Check context**: `containerInteractionManager.isInContainerContext()`
- **Visual feedback**: 25% opacity wireframe during context
- **Collision management**: Disables other containers during step-into

## Container Expansion (Wrapping Objects)

### Algorithm: `resizeContainerToFitChildren`
When dragging objects into containers, the container must expand to wrap around child objects without moving them:

1. **Calculate Local Bounds**: Compute bounds of all child objects in container's local coordinate space
2. **Reposition Container**: Move container so its center aligns with the center of child bounds
3. **Compensate Children**: Adjust child positions to maintain their world positions when container moves

**Implementation**: `ContainerCrudManager.resizeContainerToFitChildren()` in `application/tools/container-crud-manager.js:507`

### Key Files
- **ContainerCrudManager**: `application/tools/container-crud-manager.js` - Container CRUD operations and expansion logic
- **ContainerInteractionManager**: `interaction/container-interaction-manager.js` - Step-into/out interaction state
- **LayoutGeometry**: `application/tools/layout-geometry.js` - Geometry creation and calculations