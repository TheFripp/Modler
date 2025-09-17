# API Quick Reference

## BaseSelectionBehavior
**File**: `application/tools/base-selection-behavior.js`

### Methods
- `handleObjectClick(object, event)` → `boolean` - Container-first selection logic
- `handleDoubleClick(hit, event)` → `boolean` - Direct object selection  
- `handleEmptySpaceClick(event)` → `void` - Clear selection on empty clicks
- `isSelectableObject(object)` → `boolean` - Check if object can be selected

## SelectionController  
**File**: `interaction/selection-controller.js`

### Methods
- `select(object)` → `boolean` - Add object to selection
- `deselect(object)` → `boolean` - Remove object from selection
- `toggle(object)` → `boolean` - Toggle object selection state
- `clearSelection(reason)` → `void` - Clear all selected objects
- `isSelected(object)` → `boolean` - Check if object is selected

### Properties
- `selectedObjects` → `Set` - Currently selected objects
- `edgeHighlights` → `Map` - Object to wireframe mappings

## ContainerManager
**File**: `application/tools/container-manager.js`

### Methods  
- `createContainerFromSelection(selectedObjects)` → `Object` - Create container around objects
- `createEmptyContainer(position)` → `Object|null` - Create empty container
- `addObjectToContainer(objectData, containerData)` → `boolean` - Add object to container
- `removeObjectFromContainer(objectData)` → `boolean` - Remove object from container  
- `resizeContainerToFitChildren(containerData, repositionContainer)` → `boolean` - Resize container

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
**File**: `application/managers/tool-controller.js`

### Methods
- `setCurrentTool(toolName)` → `void` - Switch to specific tool
- `getCurrentTool()` → `string` - Get current tool name
- `handleKeyDown(event)` → `boolean` - Handle keyboard shortcuts

### Tool Names
- `'select'` - Selection tool (keyboard: 1)
- `'move'` - Movement tool (keyboard: 2)  
- `'layout'` - Layout tool (keyboard: 3)

## InputHandler
**File**: `interaction/input-handler.js`

### Methods
- `onMouseDown(event, hit)` → `void` - Handle mouse down events
- `onMouseUp(event, hit)` → `void` - Handle mouse up events  
- `onMouseMove(event, hit)` → `void` - Handle mouse move events
- `onDoubleClick(event, hit)` → `void` - Handle double-click events

### Hit Object Structure
```javascript
{
    object: THREE.Object3D,  // The intersected mesh
    point: THREE.Vector3,    // World position of intersection
    face: THREE.Face3,       // Face that was hit (if applicable)  
    distance: number         // Distance from camera
}
```

## ContainerVisibilityManager  
**File**: `interaction/container-visibility-manager.js`

### Methods
- `registerContainer(containerId)` → `void` - Register container for visibility tracking
- `showContainer(containerId, containerMesh)` → `boolean` - Show container wireframe
- `hideContainer(containerId, containerMesh)` → `boolean` - Hide container wireframe
- `registerChildObject(objectId, isVisible)` → `void` - Register child object