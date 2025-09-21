# Modler V2 - Development Guide

## Project Overview
CAD software featuring rule-based parametric design through intelligent 3D auto-layout system. Unlike traditional polygon modeling, Modler uses container-based hierarchies with automatic object distribution, gap management, and constraint-based positioning - bringing Figma-style layout automation to 3D space.

**Core Features**:
- **Parametric Design**: Rule-based object relationships and automatic layout recalculation
- **3D Auto-Layout**: X/Y/Z linear and grid arrangements with fill/fixed/hug sizing behaviors
- **Container Hierarchies**: Nested layout containers with automatic child positioning
- **Real-time Layout Guides**: Visual feedback for gaps, padding, and alignment constraints

**Current Architecture**: Clean 3-layer selection flow with direct container-first logic, render-order wireframes, and centralized mesh synchronization.

## 🎨 UI Design System

### **Design Language Principles**
- **Minimal & Clean**: Focus on content, minimal visual noise
- **Dark Theme**: Professional dark interface optimized for extended use
- **Subtle Separators**: Horizontal lines instead of heavy borders/cards
- **Functional Hierarchy**: Clear information architecture without excessive decoration

### **Color Palette**
- **Primary Action**: `#6b7280` (gray-500) - Subtle, professional accent
- **Interactive Hover**: `#4b5563` (gray-600) - Slightly darker on interaction
- **Active/Selected**: `#374151` (gray-700) - Clear but not overpowering
- **Background**: `#1f2937` (gray-800) - Main panel background
- **Surface**: `#111827` (gray-900) - Cards and elevated surfaces
- **Border/Separator**: `#374151` (gray-700) - Subtle division lines
- **Text Primary**: `#f9fafb` (gray-50) - Main readable text
- **Text Secondary**: `#9ca3af` (gray-400) - Labels and meta information

### **Layout Principles**
- **No Card Borders**: Remove rectangular outlines around sections
- **Horizontal Separators**: Use `border-b border-gray-700` between sections
- **Consistent Spacing**: 16px (4 Tailwind units) between major sections
- **Minimal Padding**: 12px (3 Tailwind units) for content areas
- **Clean Typography**: Clear hierarchy without excessive styling

### **Component Standards**
- **Buttons**: `bg-gray-600 hover:bg-gray-500 text-white` for primary actions
- **Inputs**: `bg-gray-900 border-gray-700 focus:border-gray-500`
- **Panels**: `bg-gray-800` with `border-gray-700` separators
- **Badges**: `bg-gray-700 text-gray-200` for labels and tags

### **Implementation Notes**
- **Replace all blue (`blue-*`) colors** with gray equivalents
- **Remove `Card` component borders** - use content spacing instead
- **Use horizontal lines** (`<hr>` or `border-b`) between sections
- **Consistent with vanilla JS panels** for seamless integration

## 🤖 Agent-Based Development (CRITICAL)

**MANDATORY**: All significant development must go through specialized agents to prevent complexity creep and maintain code quality.

### When to Activate Agents

#### 🛡️ Architecture Guardian - **USE FIRST**
**Activate BEFORE any new functionality:**
- Adding new features or abstractions
- Files approaching 300 lines
- Creating new managers or coordination systems
- Unsure if solution is over-engineered
- When complexity budget might be exceeded

#### 🔨 Implementation Specialist 
**Use for building approved features:**
- Implementing from Architecture Guardian approved patterns
- Following established V2 layer structure
- Building within approved complexity budgets
- Need examples of existing patterns

#### 📚 Documentation Keeper
**Use when patterns change:**
- Review existing documentation
- New architectural decisions made
- Implementation patterns established
- Documentation gaps identified
- Progress tracking needed

#### 🏥 System Health Monitor
**Use after implementation:**
- Feature implementation complete
- End-to-end validation needed
- Performance testing required
- Cross-browser testing needed

#### 🧹 Code Cleaner - **USE AFTER USER CONFIRMS FEATURE WORKS**
**Activate when user says "this works" or "this is working correctly":**
- Remove excessive debug logging and console spam
- Delete unused methods and dead code
- Consolidate duplicate code patterns
- Clean up orphaned script inclusions
- Eliminate verbose object state dumps
- Maintain only essential error logs and user feedback

#### 🚀 Git Agent - **USE FOR REPOSITORY OPERATIONS**
**Activate when user approves feature for commit:**
- "This feature is working correctly"
- "This is approved for commit"
- "Push this to the repository"
- "Commit and push these changes"
- Follows DevOps best practices with conventional commits
- Ensures clean commit history and proper branch management
- Includes automated quality checks and push safety

