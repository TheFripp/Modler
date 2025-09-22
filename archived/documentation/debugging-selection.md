# Debugging Selection Issues

## Overview
Selection system debugging requires understanding the multi-layered pipeline and complex object relationships. This guide provides systematic approaches to diagnose and resolve selection-related issues.

## 🔍 Diagnostic Decision Tree

### Selection Not Working
```
User clicks object, no selection occurs

1. Check Console Output
   ├─ No BaseSelectionBehavior logs?
   │  └─ Issue: Event not reaching selection pipeline
   │     └─ Check: InputFoundation raycasting
   ├─ "Object not selectable" message?
   │  └─ Issue: Object fails selectability check  
   │     └─ Check: SceneController.getObjectByMesh()
   └─ "Passing to HierarchicalSelectionManager"?
      └─ Issue: Hierarchical selection logic
         └─ Check: Parent container detection
```

### Container Children Not Selectable
```
Click on child object, parent container not selected

1. Check Object Properties  
   ├─ Has temporarySceneChild: true?
   │  ├─ YES: Check originalParentContainerId
   │  └─ NO: Check objectData.parentContainer
   ├─ Parent container found in SceneController?
   │  ├─ YES: Check container mesh visibility
   │  └─ NO: Container metadata missing
   └─ Container selection attempted?
      ├─ YES: Check debouncing messages
      └─ NO: Hierarchical logic failed
```

### Selection Desynchronization  
```
Object list shows selection, scene doesn't (or vice versa)

1. Check Container State
   ├─ Debouncing messages in console?
   │  └─ YES: Operations blocked, state out of sync
   ├─ Container show/hide operations successful?
   │  └─ NO: Check return values from visibility manager
   └─ UI update conditions met?
      └─ NO: SelectionController not updating visual state
```

## 🛠️ Debugging Tools & Techniques

### 1. Console Output Analysis

#### BaseSelectionBehavior Debug Pattern:
```
BaseSelectionBehavior.handleObjectClick: {
    objectName: "Test Cube",
    isTemporary: undefined,     ← Should be true for container children
    originalContainer: undefined, ← Should contain container ID
    hasParent: true,
    parentName: ""             ← Empty suggests unnamed objects
}
```

**Red Flags**:
- `objectName: ""` → Hitting unnamed objects (collision meshes, wireframes)
- `isTemporary: undefined` → Missing temporary scene child markers
- `originalContainer: undefined` → Parent container relationship lost

#### HierarchicalSelectionManager Debug Pattern:
```
HierarchicalSelectionManager: No parent container found for {
    childName: "Test Cube",
    hasTemporaryFlag: false,      ← Should be true
    originalContainerId: undefined, ← Should contain ID
    hasMetadataParent: false      ← Check SceneController relationship
}
```

**Red Flags**:
- `hasTemporaryFlag: false` → Object not properly marked as temporary
- `originalContainerId: undefined` → Container relationship missing
- `hasMetadataParent: false` → SceneController metadata corrupted

#### ContainerVisibilityManager Debug Pattern:
```
📦 Moving 2 children to scene root for container 5
Container 5 wireframe hidden, children moved to scene root
ContainerVisibilityManager: Debouncing show for container 5  ← BLOCKED!
📦 Container "..." shown  ← SelectionController thinks it succeeded
```

**Red Flags**:
- `Debouncing` messages → Operations being blocked
- Missing `Moved child ... back to container` → Show operation not completing

### 2. Browser Developer Tools

#### Inspect Object Properties:
```javascript
// In browser console, select object and inspect:
window.selectedObject = object; // Set during debugging
console.log({
    name: selectedObject.name,
    userData: selectedObject.userData,
    parent: selectedObject.parent?.name,
    position: selectedObject.position,
    worldPosition: selectedObject.getWorldPosition(new THREE.Vector3())
});
```

#### Check SceneController State:
```javascript  
// Get object metadata
const sceneController = window.modlerComponents.sceneController;
const objectData = sceneController.getObjectByMesh(selectedObject);
console.log('Object Data:', objectData);

// Check container relationships
console.log('All Objects:', Array.from(sceneController.objects.values()));
```

#### Verify Selection State:
```javascript
// Check SelectionController state
const selectionController = window.modlerComponents.selectionController;
console.log('Selected Objects:', Array.from(selectionController.selectedObjects));
console.log('Edge Highlights:', selectionController.edgeHighlights);
```

### 3. Raycasting Analysis

#### Check Hit Detection:
```javascript
// In InputFoundation or tools, log raycast results:
console.log('Raycast Hit:', {
    object: hit.object,
    objectName: hit.object.name,
    objectType: hit.object.type,
    distance: hit.distance,
    point: hit.point,
    userData: hit.object.userData
});
```

**Common Issues**:
- Hitting visual feedback objects (edge highlights, face highlights)
- Hitting collision meshes instead of actual objects
- Hitting objects behind intended target

## 🎯 Common Issue Patterns

### Issue: "Clicking Does Nothing"

**Symptoms**: No console output, no selection changes
**Root Cause**: Event not reaching selection pipeline
**Investigation**:
1. Check InputFoundation raycasting hits
2. Verify InputHandler event delegation
3. Confirm tool is active and receiving events

**Solution**: Fix event pipeline from mouse → tools → selection

### Issue: "Object Not Selectable"  

