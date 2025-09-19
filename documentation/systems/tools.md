# Tool System

## Overview
Modular tool architecture with centralized event coordination and shared selection behaviors. Supports face-based manipulation for CAD workflows.

**See**: [`/core/ux-design.md`](../core/ux-design.md) for interaction patterns and mental models that guide tool design.

## Tool Coordination

### Single Event Entry Point
All mouse events flow through InputHandler first, which coordinates between camera controls, gizmos, and tool operations to prevent conflicts.

**Priority Order**:
1. **Gizmo operations** (highest priority)
2. **Camera controls** (Shift+drag for pan, default drag for orbit)
3. **Tool behaviors** (selection, face highlighting, etc.)
4. **Empty space fallback** (camera orbit)

### Tool Event Pattern
Tools receive pre-coordinated events from InputHandler rather than direct DOM events. This prevents race conditions and ensures predictable behavior.

## Tool Types

### SelectTool
**Purpose**: Clean object selection without visual distractions
- **No hover highlights** - maintains clean visual experience
- **Container-first selection** through BaseSelectionBehavior
- **Multi-select support** with modifier keys

### MoveTool  
**Purpose**: Face-based object manipulation with visual feedback
- **Face highlighting** on selected objects only
- **Face-constrained dragging** using face normals
- **Real-time wireframe sync** during movement
- **Gizmo coordination** for precise positioning

### Container Creation
**Purpose**: Direct container creation through command shortcuts
- **Container creation** via Cmd+F (handled by ToolController → ContainerManager)
- **Property-driven layout** through PropertyUpdateHandler
- **Layout configuration** via property panel changes
- **No tool activation required** for container operations

## Shared Behaviors

### BaseSelectionBehavior
**Universal selection logic** used by all tools:
- `handleObjectClick()` - Container-first selection with modifier support
- `handleDoubleClick()` - Direct object selection bypass
- `handleEmptySpaceClick()` - Smart selection clearing

### Tool Switching
- **Keyboard shortcuts**: 1=select, 2=move, 3=layout
- **State preservation**: Selection maintained across tool switches
- **Clean transitions**: Tools properly deactivate/activate behaviors

## Face-Based Interaction

### Face Detection
MoveTool detects faces on both regular objects and container collision meshes for consistent face-based manipulation across all object types.

### Face Highlighting
- **Cyan overlays** show which face will be used for dragging
- **Geometry-aware** highlighting works with box geometries (full rectangular faces) and other geometry types (triangle faces)
- **Tool-specific** - only shown in MoveTool context

### Face Constraints
During face-based dragging, objects move along face normal directions, providing intuitive directional control for CAD-style manipulation.

## Tool Development

### Tool Interface
Tools implement standard event handlers:
- `activate()` / `deactivate()` - Tool lifecycle management
- `onHover(hit)` - Mouse hover behavior (optional)  
- `onClick(hit, event)` - Mouse click behavior
- `onMouseDown(hit, event)` - Drag initiation (optional)

### Selection Integration
All tools use BaseSelectionBehavior for consistent selection patterns rather than implementing custom selection logic.

### Visual Effects Integration
Tools coordinate with VisualEffects system for highlights, wireframes, and temporary visual feedback.

## Architecture Benefits

### Consistency
Shared BaseSelectionBehavior ensures all tools handle selection identically, eliminating user confusion between different interaction modes.

### Modularity  
Tools are self-contained with clear interfaces, making it easy to add new tools or modify existing behavior.

### Conflict Prevention
Centralized event coordination through InputHandler prevents conflicts between tools, camera controls, and other interactive elements.

## File References
- `application/managers/tool-controller.js` - Tool registration and switching
- `application/tools/base-selection-behavior.js` - Shared selection logic
- `interaction/input-handler.js` - Event coordination
- Individual tool files: `select-tool.js`, `move-tool.js`, `push-tool.js`, `box-creation-tool.js`