# Current Data Format Analysis
## Phase 1.1 Complete: All Existing Formats Documented

### Executive Summary
The system currently uses **5 different data formats** across components, with **6+ conversion points** causing errors and complexity.

---

## Format 1: ObjectSerializer Format (NESTED OBJECTS)
**File**: `/application/serialization/object-serializer.js` (lines 190-212)
**Usage**: Official serialization output format

```javascript
{
    id: "object-123",
    name: "Object Name",
    type: "box",
    isContainer: false,
    position: { x: 1.0, y: 2.0, z: 3.0 },
    rotation: { x: 0.0, y: 45.0, z: 0.0 },
    scale: { x: 1.0, y: 1.0, z: 1.0 },
    dimensions: { x: 2.0, y: 1.0, z: 3.0 },
    material: {
        color: "ffffff",
        opacity: 1,
        transparent: false
    },
    parentContainer: "container-456",
    autoLayout: { enabled: true, direction: "x" }
}
```

**Key Characteristics:**
- Uses nested objects for transforms
- Rotation in degrees (converted from radians)
- Includes scale property
- Material as nested object
- Comprehensive property coverage

---

## Format 2: ObjectStateManager Format (NESTED OBJECTS)
**File**: `/core/object-state-manager.js` (lines 114-146)
**Usage**: Internal state storage

```javascript
{
    id: "object-123",
    name: "Object Name",
    type: "box",
    position: { x: 1.0, y: 2.0, z: 3.0 },
    rotation: { x: 0.0, y: 0.785, z: 0.0 },  // Radians!
    dimensions: { x: 2.0, y: 1.0, z: 3.0 },
    isContainer: false,
    parentContainer: "container-456",
    autoLayout: { enabled: false, direction: "x" },
    material: { color: 0x888888 },
    mesh: [Object3D],
    _sceneObjectData: [ObjectReference]
}
```

**Key Characteristics:**
- Uses nested objects for transforms
- Rotation in radians (raw Three.js values)
- No scale property
- Material as simple object with hex color
- Includes internal mesh references

---

## Format 3: Main Integration PostMessage Format (FLAT PROPERTIES)
**File**: `/integration/svelte/main-integration.js` (lines 341-372)
**Usage**: PostMessage communication to UI

```javascript
{
    id: "object-123",
    name: "Object Name",
    type: "box",

    // Flattened transform properties
    "position.x": 1.0,
    "position.y": 2.0,
    "position.z": 3.0,
    "rotation.x": 0.0,
    "rotation.y": 45.0,
    "rotation.z": 0.0,
    "dimensions.x": 2.0,
    "dimensions.y": 1.0,
    "dimensions.z": 3.0,

    // Flattened material properties
    "material.color": 0x888888,
    "material.opacity": 1,

    // Flattened container properties
    isContainer: false,
    "autoLayout.enabled": false,
    "autoLayout.direction": "x",

    parentContainer: "container-456"
}
```

**Key Characteristics:**
- **FLAT PROPERTIES** using dot notation
- Rotation in degrees
- Mix of flat and non-flat properties
- Inconsistent property naming

---

## Format 4: Svelte Store TypeScript Format (NESTED OBJECTS)
**File**: `/svelte-ui/src/lib/stores/modler.ts` (lines 4-47)
**Usage**: TypeScript interface definition

```typescript
interface ObjectData {
    id: string;
    name: string;
    type: string;
    isContainer?: boolean;
    position: { x: number; y: number; z: number };
    rotation: { x: number; y: number; z: number };
    dimensions: { x: number; y: number; z: number };
    material?: {
        color: string;
        opacity: number;
    };
    autoLayout?: {
        enabled: boolean;
        direction: string | null;
        gap: number;
        padding: { top: number; bottom: number; left: number; right: number; front: number; back: number };
    };
    sizingMode?: 'hug' | 'fixed';
    parentContainer?: string;
}
```

**Key Characteristics:**
- Uses nested objects (consistent with ObjectSerializer)
- TypeScript typed interface
- Optional properties with `?`
- More comprehensive autoLayout definition
- Includes parametric and instancing properties

---

## Format 5: Raw Three.js Format (OBJECTS WITH METHODS)
**File**: N/A - Runtime objects
**Usage**: Direct Three.js mesh objects

```javascript
{
    uuid: "abc-123-def",
    position: Vector3 { x: 1.0, y: 2.0, z: 3.0 },
    rotation: Euler { _x: 0.0, _y: 0.785, _z: 0.0 },
    scale: Vector3 { x: 1.0, y: 1.0, z: 1.0 },
    geometry: BoxGeometry { ... },
    material: MeshBasicMaterial { ... },
    userData: {
        id: "object-123",
        // ... other properties
    }
}
```

**Key Characteristics:**
- Uses Three.js Vector3/Euler objects (not plain objects)
- Rotation in radians
- Contains methods and complex objects
- Cannot be directly serialized for PostMessage

---

## Conversion Points Identified

### 1. ObjectSerializer.buildCoreData()
**File**: `object-serializer.js:190-212`
**Converts**: Three.js → ObjectSerializer Format
**Issues**: None (source of truth)

### 2. MainIntegration.propertyPanelData()
**File**: `main-integration.js:341-372`
**Converts**: ObjectStateManager → Flat Properties Format
**Issues**: ⚠️ Creates incompatible flat format

### 3. Svelte convertThreeObjectToObjectData()
**File**: `modler.ts:316-371`
**Converts**: Mixed → Svelte ObjectData Format
**Issues**: ⚠️ Complex dual-format handling

### 4. Svelte convertSerializedToObjectData()
**File**: `modler.ts:383-412`
**Converts**: Flat Properties → Nested Objects
**Issues**: ⚠️ Must handle both flat and nested

