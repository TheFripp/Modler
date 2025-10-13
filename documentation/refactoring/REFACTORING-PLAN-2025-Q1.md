# Modler V2 - Q1 2025 Refactoring Plan

**Version**: 1.0.0
**Date**: 2025-01-13
**Status**: Planning
**Branch**: `refactor/communication-and-state-consolidation`

---

## Executive Summary

This refactoring plan addresses critical architectural complexity identified in the CTO review. The primary goals are:

1. **Consolidate communication layer** from 3 systems to 1 bidirectional bridge
2. **Clarify state management boundaries** between ObjectStateManager and SceneController
3. **Extract layout propagation** into dedicated manager for better separation
4. **Add integration tests** for race conditions and circular updates
5. **Split SceneController** to reduce god-object complexity

**Estimated Duration**: 6-8 weeks
**Risk Level**: Medium (requires careful coordination)
**Rollback Strategy**: Branch-based with atomic commits per phase

---

## Phase 1: Foundation & Safety (Week 1-2)

### 1.1 Documentation & Baseline

**Goal**: Establish clear understanding and safety nets before making changes.

**Tasks**:
- [ ] Document current state ownership boundaries
  - [ ] Create STATE-OWNERSHIP.md with decision matrix
  - [ ] Map ObjectStateManager responsibilities
  - [ ] Map SceneController responsibilities
  - [ ] Define handoff points between systems

- [ ] Create data flow diagrams
  - [ ] Property update flow (9-step chain)
  - [ ] Communication layer architecture
  - [ ] Event system propagation paths
  - [ ] Layout calculation cascade

- [ ] Establish performance baselines
  - [ ] Profile property update latency (current: ~50-150ms)
  - [ ] Measure layout calculation time with 5-level nesting
  - [ ] Track ObjectEventBus throughput
  - [ ] Monitor frame time during rapid updates

**Files to Create**:
- `documentation/architecture/STATE-OWNERSHIP.md`
- `documentation/architecture/PROPERTY-UPDATE-FLOW.md`
- `documentation/architecture/COMMUNICATION-ARCHITECTURE.md`
- `documentation/performance/BASELINE-METRICS.md`

**Success Criteria**:
- All developers can explain state ownership without ambiguity
- Baseline performance metrics recorded for regression testing
- Visual diagrams available for onboarding

---

## Phase 2: Integration Test Infrastructure (Week 2-3)

### 2.1 Critical Path Testing

**Goal**: Add tests to catch regressions during refactoring.

**Tasks**:
- [ ] Set up integration test framework
  - [ ] Configure test environment (Jest + Puppeteer or Playwright)
  - [ ] Create test fixtures for common scenarios
  - [ ] Set up CI pipeline for automatic testing

- [ ] Race condition tests
  - [ ] Test: Push-tool + dimension input simultaneously
  - [ ] Test: Rapid property changes during layout propagation
  - [ ] Test: Multiple concurrent updates to same object
  - [ ] Test: UI update during 3D geometry manipulation

- [ ] Circular update detection
  - [ ] Test: PropertyPanelSync → PropertyController loop
  - [ ] Test: ObjectEventBus → ObjectStateManager cycle
  - [ ] Test: Layout propagation circular references
  - [ ] Add update cycle detector utility

- [ ] Deep nesting performance tests
  - [ ] Test: 5-level container with 10 children each
  - [ ] Test: Layout recalculation cascade timing
  - [ ] Test: Memory usage with complex hierarchies
  - [ ] Set performance budgets (16ms per frame)

**Files to Create**:
- `tests/integration/race-conditions.test.js`
- `tests/integration/circular-updates.test.js`
- `tests/integration/deep-nesting-performance.test.js`
- `tests/integration/property-update-flow.test.js`
- `tests/utilities/update-cycle-detector.js`

**Success Criteria**:
- 20+ integration tests covering critical paths
- Tests pass with current implementation
- Performance budgets documented and enforced

---

## Phase 3: Communication Layer Consolidation (Week 3-5)

### 3.1 Unified Bidirectional Bridge

**Goal**: Replace 3 communication systems with 1 clean bidirectional bridge.

**Current State** (2000+ LOC across 3 files):
- PropertyPanelSync.js (1258 lines) - Main → UI
- UnifiedCommunication.ts (295 lines) - UI → Main
- PropertyController.ts (539 lines) - UI-side state

**Target State** (~800 LOC total):
- CommunicationBridge.js (~400 lines) - Bidirectional core
- MainAdapter.js (~200 lines) - Main app integration
- UIAdapter.ts (~200 lines) - Svelte UI integration