**Symptoms**: `BaseSelectionBehavior: Object not selectable`
**Root Cause**: Object fails selectability validation  
**Investigation**:
```javascript
// Check object in SceneController
const objectData = sceneController.getObjectByMesh(clickedObject);
console.log('Found object data:', !!objectData);
console.log('Object selectable:', objectData?.selectable);
```

**Common Causes**:
- Object not registered in SceneController
- `selectable: false` in object metadata
- Clicking visual feedback objects (non-selectable)

### Issue: "Hitting Wrong Objects"

**Symptoms**: Unexpected object names in console, selection of visual elements
**Root Cause**: Raycasting hitting unintended objects
**Investigation**:
```javascript
// Check what's in front of intended target
const hits = raycaster.intersectObjects(scene.children, true);
hits.slice(0, 5).forEach((hit, i) => {
    console.log(`Hit ${i}:`, hit.object.name, hit.object.type, hit.distance);
});
```

**Common Causes**:
- Edge highlights not properly disabled (`raycast: () => {}`)
- Face highlights blocking target objects
- Container collision meshes enabled when they should be disabled

### Issue: "Container Children Not Working"

**Symptoms**: Click on child, parent container not selected
**Root Cause**: Hierarchical selection logic failing
**Investigation**:
```javascript
// Check child object temporary markers
console.log('Temporary child?', object.userData.temporarySceneChild);
console.log('Original container:', object.userData.originalParentContainerId);

// Check parent container lookup
const containerId = object.userData.originalParentContainerId;
const containerData = sceneController.getObject(containerId);
console.log('Container found:', !!containerData);
console.log('Container mesh:', !!containerData?.mesh);
```

**Common Fixes**:
- Ensure temporary markers set during container hide
- Verify parent container exists in SceneController
- Check container mesh visibility state

### Issue: "Position Drift"

**Symptoms**: Objects move when containers shown/hidden
**Root Cause**: Incorrect coordinate transformation
**Investigation**:
```javascript
// Before operation - store positions
const beforeWorld = object.getWorldPosition(new THREE.Vector3());
const beforeLocal = object.position.clone();

// After operation - compare positions  
const afterWorld = object.getWorldPosition(new THREE.Vector3());
const afterLocal = object.position.clone();

console.log('World position changed:', !beforeWorld.equals(afterWorld));
console.log('Local position changed:', !beforeLocal.equals(afterLocal));
```

**Common Fixes**:
- Store world coordinates, not local coordinates
- Recalculate local position based on current container transform
- Verify matrix transformation accuracy

## 🚨 Emergency Debugging Techniques

### Add Temporary Debug Logging

```javascript
// In BaseSelectionBehavior.handleObjectClick:
console.log('🔍 SELECTION DEBUG:', {
    objectName: object.name || 'UNNAMED',
    objectId: object.userData?.id,
    isSelectable: this.isSelectableObject(object),
    objectType: object.type,
    geometryType: object.geometry?.type,
    parentName: object.parent?.name,
    isTemporary: object.userData?.temporarySceneChild,
    originalContainer: object.userData?.originalParentContainerId
});
```

### Force Selection for Testing
```javascript
// Bypass normal selection pipeline for testing
const sceneController = window.modlerComponents.sceneController;
const selectionController = window.modlerComponents.selectionController;

// Force select object by ID
const objectData = sceneController.getObject(targetId);
if (objectData?.mesh) {
    selectionController.select(objectData.mesh);
    console.log('Force selected:', objectData.name);
}
```

### Reset Container State
```javascript
// Emergency container state reset
const visibilityManager = window.modlerComponents.containerVisibilityManager;
const containerId = 5; // Replace with actual container ID

// Clear debouncing
visibilityManager.pendingOperations.delete(containerId);

// Force show container
const containerData = sceneController.getObject(containerId);
if (containerData?.mesh) {
    visibilityManager.showContainer(containerId, containerData.mesh);
}
```

## 📋 Debugging Checklist

### Before Investigating
- [ ] Clear browser console for clean output
- [ ] Note exact user interaction that causes issue
- [ ] Identify whether issue is consistent or intermittent
- [ ] Check if issue occurs in all tools or specific tools

### During Investigation  
- [ ] Check console output for selection pipeline messages
- [ ] Verify object properties and userData
- [ ] Inspect raycast hit results and object hierarchy
- [ ] Test with simplified interactions (single clicks, no rapid clicking)
- [ ] Compare working vs non-working scenarios

### After Fixing
- [ ] Test fix with original reproduction steps
- [ ] Verify no new issues introduced
- [ ] Test with rapid clicking and edge cases
- [ ] Confirm object list and scene selection stay synchronized
- [ ] Update relevant documentation if new patterns discovered

## 🎯 Prevention Strategies

### Code Practices
- Always check operation return values
- Use explicit success/failure returns from state operations
- Add validation for critical object properties
- Include debugging output for complex state transitions

### Testing Approaches
- Test container operations with rapid interactions
- Verify coordinate transformations with extreme positions
- Check selection synchronization across different tools
- Test with multiple containers and nested relationships

### Monitoring
- Log selection state changes at critical points
- Monitor for unusual object names or empty names
- Watch for excessive debouncing messages
- Track selection/deselection frequency and patterns

---

*This debugging guide should be updated as new selection issues are discovered and resolved.*