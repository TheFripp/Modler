# Container System

## Overview
Simplified container system using dual geometry (visual wireframes + collision meshes) with Three.js hierarchy management for CAD-style parametric design workflows.

**See**: [`/core/ux-design.md`](../core/ux-design.md) for container interaction patterns and design hierarchy mental models.

## Core Concepts

### Dual Geometry Architecture
Each container consists of two synchronized components:
- **Visual wireframe** - Green edges rendered with `renderOrder: 999` for visibility
- **Collision mesh** - Invisible box geometry for reliable click detection and face highlighting

### Container-First Selection & Step-Into
Container interaction supports both group-level and individual object manipulation:
- **Single-click child object** → selects parent container
- **Double-click child object** → steps into parent container, selects child object
- **Double-click container** → steps into container, selects container (enables face highlights)
- **Container context state** → faded wireframe shows active container context

### Three.js Hierarchy Integration
Containers maintain both metadata relationships AND proper Three.js parent-child hierarchy to ensure object movement follows container transformations.

## Container Operations

### Creation Patterns
**From Selection**: Wrap selected objects in new container, preserving world positions
**Empty Container**: Create container at specified position for manual population

**⚠️ Architecture Note**: Container creation handled by `ContainerManager` but requires `UnifiedContainerManager` for visibility management and registration.

### Position Preservation
When objects become children of containers:
- World positions are preserved through coordinate space conversion
- Nested containers maintain their local positions and child relationships
- Child container wireframes remain visible even when inside parent containers

### Resizing Behavior
Containers automatically resize to fit their children:
- **Initial creation**: Container bounds calculated from child objects
- **Runtime updates**: Bounds recalculated when children are added/removed
- **Layout mode updates**: New `resizeContainerToLayoutBounds()` method handles layout-calculated bounds
- **Nested containers**: Collision meshes used for bounds calculation

### Manager Coordination
**Dual System Architecture**:
- **ContainerManager**: Creation, resizing, layout bounds (❌ Not globally exposed)
- **UnifiedContainerManager**: Visibility, interactive meshes, state tracking (✅ Globally exposed)
- **Coordination**: Via method calls and global scope references

## Selection Integration

### Container-First Logic
**Purpose**: Matches real-world object manipulation where users pick up containers rather than individual items inside them.

**Implementation**: BaseSelectionBehavior checks for `parentContainer` metadata and selects the container mesh instead of the child object.

### Visual Feedback & Container Context
- **Selected containers** show green wireframe (regular selection)
- **Container context** shows faded wireframe (25% opacity) when stepped-into
- **Child containers** keep wireframes visible when nested
- **Interactive mesh resolution** handles both legacy and new architectures
- **Face highlighting** works immediately after step-into operations
- **Selection wireframes** automatically sync with container position changes

**⚠️ Known Issue - Layout Mode Visibility**: Container wireframes may become invisible during layout mode activation due to debouncing interference. **Solution**: Explicit `showContainer()` calls after geometry updates bypass debounce timing issues.

## Auto-Layout Integration

### Rule-Based Positioning
Containers can enable automatic layout of their children:
- **Direction modes**: X, Y, Z linear arrangements or XY/XYZ grids
- **Gap management**: Configurable spacing between objects
- **Sizing behaviors**: Fill, fixed, or hug sizing per object

### Real-Time Updates
Layout recalculates automatically when:
- Objects are added to or removed from containers
- Container layout configuration changes
- Child object sizes change

## Architecture Benefits

### Parametric Design Support
- Container relationships define design hierarchy
- Layout rules create parametric object relationships
- Changes propagate through container hierarchies automatically

### CAD Workflow Integration
- Container-first selection matches professional CAD expectations
- Face-based manipulation works on both objects and containers
- Visual feedback provides immediate design intent clarity

### System Simplicity
- Single mesh synchronizer handles all related mesh coordination
- Direct Three.js hierarchy eliminates complex state management
- Render order approach prevents depth testing issues

## Common Patterns

### Container Detection
Tools detect containers through collision mesh `userData.isContainerCollision` property and reference the parent visual wireframe for operations.

### Nested Container Support
Child containers preserve their internal hierarchy while participating in parent container relationships.

### Movement Coordination
MeshSynchronizer automatically updates container collision meshes when visual wireframes move, maintaining click detection accuracy.

## File References

### Active Components
- `application/tools/container-manager.js` - Container lifecycle and operations (584 lines)
- `interaction/container-manager.js` - UnifiedContainerManager for visibility and state (914 lines)
- `interaction/selection-visualizer.js` - Container wireframe display coordination (428 lines)
- `application/tools/layout-geometry.js` - Geometry creation and bounds calculation (370 lines)
- `interaction/container-context-manager.js` - Container step-in/step-out logic (80 lines)
- `application/utilities/position-transform.js` - Centralized coordinate transformations *(NEW)*

### Legacy/Disabled Components
- `interaction/container-visibility-manager.js` - ❌ Disabled in v2-main.js
- `interaction/container-support-manager.js` - ❌ Disabled in v2-main.js

### Global Scope Issues
**Failing References**: `window.modlerComponents?.containerManager` returns undefined
**Working References**: `window.modlerComponents.unifiedContainerManager` works correctly

## Architectural Improvements *(NEW)*

### PositionTransform Utility
The container system now uses a centralized `PositionTransform` utility that eliminates coordinate space confusion:
- **Single source of truth** for world ↔ local coordinate conversions
- **Proper matrix timing** - ensures `updateMatrixWorld()` happens before calculations
- **Eliminates recurring bugs** caused by manual coordinate transformations

### Simplified Container Resize Logic
Removed complex branching system (`repositionContainer` flags) in favor of single-path logic:
- **Consistent behavior** for all container operations
- **Eliminates contradictory code paths** that caused position bugs
- **Uses centralized bounds calculation** with proper matrix updates