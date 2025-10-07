# Development Validator - Anti-Pattern Detection

## Overview
The DevelopmentValidator automatically detects architectural violations and suggests correct patterns. It runs in development mode only (localhost or `?dev=true`).

## Detected Anti-Patterns

### 1. **Resource Creation Violations**

#### ❌ Manual THREE.js Creation
```javascript
// WRONG - Manual creation
const geometry = new THREE.BoxGeometry(1, 1, 1);
const material = new THREE.MeshBasicMaterial({ color: 0xff0000 });
const mesh = new THREE.Mesh(geometry, material);
```

#### ✅ Correct - Use Resource Pools
```javascript
// RIGHT - Use centralized systems
const geometryFactory = window.modlerComponents.geometryFactory;
const geometry = geometryFactory.createBoxGeometry(1, 1, 1);

const materialManager = window.modlerComponents.materialManager;
const material = materialManager.getPreviewWireframeMaterial({ color: 0xff0000 });

const pool = window.VisualizationResourcePool;
const mesh = pool.getMeshHighlight(geometry, material);
```

**Why**: Resource pooling prevents memory leaks and improves performance through object reuse.

---

### 2. **State Management Violations**

#### ❌ Direct Mesh Manipulation
```javascript
// WRONG - Direct manipulation
mesh.position.set(1, 2, 3);
mesh.rotation.y = Math.PI / 2;
```

#### ✅ Correct - Use ObjectStateManager
```javascript
// RIGHT - Centralized state management
const objectStateManager = window.modlerComponents.objectStateManager;
objectStateManager.updateObject(objectId, {
    position: { x: 1, y: 2, z: 3 },
    rotation: { x: 0, y: 90, z: 0 }  // degrees
});
```

**Why**: ObjectStateManager ensures UI sync, event propagation, and undo/redo support.

---

### 3. **Geometry Manipulation Violations**

#### ❌ Direct Vertex Manipulation
```javascript
// WRONG - Direct geometry editing
const positions = geometry.attributes.position.array;
for (let i = 0; i < positions.length; i += 3) {
    positions[i] *= 2; // Scale X
}
geometry.attributes.position.needsUpdate = true;
```

#### ✅ Correct - Use GeometryUtils
```javascript
// RIGHT - Use geometry utilities
const geometryUtils = window.GeometryUtils;
geometryUtils.resizeGeometry(geometry, 'x', newSize, 'center');
```

**Why**: GeometryUtils maintains support mesh synchronization (wireframes, highlights, etc.).

---

### 4. **Schema Violations**

#### ❌ Mutually Exclusive Properties
```javascript
// WRONG - Conflicting container modes
sceneController.addObject(geometry, material, {
    isContainer: true,
    isHug: true,                    // Auto-resize mode
    autoLayout: { enabled: true }   // Fixed layout mode
});
```

#### ✅ Correct - Mutually Exclusive
```javascript
// RIGHT - Choose one mode
// Option A: Hug mode (auto-resize)
sceneController.addObject(geometry, material, {
    isContainer: true,
    isHug: true,
    autoLayout: { enabled: false }
});

// Option B: Layout mode (fixed size)
sceneController.addObject(geometry, material, {
    isContainer: true,
    isHug: false,
    autoLayout: { enabled: true, direction: 'x' }
});
```

**Why**: Container modes are mutually exclusive. See `/documentation/container-properties.md`.

#### ❌ Invalid Property Structure
```javascript
// WRONG - Flat structure
objectStateManager.updateObject(id, {
    positionX: 1,
    positionY: 2,
    positionZ: 3
});
```

#### ✅ Correct - Nested Objects
```javascript
// RIGHT - Proper schema
objectStateManager.updateObject(id, {
    position: { x: 1, y: 2, z: 3 }
});
```

**Why**: Schema requires nested objects for transforms. See `object-data-format.js`.

---

### 5. **Messaging Violations**

#### ❌ Direct PostMessage
```javascript
// WRONG - Bypass communication layer
iframe.contentWindow.postMessage({
    type: 'UPDATE',
    data: objectData
}, '*');
```

