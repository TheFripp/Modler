# UI Communication Architecture

## Overview

The UI communication system is built on a three-layer architecture that separates data management, integration logic, and communication protocols.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          USER INTERFACE LAYER                            │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐         │
│  │  Left Panel     │  │ Property Panel  │  │   Toolbars      │         │
│  │  (Svelte)       │  │  (Svelte)       │  │   (Svelte)      │         │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘         │
│           │                    │                     │                   │
│           └────────────────────┼─────────────────────┘                   │
│                                │                                         │
│                         PostMessage (iframe)                             │
│                                │                                         │
└────────────────────────────────┼─────────────────────────────────────────┘
                                 │
┌────────────────────────────────┼─────────────────────────────────────────┐
│                  LAYER 3: COMMUNICATION LAYER                            │
│                                │                                         │
│  ┌─────────────────────────────▼──────────────────────────────┐         │
│  │              PropertyPanelSync                              │         │
│  │  • Translates ObjectEventBus → PostMessage                 │         │
│  │  • Routes to specific panels (left, right, toolbars)       │         │
│  │  • Handles specialized events:                             │         │
│  │    - GEOMETRY → object-modified-geometry                   │         │
│  │    - MATERIAL → object-modified-material                   │         │
│  │    - SELECTION → selection-change                          │         │
│  │    - HIERARCHY → hierarchy refresh                         │         │
│  │    - TRANSFORM → ❌ NOT HANDLED (see below)                │         │
│  └────────────────────────────┬────────────────────────────────┘         │
│                                │                                         │
└────────────────────────────────┼─────────────────────────────────────────┘
                                 │
┌────────────────────────────────┼─────────────────────────────────────────┐
│                  LAYER 2: INTEGRATION LAYER                              │
│                                │                                         │
│  ┌─────────────────────────────▼──────────────────────────────┐         │
│  │              main-integration.js                            │         │
│  │  • Routes UI PostMessages → ObjectStateManager             │         │
│  │  • Listens to ObjectStateManager events:                   │         │
│  │    - objects-changed → unified-update (transform/state)    │         │
│  │    - selection-changed → unified-update (selection)        │         │
│  │  • Coordinates PropertyPanelSync for specialized events    │         │
│  │  • Handles tool state, snap settings, etc.                 │         │
│  └────────────────────────────┬────────────────────────────────┘         │
│                                │                                         │
└────────────────────────────────┼─────────────────────────────────────────┘
                                 │
┌────────────────────────────────┼─────────────────────────────────────────┐
│                    LAYER 1: DATA LAYER                                   │
│                                │                                         │
│  ┌─────────────────────────────▼──────────────────────────────┐         │
│  │              ObjectStateManager                             │         │
│  │  • Single source of truth for all object state             │         │
│  │  • Validates and normalizes state updates                  │         │
│  │  • Propagates changes to:                                  │         │
│  │    - 3D Scene (SceneController)                            │         │
│  │    - Event system (ObjectEventBus)                         │         │
│  │  • Emits unified state change events                       │         │
│  └────────────────────────────┬────────────────────────────────┘         │
│                                │                                         │
│  ┌─────────────────────────────▼──────────────────────────────┐         │
│  │              ObjectEventBus                                 │         │
│  │  • Event distribution system                                │         │
│  │  • Event types: TRANSFORM, GEOMETRY, MATERIAL, etc.        │         │
│  │  • PropertyPanelSync subscribes to these events             │         │
│  └─────────────────────────────────────────────────────────────┘         │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

## Data Flow Examples

### Example 1: User Changes Object Position (Transform)

```
1. User drags position arrow in Property Panel
   ↓
2. UI sends PostMessage: { type: 'property-update', data: { objectId, property: 'position.x', value: 5 } }
   ↓
3. main-integration.js receives message → handlePropertyUpdate()
   ↓
4. ObjectStateManager.updateObject(objectId, { position: { x: 5 } })
   ↓
5. ObjectStateManager updates 3D scene + fires 'objects-changed' event
   ↓
6. main-integration.js catches 'objects-changed' → sends 'unified-update' via notifyUISystems()
   ↓
7. PropertyPanelSync.sendToUI() → PostMessage with complete object data
   ↓
8. UI receives update → displays new position
```

**Note:** Transform updates bypass PropertyPanelSync's TRANSFORM handler because:
- ObjectStateManager sends complete object data (name, dimensions, all properties)
- PropertyPanelSync's transform handler was sending minimal data (causing flickering)
- unified-update path is more efficient and complete

### Example 2: User Changes Object Color (Material)

```
1. User picks color in Property Panel
   ↓
2. UI sends PostMessage: { type: 'property-update', data: { objectId, property: 'material.color', value: '#ff0000' } }
   ↓
3. main-integration.js → ObjectStateManager.updateObject()
   ↓
4. ObjectStateManager fires MATERIAL event to ObjectEventBus
   ↓
5. PropertyPanelSync.handleMaterialEvent() catches event
   ↓
6. PropertyPanelSync.sendToUI('object-modified-material', [...]) with optimized material data
   ↓
7. UI receives specialized material update
```

