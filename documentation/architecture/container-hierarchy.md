# Container Hierarchy Architecture

**Version**: 1.0.0
**Status**: Current
**Last Updated**: 2025-01-30

## Overview

Modler V2 implements a **container-based hierarchy** system where objects can be nested inside containers, forming parent-child relationships. This document explains how the hierarchy works, how it's stored, and how it propagates changes.

---

## Core Concepts

### Container vs Regular Object

**Regular Object** (Box):
- Can be a child of a container
- Can be selected and manipulated
- Has dimensions, position, rotation
- Cannot contain other objects

**Container**:
- Can contain other objects (children)
- Can be nested inside other containers
- Has auto-layout capabilities
- Renders as wireframe bounding box
- Children positions are **relative to container**

### Parent-Child Relationships

```
Scene (Root)
├── Box 001 (regular object)
├── Container 001 (parent)
│   ├── Box 002 (child)
│   ├── Box 003 (child)
│   └── Container 002 (nested container)
│       ├── Box 004 (grandchild)
│       └── Box 005 (grandchild)
└── Box 006 (regular object)
```

---

## Hierarchy Storage

### Where Data Lives

**SceneController** (Single Source of Truth):
```javascript
class SceneController {
    objects = new Map(); // id -> object data
}

// Object data structure
{
    id: 1,
    name: "Box 001",
    type: "box",
    mesh: THREE.Mesh,
    parentContainer: 2,  // ← Parent container ID (null = root)
    isContainer: false,
    dimensions: { x: 1, y: 1, z: 1 },
    position: { x: 0, y: 0, z: 0 }  // ← Local position (relative to parent)
}
```

**Three.js Scene Graph**:
```javascript
// Three.js mirrors the hierarchy
scene
  ├── boxMesh (Box 001)
  ├── containerMesh (Container 001)
  │     ├── boxMesh (Box 002)  // ← Child in parent's local space
  │     └── boxMesh (Box 003)
  └── boxMesh (Box 006)
```

**ObjectStateManager** (Coordination):
```javascript
// Flat hierarchy array for UI
hierarchy: [
    { id: 1, name: "Box 001", parentContainer: null, depth: 0 },
    { id: 2, name: "Container 001", parentContainer: null, depth: 0 },
    { id: 3, name: "Box 002", parentContainer: 2, depth: 1 },
    { id: 4, name: "Box 003", parentContainer: 2, depth: 1 }
]
```

---

## Coordinate Spaces

### Local vs World Space

**Local Space** (Relative to Parent):
- Child object positions stored relative to parent container
- Example: Box at `(1, 0, 0)` inside container at `(5, 5, 5)` → local position = `(1, 0, 0)`

**World Space** (Absolute in Scene):
- Actual position in the scene
- Example: Box at `(1, 0, 0)` inside container at `(5, 5, 5)` → world position = `(6, 5, 5)`

### Coordinate Conversion

**Local → World**:
```javascript
// scene-controller.js:674
const worldPosition = mesh.getWorldPosition(new THREE.Vector3());
```

**World → Local**:
```javascript
// scene-controller.js:685
const containerWorldMatrix = parentContainer.mesh.matrixWorld;
const containerWorldMatrixInverse = new THREE.Matrix4()
    .copy(containerWorldMatrix)
    .invert();
const localPosition = worldPosition.applyMatrix4(containerWorldMatrixInverse);
mesh.position.copy(localPosition);
```

**Direction/Delta Conversion** (for movement vectors, not points):
```javascript
// Use transformDirection for deltas — applies only rotation, not translation
const parentInverse = new THREE.Matrix4().copy(parentMesh.matrixWorld).invert();
const localDelta = worldDelta.clone().transformDirection(parentInverse);
```

> **WARNING**: `CameraMathUtils.screenDeltaToAxisMovement()` and `createDragPlane()` expect WORLD positions. Never pass `mesh.position` for children — use `mesh.getWorldPosition()`. The resulting movement vector is in world space and must be converted to local space before applying to `mesh.position`. See Tool Guide > "Coordinate Space: Dragging Children in Containers" for the full pattern.

---

## Hierarchy Operations

### Adding Object to Container

**Flow**:
```
1. User drags Box 002 onto Container 001
2. NavigationController.dropObjectIntoContainer(box, container)
3. SceneController.setParent(boxId, containerId)
4. Three.js hierarchy update (mesh reparenting)
5. Coordinate conversion (world → local)
6. ObjectEventBus emits HIERARCHY_CHANGED event
7. UI updates (ObjectList panel)
```

