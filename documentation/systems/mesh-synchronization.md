# Mesh Synchronization

## Overview
Centralized system for coordinating related meshes. Eliminates scattered manual sync calls and prevents synchronization bugs through automatic relationship management.

## Core Concept

### The Multi-Mesh Reality
Every 3D object in Modler typically has multiple related meshes that must stay synchronized:
- **Main mesh** - visible geometry and material
- **Selection wireframe** - orange edge highlight when selected  
- **Container collision** - invisible raycast target for containers
- **Face highlights** - temporary cyan overlays for tool interaction
- **Tool overlays** - temporary visual feedback for interactions

### The Old Problem
Before centralized synchronization, manual sync calls were scattered across multiple files:
- Position updates in 6+ different locations
- Easy to forget sync calls during development
- Recurring bugs when meshes got out of sync
- No systematic cleanup when objects were removed

## Registration Pattern

### Register Once, Sync Automatically
Instead of manual sync calls everywhere, register relationships once during creation:

**Registration Types**:
- `'position'` - Position-only synchronization
- `'transform'` - Position, rotation, and scale  
- `'visibility'` - Show/hide state coordination
- `'geometry'` - Geometry updates for dynamic objects

### Automatic Synchronization
When the main mesh changes, all related meshes update automatically. No manual intervention required.

### Proper Cleanup
When objects are removed, the synchronizer automatically unregisters all related meshes, preventing memory leaks and orphaned references.

## Usage Patterns

### During Object Creation
Register all related meshes immediately after creation. This ensures they stay synchronized throughout the object's lifecycle.

### During Object Updates
Call sync on the main mesh - all related meshes update automatically. No need to track individual wireframes, highlights, or collision meshes.

### During Object Removal
Unregister all relationships before disposal. The synchronizer handles cleanup of all related mesh references.

## Architecture Benefits

### Centralized Coordination
- Single source of truth for mesh relationships
- Consistent behavior across all object types
- Easier debugging when synchronization issues occur

### Performance Optimization
- Batch operations for multiple sync calls
- Prevents redundant updates
- Optimized cleanup during object removal

### Developer Experience
- Register once, forget about manual sync
- Automatic handling of complex relationships
- Prevents common synchronization bugs

## Integration Points

### TransformationManager (Centralized Factory Integration)
Automatic mesh synchronization trigger when transformations are applied through centralized TransformationManager, ensuring all related meshes stay coordinated without manual sync calls.

### SelectionController
Selection wireframes automatically sync with main object position and visibility through registered relationships.

### VisualEffects
Face highlights and other temporary overlays coordinate through mesh synchronizer for consistent positioning.

### ContainerManager
Container collision meshes stay synchronized with visual container boundaries through automatic transform sync.

### Tool System
Tool-specific overlays register with their target objects for automatic coordination.

## File Reference
- `interaction/mesh-synchronizer.js` - Core implementation and API