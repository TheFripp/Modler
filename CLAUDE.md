# Modler V2 - Development Guide

## Project Overview
CAD software for creative hobbyists. Rule-based parametric design with intelligent 3D auto-layout. Container-based hierarchies with automatic object distribution, gap management, and constraint-based positioning.

**Mission**: Making makers make - Simple, intuitive, efficient CAD without the steep learning curve.

**Architecture**: 3-layer selection flow with container-first logic, render-order wireframes, GeometryUtils-driven support mesh updates, persistent child ordering via `childrenOrder` arrays.

---

## Mindset & Guiding Principles

**Core Philosophy**: Invest time now for systematic, multiplying returns later. Build predictable systems with standardized, reusable patterns.

### Decision-Making Principles

1. **Always seek simplicity** - Direct solutions over abstractions, predictable systems over clever code
2. **Stability over aesthetics** - Working product > line count reduction or code beauty
3. **Understand before acting** - Investigate root causes, don't assume or patch symptoms
4. **Surgical fixes over rewrites** - Only consolidate when genuine architectural benefit exists
5. **Boil down to core principles** - Every feature decision: what's the fundamental need? Build systematically toward that
6. **Standardization & reusability** - Abstract functionality into reusable patterns, avoid one-off solutions
7. **Forward momentum with restoration points** - Keep pushing forward, document stable milestones for rollback safety
8. **Common sense over rigid rules** - File size limits are guides; if 1200 lines is optimal and justified, that's fine
9. **Question everything** - "Does this improve the foundation?" If answer isn't clear yes, reconsider

### Architecture & Implementation

10. **Foundation systems first** - Establish "why" before "how", understand architectural context before coding
11. **Single source of truth** - ObjectStateManager for state, SceneController coordinates geometry (delegates to SceneHierarchyManager, SceneLayoutManager, SceneLifecycleManager), SimpleCommunication for UI synchronization
12. **CAD geometry, never transforms** - All manipulation through geometry, never visual-only transforms
13. **Support mesh principle** - Create once as children, then show/hide. Master object is truth.
14. **State-first pattern** - Tools use ObjectStateManager.updateObject(), never direct mesh manipulation
15. **Proactive documentation** - At milestones (working feature, architectural change, bug fix), document IMMEDIATELY in `/documentation/` before summarizing

### User Experience

16. **Build for the creative hobbyist** - Someone like you: making their making better
17. **Simplicity, intuitiveness, efficiency** - Most CAD is clunky with steep learning curves. We're not that.
18. **Predictable interactions** - Container-first selection, property-panel driven layout, consistent patterns throughout
19. **Don't surprise the user** - Be proactive when asked, but never take unexpected actions
20. **UI responsiveness matters** - Panels must load fast, interactions must feel immediate

---

## Foundation Systems (Architectural "Why")

### Object Types & Constants
- **OBJECT_TYPES**: `{ BOX: 'box', CONTAINER: 'container' }` — defined in `ObjectDataFormat`, exported globally
- **CONTAINER_MODES**: `{ MANUAL: 'manual', LAYOUT: 'layout', HUG: 'hug' }` — single source of truth for container mode
- **MAX_NESTING_DEPTH**: `2` — enforced in both UI (ObjectTree) and data layer (SceneHierarchyManager)
- **Why**: Centralized constants prevent magic strings, enable validation, and make adding new types straightforward

### Container Mode System
- **`containerMode`**: Single canonical property on every container: `'manual' | 'layout' | 'hug'`
- **Reading mode**: Use `getContainerMode(id)`, `isLayoutMode(id)`, or `isHugMode(id)` — or check `containerMode === 'layout'` directly on data objects
- **Writing mode**: Use `ObjectStateManager.buildContainerModeUpdate(mode)` — returns `{ containerMode, isHug, sizingMode }` keeping legacy flags in sync
- **Runtime code**: Must NEVER check `autoLayout?.enabled`, `isHug`, `sizingMode`, or `layoutMode` for mode detection. All runtime checks use `containerMode` exclusively. (Cleaned up in Rounds 1-3, March 2026)
- **Serialization only**: Legacy flags (`isHug`, `sizingMode`, `autoLayout.enabled`) are read only in deserialization (loading old save files) and in `getContainerMode()` as the canonical fallback reader
- **Why**: Replaced 5 overlapping flags with one enum. Eliminates mutual-exclusivity bugs and priority-chain confusion.

