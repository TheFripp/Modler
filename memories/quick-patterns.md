# Modler V2 - Quick Patterns

**Code templates for 80% of common tasks**

**NOTE**: All import paths use **kebab-case** file names (e.g., `object-state-manager.js`)

---

## State Management Patterns

### 1. Update Object State

```javascript
// ALWAYS use ObjectStateManager for state changes
// ObjectStateManager is available globally via window.modlerComponents
const ObjectStateManager = window.modlerComponents.objectStateManager;

// Update object properties
ObjectStateManager.updateObject(objectId, {
    position: { x: 0, y: 5, z: 0 },
    dimensions: { x: 10, y: 10, z: 10 },  // x/y/z format (not width/height/depth)
    rotation: { x: 0, y: Math.PI / 4, z: 0 }
});

// Update container properties
ObjectStateManager.updateObject(containerId, {
    layoutDirection: 'x',
    gap: 2,
    padding: 1,
    sizingMode: 'hug'
});

// Update custom properties
ObjectStateManager.updateObject(objectId, {
    customProperty: 'value',
    metadata: { key: 'value' }
});
```

### 2. Check Container/Layout Modes (State Machine)

```javascript
// CENTRALIZED STATE MACHINE: Use these methods instead of direct property checks
const objectStateManager = window.modlerComponents.objectStateManager;

// Get container mode (returns 'layout', 'hug', 'manual', or null)
const mode = objectStateManager.getContainerMode(containerId);
if (mode === 'layout') {
    // Container is in layout mode
}

// Boolean checks (convenience methods)
if (objectStateManager.isLayoutMode(containerId)) {
    // Layout mode is active
}

if (objectStateManager.isHugMode(containerId)) {
    // Hug mode is active
}

// Check child size mode on specific axis
const sizeMode = objectStateManager.getChildSizeMode(objectId, 'x'); // 'fill' or 'fixed'

// Check if child has fill enabled
if (objectStateManager.hasFillEnabled(objectId, 'x')) {
    // Object will fill parent on X axis
}

// Check if fill enabled on any axis
if (objectStateManager.hasFillEnabled(objectId)) {
    // Object has fill on at least one axis
}
```

**Why Use State Machine?**
- Single source of truth (eliminates `autoLayout.enabled` vs `layoutMode` confusion)
- Consistent checks across codebase
- Backwards compatible
- Easy to extend with new modes

**DON'T DO THIS** (old pattern):
```javascript
// ❌ Scattered property checks (inconsistent, hard to maintain)
if (obj.autoLayout?.enabled) { }
if (obj.layoutMode !== null) { }
if (obj.layoutProperties?.sizeX === 'fill') { }
```

### 3. Get Object State

```javascript
// Get single object
const objectData = ObjectStateManager.getObject(objectId);

// Get all objects
const allObjects = ObjectStateManager.getAllObjects();

// Check if object exists
if (ObjectStateManager.getObject(objectId)) {
    // Object exists
}
```

---

## UI Communication Patterns

**⚠️ CRITICAL: NEVER access window.parent.modlerComponents from Svelte iframes!**
- Svelte iframes run on different origin (localhost:5173 vs localhost:3000)
- Browser blocks cross-origin direct access → SecurityError
- **SimpleCommunication** handles all Main → UI data flow automatically
- UI updates happen automatically when ObjectEventBus emits events

### 1. Send Data to UI (Main → UI)

```javascript
// Automatic via ObjectEventBus → SimpleCommunication
// NO manual UI notification needed - just update state!

// Object state changes automatically notify UI
ObjectStateManager.updateObject(objectId, {
    position: newPosition,
    dimensions: newDimensions
});
// → ObjectEventBus emits events
// → SimpleCommunication extracts complete data via DataExtractor
// → postMessage sends to all UI iframes
// → UI automatically re-renders

// For direct ObjectEventBus emission (rare):
window.objectEventBus.emit(
    window.objectEventBus.EVENT_TYPES.GEOMETRY,
    objectId,
    { dimensions: newDimensions },
    { source: 'my-system' }
);
```

### 2. Send Commands to Main (UI → Main)

```javascript
// In Svelte component
import { unifiedCommunication } from '$lib/services/unified-communication';

// Send property update
await unifiedCommunication.instance.sendPropertyUpdate(
    objectId,
    'dimensions.x',
    newValue
);

// Send tool activation
await unifiedCommunication.instance.sendToolActivation('move');

// Send object selection
await unifiedCommunication.instance.sendSelectionChange(objectId);

// Flow: postMessage → main-integration.js → CommandRouter
// → PropertyUpdateHandler → ObjectStateManager
// → ObjectEventBus → SimpleCommunication → UI updates
```