**Code** (`scene-controller.js:640`):
```javascript
setParent(objectId, parentId, updateLayout = true) {
    const obj = this.objects.get(objectId);
    const mesh = obj.mesh;

    if (parentId) {
        // Moving to a container
        const parentContainer = this.objects.get(parentId);

        // Store world position before changing parent
        const worldPosition = mesh.getWorldPosition(new THREE.Vector3());

        // Remove from current parent
        if (mesh.parent) {
            mesh.parent.remove(mesh);
        }

        // Add to container
        parentContainer.mesh.add(mesh);

        // Convert world position to local position
        const containerWorldMatrix = parentContainer.mesh.matrixWorld;
        const containerWorldMatrixInverse = new THREE.Matrix4()
            .copy(containerWorldMatrix)
            .invert();
        const localPosition = worldPosition.applyMatrix4(containerWorldMatrixInverse);
        mesh.position.copy(localPosition);
    }

    // Update metadata
    obj.parentContainer = parentId;

    // Emit hierarchy change event
    if (window.objectEventBus) {
        window.objectEventBus.emit(
            window.objectEventBus.EVENT_TYPES.HIERARCHY_CHANGED,
            { objectId, newParentId: parentId }
        );
    }

    // Update layout if container has auto-layout
    if (parentId && updateLayout) {
        const container = this.objects.get(parentId);
        if (container?.autoLayout?.enabled) {
            this.updateContainer(parentId);
        }
    }
}
```

**Key Code Locations**:
- `scene/scene-controller.js:640` - setParent()
- `interaction/container-interaction-manager.js` - Drag & drop
- `core/object-state-manager.js` - Hierarchy tracking

---

### Removing Object from Container

**Flow**:
```
1. User selects Box 002 and presses Delete
2. SceneController.removeObject(boxId)
3. Check if object has children (containers only)
4. Remove from Three.js scene graph
5. Update parent container's layout
6. Emit LIFECYCLE.DELETED event
7. UI updates
```

**Code** (`scene-controller.js:293`):
```javascript
removeObject(id) {
    const obj = this.objects.get(id);
    if (!obj) return false;

    // If this is a container, remove all children first
    if (obj.isContainer) {
        const children = this.getChildObjects(id);
        children.forEach(child => this.removeObject(child.id));
    }

    // Get parent container for layout update
    const parentId = obj.parentContainer;

    // Remove from Three.js scene
    if (obj.mesh) {
        if (obj.mesh.parent) {
            obj.mesh.parent.remove(obj.mesh);
        }
        // Dispose geometry and material
        if (obj.mesh.geometry) obj.mesh.geometry.dispose();
        if (obj.mesh.material) obj.mesh.material.dispose();
    }

    // Remove from objects map
    this.objects.delete(id);

    // Update parent container layout
    if (parentId) {
        const parent = this.objects.get(parentId);
        if (parent?.autoLayout?.enabled) {
            this.updateContainer(parentId);
        }
    }

    // Emit deletion event
    this.emit('objectRemoved', { id });

    return true;
}
```

---

### Nested Containers

**Support**: Containers can be nested infinitely deep.

**Example**:
```
Container A
  ├── Box 1
  └── Container B
        ├── Box 2
        └── Container C
              └── Box 3
```

**Coordinate Math**:
- Box 3 position is relative to Container C
- Container C position is relative to Container B
- Container B position is relative to Container A
- Final world position = A.world + B.local + C.local + Box3.local

**Code** (`core/object-state-manager.js:782`):
```javascript
getContainerDepth(containerId) {
    let depth = 0;
    let current = this.sceneController.getObject(containerId);

    while (current && current.parentContainer) {
        depth++;
        current = this.sceneController.getObject(current.parentContainer);
    }

    return depth;
}
```

---

## Hierarchy Querying

### Get Child Objects

```javascript
// scene-controller.js:344
getChildObjects(containerId) {
    const children = [];

    for (const obj of this.objects.values()) {
        if (obj.parentContainer === containerId) {
            children.push(obj);
        }
    }

    return children;
}
```

### Get Parent Container

```javascript
const obj = sceneController.getObject(objectId);
const parentId = obj.parentContainer; // null = root level

if (parentId) {
    const parent = sceneController.getObject(parentId);
    console.log('Parent container:', parent.name);
}
```

### Check if Container

```javascript
const obj = sceneController.getObject(objectId);
if (obj.isContainer) {
    console.log('This is a container');
    const children = sceneController.getChildObjects(objectId);
    console.log(`Has ${children.length} children`);
}
```

---

## Hierarchy Updates

### When Hierarchy Changes

**Triggers**:
1. Object added to container (drag & drop)
2. Object removed from container
3. Container deleted (cascade to children)
4. Object moved between containers
5. Container nested inside another container

**Events Emitted**:
```javascript
// ObjectEventBus
objectEventBus.emit(EVENT_TYPES.HIERARCHY_CHANGED, {
    objectId: 123,
    newParentId: 456,
    changeType: 'parent-changed'
});
```

**Listeners**:
- ObjectStateManager → Rebuilds hierarchy array
- PropertyPanelSync → Sends to UI
- ObjectList panel → Updates tree view

---

### Hierarchy Rebuild

**When**: After any hierarchy change

