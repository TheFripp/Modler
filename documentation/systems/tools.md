---
title: Tool System
version: 2.1.0
last_updated: September 26, 2025
maintained_by: Architecture Team
---

# Tool System

Modular tool architecture with centralized event coordination and shared selection behaviors.

## Tool Coordination

### Single Event Entry Point
All mouse events flow through InputController, which coordinates between camera controls and tool operations to prevent conflicts.

**Priority Order**:
1. **Camera controls** (Shift+drag for pan, default drag for orbit)
2. **Tool behaviors** (selection, face highlighting, etc.)
3. **Empty space fallback** (camera orbit)

### Tool Event Pattern
Tools receive pre-coordinated events from InputController rather than direct DOM events. This prevents race conditions and ensures predictable behavior.

## Toolbar Layout

`[Select Q] [Move W] [Push E] [Box R] [Tile T] [Measure M] | [Container ⌘F] | [Snap]`

- **Tool buttons** (Select through Measure): Mode toggles — clicking activates the tool
- **Container button**: Action — wraps current selection in a container (same as ⌘F)
- **Snap toggle**: Toggles snapping on/off

## Current Tools

### SelectTool
**Purpose**: Container-first selection with double-click traversal
- **Container-first logic** via SelectionController
- **Double-click step-into** for direct object access
- **Multi-selection** with Cmd+click

### MoveTool
**Purpose**: Face-based object manipulation with visual feedback
- **Face highlighting** on selected objects only
- **Face-constrained dragging** using face normals
- **Real-time wireframe sync** during movement
- **Face-based manipulation** for precise positioning

### PushTool (Consolidated September 2025)
**Purpose**: Face extrusion and container resizing with centralized architecture
- **Face highlighting** for push targets
- **Face normal-based extrusion** with real-time preview
- **Container sizing mode** switching (hug → fixed)
- **Centralized geometry manipulation** via GeometryUtils.pushGeometryFace()
- **Consolidated container management** via MovementUtils integration
- **Architectural compliance** with centralization patterns

**Consolidation Results**:
- **Size Reduction**: 972 → 742 lines (23.7% reduction, 230 lines eliminated)
- **GeometryUtils Integration**: Replaced 82 lines of manual vertex manipulation
- **Dead Code Elimination**: Removed calculateContainerSizeForFillObjects() and excess debugging
- **MovementUtils Integration**: Eliminated container management duplication
- **Pattern Alignment**: Full compliance with established centralization patterns

### BoxCreationTool
**Purpose**: Interactive 2D → 3D box creation
- **Two-phase creation** (2D rectangle → 3D height)
- **Face-based positioning** on existing objects
- **Keyboard controls** for orientation and snapping

## Centralized Selection Logic

### SelectionController
**File**: `interaction/selection-controller.js`
- **Centralized selection logic** handling all tools
- **Container-first behavior** built into core selection methods
- **Hierarchical navigation** with double-click step-into
- **Empty space selection clearing**
- **Shared by all tools** for consistent selection

### BaseFaceToolBehavior
**File**: `application/tools/base-face-tool-behavior.js`
- **Face highlighting** coordination
- **Face detection** and normal calculation
- **Container target resolution** via `_resolveContainerTarget(hit)` — handles isContainerInteractive, isContainerCollision, and containerMesh architectures
- **Used by MoveTool and PushTool**

### MovementUtils (Shared Utilities)
**File**: `application/tools/movement-utils.js`
- **Mouse movement** calculation and validation
- **3D projection** and axis movement helpers
- **Alt-key measurement mode**: `handleMeasurementMode(isAltPressed, hit, selectionController)` — shared by SelectTool, MoveTool, PushTool
- **FileManager operation guards**: `registerFileOperation(name)` / `unregisterFileOperation(name)` — prevents auto-save during drags
- **Snap detection** integration helpers
- **Performance monitoring** for container updates

## Tool Switching

### ToolController
**File**: `application/tool-controller.js`
- **Keyboard shortcuts** (Q=Select, W=Move, E=Push, R=Box, T=Tile, M=Measure)
- **Tool state management**
- **Container creation** via Cmd+F keyboard shortcut or toolbar Container button → `createLayoutContainer()`

### Tool Integration
- **Event delegation** from InputController
- **Selection coordination** via SelectionController
- **Visual feedback** via VisualEffects
- **Property updates** via PropertyUpdateHandler

## Factory System Integration

### Centralized Resource Usage
Tools use centralized factory systems for all resource creation and manipulation:
- **TransformationManager**: All object positioning, rotation, scaling (replaces direct mesh.position.copy)
- **GeometryFactory**: Any dynamic geometry creation (preview meshes, temporary overlays)
- **MaterialManager**: Consistent material creation and caching

### Architecture Compliance
- **NEVER use direct THREE.js creation** (`new THREE.BoxGeometry`, `mesh.position.copy`)
- **ALWAYS use factory systems** for resource management and performance optimization
- **Automatic cleanup** through factory resource pooling and tracking

### MeasureTool (Toolbar) + MeasurementTool (Alt-modifier)
**Files**: `application/tools/measure-tool-adapter.js`, `application/tools/measurement-tool.js`
- **Toolbar tool** (M key): When active, measurements show on hover without needing Alt. Clicking still selects objects.
- **Alt-modifier** on all tools: Hold Alt/Option on Select/Move/Push to show measurements temporarily
- **MeasureToolAdapter**: Thin wrapper registering MeasurementTool as a toolbar tool via ToolController
- **Edge measurement**: Shows dimension of closest edge on hover
- **Distance measurement**: Shows gap between selected and hovered objects
- **Camera-facing positioning**: Measurement lines and labels appear on the camera-facing side of objects
- **Thick-line rendering** via `_addThickLines()` helper (screen-space perpendicular offset)

## Key Patterns
- **Shared selection behavior** prevents inconsistencies
- **Face-based interaction** for CAD workflows
- **Event coordination** prevents conflicts
- **Tool-agnostic container creation** via direct commands
- **Centralized resource management** through factory systems
- **Shared utilities via MovementUtils** — measurement mode, file operations, movement calculations