# Camera & Raycasting Architecture Guide

## Purpose
This guide documents the camera control and raycasting system to prevent common issues like camera orbit blocking and selection conflicts.

## Critical Requirements

### **Ground Plane Size Consistency** ⚠️
**RULE**: Ground plane and grid helper MUST be the same size.

```javascript
// ✅ CORRECT - Consistent sizing
const gridHelper = new THREE.GridHelper(20, 20, 0x444444, 0x222222);
const planeGeometry = new THREE.PlaneGeometry(20, 20);  // Same size!

// ❌ INCORRECT - Size mismatch causes camera blocking
const gridHelper = new THREE.GridHelper(20, 20, 0x444444, 0x222222);
const planeGeometry = new THREE.PlaneGeometry(10, 10);  // Creates dead zones!
```

**Why This Matters:**
- Grid shows 20x20 units, users expect camera orbit everywhere
- Smaller ground plane creates "dead zones" where only invisible objects can be hit
- Results in camera orbit stopping working in grid corners

**Location**: `/foundation/scene-foundation.js` and `/v2-main.js`

### **Invisible Object Raycasting** 🚫
**RULE**: Invisible containers MUST be filtered from raycasting.

```javascript
// ✅ CORRECT - Filter invisible containers
filterRaycastTargets(objects) {
    return objects.filter(object => {
        const objectData = sceneController.getObjectByMesh(object);
        // Skip invisible containers to prevent camera blocking
        return !(objectData?.isContainer && !object.visible);
    });
}

// ❌ INCORRECT - Using raycast = () => {} (doesn't work)
edgeContainer.raycast = () => {}; // Still gets hit by intersectObjects!
```

**Why This Matters:**
- `intersectObjects()` bypasses custom `raycast` functions
- Invisible containers can block camera orbit
- Must filter at the input level, not object level

## Architecture Overview

### **Component Responsibilities**

```
┌─────────────────────────────────────┐
│         INPUT FOUNDATION            │
│  • Raw raycasting with filtering    │ ← Filters invisible containers
│  • Mouse/keyboard event capture     │
│  • Camera-safe intersection logic   │
└─────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────┐
│          INPUT HANDLER              │
│  • Hit object classification        │ ← Decides: camera or selection
│  • Tool coordination               │
│  • Camera vs selection logic       │
└─────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────┐
│        CAMERA CONTROLLER            │
│  • Orbit/pan/zoom mechanics        │ ← Pure camera movements
│  • No input event handling         │
│  • Coordinated through InputHandler│
└─────────────────────────────────────┘
```

### **Left Mouse Button Coordination**
The key to preventing camera/selection conflicts:

```javascript
// InputHandler.onMouseDown logic
if (hit && hit.object) {
    const objectData = sceneController.getObjectByMesh(hit.object);
    
    if (objectData?.selectable) {
        // Hit selectable object → defer to mouse up for selection
        this.lastMouseDownEvent = { hit, event, time: Date.now() };
        return;
    } else {
        // Hit non-selectable (grid, invisible) → start camera orbit
        this.startCameraOrbit(event, hit);
        return;
    }
} else {
    // No hit → start camera orbit
    this.startCameraOrbit(event, hit);
}
```

## Common Issues & Solutions

### **Issue 1: Camera Orbit Stops Working After Container Creation**

**Symptoms:**
- Camera works initially
- After creating containers with Command+F, orbit stops in certain areas
- Works fine when clicking outside the grid

**Root Cause:**
- Ground plane too small (10x10) vs grid helper (20x20)
- Invisible containers not filtered from raycasting

**Solution:**
```javascript
// 1. Fix ground plane size
const planeGeometry = new THREE.PlaneGeometry(20, 20); // Match grid size

// 2. Add raycast filtering
const raycastTargets = this.filterRaycastTargets(this.scene.children);
const intersects = this.raycaster.intersectObjects(raycastTargets, true);
```

### **Issue 2: Selection Conflicts with Camera**

**Symptoms:**
- Camera starts orbiting when clicking objects
- Objects don't get selected properly
- Inconsistent behavior between tools

**Root Cause:**
- Multiple components handling left mouse button
- No coordination between camera and selection

**Solution:**
```javascript
// Centralized coordination in InputHandler
// Camera only starts when NO selectable object is hit
if (hit && isSelectable(hit.object)) {
    handleSelection(hit);  // Selection takes priority
} else {
    startCameraOrbit();    // Camera as fallback
}
```

### **Issue 3: Containers Block Camera When Invisible**

**Symptoms:**
- Camera orbit works initially
- After container creation, certain areas become unresponsive
- Problem persists until containers are deleted

**Root Cause:**
- Invisible containers still participate in raycasting
- `object.raycast = () => {}` doesn't prevent `intersectObjects()` hits

**Solution:**
```javascript
// Proper filtering in InputFoundation
filterRaycastTargets(objects) {
    return objects.filter(object => {
        const sceneController = window.modlerComponents?.sceneController;
        const objectData = sceneController?.getObjectByMesh(object);
        
        // Exclude invisible containers entirely
        if (objectData?.isContainer && !object.visible) {
            return false;
        }
        return true;
    });
}
```

## Implementation Checklist

### **When Adding New Scene Objects:**
- [ ] Verify ground plane covers full interaction area
- [ ] Set `selectable: false` for non-interactive objects (grids, guides)
- [ ] Add proper filtering for invisible/non-interactive objects

### **When Creating Container Systems:**
- [ ] Use `visible: false` for invisible containers
- [ ] Filter invisible containers from raycasting at input level
- [ ] Don't rely on `object.raycast = () => {}` alone

### **When Adding Camera Controls:**
- [ ] Coordinate through InputHandler, not direct event handling
- [ ] Ensure camera only activates when no selectable objects are hit
- [ ] Test camera orbit across full ground plane area

### **When Debugging Camera Issues:**
- [ ] Check ground plane vs grid helper size consistency
- [ ] Verify invisible object filtering in InputFoundation
- [ ] Trace left mouse button coordination through InputHandler
- [ ] Confirm no direct camera event handlers bypass coordination

## File Locations

- **Ground Plane**: `/foundation/scene-foundation.js:78`
- **Grid Helper**: `/v2-main.js:269-276`
- **Raycast Filtering**: `/foundation/input-foundation.js:166-187`
- **Camera Coordination**: `/interaction/input-handler.js:110-135`
- **Container Filtering**: `/interaction/selection-controller.js:210-217`

## Performance Notes

- Raycast filtering adds minimal overhead (~1-5ms per raycast)
- Ground plane size increase has no performance impact
- Invisible container filtering prevents unnecessary raycasting

---

**Last Updated**: January 2025  
**Version**: 1.0  
**Related**: CONTAINER_ARCHITECTURE_GUIDE.md, SELECTION_SYSTEM_GUIDE.md