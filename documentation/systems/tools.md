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

### PushTool
**Purpose**: Face extrusion and container resizing
- **Face highlighting** for push targets
- **Face normal-based extrusion** with real-time preview
- **Container sizing mode** switching (hug → fixed)
- **Geometry vertex manipulation** for CAD accuracy

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
- **Used by MoveTool and PushTool**

## Tool Switching

### ToolController
**File**: `application/tool-controller.js`
- **Keyboard shortcuts** (1=Select, 2=Move, etc.)
- **Tool state management**
- **Container creation** via Cmd+F → ContainerManager

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

## Key Patterns
- **Shared selection behavior** prevents inconsistencies
- **Face-based interaction** for CAD workflows
- **Event coordination** prevents conflicts
- **Tool-agnostic container creation** via direct commands
- **Centralized resource management** through factory systems