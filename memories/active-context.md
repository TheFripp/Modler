# Modler V2 - Active Context

**Session continuity and work-in-progress tracking**
**Last updated**: 2025-01-21

---

## Current Work

### Active Development
- Architecture simplification phases 0-3 completed (commit `1a55b9e`)
- 50+ modified/untracked files on `feature/next-development` branch

### Completed Milestones
- **Architecture Simplification (Phases 0-3)** - 2026-03-19
- **Container Push & Selection Fixes** - 2025-01-21
- **Layout State Machine Refactor** - 2025-01-20
- **Raycasting & Selection Bug Fixes** - 2025-01-20
- **Communication Simplification** - SimpleCommunication replaced MainAdapter/UIAdapter/MessageProtocol
- Memory architecture, material initialization, unified notifications, tile tool, property sections

---

## Known Issues

### Active Bugs
- None currently tracked ✅

### Technical Debt
- Documentation metadata needs to be added to 50+ files
- Some legacy files may not follow latest patterns
- Warning logs in raycaster can be cleaned up once stability confirmed

---

## Development Priorities

### High Priority
1. Continue feature development on `feature/next-development`

### Medium Priority
1. Add metadata to documentation files
2. Performance optimization review

### Low Priority
1. Archive old documentation

---

## Recent Architectural Decisions

### 2025-10-10: Material Initialization Pattern
- **Decision**: Update existing material instances after ConfigurationManager loads, don't recreate
- **Problem**: Materials created before config loads got fallback defaults, conflicting callbacks overwrote correct values
- **Solution**: Use `MaterialManager.updateMaterialsOfType()` to update existing instances with both color AND opacity
- **Impact**: Face highlights now show correct user-configured colors and opacity on page load
- **Files Changed**:
  - `material-manager.js` - Removed conflicting config callback for `visual.effects.materials.face.opacity`
  - `v2-main.js` - Added material color/opacity updates after config loads
  - `/memories/quick-patterns.md` - Added Material Initialization & Configuration pattern section

### 2025-10-09: Memory System Modernization
- **Decision**: Implement Claude Sonnet 4.5 `/memories` directory structure
- **Rationale**: Leverage cross-session persistence and reduce initial context load
- **Impact**: ~70% reduction in default context (200 lines vs 700+)
- **Files Created**:
  - `/memories/architecture-map.md` - System hierarchy and quick reference
  - `/memories/quick-patterns.md` - Code templates for common tasks
  - `/memories/system-summaries.md` - One-line system descriptions
  - `/memories/active-context.md` - This file

### 2025-10-13: Phase 3 Communication Layer Complete
- **Decision**: Replace PropertyPanelSync with MainAdapter/UIAdapter architecture
- **Implementation**: ObjectEventBus → MainAdapter → MessageProtocol → postMessage → UIAdapter → Svelte stores
- **Impact**: Removed 1260 lines of legacy code, automatic UI synchronization, type-safe messages
- **Files Changed**:
  - Phase 3D: Removed PropertyPanelSync from main-integration.js (35 references)
  - Phase 3E: Removed PropertyPanelSync from 8 additional files (18 references)
  - Updated unified-communication.ts to direct postMessage only
  - Updated all memory files with Phase 3 architecture
- **Commits**:
  - `93ec51c` - feat: Phase 3D - remove PropertyPanelSync from main-integration
  - `f09a8d2` - feat: Phase 3E - complete PropertyPanelSync removal from codebase

### 2025-09-26: Unified Notification System (Deprecated - replaced by Phase 3)
- **Decision**: Centralize all 3D → UI communication through PropertyPanelSync
- **Status**: ✅ Completed and then superseded by Phase 3 architecture (2025-10-13)

---

## Session Notes

### Session 2025-01-21: Container Push Alignment & Selection Fixes

**Part 1: Container Push Alignment Issues**
- **Problem**: Objects moving incorrectly when pushing container faces
  - "Jelly effect" - objects jittering during push
  - Objects centering instead of maintaining alignment (bottom/center/top)
  - Space-between distribution not working on layout axis
  - Manual child position adjustments conflicting with layout engine
- **Root Cause Discovery**:
  1. Geometry recreation every frame (expensive + causes desync)
  2. Manual child positioning using incremental shifts (wrong approach)
  3. Layout engine perpendicular alignment skipped during push
  4. Position update skip logic preventing alignment from applying
  5. Anchor-based positioning conflicting with alignment-based positioning