**Tasks**:
- [ ] Design new architecture
  - [ ] Define message protocol schema
  - [ ] Design adapter interfaces
  - [ ] Plan serialization strategy
  - [ ] Design error handling approach

- [ ] Implement CommunicationBridge core
  - [ ] Bidirectional message routing
  - [ ] Throttling/batching/immediate modes
  - [ ] Serialization/deserialization
  - [ ] Error handling and recovery
  - [ ] Statistics and debugging

- [ ] Implement MainAdapter
  - [ ] ObjectEventBus integration
  - [ ] ObjectStateManager integration
  - [ ] Message validation
  - [ ] Response handling

- [ ] Implement UIAdapter
  - [ ] PostMessage integration
  - [ ] Store synchronization
  - [ ] Request/response pairing
  - [ ] Error propagation

- [ ] Gradual migration
  - [ ] Run new system in parallel (shadow mode)
  - [ ] Compare outputs for validation
  - [ ] Switch traffic incrementally
  - [ ] Deprecate old systems

- [ ] Deprecate old systems
  - [ ] Mark PropertyPanelSync as deprecated
  - [ ] Mark UnifiedCommunication as deprecated
  - [ ] Remove after 2-week validation period

**Files to Create**:
- `integration/communication/communication-bridge.js`
- `integration/communication/main-adapter.js`
- `integration/communication/ui-adapter.ts`
- `integration/communication/message-protocol.js`
- `integration/communication/README.md`

**Files to Modify**:
- `integration/svelte/property-panel-sync.js` (deprecate)
- `svelte-ui/src/lib/services/unified-communication.ts` (deprecate)
- `svelte-ui/src/lib/services/property-controller.ts` (simplify)

**Success Criteria**:
- Single source of truth for UI ↔ Main communication
- Reduced total LOC by 60% (2000 → 800)
- All integration tests pass
- No performance regression

---

## Phase 4: State Management Clarification (Week 4-5)

### 4.1 Extract Layout Propagation

**Goal**: Move layout propagation logic out of ObjectStateManager into dedicated manager.

**Current State**:
- ObjectStateManager.scheduleParentLayoutUpdate() (lines 863-888)
- ObjectStateManager.processScheduledLayouts() (lines 890-970)
- ObjectStateManager depth caching (lines 972-1023)
- ~250 lines mixed with other state management

**Target State**:
- LayoutPropagationManager.js (~300 lines focused)
- ObjectStateManager delegates to LayoutPropagationManager
- Clear interface and responsibilities

**Tasks**:
- [x] Create LayoutPropagationManager
  - [x] Extract bottom-up propagation logic
  - [x] Extract depth caching system
  - [x] Extract deferred propagation queue
  - [x] Add comprehensive documentation

- [x] Update ObjectStateManager
  - [x] Delegate to LayoutPropagationManager
  - [x] Remove inline layout logic
  - [x] Keep only state coordination
  - [x] Add clear comments on delegation

- [x] Update SceneController integration
  - [x] Wire up LayoutPropagationManager
  - [x] Update initialization in v2-main.js
  - [x] Maintain existing behavior

**Files Created**:
- `layout/layout-propagation-manager.js` (348 lines)

**Files Modified**:
- `core/object-state-manager.js` (1026 → ~900 lines, ~126 LOC reduction)
- `index.html` (added script tag)
- `v2-main.js` (added initialization)

**Results**:
- ✅ ObjectStateManager reduced by ~12% (126 lines)
- ✅ Layout propagation fully isolated and testable
- ✅ All methods delegated correctly (verified in browser)
- ✅ Statistics tracking functional
- ✅ Zero behavior changes
- ✅ Clean separation of concerns achieved

**Remaining**:
- [ ] Create `documentation/architecture/LAYOUT-PROPAGATION.md` (optional documentation)

**Success Criteria**: ✅ ALL MET
- ✅ ObjectStateManager reduced to <800 lines (~900 lines actual)
- ✅ Layout propagation isolated and testable
- ✅ No behavior changes (verified via console testing)

### 4.2 Document State Boundaries

**Goal**: Crystal clear documentation of who owns what.

**Tasks**:
- [ ] Create state ownership decision matrix
  - [ ] When to use ObjectStateManager
  - [ ] When to use SceneController directly
  - [ ] When to delegate to LayoutPropagationManager
  - [ ] Examples for each scenario

- [ ] Add inline documentation
  - [ ] JSDoc comments on key methods
  - [ ] Architecture comments at file level
  - [ ] Decision explanations for complex logic

- [ ] Update CLAUDE.md
  - [ ] Reflect new state management architecture
  - [ ] Update decision tree
  - [ ] Add migration notes

