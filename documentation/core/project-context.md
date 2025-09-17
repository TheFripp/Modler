# Modler Project Context
**Essential background for new Claude agents**

## What is Modler?

Modler is a browser-based 3D modeling web application built with Three.js. The core functionality allows users to:
- Create and manipulate 3D objects (containers, primitives)
- Select objects and containers with visual feedback
- Use specialized tools (move, push/pull, select) for object interaction
- See face highlights when hovering over selected objects with certain tools
- Organize objects in hierarchical container structures

## Current State (September 2025)

### V1 Status: Over-Engineered Paralysis
- **23,000+ lines** across 64+ files for basic functionality
- **Circular dependencies** making initialization unreliable
- **Deep call stacks** making debugging nearly impossible
- **Manager explosion** - too many abstraction layers
- **Development paralysis** - simple features taking hours or days

### Core V1 Functionality (What Actually Works)
- Object creation and basic manipulation
- Container system for object organization  
- Basic tool switching
- Selection system (when not broken by refactoring)

### What's Broken in V1
- **Face highlighting** - the "litmus test" feature that should be simple
- **Selection reliability** - works sometimes, breaks often
- **Tool coordination** - tools don't communicate state properly
- **Performance** - over-abstracted systems create bottlenecks

## V2 Vision: Radical Simplification

### Target Metrics
- **<5,000 lines total** for core functionality
- **<20 core files** instead of 64+
- **<1 hour** to implement simple features
- **<15 minutes** to fix typical bugs
- **<5 function calls** for any user interaction

### Architecture Strategy
Four-layer system with hard boundaries:
1. **Foundation Layer** - Direct Three.js usage
2. **Scene Layer** - 3D scene management
3. **Interaction Layer** - Mouse/keyboard → 3D actions
4. **Application Layer** - Tools and UI

### Success Criteria
If face highlighting requires more than 30 lines and 3 function calls, the architecture is wrong.

## Development Environment

### File Structure
```
/Users/fredrikjansson/Documents/Claude/Modler/
├── MODLER_V2_SETUP/          # This folder - portable agent setup
├── js/                       # V1 codebase (over-engineered)
├── css/                      # Styling
├── index.html               # Main application
└── [various other V1 files]
```

### V1 Key Files (For Reference)
- `js/main.js` - Application initialization 
- `js/core/FaceHighlightSystem.js` - The broken highlight system
- `js/managers/SelectionManager.js` - Selection state management
- `js/managers/ToolManager.js` - Tool switching logic
- `js/tools/` - Individual tool implementations

### Testing Approach
- Use Playwright MCP tools for browser testing
- Focus on end-user functionality, not unit tests
- Test in actual browser environment with real interactions

## Agent Specialization Strategy

### When to Use Each Agent
- **Architecture Guardian** - Preventing over-engineering, design decisions
- **Implementation Specialist** - Building features, writing code
- **Documentation Keeper** - Maintaining this context, updating progress
- **System Health Monitor** - Debugging, performance, integration issues

### Inter-Agent Handoffs
- Architecture Guardian → Implementation Specialist: "Build X following pattern Y"
- Implementation Specialist → System Health Monitor: "X is built, validate it works"
- System Health Monitor → Documentation Keeper: "X tested, update progress"

## Key Learnings from V1

### What Worked
- Modular thinking and separation of concerns
- Event-driven architecture concepts
- Comprehensive documentation approach

### What Failed Catastrophically
- **Premature abstraction** - complex patterns before proving simple cases work
- **Manager for everything** - not every concept needs a dedicated manager
- **Deep inheritance** - favor flat, composable structures
- **Complex initialization** - circular dependencies are architecture failures

### Anti-Patterns to Avoid
1. Adding abstraction layers without clear single purpose
2. Complex initialization sequences with dependency injection
3. Deep call stacks for simple user interactions
4. Creating new patterns instead of following established ones

## Current Priority

**Phase 1**: Foundation layer implementation
- Basic Three.js scene setup (~100 lines)
- Direct input handling (~150 lines) 
- Prove face highlighting can be simple

**Success Gate**: If foundation layer exceeds complexity budgets, stop and redesign.

---
**Document Status**: 🟢 Active - Update as project evolves  
**Last Updated**: September 2025  
**Next Review**: After Phase 1 completion