---

## Container Operations

### 1. Create Container from Selection

```javascript
// Use ContainerCrudManager (available globally)
const containerManager = window.modlerComponents.containerCrudManager;

// Create container from selected objects
const containerId = containerManager.createContainerFromSelection();

// Container is auto-sized to fit children (hug mode)
```

### 2. Update Container Layout

```javascript
// Update layout properties
ObjectStateManager.updateObject(containerId, {
    layoutDirection: 'x',  // 'x', 'y', 'z', 'grid-xy', 'grid-xyz'
    gap: 2,                // Space between children
    padding: 1             // Space around children
});

// Resize container
ObjectStateManager.updateObject(containerId, {
    dimensions: { width: 20, height: 15, depth: 10 }
});
```

### 3. Resize Container for Content

```javascript
// Use ContainerCrudManager to auto-resize
// LayoutEngine available at: /layout/layout-engine.js
const LayoutEngine = window.LayoutEngine;

// Calculate bounds for all children
const layoutResult = sceneController.updateLayout(containerId);

// UNIFIED API: Resize container to layout bounds
containerCrudManager.resizeContainer(containerId, {
    reason: 'layout-updated',
    layoutBounds: layoutResult.layoutBounds,
    immediate: true
});
```

---

## Geometry Manipulation

### 1. Push Face

```javascript
// GeometryUtils is a static class: /application/utilities/geometry-utils.js
const GeometryUtils = window.GeometryUtils;

// Get object
const objectData = ObjectStateManager.getObject(objectId);
const geometry = objectData.geometry;

// Push face
const newGeometry = GeometryUtils.pushGeometryFace(
    geometry,
    faceIndex,
    pushDistance
);

// Update via ObjectStateManager
ObjectStateManager.updateObject(objectId, {
    geometry: newGeometry
});
```

### 2. Create Box Geometry

```javascript
// Create box at position
const boxGeometry = GeometryUtils.createBoxAtPosition(
    position,    // {x, y, z}
    dimensions   // {width, height, depth}
);

// Add to scene via SceneController
const sceneController = window.modlerComponents.sceneController;
sceneController.addObject({
    type: 'box',
    geometry: boxGeometry,
    position: position,
    dimensions: dimensions
});
```

### 3. Resize Geometry

```javascript
// Resize existing object
const currentData = ObjectStateManager.getObject(objectId);

ObjectStateManager.updateObject(objectId, {
    dimensions: {
        x: newWidth,
        y: newHeight,
        z: newDepth
    }
});

// Geometry will be updated automatically
```

---

## Dimension Management

**⭐ NEW IN V2**: Dimensions are NO LONGER cached - always read from geometry

### 1. Read Dimensions

```javascript
// Direct access via DimensionManager (recommended)
const dimensions = window.dimensionManager.getDimensions(objectId);
// Returns: { x: 10, y: 5, z: 8 }

// Or via backward-compatible getter
const objectData = sceneController.getObject(objectId);
const dimensions = objectData.dimensions;  // Calls DimensionManager internally
// Returns: { x: 10, y: 5, z: 8 }

// Read single axis
const width = window.dimensionManager.getDimension(objectId, 'x');
// Returns: 10
```

### 2. Write Dimensions

```javascript
// Via DimensionManager (direct geometry modification)
window.dimensionManager.setDimensions(objectId, {
    x: 20,  // New width
    y: 10,  // New height
    z: 15   // New depth
}, 'center');  // Anchor mode: 'center' | 'min' | 'max'

// Or via ObjectStateManager (recommended - triggers layout updates)
ObjectStateManager.updateObject(objectId, {
    dimensions: { x: 20, y: 10, z: 15 }
});
// Internally calls DimensionManager.setDimensions()

// Update single axis
window.dimensionManager.setDimension(objectId, 'x', 20, 'center');
```

### 3. Serialization

```javascript
// SAVE: Read from geometry
const dimensions = window.dimensionManager.getDimensionsForSerialization(objectId);
sceneData.objects.push({
    id: objectId,
    dimensions: dimensions,  // { x: 10, y: 5, z: 8 }
    // ... other properties
});

// LOAD: Validate and restore
window.dimensionManager.restoreDimensionsFromSerialization(
    objectId,
    savedDimensions
);
// Compares with geometry, fixes mismatches if found
```