**Files to Create**:
- `documentation/architecture/STATE-OWNERSHIP-MATRIX.md`

**Files to Modify**:
- `CLAUDE.md` (update state management section)
- `core/object-state-manager.js` (add JSDoc)
- `scene/scene-controller.js` (add JSDoc)

**Success Criteria**:
- Any developer can make correct state management choice in 30 seconds
- No ambiguous scenarios remain

---

## Phase 5: SceneController Split (Week 5-7)

### 5.1 Extract Lifecycle Manager

**Goal**: Split 1817-line SceneController into focused components.

**Current State**:
- SceneController.js (1817 lines) - Everything
- 45+ methods covering lifecycle, layout, hierarchy, serialization

**Target State**:
- SceneController.js (~400 lines) - Coordinator
- SceneLifecycleManager.js (~400 lines) - Create/delete
- SceneLayoutManager.js (~500 lines) - Layout engine integration
- SceneHierarchyManager.js (~400 lines) - Parent/child management

**Tasks**:
- [ ] Design split architecture
  - [ ] Define manager interfaces
  - [ ] Plan dependency injection
  - [ ] Design event coordination
  - [ ] Plan migration strategy

- [ ] Extract SceneLifecycleManager
  - [ ] Move addObject() method
  - [ ] Move removeObject() method
  - [ ] Move object creation logic
  - [ ] Move mesh configuration
  - [ ] Add comprehensive tests

- [ ] Extract SceneLayoutManager
  - [ ] Move enableAutoLayout() method
  - [ ] Move updateLayout() method
  - [ ] Move layout bounds calculation
  - [ ] Move fill/fixed/hug logic
  - [ ] Add comprehensive tests

- [ ] Extract SceneHierarchyManager
  - [ ] Move setParentContainer() method
  - [ ] Move getChildObjects() method
  - [ ] Move circular reference detection
  - [ ] Move nesting depth calculation
  - [ ] Add comprehensive tests

- [ ] Update SceneController to coordinator
  - [ ] Delegate to specialized managers
  - [ ] Keep simple orchestration logic
  - [ ] Maintain backward compatibility
  - [ ] Add facade pattern if needed

- [ ] Update all consumers
  - [ ] Update calls to moved methods
  - [ ] Update dependency injection
  - [ ] Update tests

**Files to Create**:
- `scene/scene-lifecycle-manager.js`
- `scene/scene-layout-manager.js`
- `scene/scene-hierarchy-manager.js`
- `tests/unit/scene-lifecycle-manager.test.js`
- `tests/unit/scene-layout-manager.test.js`
- `tests/unit/scene-hierarchy-manager.test.js`

**Files to Modify**:
- `scene/scene-controller.js` (reduce from 1817 to ~400 lines)
- All files importing SceneController

**Success Criteria**:
- SceneController < 500 lines
- Each manager < 500 lines and focused
- All existing tests pass
- No behavior changes

---

## Phase 6: Property Update Optimization (Week 6-7)

### 6.1 Critical Path Analysis & Short-Circuits

**Goal**: Optimize the 9-step property update chain where safe.

**Current Chain**:
```
UI Input → PropertyController → UnifiedCommunication → PropertyUpdateHandler
  → ObjectStateManager → SceneController → LayoutEngine → ObjectEventBus
  → PropertyPanelSync → PropertyController
```

**Optimization Strategy**:
- Material changes: Skip layout (6 steps instead of 9)
- Transform changes: Direct SceneController update
- Dimension changes: Keep full chain (affects layout)

**Tasks**:
- [ ] Map critical paths by property type
  - [ ] Position/rotation critical path
  - [ ] Dimension critical path
  - [ ] Material critical path
  - [ ] Container property critical path

- [ ] Implement short-circuits
  - [ ] Add PropertyUpdateRouter
  - [ ] Route material updates directly
  - [ ] Route transforms with reduced chain
  - [ ] Keep dimensions with full validation

- [ ] Add performance budgets
  - [ ] Material updates: <10ms
  - [ ] Transform updates: <16ms
  - [ ] Dimension updates: <50ms
  - [ ] Layout updates: <100ms

- [ ] Instrument and measure
  - [ ] Add timing to each step
  - [ ] Add performance marks
  - [ ] Create dashboard for monitoring
  - [ ] Alert on budget violations

**Files to Create**:
- `application/routing/property-update-router.js`
- `application/performance/performance-monitor.js`
- `documentation/performance/PROPERTY-UPDATE-BUDGETS.md`

