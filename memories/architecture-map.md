# Modler V2 - Architecture Map

**Quick Reference**: System hierarchy, file locations, and common workflows

---

## System Hierarchy (Layered Architecture)

```
┌─────────────────────────────────────────────────────────────┐
│                    APPLICATION LAYER                         │
│  ┌──────────────────┬──────────────────┬─────────────────┐ │
│  │ Tools            │ PropertyUpdate   │ UI Panels       │ │
│  │ /application/    │ Handler          │ /svelte-ui/     │ │
│  │ tools/           │ /handlers/       │                 │ │
│  └──────────────────┴──────────────────┴─────────────────┘ │
└─────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────┐
│                   INTERACTION LAYER                          │
│  ┌──────────────────┬──────────────────┬─────────────────┐ │
│  │ InputController  │ Selection        │ Visualization   │ │
│  │ /interaction/    │ Controller       │ Manager         │ │
│  │                  │ /interaction/    │ /interaction/   │ │
│  └──────────────────┴──────────────────┴─────────────────┘ │
└─────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────┐
│                      SCENE LAYER                             │
│  ┌──────────────────┬──────────────────┬─────────────────┐ │
│  │ SceneController  │ VisualEffects    │ SnapVisualizer  │ │
│  │ /scene/          │ /scene/          │ /scene/         │ │
│  │                  │                  │                 │ │
│  └──────────────────┴──────────────────┴─────────────────┘ │
└─────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────┐
│                      LAYOUT LAYER                            │
│  ┌──────────────────┐                                       │
│  │ LayoutEngine     │  Container auto-layout calculations   │ │
│  │ /layout/         │                                       │ │
│  └──────────────────┘                                       │
└─────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────┐
│                    FOUNDATION LAYER                          │
│  ┌──────────────────┬──────────────────┬─────────────────┐ │
│  │ GeometryUtils    │ MaterialManager  │ Object          │ │
│  │ /application/    │ /application/    │ StateManager    │ │
│  │ utilities/       │ utilities/       │ /core/          │ │
│  └──────────────────┴──────────────────┴─────────────────┘ │
│                      THREE.js + WebGL                        │
└─────────────────────────────────────────────────────────────┘
```

---

## File → Responsibility Matrix

### Core Systems (Foundation)

| File | Location | Responsibility | When to Use |
|------|----------|---------------|-------------|
| **object-state-manager** | `/core/` | ALL state changes | Any state modification |
| **scene-controller** | `/scene/` | 3D geometry, object lifecycle | Add/remove/update objects |
| **dimension-manager** | `/core/` | Dimension access layer | Read/write dimensions from geometry |
| **geometry-utils** | `/application/utilities/` | Geometry operations | Geometry creation/manipulation |
| **material-manager** | `/application/utilities/` | Material creation & caching | Create/update materials |

### Communication & UI (Phase 3)

| File | Location | Responsibility | When to Use |
|------|----------|---------------|-------------|
| **main-adapter** | `/integration/communication/` | ObjectEventBus → postMessage | Automatic (Main side) |
| **ui-adapter** | `/svelte-ui/src/lib/services/` | postMessage → Svelte stores | Automatic (UI side) |
| **message-protocol** | `/integration/communication/` | Message types & builders | Message definitions |
| **communication-bridge** | `/integration/communication/` | postMessage serialization | Automatic |
| **unified-communication** | `/svelte-ui/src/lib/services/` | UI → Main commands | Send commands from UI |
| **property-controller** | `/svelte-ui/src/lib/services/` | UI property state | UI state management |
| **property-update-handler** | `/application/handlers/` | UI property changes → 3D | Route property updates |

### Managers (Business Logic)

| File | Location | Responsibility | When to Use |
|------|----------|---------------|-------------|
| **container-crud-manager** | `/application/tools/` | Container operations | Create/delete/resize containers |
| **visualization-manager** | `/interaction/` | Visual effects, support meshes | Show/hide visuals |
| **history-manager** | `/application/managers/` | Undo/redo | Execute commands |
| **layout-engine** | `/layout/` | Layout calculations | Auto-layout containers |
| **input-controller** | `/interaction/` | Mouse/keyboard events | Input handling |
| **selection-controller** | `/interaction/` | Selection state | Object selection |
| **camera-controller** | `/interaction/` | Camera controls | Orbit, pan, zoom |
| **tool-controller** | `/application/` | Tool coordination | Tool switching |

---

## Decision Tree: Where Does Code Go?

