# Modler V2 - System Summaries

**One-line descriptions of all systems and when to use them**

**NOTE**: All file names use **kebab-case** (e.g., `object-state-manager.js`)

---

## Core Systems (Foundation Layer)

### State Management
- **object-state-manager** (`/core/`) - Single source of truth for all object state; use for ANY state change
- **scene-controller** (`/scene/`) - Object lifecycle (add/remove/update); 3D geometry owner
- **history-manager** (`/application/managers/`) - Undo/redo command execution; use for reversible operations

### Geometry & Materials
- **dimension-manager** (`/core/`) - Single source of truth for dimensions; read from geometry on-demand
  - **No caching**: Dimensions always computed fresh from geometry bounding box
  - **Backward compatibility**: `objectData.dimensions` is a getter that calls DimensionManager
  - **API**: `getDimensions(objectOrId)`, `setDimensions(objectOrId, dims, anchorMode)`
  - **Principle**: "Geometry is truth, everything else is cache"
- **geometry-utils** (`/application/utilities/`) - Geometry creation and manipulation; CAD operations (push, resize, create)
- **material-manager** (`/application/utilities/`) - Material creation, caching, and management; use for all materials
  - **Material pooling**: Shared material instances for consistent updates
  - **Material types**: WIREFRAME, WIREFRAME_HIGHLIGHTED, FACE_HIGHLIGHT, FACE_HIGHLIGHT_CONTAINER
  - **ConfigurationManager integration**: Materials auto-update when settings change
  - **Avoid tagging**: Create materials directly without MaterialManager if you don't want automatic updates
- **transformation-manager** (`/application/utilities/`) - Object transformations (position, rotation, scale); centralized API
- **geometry-factory** (`/application/utilities/`) - Centralized geometry creation with object pooling

### Resource Management
- **visualization-resource-pool** (`/application/utilities/`) - Resource pooling and cleanup; automatic garbage collection management

---

## Interaction Layer

### Input & Selection
- **input-controller** (`/interaction/`) - Mouse/keyboard events → normalized actions; single event entry point
- **selection-controller** (`/interaction/`) - Selection state management; container-first selection logic
- **keyboard-router** (`/interaction/`) - Centralized keyboard input with state polling pattern

### Visualization
- **visualization-manager** (`/interaction/`) - Support meshes, highlights, visual effects; show/hide only (never recreate)
- **object-visualizer** (`/interaction/`) - Individual object visualization effects
- **container-visualizer** (`/interaction/`) - Container-specific visualization (wireframes, bounds)
- **support-mesh-factory** (`/interaction/`) - Creates support meshes for objects (edges, measurements, etc.)
  - **Face highlight materials**: faceHighlight (objects), faceHighlightContainer (containers), faceHighlightDisabled (grey, blocked operations)
  - **Material swapping pattern**: Store original material in userData.originalMaterial, swap for visual states, restore on clear
  - **Opacity syncing**: All face highlight materials subscribe to ConfigurationManager for opacity updates

### Camera & Navigation
- **camera-controller** (`/interaction/`) - Camera orbit, pan, zoom controls
- **camera-math-utils** (`/interaction/`) - Camera-related mathematical utilities
- **zoom-centering** (`/interaction/`) - Zoom and camera centering operations
- **field-navigation-manager** (`/interaction/`) - Field-based navigation management

### Container Interaction
- **container-interaction-manager** (`/interaction/`) - Container-specific interaction handling

---

## Scene Layer

### Scene Management
- **scene-controller** (`/scene/`) - 3D scene owner; object lifecycle management
- **visual-effects** (`/scene/`) - Scene-level visual effects (not object-specific)
- **snap-visualizer** (`/scene/`) - Snapping visualization feedback

---

## Layout Layer

### Layout System
- **layout-engine** (`/layout/`) - Pure layout calculation functions; no THREE.js dependencies
- **layout-geometry** (`/application/tools/`) - Layout-aware wireframe creation; container visual generation

---

## Application Layer

