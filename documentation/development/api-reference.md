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

### SelectionController (Unified)
**Purpose**: Complete selection management with container context awareness and visualization integration

**Key Methods**:
- `select(object)` → boolean
- `deselect(object)` → boolean
- `toggle(object)` → boolean
- `clearSelection(reason)` → void
- `initialize(visualizationManager)` → void

**Container Context Management**:
- `stepIntoContainer(containerObject)` → void
- `stepOutOfContainer()` → void
- `isInContainerContext()` → boolean
- `getContainerContext()` → object | null

**File**: `interaction/selection-controller.js` (centralized selection architecture)

### VisualizationManager (Unified System)
**Purpose**: All visual feedback through centralized factory systems - replaces scattered visualization components

**Key Integration Points**:
- Uses GeometryFactory for wireframe creation
- Uses MaterialManager for selection materials
- Integrates with MeshSynchronizer for related mesh updates
- Handles container, object, and face visualization uniformly

**File**: `interaction/visualization-manager.js` (230 lines)

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

## Foundation Layer (Centralized Resources)

### GeometryFactory
**Purpose**: Single source for all geometry creation with object pooling and performance optimization

**Key Methods**:
- `createBoxGeometry(width, height, depth)` → THREE.BoxGeometry
- `createPlaneGeometry(width, height)` → THREE.PlaneGeometry
- `createEdgeGeometry(sourceGeometry)` → THREE.EdgesGeometry
- `returnGeometry(geometry, type)` → void - Return to pool for reuse

**File**: `application/utilities/geometry-factory.js`

### MaterialManager
**Purpose**: Single source for all material creation with configuration integration and caching

**Key Methods**:
- `createMeshLambertMaterial(options)` → THREE.MeshLambertMaterial
- `createPreviewWireframeMaterial(options)` → THREE.LineBasicMaterial
- `createInvisibleRaycastMaterial(options)` → THREE.MeshBasicMaterial
- `returnMaterial(material)` → void - Return to cache for reuse

**File**: `application/utilities/material-manager.js`

### TransformationManager
**Purpose**: Single API for all object transformations with performance optimization and mesh synchronization

**Key Methods**:
- `setPosition(object, position, options)` → boolean
- `setRotation(object, rotation, options)` → boolean
- `setScale(object, scale, options)` → boolean
- `applyTransform(object, transforms, options)` → boolean

**File**: `application/utilities/transformation-manager.js`

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