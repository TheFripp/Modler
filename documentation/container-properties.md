# Container Properties - Schema Documentation

## Overview
This document defines the canonical properties for container objects.

## Container Mode System

### Single Source of Truth: `containerMode`

Every container has a single `containerMode` property that determines its behavior:

| Mode | Value | Behavior |
|------|-------|----------|
| **Manual** | `'manual'` | No automatic sizing or layout. Container is fixed. |
| **Layout** | `'layout'` | Fixed-size container with automatic child distribution along an axis. Fill objects can expand. |
| **Hug** | `'hug'` | Container automatically resizes to wrap its children tightly. |

### Reading Container Mode

```javascript
// Preferred: via ObjectStateManager helpers
objectStateManager.getContainerMode(id)   // → 'manual' | 'layout' | 'hug'
objectStateManager.isLayoutMode(id)        // → boolean
objectStateManager.isHugMode(id)           // → boolean

// Also valid: direct property check on data objects
if (containerData.containerMode === 'layout') { ... }
```

### Writing Container Mode

Always use `buildContainerModeUpdate()` — never set `containerMode`, `isHug`, or `sizingMode` directly:

```javascript
// Via ObjectStateManager.updateObject (preferred)
objectStateManager.updateObject(containerId, {
    containerMode: 'layout'  // applyUpdates() auto-routes through buildContainerModeUpdate()
});

// Via spread into update objects
const updates = {
    ...ObjectStateManager.buildContainerModeUpdate('hug'),
    // other properties...
};

// Direct assignment on data objects (when not going through OSM)
Object.assign(containerData, ObjectStateManager.buildContainerModeUpdate('layout'));
```

### Legacy Flags (Serialization Only)

These flags exist for backward compatibility with old save files. They are kept in sync by `buildContainerModeUpdate()` on writes and read only by `getContainerMode()` as fallback for old data:

- `isHug` — boolean, `true` when mode is `'hug'`
- `sizingMode` — string, mirrors `containerMode`
- `autoLayout.enabled` — boolean, read during deserialization only

**NEVER** check these flags in runtime code. Use `containerMode` or the OSM helpers.

## Core Container Properties

### Required Properties (All Containers)
```javascript
{
  isContainer: boolean,          // Identifies object as container
  containerMode: 'manual'|'layout'|'hug',  // Canonical mode (single source of truth)
  autoLayout: {
    direction: 'x'|'y'|'z'|null, // Layout axis
    gap: number,                 // Space between children
    padding: {                   // Inset from container edges
      width: number,             // X-axis padding
      height: number,            // Y-axis padding
      depth: number              // Z-axis padding
    },
    alignment: {                 // Perpendicular axis alignment
      horizontal: 'left'|'center'|'right',
      vertical: 'top'|'center'|'bottom',
      depth: 'back'|'center'|'front'
    }
  },
  calculatedGap: number|undefined // Dynamic gap in space-between mode
}
```

### Child Layout Properties
```javascript
{
  layoutProperties: {
    sizeX: 'fixed'|'fill',  // X-axis sizing behavior
    sizeY: 'fixed'|'fill',  // Y-axis sizing behavior
    sizeZ: 'fixed'|'fill'   // Z-axis sizing behavior
  }
}
```

## State Transitions

### Enabling Layout Mode (e.g., push tool hug→layout)
1. `containerMode` → `'layout'` (via `buildContainerModeUpdate('layout')`)
2. `autoLayout.direction` set to push axis
3. Container size becomes fixed
4. Children can use fill sizing

### Disabling Layout Mode (e.g., child push → parent hug)
1. `containerMode` → `'hug'` (via `buildContainerModeUpdate('hug')`)
2. Container auto-resizes to children
3. Child positions preserved

### Manual Mode
1. `containerMode` → `'manual'` (via `buildContainerModeUpdate('manual')`)
2. No automatic sizing or layout
3. Children positioned manually

## Fill Object Behavior

### Requirements for Fill Objects
- Parent container MUST be in layout mode (`containerMode === 'layout'`)
- Container size must be passed to layout engine

### Fill Calculation
Fill objects expand to fill available space:
```
availableSpace = containerSize - fixedObjectSizes - gaps - padding×2
fillSize = availableSpace / fillObjectCount
```

## Implementation Files
- **Mode API**: `/core/object-state-manager.js` (`getContainerMode`, `isLayoutMode`, `isHugMode`, `buildContainerModeUpdate`)
- **Layout Engine**: `/layout/layout-engine.js` (pure calculation, static methods)
- **Layout Coordinator**: `/scene/scene-layout-manager.js` (applies LayoutEngine results to scene)
- **Container Operations**: `/application/tools/container-crud-manager.js` (`resizeContainer`)
- **Mode Switching**: `/application/handlers/property-update-handler.js`
- **Schema**: `/application/serialization/object-data-format.js`

## Version History
- **v1.0.0** (2025-10-02): Initial documentation
- **v2.0.0** (2026-03-21): Rewritten for canonical `containerMode` system. Removed legacy `isHug`/`autoLayout.enabled` patterns from runtime docs.