### 5. ObjectStateManager.importFromSceneController()
**File**: `object-state-manager.js:108-150`
**Converts**: SceneController → ObjectStateManager Format
**Issues**: ⚠️ Radians vs degrees mismatch

### 6. MainIntegration.sanitizeForPostMessage()
**File**: `main-integration.js:697-741`
**Converts**: Any → PostMessage Safe Format
**Issues**: ⚠️ Strips important data

---

## Entry/Exit Points Analysis

### ENTRY POINTS (Data Creation)

#### 1. BoxCreationTool.js
**Location**: `/application/tools/box-creation-tool.js:21-26`
**Format**: Uses ObjectStateManager
**Data Flow**: Tool → ObjectStateManager → Scene + UI
**Issues**: ✅ Already using unified system

#### 2. Delete/Create Commands
**Location**: `/application/commands/`
**Format**: Direct SceneController operations
**Data Flow**: Command → SceneController → ObjectStateManager
**Issues**: ⚠️ May bypass standardization

#### 3. Scene Import/Load
**Location**: `/scene/scene-controller.js`
**Format**: Raw Three.js objects
**Data Flow**: File → SceneController → ObjectStateManager
**Issues**: ⚠️ Needs import format validation

### PROCESSING POINTS (Data Transformation)

#### 4. MoveTool.js
**Location**: `/application/tools/move-tool.js:24,39`
**Format**: Uses ObjectStateManager
**Data Flow**: Interaction → ObjectStateManager → Scene + UI
**Issues**: ✅ Already using unified system

#### 5. TransformationManager.js
**Location**: `/application/utilities/transformation-manager.js:22,48`
**Format**: Integrates with ObjectEventBus
**Data Flow**: Transform → ObjectEventBus → ObjectStateManager
**Issues**: ✅ Already using unified system

#### 6. PropertyManager.js
**Location**: `/application/managers/property-manager.js`
**Format**: Unknown (needs investigation)
**Data Flow**: Property Changes → ? → ObjectStateManager
**Issues**: ⚠️ Needs format verification

### EXIT POINTS (Data Consumption)

#### 7. Svelte UI Stores
**Location**: `/svelte-ui/src/lib/stores/modler.ts`
**Format**: Mixed (handles multiple formats)
**Data Flow**: ObjectStateManager → PostMessage → Svelte Stores
**Issues**: ⚠️ Complex conversion logic needs removal

#### 8. Property Panel Components
**Location**: `/svelte-ui/src/lib/components/`
**Format**: Expects nested objects
**Data Flow**: Stores → Components → Display
**Issues**: ⚠️ May receive flat properties

#### 9. Hierarchy Panel
**Location**: `/svelte-ui/src/lib/components/`
**Format**: Array of ObjectData
**Data Flow**: ObjectStateManager → UI List
**Issues**: ⚠️ Format consistency needed

#### 10. PostMessage Communication
**Location**: `/integration/svelte/main-integration.js`
**Format**: Mixed (sanitized + flat properties)
**Data Flow**: ObjectStateManager → Sanitize → PostMessage → UI
**Issues**: ⚠️ Major source of format inconsistency

### LEGACY POINTS (Deprecated)

#### 11. PropertyPanelSync (if exists)
**Location**: `/integration/svelte/property-panel-sync.js`
**Format**: Legacy format handling
**Data Flow**: Various → Legacy conversion → UI
**Issues**: ⚠️ Should be removed in favor of ObjectStateManager

---

## Problems Caused by Multiple Formats

1. **Data Loss**: Sanitization removes important properties
2. **Type Errors**: Flat properties cause "Cannot read properties of undefined"
3. **Conversion Overhead**: 6+ conversion functions with different logic
4. **Rotation Confusion**: Radians vs degrees inconsistency
5. **Property Mismatch**: Some properties flat, others nested
6. **Maintenance Burden**: Changes require updating multiple converters
7. **Testing Complexity**: Must test all format combinations
8. **Performance Impact**: Multiple conversions on every update

---

## Recommendation: Single Standard Format

**Proposed**: Use ObjectSerializer format (Format 1) as the single standard
**Reasoning**:
- Already most comprehensive
- Properly handles all property types
- Uses consistent nested structure
- Handles units correctly (degrees for UI)
- Includes all necessary metadata

**Migration Path**:
1. Remove flat property generation in main-integration.js
2. Remove dual-format handling in Svelte stores
3. Standardize ObjectStateManager to match ObjectSerializer
4. Simplify PostMessage to send ObjectSerializer format directly
5. Remove all conversion functions except Three.js → ObjectSerializer

---

## Files Requiring Updates

**Phase 2-3: Core Infrastructure**
- `/application/serialization/object-serializer.js` - Source of truth
- `/core/object-state-manager.js` - Align storage format

**Phase 4: Communication**
- `/integration/svelte/main-integration.js` - Remove flat format
- `/integration/svelte/property-panel-sync.js` - Use standard format

**Phase 5: UI**
- `/svelte-ui/src/lib/stores/modler.ts` - Remove conversion logic
- `/svelte-ui/src/lib/bridge/threejs-bridge.ts` - Simplify handling

**Phase 6: Tools**
- `/application/tools/move-tool.js` - Ensure standard format usage
- `/application/tools/rotate-tool.js` - Ensure standard format usage
- `/application/tools/scale-tool.js` - Ensure standard format usage
- `/application/tools/push-tool.js` - Ensure standard format usage
- `/application/tools/box-creation-tool.js` - Ensure standard format usage

This analysis provides the foundation for implementing the unified format system outlined in the main project plan.