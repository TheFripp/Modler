# Input & Event Handling

Unified event flow preventing conflicts between camera controls, tools, and interactive elements through consolidated InputController.

## Architecture

### Consolidated Event Source
**CRITICAL**: Only `InputController` has canvas event listeners. All other components receive events through direct delegation to prevent race conditions.

**Event Flow**:
```
Canvas Events → InputController → Tools/Camera
```

### System Consolidation
- **Previous**: InputFoundation + InputHandler (668 lines) with callback layers
- **Current**: Single InputController (280 lines) with direct delegation
- **Benefits**: 58% size reduction, eliminated duplicate processing, unified state management

## Event Coordination

### Priority System
1. **Tool operations** - Highest priority for direct manipulation
2. **Camera controls** - Secondary for viewport navigation
3. **Fallback handling** - Default camera orbit for empty space

### State Management
InputController maintains unified state for:
- **Mouse position** and button states
- **Keyboard modifiers** (Shift, Cmd, Alt)
- **Interaction context** (what was clicked, etc.)
- **Tool delegation** state

## Camera Integration

### Camera Controls
- **Orbit**: Default mouse drag behavior
- **Pan**: Shift+drag for lateral movement
- **Zoom**: Mouse wheel with zoom centering
- **Focus**: Double-click empty space centers on objects

### Conflict Prevention
- **Camera vs Tools**: Priority system ensures tools get first event handling
- **State isolation**: Camera controls don't interfere with tool interactions
- **Modifier coordination**: Shift key properly switches between orbit and pan

## Tool Integration

### Event Delegation Pattern
```javascript
// InputController delegates to active tool
if (currentTool && currentTool.handleMouseDown) {
    currentTool.handleMouseDown(event, hit);
}
```

### Tool Event Methods
- `handleMouseDown(event, hit)` - Tool-specific click handling
- `handleMouseMove(event, hit)` - Drag and hover interactions
- `handleMouseUp(event, hit)` - Release and completion actions

## Key Benefits

### Performance
- **Single event listener** per event type on canvas
- **Direct delegation** eliminates callback overhead
- **Unified state** reduces duplicate coordinate calculations

### Maintainability
- **Centralized coordination** prevents race conditions
- **Clear priority hierarchy** for event handling
- **Simplified debugging** with single event entry point

## Key Files
- **InputController**: `interaction/input-controller.js` - Consolidated input system
- **CameraController**: `interaction/camera-controller.js` - Viewport navigation
- **ToolController**: `application/tool-controller.js` - Tool coordination