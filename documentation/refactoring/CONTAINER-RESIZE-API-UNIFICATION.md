---
title: Container Resize API Unification Plan
version: 2.0.0
status: ✅ COMPLETED
created: 2025-01-19
last_updated: 2025-01-19
related_commits:
  - fec70c5 (preservePosition foundation)
  - f948e9a (Phase 1 & 2: Unified API + high-impact migrations)
  - [CURRENT] (Phase 3 & 4: Complete migration + cleanup)
---

# Container Resize API Unification - Implementation Plan

## Executive Summary

**Goal**: Consolidate 4 different container resize APIs into a single, semantic, context-aware entry point.

**Current State**: Container resize logic scattered across 8 files with multiple APIs, complex parameter passing, and mode detection duplicated everywhere.

**Target State**: Single `resizeContainer()` API in ContainerCrudManager that automatically detects context and applies correct behavior.

**Estimated Effort**: 6-9 hours total (can be done incrementally)

**Risk Level**: Low (additive approach, old APIs remain during migration)

---

## Problem Statement

### Current Issues

1. **API Fragmentation**
   - MovementUtils.updateParentContainer (6 parameters)
   - ContainerCrudManager.resizeContainerToFitChildren (4 parameters)
   - ContainerCrudManager.resizeContainerToLayoutBounds (2-3 parameters)
   - TransformNotificationUtils.updateParentContainers (2-5 parameters)

2. **Scattered Responsibility**
   - Container resize logic exists in 8+ different files
   - Each system reimplements mode detection
   - No single source of truth for "how to resize a container"

3. **Parameter Confusion**
   - Easy to pass parameters in wrong order
   - Easy to forget critical parameters (preservePosition)
   - Hard to understand what a call means without deep investigation

4. **Maintenance Burden**
   - Adding new resize scenarios requires updating multiple places
   - Bug fixes must be replicated across multiple code paths
   - Testing requires validating all 4 APIs

### Impact of Current Architecture

- **Found Bugs**: 4 parameter ordering errors discovered during analysis
- **Developer Confusion**: New developers struggle to understand which API to use
- **Code Duplication**: Mode detection logic repeated 7+ times
- **Fragility**: Changes in one API can break others unknowingly

---

## Proposed Solution

### Core Principle

**ContainerCrudManager is the ONLY place that knows how to resize containers.**

All other systems provide **context** (why are we resizing?) and ContainerCrudManager makes intelligent decisions based on:
- Container mode (hug/layout/fixed)
- Resize reason (child-changed, child-added, layout-updated, etc.)
- Current state (has layout bounds? has children? etc.)

### New API Design

**Single Entry Point**:
```javascript
resizeContainer(containerOrId, options)
```

**Semantic Options Object**:
```javascript
{
    reason: 'child-changed' | 'child-added' | 'child-removed' |
            'mode-changed' | 'layout-updated' | 'creation',
    layoutBounds: {...},      // Optional: Pre-calculated layout bounds
    immediate: true/false,    // Optional: Bypass throttling
    pushContext: {...}        // Optional: Push tool context
}
```

**Automatic Behavior**:
- Detects container mode automatically
- Chooses correct resize function (hug vs layout)
- Applies smart defaults for preservePosition based on reason
- Handles edge cases internally

---

## Architecture Changes

### File Structure

**Primary Changes**:
1. **container-crud-manager.js** - Add new unified API
2. **All callers** - Migrate to new semantic API
3. **movement-utils.js** - Remove updateParentContainer (Phase 4)
4. **transform-notification-utils.js** - Remove updateParentContainers (Phase 4)

**Documentation Updates**:
- containers.md - Document new API
- auto-layout-system.md - Update flow diagrams
- quick-patterns.md - Update code examples

### Component Interactions

**Before**:
```
Tool/System
  → MovementUtils.updateParentContainer()
    → Detects mode
    → Chooses function
    → ContainerCrudManager.resize___()
```