### Object Hierarchy & Ordering
- **childrenOrder arrays**: Containers store explicit child order for layout engine. Initialized on first child add, maintained through moves/reorders. Serialized to UI via ObjectDataFormat.
- **Why**: Layout engines need predictable, user-controllable object sequence. Drag-drop in ObjectTree directly maps to 3D layout order.

### State Management Flow
- **ObjectStateManager** → Single entry point for ALL state changes, delegates to specialized systems
- **LayoutPropagationManager** → Handles bottom-up layout propagation through container hierarchies
- **SceneController + Managers** → Execute geometry changes, emit events for UI synchronization
- **Why**: Clear separation prevents competing updates, ensures event emission, maintains consistency. Never bypass ObjectStateManager for state changes.

### UI ↔ 3D Communication
- **Main → UI**: `ObjectEventBus` → `SimpleCommunication` → `DataExtractor` → `postMessage` to UI iframes
- **UI → Main**: Svelte components → `postMessage` → `main-integration.js` handlers → `CommandRouter` → `PropertyUpdateHandler` → `ObjectStateManager`
- **SimpleCommunication** (`/integration/communication/simple-postmessage.js`): Subscribes to ObjectEventBus, extracts complete data via DataExtractor, computes derived properties, sends to all UI iframes
- **CommandRouter** (`/application/command-router.js`): Routes incoming UI commands to appropriate handlers
- **Why**: Direct data extraction with no intermediate serialization layers. Event-driven, automatic UI synchronization.

### Support Mesh Architecture
- Created once as children at object creation, then only show/hide via VisualizationManager
- Master object geometry is single source of truth, support meshes inherit transforms automatically
- **Why**: Eliminates expensive recreation, maintains geometric consistency, simplifies updates

### Container-First Selection
- Click child → selects parent container, double-click for direct selection
- **Why**: Containers are primary working units in layout mode. Most operations target containers, not individual children.

---

## File Structure & Responsibilities

### Core Systems (Single Source of Truth)
- **ObjectStateManager** (`/core/`) - ALL state changes, use updateObject() for everything
- **LayoutPropagationManager** (`/layout/`) - Bottom-up layout propagation, depth caching, deferred updates
- **SceneController** (`/scene/`) - 3D geometry coordinator, delegates to specialized scene managers
- **SceneHierarchyManager** (`/scene/`) - Parent-child relationships, nesting validation, root ordering
- **SceneLayoutManager** (`/scene/`) - Layout calculations, container sizing, fill/fixed/hug modes
- **SceneLifecycleManager** (`/scene/`) - Object creation, deletion, ID generation, support meshes
- **ToolController** (`/application/`) - Tool activation/switching only
- **BaseTool** (`/application/tools/base-tool.js`) - Base class for all tools: lazy component getters, default event handlers, hover management. New tools extend BaseTool and override only what they need.

### Communication & UI
- **SimpleCommunication** (`/integration/communication/simple-postmessage.js`) - ObjectEventBus → DataExtractor → postMessage (Main → UI)
- **CommandRouter** (`/application/command-router.js`) - Routes UI commands to handlers (UI → Main)
- **main-integration.js** (`/integration/svelte/`) - Receives postMessage from UI, dispatches to CommandRouter
- **PropertyController** (`/svelte-ui/src/lib/services/`) - UI property state management
- **PropertySectionRegistry** (`/svelte-ui/src/lib/services/`) - Maps object types to UI sections
- **UI Component Library** (`/svelte-ui/src/lib/components/ui/`) - Centralized reusable Svelte components (see [`/documentation/development/svelte-ui-integration.md`](documentation/development/svelte-ui-integration.md))

### Managers (Specialized Business Logic)
- **PropertyUpdateHandler** (`/application/handlers/`) - Routes UI property changes → ObjectStateManager
- **ContainerCrudManager** (`/application/tools/`) - Container create/delete/resize operations
- **VisualizationManager** (`/interaction/`) - Support meshes, highlights, visual effects
- **HistoryManager** (`/application/managers/`) - Undo/redo command execution