### 4. Key Principles

```javascript
// ✅ CORRECT: Dimensions always fresh from geometry
const dimensions = objectData.dimensions;  // Getter reads from geometry
console.log(dimensions);  // Always current, never stale

// ✅ CORRECT: No caching means no sync issues
GeometryUtils.pushGeometryFace(geometry, face, delta);
const newDimensions = objectData.dimensions;  // Reflects push immediately

// ❌ OLD SYSTEM (deprecated): Cached dimensions could be stale
// objectData.dimensions = { x: 10, y: 5, z: 8 };  // No longer exists
// sceneController.calculateObjectDimensions(mesh, objectData);  // Removed
```

---

## Visual Effects & Support Meshes

### 1. Show Support Mesh

```javascript
// ALWAYS show/hide, NEVER recreate
// VisualizationManager: /interaction/visualization-manager.js
const visualizationManager = window.modlerComponents.visualizationManager;

// Show edges
visualizationManager.showSupportMesh(objectId, 'edges');

// Show measurements
visualizationManager.showSupportMesh(objectId, 'measurements');

// Hide support mesh
visualizationManager.hideSupportMesh(objectId, 'edges');
```

### 2. Face Highlighting (UNIFIED SYSTEM)

**⚠️ CRITICAL: There is ONE face highlighting system - support mesh based**
**NEVER create alternate implementations or bypass this architecture**

```javascript
// PATTERN 1: Tool Hover (raycast-based)
// Used by: MoveTool, PushTool via BaseFaceToolBehavior
const supportMeshes = targetObject.userData?.supportMeshes;
if (supportMeshes?.faceHighlight) {
    const supportMeshFactory = window.modlerComponents?.supportMeshFactory;

    // Position for raycast hit
    supportMeshFactory.positionFaceHighlightForHit(supportMeshes.faceHighlight, hit);

    // Show the highlight
    supportMeshes.faceHighlight.visible = true;
}

// Clear on hover end
supportMeshes.faceHighlight.visible = false;
```

```javascript
// PATTERN 2: Button Hover (axis-based)
// Used by: Layout buttons, fill buttons, tile tool axis buttons
const selectedObject = selectionController.getSelectedObjects()[0];
const supportMeshes = selectedObject.userData?.supportMeshes;
if (supportMeshes?.faceHighlight) {
    const supportMeshFactory = window.modlerComponents?.supportMeshFactory;
    const visualEffects = window.modlerComponents?.visualEffects;

    // Enable button highlight mode (prevents tool hover clearing)
    visualEffects.setButtonHighlight(true);

    // Position for camera-facing face on axis
    supportMeshFactory.positionFaceHighlightForAxis(
        supportMeshes.faceHighlight,
        selectedObject,
        axis,  // 'x', 'y', or 'z'
        true   // camera-facing only
    );

    // Show the highlight
    supportMeshes.faceHighlight.visible = true;
}

// Clear on button unhover
visualEffects.setButtonHighlight(false);
supportMeshes.faceHighlight.visible = false;
```

**Key Principles:**
- ✅ ONE system - support mesh based (child of object)
- ✅ Two entry points - `positionFaceHighlightForHit()` (raycast) or `positionFaceHighlightForAxis()` (axis)
- ✅ Works identically for containers and regular objects
- ✅ Pre-created mesh - show/hide only, never recreate
- ✅ Automatic transform inheritance (no manual syncing)
- ❌ NEVER create separate world-space highlight meshes
- ❌ NEVER bypass support mesh system for "special cases"

**Full Documentation:** `/documentation/architecture/FACE-HIGHLIGHTING-SYSTEM.md`

### 3. Face Highlight Materials & States

```javascript
// Face highlights use different materials for different states
const supportMeshFactory = window.modlerComponents?.supportMeshFactory;

// Materials are pooled for consistent updates:
// - faceHighlight: Regular objects (object color at user-defined opacity)
// - faceHighlightContainer: Containers (container color at user-defined opacity)
// - faceHighlightDisabled: Disabled state (grey #888888 at user-defined opacity)

// Swap to disabled state (grey) when tool not allowed on object
if (supportMeshFactory && supportMeshFactory.materials.faceHighlightDisabled) {
    // Store original material for restoration
    if (!supportMeshes.faceHighlight.userData.originalMaterial) {
        supportMeshes.faceHighlight.userData.originalMaterial = supportMeshes.faceHighlight.material;
    }
    // Swap to grey disabled material
    supportMeshes.faceHighlight.material = supportMeshFactory.materials.faceHighlightDisabled;
}

// Restore original material
if (supportMeshes.faceHighlight.userData.originalMaterial) {
    supportMeshes.faceHighlight.material = supportMeshes.faceHighlight.userData.originalMaterial;
    supportMeshes.faceHighlight.userData.originalMaterial = null;
}
```