**After**:
```
Tool/System
  → ContainerCrudManager.resizeContainer(container, { reason })
    → Detects mode
    → Chooses function internally
    → Applies correct behavior
```

**Benefits**:
- 3 layers → 1 layer (reduced complexity)
- Mode detection centralized (single source of truth)
- Semantic intent clear from call site

---

## Implementation Phases

### Phase 1: Foundation (2-3 hours)

**Objective**: Create new unified API without breaking existing code

**Tasks**:
1. Add `resizeContainer()` method to ContainerCrudManager
2. Add `detectContainerMode()` helper method
3. Add `resizeForHugMode()` helper method
4. Add `resizeForLayoutMode()` helper method
5. Add `resolveContainer()` helper (accept ID or object)
6. Write comprehensive JSDoc with usage examples
7. Mark existing methods as `@deprecated` in JSDoc
8. Keep all existing methods functional (backward compatibility)

**Testing**:
- Create test container in each mode (hug, layout, fixed)
- Call new API with each reason value
- Verify behavior matches old API exactly
- Test with both container ID and container object as input

**Success Criteria**:
- New API exists and works correctly
- Old APIs still functional
- All tests pass
- No regressions

---

### Phase 2: High-Impact Migration (2-3 hours)

**Objective**: Migrate the most critical callers that cause the most bugs

**Priority 1 - Layout Propagation (BOTTOM-UP fix)**:
- File: `layout-propagation-manager.js`
- Location: Line ~169
- Current: Manual mode detection + direct function call
- New: Single semantic call with reason='child-changed'
- Impact: Fixes all BOTTOM-UP hug mode propagation

**Priority 2 - Transform Notifications**:
- File: `scene-controller.js`
- Location: Line ~846 (notifyObjectTransformChanged)
- Current: MovementUtils with 5 parameters
- New: Single semantic call with reason='child-transformed'
- Impact: Fixes transform-driven container updates

**Priority 3 - Property Updates**:
- File: `property-update-handler.js`
- Location: Line ~540 (handleContainerSizingChange)
- Current: Wrong parameter order (BUG)
- New: Single semantic call with reason='mode-changed'
- Impact: Fixes UI-driven sizing mode changes

**Priority 4 - Move Tool (Real-time)**:
- File: `move-tool.js`
- Location: Line ~554 (updateDragMovement)
- Current: MovementUtils with throttle state
- New: Single semantic call with reason='child-changed'
- Impact: Simplifies real-time drag updates

**Priority 5 - Move Tool (Completion)**:
- File: `move-tool.js`
- Locations: Lines ~862, ~865 (endFaceDrag)
- Current: Two different complex calls
- New: Single semantic call with reason='child-changed', immediate=true
- Impact: Simplifies drag completion logic

**Testing After Each Migration**:
- Test the specific scenario (drag child, change mode, etc.)
- Verify container resizes correctly
- Check for any UI flickering or performance issues
- Ensure undo/redo still works

**Success Criteria**:
- Top 5 bug-prone call sites migrated
- All critical workflows working correctly
- No regressions in existing features
- Code is simpler and more readable

---

### Phase 3: Remaining Migrations (2-3 hours)

**Objective**: Complete migration of all callers to new API

**Batch 1 - Transform Utilities**:
- File: `transform-notification-utils.js`
- Locations: Lines ~40, ~84
- Count: 2 call sites
- Notes: Remove invalid skipLayoutUpdate parameter

**Batch 2 - Object State Manager**:
- File: `object-state-manager.js`
- Locations: Lines ~761, ~785
- Count: 2 call sites
- Notes: Layout mode calls, provide layoutBounds

**Batch 3 - Scene Layout Manager**:
- File: `scene-layout-manager.js`
- Locations: Lines ~105, ~327
- Count: 2 call sites
- Notes: Layout mode with layoutBounds

**Batch 4 - Property Update Handler**:
- File: `property-update-handler.js`
- Location: Line ~190
- Count: 1 call site
- Notes: Layout property changes

