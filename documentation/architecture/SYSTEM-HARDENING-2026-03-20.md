# System Hardening & Performance Improvements

**Date**: 2026-03-20
**Scope**: Data integrity, performance, scalability, error reduction
**Files Modified**: 8 core files across state management, serialization, communication, and scene layers

---

## Overview

Systematic analysis of ~12,000 lines across 16 core files identified subtle data integrity risks, missing caches, and patterns that wouldn't scale past ~100 objects. All fixes follow the "surgical fixes over rewrites" principle.

## Tier 1: Data Integrity Fixes

### 1.1 Rotation Unit Heuristic Removed
**File**: `application/serialization/object-data-format.js`

**Problem**: `convertFromObjectStateManager()` used `stateData.rotation.x > Math.PI` to detect radians vs degrees. Values in [0, π] (0-180°) were ambiguous — a 2-radian rotation (114°) would not be converted because 2 < π.

**Fix**: Removed the heuristic. ObjectStateManager already stores rotation in degrees (via `extractRotation()` which converts radians→degrees). The conversion in `convertFromObjectStateManager` was redundant and broken.

### 1.2 Deep Copy autoLayout in DataExtractor
**File**: `application/serialization/data-extractor.js`

**Problem**: `{ ...sceneObject.autoLayout }` was a shallow copy. Nested sub-objects (`padding`, `alignment`, `tileMode`) shared references with live SceneController data. UI-side mutation could corrupt 3D engine state.

**Fix**: Deep-copies all nested sub-objects in both `extractSerializableData()` and `extractBasicData()`.

### 1.3 Changed Properties Merge Guard
**File**: `core/object-state-manager.js`

**Problem**: `object._changedProperties = changedProperties` overwrote previous values. Currently safe due to synchronous propagation, but would lose change context if propagation ever becomes async.

**Fix**: Merges into existing Set instead of replacing.

### 1.4 Dead Code Removal
**File**: `application/handlers/property-update-handler.js`

Removed `toggleFillProperty()` (66 lines) — dead method referencing undefined `sizeProperty` variable. Replaced by `handleFillButtonToggle()`.

### 1.5 Cache Cleanup on Object Deletion
**File**: `scene/scene-lifecycle-manager.js`

**Problem**: VisualizationManager's type/visualizer caches and LayoutPropagationManager's depth cache never evicted entries for deleted objects, causing memory leaks with frequent create/delete cycles.

**Fix**: Added cleanup calls in `removeObject()`:
- `visualizationManager.cleanup(mesh)` — removes type/visualizer cache entries
- `layoutPropagationManager.depthCache.delete(id)` — removes stale depth entry
- Also clears from `scheduledLayoutUpdates` and `nextFramePropagations`

## Tier 2: Performance & Scalability

### 2.1 Child Lookup Optimization
**File**: `scene/scene-hierarchy-manager.js`

**Problem**: `getChildObjects()` fallback path iterated ALL objects (O(n)) when `childrenOrder` was uninitialized.

**Fix**: Initializes `childrenOrder` on first access for legacy data (O(n) once, then O(c) forever). Eliminates the fallback path entirely.

### 2.2 Programmatic Container Mode Flag Sync
**File**: `core/object-state-manager.js`

**Problem**: `containerMode`/`isHug`/`sizingMode` sync was enforced only by CLAUDE.md convention. Direct writes to any flag could silently desync state.

**Fix**: `applyUpdates()` now intercepts writes to any of these three properties and auto-routes through `buildContainerModeUpdate()`. The "never set directly" rule is now impossible to violate.

### 2.4 Hierarchy Cache
**File**: `integration/communication/simple-postmessage.js`

**Problem**: `getCompleteHierarchy()` rebuilt the entire object tree (O(n log n) sort + O(n) filter) on every HIERARCHY event, even for non-structural changes like layout property updates.

**Fix**: Caches the hierarchy array. Invalidation only on structural events (create/delete/reparent/reorder). Non-structural hierarchy events (layout property changes) reuse the cached result.

### 2.5 Format Migration System
**File**: `application/serialization/object-data-format.js`

**Problem**: `FORMAT_VERSION = '1.0.0'` with no migration path. Old saved files would become invalid when the format evolves.

