# Auto-Layout System Architecture

**Version**: 1.0.0
**Status**: Current
**Last Updated**: 2025-01-30

## Overview

Modler V2's **Auto-Layout System** automatically positions and sizes objects inside containers based on layout rules. Think Figma's auto-layout but in 3D.

This document explains how layout calculations work, how sizing behaves (Fill/Hug/Fixed), and how changes propagate bidirectionally through the hierarchy.

---

## Core Concepts

### Auto-Layout vs Manual Positioning

**Manual Positioning** (Default):
- Objects positioned where user places them
- Container size independent of children
- No automatic resizing or repositioning

**Auto-Layout** (When Enabled):
- Objects automatically positioned along an axis
- Container shrinks to fit children
- Children can fill container space
- Gap and padding supported

---

### Layout Modes

| Mode | Direction | Description |
|------|-----------|-------------|
| **Linear** | `x`, `y`, `z` | Stack objects along one axis |
| **Grid** | `xy` | 2D grid layout (rows × columns) |
| **3D Grid** | `xyz` | 3D grid layout (experimental) |

**Most Common**: Linear layouts (`x`, `y`, `z`)

---

### Sizing Behaviors

Objects can have different sizing behavior per axis:

| Behavior | Description | Example |
|----------|-------------|---------|
| **Fixed** | Keep current size | Box stays 2×2×2 |
| **Fill** | Expand to fill available space | Box grows to fill container |
| **Hug** | Shrink to content size | Container fits children exactly |

**Per-Axis Configuration**:
```javascript
layoutProperties: {
    sizeX: 'fill',   // Fill container width
    sizeY: 'hug',    // Match content height
    sizeZ: 'fixed'   // Keep current depth
}
```

---

## Data Storage

### Layout Configuration

**Stored on Container** (`container.autoLayout`):
```javascript
{
    enabled: true,
    direction: 'x',        // Layout axis
    gap: 0.2,              // Gap between objects
    padding: {             // Container padding
        top: 0.1,
        bottom: 0.1,
        left: 0.1,
        right: 0.1,
        front: 0,
        back: 0
    },
    columns: 3             // Grid layout only
}
```

**Stored on Object** (`object.layoutProperties`):
```javascript
{
    sizeX: 'fixed',   // 'fixed', 'fill', or 'hug'
    sizeY: 'fixed',
    sizeZ: 'fixed'
}
```

**Storage Location**: SceneController (`objects` Map)

---

## Layout Calculation Flow

### Overview

```
User enables layout on Container 001
  ↓
1. SceneController.enableAutoLayout(containerId, layoutConfig)
  ↓
2. Container stores layoutConfig in autoLayout property
  ↓
3. SceneController.updateLayout(containerId)
  ↓
4. LayoutEngine.calculateLayout(children, layoutConfig, containerSize)
  ↓
5. Returns {positions, sizes, bounds}
  ↓
6. SceneController.applyLayoutPositionsAndSizes()
  ↓
7. ContainerCrudManager.resizeContainerToLayoutBounds()
  ↓
8. Container resizes to fit laid-out children
```

---

### Step-by-Step Example

**Scenario**: Container with 3 boxes, linear layout (X-axis), gap = 0.2

**Input**:
- Container: 5×5×5 at position (0, 0, 0)
- Box A: 1×1×1 (sizeX: fixed)
- Box B: 1×1×1 (sizeX: fill)
- Box C: 1×1×1 (sizeX: fixed)

**Step 1: Categorize Objects**
```javascript
// layout-engine.js:329
categorizeObjects(objects, 'x') → {
    fixedObjects: [Box A, Box C],
    fillObjects: [Box B],
    totalFixedSize: 2,  // Box A (1) + Box C (1)
    fillCount: 1        // Box B
}
```

**Step 2: Calculate Available Space**
```javascript
// layout-engine.js:69-74
availableSpace = containerSize.x - totalFixedSize - totalGaps - paddingTotal
availableSpace = 5 - 2 - (2 × 0.2) - 0 = 2.6
```

**Step 3: Apply Sizing Behavior**
```javascript
// layout-engine.js:252
Box A: sizeX = 1 (fixed)
Box B: sizeX = 2.6 / 1 = 2.6 (fill)
Box C: sizeX = 1 (fixed)
```

**Step 4: Calculate Positions**
```javascript
// layout-engine.js:82-102
Box A: x = 0 + 0.5 = 0.5 (center of first box)
Box B: x = 0.5 + 1 + 0.2 + 1.3 = 3.0 (1 = half A, 0.2 = gap, 1.3 = half B)
Box C: x = 3.0 + 1.3 + 0.2 + 0.5 = 5.0 (1.3 = half B, 0.2 = gap, 0.5 = half C)
```