### 4. Material Initialization & Configuration

```javascript
// CRITICAL: Material initialization timing and config conflicts
// Materials created BEFORE ConfigurationManager loads get fallback defaults
// Solution: Update existing material instances after config loads

// In v2-main.js initializeApplication():
if (modlerV2Components.supportMeshFactory && modlerV2Components.materialManager) {
    const configManager = modlerV2Components.configurationManager;
    const materialManager = modlerV2Components.materialManager;

    // Get loaded config values
    const faceColor = configManager.get('visual.selection.color');
    const faceOpacity = configManager.get('visual.selection.faceHighlightOpacity');
    const containerColor = configManager.get('visual.containers.wireframeColor');
    const containerOpacity = configManager.get('visual.containers.faceHighlightOpacity');

    // Update existing material instances (DON'T recreate - that breaks references!)
    materialManager.updateMaterialsOfType(materialManager.materialTypes.FACE_HIGHLIGHT, 'color', faceColor);
    materialManager.updateMaterialsOfType(materialManager.materialTypes.FACE_HIGHLIGHT, 'opacity', faceOpacity);

    materialManager.updateMaterialsOfType(materialManager.materialTypes.FACE_HIGHLIGHT_CONTAINER, 'color', containerColor);
    materialManager.updateMaterialsOfType(materialManager.materialTypes.FACE_HIGHLIGHT_CONTAINER, 'opacity', containerOpacity);
}
```

**Key Rules**:
- ❌ **NEVER** recreate materials to update config values (breaks object references)
- ✅ **ALWAYS** use `updateMaterialsOfType()` to modify existing instances
- ⚠️ **WATCH** for conflicting config callbacks updating same material type
- 📝 **UPDATE** both color AND opacity when config loads

**Config Callback Conflicts**:
```javascript
// BAD: Multiple callbacks updating same material
this.registerConfigCallback('visual.effects.materials.face.opacity', (newValue) => {
    this.updateMaterialsOfType(this.materialTypes.FACE_HIGHLIGHT, 'opacity', newValue); // Default: 0.6
});
this.registerConfigCallback('visual.selection.faceHighlightOpacity', (newValue) => {
    this.updateMaterialsOfType(this.materialTypes.FACE_HIGHLIGHT, 'opacity', newValue); // User: 0.18
});
// Result: Race condition! One overwrites the other.

// GOOD: Single callback per material property
this.registerConfigCallback('visual.selection.faceHighlightOpacity', (newValue) => {
    this.updateMaterialsOfType(this.materialTypes.FACE_HIGHLIGHT, 'opacity', newValue);
});
```

### 5. Prevent Face Highlight Flicker

```javascript
// Track which face is hovered to prevent repositioning on every mouse move
this.hoveredFaceIndex = null;

onHover(hit) {
    // Create unique face identifier from vertex indices
    const currentFaceIndex = hit.face.a + '-' + hit.face.b + '-' + hit.face.c;
    const faceChanged = this.hoveredFaceIndex !== currentFaceIndex || this.hoveredObject !== targetObject;

    // Only reposition if we're hovering a different face
    if (faceChanged) {
        this.hoveredFaceIndex = currentFaceIndex;
        supportMeshFactory.positionFaceHighlightForHit(supportMeshes.faceHighlight, hit);
    }
}

// Clear tracked face on hover end
clearHover() {
    this.hoveredFaceIndex = null;
    // ... clear visuals
}
```

### 6. Update Support Mesh

```javascript
// Support meshes update automatically when geometry changes
// via GeometryUtils.updateSupportMeshes()

// Manual update if needed
const mesh = sceneController.getMeshByObjectId(objectId);
GeometryUtils.updateSupportMeshes(mesh);
```

---

## Tool Development Template

### 1. Basic Tool Structure