### Agent Locations
- Architecture Guardian: `/agents/architecture-guardian/AGENT_INSTRUCTIONS.md`
- Implementation Specialist: `/agents/implementation-specialist/AGENT_INSTRUCTIONS.md`
- Documentation Keeper: `/agents/documentation-keeper/AGENT_INSTRUCTIONS.md`
- System Health Monitor: `/agents/system-health-monitor/AGENT_INSTRUCTIONS.md`
- Code Cleaner: `/agents/code-cleaner/AGENT_INSTRUCTIONS.md`
- Git Agent: `/agents/git-agent/AGENT_INSTRUCTIONS.md`

## Core Principles

### 1. Simplicity Over Complexity
- Direct solutions over abstractions
- 3-layer flow: `Click → Tool → SelectionController`
- No over-engineering or premature optimization

### 2. Current Architecture Patterns
- **Container-First Selection**: Click child → selects parent container
- **Double-Click Direct Selection**: Bypasses container-first logic
- **Render-Order Wireframes**: `renderOrder: 999` for visibility
- **Centralized Mesh Sync**: All related meshes via MeshSynchronizer

### 3. Container Architecture - CRITICAL RULES
**NEVER assume tool dependency for container operations** - this leads to architectural confusion.

#### **Container Creation Pattern**
- **Correct**: Direct command (Cmd+F) → ToolController → ContainerManager
- **Wrong**: Container creation requires tool activation
- **Implementation**: `ToolController.handleKeyCombo()` detects Cmd+F and calls ContainerManager directly

#### **Container Modes**
- **Default Mode**: Container acts as group for moving/manipulating objects together
- **Layout Mode**: Smart rule-based positioning with dynamic object relationships
- **Mode Activation**: Property-panel driven, NOT tool-driven

#### **Layout System Pattern**
- **Correct**: Property panel change → PropertyUpdateHandler → layout calculations
- **Wrong**: Tool activation → layout mode through button clicks
- **Key Principle**: Layout mode is a property state, not a tool state

### 4. CAD Geometry Principles - CRITICAL FOR ACCURACY

**ALWAYS use geometry-based manipulation, NEVER visual transforms**

#### **Dimension Changes**
- **Correct**: Modify geometry vertices directly via `PropertyManager.updateObjectGeometryDimension()`
- **Wrong**: Use `object.scale[axis] = value` (visual transform only)
- **Why**: CAD accuracy, proper bounding boxes, container updates work correctly

#### **Geometry Manipulation Pattern**
```javascript
// 1. Compute current geometry bounds
geometry.computeBoundingBox();
const bbox = geometry.boundingBox;

// 2. Calculate scale factor from real dimensions
const currentDimension = bbox.max.x - bbox.min.x;
const scaleFactor = targetDimension / currentDimension;

// 3. Modify vertices directly
const positions = geometry.getAttribute('position');
const vertices = positions.array;
for (let i = 0; i < vertices.length; i += 3) {
    vertices[i + axisIndex] = center + (distanceFromCenter * scaleFactor);
}

// 4. Update geometry and trigger container updates
positions.needsUpdate = true;
geometry.computeBoundingBox();
sceneController.notifyObjectTransformChanged(objectId);
```

#### **Unified System Benefits**
- **Property panel** and **tool operations** use same geometry manipulation
- **Container updates** work consistently across all input methods
- **Bounding box calculations** are accurate for all operations
- **True CAD behavior** rather than visual effects

#### **Reference Implementation**
- Property panel: `PropertyManager.updateObjectGeometryDimension()`
- Push tool: Direct vertex manipulation in `modifyPushedFace()`
- Move tool: Uses same coordinate transformation principles

### 5. File Size Limits
- **Tools**: 200 lines max
- **Controllers**: 300 lines max
- **Any file over limits**: Requires Architecture Guardian review

## Development Principles

### 1. Implementation Standards
- Direct solutions over abstractions
- 3-layer flow: `Click → Tool → SelectionController`
- No over-engineering or premature optimization

### 2. Logging Standards - CRITICAL RULES
- **NEVER log on every frame or animation loop** - this WILL crash browsers
- **NEVER log inside geometry processing loops** - this creates thousands of logs per second
- **NEVER log during continuous mouse movement** - this overwhelms the console
- **PRAGMATIC LOGGING ONLY:**
  - **User events**: clicks, drags, tool activation, object creation/deletion
  - **State changes**: snap enabled/disabled, tool switches, mode changes
  - **Error conditions**: failed operations, invalid states, missing resources
  - **Performance milestones**: large operations starting/completing
- **Use EVENT-BASED logging**: Only log when something actually happens, not during polling
- **Use THROTTLED logging**: 500ms minimum interval for any repeated operations
- **Use CONDITIONAL logging**: Only log when debugging specific issues
- **REMOVE ALL debug logging** before completing features - no exceptions
- **Example BAD logging**: Inside `updateSnapDetection()`, `getVisibleObjectCorners()`, `onMouseMove()`
- **Example GOOD logging**: `Tool activated`, `Snap point found`, `Object created`, `Error: mesh sync failed`

