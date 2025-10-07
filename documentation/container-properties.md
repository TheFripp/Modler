# Container Properties - Schema Documentation

## Overview
This document defines the canonical properties for container objects to prevent inconsistencies.

## Container Sizing Modes (Mutually Exclusive)

### 1. Hug Mode (`isHug: true`)
- **Purpose**: Container automatically resizes to fit children
- **Behavior**:
  - Wraps tightly around child objects
  - Size adjusts dynamically when children change
  - No fill objects allowed (children determine container size)
- **State**: `isHug: true`, `autoLayout.enabled: false`

### 2. Layout Mode (`autoLayout.enabled: true`)
- **Purpose**: Fixed-size container with automatic child layout
- **Behavior**:
  - Container has fixed dimensions
  - Children positioned automatically along layout axis
  - Fill objects can expand to use available space
- **State**: `isHug: false`, `autoLayout.enabled: true`

**CRITICAL**: Hug mode and Layout mode are **mutually exclusive**. When one is enabled, the other must be disabled.

## Core Container Properties

### Required Properties (All Containers)
```javascript
{
  isContainer: boolean,          // Identifies object as container
  isHug: boolean,                // Hug mode enabled/disabled
  layoutMode: string|null,       // Legacy property, use autoLayout instead
  autoLayout: {
    enabled: boolean,            // Layout mode enabled/disabled
    direction: 'x'|'y'|'z'|null, // Layout axis
    gap: number,                 // Space between children
    padding: {                   // Inset from container edges
      width: number,
      height: number,
      depth: number
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

### Enabling Layout Mode
When `autoLayout.direction` is set to a non-null value:
1. `autoLayout.enabled` → `true`
2. `isHug` → `false`
3. Container size becomes fixed
4. Children can use fill sizing

### Disabling Layout Mode
When `autoLayout.direction` is set to `null`:
1. `autoLayout.enabled` → `false`
2. `isHug` → `true`
3. Container auto-resizes to children
4. Child positions preserved

## Fill Object Behavior

### Requirements for Fill Objects
- Parent container MUST have `autoLayout.enabled: true`
- Parent container MUST have `isHug: false`
- Container size must be passed to layout engine

### Fill Calculation
Fill objects expand to fill available space:
```
availableSpace = containerSize - fixedObjectSizes - gaps - padding
fillSize = availableSpace / fillObjectCount
```

## Common Issues & Solutions

### Issue: Fill objects not resizing
**Cause**: Container has `isHug: true` AND `autoLayout.enabled: true`
**Solution**: These modes are mutually exclusive. Disable `isHug` when enabling layout mode.

### Issue: Container state confusion
**Cause**: Properties not synchronized when mode changes
**Solution**: Always update both `isHug` and `autoLayout.enabled` together.

## Implementation Files
- **Schema**: `/application/serialization/object-data-format.js`
- **Mode Switching**: `/application/handlers/property-update-handler.js`
- **Layout Calculation**: `/layout/layout-engine.js`
- **Container Creation**: `/application/tools/container-crud-manager.js`
- **Fill Application**: `/scene/scene-controller.js` (`applyLayoutPositionsAndSizes`)

## Version History
- **v1.0.0** (2025-10-02): Initial documentation, added `isHug` and `layoutProperties` to schema