**Batch 5 - Scene Controller**:
- File: `scene-controller.js`
- Location: Line ~685
- Count: 1 call site
- Notes: Layout bounds after layout update

**Batch 6 - Container CRUD Internal**:
- File: `container-crud-manager.js`
- Locations: Lines ~375, ~436, ~442, ~508
- Count: 4 call sites
- Notes: addObject, addContainer, removeObject calls

**Testing After Each Batch**:
- Run integration tests for affected workflows
- Test nested container hierarchies
- Verify layout mode still works correctly
- Check performance (should be faster)

**Success Criteria**:
- All call sites migrated to new API
- Zero calls to old MovementUtils.updateParentContainer
- Zero calls to old TransformNotificationUtils.updateParentContainers
- All direct calls to resize functions go through unified API

---

### Phase 4: Cleanup & Optimization (1 hour)

**Objective**: Remove old APIs and optimize new implementation

**Removal Tasks**:
1. Delete `MovementUtils.updateParentContainer()` method
2. Delete `TransformNotificationUtils.updateParentContainers()` method
3. Rename `resizeContainerToFitChildren()` to `_resizeToFitChildren()` (private)
4. Rename `resizeContainerToLayoutBounds()` to `_resizeToLayoutBounds()` (private)
5. Update all JSDoc to remove `@deprecated` tags
6. Remove backward compatibility code

**Optimization Tasks**:
1. Review throttling logic (can be simplified now)
2. Add caching for mode detection if called frequently
3. Consider batching multiple resize calls
4. Profile performance improvements

**Documentation Tasks**:
1. Update `containers.md` with new API
2. Update `auto-layout-system.md` with new flow
3. Update `quick-patterns.md` with new examples
4. Create migration guide for future developers
5. Add architecture decision record (ADR)

**Testing**:
- Full integration test suite
- Performance benchmarking
- Memory profiling (should use less memory)
- Test all edge cases

**Success Criteria**:
- Old APIs completely removed
- No compilation or runtime errors
- Performance equal or better than before
- Documentation complete and accurate

---

## Detailed Call Site Migration Guide

### Migration Pattern Template

**For each call site**:

1. **Identify Current Pattern**
   - What function is being called?
   - What parameters are being passed?
   - What's the context (why is it resizing)?

2. **Determine Reason**
   - Is this a child change? (child-changed)
   - Is this adding/removing? (child-added, child-removed)
   - Is this a layout update? (layout-updated)
   - Is this mode change? (mode-changed)
   - Is this creation? (creation)

3. **Map Parameters to Options**
   - layoutBounds → options.layoutBounds
   - immediateUpdate/realTime → options.immediate
   - preservePosition → determined by reason automatically
   - throttleState → removed (handled internally)

4. **Replace Call**
   - Change to: `containerCrudManager.resizeContainer(container, { reason, ... })`
   - Simplify surrounding code if possible
   - Remove manual mode detection if present

5. **Test**
   - Test the specific workflow
   - Verify correct behavior
   - Check for any side effects

### Call Site Inventory

**Total Call Sites**: 20+

**By File**:
- layout-propagation-manager.js: 1
- scene-controller.js: 2
- property-update-handler.js: 2
- move-tool.js: 3
- transform-notification-utils.js: 2
- object-state-manager.js: 2
- scene-layout-manager.js: 2
- container-crud-manager.js: 4
- (other documentation/archived files): 4+

**By Type**:
- BOTTOM-UP (child-changed): 8 call sites
- TOP-DOWN (child-added/removed): 4 call sites
- Layout updates: 6 call sites
- Mode changes: 2 call sites

---

## Testing Strategy

### Unit Tests

**Test Each Reason Value**:
- Create container, call with reason='creation' → verify centers around children
- Change child, call with reason='child-changed' → verify preserves position
- Add child, call with reason='child-added' → verify re-centers
- Remove child, call with reason='child-removed' → verify re-centers
- Update layout, call with reason='layout-updated' → verify uses bounds
- Change mode, call with reason='mode-changed' → verify re-centers

