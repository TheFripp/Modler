# Selection System (V2.1 - Refactored)

## Overview
Container-first selection with direct object access through double-click. **Streamlined architecture** with separated concerns for maintainability.

**V2.1 Changes**: SelectionController (793 lines) split into 3 focused components - core state (280 lines), visual effects (230 lines), and container context (150 lines).

**See**: [`/core/ux-design.md`](../core/ux-design.md) for user experience principles behind these selection patterns.

## Architecture (V2.1)

### Component Separation
**SelectionController**: Core selection state management only
- Selection set management (select/deselect/toggle/clear)
- Property panel updates and tool notifications
- Delegates visual effects and container context to specialized components

**SelectionVisualizer**: All visual feedback
- Edge highlight creation/removal
- Material management and configuration callbacks
- Container wireframe show/hide logic

**ContainerContextManager**: Container step-in/out logic
- **Double-click step-into**: Establishes container context with faded wireframe
- **Container collision management**: Disables other containers during step-into
- **Interactive mesh resolution**: Handles both legacy and new container architectures
- **Position commitment**: Prevents coordinate jumps during context transitions
- **Context-aware clearing**: Preserves context for within-container operations

### Benefits
- **Single Responsibility**: Each component has one clear purpose
- **Easier Testing**: Components can be tested in isolation
- **Maintainability**: Visual bugs don't affect selection logic
- **Performance**: Specialized optimizations per component type

## Core Concepts

### Container-First Philosophy
**Principle**: Single click selects the logical container, double-click selects specific object.

**Why**: CAD users work with design intent - selecting a group of objects is more common than selecting individual components. This matches real-world object manipulation where you pick up containers rather than individual items.

### Selection Flow
```
Click → Tool → SelectionController
```
**Removed complexities**: Deep hierarchical managers, complex event coordination, timing-based state checking.

## Selection Patterns

### 1. Container-First Selection
- **Single click** on child object → selects parent container
- **Multi-select** with modifier keys (Ctrl/Cmd/Shift) works on containers
- **Visual feedback** through container wireframe (green edges)

### 2. Container Step-Into (Double-Click)
- **Double-click** on child object → steps into parent container, selects child object
- **Double-click** on container → steps into container, selects container (enables face highlights)
- **Establishes container context** with visual feedback (faded container wireframe)
- **Interactive mesh resolution** works for both legacy and new container architectures
- **Enables face highlighting** immediately after step-into for push/move tools

### 3. Container Context Behavior
- **Step-into establishes context**: Container shows faded wireframe, other containers disabled
- **Context preservation**: Selecting objects within same container maintains context
- **Context exit triggers**: Empty space click, tool switch, or selection outside container
- **Face highlighting integration**: Tools immediately work with step-into selections

### 4. Empty Space Behavior
- **Single click** on empty space → clears selection and exits container context
- **Camera operations** preserve selection through movement-based detection

## Key Components

### BaseSelectionBehavior
**Purpose**: Consistent selection logic across all tools
**Methods**: 
- `handleObjectClick()` - Container-first with modifier key support
- `handleDoubleClick()` - Direct object selection
- `handleEmptySpaceClick()` - Smart clear with modifier awareness

### SelectionController  
**Purpose**: Selection state management and visual feedback
**Responsibilities**: Track selected objects, manage wireframe highlights, notify UI

### Container Visibility System
**Purpose**: Show/hide container wireframes based on selection state
**Smart behavior**: Child containers stay visible when nested in selected parents

## Common Patterns

### Tool Integration
All tools use BaseSelectionBehavior for consistent selection patterns. Tools override specific behaviors (like face highlighting in MoveTool) while maintaining core selection logic.

### Multi-Select Support
Modifier keys (Ctrl/Cmd/Shift) enable additive selection. Works on both containers and individual objects depending on click type.

### UI Synchronization
Selection state automatically synchronizes with object list panel. No manual coordination required.

## Architecture Benefits

### Simplicity
- 3-layer flow eliminates complex event coordination
- Direct function calls instead of event systems
- Single source of truth for selection state

### Predictability
- Container-first logic matches user expectations
- Double-click provides consistent escape hatch
- Visual feedback immediately reflects selection state

### Performance
- No deep hierarchical traversal during selection
- Minimal function call depth (target: <3 calls)
- Efficient wireframe management through render order

## Debugging Selection Issues

### Common Problems
1. **Object not selectable** - Check `selectable: true` in object metadata
2. **Container not responding** - Verify children have `parentContainer` reference  
3. **Double-click not working** - Check event timing and metadata validity

### Debug Approach
1. **Add temporary logging** to BaseSelectionBehavior methods
2. **Check browser console** for selection-related errors
3. **Verify metadata** with `sceneController.getObjectByMesh()`
4. **Test different object types** (containers vs regular objects)

## File References
- `application/tools/base-selection-behavior.js` - Core selection logic
- `interaction/selection-controller.js` - State management
- `interaction/container-visibility-manager.js` - Wireframe coordination