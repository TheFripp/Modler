# Selection System

Container-first selection with direct object access through double-click.

## Core Pattern

### Container-First Logic
- **Single-click child object** → selects parent container (when not in container context)
- **Single-click child object** → selects child directly (when already stepped into parent container)
- **Double-click child object** → steps into container, selects child directly
- **Selection priority**: Context-aware container logic > Individual object

### Selection Operations
- **Add to selection**: `selectionController.select(object)`
- **Remove from selection**: `selectionController.deselect(object)`
- **Toggle selection**: `selectionController.toggle(object)`
- **Clear all**: `selectionController.clearSelection(reason)`

## Components

### SelectionController ⭐ **CENTRALIZED**
**File**: `interaction/selection-controller.js`
- **Unified selection logic** - eliminates BaseSelectionBehavior duplication
- **Container context awareness** - handles step-in/out state transitions
- **Tool integration** - single entry point for all selection operations
- **Container interactive mesh management** - disables interference during context
- Property panel updates and tool notifications

### VisualizationManager
**File**: `interaction/visualization-manager.js`
- Edge highlight creation/removal through ContainerVisualizer
- Material management for wireframes
- Visual feedback coordination

### ContainerInteractionManager
**File**: `interaction/container-interaction-manager.js`
- Step-into container functionality
- Container context visual feedback
- Collision mesh management during context

## Selection Workflow

### Basic Selection
1. User clicks object
2. SelectionController determines if container or direct selection
3. SelectionController updates selection state
4. VisualizationManager creates edge highlights
5. Property panel updates via bridge

### Container Step-Into
1. User double-clicks child object
2. ContainerInteractionManager establishes container context
3. **Container interactive mesh disabled** - prevents selection interference
4. Child object selected directly
5. Container shows faded wireframe
6. **Context-aware selection** - subsequent clicks select children directly

### Container Context Selection (NEW)
1. User steps into container (double-click or selection from object list)
2. SelectionController disables container's interactive mesh
3. **Direct child selection** - clicking child objects selects them directly
4. **Bypasses container-first logic** when already in correct context
5. Step-out restores normal container-first behavior

## Integration Points

### Tool Integration
- **SelectionController**: Centralized selection logic handling all tools
- **Direct access**: Tools call SelectionController methods directly
- **Face highlighting**: Only on selected objects

### UI Integration
- **Property panel**: Real-time updates via Svelte bridge
- **Object hierarchy**: Selection state synced to UI
- **Multi-selection**: Property panel shows common properties

## Key Methods

### Core Selection
- `select(object)` → boolean - Context-aware selection with container logic
- `deselect(object)` → boolean - Remove from selection
- `toggle(object)` → boolean - Toggle selection state
- `isSelected(object)` → boolean - Check selection status

### Tool Interface
- `handleObjectClick(object, event, options)` → boolean - **Main entry point** with container context awareness
- `handleDoubleClick(hit, event)` → boolean - Container step-into with child selection
- `handleEmptySpaceClick(event)` → void - Clear selection and exit context

### Container Context
- `stepIntoContainer(containerObject)` → void - Establish container context
- `stepOutOfContainer()` → void - Exit container context
- `isInContainerContext()` → boolean - Check if in container context
- `getContainerContext()` → Object|null - Get current container
- `isObjectPartOfContainer(objectData, containerMesh)` → boolean - Context validation