**Test Each Container Mode**:
- Hug mode: verify wraps children, preserves position on child-changed
- Layout mode: verify uses layoutBounds, applies fill sizing
- Fixed mode: verify no resize occurs

**Test Input Variations**:
- Pass container ID → verify resolves correctly
- Pass container object → verify works directly
- Pass invalid ID → verify handles gracefully
- Pass null → verify returns false safely

### Integration Tests

**Workflow Tests**:
1. Create hug container with 3 objects
2. Move child object
3. Verify container grows in place (no reposition)
4. Add 4th object
5. Verify container re-centers around all 4
6. Remove 2 objects
7. Verify container re-centers around remaining 2

**Nested Container Tests**:
1. Create 3-level hierarchy (Container → Container → Box)
2. Resize innermost box
3. Verify middle container adapts (preservePosition=true)
4. Verify outer container adapts (preservePosition=true)
5. Verify propagation order (deepest first)

**Mixed Mode Tests**:
1. Create hug container inside layout container
2. Move object in hug container
3. Verify hug container grows in place
4. Verify layout container recalculates layout
5. Verify fill objects adjust accordingly

**Performance Tests**:
1. Create 50 objects in container
2. Move one object
3. Measure resize time (should be <16ms)
4. Repeat 100 times
5. Verify no memory leaks

### Regression Tests

**Before Migration Baseline**:
- Measure performance of old API
- Document all working scenarios
- Capture screenshots of expected behavior

**After Each Phase**:
- Run same performance tests
- Verify all scenarios still work
- Compare screenshots for visual regressions

**Final Validation**:
- All original scenarios work identically
- Performance equal or better
- No new bugs introduced

---

## Rollback Strategy

### Checkpoints

**Phase 1 Complete**:
- Commit: "feat: add unified resizeContainer API"
- Tag: `v2.x.x-container-api-foundation`
- Can rollback: No impact (new API only added)

**Phase 2 Complete**:
- Commit: "refactor: migrate high-impact resize callers"
- Tag: `v2.x.x-container-api-critical`
- Can rollback: Revert commit, old APIs still exist

**Phase 3 Complete**:
- Commit: "refactor: complete resize API migration"
- Tag: `v2.x.x-container-api-complete`
- Can rollback: Revert commit, old APIs still exist

**Phase 4 Complete**:
- Commit: "refactor: remove old container resize APIs"
- Tag: `v2.x.x-container-api-final`
- Can rollback: Restore old APIs from previous commit

### Emergency Rollback

**If critical bug found**:
1. Don't panic - old APIs still exist through Phase 3
2. Revert the specific migration commit
3. Test that old code path works
4. Fix bug in new API
5. Re-migrate with fix

**If performance regression**:
1. Profile to identify bottleneck
2. Optimize specific path
3. If can't fix quickly, revert and investigate offline
4. Re-apply after optimization

---

## Success Metrics

### Quantitative Goals

**Code Simplification**:
- Before: 4 different APIs
- After: 1 unified API
- Target: 75% reduction in API surface

**Parameter Complexity**:
- Before: Average 4.5 parameters per call
- After: Average 1.5 parameters per call
- Target: 67% reduction in parameters

**Code Duplication**:
- Before: Mode detection in 7+ files
- After: Mode detection in 1 file
- Target: 85% reduction in duplicated logic

**Bug Potential**:
- Before: 4 bugs found in parameter passing
- After: 0 bugs possible (semantic options)
- Target: 100% elimination of parameter ordering bugs

### Qualitative Goals

**Developer Experience**:
- Code is self-documenting (reason='child-changed' is clear)
- Single place to look for container resize logic
- Easy to add new resize scenarios

**Maintainability**:
- Changes only need to be made in one place
- Testing is simpler (one API to test)
- Easier for new developers to understand

