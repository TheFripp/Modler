# Face Highlighting System Documentation

## Overview
The Modler V2 face highlighting system provides professional CAD-like face highlighting with robust cleanup and whole-face detection. This system highlights complete geometric faces (not individual triangles) and ensures clean state management.

## Core Components

### 1. VisualEffects (scene/visual-effects.js)
**Primary responsibility**: Face geometry detection and highlight rendering

#### Key Features:
- **Coplanar Face Detection**: Groups adjacent triangles sharing the same face normal
- **Whole Face Highlighting**: Creates highlight geometry for complete faces, not individual triangles  
- **Robust Cleanup**: Prevents highlight mesh accumulation with emergency cleanup system
- **Duplicate Prevention**: Avoids creating duplicate highlights on the same face

#### Key Methods:
- `showFaceHighlight(hit)`: Main entry point for showing face highlights
- `createCompleteFaceGeometry(hit)`: Creates geometry for entire face including coplanar triangles
- `findCoplanarFaces(geometry, hitFace, hitFaceIndex)`: Finds all triangles sharing the same normal
- `clearHighlight()`: Robust cleanup with emergency stray mesh removal
- `isHighlighting(object, faceIndex)`: Check if specific object/face is currently highlighted

#### Algorithm Details:
```javascript
// Coplanar face detection algorithm
1. Start with hit triangle face
2. Compare face normals with tolerance (0.01)  
3. Group all triangles with matching normals
4. Create combined geometry from all coplanar triangles
5. Result: Complete face highlighting instead of individual triangles
```

### 2. MoveTool (application/tools/move-tool.js)
**Primary responsibility**: Face-based object movement with highlighting integration

#### Key Features:
- **Selective Highlighting**: Only highlights faces of selected objects
- **Drag State Management**: Disables highlighting during drag operations
- **Clear Triggers**: Automatically clears highlights on tool deactivation and selection changes

#### Key Methods:
- `onHover(hit)`: Shows highlights for selected object faces only
- `onToolDeactivate()`: Clears highlights when tool is switched
- `onSelectionChange(selectedObjects)`: Clears highlights when selection changes
- `startFaceDrag(hit, event)`: Clears highlights when starting drag operation

#### Highlight Rules:
```javascript
// Highlighting logic
- Only highlight faces of SELECTED objects
- Don't highlight during drag operations  
- Clear highlights when mouse leaves face
- Clear highlights on tool switch
- Clear highlights on selection change
```

### 3. InputHandler (interaction/input-handler.js)
**Primary responsibility**: Tool coordination and highlight cleanup on tool switch

#### Key Features:
- **Tool Deactivation Notifications**: Calls `onToolDeactivate()` on tools when switching
- **Highlight Cleanup**: Ensures highlights are cleared on tool changes

### 4. SelectionController (interaction/selection-controller.js)
**Primary responsibility**: Selection change notifications to tools

#### Key Features:
- **Tool Notification**: Notifies current tool about selection changes via `onSelectionChange()`
- **Automatic Cleanup**: Tools can clear highlights when their highlighted objects are deselected

## State Management

### Highlight Lifecycle:
1. **Creation**: Mouse hovers over face of selected object
2. **Validation**: Check if face is different from currently highlighted
3. **Rendering**: Create coplanar face geometry and show highlight
4. **Cleanup**: Clear on mouse leave, tool switch, selection change, or drag start

### Cleanup Triggers:
- **Mouse Leave**: Hover leaves face boundary
- **Tool Switch**: User switches from move tool to select tool  
- **Selection Change**: Selected object is deselected
- **Drag Start**: User starts dragging object
- **Emergency Cleanup**: Removes any stray highlight meshes in scene

## Performance Considerations

### Optimization Features:
- **Geometry Caching**: Face geometry is created once per highlight
- **Duplicate Prevention**: Avoids recreating highlights for same face
- **Efficient Cleanup**: Proper geometry/material disposal prevents memory leaks
- **Lazy Computation**: Coplanar face detection only runs when needed

### Memory Management:
```javascript
// Proper cleanup sequence
1. Remove mesh from scene
2. Dispose geometry
3. Dispose material (if not shared)
4. Clear references
5. Emergency scan for stray meshes
```

## Usage Examples

### Basic Face Highlighting:
```javascript
// In MoveTool.onHover()
if (hit && hit.object && hit.face) {
    if (this.selectionController.isSelected(hit.object)) {
        this.visualEffects.showFaceHighlight(hit);
    }
}
```

### Tool Integration:
```javascript
// Tool deactivation cleanup
onToolDeactivate() {
    this.clearHover();  // Clear any active highlights
    if (this.isDragging) {
        this.onDragEnd(null, null);  // End drag operations
    }
}
```

### Selection Change Handling:
```javascript
// Clear highlights when selection changes
onSelectionChange(selectedObjects) {
    if (this.hoveredObject && !selectedObjects.includes(this.hoveredObject)) {
        this.clearHover();
    }
}
```

## Visual Properties

### Highlight Appearance:
- **Opacity**: 10% (subtle, non-intrusive)
- **Color**: Cyan (#00ffff)
- **Render Order**: 1000 (renders on top)
- **Z-Fighting Prevention**: 0.001 unit offset along face normal
- **Non-Interactive**: Highlights don't interfere with raycasting

### Fade Animation:
- **Fade In**: Smooth transition from 0% to 10% opacity
- **Duration**: Based on frame rate (0.03 opacity increment per frame)
- **Cleanup**: Animation stops on highlight clear

## Error Handling

### Fallback Mechanisms:
- **Single Triangle Fallback**: If coplanar detection fails, show single triangle
- **Geometry Validation**: Validates hit data before processing
- **Exception Handling**: Catches and logs geometry creation errors
- **Emergency Cleanup**: Removes stray highlights if normal cleanup fails

### Debug Information:
- Console warnings for invalid hit data
- Cleanup logging for stray mesh removal
- Face detection logging (can be disabled for production)

## Integration Points

### Required Dependencies:
- Three.js BufferGeometry system
- Raycasting hit data with face information
- Scene graph for mesh management
- Tool system for state coordination

### API Compatibility:
- Compatible with Three.js r128+
- Works with indexed and non-indexed geometries
- Supports standard mesh materials
- Integrates with existing tool architecture

## Future Enhancements

### Potential Improvements:
- **Performance**: Cache coplanar face data per geometry
- **Visual**: Different colors per axis (X=red, Y=green, Z=blue)
- **Precision**: Sub-face highlighting for complex geometries
- **Animation**: More sophisticated highlight animations