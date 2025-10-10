# Modler V2 - Active Context

**Session continuity and work-in-progress tracking**
**Last updated**: 2025-10-10

---

## Current Work

### Active Development
- None (clean slate for next session)

### Recently Completed
- **Material initialization bug fix (MAJOR MILESTONE ✅)**
- Memory architecture modernization (COMPLETED ✅)
- Memory files accuracy review and correction (COMPLETED ✅)
- Created `/memories/` directory with 4 core files
- Corrected all file paths to match actual codebase structure
- Fixed file naming conventions (kebab-case)
- Added missing systems to documentation
- Unified notification system implementation
- Tab key focus system
- Real-time fill object resize during push
- Object duplication (Cmd+D)
- Box creation visual improvements
- Tile tool implementation
- Modular property section system

---

## Known Issues

### Active Bugs
- None currently tracked

### Technical Debt
- Documentation metadata needs to be added to 50+ files
- Some legacy files may not follow latest patterns

---

## Development Priorities

### High Priority
1. Complete memory architecture setup
2. Test memory system with real development workflows

### Medium Priority
1. Add metadata to documentation files
2. Performance optimization review

### Low Priority
1. Archive old documentation
2. Update consolidation metrics

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

### 2025-09-26: Unified Notification System
- **Decision**: Centralize all 3D → UI communication through PropertyPanelSync
- **Rationale**: Eliminate message bypasses, enable validation, provide fallback resilience
- **Impact**: Cleaner communication architecture, easier debugging

---

## Session Notes

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

## Quick Reference for This Session

### Current Branch
`unified-notification-system`

### Git Status
Clean working directory (as of session start)

### Recent Commits
1. `84469fa` - fix: resolve material initialization conflicts and add color updates (MAJOR MILESTONE)
2. `db7c86a` - fix: restore working face highlight opacity initialization pattern
3. `df445c1` - refactor: material system improvements and cleanup
4. `985bc7f` - feat: face highlight improvements and layout reverse persistence
5. `1a67868` - fix: Tab key focus system and fill object real-time resize during push

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