**Step 5: Center Layout**
```javascript
// layout-engine.js:105
// Shift all positions to center around origin
totalWidth = 1 + 2.6 + 1 + 2×0.2 = 5.2
offset = -5.2 / 2 = -2.6

Box A: x = 0.5 - 2.6 = -2.1
Box B: x = 3.0 - 2.6 = 0.4
Box C: x = 5.0 - 2.6 = 2.4
```

**Step 6: Calculate Bounds**
```javascript
// layout-engine.js:504
layoutBounds = {
    size: { x: 5.2, y: 1, z: 1 },  // Width includes gaps
    center: { x: 0, y: 0, z: 0 }
}
```

**Step 7: Resize Container**
```javascript
// container-crud-manager.js:649
resizeContainerToLayoutBounds(container, layoutBounds)
// Container resizes from 5×5×5 to 5.2×1×1
```

**Key Code Locations**:
- `layout/layout-engine.js:14` - calculateLayout()
- `layout/layout-engine.js:61` - calculateLinearLayout()
- `layout/layout-engine.js:252` - applySizingBehavior()
- `scene/scene-controller.js:523` - updateLayout()
- `application/tools/container-crud-manager.js:649` - resizeContainerToLayoutBounds()

---

## Bidirectional Propagation

### BOTTOM-UP: Child → Parent

**Trigger**: Child object changes (dimensions, position, added/removed)

**Flow**:
```
Box B dimensions change (1×1×1 → 2×1×1)
  ↓
1. ObjectStateManager detects dimension change
  ↓
2. scheduleParentLayoutUpdate(Box B.parentContainer)
  ↓
3. Scheduled in requestAnimationFrame
  ↓
4. Container 001 layout recalculates
  ↓
5. Container 001 resizes to fit new child sizes
  ↓
6. If Container 001 has a parent, schedule its layout update
  ↓
7. Propagates up to root
```

**Code** (`core/object-state-manager.js:481`):
```javascript
// After dimension update
if (object._pendingDimensionUpdates) {
    // Apply dimension changes...

    // BOTTOM-UP PROPAGATION: Child dimensions changed → schedule parent layout update
    this.scheduleParentLayoutUpdate(object.id);
}
```

**Code** (`core/object-state-manager.js:717`):
```javascript
scheduleParentLayoutUpdate(childObjectId) {
    const childObject = this.sceneController?.getObject(childObjectId);
    if (!childObject || !childObject.parentContainer) return;

    const parentContainer = this.sceneController.getObject(childObject.parentContainer);
    if (!parentContainer?.autoLayout?.enabled) return;

    // Initialize scheduled updates set
    if (!this.scheduledLayoutUpdates) {
        this.scheduledLayoutUpdates = new Set();
    }

    // Add parent to scheduled updates
    this.scheduledLayoutUpdates.add(childObject.parentContainer);

    // Process in next frame (after current propagation completes)
    if (!this.layoutUpdateScheduled) {
        this.layoutUpdateScheduled = true;
        requestAnimationFrame(() => {
            this.processScheduledLayouts();
            this.layoutUpdateScheduled = false;
        });
    }
}
```

---

### TOP-DOWN: Parent → Children

**Trigger**: Container layout configuration changes

**Flow**:
```
Container 001 direction changes (x → y)
  ↓
1. ObjectStateManager.updateObject(containerId, { autoLayout: { direction: 'y' } })
  ↓
2. SceneController.updateLayout(containerId)
  ↓
3. LayoutEngine calculates new positions based on Y-axis
  ↓
4. Children reposition along Y-axis
  ↓
5. Children with sizeY='fill' expand to fill container height
  ↓
6. Container resizes to fit new layout
```

**Code** (`core/object-state-manager.js:524`):
```javascript
// Update container layout if needed (TOP-DOWN PROPAGATION)
const autoLayoutChanged = object._changedProperties?.has('autoLayout');
if (object.isContainer && sceneObject && (object.autoLayout?.enabled || autoLayoutChanged)) {
    const layoutResult = this.sceneController.updateLayout(object.id);

    // Resize container to fit the laid out objects
    if (layoutResult?.success && layoutResult.layoutBounds) {
        const containerCrudManager = window.modlerComponents?.containerCrudManager;
        if (containerCrudManager) {
            containerCrudManager.resizeContainerToLayoutBounds(sceneObject, layoutResult.layoutBounds);
        }
    }

    // BOTTOM-UP PROPAGATION: Container size changed → schedule grandparent layout update
    this.scheduleParentLayoutUpdate(object.id);
}
```

---

### Nested Container Propagation