### Tools
- **tool-controller** (`/application/`) - Tool activation/switching only; coordinates all tools
- **select-tool** (`/application/tools/`) - Object selection and manipulation
- **push-tool** (`/application/tools/`) - Face pushing/extrusion with real-time feedback
- **box-creation-tool** (`/application/tools/`) - Box creation with click-and-drag
- **tile-tool** (`/application/tools/`) - Tile/array object creation
- **measurement-tool** (`/application/tools/`) - Distance and dimension measurement (Option-key)
- **move-tool** (`/application/tools/`) - Object movement tool
- **movement-utils** (`/application/tools/`) - Movement-related utility functions

### Container Management
- **container-crud-manager** (`/application/tools/`) - Container create/delete/resize operations; all container ops go here

### Handlers
- **property-update-handler** (`/application/handlers/`) - Routes UI property changes → ObjectStateManager

### Managers
- **configuration-manager** (`/application/`) - Application configuration management
- **snap-controller** (`/application/`) - Snapping system coordination
- **navigation-controller** (`/application/managers/`) - Navigation state management
- **tile-instance-manager** (`/application/managers/`) - Tile instance tracking and management
- **property-manager** (`/application/managers/`) - Property-related operations
- **hierarchical-selection-manager** (`/application/managers/`) - Hierarchical selection tracking

### Utilities
- **development-validator** (`/application/utilities/`) - Enforces architectural patterns; catches violations
- **input-focus-manager** (`/application/utilities/`) - Input focus state management
- **position-transform** (`/application/utilities/`) - Position transformation utilities
- **transform-notification-utils** (`/application/utilities/`) - Transform notification helpers
- **unit-converter** (`/application/utilities/`) - Unit conversion utilities

---

## UI & Communication

### 3D ↔ UI Communication
- **property-panel-sync** (`/integration/svelte/`) - ONLY source for 3D → UI PostMessages; enforced by validator
- **unified-communication** (`/svelte-ui/src/lib/services/`) - UI → 3D message routing with PropertyPanelSync or fallback PostMessage
- **property-controller** (`/svelte-ui/src/lib/services/`) - UI property state management; Svelte stores
- **property-section-registry** (`/svelte-ui/src/lib/services/`) - Maps object types to UI panel sections

### Integration Layer
- **direct-component-manager** (`/integration/svelte/`) - Direct component management (non-iframe)
- **panel-manager** (`/integration/svelte/`) - Panel lifecycle management
- **panel-communication** (`/integration/svelte/`) - Panel communication coordination
- **main-integration** (`/integration/svelte/`) - Main Svelte integration entry point
- **port-detection** (`/integration/svelte/`) - Development server port detection
- **property-format-converter** (`/integration/svelte/`) - Property format conversion between 3D and UI
- **settings-handler** (`/integration/svelte/`) - Settings management
- **split-panel-controller** (`/integration/`) - Split panel UI controller

---

## Foundation Layer

### Core Foundation
- **logger** (`/core/`) - Centralized logging system
- **scene-foundation** (`/foundation/`) - Foundation THREE.js scene setup

---

## When to Use What?

### I need to...

**Change object state**
→ `window.modlerComponents.objectStateManager.updateObject(id, updates)`

**Send data to UI**
→ `window.modlerComponents.propertyPanelSync.sendToUI(eventType, data)`

**Handle UI command**
→ `property-update-handler.handlePropertyChange()` → `ObjectStateManager`

**Create container**
→ `window.modlerComponents.containerCrudManager.createContainerFromSelection()`

**Manipulate geometry**
→ `window.GeometryUtils.pushGeometryFace()`, `createBoxAtPosition()`, etc.

**Read/write dimensions**
→ `window.dimensionManager.getDimensions(id)`, `setDimensions(id, dims, anchor)`

**Show visual effect**
→ `window.modlerComponents.visualizationManager.showSupportMesh(id, type)`

**Calculate layout**
→ `window.LayoutEngine.calculateLayout(children, config)`

**Add object to scene**
→ `window.modlerComponents.sceneController.addObject(objectData)`

**Make operation undoable**
→ Create `Command`, use `window.modlerComponents.historyManager.executeCommand(command)`

**Create new tool**
→ Extend base tool pattern, register in `tool-controller`