```javascript
// File location: /application/tools/[tool-name].js

export class MyTool {
    constructor(sceneController, inputController, selectionController) {
        this.sceneController = sceneController;
        this.inputController = inputController;
        this.selectionController = selectionController;

        this.isActive = false;
        this.currentHighlight = null;
    }

    activate() {
        this.isActive = true;
        // Setup tool state
    }

    deactivate() {
        this.isActive = false;
        this.clearHighlight();
    }

    onMouseMove(event, raycaster) {
        if (!this.isActive) return;

        // Raycast to find objects
        const hit = this.raycastObjects(raycaster);
        if (hit) {
            this.showHighlight(hit);
        } else {
            this.clearHighlight();
        }
    }

    onClick(event, raycaster) {
        if (!this.isActive) return;

        const hit = this.raycastObjects(raycaster);
        if (hit) {
            this.handleClick(hit);
        }
    }

    onDrag(event, raycaster, dragStart) {
        if (!this.isActive) return;

        // Handle drag operation
    }

    hasActiveHighlight() {
        return this.currentHighlight !== null;
    }

    raycastObjects(raycaster) {
        // Implement raycasting logic
        const intersects = raycaster.intersectObjects(
            this.sceneController.getInteractableObjects(),
            true
        );
        return intersects.length > 0 ? intersects[0] : null;
    }

    showHighlight(hit) {
        this.currentHighlight = hit;
        // Show visual feedback via VisualizationManager
    }

    clearHighlight() {
        this.currentHighlight = null;
        // Clear visual feedback
    }
}
```

### 1a. Tool State Separation Pattern (Visual Feedback vs Operation Blocking)

```javascript
// PATTERN: Separate visual feedback from operation blocking
// Show disabled state visuals while blocking actual operation

// Example: Push tool on hug-mode container
// - Show grey face highlight (visual feedback)
// - Block push operation (functionality)

export class PushTool {
    // Allow visual feedback for all valid objects
    shouldShowFaceHighlight(hit) {
        if (!hit || !hit.object) return false;
        const targetObject = this.faceToolBehavior.getTargetObject(hit);
        if (!targetObject) return false;

        // Let base-face-tool-behavior handle disabled state visuals
        // Operation blocking happens later in startPush()
        return true;
    }

    // Block actual operation for invalid states
    startPush(hit) {
        const targetObject = this.faceToolBehavior.getTargetObject(hit);
        if (!targetObject) return;

        // Check if operation is allowed
        const sceneController = window.modlerComponents?.sceneController;
        if (sceneController && targetObject.userData?.id) {
            const objectData = sceneController.getObjectByMesh(targetObject);

            // Block push on containers in hug mode
            if (objectData?.isContainer) {
                const isLayoutEnabled = objectData.autoLayout?.enabled;
                if (!isLayoutEnabled) {
                    console.log('⚠️ Push blocked: Container is in hug mode');
                    return;  // Block operation, but visual feedback already shown
                }
            }
        }

        // Proceed with operation
        this.performPush(targetObject, hit);
    }
}

// In base-face-tool-behavior.js - handles visual feedback
onHover(hit) {
    // Determine if operation is disabled
    const isDisabledAction = !this.isActionAllowed(targetObject);

    // Show face highlight with appropriate material
    if (isDisabledAction) {
        // Swap to grey disabled material
        if (!supportMeshes.faceHighlight.userData.originalMaterial) {
            supportMeshes.faceHighlight.userData.originalMaterial = supportMeshes.faceHighlight.material;
        }
        supportMeshes.faceHighlight.material = supportMeshFactory.materials.faceHighlightDisabled;
    }

    supportMeshes.faceHighlight.visible = true;
}
```

### 2. Tool with State Changes

```javascript
handleClick(hit) {
    const objectId = hit.object.userData.objectId;

    // Update state via ObjectStateManager
    const ObjectStateManager = window.modlerComponents.objectStateManager;
    ObjectStateManager.updateObject(objectId, {
        property: newValue
    });

    // UI notification happens automatically
}
```

### 3. Tool with Undo/Redo

```javascript
// Commands: /application/commands/[command-name].js
class MyCommand {
    constructor(objectId, oldValue, newValue) {
        this.objectId = objectId;
        this.oldValue = oldValue;
        this.newValue = newValue;
    }

    execute() {
        const ObjectStateManager = window.modlerComponents.objectStateManager;
        ObjectStateManager.updateObject(this.objectId, {
            property: this.newValue
        });
    }

    undo() {
        const ObjectStateManager = window.modlerComponents.objectStateManager;
        ObjectStateManager.updateObject(this.objectId, {
            property: this.oldValue
        });
    }
}

// In tool
handleAction(objectId, newValue) {
    const ObjectStateManager = window.modlerComponents.objectStateManager;
    const oldValue = ObjectStateManager.getObject(objectId).property;

    const command = new MyCommand(objectId, oldValue, newValue);
    const historyManager = window.modlerComponents.historyManager;
    historyManager.executeCommand(command);
}
```

