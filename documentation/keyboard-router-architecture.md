# Keyboard Router Architecture

**Version**: 2.0
**Last Updated**: 2025-01-07
**Status**: Current

## Overview

The KeyboardRouter provides centralized keyboard input handling for Modler V2, eliminating competing event listeners and implementing priority-based event delegation. This document describes the simplified architecture implemented after removing the over-engineered registration system.

## Core Philosophy

**Query State When Needed, Don't React to Every Change**

Tools should **poll keyboard state** during their operations rather than registering callbacks for every key event. This is simpler, more predictable, and eliminates registration overhead.

## Architecture

### Single Event Listener

```javascript
// keyboard-router.js
document.addEventListener('keydown', this.handleKeyDown, true);  // Capture phase
document.addEventListener('keyup', this.handleKeyUp, false);
```

- **One** document-level listener in capture phase (highest priority)
- Maintains `this.keys` Set with currently pressed keys
- Routes events through priority system

### Priority-Based Event Delegation

Events are processed in strict priority order:

1. **Input Fields** (highest priority)
   - Allow native behavior (typing, Tab, Enter)
   - Handle workflow navigation for tool-specific field sequences

2. **Active Tool Handlers** (for tools that need event-driven behavior)
   - Direct method call: `toolController.getActiveTool().onKeyDown(event)`
   - No registration required
   - Tool returns `true` if handled, `false` to continue priority chain

3. **Global Commands** (Cmd/Ctrl shortcuts)
   - Cmd+Z: Undo
   - Cmd+Shift+Z / Cmd+Y: Redo
   - Cmd+F: Wrap in container
   - Cmd+D: Duplicate object
   - Delete/Backspace: Delete selected

4. **Tab Key** (input field focus)
   - Focus measurement tool axis if active
   - Focus first dimension input if object selected

5. **Escape** (clear selection)

6. **Tool Switching** (Q/W/E/R/T)
   - Only when no modifier keys pressed

## Tool Keyboard Patterns

### Pattern 1: State Polling (Preferred)

**Use When**: Tool needs to check if modifier key is pressed during ongoing operation

**Example**: MoveTool checks Command key during drag to toggle duplication mode

```javascript
// move-tool.js
isCommandKeyPressed() {
    const keyboardRouter = window.modlerComponents?.keyboardRouter;
    return keyboardRouter?.keys.has('MetaLeft') ||
           keyboardRouter?.keys.has('MetaRight') || false;
}

updateDragMovement() {
    // Check key state each frame - toggle duplication dynamically
    const isCommandPressed = this.isCommandKeyPressed();
    if (isCommandPressed && !this.isDuplicationMode) {
        this.enterDuplicationMode();
    } else if (!isCommandPressed && this.isDuplicationMode) {
        this.exitDuplicationMode();
    }
    // ... rest of drag logic
}
```

**Benefits**:
- No registration needed
- Check state only when relevant
- Can poll at any frequency (per-frame, per-operation, etc.)
- No cleanup required

### Pattern 2: Event Handlers (When Needed)

**Use When**: Tool needs immediate reaction to specific key press (not modifier state)

**Example**: BoxCreationTool cancels in-progress creation on Escape

```javascript
// box-creation-tool.js
onKeyDown(event) {
    if (event.key === 'Escape') {
        this.cancelCreation();
        return true;  // Handled - stop priority chain
    }
    return false;  // Not handled - continue to global Escape handler
}
```

**How It Works**:
- KeyboardRouter calls `toolController.getActiveTool().onKeyDown(event)` directly
- No registration required
- Tool implements method only if needed
- Return `true` to stop event propagation, `false` to continue

## Migration from Old System

### Old Pattern (Removed)

```javascript
// ❌ OLD - Over-engineered registration system
class MoveTool {
    onKeyDown(event) {
        if (event.code === 'MetaLeft' || event.code === 'MetaRight') {
            if (this.isDragging && !this.isDuplicationMode) {
                this.enterDuplicationMode();
            }
            return true;
        }
        return false;
    }
}

// ToolController registered handlers on tool switch
const handlers = {
    onKeyDown: this.activeTool.onKeyDown.bind(this.activeTool),
    onKeyUp: this.activeTool.onKeyUp.bind(this.activeTool)
};
keyboardRouter.registerTool(toolName, handlers);

// InputController proxied key state
get keys() {
    return keyboardRouter?.keys || new Set();
}
```

### New Pattern (Current)

