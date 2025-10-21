# Raycasting and Selection Bug Fixes - January 2025

**Date**: January 20, 2025
**Type**: Bug Fix
**Severity**: High
**Status**: ✅ Resolved

---

## Issues Fixed

### 1. Floor Grid Click Stealing
**Symptom**: Clicking anywhere in the scene (empty space, floor) would select objects or show inconsistent behavior.

**Root Cause**:
- Floor grid had a large invisible collision plane (50x50, opacity: 0.0) at y=-1.0
- Grid lines and plane were raycastable, intercepting clicks intended for empty space
- When clicked, the floor grid Group was resolved by `resolveMainObjectFromHit()` and treated as a selectable object

**Fix**:
- Made floor plane non-raycastable: `floorPlane.raycast = () => {}`
- Made grid helper and all children non-raycastable recursively
- Made floor group itself non-raycastable
- **File**: `v2-main.js` lines 625-638

**Result**: Clicking floor/empty space now properly triggers deselection behavior.

---

### 2. Inconsistent Object Selection
**Symptom**:
- Sometimes clicking objects would select them
- Sometimes only UI panels would update (no 3D wireframe)
- Sometimes nothing would happen

**Root Cause**:
- Raycaster was hitting support meshes (wireframes, face highlights) that weren't properly resolved to parent objects
- `resolveMainObjectFromHit()` would return support meshes without proper objectData
- These orphaned meshes would be skipped, causing selection to fail

**Fix**:
- Added defensive null checks in raycaster (lines 287, 328, 336 in `input-controller.js`)
- Added warning logging for objects without objectData to help debug future issues
- Added fallback for regular selectable objects in container-selected raycast path

**Result**: Object selection now works consistently from all camera angles.

---

### 3. Container-Selected Raycast Path Missing Fallback
**Symptom**: When a container was selected, clicking on regular standalone objects (not children, not containers) would not select them.

**Root Cause**:
- Layer 0 fallback raycast path (lines 283-328) only handled:
  - Objects with parent containers (returns parent)
  - Selected containers themselves (returns container)
- Missing case: Regular selectable objects with no parent container

**Fix**:
- Added fallback case for regular selectable objects (lines 329-336 in `input-controller.js`)
- Checks: `selectable === true && !parentContainer && !isContainer`

**Result**: Can now select standalone objects even when a container is selected.

---

### 4. Source Parameter Type Validation
**Symptom**: Event validation errors showing `source` field had type `object` instead of `string`.

**Root Cause**:
- `ObjectStateManager.updateObject()` accepts either string or options object for third parameter
- If wrong type passed (e.g., Window object), it would be used directly

**Fix**:
- Added type validation in `ObjectStateManager.updateObject()` (lines 430-434)
- Validates `source` is string, logs warning if not, defaults to 'input'

**Result**: Prevents invalid source types from causing event validation errors.

---

## Files Modified

### Core Files
1. **v2-main.js** (lines 625-638)
   - Floor grid raycasting disabled recursively

2. **interaction/input-controller.js** (lines 265-360)
   - Added null checks for mainObject resolution
   - Added warning logging for orphaned meshes
   - Added fallback for standalone selectable objects

3. **core/object-state-manager.js** (lines 430-434)
   - Added source parameter type validation

4. **interaction/selection-controller.js**
   - Removed temporary debug logging (already had correct behavior)

---

## Testing Performed

### Test Cases
1. ✅ Click empty space → deselects any selected objects
2. ✅ Click floor grid → treated as empty space, deselects
3. ✅ Click object from above → selects object, shows wireframe
4. ✅ Click object from side → selects object, shows wireframe
5. ✅ Click object with container selected → selects object properly
6. ✅ Multiple clicks on same object → consistent behavior
7. ✅ Position drag arrows → no source validation errors

### Edge Cases Handled
- Support meshes hit by raycaster → skipped with warning
- Floor grid children hit → non-raycastable
- Orphaned meshes without objectData → skipped with warning
- Invalid source types → validated and defaulted

---

## Architecture Improvements

### Defensive Programming
- Added null checks before dereferencing objects
- Added type validation for critical parameters
- Added warning logs to help identify future issues
- Skip invalid objects instead of crashing

### Raycasting Hierarchy
```
Raycaster Hit Priority:
1. Main object mesh (BoxGeometry, etc.)
2. Support meshes (wireframes, face highlights) → resolve to parent
3. Container interactive meshes → resolve to container
4. Orphaned/invalid meshes → skip with warning
5. Non-raycastable meshes (floor grid) → not hit
```

### Selection Flow
```
Click → Raycast → Hit Analysis:
├─ No hit → handleEmptySpaceClick() → clearSelection()
├─ Hit floor grid → non-raycastable (not hit)
├─ Hit support mesh → resolve to parent → check selectable
│   ├─ selectable: true → select object
│   └─ selectable: false → handleEmptySpaceClick()
└─ Hit main object → check selectable
    ├─ selectable: true → select object
    └─ selectable: false → handleEmptySpaceClick()
```

---

## Lessons Learned

### 1. Raycasting Requires Explicit Control
- Invisible collision objects must be made non-raycastable
- Can't rely on `selectable: false` alone - raycaster hits everything by default
- Use `mesh.raycast = () => {}` to disable raycasting on specific objects

### 2. Support Mesh Resolution Must Be Robust
- Always walk up parent hierarchy to find main object
- Validate resolved object has proper objectData
- Log warnings for debugging when resolution fails

### 3. Layer-Based Raycasting Needs All Cases
- Container-selected path (Layer 1 + Layer 0 fallback)
- Normal path (Layer 0)
- Must handle: children, containers, AND standalone objects

### 4. Event Validation Helps Catch Issues Early
- ObjectEventBus validation caught source type issue
- Defensive type checking prevents downstream errors
- Log warnings instead of failing silently

---

## Future Improvements

### Potential Enhancements
1. **Raycaster Optimization**: Cache layer configurations to avoid redundant sets
2. **Better Error Recovery**: If visualization fails, retry or notify user
3. **Support Mesh Tagging**: Add explicit `isSupportMesh` flag for faster checks
4. **Selection Feedback**: Visual feedback when clicking non-selectable objects

### Known Limitations
1. Floor grid must remain non-raycastable (can't select grid for settings)
2. Support mesh warnings may appear during normal operation (can be filtered)
3. Layer switching performance could be optimized for complex scenes

---

## Related Documentation
- `CLAUDE.md` - Project architecture guidelines
- `memories/architecture-map.md` - System overview
- `documentation/architecture/data-flow-architecture.md` - Event flow

---

**Version**: 2.0.0
**Last Updated**: January 20, 2025
**Contributors**: Claude Code Session (Bug fixes and defensive improvements)
