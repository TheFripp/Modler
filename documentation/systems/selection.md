# Selection System

Container-first selection with direct object access through double-click.

## Core Pattern

### Container-First Logic
- **Single-click child object** → selects parent container
- **Double-click child object** → steps into container, selects child directly
- **Selection priority**: Container > Individual object

### Selection Operations
- **Add to selection**: `selectionController.select(object)`
- **Remove from selection**: `selectionController.deselect(object)`
- **Toggle selection**: `selectionController.toggle(object)`
- **Clear all**: `selectionController.clearSelection(reason)`

## Components

### SelectionController
**File**: `interaction/selection-controller.js`
- Core selection state management
- Property panel updates and tool notifications
- Delegates visual effects to SelectionVisualizer

### SelectionVisualizer
**File**: `interaction/selection-visualizer.js`
- Edge highlight creation/removal
- Material management for wireframes
- Visual feedback coordination

### ContainerContextManager
**File**: `interaction/container-context-manager.js`
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
2. ContainerContextManager establishes container context
3. Child object selected directly
4. Container shows faded wireframe
5. Other containers disabled for interaction

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
- `isSelected(object)` → boolean
- `stepIntoContainer(containerObject)` → void
- `stepOutOfContainer()` → void
- `isInContainerContext()` → boolean