**Handle mouse event**
→ `input-controller` routes to active tool's `onClick/onDrag/onMouseMove`

**Select object**
→ `window.modlerComponents.selectionController.selectObject(id)`

**Create material**
→ Material created via `material-manager` or GeometryUtils

---

## Critical Patterns Checklist

✅ **ALWAYS**:
- Use `ObjectStateManager.updateObject()` for state changes
- Use `PropertyPanelSync.sendToUI()` for UI notifications
- Use `VisualizationManager` to show/hide support meshes (never recreate)
- Use CAD geometry operations, never visual transforms
- Keep call stacks < 5 function calls
- Question: "Does this improve the foundation?"
- Use **kebab-case** for all file names

❌ **NEVER**:
- Bypass `ObjectStateManager` for state changes
- Call `window.postMessage` directly (use PropertyPanelSync or UnifiedCommunication)
- Recreate support meshes (show/hide only)
- Use visual transforms instead of CAD geometry
- Make assumptions without investigation
- Add complexity without clear architectural benefit
- Use PascalCase for file names (should be kebab-case)

---

## Layer Boundaries

**Cross-layer communication rules**:
- Application → Interaction ✅
- Interaction → Scene ✅
- Scene → Foundation ✅
- Any → ObjectStateManager ✅
- Any → PropertyPanelSync ✅
- Application → THREE.js directly ❌
- Tools → SceneController directly ❌ (use ObjectStateManager)
- UI → SceneController directly ❌ (use PropertyUpdateHandler)

---

## System Complexity Budget

| System Type | Target Lines | Max Lines |
|-------------|--------------|-----------|
| Tools | ~200 | ~400 |
| Controllers | ~300 | ~500 |
| Managers | ~250 | ~400 |
| Utilities | ~150 | ~250 |
| UI Components | ~150 | ~300 |

**Note**: Common sense over rigid rules. Justified complexity is acceptable.

---

## Documentation Links

For detailed documentation on specific systems:

### Core Documentation
- Architecture: `@documentation/core/architecture-v2.md`
- Feature Roadmap: `@documentation/core/feature-roadmap.md`
- UX Design: `@documentation/core/ux-design.md`

### System Documentation
- Selection: `@documentation/systems/selection.md`
- Containers: `@documentation/systems/containers.md`
- Support Meshes: `@documentation/systems/support-mesh-architecture.md`
- Dimension Management: `@documentation/systems/dimension-management.md` ⭐ Geometry-driven dimensions
- Tools: `@documentation/systems/tools.md`
- Input Events: `@documentation/systems/input-events.md`
- Layout: `@documentation/architecture/auto-layout-system.md`

### Development Guides
- Transform vs Geometry: `@documentation/guides/transform-vs-geometry.md` ⭐ Essential
- Data Flow: `@documentation/architecture/data-flow-architecture.md` ⭐ Complete flow map
- Tool Development: `@documentation/development/tool-guide.md`
- Svelte Integration: `@documentation/development/svelte-ui-integration.md`
- API Reference: `@documentation/development/api-reference.md`

### Performance & Optimization
- Layout Performance: `@documentation/guides/layout-performance.md`
- Resource Management: `@documentation/development/resource-management.md`

---

## Global Component Access

All major components are available via `window.modlerComponents`:

```javascript
const {
    objectStateManager,       // /core/object-state-manager.js
    sceneController,          // /scene/scene-controller.js
    selectionController,      // /interaction/selection-controller.js
    visualizationManager,     // /interaction/visualization-manager.js
    historyManager,           // /application/managers/history-manager.js
    toolController,           // /application/tool-controller.js
    inputController,          // /interaction/input-controller.js
    cameraController,         // /interaction/camera-controller.js
    containerCrudManager,     // /application/tools/container-crud-manager.js
    propertyPanelSync         // /integration/svelte/property-panel-sync.js
} = window.modlerComponents;
```

---

**Quick Navigation**:
- Architecture Overview: `@memories/architecture-map.md`
- Code Examples: `@memories/quick-patterns.md`
- Full Documentation: `@documentation/README.md`
