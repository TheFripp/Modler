# Snap System Documentation

## Overview
Modler V2's snap system provides precise object positioning through intelligent detection of snap points (corners, edges, faces). The system uses screen-space proximity detection with distance-based competition to prioritize the most relevant snap targets.

## Architecture

### Core Components

**SnapController** (`/application/snap-controller.js`)
- Centralized snap detection and coordination
- Manages snap point detection pipeline
- Handles tool-specific snap behaviors
- Provides unified enable/disable control

**SnapVisualizer** (`/scene/snap-visualizer.js`)
- Visual feedback for snap indicators
- 8px corner circles with billboard effect
- Double-thickness edge lines
- Configuration-driven styling

### Key Design Decisions

#### Distance-Based Competition
Snap types compete based on screen-space distance with built-in advantages:
- **Corners**: 30% distance advantage (0.7x multiplier)
- **Edges**: Standard distance
- **Faces**: Disabled (caused precision conflicts)

#### Face Snapping Disabled
Face snapping was disabled because raycasting returns 0.0 distance for mouse intersection points, causing faces to always override more precise corner/edge snaps.

#### Internal Edge Detection
Uses `EdgesGeometry(geometry, 15)` with 15° angle threshold to detect edges between faces (internal edges) rather than boundary edges against empty space.

## Snap Detection Pipeline

### 1. Proximity Testing
- 16px screen-space threshold for easier targeting
- Mouse position converted to world space
- Distance calculated in screen space for consistent UX

### 2. Corner Detection
```javascript
// 8 corners per box using bounding box
const corners = [
    new THREE.Vector3(min.x, min.y, min.z), // -X,-Y,-Z
    new THREE.Vector3(max.x, min.y, min.z), // +X,-Y,-Z
    new THREE.Vector3(min.x, max.y, min.z), // -X,+Y,-Z
    // ... 5 more corners
];
```

### 3. Edge Detection
```javascript
// Internal edges using angle threshold
const edgesGeometry = new THREE.EdgesGeometry(object.geometry, 15);
const positions = edgesGeometry.getAttribute('position');
```

### 4. Distance Competition
```javascript
// Priority system with distance advantage for corners
const adjustedDistance = distance * 0.7; // Corners get 30% advantage
```

## Face-Offset Snapping

### Problem
Objects were snapping their center point to snap targets instead of aligning the dragged face.

### Solution
Store the hit point on the dragged face and calculate offset:

```javascript
// In move tool - store hit point during drag start
this.dragHitPoint = hit.point.clone();

// During snapping - calculate face offset
const faceOffset = faceHitPoint.clone().sub(objectStartPosition);
const targetPosition = snapPoint.worldPos.clone().sub(faceOffset);
```

### Axis-Constrained Snapping
For move tool, snapping only applies along the dominant travel axis:

```javascript
// Only apply snap coordinate that matches travel direction
if (Math.abs(travelAxis.x) > 0.8) {
    // Traveling primarily along X - only snap X coordinate
    targetPosition.y = currentPosition.y;
    targetPosition.z = currentPosition.z;
}
```

## Visual Feedback

### Corner Indicators
- 8px radius circles in world space
- Billboard effect (always face camera)
- Fixed screen size using distance-based scaling
- Ring geometry (hollow circle)

### Edge Indicators
- Double-thickness lines (4px linewidth)
- Rendered along full edge length
- Higher render order for visibility

### Styling Configuration
All visual properties configurable via ConfigurationManager:
- `visual.snapping.indicatorColor`
- `visual.snapping.cornerSize`
- `visual.snapping.borderWidth`
- `visual.snapping.opacity`

## Tool Integration

### Registration System
Tools register snap behaviors with SnapController:

```javascript
snapController.registerToolSnapBehavior('move', {
    getAllowedSnapTypes: () => ['corner', 'edge'],
    shouldSnapToObject: (object) => object.selectable !== false,
    applySnap: (snapPoint, dragState) => {
        // Tool-specific snap application
    }
});
```

### Move Tool Behavior
- **Allowed types**: corners, edges
- **Constraint**: Axis-aligned snapping only
- **Application**: Face-offset positioning

### Selection Tools
- **Visual feedback only**: Show indicators but don't apply positioning
- **All types allowed**: corners, edges, faces

## Performance Optimizations

### Smart Detection Triggering
- Only run detection when mouse moves significantly
- Skip detection during camera operations
- Stability frames prevent flickering

### Efficient Geometry Operations
- Reuse EdgesGeometry instances
- Dispose temporary geometries
- Billboard updates only when needed

### Logging Standards
- No frame-rate logging (prevents browser crashes)
- Event-driven logging for user actions
- Throttled logging (500ms intervals) for repeated operations

## Configuration

### Enable/Disable Control
Centralized control via SnapController affects all systems:

```javascript
snapController.setEnabled(false); // Disables detection and visualization
```

### Visual Configuration
Via ConfigurationManager with real-time updates:

```javascript
configManager.set('visual.snapping.indicatorColor', '#ff0000');
// Automatically updates all active indicators
```

## Debugging

### Common Issues

**Corner indicators not showing**:
- Check face snapping isn't overriding (should be disabled)
- Verify corner detection is finding 8 corners per box
- Ensure distance competition gives corners advantage

**Internal edges not working**:
- Check EdgesGeometry angle threshold (15° recommended)
- Verify geometry has internal edges (not just boundary edges)

**Objects snapping center instead of face**:
- Verify dragHitPoint is stored during drag start
- Check face offset calculation in applySnap
- Ensure axis constraint is applied correctly

### Debug Patterns
Event-driven logging for user actions:
```javascript
// Good: Log user events
console.log('User started drag operation');

// Bad: Frame-rate logging (causes crashes)
// console.log('Mouse position updated');
```

## Integration Points

### InputController
- Provides mouse position and raycasting
- Routes tool events to snap system
- Handles camera operation detection

### SceneController
- Provides object registry for snap detection
- Manages object selection state
- Coordinates with mesh synchronization

### Visual Effects
- Coordinates highlight states
- Manages render order priorities
- Handles material updates

## Future Considerations

### Potential Enhancements
- Snap to grid points
- Snap to construction lines
- Magnetic snap zones
- Snap history for quick re-snapping

### Architecture Improvements
- Consider snap point caching for static objects
- Evaluate spatial indexing for large scenes
- Optimize screen-space calculations for high DPI displays