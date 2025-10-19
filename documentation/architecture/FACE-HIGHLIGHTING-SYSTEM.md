# Face Highlighting System Architecture

**Status:** ✅ CURRENT (January 2025)
**Version:** 2.0 - Unified Support Mesh System
**Currency:** 🟢 Live - This is the authoritative face highlighting implementation

---

## System Overview

The Face Highlighting System provides visual feedback for face-based interactions across the application. It uses a **unified architecture** based on pre-created support meshes that are children of their parent objects.

### Core Principle: Single System, Multiple Triggers

**One Implementation** - `SupportMeshFactory.positionFaceHighlightForHit()` and `positionFaceHighlightForAxis()`
**Multiple Entry Points** - Tool hover, button hover, any face-based interaction
**Universal Support** - Works identically for containers and regular objects

---

## Architecture Components

### 1. Support Mesh System (Foundation)

**File:** `/interaction/support-mesh-factory.js`

Face highlight meshes are **pre-created during object creation** as children of the parent object. This follows the "create once, show/hide" pattern established in the major refactor (commit `00ad6ba`).

#### Key Characteristics

- **Child of parent object** - Inherits transforms automatically (no manual syncing)
- **Local space positioning** - All calculations in parent's coordinate system
- **PlaneGeometry** - Simple quad that scales/positions to match face
- **Pre-pooled material** - Reuses material from MaterialManager
- **Show/hide only** - Created once, then `visible = true/false`

#### Support Mesh Lifecycle

```javascript
// 1. CREATION (once during object creation)
const faceHighlightMesh = supportMeshFactory.createFaceHighlight(parentMesh);
parentMesh.add(faceHighlightMesh); // Child of parent
parentMesh.userData.supportMeshes = { faceHighlight: faceHighlightMesh };

// 2. POSITIONING (when highlighting a face)
supportMeshFactory.positionFaceHighlightForHit(faceHighlightMesh, hit);
// OR
supportMeshFactory.positionFaceHighlightForAxis(faceHighlightMesh, objectMesh, axis);

// 3. SHOWING
faceHighlightMesh.visible = true;

// 4. HIDING
faceHighlightMesh.visible = false;

// 5. CLEANUP (when parent is deleted)
// Automatic - parent deletion removes all children including support mesh
```

---

## Face Highlighting Methods

### Method 1: positionFaceHighlightForHit()

**Purpose:** Position face highlight based on raycast hit (tool hover)
**Used By:** MoveTool, PushTool via BaseFaceToolBehavior
**Input:** Raycast hit with face normal and object

```javascript
/**
 * Position face highlight for specific raycast hit
 * @param {THREE.Mesh} faceHighlightMesh - Pre-created face highlight support mesh
 * @param {Object} hit - { object, face: { normal }, point }
 */
positionFaceHighlightForHit(faceHighlightMesh, hit)
```

**How It Works:**

1. Resolves main object from hit (handles container interactive meshes)
2. Uses interactive mesh geometry for containers (BoxGeometry vs EdgesGeometry)
3. Computes bounding box in local space
4. Determines face orientation from normal (X/Y/Z, positive/negative)
5. Calculates face dimensions (width, height)
6. Positions plane at face center in local coordinates
7. Rotates plane to align with face normal
8. Adds small offset to prevent z-fighting

### Method 2: positionFaceHighlightForAxis()

**Purpose:** Position face highlight for specific axis (button hover)
**Used By:** Layout buttons, fill buttons, tile tool axis buttons via CommandRouter
**Input:** Object mesh, axis ('x'|'y'|'z'), camera-facing option

```javascript
/**
 * Position face highlight for specific axis
 * Determines camera-facing face on the specified axis
 * @param {THREE.Mesh} faceHighlightMesh - Pre-created face highlight support mesh
 * @param {THREE.Mesh} objectMesh - Object to highlight
 * @param {string} axis - 'x', 'y', or 'z'
 * @param {boolean} cameraFacingOnly - Show camera-facing face only (default: true)
 */
positionFaceHighlightForAxis(faceHighlightMesh, objectMesh, axis, cameraFacingOnly = true)
```

**How It Works:**

1. Gets camera position in world space
2. Calculates vector from object to camera
3. Determines which face on axis is camera-facing
   - X axis: positive (right) or negative (left)
   - Y axis: positive (top) or negative (bottom)
   - Z axis: positive (front) or negative (back)
4. Creates synthetic hit object with correct normal
5. Delegates to `positionFaceHighlightForHit()` for positioning

---

## Usage Patterns

### Pattern 1: Tool Hover (Move/Push Tools)

**Location:** `application/tools/base-face-tool-behavior.js`

```javascript
// In handleFaceDetection()
if (supportMeshes?.faceHighlight) {
    const supportMeshFactory = window.modlerComponents?.supportMeshFactory;
    supportMeshFactory.positionFaceHighlightForHit(supportMeshes.faceHighlight, hit);
    supportMeshes.faceHighlight.visible = true;
}

// In clearHover()
if (supportMeshes?.faceHighlight) {
    supportMeshes.faceHighlight.visible = false;
}
```

