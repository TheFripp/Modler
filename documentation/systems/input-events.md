# Input & Event Handling

## Overview
**CONSOLIDATED SYSTEM**: Unified event flow preventing conflicts between camera controls, tools, and other interactive elements through a single consolidated InputController.

## Architecture Principle

### Consolidated Event Source
**CRITICAL**: Only `InputController` has canvas event listeners. All other components receive events through direct delegation to prevent race conditions.

**Simplified Event Flow**:
```
Canvas Events → InputController → Tools/Camera/Gizmos
```

### System Consolidation (v2.1)
- **Previous**: InputFoundation + InputHandler (668 lines) with callback layers
- **Current**: Single InputController (280 lines) with direct delegation
- **Benefits**: 58% size reduction, eliminated duplicate processing, unified state management

### No Duplicate Listeners
**Anti-Pattern**: Multiple components adding their own canvas event listeners creates unpredictable behavior and conflicts.

**Correct Pattern**: Single event source with coordinated delegation based on context and priority.

## Event Coordination

### Priority System
InputController coordinates events using priority order:

1. **Gizmo operations** - Highest priority for direct manipulation
2. **Camera pan** - Shift+drag override for viewport navigation  
3. **Tool behaviors** - Current tool gets event delegation
4. **Camera orbit** - Default fallback for empty space interactions

### Context-Aware Coordination
Events are processed differently based on:
- **What was clicked** (object, empty space, gizmo, etc.)
- **Modifier keys** (Shift for pan, Ctrl/Cmd for multi-select)
- **Current tool** (different tools have different interaction patterns)
- **Selection state** (selected objects enable different behaviors)

## Event Types

### Mouse Events
- **MouseDown**: Initiates operations (selection, dragging, camera control)
- **MouseUp**: Completes operations and processes final actions
- **MouseMove**: Continuous feedback during operations (hover, drag, camera)
- **DoubleClick**: Special selection behaviors (direct object selection)

### Keyboard Events
- **Tool switching**: Q=select, W=move, E=layout, R=box-creation
- **Operation modifiers**: Shift=pan, Ctrl/Cmd=multi-select
- **Tool-specific shortcuts**: G for gap adjustment in layout tool, Tab for dimension inputs
- **Input field safety**: All shortcuts disabled when input fields are focused

### Specialized Events
- **Wheel**: Camera zoom with optional selection centering
- **ContextMenu**: Prevented to avoid conflicts with right-click operations

## Camera Integration

### Orbit vs Tool Operations
InputController predicts whether mouse operations will start camera orbit based on:
- **Hit detection**: Empty space or non-selectable objects typically start orbit
- **Tool context**: Some tools override default camera behavior
- **Modifier keys**: Shift forces pan regardless of hit detection

### Movement-Based Selection Preservation
Camera operations preserve selection through retroactive restoration rather than preventing selection changes, avoiding lock-based complexity.

## Tool Integration

### Tool Event Delegation
Tools receive pre-processed events from InputController:
- **Filtered contexts**: Tools only see relevant events
- **Coordinated timing**: No conflicts with camera or other systems
- **Consistent interfaces**: Standard event handler signatures

### Shared Behaviors
BaseSelectionBehavior provides consistent selection logic across tools while allowing tool-specific customization for other interactions.

## Anti-Patterns

### Multiple Event Listeners
**Never** add direct canvas event listeners outside of InputController. This creates timing conflicts and unpredictable behavior.

### Timing-Based State Checks
**Never** check system state during the same event that changes it. Use context-based prediction instead.

### Complex Lock Mechanisms
**Never** use lock-based approaches to coordinate between systems. Work with event flow rather than against it.

## Architecture Benefits

### Conflict Prevention
Single event coordination point eliminates race conditions between different interactive systems.

### Predictable Behavior
Priority-based event handling ensures consistent behavior regardless of timing or system complexity.

### Tool Independence
Tools can focus on their specific behaviors without worrying about conflicts with camera controls or other tools.

## File References
- `interaction/input-controller.js` - Consolidated input system (replaces InputFoundation + InputHandler)
- `interaction/camera-controller.js` - Camera operation integration
- `interaction/camera-math-utils.js` - Coordinate conversion utilities for tools

## Migration Notes
**v2.1 Consolidation**: The previous InputFoundation + InputHandler architecture has been consolidated into a single InputController for better performance and maintainability.