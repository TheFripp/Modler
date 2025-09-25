# Tool Development Guide

## Overview
Tools handle user interactions and delegate to shared behaviors. Follow established patterns for consistency.

## Tool Architecture

### Base Pattern
```javascript
class YourTool {
    constructor(selectionController, visualEffects) {
        this.selectionController = selectionController;
        this.visualEffects = visualEffects;
    }

    onClick(hit, event) {
        if (hit && hit.object) {
            this.selectionController.handleObjectClick(hit.object, event, { toolType: 'YourTool' });
        } else {
            this.selectionController.handleEmptySpaceClick(event);
        }
    }

    onDoubleClick(hit, event) {
        // SelectionController handles all container step-into functionality
        this.selectionController.handleDoubleClick(hit, event);
    }
}
```

### Tool Event Handlers
- `onClick(hit, event)` - Handle mouse clicks
- `onDoubleClick(hit, event)` - Handle double-click events  
- `onHover(hit)` - Handle mouse hover (optional)
- `onDrag(event)` - Handle drag operations (optional)

## Existing Tools

### BoxCreationTool
- **Purpose**: Interactive three-click box creation with height dragging
- **Behavior**: Click corner 1 → Click corner 2 → Drag height → Click to finalize
- **Height Dragging**: Corner-based screen projection approach for intuitive height adjustment
- **Implementation**: Projects rectangle corner to screen space, tracks mouse distance for height
- **Benefits**: Camera-independent, linear response, visual connection to geometry
- **Known Issues**: Some quirks at very shallow camera angles
- **File**: `application/tools/box-creation-tool.js`

### SelectTool
- **Purpose**: Object selection and highlighting
- **Behavior**: Uses SelectionController directly for clean architecture
- **Container Step-Into**: Double-click support for container navigation
- **Hover**: No hover highlights (clean selection experience)
- **File**: `application/tools/select-tool.js`

### MoveTool
- **Purpose**: Object movement and face-based dragging
- **Behavior**: Selection + movement gizmo + face highlighting
- **Container Context Integration**: Works immediately after step-into operations
- **Interactive Mesh Support**: Highlights container faces when container selected in context
- **Hover**: Shows face highlights on selected objects only
- **File**: `application/tools/move-tool.js`


## Selection Integration

### Always Use SelectionController Directly ⭐ **CENTRALIZED ARCHITECTURE**
**DO NOT** implement custom selection logic in tools. SelectionController provides unified selection logic:

```javascript
// Correct approach - Container context-aware selection
this.selectionController.handleObjectClick(hit.object, event, { toolType: 'YourTool' });

// Also correct - Direct selection calls
this.selectionController.select(object);
this.selectionController.toggle(object);

// Wrong approach - Custom selection logic
if (this.isSelectable(object)) {
    // Don't implement custom selection logic
    this.customSelect(object);
}
```

**Key Benefits**:
- **Container context awareness** - automatic step-in/out handling
- **Unified behavior** - identical selection across all tools
- **Interactive mesh management** - prevents container interference
- **Eliminates duplication** - no more BaseSelectionBehavior

### Face Highlighting Rules
- **Move Tool**: Show face highlights on selected objects (for face dragging)
- **Container Context**: Face highlighting works immediately after step-into operations
- **Interactive Mesh Resolution**: Handles both legacy and new container architectures for highlighting
- **Select Tool**: No hover highlights (clean experience)  
- **Layout Tool**: No face highlights (object-level operations)

## Tool Registration

### ToolController Integration
Tools are registered with ToolController for keyboard switching:

```javascript
// In ToolController constructor
this.tools = {
    select: new SelectTool(selectionController, visualEffects),
    move: new MoveTool(selectionController, visualEffects),
    push: new PushTool(selectionController, visualEffects),
    'box-creation': new BoxCreationTool(selectionController, visualEffects)
};

// Keyboard shortcuts
this.keyBindings = {
    '1': 'select',
    '2': 'move', 
    '3': 'layout'
};
```

### InputController Coordination
Tools receive events through InputController coordination:

```javascript
// InputController delegates to current tool
const currentTool = this.toolBehaviors[this.currentTool];
if (currentTool && typeof currentTool.onClick === 'function') {
    currentTool.onClick(hit, event);
}
```

## Common Patterns

### Object Validation
```javascript
// Check if object is selectable
const objectData = sceneController.getObjectByMesh(hit.object);
if (!objectData || !objectData.selectable) {
    return false;
}
```

### Multi-Select Handling
```javascript
// Check for modifier keys  
const isMultiSelect = event.ctrlKey || event.metaKey || event.shiftKey;
if (isMultiSelect) {
    this.selectionController.toggle(object);
} else {
    this.selectionController.select(object);
}
```

### Visual Feedback
```javascript
// Show/hide visual effects
this.visualEffects.showFaceHighlight(hit.object, hit.face);
this.visualEffects.clearHighlight();
```

## File Size Limits
- **Tools**: 200 lines maximum
- **If approaching limit**: Activate Architecture Guardian for review
- **Consider**: Splitting into multiple focused tools

## Common Issues

### Tool Not Receiving Events
1. Check if tool is registered in ToolController
2. Verify method names match expected interface
3. Ensure InputController is delegating correctly

### Selection Not Working in Tool
1. Verify using SelectionController.handleObjectClick() directly instead of custom logic
2. Check if objects are marked as selectable
3. Ensure proper event delegation pattern

### Tool Switching Problems
1. Check keyboard binding registration in ToolController
2. Verify tool cleanup in `setCurrentTool()`
3. Ensure tool state is properly reset

## Files to Reference
- `interaction/selection-controller.js` - Centralized selection logic
- `application/managers/tool-controller.js` - Tool registration and switching
- `interaction/input-handler.js` - Event coordination
- Example tools: `select-tool.js`, `move-tool.js`, `push-tool.js`, `box-creation-tool.js`