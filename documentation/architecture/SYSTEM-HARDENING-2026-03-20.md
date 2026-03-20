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

## Architecture Impact

- **No new dependencies** added
- **No API changes** — all improvements are backward compatible
- **66 lines removed** (dead code), ~80 lines added (caching, guards, migration infrastructure)
- **Validation is now enforced** for container mode flags (was convention-only)
- **Migration path exists** for future format changes