- **Solution**: Pure Alignment-Based Architecture
  - **Unified geometry approach**: Use `resizeGeometry()` for both containers and objects (no recreation)
  - **Layout engine as single source of truth**: All positioning/sizing delegated to layout engine
  - **Removed manual adjustments**: Deleted all manual child position calculation code
  - **Always apply alignment**: Removed perpendicular alignment skip during push
  - **Always apply positions**: Removed position update skip logic
  - **Simplified fill resizing**: Always use 'center' anchor, layout engine repositions
  - **Space-between fix**: Anchor first object to container start edge when pushing with no fill objects
- **Files Modified**:
  1. `push-tool.js` - Removed manual positioning, simplified layout calls, unified geometry
  2. `layout-engine.js` - Removed alignment skip, simplified anchor logic
  3. `scene-layout-manager.js` - Always apply positions, simplified fill resize
- **Behavior**: CSS-like alignment (children anchored to aligned edges), smooth updates, no jitter

**Part 2: Container Selection Bug**
- **Problem**: Clicking child objects didn't select parent containers
- **Root Cause**: Old containers created before raycast override was implemented
  - New containers had conditional raycast (block when not selected)
  - Old containers always raycastable → intercepted clicks meant for children
- **Solution**: Migration Function
  - Created `applyRaycastOverrideToContainer()` - applies conditional raycast to single container
  - Created `updateAllContainersWithRaycastOverride()` - migrates all existing containers
  - Added migration call in `v2-main.js` initialization
  - Marked containers with `hasRaycastOverride` flag to prevent double-application
- **Files Modified**:
  1. `layout-geometry.js` - Added migration functions, marked new containers
  2. `v2-main.js` - Added migration call on app initialization
- **Result**: Container-first selection working correctly - clicking children selects parent

**Key Learnings**:
- Geometry recreation is expensive and causes desync - always modify in place
- Manual positioning conflicts with layout engine - pick one source of truth
- Incremental updates create drift - use absolute positioning from initial state
- Raycasting needs migration for behavioral changes to apply to old objects
- CSS-like alignment is simpler and more predictable than anchor-based approaches

**Documentation**: Session summary in active-context.md

**Commit**: `cd6fda7` - fix: container push alignment and selection behavior

### Session 2025-01-20: Layout State Machine Refactor + Bug Fixes

**Part 1: Layout State Machine Refactor**
- **Problem**: Redundant state properties causing inconsistent mode checks
  - Both `autoLayout.enabled` AND `layoutMode` tracked layout mode
  - 14+ locations with scattered, inconsistent property checks
  - Potential for properties to fall out of sync
- **Solution**: Centralized state machine in ObjectStateManager
  - Added 5 new methods: `getContainerMode()`, `isLayoutMode()`, `isHugMode()`, `getChildSizeMode()`, `hasFillEnabled()`
  - Migrated 25+ locations across 8 files to use state machine
  - Single source of truth with backwards compatibility
- **Files Migrated**:
  1. `application/state-serializer.js` (4 locations)
  2. `application/tools/push-tool.js` (8 locations)
  3. `application/handlers/property-update-handler.js` (4 locations)
  4. `application/tools/container-crud-manager.js` (2 locations)
  5. `layout/layout-propagation-manager.js` (3 locations)
  6. `application/commands/move-object-command.js` (3 locations)
  7. `application/tools/move-tool.js` (2 locations)
  8. `scene/scene-layout-manager.js` (2 locations)
- **Benefits**: Eliminated redundancy, consistent behavior, easier maintenance, future-proof
- **Documentation**: Created `/documentation/architecture/layout-state-machine-refactor.md`

**Part 2: Raycasting & Selection Bug Fixes**
- **Issues**: Floor grid stealing clicks, inconsistent object selection, camera angle affecting selection
- **Root Cause Discovery**:
  1. Floor grid (50x50 invisible plane + grid lines) was fully raycastable
  2. Support meshes not properly resolved to parent objects
  3. Container-selected raycast path missing fallback for standalone objects
  4. Source parameter receiving Window object instead of string
- **Fixes Applied**:
  - Made entire floor grid non-raycastable (plane, grid helper, all children, group)
  - Added defensive null checks in InputController raycaster (3 locations)
  - Added warning logging for orphaned meshes to aid debugging
  - Added fallback case for selectable objects in container-selected path
  - Added type validation for source parameter in ObjectStateManager