---

## Selection Patterns

### 1. Select Object

```javascript
// SelectionController: /interaction/selection-controller.js
const selectionController = window.modlerComponents.selectionController;

// Select object
selectionController.selectObject(objectId);

// Get current selection
const selectedId = selectionController.getSelectedObjectId();

// Clear selection
selectionController.clearSelection();
```

### 2. Container-First Selection

```javascript
// Single click → select parent container
const objectData = ObjectStateManager.getObject(objectId);
const containerParent = objectData.parent;

if (containerParent) {
    const parentData = ObjectStateManager.getObject(containerParent);
    if (parentData && parentData.isContainer) {
        selectionController.selectObject(containerParent);
    }
}

// Double click → select direct child
selectionController.selectObject(objectId);
```

---

## Layout Engine Patterns

### 1. Container Push Operations (Pure Alignment-Based)

```javascript
// ARCHITECTURE: Layout engine is single source of truth for child positioning/sizing
// Push tool ONLY modifies container geometry, layout engine handles everything else

// In push-tool.js or similar:

// 1. Modify container geometry using unified approach
const geometryUtils = window.modlerComponents.geometryUtils;
const success = geometryUtils.resizeGeometry(
    containerMesh.geometry,
    axis,           // 'x', 'y', or 'z'
    newDimension,   // new size on axis
    anchorMode      // 'min', 'center', or 'max' (which face to anchor)
);

// 2. Let layout engine recalculate child positions/sizes
const sceneController = window.modlerComponents.sceneController;
const pushContext = { axis: axis }; // Minimal context
sceneController.updateLayout(containerId, pushContext);

// Layout engine will:
// - Resize fill objects on their fill axes (always use 'center' anchor)
// - Reposition ALL objects based on alignment (bottom/center/top, etc.)
// - Adjust gaps if no fill objects (space-between distribution)
// - Anchor first object to start edge when using space-between
```

**Key Principles:**
- **Unified geometry**: Containers and objects use same `resizeGeometry()` method
- **No manual positioning**: Never manually adjust child positions - layout engine does it
- **Pure alignment-based**: Children anchor to their aligned edges (CSS-like)
- **Fill resizes symmetrically**: Always 'center' anchor, layout engine repositions
- **Space-between**: First object anchors to start edge, gaps distribute evenly

**DON'T DO THIS** (old pattern):
```javascript
// ❌ Manual child position adjustments (conflicts with layout engine)
const geometryShift = (newDim - oldDim) / 2;
children.forEach(child => {
    child.mesh.position[axis] += geometryShift * alignmentFactor; // WRONG!
});

// ❌ Geometry recreation every frame (expensive + causes desync)
const newGeometry = geometryFactory.createBoxGeometry(x, y, z); // WRONG!
containerMesh.geometry = newGeometry;

// ❌ Skipping alignment application during push
if (pushContext) return positions; // WRONG! Always apply alignment
```

### 2. Calculate Layout

```javascript
// LayoutEngine: /layout/layout-engine.js
const LayoutEngine = window.LayoutEngine;

// Get container data
const containerData = ObjectStateManager.getObject(containerId);
const children = containerData.children || [];

// Calculate layout positions
const layoutConfig = {
    direction: containerData.layoutDirection || 'x',
    gap: containerData.gap || 0,
    padding: containerData.padding || 0
};

// Apply layout
children.forEach((childId, index) => {
    const childData = ObjectStateManager.getObject(childId);
    const newPosition = LayoutEngine.calculateChildPosition(
        index,
        childData,
        layoutConfig
    );

    ObjectStateManager.updateObject(childId, {
        position: newPosition
    });
});
```

### 2. Calculate Container Bounds

```javascript
// Get all children objects
const childrenObjects = children.map(id =>
    ObjectStateManager.getObject(id)
);

// Calculate unified bounds
const bounds = LayoutEngine.calculateUnifiedBounds(
    childrenObjects,
    containerData.gap || 0,
    containerData.padding || 0
);

// bounds = { width, height, depth, center }
```

---

## Event Handling Patterns

### 1. Listen to ObjectStateManager Events