#### ✅ Correct - Use PropertyPanelSync
```javascript
// RIGHT - Use communication layer
const propertyPanelSync = window.modlerComponents.propertyPanelSync;
propertyPanelSync.sendToUI('UPDATE', objectData);

// OR - Use state manager (even better)
objectStateManager.updateObject(id, updates);  // Automatically syncs UI
```

**Why**: Centralized messaging ensures schema validation and security (port detection).

#### ❌ Missing Message Type
```javascript
// WRONG - No type property
postMessage({ data: objectData });
```

#### ✅ Correct - Include Type
```javascript
// RIGHT - Structured message
postMessage({
    type: 'OBJECT_UPDATE',
    data: objectData
});
```

**Why**: All messages must have a `type` per MessageProtocolSchema.

---

### 6. **Event Bus Violations**

#### ❌ Manual Event Emission
```javascript
// WRONG - Direct event emission
window.objectEventBus.emit('OBJECT_UPDATED', objectId, {
    position: newPosition
});
```

#### ✅ Correct - Let ObjectStateManager Handle It
```javascript
// RIGHT - Automatic event emission
objectStateManager.updateObject(objectId, {
    position: newPosition
});
// Events are emitted automatically by ObjectStateManager
```

**Why**: ObjectStateManager emits events in the correct order with proper metadata.

---

### 7. **Layout Update Violations**

#### ❌ Layout Update on Non-Layout Container
```javascript
// WRONG - Container doesn't have layout enabled
const container = sceneController.getObject(containerId);
// container.autoLayout.enabled = false
sceneController.updateLayout(containerId);  // ❌ Violation
```

#### ✅ Correct - Check Layout State First
```javascript
// RIGHT - Verify layout is enabled
const container = sceneController.getObject(containerId);
if (container.autoLayout?.enabled) {
    sceneController.updateLayout(containerId);
}
```

**Why**: Layout updates on non-layout containers waste CPU and cause unexpected behavior.

---

## Violation Categories

| Category | What It Catches | Fix Path |
|----------|----------------|----------|
| **Resource Creation** | Manual THREE.js object creation | Use GeometryFactory, MaterialManager, VisualizationResourcePool |
| **State Management** | Direct mesh property changes | Use ObjectStateManager.updateObject() |
| **Geometry** | Direct vertex manipulation | Use GeometryUtils methods |
| **Schema** | Invalid object structures, conflicting properties | Follow object-data-format.js schema |
| **Messaging** | Direct postMessage, missing types | Use PropertyPanelSync or ObjectStateManager |
| **Event Bus** | Manual event emission | Let ObjectStateManager emit events |
| **Layout** | Invalid layout operations | Check container.autoLayout.enabled first |

---

## Using the Validator

### View Violation Report
```javascript
// In browser console
window.checkThreeJSValidation();

// Programmatic access
const report = developmentValidator.getViolationReport();
console.log(report);
```

### Disable Validation
```javascript
developmentValidator.disable();
```

### Enable in Production
```javascript
// Add to URL
https://yourapp.com?dev=true

// Or in config
configurationManager.set('development.validation', true);
```

---

## Common Patterns We've Fixed

### Issue: Fill Objects Not Updating
**Root Cause**: Container had `isHug: true` AND `autoLayout.enabled: true`
**Fix**: Made them mutually exclusive, validator now catches this
**Validator**: Schema violation detection

### Issue: Support Meshes Out of Sync
**Root Cause**: Direct geometry vertex manipulation bypassed synchronization
**Fix**: Required using GeometryUtils
**Validator**: Geometry manipulation detection

### Issue: UI Not Updating After Move
**Root Cause**: Direct `mesh.position.set()` bypassed ObjectStateManager
**Fix**: Required using ObjectStateManager.updateObject()
**Validator**: State management violation detection

### Issue: Events Fired Out of Order
**Root Cause**: Manual ObjectEventBus.emit() calls
**Fix**: Let ObjectStateManager emit events automatically
**Validator**: Event bus violation detection

---

## Future Enhancements

- [ ] Detect duplicate event listeners (memory leaks)
- [ ] Validate parametric property dependencies
- [ ] Check for circular references in dependency graph
- [ ] Monitor component instance relationships
- [ ] Detect inefficient layout recalculations
- [ ] Track resource disposal (geometry/material leaks)

---

**Note**: The validator only runs in development mode. Production builds have zero overhead.