**Characteristics:**
- Driven by mouse movement over objects
- Shows camera-facing faces via raycasting
- Clears when mouse moves away

### Pattern 2: Button Hover (Layout/Fill/Tile Buttons)

**Location:** `application/command-router.js`

```javascript
// Unified handler for all axis button hovers
handleAxisButtonHover(data) {
    const { objectId, axis, isHovering } = data;

    const selectedObjects = selectionController.getSelectedObjects();
    const selectedObject = selectedObjects[0];
    const supportMeshes = selectedObject.userData?.supportMeshes;

    if (isHovering) {
        // Enable button highlight mode to prevent tool clearing
        visualEffects.setButtonHighlight(true);

        // Position for camera-facing face on axis
        supportMeshFactory.positionFaceHighlightForAxis(
            supportMeshes.faceHighlight,
            selectedObject,
            axis,
            true // camera-facing only
        );

        supportMeshes.faceHighlight.visible = true;
    } else {
        visualEffects.setButtonHighlight(false);
        supportMeshes.faceHighlight.visible = false;
    }
}
```

**Button Types:**
- **Layout direction buttons** (X/Y/Z in LayoutSection)
- **Fill buttons** (W/H/D in TransformSection)
- **Tile tool axis buttons** (X/Y/Z in TileControls)

**Message Flow:**
```
UI Button Hover
    ↓
window.parent.postMessage({ type: 'layout-button-hover', objectId, axis, isHovering })
    ↓
CommandRouter.handleLayoutButtonHover() OR handleFillButtonHover()
    ↓
CommandRouter.handleAxisButtonHover() (unified)
    ↓
SupportMeshFactory.positionFaceHighlightForAxis()
    ↓
supportMeshes.faceHighlight.visible = true
```

---

## Button Highlight Coordination

**Problem:** Tool hover and button hover compete for the same face highlight mesh.

**Solution:** Button highlight mode flag in VisualEffects prevents tool clearing.

```javascript
// VisualEffects.js
this.isButtonHighlight = false; // Flag to prevent clearing

setButtonHighlight(enabled) {
    this.isButtonHighlight = enabled;
}

clearHighlight() {
    // Don't clear if button highlight is active
    if (this.isButtonHighlight) return;
    // ... normal clearing logic
}
```

**Flow:**
1. User hovers button → `setButtonHighlight(true)` → show face
2. Mouse moves in viewport → tool calls `clearHighlight()` → blocked by flag
3. User unhovers button → `setButtonHighlight(false)` → hide face

---

## Container Support

Both methods work identically for containers and regular objects.

### Container-Specific Handling

1. **Interactive Mesh Resolution**
   - Containers use EdgesGeometry (wireframe) for main mesh
   - Face highlighting requires BoxGeometry from interactive mesh
   - `positionFaceHighlightForHit()` automatically uses `supportMeshes.interactiveMesh.geometry` for bounding box

2. **Child of Container Mesh**
   - Face highlight is child of container's **main mesh**, not interactive mesh
   - This ensures correct hierarchy and transform inheritance

3. **Hit Object Resolution**
   - `BaseFaceToolBehavior.handleFaceDetection()` resolves interactive mesh hits to parent container
   - Synthetic hit is created with container as target for positioning

---

## Camera-Facing Detection

**Automatic for Tool Hover:**
- Raycasting only hits front faces
- Back faces aren't in raycast results
- Natural camera-facing detection

**Computed for Button Hover:**
- Calculate camera-to-object vector
- Compare with axis normals
- Choose face on correct side of axis

**Example (X axis):**
```javascript
const cameraToObject = camera.position - object.position;
const faceNormal = cameraToObject.x > 0
    ? new THREE.Vector3(1, 0, 0)   // Right face (positive X)
    : new THREE.Vector3(-1, 0, 0); // Left face (negative X)
```

---

## Material Management

**Material:** `MaterialManager.createFaceHighlightMaterial()`