```javascript
// ObjectStateManager extends EventTarget
const ObjectStateManager = window.modlerComponents.objectStateManager;

// Listen for object updates
ObjectStateManager.addEventListener('objectUpdated', (event) => {
    const { objectId, updates } = event.detail;
    // React to changes
});

// Listen for object addition
ObjectStateManager.addEventListener('objectAdded', (event) => {
    const { objectId } = event.detail;
    // React to new object
});

// Listen for object deletion
ObjectStateManager.addEventListener('objectDeleted', (event) => {
    const { objectId } = event.detail;
    // Clean up
});
```

### 2. Listen to UI Messages (Svelte)

```typescript
// In Svelte UI components: /svelte-ui/src/lib/services/
import { UnifiedCommunication } from '$lib/services/unified-communication';

UnifiedCommunication.on('objectUpdated', (data) => {
    // Update UI components
});
```

---

## Raycasting & Selection Patterns

### 1. Making Objects Non-Raycastable

```javascript
// Disable raycasting on a single mesh (prevents mouse interaction)
mesh.raycast = () => {};

// Disable raycasting recursively on entire hierarchy
group.raycast = () => {};
group.traverse(child => {
    child.raycast = () => {};
});

// Example: Floor grid should never be selectable
const floorPlane = new THREE.Mesh(geometry, material);
floorPlane.raycast = () => {}; // Invisible collision plane

const gridHelper = createGridHelper();
gridHelper.raycast = () => {}; // Grid lines
gridHelper.traverse(child => child.raycast = () => {});

const floorGroup = new THREE.Group();
floorGroup.add(gridHelper, floorPlane);
floorGroup.raycast = () => {}; // Group itself
```

**Key Points**:
- `selectable: false` in userData does NOT prevent raycasting
- Raycaster hits EVERYTHING by default - must explicitly disable
- Setting `raycast = () => {}` makes object completely invisible to raycaster
- Always traverse children for groups/hierarchies

### 2. Handling Raycast Results

```javascript
// In tool's onClick handler
onClick(hit, event) {
    if (hit && hit.object) {
        // Object was hit - validate it's selectable
        this.selectionController.handleObjectClick(hit.object, event);
    } else {
        // No hit - treat as empty space
        this.selectionController.handleEmptySpaceClick(event);
    }
}
```

### 3. Resolving Support Meshes to Main Objects

```javascript
// Support meshes (wireframes, highlights) must be resolved to parent
const resolveMainObjectFromHit = (hit) => {
    if (!hit || !hit.object) return null;

    // Walk up parent hierarchy to find object with userData.id
    let current = hit.object;
    while (current) {
        if (current.userData && current.userData.id !== undefined) {
            return current;  // Found main object
        }
        current = current.parent;
    }

    return hit.object;  // Fallback to original hit
};

// Then validate the resolved object
const mainObject = resolveMainObjectFromHit(hit);
if (!mainObject) {
    console.warn('Could not resolve main object');
    return null;
}

const objectData = sceneController.getObjectByMesh(mainObject);
if (!objectData) {
    console.warn('Object has no objectData:', mainObject.uuid);
    return null;
}

if (objectData.selectable === true) {
    // Safe to select
    return mainObject;
}
```

### 4. Layer-Based Raycasting

```javascript
// Configure raycaster layers based on selection state
if (isContainerSelected) {
    // Layer 1: Only container interactive meshes
    this.raycaster.layers.set(1);
} else {
    // Layer 0: Regular objects
    this.raycaster.layers.set(0);
}

const intersects = this.raycaster.intersectObjects(this.scene.children, true);

// Process hits with proper fallback coverage
for (let hit of intersects) {
    const mainObject = resolveMainObjectFromHit(hit);
    if (!mainObject) continue;

    const objectData = sceneController.getObjectByMesh(mainObject);
    if (!objectData) continue;

    // Check different cases:
    // 1. Child of selected container
    // 2. Selected container itself
    // 3. Standalone selectable object (IMPORTANT: don't forget this!)

    if (objectData.parentContainer) {
        // Return parent container
    } else if (objectData.isContainer && isSelected) {
        // Return selected container
    } else if (objectData.selectable === true && !objectData.isContainer) {
        // Return standalone object (fallback case)
        return mainObject;
    }
}
```

### 5. Selection Visualization