**Example**:
```
Box 003 (depth 2) dimensions change
  ↓
Container 002 (depth 1) layout updates
  ↓
Container 002 resizes to fit Box 003
  ↓
Container 001 (depth 0) layout updates (Container 002 is a child)
  ↓
Container 001 resizes to fit Container 002
```

**Depth-Sorted Processing** (`object-state-manager.js:749`):
```javascript
processScheduledLayouts() {
    // Sort by container depth (deepest first)
    const sorted = Array.from(this.scheduledLayoutUpdates).sort((a, b) => {
        const depthA = this.getContainerDepth(a);
        const depthB = this.getContainerDepth(b);
        return depthB - depthA; // Descending order (deepest first)
    });

    // Update each container's layout
    sorted.forEach(containerId => {
        const container = this.sceneController.getObject(containerId);
        if (container?.autoLayout?.enabled) {
            const layoutResult = this.sceneController.updateLayout(containerId);

            // Resize container to fit new layout
            if (layoutResult?.success && layoutResult.layoutBounds) {
                const containerCrudManager = window.modlerComponents?.containerCrudManager;
                if (containerCrudManager) {
                    containerCrudManager.resizeContainerToLayoutBounds(container, layoutResult.layoutBounds);
                }
            }

            // If this container is in a parent container, schedule parent update
            if (container.parentContainer) {
                const grandparent = this.sceneController.getObject(container.parentContainer);
                if (grandparent?.autoLayout?.enabled) {
                    this.scheduledLayoutUpdates.add(container.parentContainer);
                }
            }
        }
    });

    this.scheduledLayoutUpdates.clear();
}
```

**Why Deepest First?**:
- Inner containers resize before outer containers
- Prevents multiple recalculations
- Ensures correct final layout

---

## Fill Behavior Deep-Dive

### Fill on Layout Axis

**Layout Direction**: X-axis
**Object**: sizeX = 'fill'

**Calculation**:
```javascript
// layout-engine.js:261-262
const fillSizePerObject = (availableSpace && fillCount > 0) ?
    availableSpace / fillCount : baseSize[layoutAxis];
```

**Example**:
- Container: 10 units wide
- 3 fixed objects (1 + 1 + 1 = 3 units)
- 2 fill objects
- Gap: 0.5 (4 gaps × 0.5 = 2 units)
- Available space: 10 - 3 - 2 = 5 units
- Fill size per object: 5 / 2 = 2.5 units

**Result**: Each fill object = 2.5 units wide

---

### Fill on Non-Layout Axis

**Layout Direction**: X-axis
**Object**: sizeY = 'fill'

**Calculation**:
```javascript
// layout-engine.js:284-294
if (sizeY === 'fill') {
    if (layoutAxis === 'y' && availableSpace !== null) {
        // Use layout axis fill calculation
        adjustedSize.y = Math.max(fillSizePerObject, 0.1);
    } else if (containerSize) {
        // Fill based on container size minus padding
        const paddingTop = (padding.top || 0);
        const paddingBottom = (padding.bottom || 0);
        const availableY = containerSize.y - paddingTop - paddingBottom;
        adjustedSize.y = Math.max(availableY, 0.1);
    }
}
```

**Example**:
- Container: 10 units tall (Y-axis)
- Padding top: 0.5, bottom: 0.5
- Available height: 10 - 0.5 - 0.5 = 9 units
- Object with sizeY='fill': Height = 9 units

**Result**: Object fills container height

---

## Gap and Padding

### Gap

**Definition**: Space between objects in layout direction

**Example**:
```
Gap = 0.5

[Box A] <--0.5--> [Box B] <--0.5--> [Box C]
```

**Code**:
```javascript
// layout-engine.js:85-98
objects.forEach((obj, index) => {
    const size = objectSizes[index];

    if (axis === 'x') {
        position.x = currentPosition + size.x / 2;
        currentPosition += size.x + gap;  // ← Add gap
    }
});
```

---

### Padding

**Definition**: Space inside container around children

**Example**:
```
┌─────────────────────────┐
│ top: 0.5                │
│ left: 0.5 [Box] right:0.5│
│ bottom: 0.5             │
└─────────────────────────┘
```

**Code**:
```javascript
// layout-engine.js:269-274
if (sizeX === 'fill' && containerSize) {
    const paddingLeft = (padding.left || 0);
    const paddingRight = (padding.right || 0);
    const availableX = containerSize.x - paddingLeft - paddingRight;
    adjustedSize.x = Math.max(availableX, 0.1);
}
```

**Applied After Centering**:
```javascript
// layout-engine.js:108
const finalPositions = this.applyPaddingToAxis(centeredPositions, axis, paddingOffset);
```

---

