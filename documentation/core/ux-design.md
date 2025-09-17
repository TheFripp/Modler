# UX Design Principles

## Overview
User experience patterns and mental models for Modler V2's CAD-focused 3D interface. Emphasizes consistency, predictability, and professional CAD workflow integration.

## Core Mental Models

### Container-First Design Intent
**Philosophy**: Users think in terms of design groups and hierarchies, not individual polygons.

**Mental Model**: "Pick up the container, not the individual items inside it"
- **Single-click** child object → selects parent container (matches real-world behavior)
- **Container selection** shows design intent and maintains object relationships
- **Visual feedback** through green wireframes indicates selected containers

### Hierarchy Traversal Pattern
**Double-Click Navigation**: Provides escape hatch from container-first logic when direct access is needed.

**Interaction Flow**:
1. Single-click child → parent container selected
2. Double-click same child → direct child selection
3. User can now manipulate individual object within container context

**Why This Works**: Matches file browser conventions (single-click folder, double-click to enter) and maintains design hierarchy by default.

### Two-Phase Creation Pattern
**Interactive Geometry Creation**: Complex objects created through intuitive multi-step interaction rather than parameter dialogs.

**Creation Flow**:
1. **Phase 1** - Define 2D base shape through mouse drag (visual rectangle feedback)
2. **Phase 2** - Adjust 3D height through mouse movement (visual box preview)
3. **Finalization** - Click or Enter to create actual geometry, automatically selected

**Mental Model Benefits**:
- **Visual feedback** throughout creation process - user sees exactly what they're creating
- **Familiar interaction** - matches drawing/sketching applications
- **Easy to abort** - ESC key cancels at any phase
- **Immediate control** - no dialog boxes or parameter entry required

### Tool-Specific Interaction Contexts
**Principle**: Each tool provides a focused interaction context with consistent patterns across the application.

**Select Tool** - Clean Selection Experience:
- **No hover highlights** - eliminates visual noise during selection operations
- **Focus on object boundaries** - clear indication of what will be selected
- **Multi-select support** - Ctrl/Cmd/Shift for additive selection

**Move Tool** - Precision Manipulation:
- **Face highlighting** - cyan overlays show interaction surfaces
- **Face-constrained dragging** - objects move along face normals for precise control
- **Real-time visual feedback** - wireframes update during movement

**Layout Tool** - Parametric Design:
- **Container creation** - visualizes design groupings
- **Layout guides** - shows spacing and alignment relationships
- **Keyboard shortcuts** - rapid layout direction changes (1-5 keys)

**Box Creation Tool** - Interactive Geometry Creation:
- **Two-phase creation** - 2D rectangle drag → 3D height adjustment
- **Face-based positioning** - creation starts on clicked surface with proper orientation
- **Real-time preview** - green wireframe shows current dimensions during creation
- **Keyboard controls** - ESC to cancel, Tab for properties, Enter to finalize

## Camera Operation Philosophy

### Non-Destructive Camera Control
**Principle**: Camera operations should never interfere with selection or design work.

**Selection Preservation**: Camera movements (orbit, pan, zoom) maintain current selection state through movement-based detection rather than blocking selection changes.

**Intuitive Controls**:
- **Left-drag empty space** → orbit around selection center
- **Shift + left-drag** → pan viewport
- **Wheel scroll** → zoom with selection centering
- **Right-click** → context operations (when implemented)

### Predictable Camera Behavior
**Visual Feedback Drives Logic**: If user sees highlighting, they can interact; if no highlighting, camera takes control.

**Benefits**:
- **Eliminates edge cases** - no complex object type detection needed
- **Clear user expectations** - visual state matches interaction capability
- **Consistent across tools** - same camera behavior regardless of active tool

## Professional CAD Workflow Integration

### Face-Based Manipulation
**CAD Mental Model**: Objects have directional surfaces that constrain movement for precision.

**Implementation**:
- **Face detection** on both regular objects and container collision surfaces
- **Face highlighting** shows manipulation direction before interaction
- **Constrained movement** along face normals prevents accidental off-axis drift

### Parametric Design Support
**Rule-Based Relationships**: Objects exist within layout containers that define positioning rules and constraints.

**User Experience**:
- **Container creation** from selection establishes design relationships
- **Automatic layout** recalculates when objects change
- **Visual layout guides** show spacing, gaps, and alignment rules
- **Real-time updates** maintain design intent as objects are modified

### Design Hierarchy Visualization
**Object List Integration**: 3D scene hierarchy matches object panel structure for consistent mental model.

**Visual Consistency**:
- **Selection synchronization** between 3D viewport and object list
- **Nested indentation** shows container relationships
- **Expand/collapse** for complex hierarchies
- **Drag and drop** between containers in object list

## Interaction Consistency Rules

### Universal Selection Behavior
**BaseSelectionBehavior Pattern**: All tools use identical selection logic to eliminate user confusion between different interaction modes.

**Modifier Key Consistency**:
- **Ctrl/Cmd** → additive selection (add to current selection)
- **Shift** → range selection or camera pan (context dependent)
- **Alt** → reserved for future alternate behaviors

### Tool Switching Flow
**Keyboard Shortcuts**: 1=select, 2=move, 3=layout, 4=box creation
- **Selection preservation** across tool changes
- **Visual state cleanup** when switching tools (highlights cleared appropriately)
- **Immediate tool feedback** - interface shows current tool state
- **Creation mode persistence** - creation tools stay active for multiple object creation

### Error Prevention Patterns
**Visual Affordances**: Interface prevents errors through clear visual communication:
- **Selectable objects** show subtle hover states
- **Non-interactive elements** provide no visual feedback
- **Tool constraints** visualized through highlighting patterns

## Accessibility Considerations

### Visual Hierarchy
- **Color coding** with semantic meaning (green=containers, cyan=faces, orange=selection)
- **Size differentiation** between wireframes and solid objects
- **Render order** ensures important elements stay visible

### Interaction Feedback
- **Immediate visual response** to all user actions
- **Clear state indication** for tools, selection, and camera operations
- **Consistent timing** for hover states and transitions

### Keyboard Navigation
- **Tool switching** without mouse dependency
- **Layout controls** accessible via keyboard shortcuts
- **Future consideration** for full keyboard navigation of 3D space

## Mental Model Benefits

### Reduced Cognitive Load
- **Consistent patterns** across all interaction contexts
- **Predictable behavior** based on visual feedback
- **Familiar metaphors** from professional CAD and design tools

### Professional Efficiency
- **CAD-style precision** through face-based manipulation
- **Design intent preservation** through container hierarchies
- **Rapid iteration** through keyboard shortcuts and layout automation

### Scalable Complexity
- **Simple interactions** for basic operations
- **Advanced features** accessible through established patterns
- **Extensible framework** for future tool development

## Integration with System Architecture

This UX design philosophy aligns with the technical architecture:
- **Single event coordination** supports predictable interaction patterns
- **Container-first selection** implemented through BaseSelectionBehavior
- **Tool modularity** enables consistent behavior extensions
- **Visual feedback systems** provide the foundation for interaction clarity

**See**: [`architecture-v2.md`](architecture-v2.md) for technical implementation, [`/systems/tools.md`](../systems/tools.md) for tool-specific patterns, [`/systems/selection.md`](../systems/selection.md) for selection behavior details.