```javascript
// Update selection wireframe (handled by VisualizationManager)
if (visualizationManager) {
    visualizationManager.setState(object, 'selected');  // Show wireframe
}

// Clear selection wireframe
if (visualizationManager) {
    visualizationManager.setState(object, 'normal');  // Hide wireframe
}

// Batch clear all selections
const objectsToDeselect = Array.from(selectedObjects);
objectsToDeselect.forEach(object => {
    visualizationManager.setState(object, 'normal');
});
selectedObjects.clear();
```

**Best Practices**:
- Always validate resolved object has objectData before using
- Add null checks at every step of resolution chain
- Log warnings for debugging, not errors (orphaned meshes are expected)
- Handle all cases in layer-based raycasting (children, containers, standalone)
- Use `traverse()` to disable raycasting on entire hierarchies

---

## Global Component Access

All major components are available via `window.modlerComponents`:

```javascript
const {
    objectStateManager,
    sceneController,
    selectionController,
    visualizationManager,
    historyManager,
    toolController,
    inputController,
    cameraController,
    containerCrudManager,
    commandRouter
} = window.modlerComponents;

// Standalone global (not in modlerComponents)
const dimensionManager = window.dimensionManager;  // /core/dimension-manager.js
```

---

## Serialization & Schema Patterns

### 1. ObjectDataFormat Schema

```javascript
// File: /application/serialization/object-data-format.js
// CRITICAL: All object properties MUST be in schema or they will be stripped during sync

// Schema defines allowed properties and types
const schema = {
    autoLayout: {
        enabled: 'boolean',
        direction: 'string|null',
        gap: 'number',
        padding: 'object',
        alignment: 'object|undefined',
        reversed: 'boolean|undefined',  // Add new properties here
        tileMode: 'object|undefined'
    }
};

// Default objects must include ALL schema properties
const defaultAutoLayout = {
    enabled: false,
    direction: null,
    gap: 0,
    padding: { width: 0, height: 0, depth: 0 },
    reversed: false,  // Add defaults here too
    alignment: null
};
```

### 2. Adding New Properties (Checklist)

When adding a new object property that needs to persist:

1. **Add to schema** (`object-data-format.js` line ~51-58)
   ```javascript
   autoLayout: {
       // ... existing properties
       newProperty: 'type|undefined'  // e.g., 'boolean|undefined'
   }
   ```

2. **Add to ALL default objects** (search for `autoLayout: {` in same file)
   ```javascript
   autoLayout: {
       enabled: false,
       direction: null,
       // ... existing defaults
       newProperty: defaultValue  // e.g., false, null, 0
   }
   ```

3. **Update UI components** that use the property
   ```typescript
   // Preserve property when updating
   const currentValue = displayObject.autoLayout?.newProperty ?? defaultValue;
   ```

### 3. Schema Validation Gotchas

**Problem**: Property works in code but doesn't persist or sync to UI
**Cause**: Missing from ObjectDataFormat schema
**Solution**: Add to schema + all default objects

```javascript
// Example: reversed property was missing from schema
// Symptom: UI showed reversed: false even after clicking reverse button
// Fix: Added reversed: 'boolean|undefined' to schema (line 57)
//      Added reversed: false to all default autoLayout objects
```

---

## Common Mistakes to Avoid

❌ **DON'T**:
```javascript
// Direct mesh manipulation
mesh.position.set(x, y, z);  // WRONG

// Direct material changes
mesh.material.color.set(0xff0000);  // WRONG

// Bypass ObjectStateManager
sceneController.updateObject(id, data);  // WRONG

// Direct postMessage
window.postMessage({type: 'update'});  // WRONG

// Recreate support meshes
createEdges(object);  // WRONG - show/hide only

// Wrong import paths
import { ObjectStateManager } from '../core/ObjectStateManager.js';  // WRONG (PascalCase)

// Add new property without updating schema
autoLayout.newProp = true;  // WRONG - will be stripped during sync
```

✅ **DO**:
```javascript
// Use ObjectStateManager (UI updates automatically via SimpleCommunication)
ObjectStateManager.updateObject(id, {
    position: {x, y, z}
});
// → ObjectEventBus → SimpleCommunication → postMessage → UI updates

// Show/hide support meshes
visualizationManager.showSupportMesh(id, 'edges');

// Correct import paths (kebab-case)
import { LayoutEngine } from '../layout/layout-engine.js';  // CORRECT

// Or use global components
const ObjectStateManager = window.modlerComponents.objectStateManager;

// Add new property to schema first
// 1. Update schema in object-data-format.js
// 2. Add to all default objects
// 3. Then use in code
```

---

**For detailed system documentation**: See `/documentation/README.md`
