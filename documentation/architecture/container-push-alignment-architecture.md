# Container Push & Alignment Architecture

**Version**: 2.1
**Date**: 2026-03-21
**Status**: Active
**Currency**: Current (latest implementation)

---

## Overview

This document describes the pure alignment-based architecture for container push operations and child object positioning. This architecture was established in January 2025 to fix alignment issues, eliminate jitter, and create CSS-like predictable behavior.

---

## Core Principles

### 1. **Layout Engine as Single Source of Truth**

The layout engine is the **only** system that positions and sizes child objects. Tools (like push-tool) only modify container geometry, then delegate all child updates to the layout engine.

**Why**: Eliminates conflicts between manual positioning logic and layout calculations. One source of truth = predictable behavior.

### 2. **Unified Geometry Manipulation**

Containers and regular objects both use `geometryUtils.resizeGeometry()` to modify geometry vertices in-place. No special container-specific geometry handling.

**Why**:
- Avoids expensive geometry recreation every frame
- Eliminates desync between geometry updates and child position updates
- Maintains consistent behavior across object types

### 3. **Pure Alignment-Based Positioning**

Children maintain their position relative to their **aligned edge** (bottom/center/top, left/center/right, back/center/front), exactly like CSS flexbox.

**Why**: Simple, predictable, CSS-like behavior that users understand intuitively.

### 4. **No Manual Child Position Adjustments**

Push tool and other tools **never** manually calculate or adjust child positions. Layout engine handles all positioning based on:
- Container size
- Alignment settings
- Fill/fixed sizing modes
- Gap distribution

**Why**: Manual adjustments conflict with layout engine, causing drift and jitter.

---

## Architecture Flow

### Container Push Operation

```
User drags container face
    ↓
Push Tool: Modify container geometry
    geometryUtils.resizeGeometry(mesh.geometry, axis, newSize, anchorMode)
    ↓
Push Tool: Trigger layout recalculation
    sceneController.updateLayout(containerId, { axis })
    ↓
Layout Engine: Recalculate everything
    ├─ Resize fill objects on their fill axes (symmetric, 'center' anchor)
    ├─ Reposition ALL objects based on alignment (perpendicular axes)
    ├─ Adjust gaps if no fill objects (space-between)
    └─ Anchor first object to start edge (space-between mode)
    ↓
Visual Update: Smooth, jitter-free movement
```

### Child Object Push (Alignment-Aware Resize) — Added v2.1

When pushing a child object inside a layout container, the push tool determines the anchor mode from the container's alignment on the push axis — not from which face the user clicked.

```
User drags child face inside layout container
    ↓
Push Tool: Read container alignment for push axis
    alignment = parent.autoLayout.alignment[pushAxis]
    ↓
Push Tool: Map alignment to anchor mode
    left/bottom/back  → anchorMode = 'min'   (aligned edge stays fixed)
    right/top/front   → anchorMode = 'max'   (aligned edge stays fixed)
    center            → anchorMode = 'center' (symmetric resize)
    ↓
Push Tool: Resize child geometry
    geometryUtils.resizeGeometry(mesh.geometry, axis, newSize, anchorMode)
    ↓
Push Tool: Store anchorMode, forward to property panel
    inputFocusManager.recordManipulation(id, prop, { pushDirection, pushAxis, anchorMode })
    ↓
Property Panel: User types dimension → uses anchorMode for position offset
    center → no position change
    min    → positionOffset = +dimChange/2
    max    → positionOffset = -dimChange/2
```

**Key insight**: The alignment determines the anchor regardless of which face is clicked. If a child is left-aligned, the left edge always stays fixed — even if the user drags the left face.

**Fallback**: Objects not in layout containers use the default behavior (clicked face moves, opposite stays).

### Key Implementation Details

#### Geometry Manipulation (Unified)
```javascript
// Both containers and objects use same method
const success = geometryUtils.resizeGeometry(
    mesh.geometry,
    axis,           // 'x', 'y', or 'z'
    newDimension,
    anchorMode      // 'min', 'center', or 'max'
);
```

#### Layout Recalculation
```javascript
// Push tool calls with minimal context
const pushContext = { axis: this.pushAxis };
sceneController.updateLayout(containerId, pushContext);

// Layout engine uses this to know:
// - Which axis is being pushed (for space-between detection)
// - To suppress UI events during drag (prevent flickering)
```

#### Fill Object Resizing
```javascript
// Always use 'center' anchor for symmetric resize
const anchorMode = 'center';
sceneController.updateObjectDimensions(
    childId,
    axis,
    newDimension,
    anchorMode,
    suppressEvents  // true during push
);

// Then layout engine repositions based on alignment
```

#### Alignment Application
```javascript
// ALWAYS apply alignment, even during push
// No special cases, no skipping
static applyPerpendicularAlignment(positions, sizes, layoutAxis, containerSize, alignment, padding, pushContext) {
    // Applies alignment on all axes perpendicular to layout direction
    // Children maintain position relative to aligned edge
    // ... alignment logic ...
}
```