### 3. Development Environment
- **Do NOT open new browser windows** - user manages their own session and will refresh manually
- **Respect existing browser sessions** - user has control over when to refresh

### 4. Documentation Approach
- **Document concepts, not code** - patterns and architectural decisions over implementation details
- **Build on existing documentation** - always review `/documentation/` before creating new files
- **Consolidate overlapping content** - eliminate redundant documentation streams
- **Only document validated features** - wait for user confirmation that features work correctly
- **Reference source files** for actual code examples
- **Focus on "why" and "when"**, not "how"
- **Keep examples conceptual**, not syntactic

### 3. Current Architecture Patterns
- **Container-First Selection**: Single click on child objects selects their parent container
- **Double-Click Direct Selection**: Bypasses container-first logic to select actual object  
- **Render-Order Wireframes**: Simple render order approach prevents orbit visibility issues
- **Child Container Visibility**: Child containers maintain visibility when nested in parents
- **Centralized Mesh Sync**: All related meshes coordinated via MeshSynchronizer

## Documentation Structure

**For specific topics, reference documentation directory:**

✅ **CONSOLIDATED**: Documentation streamlined from 5,400+ lines to 3,153 lines across 18 focused files.

## 📚 Documentation Navigation

### 🎯 Core Documentation
- **System Architecture**: [`/core/architecture-v2.md`](documentation/core/architecture-v2.md) - V2 principles and patterns
- **Feature Roadmap**: [`/core/feature-roadmap.md`](documentation/core/feature-roadmap.md) - Live development planning 
- **UX Design Principles**: [`/core/ux-design.md`](documentation/core/ux-design.md) - Interaction patterns and mental models
- **Project Context**: [`/core/project-context.md`](documentation/core/project-context.md) - Project background and status

### 🔧 Development Guides
- **Tool Development**: [`/development/tool-guide.md`](documentation/development/tool-guide.md) - Tool development patterns
- **API Reference**: [`/development/api-reference.md`](documentation/development/api-reference.md) - Method signatures and file references
- **API Quick Reference**: [`/development/api-quick-reference.md`](documentation/development/api-quick-reference.md) - Essential method signatures
- **Complexity Guidelines**: [`/development/complexity-guidelines.md`](documentation/development/complexity-guidelines.md) - Complexity management rules

### 🏗️ System Documentation
- **Selection System**: [`/systems/selection.md`](documentation/systems/selection.md) - Container-first selection patterns
- **Container System**: [`/systems/containers.md`](documentation/systems/containers.md) - Dual geometry containers and layout
- **Container Architecture Master**: [`/systems/container-architecture-master.md`](documentation/systems/container-architecture-master.md) - ⚠️ **CRITICAL** - Complete container system analysis and correct architecture patterns
- **Tool System**: [`/systems/tools.md`](documentation/systems/tools.md) - Tool coordination and shared behaviors
- **Input & Events**: [`/systems/input-events.md`](documentation/systems/input-events.md) - Event coordination and camera controls
- **Mesh Synchronization**: [`/systems/mesh-synchronization.md`](documentation/systems/mesh-synchronization.md) - Centralized mesh coordination
- **Performance Guide**: [`/systems/performance-guide.md`](documentation/systems/performance-guide.md) - Optimization and debugging
- **Face Highlighting**: [`/systems/face-highlighting.md`](documentation/systems/face-highlighting.md) - Face-based interaction
- **Camera & Raycasting**: [`/systems/camera-raycasting.md`](documentation/systems/camera-raycasting.md) - Camera integration patterns

### 🔬 Parametric Design System
- **Dependency Graph System**: [`/systems/dependency-graph-system.md`](documentation/systems/dependency-graph-system.md) - Change propagation and relationship tracking
- **Layout Propagation Engine**: [`/systems/layout-propagation-engine.md`](documentation/systems/layout-propagation-engine.md) - Efficient hierarchy updates and cascade management
- **Property Update Handler**: [`/systems/property-update-handler.md`](documentation/systems/property-update-handler.md) - Property-panel driven updates with dependency awareness
- **Formula Engine**: [`/systems/formula-engine.md`](documentation/systems/formula-engine.md) - Parametric expressions and variable management
- **Component Template Manager**: [`/systems/component-template-manager.md`](documentation/systems/component-template-manager.md) - Master-instance relationships and design system workflows

### 🐛 Debugging & Analysis
- **Debugging Selection**: [`/development/debugging-selection.md`](documentation/development/debugging-selection.md) - Selection troubleshooting
- **Selection Complexity Analysis**: [`/development/selection-complexity-analysis.md`](documentation/development/selection-complexity-analysis.md) - Selection system analysis

## Development Workflow

### Iterative Development Process