## Layout Modes Detail

### Linear Layout (X/Y/Z)

**Most Common**: Horizontal (X) or Vertical (Y)

**Calculation**:
1. Categorize fixed vs fill objects
2. Calculate available space
3. Distribute space among fill objects
4. Position objects with gaps
5. Center entire layout
6. Apply padding

**Code**: `layout/layout-engine.js:61` - `calculateLinearLayout()`

---

### Grid Layout (XY)

**2D Grid**: Rows and columns

**Configuration**:
```javascript
{
    direction: 'xy',
    columns: 3  // Objects per row
}
```

**Calculation**:
```javascript
// layout-engine.js:134-150
const columns = layoutConfig.columns || Math.ceil(Math.sqrt(objects.length));
const rows = Math.ceil(objects.length / columns);

objects.forEach((obj, index) => {
    const col = index % columns;
    const row = Math.floor(index / columns);

    const position = new THREE.Vector3(
        col * (size.x + gap) - (columns - 1) * (size.x + gap) / 2,
        -row * (size.y + gap) + (rows - 1) * (size.y + gap) / 2,
        0
    );
});
```

**Example**:
- 6 objects, 3 columns
- Result: 2 rows × 3 columns
```
[Box 1] [Box 2] [Box 3]
[Box 4] [Box 5] [Box 6]
```

---

## Performance

### Batching

**Problem**: Multiple child changes → multiple layout recalculations

**Solution**: Batch layout updates in requestAnimationFrame

**Code**:
```javascript
// object-state-manager.js:735
requestAnimationFrame(() => {
    this.processScheduledLayouts();
    this.layoutUpdateScheduled = false;
});
```

**Result**: All layout updates happen once per frame

---

### Throttling

**Container Resize Throttling** (60 FPS):
```javascript
// container-crud-manager.js:9-10
this.lastResizeTime = new Map();
this.throttleDelay = 16; // milliseconds
```

**Check**:
```javascript
const now = Date.now();
const lastResize = this.lastResizeTime.get(containerId) || 0;

if (now - lastResize < this.throttleDelay) {
    return; // Skip resize (too soon)
}

this.lastResizeTime.set(containerId, now);
```

---

### Layout Bounds Caching

**Current**: Bounds calculated every layout update

**Future Optimization**: Cache bounds when children don't change

---

## Common Patterns

### Auto-Layout Container

```javascript
// Enable layout on container
sceneController.enableAutoLayout(containerId, {
    direction: 'x',
    gap: 0.2,
    padding: {
        top: 0.1,
        bottom: 0.1,
        left: 0.1,
        right: 0.1,
        front: 0,
        back: 0
    }
});
```

---

### Fill Parent Width

```javascript
// Make object fill container width
objectData.layoutProperties = {
    sizeX: 'fill',
    sizeY: 'fixed',
    sizeZ: 'fixed'
};

// Trigger layout update
objectStateManager.updateObject(objectId, {
    layoutProperties: objectData.layoutProperties
});
```

---

### Stack Boxes Vertically

```javascript
// Container with vertical layout
sceneController.enableAutoLayout(containerId, {
    direction: 'y',  // Stack along Y-axis
    gap: 0.5
});
```

---

## Debugging

### Visualize Layout Bounds

```javascript
// Print layout bounds
const layoutResult = sceneController.updateLayout(containerId);
console.log('Layout bounds:', layoutResult.layoutBounds);
// { size: { x: 5, y: 2, z: 1 }, center: { x: 0, y: 0, z: 0 } }
```

---

### Check Sizing Behavior

```javascript
const obj = sceneController.getObject(objectId);
console.log('Layout properties:', obj.layoutProperties);
// { sizeX: 'fill', sizeY: 'hug', sizeZ: 'fixed' }
```

---

### Layout Debug Info

```javascript
// layout-engine.js:600
const debugInfo = LayoutEngine.getLayoutDebugInfo(children, layoutConfig);
console.log(debugInfo);
```

---

## Limitations

### No Dynamic Re-Layout

**Current**: Layout only updates when:
- Child dimensions change
- Child added/removed
- Layout config changes

**Not Updated**: When container manually resized (would break manual sizing)

---

### No Constraints

**Missing**: Min/max size constraints

**Workaround**: Manually clamp sizes after layout

---

### No Alignment

**Missing**: Align objects (start, center, end)

**Current**: Always centered

---

## Related Documentation

- [Container Hierarchy](container-hierarchy.md) - Parent-child relationships
- [Layout Performance](../guides/layout-performance.md) - Performance optimization
- [Data Flow Architecture](data-flow-architecture.md) - State propagation

---

## Revision History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2025-01-30 | Initial documentation after foundation audit |
