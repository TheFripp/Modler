# Unified Visualization Architecture

> **⚠️ ARCHIVED DOCUMENTATION** - MeshSynchronizer references in this document are outdated. Support meshes are now self-contained children that inherit transforms automatically via Three.js hierarchy.

## Overview

The unified visualization architecture replaces multiple competing visualization systems with a clean, object-oriented approach that handles all selection states, wireframes, and visual effects for both regular objects and containers.

## Problem Solved

**Original Issue**: Container wireframes not showing after step-into → step-out → reselection due to competing visualization systems:
- SelectionVisualizer (orange edges, delegates containers)
- ContainerCrudManager (main green wireframes via show/hideContainer)
- ContainerInteractionManager (separate faded highlights for context)

**Root Cause**: `clearSelectionWireframe()` hides main wireframe when stepping into context, but `showContainerWireframe()` doesn't force-show it.

## Architecture Components

### ObjectVisualizer (`interaction/object-visualizer.js`)
Base class providing shared visualization behaviors for all objects.

**Core Responsibilities:**
- Edge highlight creation and management
- Face highlighting for tool interactions
- Material management and configuration callbacks
- Transform synchronization
- MeshSynchronizer integration for automatic updates

**State Machine:**
- Valid states: `['normal', 'selected', 'hovered', 'multi-selected']`
- State transitions via `setState(object, state)`
- Automatic visual application through `applyStateVisuals()`

**Key Methods:**
```javascript
setState(object, state)              // Main API for state changes
createEdgeHighlight(object)          // Selection wireframes
showFaceHighlight(object, face, color) // Tool face highlighting
updateTransform(object)              // Position/rotation sync
updateGeometry(object)               // Geometry change updates
```

### ContainerVisualizer (`interaction/container-visualizer.js`)
Extends ObjectVisualizer with container-specific functionality.

**Additional States:**
- `'context'` - When stepped into container
- `'selected-in-context'` - Container selected while in its context

**Container-Specific Features:**
- Green wireframes via ContainerCrudManager integration
- Context highlighting with faded wireframes
- Padding visualization for layout containers
- Container collision mesh management

**Key Methods:**
```javascript
stepIntoContainer(containerObject)   // Enter container context
stepOutOfContainer()                 // Exit container context
createContextHighlight(object)       // Faded context wireframe
showPaddingVisualization(object)     // Layout padding guides
```

### VisualizationManager (`interaction/visualization-manager.js`)
Coordinator that provides unified API and auto-delegates to appropriate visualizers.

**Core Features:**
- **Auto-delegation**: Detects object type and routes to ObjectVisualizer or ContainerVisualizer
- **Caching**: Stores visualizer decisions for performance
- **Batch updates**: Efficient multi-object state changes
- **Legacy compatibility**: Wrapper methods for easier transition

**Main API:**
```javascript
setState(object, state)                    // Unified state management
showFaceHighlight(object, face, color)    // Tool face highlighting
updateTransform(object)                   // Transform synchronization
updateGeometry(object)                    // Geometry update handling
batchSetStates(updates)                   // Performance-optimized batch updates
```

**Special Methods:**
```javascript
handleContainerContextSelection(object, isSelected) // Solves original issue
setMultiSelection(objects, selectedObjects)         // Multi-selection states
setToolHighlight(object, toolName, isActive)        // Tool-specific highlighting
```

## Implementation Patterns

### Before (Competing Systems)
```javascript
// Multiple systems with conflicts
selectionVisualizer.updateObjectVisual(object, true);
containerCrudManager.showContainer(id, true);
containerInteractionManager.createContainerEdgeHighlight(object);

// State conflicts and visibility issues
if (isContainer) {
    // Special container logic scattered across files
    // No unified state management
}
```

### After (Unified System)
```javascript
// Single unified interface
visualizationManager.setState(object, 'selected');
visualizationManager.updateGeometry(object); // after push tool
visualizationManager.showFaceHighlight(object, face, color);

// Auto-delegation handles complexity
// Proper state machine with container-specific states
// No more competing systems
```

## State Management

### Base Object States
- `'normal'` - Default state, no visual effects
- `'selected'` - Orange edge highlights for regular objects
- `'hovered'` - Hover effects (future expansion)
- `'multi-selected'` - Multi-selection visual differentiation