**Code** (`core/object-state-manager.js:615`):
```javascript
rebuildHierarchy() {
    const objects = Array.from(this.objects.values());

    // Calculate depth for each object
    const objectsWithDepth = objects.map(obj => ({
        ...obj,
        depth: this.calculateObjectDepth(obj.id)
    }));

    // Sort by hierarchy (parents before children, same-level by ID)
    objectsWithDepth.sort((a, b) => {
        if (a.depth !== b.depth) return a.depth - b.depth;
        return a.id - b.id;
    });

    this.hierarchy = objectsWithDepth;
}
```

---

## UI Integration

### ObjectList Panel

**Displays**: Tree view of hierarchy with indentation

**Example**:
```
📦 Container 001
  └─ 🟦 Box 001
  └─ 🟦 Box 002
  └─ 📦 Container 002
      └─ 🟦 Box 003
🟦 Box 004 (root level)
```

**Code** (`svelte-ui/ObjectList.svelte`):
```svelte
{#each hierarchy as obj}
    <div style="padding-left: {obj.depth * 20}px">
        {obj.isContainer ? '📦' : '🟦'} {obj.name}
    </div>
{/each}
```

---

### Selection Behavior

**Container-First Selection**:
- Click child → selects parent container
- Double-click child → selects child directly
- Escape → navigate up hierarchy

**Code**: `interaction/selection-controller.js`

---

## Performance Considerations

### Hierarchy Depth

**Current**: No depth limit (can nest infinitely)

**Performance Impact**:
- World position calculation: O(depth)
- Layout propagation: O(depth)
- Recommended max depth: 10 levels

### Hierarchy Size

**Flat hierarchy** (ObjectStateManager):
- Rebuilt on every hierarchy change
- O(n) objects to rebuild
- Sorted by depth: O(n log n)

**Optimization**: Use incremental updates instead of full rebuild

---

### Layout Propagation

**BOTTOM-UP**: Child changes trigger parent layout

**Example**:
```
Box 002 dimensions change
  → Container 001 layout recalculates
  → Container 001 resizes to fit children
  → Container 001 parent layout recalculates (if nested)
  → ... propagates up to root
```

**Performance**: Batched in requestAnimationFrame

**Code**: `core/object-state-manager.js:717` - `scheduleParentLayoutUpdate()`

---

## Common Patterns

### Creating Nested Structure

```javascript
// Create parent container
const containerId = sceneController.addObject(
    containerGeometry,
    containerMaterial,
    { isContainer: true, name: "Container 001" }
);

// Create child objects
const box1 = sceneController.addObject(
    boxGeometry,
    material,
    { name: "Box 001" }
);

const box2 = sceneController.addObject(
    boxGeometry,
    material,
    { name: "Box 002" }
);

// Add children to container
sceneController.setParent(box1, containerId);
sceneController.setParent(box2, containerId);
```

---

### Moving Object Between Containers

```javascript
// Move Box 001 from Container A to Container B
sceneController.setParent(box1Id, containerBId);

// Position is automatically converted:
// 1. Get world position in Container A
// 2. Convert to local position in Container B
// 3. Update Box 001 position
```

---

### Removing from Container (Move to Root)

```javascript
// Move Box 001 to root level (remove from container)
sceneController.setParent(box1Id, null);
```

---

## Debugging

### Visualize Hierarchy

```javascript
// Print hierarchy tree
function printHierarchy(objectId = null, depth = 0) {
    const objects = objectId === null ?
        sceneController.objects.values() :
        sceneController.getChildObjects(objectId);

    for (const obj of objects) {
        if (obj.parentContainer === objectId) {
            console.log('  '.repeat(depth) + obj.name);
            if (obj.isContainer) {
                printHierarchy(obj.id, depth + 1);
            }
        }
    }
}

printHierarchy(); // Print entire tree
```

---

### Check Coordinate Spaces

```javascript
const obj = sceneController.getObject(objectId);
const mesh = obj.mesh;

console.log('Local position:', mesh.position); // Relative to parent
console.log('World position:', mesh.getWorldPosition(new THREE.Vector3())); // Absolute

if (obj.parentContainer) {
    const parent = sceneController.getObject(obj.parentContainer);
    console.log('Parent position:', parent.mesh.position);
}
```

---

### Validate Hierarchy

```javascript
// Check for orphaned objects
for (const obj of sceneController.objects.values()) {
    if (obj.parentContainer) {
        const parent = sceneController.getObject(obj.parentContainer);
        if (!parent) {
            console.error('Orphaned object:', obj.name, obj.id);
        }
    }
}

// Check for circular references
function hasCircularReference(objectId, visited = new Set()) {
    if (visited.has(objectId)) {
        return true; // Circular reference found
    }
    visited.add(objectId);

    const obj = sceneController.getObject(objectId);
    if (obj?.parentContainer) {
        return hasCircularReference(obj.parentContainer, visited);
    }

    return false;
}
```

---

## Related Documentation

- [Auto-Layout System](auto-layout-system.md) - Container auto-layout mechanics
- [Data Flow Architecture](data-flow-architecture.md) - State management flow
- [Container System](../systems/containers.md) - Container features overview

---

## Revision History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2025-01-30 | Initial documentation after foundation audit |