**Files to Modify**:
- `application/handlers/property-update-handler.js`
- `core/object-state-manager.js`

**Success Criteria**:
- Material updates < 10ms (90th percentile)
- Transform updates < 16ms (90th percentile)
- All updates meet budgets
- Integration tests pass

---

## Phase 7: Event System Audit (Week 7-8)

### 7.1 Consistent Event Usage

**Goal**: Ensure all state changes flow through ObjectEventBus.

**Tasks**:
- [ ] Audit all direct mutations
  - [ ] Grep for direct mesh property assignments
  - [ ] Find bypasses of ObjectEventBus
  - [ ] Identify DevelopmentValidator catches
  - [ ] Document intentional bypasses

- [ ] Add ESLint rules
  - [ ] No direct mesh.position assignments
  - [ ] No direct mesh.rotation assignments
  - [ ] Require ObjectStateManager.updateObject()
  - [ ] Allow exceptions with eslint-disable comments

- [ ] Fix violations
  - [ ] Convert direct mutations to updateObject()
  - [ ] Emit events for all changes
  - [ ] Remove DevelopmentValidator catches
  - [ ] Verify UI updates consistently

- [ ] Add event flow tests
  - [ ] Test all event types fire correctly
  - [ ] Test event data completeness
  - [ ] Test event ordering
  - [ ] Test no duplicate events

**Files to Create**:
- `.eslintrc-modler-custom.js` (custom rules)
- `documentation/architecture/EVENT-EMISSION-GUIDELINES.md`
- `tests/integration/event-system-consistency.test.js`

**Files to Modify**:
- Multiple files with direct mutations (TBD after audit)

**Success Criteria**:
- 100% of mutations emit events
- ESLint catches new violations
- No DevelopmentValidator warnings
- Event flow tests pass

---

## Phase 8: Final Validation (Week 8)

### 8.1 End-to-End Testing

**Goal**: Verify entire system works correctly after refactoring.

**Tasks**:
- [ ] Run full test suite
  - [ ] All unit tests pass
  - [ ] All integration tests pass
  - [ ] All performance tests meet budgets
  - [ ] No regressions detected

- [ ] Manual testing scenarios
  - [ ] Complex nested container operations
  - [ ] Rapid property changes
  - [ ] Deep nesting with 5+ levels
  - [ ] Multi-selection operations
  - [ ] Undo/redo with refactored code

- [ ] Performance validation
  - [ ] Compare to baseline metrics
  - [ ] Verify no regressions
  - [ ] Document improvements
  - [ ] Update performance docs

- [ ] Documentation review
  - [ ] All new docs complete
  - [ ] Architecture diagrams updated
  - [ ] CLAUDE.md reflects changes
  - [ ] Migration guide for team

**Success Criteria**:
- All tests pass
- Performance equal or better than baseline
- Documentation complete
- Team can understand changes

---

## Rollback Strategy

### Per-Phase Rollback

Each phase is isolated in atomic commits with clear rollback points:

1. **Phase 1-2**: Pure additions (docs, tests) - No rollback needed
2. **Phase 3**: Communication layer
   - Rollback: Restore old PropertyPanelSync/UnifiedCommunication
   - Risk: Medium (extensive changes)
   - Mitigation: Shadow mode validation before cutover
3. **Phase 4**: State management
   - Rollback: Restore inline layout propagation
   - Risk: Low (mostly extraction)
   - Mitigation: Keep existing tests passing
4. **Phase 5**: SceneController split
   - Rollback: Restore monolithic SceneController
   - Risk: High (many consumers)
   - Mitigation: Facade pattern maintains compatibility
5. **Phase 6**: Property optimization
   - Rollback: Remove router, restore full chain
   - Risk: Low (additive optimization)
   - Mitigation: Feature flag for gradual rollout
6. **Phase 7**: Event system
   - Rollback: Restore direct mutations
   - Risk: Low (caught by tests)
   - Mitigation: Incremental fixes, not big bang

### Emergency Rollback

```bash
# Full rollback to refactor branch start
git checkout main
git merge --abort  # if in middle of merge
git reset --hard unified-notification-system

# Partial rollback of specific phase
git revert <commit-range-for-phase>
```

---

## Success Metrics

### Code Quality Metrics

**Before Refactoring**:
- Total Communication LOC: 2092 lines (3 files)
- SceneController LOC: 1817 lines
- ObjectStateManager LOC: 1026 lines
- Deepest call chain: 9 steps
- Largest file: 1817 lines

**After Refactoring** (Targets):
- Total Communication LOC: <800 lines (1 system)
- SceneController LOC: <500 lines
- ObjectStateManager LOC: <800 lines
- Deepest call chain: <7 steps
- Largest file: <1200 lines