```javascript
// ✅ NEW - Direct state polling
class MoveTool {
    isCommandKeyPressed() {
        const keyboardRouter = window.modlerComponents?.keyboardRouter;
        return keyboardRouter?.keys.has('MetaLeft') ||
               keyboardRouter?.keys.has('MetaRight');
    }

    updateDragMovement() {
        // Poll state each frame
        const isCommandPressed = this.isCommandKeyPressed();
        if (isCommandPressed && !this.isDuplicationMode) {
            this.enterDuplicationMode();
        } else if (!isCommandPressed && this.isDuplicationMode) {
            this.exitDuplicationMode();
        }
    }
}

// No registration needed
// No proxies needed
// Direct access when needed
```

## Component Integration

### Accessing KeyboardRouter

```javascript
// From anywhere in the application
const keyboardRouter = window.modlerComponents?.keyboardRouter;

// Check if key is currently pressed
if (keyboardRouter?.keys.has('ShiftLeft')) {
    // Do something
}

// Check multiple keys
const isAltPressed = keyboardRouter?.keys.has('AltLeft') ||
                     keyboardRouter?.keys.has('AltRight');
```

### Key Codes

Use event.code values, not event.key:
- `'MetaLeft'`, `'MetaRight'` - Command/Windows key
- `'AltLeft'`, `'AltRight'` - Option/Alt key
- `'ShiftLeft'`, `'ShiftRight'` - Shift key
- `'ControlLeft'`, `'ControlRight'` - Ctrl key
- `'Space'` - Spacebar
- `'KeyQ'`, `'KeyW'`, etc. - Letter keys

## Files

**Core**:
- `interaction/keyboard-router.js` - Main keyboard routing logic
- `application/tool-controller.js` - Tool switching (no keyboard registration)
- `interaction/input-controller.js` - Mouse input (no keyboard proxies)

**Tools Using Keyboard**:
- `application/tools/move-tool.js` - State polling pattern (Command key duplication)
- `application/tools/box-creation-tool.js` - Event handler pattern (Escape to cancel)

## Removed Code

Lines removed during simplification: **~150 lines**

**Removed from KeyboardRouter**:
- `toolKeyboardHandlers` Map
- `registerTool()` method
- `unregisterTool()` method
- `setActiveTool()` method
- `currentTool` property

**Removed from ToolController**:
- Tool handler registration logic
- Handler binding on tool switch
- Unregistration on tool deactivate

**Removed from InputController**:
- `keys` getter proxy property
- `isKeyDown()` method

**Removed from MoveTool**:
- `onKeyDown()` event handler
- `onKeyUp()` event handler

## Benefits of Simplified Architecture

1. **~150 lines removed** - Less code to maintain
2. **No registration overhead** - Tools just work
3. **Direct, predictable flow** - Easy to trace
4. **State polling** - Tools check when needed, not on every event
5. **No binding complexity** - No function binding or context management
6. **Event handlers still work** - For tools that truly need them
7. **Dynamic modifier detection** - Can toggle during operations (e.g., duplication during drag)

## Common Patterns

### Check Modifier During Operation

```javascript
// In tool's operation update loop
const keyboardRouter = window.modlerComponents?.keyboardRouter;
const isShiftPressed = keyboardRouter?.keys.has('ShiftLeft') ||
                       keyboardRouter?.keys.has('ShiftRight');
if (isShiftPressed) {
    // Enable snap mode
}
```

### Handle Specific Key Press

```javascript
// In tool class
onKeyDown(event) {
    if (event.code === 'Escape') {
        this.cancelOperation();
        return true;  // Handled
    }
    return false;  // Not handled
}
```

### Check at Operation Start

```javascript
startDrag() {
    const keyboardRouter = window.modlerComponents?.keyboardRouter;
    if (keyboardRouter?.keys.has('MetaLeft') ||
        keyboardRouter?.keys.has('MetaRight')) {
        this.enterDuplicationMode();
    }
}
```

## Design Principles

1. **Single Source of Truth**: KeyboardRouter owns key state
2. **Direct Access**: Components query state directly when needed
3. **Minimal Abstraction**: No unnecessary proxies or indirection
4. **Event Handlers are Optional**: Only for immediate reactions, not state queries
5. **Poll Don't React**: Check state when it matters, don't react to every change
6. **Priority-Based**: Clear precedence prevents conflicts
7. **No Registration Dance**: Tools just implement methods if needed

## Version History

### Version 2.0 (2025-01-07)
- **Removed**: Registration system, proxies, binding complexity
- **Added**: Direct state polling pattern
- **Changed**: Tool handlers called directly, no registration needed
- **Result**: ~150 lines removed, simpler architecture

### Version 1.0 (Previous)
- Registration-based system
- InputController proxy
- Tool handler binding on switch
