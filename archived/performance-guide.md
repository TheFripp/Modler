# Performance & Debugging Guide

## Performance Principles

### Render Optimization
- **Use render order** instead of complex depth testing
- **Minimize geometry updates** - cache when possible  
- **Batch mesh synchronization** via MeshSynchronizer
- **Dispose geometry/materials** when removing objects

### Memory Management
- **Dispose old geometries** when updating container bounds
- **Unregister mesh relationships** when removing objects
- **Clean up event listeners** when destroying components
- **Avoid memory leaks** in container visibility operations

## Common Performance Issues

### Frame Rate Drops
**Possible Causes**:
- Too many visible wireframes
- Complex geometry calculations  
- Frequent container resizing
- Excessive mesh synchronization

**Solutions**:
- Use `renderOrder` for wireframes instead of depth testing
- Cache bounds calculations where possible
- Debounce container resize operations
- Batch mesh sync operations

### Memory Leaks
**Possible Causes**:
- Geometry not disposed when updating containers
- Mesh relationships not unregistered
- Event listeners not cleaned up
- References held to removed objects

**Solutions**:
- Always call `geometry.dispose()` and `material.dispose()`
- Use `meshSynchronizer.unregisterRelatedMesh()` when removing
- Clean up tool state when switching tools
- Clear object references in cleanup methods

## Debugging Strategies

### Selection Issues
1. **Check browser console** for selection-related errors
2. **Add temporary logging** to BaseSelectionBehavior methods
3. **Verify object metadata** with `sceneController.getObjectByMesh()`
4. **Test double-click detection** timing and event flow

### Container Problems
1. **Check container bounds calculation** with debug logging  
2. **Verify Three.js hierarchy** matches metadata relationships
3. **Test wireframe visibility** at different camera angles
4. **Validate collision mesh positioning**

### Tool Coordination Issues  
1. **Check InputHandler event flow** and tool delegation
2. **Verify tool switching** and state cleanup
3. **Test modifier key handling** for multi-select
4. **Validate hover/click event timing**

## Development Tools

### Browser Developer Tools
- **Console**: Check for JavaScript errors and warnings
- **Performance Tab**: Profile frame rate and memory usage
- **Elements Tab**: Inspect Three.js scene graph structure
- **Network Tab**: Monitor resource loading

### Three.js Debug Helpers
```javascript
// Add wireframe to see geometry bounds
material.wireframe = true;

// Log object world position
console.log(object.getWorldPosition(new THREE.Vector3()));

// Check scene graph structure  
scene.traverse(child => console.log(child.name, child.type));
```

### Custom Debug Logging
```javascript
// Selection debugging
console.log('Selected objects:', Array.from(selectionController.selectedObjects));

// Container hierarchy debugging
console.log('Container children:', sceneController.getChildObjects(containerId));

// Mesh synchronization debugging  
console.log('Registered relationships:', meshSynchronizer.relationships.size);
```

## Optimization Techniques

### Render Order Usage
```javascript
// Instead of complex depth testing
edgeContainer.renderOrder = 999; // Render after solids

// Instead of disabling depth test
material.depthTest = true; // Keep depth test enabled
```

### Geometry Caching
```javascript
// Cache expensive calculations
if (!this.boundsCache || this.needsRecalculation) {
    this.boundsCache = LayoutGeometry.calculateSelectionBounds(objects);
    this.needsRecalculation = false;
}
```

### Batch Operations
```javascript
// Batch multiple mesh syncs
objects.forEach(obj => {
    // Do multiple updates
    updatePosition(obj);
    updateRotation(obj);
    updateScale(obj);
});

// Single sync call at end
meshSynchronizer.syncAllRelatedMeshes(obj, 'transform');
```

## Performance Monitoring

### Frame Rate Monitoring
```javascript
// Simple FPS counter
let lastTime = performance.now();
let frameCount = 0;

function animate() {
    const currentTime = performance.now();
    frameCount++;
    
    if (currentTime - lastTime >= 1000) {
        console.log('FPS:', frameCount);
        frameCount = 0;
        lastTime = currentTime;
    }
    
    requestAnimationFrame(animate);
}
```

### Memory Usage Tracking
```javascript
// Monitor memory usage
console.log('Memory:', performance.memory);

// Track object counts
console.log('Scene children:', scene.children.length);
console.log('Selected objects:', selectionController.selectedObjects.size);
```

## Files to Reference
- `interaction/mesh-synchronizer.js` - Centralized mesh coordination
- `application/tools/layout-geometry.js` - Geometry creation and disposal
- `interaction/container-visibility-manager.js` - Debouncing patterns
- Browser developer tools documentation