**Phase 1: Planning & Initial Implementation**
1. **Architecture Guardian approval** - Get complexity budget and approach approval
2. **Initial implementation** - Build minimal working version
3. **Basic interaction patterns** - Document UX approach only
4. **Manual testing** - Test functionality and UX iteratively

**Phase 2: User Validation (Only after YOU confirm it works)**
5. **User testing feedback** - Confirm feature works as intended
6. **Code Cleaner** - Clean up excessive logging and dead code after user confirms "this works"
7. **System Health Monitor** - Comprehensive technical validation only after user approval
8. **Documentation Keeper** - Final technical documentation only after validation
9. **Feature Roadmap updates** - Mark as completed with actual metrics

### ⚠️ CRITICAL RULE CHANGES

**DO NOT activate System Health Monitor or Documentation Keeper until:**
- ✅ User has tested the feature manually
- ✅ User confirms "this works as intended"
- ✅ Code Cleaner has been activated to clean up the implementation
- ✅ User indicates ready for final validation

**DO ACTIVATE Code Cleaner immediately when:**
- ✅ User says "this works" or "this is working correctly"
- ✅ Feature functionality is confirmed by user
- ✅ Before moving to next development task

**Reasons**:
- Saves significant time and tokens on non-working features
- Prevents accumulation of debug code and technical debt
- Focuses effort on working solutions rather than theoretical validation
- Maintains clean codebase for future development

## Common Issues & Solutions

### Selection Problems
**Activate Architecture Guardian** → Reference [`/systems/selection.md`](documentation/systems/selection.md) for container-first patterns and debugging

### Container Issues ⚠️ **CRITICAL ARCHITECTURE AREA**
**FIRST**: Read [`/systems/container-architecture-master.md`](documentation/systems/container-architecture-master.md) to understand correct architecture patterns

**Implementation Status** (Phase B: Core Architecture Fixes):
- ✅ Direct Container Creation - Cmd+F → ContainerManager call
- ✅ Container Sizing Mode - Default 'hug' mode with Push Tool → 'fixed' mode switching
- ⚠️ PropertyUpdateHandler - Property-panel driven layout system (pending)

**Container Todo List:**
1. ✅ Fix container creation flow (no tool dependency)
2. ✅ Add container sizing modes (hug/fixed)
3. ⚠️ Property panel integration for sizing mode UI
4. ⚠️ PropertyUpdateHandler implementation

**Common Architecture Mistakes:**
- Assuming container creation requires tool activation ❌
- Designing layout mode as tool-driven instead of property-driven ❌
- Creating tool dependencies for simple container operations ❌

**Correct Patterns:**
- Container creation: Direct command (Cmd+F) → ToolController → ContainerManager ✅
- Layout mode: Property panel → PropertyUpdateHandler → layout calculations ✅
- Container modes: Default (group behavior) vs Layout (smart positioning) ✅

**Activate Architecture Guardian** → Reference container architecture master doc for detailed analysis

### Tool Coordination Problems
**Activate Implementation Specialist** → Reference [`/systems/tools.md`](documentation/systems/tools.md) for event coordination patterns

### 🚨 Stuck on Same Issue (3-4 Failed Attempts)
**Activate Architecture Guardian (Debugging Mode)** → When repeated attempts to fix the same issue fail, activate Architecture Guardian to:
- Review documentation compliance and architectural patterns
- Identify if the issue is caused by non-compliance with established V2 principles
- Check if the approach violates complexity budgets or architectural boundaries
- Suggest architectural fixes rather than continued tactical attempts

**Rule**: If the same bug/issue persists after 3-4 fix attempts, the problem is likely architectural non-compliance, not implementation details.

### Performance Issues
**Activate System Health Monitor** → Reference [`/systems/performance-guide.md`](documentation/systems/performance-guide.md) for optimization strategies

### Face Highlighting Issues
**Activate Implementation Specialist** → Reference [`/systems/face-highlighting.md`](documentation/systems/face-highlighting.md) for geometry detection patterns

### Input/Event Conflicts
**Activate Architecture Guardian** → Reference [`/systems/input-events.md`](documentation/systems/input-events.md) for event coordination principles

### Mesh Synchronization Problems
**Activate Implementation Specialist** → Reference [`/systems/mesh-synchronization.md`](documentation/systems/mesh-synchronization.md) for centralized coordination patterns

### 🧹 Code Cleanup After Feature Completion
**Activate Code Cleaner** → When user confirms feature works correctly:
- Remove excessive debug logging and console spam
- Delete unused methods and dead code
- Consolidate duplicate code patterns
- Clean up orphaned script inclusions
- Prevent technical debt accumulation

---

**⚠️ CRITICAL**: This file focuses on agent protocols and high-level guidance. Detailed patterns and examples belong in the focused guide files. Always activate the appropriate agent before significant development work.