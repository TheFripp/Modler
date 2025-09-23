# API Quick Reference

## SelectionController
**File**: `interaction/selection-controller.js`

### Core Selection Methods
- `select(object)` → `boolean` - Add object to selection
- `deselect(object)` → `boolean` - Remove object from selection
- `toggle(object)` → `boolean` - Toggle object selection state
- `clearSelection(reason)` → `void` - Clear all selected objects
- `isSelected(object)` → `boolean` - Check if object is selected

### Tool Interface Methods
- `handleObjectClick(object, event, options)` → `boolean` - Container-first selection logic
- `handleDoubleClick(hit, event)` → `boolean` - Container step-into functionality
- `handleEmptySpaceClick(event)` → `void` - Clear selection and exit container context
- `isSelectableObject(object)` → `boolean` - Check if object can be selected

### Container Context Methods
- `stepIntoContainer(containerObject)` → `void` - Establish container context
- `stepOutOfContainer()` → `void` - Exit container context
- `isInContainerContext()` → `boolean` - Check if in container context
- `getContainerContext()` → `Object|null` - Get current container context
- `isObjectPartOfContainer(objectData, containerMesh)` → `boolean` - Check if object is part of container context

### Properties
- `selectedObjects` → `Set` - Currently selected objects

## ContainerCrudManager
**File**: `application/tools/container-crud-manager.js`

### Methods
- `createContainerFromSelection(selectedObjects)` → `Object` - Create container around objects
- `createEmptyContainer(position)` → `Object|null` - Create empty container
- `addObjectToContainer(objectData, containerData)` → `boolean` - Add object to container
- `removeObjectFromContainer(objectData)` → `boolean` - Remove object from container
- `resizeContainerToFitChildren(containerData, repositionContainer)` → `boolean` - Resize container

## ContainerInteractionManager
**File**: `interaction/container-interaction-manager.js`

### Methods
- `stepIntoContainer(containerObject)` → `void` - Establish container context
- `stepOutOfContainer()` → `void` - Exit container context
- `isInContainerContext()` → `boolean` - Check if in container context
- `getContainerContext()` → `Object|null` - Get current container context

## LayoutGeometry
**File**: `application/tools/layout-geometry.js`

### Static Methods
- `createContainerGeometry(size)` → `Object` - Create visual + collision meshes
- `updateContainerGeometry(mesh, size, center, shouldReposition)` → `boolean` - Update container
- `calculateSelectionBounds(objects)` → `Object` - Calculate bounding box

### Return Objects
- `createContainerGeometry()` returns: `{mesh, collisionMesh, geometry, material}`
- `calculateSelectionBounds()` returns: `{center, size, min, max}`

## SceneController
**File**: `scene/scene-controller.js`

### Methods
- `addObject(mesh, geometryData, metadata)` → `Object` - Add object to scene
- `getObject(objectId)` → `Object|null` - Get object by ID
- `getObjectByMesh(mesh)` → `Object|null` - Get object by mesh reference
- `getChildObjects(containerId)` → `Array` - Get direct children of container
- `setParentContainer(objectId, parentId, updateLayout)` → `boolean` - Set parent relationship
- `updateObject(objectId, updates)` → `boolean` - Update object metadata

## MeshSynchronizer
**File**: `interaction/mesh-synchronizer.js`

### Methods
- `registerRelatedMesh(mainMesh, relatedMesh, syncType, options)` → `void` - Register mesh relationship
- `unregisterRelatedMesh(mainMesh, relatedMesh)` → `void` - Remove mesh relationship
- `syncAllRelatedMeshes(mainMesh, syncType)` → `void` - Sync all related meshes
- `syncMesh(sourceMesh, targetMesh, syncType)` → `boolean` - Sync specific meshes

### Sync Types
- `'position'` - Synchronize position only
- `'transform'` - Synchronize position, rotation, scale
- `'visibility'` - Synchronize visible property
- `'geometry'` - Synchronize geometry updates

## ToolController
**File**: `application/tool-controller.js`

### Methods
- `setCurrentTool(toolName)` → `void` - Switch to specific tool
- `getCurrentTool()` → `string` - Get current tool name
- `handleKeyDown(event)` → `boolean` - Handle keyboard shortcuts

### Tool Names
- `'select'` - Selection tool (keyboard: 1)
- `'move'` - Movement tool (keyboard: 2)  

## InputController
**File**: `interaction/input-controller.js`

### Methods
- `onMouseDown(event)` → `void` - Handle mouse down events with raycasting
- `onMouseUp(event)` → `void` - Handle mouse up events and tool delegation
- `onMouseMove(event)` → `void` - Handle mouse move events for tool interactions
- `onKeyDown(event)` → `void` - Handle keyboard input and shortcuts
- `onKeyUp(event)` → `void` - Handle key release events

### Hit Object Structure
```javascript
{
    object: THREE.Object3D,  // The intersected mesh
    point: THREE.Vector3,    // World position of intersection
    face: THREE.Face3,       // Face that was hit (if applicable)  
    distance: number         // Distance from camera
}
```


### Container Context Features
- **Interactive mesh resolution**: Handles both legacy and new container architectures
- **Collision mesh management**: Disables other containers during step-into
- **Visual feedback**: 25% opacity faded wireframe shows active context
- **Position commitment**: Prevents coordinate jumps during context transitions

## ContainerVisibilityManager
**File**: `archived/components/container-visibility-manager.js` (❌ Disabled)

### Methods
- `registerContainer(containerId)` → `void` - Register container for visibility tracking
- `showContainer(containerId, containerMesh)` → `boolean` - Show container wireframe
- `hideContainer(containerId, containerMesh)` → `boolean` - Hide container wireframe
- `registerChildObject(objectId, isVisible)` → `void` - Register child object

## PropertyUpdateHandler
**File**: `application/handlers/property-update-handler.js`

### Methods
- `handleContainerLayoutPropertyChange(containerId, propertyType, value)` → `void` - Handle layout property changes
- `handleObjectDimensionChange(objectId, dimension, value)` → `void` - Handle dimension updates
- `handleObjectTransformChange(objectId, transformType, value)` → `void` - Handle transform updates
- `getComponents()` → `Object` - Get modler component references

### Property Types
- `'direction'` - Layout direction (x, y, z, xy, xz, yz, xyz)
- `'gap'` - Spacing between objects
- `'padding.top'`, `'padding.bottom'`, etc. - Container padding
- `'enabled'` - Enable/disable layout

## ThreeJSBridge
**File**: `svelte-ui/src/lib/bridge/threejs-bridge.ts`

### Methods
- `initialize(components)` → `void` - Initialize bridge with Three.js components
- `isInitialized()` → `boolean` - Check initialization status
- `getComponents()` → `Object` - Get Three.js component references

### Functions
- `initializeBridge()` → `void` - Initialize iframe or direct communication
- `activateToolInScene(toolName)` → `void` - Activate tool in main application
- `toggleSnapInScene()` → `void` - Toggle snapping in main application

### Communication Types
- PostMessage for iframe context
- Direct function calls for same-window context
- Real-time object hierarchy synchronization
- Bidirectional property updates