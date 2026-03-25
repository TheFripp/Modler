# Modler V2 - Development Guide

CAD software for creative hobbyists. Rule-based parametric design with intelligent 3D auto-layout.

**Mission**: Making makers make — simple, intuitive, efficient CAD without the steep learning curve.

---

## Core Principles

1. **Simplicity first** — direct solutions over abstractions, predictable systems over clever code
2. **Stability over aesthetics** — working product > line count reduction or code beauty
3. **Understand before acting** — investigate root causes, don't assume or patch symptoms
4. **CAD geometry, never transforms** — all manipulation through geometry, never visual-only transforms
5. **State-first pattern** — tools use `ObjectStateManager.updateObject()`, never direct mesh manipulation

Full 20 principles: see auto-memory `project_guiding_principles.md`

---

## Key Architectural Rules

- **`containerMode`** is the sole runtime mode detector (`'manual' | 'layout' | 'hug'`). Read via `getContainerMode(id)` / `isLayoutMode(id)`. Write via `buildContainerModeUpdate(mode)`.
- **ObjectStateManager** is the single entry point for ALL state changes
- **SceneController** coordinates geometry — delegates to SceneHierarchyManager, SceneLayoutManager, SceneLifecycleManager. NEVER call these managers directly.
- **Support meshes**: create once as children, then show/hide only via VisualizationManager
- **SimpleCommunication** handles Main→UI sync automatically via ObjectEventBus → DataExtractor → postMessage
- **NEVER** access main window globals from iframe UI — all data flows through postMessage

Full architecture details: see auto-memory `project_architecture_systems.md`

---

## Decision Tree (Where Does Code Go?)

- State change → `ObjectStateManager.updateObject()`
- Object CRUD → `SceneController.addObject/removeObject()`
- Layout/container → `SceneController.updateContainer()` (handles all modes)
- UI property update → `CommandRouter` (wraps with undo command) → `PropertyUpdateHandler` → `ObjectStateManager`
- UI notification (3D→UI) → Automatic via ObjectEventBus → SimpleCommunication
- UI command (UI→3D) → `postMessage` → `main-integration.js` → `CommandRouter`
- Visual effect → `VisualizationManager`
- Undo/redo → `HistoryManager.executeCommand()` (post-hoc snapshot pattern, see [`/documentation/systems/undo-redo.md`](documentation/systems/undo-redo.md))
- New undoable action → Wrap at `CommandRouter` level, extend `BaseCommand`, register script in `index.html`
- New tool → Extend `BaseTool`, register in `v2-main.js`
- New settings → Three-file contract: CommandRouter settingsRoutes + SettingsHandler + SettingsPanel
- New message type → Register in CommandRouter `registerHandlers()`, document in [`MESSAGE-PROTOCOL.md`](integration/communication/MESSAGE-PROTOCOL.md)
- Yard library item → `YardManager` for data, CommandRouter handlers for messages, `yard.ts` store for UI
- Context menu action → Add to `ContextMenu._getMenuItems()` in `application/ui/context-menu.js`
- New container modifier → Add detection in `PropertyPanel.getModifiers()`, create modifier section component, store data in `autoLayout`
- **Modifier pattern**: Containers are the base (Transform + Layout). Modifiers (Tile, future) add extra sections dynamically. Never use separate registry types for modified containers.

Full file map & responsibilities: see auto-memory `project_file_responsibilities.md`

---

## Development Standards

- **Logging**: NEVER on animation loops, remove ALL debug logging before completion
- **File guidelines**: ~200 lines for tools, ~300 for controllers (guides, not rules)
- **Documentation**: Minimal in code, detailed in `/documentation/`. Document at milestones BEFORE summarizing.
- **Browser**: Do NOT open new windows, respect user's session
- **Performance**: Panels must load fast, interactions must feel immediate
- See [`/documentation/README.md`](documentation/README.md) for full docs

---

## Critical Patterns

❌ **NEVER**:
- Bypass ObjectStateManager for state changes
- Call specialized managers directly — always use ObjectStateManager or SceneController
- Do layout mode-routing outside SceneLayoutManager — call `sceneController.updateContainer()`
- Set container mode directly — use `buildContainerModeUpdate(mode)`
- Use visual transforms instead of CAD geometry
- Recreate support meshes (show/hide only)
- Rebuild autoLayout without spreading existing data — always `{ ...displayObject.autoLayout, ...overrides }` to preserve modifiers
- Add complexity without clear architectural benefit

✅ **ALWAYS**:
- Question: "Does this improve the foundation?"
- Seek simplicity and predictability
- Document at stable milestones
- Build for the creative hobbyist user

---

## References

**Auto-loaded memories** (`/memories/`):
- `architecture-map.md` — system hierarchy, file matrix, decision trees
- `quick-patterns.md` — common code patterns and templates
- `system-summaries.md` — one-line system descriptions
- `active-context.md` — session continuity, milestones, known issues

**Documentation** (`/documentation/`):
- [`README.md`](documentation/README.md) — full documentation index
- [`architecture/STATE-OWNERSHIP.md`](documentation/architecture/STATE-OWNERSHIP.md) — state management
- [`guides/transform-vs-geometry.md`](documentation/guides/transform-vs-geometry.md) — essential CAD guide
- [`architecture/data-flow-architecture.md`](documentation/architecture/data-flow-architecture.md) — complete data flow