**Fix**: Added `FORMAT_MIGRATIONS` registry and `migrateObjectData()` function. Runs in `standardizeObjectData()` before validation. Empty registry for now — ready for future format changes. Validation now accepts migratable versions instead of rejecting them.

### 2.6 Request-Response Correlation
**File**: `application/command-router.js`

**Problem**: UI commands were fire-and-forget. Failed commands left UI showing stale/optimistic state with no error feedback.

**Fix**: When a command includes an optional `requestId`, CommandRouter sends a `command-response` message back to the source window with `{ requestId, success, error }`. Backward compatible — commands without `requestId` work unchanged. Covers success, handler error, and unknown action cases.

## Tier 3: Hardening Pass (2026-03-24)

### 3.1 Correctness Fixes

**SceneController fallback path `||` → `??`** (`scene/scene-controller.js`):
Position/rotation/scale defaults in the non-TransformationManager fallback used `||` which treats `0` as falsy. Setting any axis to exactly 0 would silently keep the old value. Fixed to `??` (nullish coalescing).

**`autoLayout.enabled` check removed** (`scene/scene-layout-manager.js`):
Last remaining `autoLayout.enabled` runtime check in hug mode replaced with `autoLayout?.direction`. Method is only reached when containerMode is already `'hug'`, so the enabled check was redundant and violated the "containerMode is sole authority" principle.

**Stale position cache write removed** (`scene/scene-layout-manager.js`):
`applyLayoutPositionsAndSizes()` was writing `obj.position = {...}` after already setting `obj.mesh.position`. The mesh position is the only authority; the stale cache write created false confidence.

**`_changedProperties` accumulation leak** (`core/object-state-manager.js`):
`_changedProperties` Set on objects was never cleared after propagation, causing stale properties to pollute `determineEventType()` on subsequent unrelated updates (e.g., a prior `autoLayout.gap` change would make a position-only update emit HIERARCHY instead of TRANSFORM). Now cleared at end of `propagateChanges()`.

### 3.2 Performance Improvements

**Eliminated redundant second layout pass** (`scene/scene-layout-manager.js`):
After container resize, a defensive second `calculateLayout()` call re-applied positions "in case geometry was clamped." Traced through the chain — geometry factories produce exact requested sizes with no clamping. The second pass always produced identical results. Removed.

**Hug child repositioning clone removal** (`scene/scene-layout-manager.js`):
Hug container recentering called `sceneController.updateObject()` with `.clone()` per child. The mesh position was already set; passing the Vector3 directly avoids N allocations.

**refreshSelectionUI short-circuit** (`core/object-state-manager.js`):
Previously rebuilt `buildObjectStructure()` for ALL selected objects when any one changed. Now caches structures per selected object and only rebuilds for objects in the `changedItems` set. Cache invalidated on selection change.

### 3.3 Simplification

**Consistent `_layoutInProgress` guards** (`scene/scene-layout-manager.js`):
All three modes (layout, hug, manual) now use identical save/restore pattern for the re-entrancy guard. Previously hug mode rejected re-entrant calls and manual mode had no guard.

**Grid color method deduplication** (`scene/scene-controller.js`):
`updateGridMainColor()` and `updateGridSubColor()` were identical 25-line methods differing only in loop offset. Extracted shared `_updateGridColor(color, startIndex)` helper.

**Error-isolated lifecycle cleanup** (`scene/scene-lifecycle-manager.js`):
8 sequential cleanup steps in `removeObject()` now individually wrapped in try/catch. Previously a failure in any step (e.g., visualization cleanup) would prevent subsequent steps (geometry disposal, registry removal) from running.

**Shared ancestor-chain walker** (`scene/scene-hierarchy-manager.js`):
`isDescendantContainer()` and `getContainerNestingDepth()` both walked the ancestor chain with identical cycle-detection Sets. Extracted `_walkAncestorChain(startId, callback)` helper.

## Architecture Impact

- **No new dependencies** added
- **No API changes** — all improvements are backward compatible
- **66 lines removed** (dead code), ~80 lines added (caching, guards, migration infrastructure)
- **Validation is now enforced** for container mode flags (was convention-only)
- **Migration path exists** for future format changes
- **Tier 3**: 5 files changed, 166 insertions, 199 deletions (net -33 lines)
