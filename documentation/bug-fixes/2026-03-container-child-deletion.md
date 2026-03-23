# Container Child Deletion Fix (March 2026)

## Bug
Objects inside containers could not be deleted. `SceneLifecycleManager.removeObject()` called `this.scene.remove(mesh)`, which only works for direct children of the Three.js scene. But `setParentContainer()` reparents meshes to the container mesh (`parentContainer.mesh.add(childMesh)`), making them children of the container — not the scene. So `scene.remove()` silently did nothing and meshes remained visible.

**Affected**: Any object inside a container — tile instances, layout children, manually placed children.

**Symptom**: Reducing tile repeat count appeared to do nothing. Objects stayed visible even though they were removed from the registry/state.

## Fix
In `scene-lifecycle-manager.js`, changed:
```js
this.scene.remove(objectData.mesh);
```
To:
```js
if (objectData.mesh.parent) {
    objectData.mesh.parent.remove(objectData.mesh);
} else {
    this.scene.remove(objectData.mesh);
}
```

This removes the mesh from its actual Three.js parent (container mesh or scene).

## Related: Tile Repeat Drag Batching
The same investigation also fixed tile repeat drag scrub flooding — each pixel of drag created a full instance creation/destruction cycle with its own undo command. Fixed by adding `_tileRepeatDragState` to `CommandRouter` that captures before-state on first drag event and defers undo command creation until drag ends.