**Note:** Material updates go through PropertyPanelSync because:
- They're frequent during color picking (drag operations)
- Only material data needs to be sent (not entire object)
- Optimized serialization reduces PostMessage payload

### Example 3: User Changes Object Dimensions (Geometry)

```
1. User drags dimension arrow in Property Panel
   ↓
2. UI sends PostMessage with source='drag' for smooth updates
   ↓
3. ObjectStateManager updates geometry + fires GEOMETRY event
   ↓
4. PropertyPanelSync.handleGeometryEvent() catches event
   ↓
5. Sends 'object-modified-geometry' with fresh dimension data
   ↓
6. UI updates dimension values in real-time
```

## Why Two Parallel Paths?

The architecture uses **TWO complementary paths** for different update types:

### Path 1: ObjectStateManager → unified-update
**Used for:** Transform (position, rotation, scale) and Selection changes
**Why:**
- Sends complete object data every time
- Ensures UI always has full context
- Prevents data inconsistencies
- Slower but comprehensive

### Path 2: PropertyPanelSync → specialized messages
**Used for:** Geometry, Material, Hierarchy events
**Why:**
- Sends only changed data
- Optimized for high-frequency updates (color picking, dimension dragging)
- Reduces PostMessage payload size
- Faster for real-time interactions

## Key Architectural Decisions

### Decision 1: No TRANSFORM Handler in PropertyPanelSync
**Problem:** PropertyPanelSync's transform handler was sending incomplete object data (name: "Object" instead of actual name)
**Solution:** Removed TRANSFORM subscription, rely solely on ObjectStateManager's unified-update path
**Result:** No flickering, always complete data

### Decision 2: Keep PropertyPanelSync (Don't Remove)
**Initial thought:** PropertyPanelSync duplicates ObjectStateManager functionality
**Reality:** They serve different purposes:
- ObjectStateManager = Data/State management
- PropertyPanelSync = Communication bridge
**Benefit:** Clean separation of concerns, maintainable architecture

### Decision 3: Source Tracking for Drag Operations
**Problem:** Drag operations were causing excessive UI updates
**Solution:** Added 'source' parameter ('drag', 'input', 'button') throughout the chain
**Result:** Can filter updates based on source, optimize for different interaction types

## Communication Protocols

### PostMessage Format (UI → Main App)
```javascript
{
  type: 'property-update',
  data: {
    objectId: '2',
    property: 'position.x',
    value: 5,
    source: 'drag' // or 'input', 'button'
  }
}
```

### PostMessage Format (Main App → UI)
```javascript
// Unified Update (Transform/Selection)
{
  type: 'data-update',
  data: {
    selectedObjects: [...], // Complete object data
    objectHierarchy: [...],
    updateType: 'unified-update'
  }
}

// Specialized Updates (Geometry/Material)
{
  type: 'data-update',
  data: {
    selectedObjects: [...], // Only changed properties
    updateType: 'object-modified-geometry' // or 'object-modified-material'
  }
}
```

## Performance Considerations

### Throttling
- PropertyPanelSync: 33ms throttle (~30fps) for UI updates
- main-integration: 50ms throttle for rapid updates
- Selection changes: No throttle (immediate)

### Serialization Optimization
- Transform: No geometry data (includeGeometry: false)
- Material: No geometry or hierarchy data
- Geometry: Fresh calculation (useCache: false)

### Drag Operations
- Use 'source=drag' to identify high-frequency updates
- Skip full object updates during drag (isDraggingProperty flag)
- Send final value only on blur/mouseup

## Troubleshooting Guide

### Symptom: Property panel flickering during drag
**Cause:** Multiple update paths sending conflicting data
**Fix:** Ensure TRANSFORM events not subscribed in PropertyPanelSync
**Check:** `property-panel-sync.js` setupEventSubscriptions() should NOT have TRANSFORM subscription

### Symptom: UI not updating after property change
**Cause:** PostMessage not being sent or received
**Check:**
1. main-integration.js notifyUISystems() is being called
2. PropertyPanelSync.sendToUI() is being called
3. Browser console for PostMessage errors

### Symptom: Incomplete object data in UI
**Cause:** Using specialized update when unified-update is needed
**Fix:** Transform/selection should use unified-update (ObjectStateManager path)
**Check:** ObjectStateManager 'objects-changed' event handler in main-integration.js

## Future Improvements

1. **Consolidate Message Types**: Reduce number of different message types for simpler UI handling
2. **WebSocket Alternative**: Consider WebSocket for better performance than PostMessage
3. **Batch Updates**: Group multiple property changes into single PostMessage
4. **Type Safety**: Add TypeScript interfaces for PostMessage data structures
