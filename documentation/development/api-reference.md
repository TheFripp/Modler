# API Reference

## Overview
Key method signatures and concepts for Modler V2 components. For implementation details, see source files.

## Core Controllers

### SceneController
**Purpose**: Object lifecycle management and auto-layout coordination

**Key Methods**:
- `addObject(geometry, material, options)` → Object data or null
- `removeObject(id)` → boolean  
- `getObject(id)` → Object data or null
- `getObjectByMesh(mesh)` → Object data or null
- `enableAutoLayout(containerId, layoutConfig)` → boolean
- `setParentContainer(objectId, parentId)` → boolean
- `generateBoxName()` → string - Sequential box naming (Box 001, etc.)
- `generateContainerName()` → string - Sequential container naming (Container 001, etc.)

**File**: `scene/scene-controller.js`

### SelectionController (Streamlined)
**Purpose**: Core selection state management only - visual effects delegated to SelectionVisualizer

**Key Methods**:
- `select(object)` → boolean
- `deselect(object)` → boolean
- `toggle(object)` → boolean
- `clearSelection(reason)` → void
- `initialize(selectionVisualizer, containerContextManager)` → void

**Container Context Delegation**:
- `stepIntoContainer(containerObject)` → void
- `stepOutOfContainer()` → void
- `isInContainerContext()` → boolean
- `getContainerContext()` → object | null

**File**: `interaction/selection-controller.js` (280 lines, down from 793)

### SelectionVisualizer (New)
**Purpose**: All selection visual feedback - edge highlights, materials, configuration

**Key Methods**:
- `updateObjectVisual(object, isSelected)` → void
- `createEdgeHighlight(object)` → void
- `removeEdgeHighlight(object)` → void
- `showContainerWireframe(object)` → void
- `hideContainerWireframe(object)` → void

**File**: `interaction/selection-visualizer.js` (230 lines)

### ContainerContextManager (New)
**Purpose**: Container step-in/out logic and context highlighting

**Key Methods**:
- `stepIntoContainer(containerObject)` → void
- `stepOutOfContainer()` → void
- `isInContainerContext()` → boolean
- `getContainerContext()` → object | null
- `updateContainerEdgeHighlight()` → void
- `handleSelectionClear(reason)` → void

**File**: `interaction/container-context-manager.js` (150 lines)
- `isSelected(object)` → boolean

**Properties**:
- `selectedObjects` → Set of selected objects
- `edgeHighlights` → Map of object to wireframe

**File**: `interaction/selection-controller.js`

### MeshSynchronizer
**Purpose**: Centralized coordination for related meshes

**Key Methods**:
- `registerRelatedMesh(mainMesh, relatedMesh, syncType, options)` → void
- `unregisterRelatedMesh(mainMesh, relatedMesh)` → void
- `syncAllRelatedMeshes(mainMesh, syncType)` → void

**Sync Types**: `'position'`, `'transform'`, `'visibility'`, `'geometry'`, `'highlight'`

**File**: `interaction/mesh-synchronizer.js`

## Tool System

### SelectionController (Centralized)
**Purpose**: Unified selection logic for all tools - eliminates BaseSelectionBehavior duplication

**Key Methods**:
- `handleObjectClick(object, event, options)` → boolean - Container context-aware selection
- `handleDoubleClick(hit, event)` → boolean - Container step-into functionality
- `handleEmptySpaceClick(event)` → void - Clear selection and exit context
- `isSelectableObject(object)` → boolean - Object selectability validation
- `select(object)` → boolean - Context-aware selection with container logic
- `stepIntoContainer(containerObject)` → void - Establish container context
- `stepOutOfContainer()` → void - Exit container context

**File**: `interaction/selection-controller.js`

### ToolController
**Purpose**: Tool registration and switching

**Key Methods**:
- `setCurrentTool(toolName)` → void
- `getCurrentTool()` → string
- `handleKeyDown(event)` → boolean

**Tool Names**: `'select'`, `'move'`, `'layout'`

**File**: `application/managers/tool-controller.js`

## Container System

### ContainerManager
**Purpose**: Container creation and lifecycle management
**⚠️ Global Scope Issue**: Not exposed to `window.modlerComponents` - references fail

**Key Methods**:
- `createContainerFromSelection(selectedObjects)` → Object
- `createEmptyContainer(position)` → Object or null
- `addObjectToContainer(objectData, containerData)` → boolean
- `removeObjectFromContainer(objectData)` → boolean
- `resizeContainerToFitChildren(containerData, newSize, preservePosition)` → boolean
- `resizeContainerToLayoutBounds(containerData, layoutBounds)` → boolean *(NEW METHOD)*