- **Key Learnings**:
  - Raycaster hits everything by default - must explicitly disable with `raycast = () => {}`
  - `selectable: false` doesn't prevent raycasting, only selection after hit
  - Support mesh resolution must walk parent hierarchy and validate result
  - Layer-based raycasting needs complete fallback coverage for all object types
- **Testing**: All 7 test cases passing (empty space, floor, objects from all angles, containers)
- **Documentation**: Created `/documentation/bug-fixes/2025-01-raycasting-selection-fixes.md`

### Session 2025-10-10: Material Initialization Bug Fix
- **Issue**: Face highlights showing incorrect opacity (30% instead of 18%/15%) and color (green instead of purple) on page load
- **Root Cause Discovery Process**:
  1. Materials created before ConfigurationManager loads → got fallback defaults
  2. Initial fix attempts: cache invalidation, material recreation → failed (broke object references)
  3. Critical discovery: TWO config callbacks both updating FACE_HIGHLIGHT opacity
     - `visual.effects.materials.face.opacity` → 0.6 (wrong!)
     - `visual.selection.faceHighlightOpacity` → 0.18 (correct!)
  4. Secondary issue: Container color not updated when config loads
- **Solution**:
  - Removed conflicting callback in `material-manager.js`
  - Updated `v2-main.js` to update existing material instances (not recreate) with both color AND opacity
  - Added Material Initialization pattern to `/memories/quick-patterns.md`
- **Key Learning**: Config callback conflicts can create race conditions. Always update existing material instances, never recreate.
- **Commit**: `84469fa` - fix: resolve material initialization conflicts and add color updates

### Session 2025-10-09 (Part 1: Creation)
- Researched Claude Sonnet 4.5 memory features and best practices
- Designed memory architecture for Modler V2
- Created 4 memory files for high-level guidance
- Updated CLAUDE.md with memory imports

### Session 2025-10-09 (Part 2: Accuracy Review)
- **CRITICAL**: Discovered major discrepancies between memory files and actual codebase
- Performed full codebase structure audit
- **Fixed Issues**:
  - Removed non-existent `/src/` directory references
  - Corrected all file names from PascalCase to kebab-case
  - Updated LayoutEngine location (`/layout/` not `/scene/`)
  - Fixed utilities path (`/application/utilities/` not `/utils/`)
  - Added missing systems (12+ files not documented)
  - Fixed all import statements in quick-patterns.md (50+ corrections)
  - Added global component access via `window.modlerComponents`
- **Key Learning**: Always validate against actual code structure, not assumptions

---

## Quick Reference

### Current Branch
`feature/next-development`

### Recent Commits
1. `1a55b9e` - refactor: architecture simplification phases 0-3
2. `cd6fda7` - fix: container push alignment and selection behavior
3. `ecba0d7` - refactor: layout state machine + raycasting/selection fixes
4. `e208a31` - refactor: unify face highlighting architecture
5. `bb7ec46` - fix: Enable face highlighting for selected containers

### Development Servers
- Main server: http://localhost:3000
- Svelte UI: http://localhost:5173/

---

## Notes for Future Sessions

### Remember
- CLAUDE.md should stay under 500 lines (currently 149 lines ✅)
- Use @import syntax for detailed docs
- Update this file at end of each significant session
- Memory files in `/memories/` are checked automatically by Claude

### Context for Next Session
- Material initialization bug FIXED ✅
- Memory architecture is COMPLETE and ACCURATE ✅
- All file paths verified against actual codebase ✅
- Memory files ready for production use
- Debug logging still present in 3 files (material-manager.js, support-mesh-factory.js, v2-main.js) - can be removed if desired
- Optional improvements:
  - Remove debug console.log statements from material initialization code
  - Add more metadata to documentation files (frequency tags)
  - Test memory system in actual development workflow
  - Consider reorganizing `/documentation` by frequency of use

### Critical File Structure Notes
- **NO `/src/` directory exists** - files are in root-level directories
- **All files use kebab-case** naming (e.g., `object-state-manager.js`)
- **LayoutEngine** is in `/layout/`, NOT `/scene/`
- **Utilities** are in `/application/utilities/`, NOT `/utils/`
- **Global access** via `window.modlerComponents` for major systems

---

**This file is maintained by Claude across sessions to preserve context and continuity.**