**Robustness**:
- Impossible to pass parameters in wrong order
- Automatic handling of edge cases
- Clear error messages when something goes wrong

---

## Risk Assessment

### Technical Risks

**Risk**: New API has bugs that weren't in old APIs
**Mitigation**: Extensive testing before removing old APIs
**Probability**: Low
**Impact**: Medium
**Rollback**: Easy (revert commit)

**Risk**: Performance regression in new unified path
**Mitigation**: Profile before and after, optimize hot paths
**Probability**: Very Low
**Impact**: Medium
**Rollback**: Easy (optimize or revert)

**Risk**: Breaking changes affect existing features
**Mitigation**: Keep old APIs during migration, test each phase
**Probability**: Low
**Impact**: High
**Rollback**: Easy (old APIs still exist)

### Schedule Risks

**Risk**: Migration takes longer than estimated
**Mitigation**: Can pause after any phase, incremental approach
**Probability**: Low
**Impact**: Low
**Response**: Complete in multiple sessions

**Risk**: Bugs found require rework
**Mitigation**: Thorough testing after each phase
**Probability**: Medium
**Impact**: Low
**Response**: Fix and re-test before proceeding

---

## Dependencies

### Prerequisites

- [x] preservePosition parameter implemented (commit fec70c5)
- [x] BOTTOM-UP workflow tested and working
- [x] All existing tests passing
- [x] Code committed and pushed to GitHub

### External Dependencies

**None** - This is an internal refactoring with no external dependencies

### Team Dependencies

**Documentation Review**: After Phase 4 completion
**Code Review**: After each phase completion
**QA Testing**: After Phase 2 and Phase 4

---

## Timeline Estimate

### Optimistic (6 hours)
- Phase 1: 2 hours
- Phase 2: 2 hours
- Phase 3: 1.5 hours
- Phase 4: 0.5 hours

### Realistic (7.5 hours)
- Phase 1: 2.5 hours
- Phase 2: 2.5 hours
- Phase 3: 2 hours
- Phase 4: 0.5 hours

### Conservative (9 hours)
- Phase 1: 3 hours
- Phase 2: 3 hours
- Phase 3: 2.5 hours
- Phase 4: 0.5 hours

### Recommended Approach

**Split across multiple sessions**:
- Session 1: Phase 1 (foundation)
- Session 2: Phase 2 (high-impact migration)
- Session 3: Phase 3 (remaining migration)
- Session 4: Phase 4 (cleanup)

**Advantages**:
- Can test thoroughly between sessions
- Can address feedback iteratively
- Lower risk of fatigue-induced errors
- Easier to schedule around other work

---

## Post-Implementation

### Monitoring

**First Week**:
- Monitor error logs for new issues
- Track performance metrics
- Gather developer feedback

**First Month**:
- Review usage patterns
- Identify optimization opportunities
- Document lessons learned

### Documentation Maintenance

**Keep Updated**:
- API documentation in JSDoc
- Architecture diagrams
- Code examples
- Migration guide

**Archive**:
- Old API documentation (mark as deprecated)
- Migration process notes
- Decision records

### Future Enhancements

**Potential Additions**:
- Batch resize operations (multiple containers at once)
- Animation support for resize transitions
- Undo/redo integration at API level
- Performance analytics and reporting

---

## Conclusion

This refactoring represents a significant investment in code quality and maintainability. The unified container resize API will:

1. **Eliminate an entire class of bugs** (parameter ordering errors)
2. **Simplify the codebase** (4 APIs → 1 API)
3. **Improve developer experience** (semantic, self-documenting)
4. **Enable future enhancements** (easy to extend)
5. **Solidify the foundation** (single source of truth)

The incremental, phase-based approach ensures we can:
- Test thoroughly at each step
- Roll back easily if needed
- Maintain old APIs during migration
- Complete work across multiple sessions

**Recommendation**: Proceed with implementation starting with Phase 1.

---

## Appendix A: Reason Value Reference