**Properties:**
- Color: Configurable via `visual.effects.faceHighlight.color` (default: #ff6600)
- Opacity: Configurable via `visual.effects.faceHighlight.opacity` (default: 0.3)
- Side: `THREE.FrontSide` (only render front face)
- Transparent: `true`
- DepthTest: `false` (always visible)
- DepthWrite: `false` (don't write to depth buffer)

**Pooling:** Material is cached and reused across all face highlights.

---

## Historical Context

### Version 1.0 - Dual System (DEPRECATED)

**Problem:** Two separate implementations competed:

1. **Support Mesh System** (tool hover)
   - Pre-created child meshes
   - Positioned in local space
   - Worked perfectly

2. **Visual Effects Axis System** (button hover)
   - Created separate mesh in world space
   - Manual position/rotation/scale syncing
   - Broke with DoubleSide → FrontSide change
   - Added in commit `f74895c` as workaround

### Version 2.0 - Unified System (CURRENT)

**Solution:** Eliminate axis system, extend support mesh system for button hovers.

**Refactor (January 2025):**
- Added `positionFaceHighlightForAxis()` to SupportMeshFactory
- Unified `handleAxisButtonHover()` in CommandRouter
- Removed `showAxisFaceHighlight()` from VisualEffects
- Removed `createAxisHighlightMaterial()` from MaterialManager
- Added tile tool axis button hover support

**Benefits:**
- Single code path for all face highlighting
- No position syncing required
- Works uniformly for containers and objects
- Simpler architecture and debugging

---

## Critical Guidelines

### ❌ NEVER

1. **Create separate face highlighting systems**
   - All face highlighting MUST use SupportMeshFactory
   - No exceptions for "special cases"

2. **Bypass support mesh architecture**
   - Don't create meshes in world space
   - Don't manually sync position/rotation/scale
   - Use the pre-created child meshes

3. **Recreate face highlight meshes**
   - Create once during object creation
   - Show/hide only after that
   - No disposal/recreation during hover

4. **Use VisualEffects for face highlighting**
   - VisualEffects is for legacy/fallback only
   - Modern code uses support meshes directly

### ✅ ALWAYS

1. **Use existing methods**
   - `positionFaceHighlightForHit()` for tool hover (raycast-based)
   - `positionFaceHighlightForAxis()` for button hover (axis-based)

2. **Check support mesh exists**
   ```javascript
   const supportMeshes = object.userData?.supportMeshes;
   if (!supportMeshes?.faceHighlight) return;
   ```

3. **Enable button highlight mode for button hovers**
   ```javascript
   visualEffects.setButtonHighlight(true); // Prevent tool clearing
   // ... show face highlight
   visualEffects.setButtonHighlight(false); // Allow tool clearing
   ```

4. **Work in local space**
   - Support meshes are children - local coordinates only
   - Transform inheritance is automatic

---

## Adding New Face Highlight Triggers

If you need face highlighting for a new interaction:

### Step 1: Choose Method

- **Raycast-based** (hover over face) → Use `positionFaceHighlightForHit()`
- **Axis-based** (button/UI trigger) → Use `positionFaceHighlightForAxis()`

### Step 2: Get Support Mesh

```javascript
const object = /* your target object */;
const supportMeshes = object.userData?.supportMeshes;
if (!supportMeshes?.faceHighlight) {
    console.warn('Object missing face highlight support mesh');
    return;
}
```

### Step 3: Position and Show

```javascript
const supportMeshFactory = window.modlerComponents?.supportMeshFactory;

// For raycast-based
supportMeshFactory.positionFaceHighlightForHit(supportMeshes.faceHighlight, hit);

// OR for axis-based
supportMeshFactory.positionFaceHighlightForAxis(
    supportMeshes.faceHighlight,
    object,
    axis,
    true // camera-facing only
);

// Show the highlight
supportMeshes.faceHighlight.visible = true;
```

### Step 4: Hide When Done

```javascript
supportMeshes.faceHighlight.visible = false;
```

### Step 5: Coordinate with Tool Hover (if needed)

If your trigger is UI-based and might conflict with tool hover:

```javascript
// When showing
visualEffects.setButtonHighlight(true);
supportMeshes.faceHighlight.visible = true;

// When hiding
visualEffects.setButtonHighlight(false);
supportMeshes.faceHighlight.visible = false;
```

---

## Debugging

### Face Highlight Not Showing

**Check:**
1. Does object have support mesh? `object.userData.supportMeshes?.faceHighlight`
2. Is support mesh visible? `faceHighlight.visible === true`
3. Is support mesh positioned? Check `faceHighlight.position` and `scale`
4. Is button highlight mode blocking? `visualEffects.isButtonHighlight`
5. Is support mesh a child? `faceHighlight.parent === object`

### Wrong Face Highlighted

**Check:**
1. Face normal direction (use `hit.face.normal`)
2. Camera position relative to object
3. Axis parameter ('x', 'y', or 'z')
4. cameraFacingOnly flag (true = auto-detect, false = positive side)

### Highlight Doesn't Move with Object

**Check:**
1. Is face highlight a child of parent? `faceHighlight.parent`
2. If yes, transforms should inherit automatically
3. If no, face highlight was created incorrectly - must be child

---

## Related Systems

- **Support Mesh Factory** (`/interaction/support-mesh-factory.js`) - Creates and manages all support meshes
- **Base Face Tool Behavior** (`/application/tools/base-face-tool-behavior.js`) - Shared face detection for tools
- **Material Manager** (`/application/utilities/material-manager.js`) - Face highlight material creation
- **Visual Effects** (`/scene/visual-effects.js`) - Button highlight coordination flag

---

## Version History

| Version | Date | Description |
|---------|------|-------------|
| 1.0 | 2024 | Dual system - Support mesh (tools) + Axis highlight (buttons) |
| 2.0 | Jan 2025 | Unified system - Support mesh only, axis method added |

---

**Last Updated:** January 2025
**Next Review:** When adding new face-based interactions