```
┌─ State change?
│  └─→ ObjectStateManager.updateObject()
│
┌─ 3D geometry update?
│  └─→ SceneController methods (via ObjectStateManager)
│
┌─ Geometry manipulation?
│  └─→ GeometryUtils (create, push, resize)
│
┌─ Read/write dimensions?
│  └─→ DimensionManager.getDimensions() / setDimensions()
│      (or objectData.dimensions getter for backward compat)
│
┌─ UI property update?
│  └─→ PropertyUpdateHandler → ObjectStateManager
│
┌─ UI notification (3D → UI)?
│  └─→ Automatic via ObjectEventBus → MainAdapter → MessageProtocol
│
┌─ UI command (UI → 3D)?
│  └─→ UnifiedCommunication.send() → postMessage → main-integration.js
│
┌─ Container operation?
│  └─→ ContainerCrudManager
│
┌─ Visual effect?
│  └─→ VisualizationManager
│
┌─ Undo/redo?
│  └─→ HistoryManager.executeCommand()
│
└─ New object type UI?
   └─→ PropertySectionRegistry.register()
```

---

## Common Workflows

### 1. State Change Flow (Phase 3)
```javascript
// User action → State update → UI notification
Tool/Handler
  → ObjectStateManager.updateObject(objectId, updates)
    → SceneController.updateGeometry()
    → ObjectEventBus.emit('object:geometry', event)
      → MainAdapter.handleEvent() → MessageProtocol
        → postMessage → UIAdapter.receive() → Svelte stores update
```

### 2. UI Property Change Flow (Phase 3)
```javascript
// User edits property → Update 3D → Reflect in UI
UI Panel (Svelte)
  → UnifiedCommunication.sendPropertyUpdate(objectId, property, value)
    → postMessage → main-integration.js
      → PropertyUpdateHandler.handlePropertyChange()
        → ObjectStateManager.updateObject()
          → ObjectEventBus.emit() → MainAdapter → UIAdapter → UI updates
```

### 3. Container Creation Flow
```javascript
// Create container from selection
User: Cmd+F
  → ToolController.createContainerFromSelection()
    → ContainerCrudManager.createContainerFromSelection()
      → SceneController.addObject({isContainer: true})
        → PropertyPanelSync.sendToUI('objectAdded')
```

### 4. Visual Effect Flow
```javascript
// Show/hide support meshes
Tool.onHover(hit)
  → VisualizationManager.showSupportMesh(objectId, 'edges')
    → (Support mesh already exists, just set visible=true)
```

### 5. Geometry Manipulation Flow
```javascript
// Push face operation
PushTool.onDrag(distance)
  → GeometryUtils.pushGeometryFace(geometry, faceIndex, distance)
    → ObjectStateManager.updateObject(id, {geometry})
      → SceneController.updateMesh()
```

---

## Layer Boundaries (NEVER Cross)

✅ **ALLOWED**:
- Application → Interaction
- Interaction → Scene
- Scene → Foundation
- Any → ObjectStateManager
- Any → PropertyPanelSync (for UI notifications)

❌ **FORBIDDEN**:
- Application → THREE.js directly
- Tools → SceneController directly (use ObjectStateManager)
- UI → SceneController directly (use PropertyUpdateHandler)
- Any → `window.postMessage` directly (use PropertyPanelSync)

---

## Critical Paths (< 5 Function Calls)

### Mouse Hover → Face Highlight
```
InputController.onMouseMove()
  → Tool.onHover(hit)
    → VisualizationManager.highlightFace()
```
**3 calls** ✅

### Object Selection
```
InputController.onClick()
  → SelectionController.selectObject(id)
    → VisualizationManager.highlightObject()
```
**3 calls** ✅

### Property Update
```
UI.onChange()
  → PropertyUpdateHandler.handlePropertyChange()
    → ObjectStateManager.updateObject()
      → SceneController.updateGeometry()
        → PropertyPanelSync.sendToUI()
```
**5 calls** ✅

---

## File Size Guidelines

| Component Type | Target Size | Max Size | When to Split |
|---------------|-------------|----------|---------------|
| **Tools** | ~200 lines | ~400 lines | > 400 lines |
| **Controllers** | ~300 lines | ~500 lines | > 500 lines |
| **Managers** | ~250 lines | ~400 lines | > 400 lines |
| **Utilities** | ~150 lines | ~250 lines | > 250 lines |
| **UI Components** | ~150 lines | ~300 lines | > 300 lines |

**Note**: Guidelines, not rules. 1200-line file is fine if architecturally justified.

---

## Quick File Locations

**Need to find a file?** Common patterns:

**NOTE**: All file names use **kebab-case** (e.g., `object-state-manager.js`, NOT `ObjectStateManager.js`)

- **Tools**: `/application/tools/[tool-name].js`
- **Controllers**: `/scene/scene-controller.js`, `/interaction/[name]-controller.js`
- **Managers**: `/application/managers/` or `/interaction/`
- **Utilities**: `/application/utilities/geometry-utils.js`, `/application/tools/movement-utils.js`
- **UI Services**: `/svelte-ui/src/lib/services/` (TypeScript: `.ts` files)
- **UI Components**: `/svelte-ui/src/lib/components/`
- **Integration**: `/integration/svelte/`
- **Core**: `/core/object-state-manager.js`, `/core/dimension-manager.js`, `/core/logger.js`
- **Layout**: `/layout/layout-engine.js`

---

**For detailed implementation**: See `/documentation/README.md` for full system documentation.