#### Space-Between Distribution
```javascript
// When pushing on layout axis with NO fill objects:
const isPushing = pushContext && pushContext.axis === axis;
const usingSpaceBetween = containerSize && isPushing && fillCount === 0;

if (usingSpaceBetween) {
    // Anchor first object to container start edge (min)
    const containerMin = -containerAxisSize / 2;
    const paddingOffset = padding ? this.getPaddingOffset(axis, padding) : 0;
    targetPosition = (containerMin + paddingOffset) - min;

    // Gaps distribute evenly to fill remaining space
    dynamicGap = availableForGaps / (objectCount - 1);
}
```

---

## Alignment Behavior

### Layout Axis (X in this example)
- **Space-between mode** (no fill objects): First object anchored to start edge, gaps adjust
- **Fill mode** (at least one fill object): Gaps fixed, fill objects resize to share remaining space

### Perpendicular Axes (Y and Z in this example)

#### Bottom/Left/Back Alignment
- Object center positioned at: `containerMin + objectSize/2`
- Object "sticks" to bottom/left/back edge
- When container grows upward/right/forward, object stays at edge

#### Center Alignment
- Object center positioned at: `0` (container center)
- Object stays centered as container grows

#### Top/Right/Front Alignment
- Object center positioned at: `containerMax - objectSize/2`
- Object "sticks" to top/right/front edge
- When container grows downward/left/backward, object stays at edge

---

## Fill Object Behavior

### Sizing
- Fill objects **always resize symmetrically** using `anchorMode: 'center'`
- Multiple fill objects on same axis **share available space equally**
- Available space = container size - fixed objects - gaps - padding

### Positioning
- After resizing, layout engine **repositions based on alignment**
- Fill objects follow same alignment rules as fixed objects
- Example: Bottom-aligned fill object resizes symmetrically, then gets repositioned to bottom edge

### Combined Example
```
Container: 100 units tall, bottom-aligned
Fill object: Initially 20 units tall, centered at Y=0

Container grows to 150 units:
1. Fill object resizes to 70 units (shares extra 50 with other fills)
   - Resize is symmetric (grows 25 up, 25 down)
   - Object center still at Y=0 after resize
2. Layout engine repositions based on alignment
   - Bottom edge should be at container bottom
   - New center = containerMin + objectSize/2 = -75 + 35 = -40
   - Object moves from Y=0 to Y=-40
```

---

## Common Patterns

### Pattern 1: Push Container Face

**Tool code (push-tool.js)**:
```javascript
// Modify geometry only
geometryUtils.resizeGeometry(
    containerMesh.geometry,
    this.pushAxis,
    newDimension,
    anchorMode
);

// Trigger layout recalculation
const pushContext = { axis: this.pushAxis };
sceneController.updateLayout(containerId, pushContext);

// Done! Layout engine handles all child updates
```

### Pattern 2: Change Container Alignment

**Property handler code**:
```javascript
// Update alignment property
ObjectStateManager.updateObject(containerId, {
    'autoLayout.alignment.y': 'top'  // or 'center', 'bottom'
});

// Layout propagation automatically triggers
// All children reposition to new alignment
```

### Pattern 3: Toggle Fill Mode

**Property handler code**:
```javascript
// Update child size mode
ObjectStateManager.updateObject(childId, {
    'layoutProperties.sizeY': 'fill'  // or 'fixed'
});

// Layout propagation automatically triggers
// Parent container recalculates layout
// Child resizes and repositions
```

---

## Anti-Patterns (DON'T DO THIS)

### ❌ Manual Child Position Adjustments
```javascript
// WRONG - conflicts with layout engine
const geometryShift = (newDim - oldDim) / 2;
children.forEach(child => {
    child.mesh.position[axis] += geometryShift * alignmentFactor;
});
```

**Why wrong**: Layout engine will also reposition children, causing double adjustment or drift.

### ❌ Geometry Recreation Every Frame
```javascript
// WRONG - expensive and causes desync
const newGeometry = geometryFactory.createBoxGeometry(x, y, z);
containerMesh.geometry = newGeometry;
```

**Why wrong**:
- Creates new geometry every frame (performance issue)
- Child positions update on different frame than geometry (jitter)
- Vertices reset to centered, requiring manual shift calculations

### ❌ Skipping Alignment During Push
```javascript
// WRONG - breaks alignment behavior
if (pushContext) {
    return positions;  // Skip alignment
}
```

**Why wrong**: Children won't maintain position relative to aligned edge, causing drift.

### ❌ Conditional Position Updates
```javascript
// WRONG - prevents alignment from working
const shouldUpdatePosition = !isDuringPush || !hasFillObjects;
if (shouldUpdatePosition) {
    // Apply positions
}
```

**Why wrong**: Alignment requires position updates to work. Skipping them breaks alignment behavior.

---

## Files Modified (January 2025, updated March 2026)

### Core Changes

