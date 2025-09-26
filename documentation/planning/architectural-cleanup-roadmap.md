# Modler V2 - Architectural Cleanup Roadmap
*Long-term strategic plan for maintaining architectural quality*

**Created**: 2024-12-20
**Last Updated**: 2024-12-20
**Status**: Active Planning Phase

## Executive Summary

Focus on **structural quality** and **performance-critical coupling** rather than line counts. Build on recent successful patterns like MeshSynchronizer removal and support mesh architecture consolidation.

### Key Metrics to Track
- Global coupling instances: **335** → Target: **<50**
- Factory instantiations: **48** → Target: **<10**
- Mixed responsibility files: **12** → Target: **<5**

---

## Phase 1: Factory Centralization
**Objective**: Eliminate redundant factory instantiations, centralize resource management
**Timeline**: 2-3 weeks
**Impact**: High performance gain, follows established patterns

### 🔄 In Progress Tasks

- [ ] **[P1-001]** Create centralized factory instances in v2-main.js initialization
  - **Files**: `v2-main.js`
  - **Current**: 48 separate factory instantiations across codebase
  - **Target**: Single instances injected via dependency injection
  - **Started**: [Date]
  - **Completed**: [Date]
  - **Notes**:

- [ ] **[P1-002]** Refactor VisualEffects to use injected factories
  - **Files**: `scene/visual-effects.js`
  - **Current**: `new GeometryFactory()`, `new MaterialManager()` in constructor
  - **Target**: Constructor parameters `(scene, geometryFactory, materialManager)`
  - **Started**: [Date]
  - **Completed**: [Date]
  - **Notes**:

- [ ] **[P1-003]** Refactor SupportMeshFactory to use injected factories
  - **Files**: `interaction/support-mesh-factory.js`
  - **Current**: 2 factory instantiations
  - **Target**: Constructor injection
  - **Started**: [Date]
  - **Completed**: [Date]
  - **Notes**:

- [ ] **[P1-004]** Refactor LayoutGeometry to use injected factories
  - **Files**: `application/tools/layout-geometry.js`
  - **Current**: 5 factory instantiations (highest count)
  - **Target**: Static methods using centralized factories
  - **Started**: [Date]
  - **Completed**: [Date]
  - **Notes**:

### 📋 Remaining P1 Tasks

- [ ] **[P1-005]** Update remaining high-factory-count files
  - **Files**: `scene/snap-visualizer.js`, `interaction/object-visualizer.js`, `application/tools/box-creation-tool.js`
  - **Started**: [Date]
  - **Completed**: [Date]

- [ ] **[P1-006]** Performance validation after factory centralization
  - **Metrics**: Factory cache hit rates, memory usage, initialization time
  - **Started**: [Date]
  - **Completed**: [Date]

---

## Phase 2: Dependency Injection Cleanup
**Objective**: Replace global registry coupling with proper dependency injection
**Timeline**: 3-4 weeks
**Impact**: Critical for maintainability and testing

### 📋 Pending Tasks

- [ ] **[P2-001]** Audit all window.modlerComponents usage (335 instances)
  - **Priority**: Map dependency patterns, identify highest-impact targets
  - **Started**: [Date]
  - **Completed**: [Date]

- [ ] **[P2-002]** Refactor SceneController access patterns
  - **Files**: `scene/visual-effects.js` and others
  - **Current**: `window.modlerComponents?.sceneController`
  - **Target**: Constructor injection
  - **Started**: [Date]
  - **Completed**: [Date]

- [ ] **[P2-003]** Create dependency injection helper utilities
  - **Target**: Simple DI container for component wiring
  - **Started**: [Date]
  - **Completed**: [Date]

- [ ] **[P2-004]** Update v2-main.js initialization with proper DI
  - **Files**: `v2-main.js`
  - **Started**: [Date]
  - **Completed**: [Date]

---

## Phase 3: Responsibility Separation
**Objective**: Clean up mixed responsibilities following MeshSynchronizer success pattern
**Timeline**: 2-3 weeks
**Impact**: Medium, better maintainability

### 📋 Pending Tasks

- [ ] **[P3-001]** Extract lighting system from SceneController
  - **Files**: `scene/scene-controller.js` (lines 23-35)
  - **Target**: Dedicated LightingController
  - **Started**: [Date]
  - **Completed**: [Date]

- [ ] **[P3-002]** Extract layout management from SceneController
  - **Files**: `scene/scene-controller.js` (lines 500-600+)
  - **Target**: Dedicated LayoutController or expand existing LayoutEngine
  - **Started**: [Date]
  - **Completed**: [Date]

- [ ] **[P3-003]** Consolidate PropertyManager (embedded in v2-main.js)
  - **Files**: `v2-main.js` (lines 7-162)
  - **Target**: Dedicated file with proper DI
  - **Started**: [Date]
  - **Completed**: [Date]

---

## Phase 4: Architecture Enforcement
**Objective**: Prevent architectural regression
**Timeline**: Ongoing
**Impact**: Long-term quality maintenance

### 📋 Pending Tasks

- [ ] **[P4-001]** Update complexity checker to flag global coupling
  - **Files**: `scripts/complexity-check.js`
  - **Target**: Fail builds on >50 window.modlerComponents references
  - **Started**: [Date]
  - **Completed**: [Date]

- [ ] **[P4-002]** Create dependency injection documentation
  - **Files**: `documentation/development/dependency-patterns.md`
  - **Started**: [Date]
  - **Completed**: [Date]

- [ ] **[P4-003]** Add architectural review checklist
  - **Target**: Pre-commit hooks and review guidelines
  - **Started**: [Date]
  - **Completed**: [Date]

---

## Success Patterns to Follow

### ✅ Recent Wins (Reference Examples)
1. **MeshSynchronizer Removal**: Eliminated unnecessary abstraction, simplified to self-contained children
2. **Support Mesh Architecture**: "Create once, show/hide" pattern works excellently
3. **Factory Pooling**: GeometryFactory and MaterialManager caching systems are well-designed

### 🎯 Design Principles
- **Performance First**: Don't split cohesive high-performance systems
- **Structural Quality**: Focus on coupling and responsibility separation
- **Follow Patterns**: Build on what's working (factory pooling, support mesh architecture)
- **Avoid Over-Engineering**: Direct solutions over abstractions

---

## Progress Tracking

### Completed Phases
*None yet - planning phase*

### Current Phase Status
**Phase 1**: Not Started
**Next Milestone**: P1-001 Factory centralization
**Estimated Start**: [Date]

### Metrics Dashboard
- **Global Coupling**: 335 instances → Current: ___ → Target: <50
- **Factory Instantiations**: 48 → Current: ___ → Target: <10
- **Mixed Responsibility Files**: 12 → Current: ___ → Target: <5

---

## Notes & Refinements

### 2024-12-20
- Initial roadmap created based on comprehensive system analysis
- Identified factory centralization as highest-impact, lowest-risk starting point
- Excluded Svelte integration from cleanup scope (leave for later)

### [Future Date]
- [Add refinements and adjustments as work progresses]

---

*This document will be continuously updated as work progresses. Each task completion should include date stamps and any architectural insights gained.*