### Decision Tree (Where Does Code Go?)
- State change? → `ObjectStateManager.updateObject()` (single entry point, never bypass)
- Reading object data? → `SceneController.getObject()`
- Object creation/deletion? → `SceneController.addObject/removeObject()` (delegates to SceneLifecycleManager)
- Parent-child relationships? → `SceneController` methods (delegate to SceneHierarchyManager)
- Layout calculation? → `SceneController.updateLayout()` (delegates to SceneLayoutManager)
- Layout propagation? → Automatic via `ObjectStateManager.updateObject()` (delegates to LayoutPropagationManager)
- UI property update? → `PropertyUpdateHandler` → `ObjectStateManager`
- UI notification (3D → UI)? → Automatic via `ObjectEventBus` → `SimpleCommunication` → `postMessage`
- UI command (UI → 3D)? → `postMessage` → handler in `main-integration.js`
- Container operation? → `ContainerCrudManager`
- Visual effect? → `VisualizationManager`
- Undo/redo? → `HistoryManager.executeCommand()`
- New object type UI? → `PropertySectionRegistry.register()`
- New tool? → Extend `BaseTool`, override only needed event handlers, register in `v2-main.js`
- New settings category? → Three-file contract: (1) add prefix to CommandRouter `settingsRoutes`, (2) add `handle*Update` + `handleGet*` to SettingsHandler, (3) send/handle messages in SettingsPanel. Config keys must match `CONFIGURATION_SCHEMA`. See [`MESSAGE-PROTOCOL.md`](integration/communication/MESSAGE-PROTOCOL.md) Settings Operations.
- New UI→Main message type? → Register handler in CommandRouter `registerHandlers()`, document in [`MESSAGE-PROTOCOL.md`](integration/communication/MESSAGE-PROTOCOL.md)

**NEVER**: Call specialized managers (SceneHierarchyManager, SceneLayoutManager, SceneLifecycleManager, LayoutPropagationManager) directly - always use coordinators (ObjectStateManager or SceneController)

**NEVER**: Access main window globals from iframe UI (UnitConverter, ConfigurationManager, etc.) — all data must flow through postMessage round-trips

---

## Development Standards

### Implementation
- Direct solutions, no over-engineering
- Support mesh principle: create once, then show/hide
- Common sense over rigid rules: justify architectural decisions with "why"

### Code Quality
- **Logging**: NEVER on animation loops, remove ALL debug logging before completion
- **File guidelines**: ~200 lines for tools, ~300 for controllers (guides, not rules - use judgment)
- **File headers**: Brief purpose, broad functionality, timeline for major revisions only

### Documentation
- Minimal in code, detailed in `/documentation/`
- **Proactive**: Document at milestones BEFORE summarizing
- Versioned with semantic versioning and currency tracking
- See [`/documentation/README.md`](documentation/README.md) for all documentation

### User Experience
- **Browser**: Do NOT open new windows, respect user's session
- **Performance**: Panels must load fast, no multi-second waits
- **Predictability**: Don't surprise users with unexpected actions

---

## Critical Patterns (Never Violate)

❌ **NEVER**:
- Bypass ObjectStateManager for state changes
- Call specialized managers directly (SceneHierarchyManager, SceneLayoutManager, SceneLifecycleManager, LayoutPropagationManager)
- Set `isHug`, `sizingMode`, or `layoutMode` directly — use `ObjectStateManager.buildContainerModeUpdate(mode)` instead
- Check `autoLayout?.enabled`, `isHug`, `sizingMode`, or any legacy flag for mode detection — use `containerMode === 'layout'`/`'hug'`/`'manual'` or `getContainerMode(id)` / `isLayoutMode(id)` / `isHugMode(id)`
- Use visual transforms instead of CAD geometry
- Call `window.postMessage` directly from Main (ObjectEventBus → SimpleCommunication is automatic)
- Recreate support meshes (show/hide only)
- Make assumptions without investigation
- Add complexity without clear architectural benefit

✅ **ALWAYS**:
- Question: "Does this improve the foundation?"
- Seek simplicity and predictability
- Build for systematic reusability
- Document at stable milestones
- Consider the creative hobbyist user

---

## Memory & Documentation

**Quick Reference** (Auto-loaded by Claude):
- System Overview: `@memories/architecture-map.md`
- Code Patterns: `@memories/quick-patterns.md`
- System Index: `@memories/system-summaries.md`
- Active Context: `@memories/active-context.md`

**Detailed Documentation** (Load on-demand):
- Full Documentation Index: `@documentation/README.md`
- State Management Decision Matrix: `@documentation/architecture/STATE-OWNERSHIP-MATRIX.md` (NEW - Phase 4.2)
- State Ownership Architecture: `@documentation/architecture/STATE-OWNERSHIP.md`
- SceneController Split Details: `@documentation/architecture/SCENE-CONTROLLER-SPLIT.md` (Phase 5)
- Essential Guide: `@documentation/guides/transform-vs-geometry.md`
- Complete Data Flow: `@documentation/architecture/data-flow-architecture.md`

---

**Keep this file concise. Detailed patterns belong in `/documentation/` and `/memories/`.**