**push-tool.js**
- Removed manual child position adjustment logic (100+ lines)
- Unified geometry manipulation (use `resizeGeometry()` for all objects)
- Simplified `updateContainerLayout()` - always call layout engine
- Removed tracking variables (cumulativeGeometryShift, etc.)
- (v2.1) Alignment-aware anchor mode: maps container alignment to `min`/`max`/`center` for child push
- (v2.1) Forwards `anchorMode` to property panel via `recordManipulation` context

**property-update-handler.js** (v2.1)
- Uses `anchorMode` from push context for alignment-aware position offset on dimension edits
- Fallback to `pushDirection`-based offset when no anchor mode available

**layout-engine.js**
- Removed perpendicular alignment skip during push
- Simplified anchor-based positioning for space-between
- Always apply alignment regardless of push context
- Updated `alignLayoutPositions()` to handle space-between mode

**scene-layout-manager.js**
- Removed position update skip logic
- Always apply layout positions from layout engine
- Simplified fill object resize (always 'center' anchor)
- Removed conditional logic based on fill objects during push

**v2-main.js**
- Added container raycast override migration on initialization

**layout-geometry.js**
- Added raycast override migration functions
- Marked new containers with `hasRaycastOverride` flag

---

## Testing & Validation

### Test Scenarios

1. **Bottom-aligned objects, push top face**
   - ✅ Objects stay at bottom edge
   - ✅ Gap between objects and bottom stays constant

2. **Center-aligned objects, push any face**
   - ✅ Objects stay centered
   - ✅ Move half the distance of container growth

3. **Top-aligned objects, push bottom face**
   - ✅ Objects move with top face
   - ✅ Stay anchored to top edge

4. **Fill objects with alignment**
   - ✅ Resize symmetrically
   - ✅ Reposition to maintain alignment

5. **Space-between (no fill objects)**
   - ✅ First object anchored to start edge
   - ✅ Last object at end edge
   - ✅ Gaps distribute evenly

6. **Mixed fill and fixed objects**
   - ✅ Fixed objects maintain size
   - ✅ Fill objects share remaining space
   - ✅ Gaps stay constant
   - ✅ All objects positioned based on alignment

### Visual Quality

- ✅ No jitter during push
- ✅ Smooth, predictable movement
- ✅ No "snapping" or sudden position changes
- ✅ Consistent behavior across all alignments

---

## Container-First Selection

### Architecture

Containers use conditional raycasting - they only accept raycast hits when **selected**. When not selected, raycasts pass through to children.

### Implementation

**New containers (layout-geometry.js)**:
```javascript
// Override raycast method
mainMesh.raycast = function(raycaster, intersects) {
    const selectionController = window.modlerComponents?.selectionController;
    const isSelected = selectionController?.isSelected(mainMesh);

    if (isSelected) {
        // Allow raycasting for push/move tools
        originalRaycast(raycaster, intersects);
    }
    // Otherwise blocked - clicks pass through to children
};

mainMesh.userData.hasRaycastOverride = true;
```

**Migration for old containers (layout-geometry.js)**:
```javascript
// Apply override to existing containers
static updateAllContainersWithRaycastOverride() {
    const sceneController = window.modlerComponents?.sceneController;
    for (const [id, objectData] of sceneController.objects) {
        if (objectData.isContainer && objectData.mesh) {
            this.applyRaycastOverrideToContainer(objectData.mesh);
        }
    }
}
```

**Auto-migration (v2-main.js)**:
```javascript
// Run on app initialization
if (window.LayoutGeometry) {
    window.LayoutGeometry.updateAllContainersWithRaycastOverride();
}
```

### Behavior

1. **Unselected container**:
   - Raycasting blocked
   - Clicks pass through to children
   - Clicking child selects parent container

2. **Selected container**:
   - Raycasting allowed
   - Push/move tools can detect faces
   - Face-based manipulation works

---

## Future Considerations

### Potential Enhancements

1. **Alignment transition animations**: Smooth movement when changing alignment
2. **Per-object alignment override**: Allow individual objects to ignore container alignment
3. **Alignment presets**: Quick alignment patterns (corner, edge, center)
4. **Visual alignment guides**: Show alignment edges during manipulation

### Known Limitations

1. **Rotation + alignment**: Rotated objects don't align to rotated edges (uses world axes)
2. **Nested container alignment**: Deep nesting can accumulate small floating point errors
3. **Large object counts**: >100 objects in container may have performance impact during push
4. **Direct property panel edits (no push context)**: Typing a dimension without prior push uses default symmetric resize. Mitigated: layout propagation runs afterward and repositions children based on alignment on perpendicular axes.
5. **Undo/redo alignment mismatch**: Undo restores exact positions from the original push. If alignment was changed between push and undo, positions may briefly mismatch until next layout propagation corrects them.

---

## References

- Original issue discussion: Session 2025-01-21
- Commit: `cd6fda7` - fix: container push alignment and selection behavior
- Related: `/memories/quick-patterns.md` - Container Push Operations pattern
- Related: `/memories/active-context.md` - Session notes

---

**Document maintained by**: Claude Code development sessions
**Review frequency**: Update when alignment behavior changes