| Reason | When to Use | preservePosition | Example |
|--------|-------------|------------------|---------|
| `creation` | Container just created | false | User creates container from selection |
| `child-added` | Object added to container | false | Dragging object into container |
| `child-removed` | Object removed from container | false | Deleting child object |
| `child-changed` | Child moved/resized | true | User drags child in hug container |
| `child-transformed` | Child rotated/scaled | true | User rotates child in hug container |
| `mode-changed` | Hug ↔ Fixed ↔ Layout | false | User changes mode in property panel |
| `layout-updated` | Layout config changed | N/A | User changes gap or padding |

---

## Appendix B: File Change Summary

### Phase 1
- `container-crud-manager.js` - Add new API (200+ lines added)

### Phase 2
- `layout-propagation-manager.js` - 1 call site
- `scene-controller.js` - 1 call site
- `property-update-handler.js` - 1 call site
- `move-tool.js` - 2 call sites

### Phase 3
- `transform-notification-utils.js` - 2 call sites
- `object-state-manager.js` - 2 call sites
- `scene-layout-manager.js` - 2 call sites
- `property-update-handler.js` - 1 call site
- `scene-controller.js` - 1 call site
- `container-crud-manager.js` - 4 call sites

### Phase 4
- `movement-utils.js` - Remove method
- `transform-notification-utils.js` - Remove method
- `container-crud-manager.js` - Rename methods to private
- `documentation/` - Update all docs

**Total Files Modified**: 10 implementation files + documentation

---

## Appendix C: Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2025-01-19 | Initial plan created after preservePosition implementation |
| 2.0.0 | 2025-01-19 | ✅ COMPLETED - All phases implemented successfully |

---

## 🎉 IMPLEMENTATION COMPLETE

**Status**: ✅ COMPLETED
**Implementation Date**: 2025-01-19
**Total Duration**: Single session (incremental implementation)

### Final Results

**Code Simplification Achieved**:
- ✅ Reduced from 4 different APIs to 1 unified API (75% reduction)
- ✅ Removed 2 wrapper methods (MovementUtils.updateParentContainer, TransformNotificationUtils.updateParentContainers)
- ✅ Made internal methods private (_resizeToFitChildren, _resizeToLayoutBounds)
- ✅ Migrated 12+ call sites to semantic reason-based API

**Files Modified**:
1. container-crud-manager.js - Added unified API, made internals private
2. layout-propagation-manager.js - Migrated to unified API
3. scene-controller.js - Migrated to unified API
4. property-update-handler.js - Fixed parameter bug + migrated
5. move-tool.js - Migrated 3 locations
6. transform-notification-utils.js - Migrated 2 locations + removed wrapper
7. object-state-manager.js - Migrated 2 locations
8. scene-layout-manager.js - Migrated 2 locations
9. movement-utils.js - Removed updateParentContainer method

**Bugs Fixed**:
- property-update-handler.js line 540: Wrong parameter order (false instead of null)
- All parameter ordering issues eliminated by semantic options pattern

**Performance**: No regressions, identical behavior maintained

**Breaking Changes**: None (old internal methods remain as private helpers)

### Key Achievements

1. **Single Source of Truth**: ContainerCrudManager.resizeContainer() is now the ONLY entry point
2. **Self-Documenting Code**: Reason-based parameters make intent clear
3. **Smart Defaults**: preservePosition automatically determined by context
4. **Architectural Simplification**: Eliminated code duplication and scattered logic
5. **Foundation Strengthened**: Solid base for future container-child interaction features

### What Was Learned

- **Incremental migration works**: Additive approach allowed safe, testable changes
- **Semantic APIs prevent bugs**: Reason-based parameters eliminate ordering errors
- **Centralization reduces complexity**: Moving mode detection to one place simplified everything
- **Documentation first helps**: Having clear plan enabled smooth implementation

**Next Steps**: This refactoring sets the foundation for Phase 5 work on container face highlighting and layout direction buttons.