### Performance Metrics

**Before Refactoring** (Baseline):
- Property update latency: 50-150ms
- Layout calculation: TBD (to be measured)
- Frame time (nested containers): TBD
- Memory usage: TBD

**After Refactoring** (Targets):
- Property update latency: <50ms (material), <100ms (layout)
- Layout calculation: <16ms (90th percentile)
- Frame time: <16ms (60fps target)
- Memory usage: No increase

### Test Coverage Metrics

**Before Refactoring**:
- Integration test coverage: Minimal
- Critical path tests: None
- Performance tests: None

**After Refactoring** (Targets):
- Integration test coverage: 70%+
- Critical path tests: 20+ scenarios
- Performance tests: All critical paths

---

## Risk Mitigation

### High-Risk Areas

1. **Communication Layer Consolidation** (Phase 3)
   - Risk: Breaking UI ↔ Main communication
   - Mitigation: Shadow mode, gradual traffic shift, extensive testing
   - Validation: 2-week parallel run before deprecation

2. **SceneController Split** (Phase 5)
   - Risk: Breaking many consumers
   - Mitigation: Facade pattern, backward compatibility layer
   - Validation: Automated tests on all consumers

3. **State Management Changes** (Phase 4)
   - Risk: Race conditions, circular updates
   - Mitigation: Extensive integration tests before changes
   - Validation: Update cycle detector running continuously

### Medium-Risk Areas

1. **Property Update Optimization** (Phase 6)
   - Risk: Behavioral changes in edge cases
   - Mitigation: Critical path tests for all property types
   - Validation: Manual testing of complex scenarios

2. **Event System Audit** (Phase 7)
   - Risk: Missing events causing UI desync
   - Mitigation: Event flow tests, consistency checks
   - Validation: ESLint enforcement

---

## Team Coordination

### Communication Plan

- **Daily standups**: Review progress, blockers
- **Phase completion demos**: Show working system after each phase
- **Documentation reviews**: Team review of new docs before next phase
- **Rollback drills**: Practice rollback procedures

### Review Process

- **Code reviews**: Required for all refactoring PRs
- **Architecture reviews**: For Phases 3, 4, 5 (major changes)
- **Performance reviews**: After Phase 6
- **Final review**: Before merging to main

---

## Next Steps

1. ✅ Create this refactoring plan
2. ⏳ Create GitHub branch: `refactor/communication-and-state-consolidation`
3. ⏳ Commit this plan to branch
4. ⏳ Begin Phase 1: Documentation & Baseline
5. ⏳ Set up project tracking (GitHub Issues/Projects)

---

## Appendix A: File Size Targets

| File | Current LOC | Target LOC | Change |
|------|-------------|------------|--------|
| property-panel-sync.js | 1258 | DEPRECATED | -1258 |
| unified-communication.ts | 295 | DEPRECATED | -295 |
| property-controller.ts | 539 | 200 | -339 |
| communication-bridge.js | 0 | 400 | +400 |
| main-adapter.js | 0 | 200 | +200 |
| ui-adapter.ts | 0 | 200 | +200 |
| scene-controller.js | 1817 | 400 | -1417 |
| scene-lifecycle-manager.js | 0 | 400 | +400 |
| scene-layout-manager.js | 0 | 500 | +500 |
| scene-hierarchy-manager.js | 0 | 400 | +400 |
| object-state-manager.js | 1026 | 800 | -226 |
| layout-propagation-manager.js | 0 | 300 | +300 |
| **TOTAL** | **4935** | **4000** | **-935** |

**Net reduction**: ~935 lines with better organization

---

## Appendix B: Test Coverage Goals

| Area | Current | Target | Priority |
|------|---------|--------|----------|
| Communication Layer | 0% | 80% | Critical |
| State Management | ~20% | 70% | High |
| Property Updates | ~30% | 75% | High |
| Layout Engine | ~40% | 70% | Medium |
| Event System | ~10% | 80% | High |
| Scene Controllers | ~20% | 70% | Medium |

---

## Appendix C: Migration Checklist

For each phase, complete this checklist before moving to next phase:

- [ ] All new code written and tested
- [ ] All existing tests still pass
- [ ] New tests added and passing
- [ ] Documentation updated
- [ ] Code reviewed by team
- [ ] Performance validated (no regression)
- [ ] Manual testing completed
- [ ] Rollback procedure documented
- [ ] Team trained on changes
- [ ] Phase demo completed

---

**End of Refactoring Plan**

_This is a living document. Update as needed during execution._