### Container-Specific States
- `'context'` - Faded green wireframe when stepped into
- `'selected-in-context'` - Enhanced visibility when selecting container you're inside

### State Transitions
All state changes go through `setState(object, state)` which:
1. Validates state is allowed for object type
2. Clears old state visuals via `clearStateVisuals()`
3. Applies new state visuals via `applyStateVisuals()`
4. Updates internal state tracking

## Integration Points

### SelectionController Integration
```javascript
// Updated to use VisualizationManager
initialize(visualizationManager, containerContextManager) {
    this.visualizationManager = visualizationManager;
}

// State changes
select(object) {
    this.visualizationManager.setState(object, 'selected');
}

deselect(object) {
    this.visualizationManager.setState(object, 'normal');
}
```

### Tool Integration
```javascript
// Push tool geometry updates
if (this.selectionController.visualizationManager) {
    this.selectionController.visualizationManager.updateGeometry(pushedObject);
}

// Face highlighting during tool use
visualizationManager.showFaceHighlight(object, face, toolColor);
```

### Container Integration
```javascript
// Container step-in/out operations
visualizationManager.stepIntoContainer(containerObject);
visualizationManager.stepOutOfContainer();

// Container selection while in context (solves original issue)
visualizationManager.handleContainerContextSelection(object, isSelected);
```

## Performance Optimizations

### Caching Strategy
- **Visualizer Selection**: Cache object type decisions to avoid repeated checks
- **State Tracking**: Remember current states to avoid unnecessary updates
- **Material Reuse**: Share materials between similar objects

### Batch Operations
```javascript
// Efficient multi-object updates
const updates = [
    { object: obj1, state: 'selected' },
    { object: obj2, state: 'normal' }
];
visualizationManager.batchSetStates(updates);
```

### MeshSynchronizer Integration
- Automatic wireframe updates when geometry changes
- Transform synchronization for related meshes
- Centralized mesh coordination prevents conflicts

## Legacy Compatibility

### Wrapper Methods
Ease transition from old SelectionVisualizer API:
```javascript
updateObjectVisual(object, isSelected)  // Maps to setState()
createEdgeHighlight(object)             // Maps to setState('selected')
removeEdgeHighlight(object)             // Maps to setState('normal')
```

### Gradual Migration
- Old SelectionVisualizer moved to `archived/`
- Script tags updated in `index.html`
- All usage points migrated to new API
- Backwards compatibility maintained during transition

## Configuration Integration

### Material Configuration
- Respects ConfigurationManager settings for colors, opacity, line width
- Automatic material updates when configuration changes
- Consistent visual styling across all visualizers

### Render Order Management
- Proper Z-ordering prevents visibility conflicts
- Wireframes render above objects but below UI
- Y-offset prevents z-fighting with floor grid

## Future Extensibility

### State Expansion
Easy to add new states:
```javascript
this.validStates = [...this.validStates, 'new-state'];
// Add handling in applyStateVisuals() and clearStateVisuals()
```

### Tool-Specific Visualizations
Framework supports tool-specific visual states:
```javascript
setToolHighlight(object, 'push-tool', true);  // Future: 'push-hover' state
```

### Animation Support
Foundation ready for animated state transitions:
```javascript
// Future: Smooth transitions between states
setState(object, newState, { animate: true, duration: 200 });
```

## Benefits Achieved

1. **Solved Original Issue**: Container wireframes now show correctly after step-into/step-out operations
2. **Unified API**: Single interface replaces multiple scattered systems
3. **Proper State Management**: Clean state machine with container-specific handling
4. **Performance**: Batch updates and caching optimize visualization operations
5. **Maintainability**: Object-oriented design with clear responsibilities
6. **Extensibility**: Easy to add new states, visualizers, and features
7. **Testing**: Centralized logic easier to test and debug

## Files Changed

### New Files
- `interaction/object-visualizer.js` - Base visualizer class
- `interaction/container-visualizer.js` - Container extensions
- `interaction/visualization-manager.js` - Unified coordinator

### Modified Files
- `v2-main.js` - Initialize VisualizationManager instead of SelectionVisualizer
- `interaction/selection-controller.js` - Use VisualizationManager API
- `interaction/container-interaction-manager.js` - Updated visualization calls
- `application/tools/push-tool.js` - Updated geometry refresh calls
- `index.html` - Updated script tags for new files

### Archived Files
- `interaction/selection-visualizer.js` - Moved to `archived/`