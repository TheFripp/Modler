# Container Architecture Fixes and Improvements

## Overview
This document outlines the major architectural fixes implemented to resolve green triangle artifacts and establish a clean, unified container visualization system.

## Issues Resolved

### 1. Green Triangle Artifacts
**Problem**: Green triangular faces were appearing when containers were created or resized.

**Root Causes**:
- Main container mesh was being made visible with green wireframe material during resize operations
- Legacy face highlight meshes were attached to containers and becoming visible
- Container geometry was being replaced with wireframe geometry during updates

**Solutions**:
- **Material-based invisibility**: Set `wireframe: false` on main container material
- **Cleanup legacy support meshes**: Remove old face highlight meshes from existing containers
- **Fixed resize geometry updates**: Update wireframe child instead of main mesh during resize

### 2. Container Face Highlighting
**Problem**: Selected containers didn't show face highlights when hovered, making tool interaction difficult.

**Root Cause**: Containers had empty support meshes (no `faceHighlight` property).

**Solution**: Added minimal face highlight support mesh to containers while maintaining clean architecture.

### 3. Tool-Specific Hug Mode Behavior
**Problem**: Move tool was blocked from showing face highlights on containers in hug mode.

**Root Cause**: Hug mode check was applied to all tools indiscriminately.

**Solution**: Made hug mode check tool-specific - only applies to push tool, not move tool.

## Architectural Changes

### New Solid-First Container Architecture

**Before** (Wireframe-First):
```
Container = LineSegments (EdgesGeometry) + Interactive Mesh
```

**After** (Solid-First):
```
Container = Mesh (BoxGeometry, invisible)
  ├── Wireframe Child (LineSegments, green, hidden by default)
  └── Face Highlight Child (Mesh, orange, hidden by default)
```

### Key Benefits

1. **Visual Consistency**: Containers behave like regular objects with solid geometry
2. **Clean Raycasting**: Main mesh provides reliable face detection for tools
3. **Proper Parenting**: Child objects attach to solid mesh, maintain visibility
4. **No Green Triangles**: Material-based invisibility prevents visual artifacts
5. **Tool Compatibility**: Face highlights work with move tool, blocked for push tool in hug mode

## Implementation Details

### File Changes

#### `application/tools/layout-geometry.js`
- **`createContainerGeometry()`**: Implements solid-first architecture
- **`updateContainerGeometry()`**: Updates wireframe child instead of main mesh
- **Material properties**: `wireframe: false`, `colorWrite: false`, `depthWrite: false`

#### `interaction/support-mesh-factory.js`
- **Container support meshes**: Only creates face highlights for containers
- **Legacy cleanup**: Removes old support meshes from existing containers
- **Architecture separation**: Containers skip wireframes and interactive meshes

#### `application/tools/base-face-tool-behavior.js`
- **Tool-specific behavior**: Added `toolType` parameter to constructor
- **Hug mode check**: Only applies to push tool (`this.toolType === 'push'`)

#### `scene/scene-controller.js`
- **Support mesh creation**: Skips support meshes for containers in `addObject()`
- **Migration logic**: Skips containers to prevent dual architecture conflicts

### Configuration

```javascript
// Main container material (invisible)
const mainMaterial = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0.0,
    colorWrite: false,
    depthWrite: false,
    wireframe: false  // CRITICAL: Prevents triangle edges
});

// Container support meshes (minimal)
const supportMeshes = {
    faceHighlight: this.createFaceHighlight(mainMesh) // Orange selection color
    // No wireframes or interactive meshes - those come from LayoutGeometry
};
```

## Testing Verification

### Green Triangle Elimination
- ✅ Container creation: No green triangles on creation
- ✅ Container resize: No green triangles during automatic resize
- ✅ Container selection: Only clean green wireframe outline
- ✅ Child object visibility: Objects inside containers remain visible

### Face Highlighting
- ✅ Move tool + hug mode: Shows orange face highlights
- ✅ Push tool + hug mode: No face highlights (correct)
- ✅ Move tool + layout mode: Shows orange face highlights
- ✅ Push tool + layout mode: Shows orange face highlights

### Architecture Compliance
- ✅ Containers use solid-first architecture consistently
- ✅ No dual architecture conflicts
- ✅ Legacy support meshes cleaned up
- ✅ Tool-specific behavior preserved

## Future Considerations

### Remaining Issues to Address
1. **Child object interference**: When hovering child objects, container face highlights are blocked
2. **Face highlight flickering**: Minor visual flickering when face highlights appear

### Architectural Principles Established
1. **Containers**: Solid BoxGeometry main mesh + wireframe/face highlight children
2. **Regular objects**: Continue using support mesh factory architecture
3. **Tool behavior**: Use tool-specific parameters for different interaction patterns
4. **Material invisibility**: Prefer material properties over mesh visibility for complex hierarchies

## Performance Impact

- **Memory**: Slight increase due to face highlight meshes for containers
- **Rendering**: No impact - invisible meshes don't render
- **Raycasting**: Improved reliability with solid geometry
- **Updates**: More efficient - only update children during resize

## Compatibility

- **Existing containers**: Automatically migrated to new architecture
- **Tool behavior**: Preserved existing functionality with improved reliability
- **Selection system**: No changes to selection logic
- **Property panel**: No changes to container property management