**Coordination**: Works with UnifiedContainerManager for visibility management

**File**: `application/tools/container-manager.js`

### UnifiedContainerManager
**Purpose**: Container visibility, state tracking, and interactive mesh management
**✅ Global Exposure**: Properly exposed as `window.modlerComponents.unifiedContainerManager`

**Key Methods**:
- `registerContainer(containerData)` → boolean
- `showContainer(containerId)` → boolean
- `hideContainer(containerId)` → boolean
- `syncInteractiveMeshPosition(containerId)` → boolean
- `createPaddingVisualization(containerData)` → void
- `migrateAllContainers()` → number

**State Management**: Tracks `{wireframeVisible, isSelected}` per container

**File**: `interaction/container-manager.js`

### PositionTransform *(NEW)*
**Purpose**: Centralized coordinate space transformations - eliminates position bugs

**Static Methods**:
- `preserveWorldPosition(object, newParent)` → boolean - Move object while preserving world position
- `preserveWorldPositions(objects, newParent)` → boolean - Move multiple objects
- `calculateObjectBounds(objects)` → Object with {center, size, min, max} - Bounds with matrix updates
- `createContainerAtPosition(size, position)` → Object - Create positioned container
- `validateWorldPosition(object, expectedPos)` → boolean - Debug utility

**File**: `application/utilities/position-transform.js` *(NEW FILE)*

### LayoutGeometry  
**Purpose**: Geometry calculations and container bounds

**Static Methods**:
- `createContainerGeometry(size)` → Object with {mesh, collisionMesh, geometry, material}
- `updateContainerGeometry(mesh, size, center, shouldReposition)` → boolean
- `calculateSelectionBounds(objects)` → Object with {center, size, min, max}

**File**: `application/tools/layout-geometry.js`

## Input System

### InputController **[CONSOLIDATED v2.1]**
**Purpose**: Unified input coordination with tool integration and camera controls

**Key Methods**:
- `onMouseDown(event)` → void - Handles all mouse down events with raycasting
- `onMouseUp(event)` → void - Processes clicks and completes operations
- `onMouseMove(event)` → void - Tool hover and drag operations
- `onKeyDown(event)` → void - Tool switching and shortcuts
- `raycast()` → Object or null - Smart object prioritization
- `isKeyDown(keyCode)` → boolean - Key state queries
- `getMousePosition()` → {x, y} - NDC mouse coordinates

**Hit Object**: `{object: THREE.Object3D, point: THREE.Vector3, face: THREE.Face3, distance: number}`

**Properties**: `currentTool`, `mouse`, `keys`, `mouseButtons`, `raycaster`

**File**: `interaction/input-controller.js` **(consolidated from InputFoundation + InputHandler)**

### CameraController
**Purpose**: Professional 3D viewport camera controls

**Key Methods**:
- `startOrbitFromInputHandler(event, mousePos)` → void
- `startPanFromInputHandler(event, mousePos)` → void
- `handleMouseMoveFromInputHandler(event)` → void

**Properties**: `isOrbiting`, `isPanning`, `orbitSpeed`, `panSpeed`, `zoomSpeed`

**File**: `interaction/camera-controller.js`

## Visual System

### VisualEffects
**Purpose**: Visual feedback system with face highlighting

**Key Methods**:
- `showFaceHighlight(hit)` → void  
- `clearHighlight()` → void
- `showObjectHighlight(hit)` → void
- `clearObjectHighlight()` → void

**File**: `scene/visual-effects.js`

### ContainerVisibilityManager
**Purpose**: Container wireframe show/hide coordination

**Key Methods**:
- `registerContainer(containerId)` → void
- `showContainer(containerId, containerMesh)` → boolean
- `hideContainer(containerId, containerMesh)` → boolean  
- `registerChildObject(objectId, isVisible)` → void

**File**: `interaction/container-visibility-manager.js`

## Layout System

### LayoutEngine
**Purpose**: Pure layout calculation functions

**Static Methods**:
- `calculateLayout(objects, layoutConfig)` → Array of positions
- `calculateLayoutBounds(objects, positions)` → Object with bounds

**Layout Config**: `{direction, gap, padding, columns, rows}`

**Directions**: `'x'`, `'y'`, `'z'`, `'xy'`, `'xyz'`

**File**: `application/layout/layout-engine.js`

## Foundation Layer

### SceneFoundation
**Purpose**: Basic Three.js setup and scene initialization

**Key Methods**:
- `addAnimationCallback(callback)` → void
- `destroy()` → void

**Properties**: `scene`, `camera`, `renderer`, `canvas`

**File**: `foundation/scene-foundation.js`

*InputFoundation removed - functionality consolidated into InputController*