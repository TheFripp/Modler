# Performance Baseline Metrics

**Version**: 1.0.0 - Pre-Refactoring Baseline
**Date**: 2025-01-13
**System**: Modler V2 (unified-notification-system branch)
**Purpose**: Establish baseline before Q1 2025 refactoring

---

## Measurement Methodology

All measurements taken using Performance API in Chrome DevTools:
- System: MacBook Pro (M1/M2/Intel - specify)
- Browser: Chrome 120+
- Test scenarios: Automated via performance-test.js script
- Samples: 100 runs per test, 90th percentile reported

---

## Core Property Update Latency

### Dimension Updates (No Layout)

**Scenario**: Object not in container, simple dimension change

| Metric | Baseline | Target | Status |
|--------|----------|--------|--------|
| UI → ObjectStateManager | TBD ms | <5ms | ⏳ |
| ObjectStateManager → SceneController | TBD ms | <10ms | ⏳ |
| SceneController geometry update | TBD ms | <15ms | ⏳ |
| ObjectEventBus → PropertyPanelSync | TBD ms | <10ms | ⏳ |
| PropertyPanelSync → UI update | TBD ms | <10ms | ⏳ |
| **Total end-to-end** | **TBD ms** | **<50ms** | ⏳ |

### Dimension Updates (With Layout)

**Scenario**: Object in container with autoLayout enabled

| Metric | Baseline | Target | Status |
|--------|----------|--------|--------|
| Steps 1-5 (to SceneController) | TBD ms | <30ms | ⏳ |
| LayoutEngine calculation | TBD ms | <50ms | ⏳ |
| Container resize | TBD ms | <20ms | ⏳ |
| Event propagation + UI | TBD ms | <30ms | ⏳ |
| **Total end-to-end** | **TBD ms** | **<130ms** | ⏳ |

### Transform Updates (Position/Rotation)

**Scenario**: Direct position change via move tool

| Metric | Baseline | Target | Status |
|--------|----------|--------|--------|
| Tool → ObjectStateManager | TBD ms | <3ms | ⏳ |
| Geometry update | TBD ms | <5ms | ⏳ |
| UI refresh | TBD ms | <5ms | ⏳ |
| **Total end-to-end** | **TBD ms** | **<15ms** | ⏳ |

### Material Updates (Color/Opacity)

**Scenario**: Color change via property panel

| Metric | Baseline | Target | Status |
|--------|----------|--------|--------|
| UI → Main coordination | TBD ms | <10ms | ⏳ |
| Material application | TBD ms | <5ms | ⏳ |
| Event → UI update | TBD ms | <10ms | ⏳ |
| **Total end-to-end** | **TBD ms** | **<25ms** | ⏳ |

---

## Layout Engine Performance

### Simple Linear Layout (3 children)

**Scenario**: Container with 3 box children, X-axis layout

| Metric | Baseline | Target | Status |
|--------|----------|--------|--------|
| LayoutEngine.calculateLayout() | TBD ms | <10ms | ⏳ |
| applyLayoutPositionsAndSizes() | TBD ms | <10ms | ⏳ |
| **Total layout update** | **TBD ms** | **<20ms** | ⏳ |

### Complex Linear Layout (10 children, with fill)

**Scenario**: Container with 10 children, some with fill sizing

| Metric | Baseline | Target | Status |
|--------|----------|--------|--------|
| LayoutEngine.calculateLayout() | TBD ms | <30ms | ⏳ |
| applyLayoutPositionsAndSizes() | TBD ms | <20ms | ⏳ |
| **Total layout update** | **TBD ms** | **<50ms** | ⏳ |

### Deep Nested Layout (5 levels)

**Scenario**: 5-level container nesting, each with 3 children

| Metric | Baseline | Target | Status |
|--------|----------|--------|--------|
| Single layout calculation | TBD ms | <30ms | ⏳ |
| Full propagation (all 5 levels) | TBD ms | <150ms | ⏳ |
| **Total cascade** | **TBD ms** | **<150ms** | ⏳ |

---

## Communication Layer Performance

### PostMessage Latency

**Scenario**: Single property update message

| Metric | Baseline | Target | Status |
|--------|----------|--------|--------|
| UI postMessage send | TBD ms | <2ms | ⏳ |
| Main receive + parse | TBD ms | <3ms | ⏳ |
| Round-trip (UI → Main → UI) | TBD ms | <10ms | ⏳ |

### Serialization Performance

**Scenario**: Object data serialization

| Metric | Baseline | Target | Status |
|--------|----------|--------|--------|
| ObjectDataFormat.serialize() | TBD ms | <5ms | ⏳ |
| JSON.parse(JSON.stringify()) | TBD ms | <3ms | ⏳ |
| Full PropertyPanelSync serialization | TBD ms | <15ms | ⏳ |

---

## Event System Performance

### ObjectEventBus Throughput

**Scenario**: Rapid event emissions

| Metric | Baseline | Target | Status |
|--------|----------|--------|--------|
| Events/second (non-throttled) | TBD | >1000 | ⏳ |
| Events/second (throttled) | TBD | 60 | ⏳ |
| Throttle latency | TBD ms | ~16ms | ⏳ |

### Event Handler Execution

**Scenario**: Single event with 5 subscribers

| Metric | Baseline | Target | Status |
|--------|----------|--------|--------|
| emit() execution time | TBD ms | <2ms | ⏳ |
| All handlers executed | TBD ms | <10ms | ⏳ |

---

## Memory Usage

### Baseline Memory Footprint

**Scenario**: 100 objects in scene

| Metric | Baseline | Target | Status |
|--------|----------|--------|--------|
| SceneController objects map | TBD MB | <5MB | ⏳ |
| ObjectEventBus queues | TBD MB | <1MB | ⏳ |
| PropertyPanelSync state | TBD MB | <2MB | ⏳ |
| **Total JavaScript heap** | **TBD MB** | **<50MB** | ⏳ |

### Memory Growth Over Time

**Scenario**: 1000 property updates

| Metric | Baseline | Target | Status |
|--------|----------|--------|--------|
| Heap growth | TBD MB | <10MB | ⏳ |
| Retained objects | TBD | <1000 | ⏳ |
| GC frequency | TBD per min | <10 | ⏳ |

---

## Frame Rate Performance

### Idle Frame Rate

**Scenario**: Scene with 50 objects, no interaction

| Metric | Baseline | Target | Status |
|--------|----------|--------|--------|
| Average FPS | TBD | 60 | ⏳ |
| Frame time (avg) | TBD ms | ~16ms | ⏳ |
| Frame time (p99) | TBD ms | <20ms | ⏳ |

### Interactive Frame Rate

**Scenario**: Dragging object with move tool

| Metric | Baseline | Target | Status |
|--------|----------|--------|--------|
| Average FPS | TBD | 60 | ⏳ |
| Frame time (avg) | TBD ms | ~16ms | ⏳ |
| Frame drops | TBD % | <5% | ⏳ |

### Layout Update Frame Rate

**Scenario**: Changing layout direction (triggers full recalculation)

| Metric | Baseline | Target | Status |
|--------|----------|--------|--------|
| Frame time spike | TBD ms | <100ms | ⏳ |
| Recovery to 60fps | TBD frames | <10 | ⏳ |

---

## How to Run Baseline Tests

### Manual Testing

1. **Open Chrome DevTools**
   - Open Modler V2 in Chrome
   - Press F12 to open DevTools
   - Go to Performance tab

2. **Record Property Update**
   ```javascript
   // In console:
   performance.mark('update-start');
   objectStateManager.updateObject('object-id', {dimensions: {x: 10}});
   performance.mark('update-end');
   performance.measure('property-update', 'update-start', 'update-end');
   console.log(performance.getEntriesByName('property-update')[0].duration);
   ```

3. **Record Layout Calculation**
   ```javascript
   performance.mark('layout-start');
   sceneController.updateLayout('container-id');
   performance.mark('layout-end');
   performance.measure('layout-update', 'layout-start', 'layout-end');
   console.log(performance.getEntriesByName('layout-update')[0].duration);
   ```

### Automated Testing (TODO)

Create performance test script:
```bash
npm run test:performance
```

This will:
1. Load test scene with known configuration
2. Run each test scenario 100 times
3. Calculate statistics (mean, median, p90, p99)
4. Output results to `performance-results.json`
5. Compare against targets
6. Generate HTML report

---

## Baseline Results

### Test Run Information

**Date**: TBD
**System**: TBD
**Browser**: Chrome TBD
**Branch**: refactor/communication-and-state-consolidation
**Commit**: TBD

### Summary Table

| Category | Tests | Passing | Failing | Unknown |
|----------|-------|---------|---------|---------|
| Property Updates | 4 | 0 | 0 | 4 |
| Layout Engine | 3 | 0 | 0 | 3 |
| Communication | 2 | 0 | 0 | 2 |
| Event System | 2 | 0 | 0 | 2 |
| Memory | 2 | 0 | 0 | 2 |
| Frame Rate | 3 | 0 | 0 | 3 |
| **TOTAL** | **16** | **0** | **0** | **16** |

---

## Action Items

### Before Starting Refactoring

- [ ] Set up automated performance test framework
- [ ] Run baseline tests on reference hardware
- [ ] Document system specifications
- [ ] Capture baseline metrics for all scenarios
- [ ] Review targets with team
- [ ] Commit baseline results to git

### During Refactoring

- [ ] Run performance tests after each phase
- [ ] Compare to baseline
- [ ] Investigate any regressions >10%
- [ ] Update metrics table
- [ ] Document optimization wins

### After Refactoring

- [ ] Run final performance comparison
- [ ] Generate improvement report
- [ ] Update target metrics for future work
- [ ] Document learnings

---

## Performance Budgets

### Critical Path Budgets (Must Not Exceed)

| Operation | Budget | Rationale |
|-----------|--------|-----------|
| Material update | 30ms | User expects immediate color change |
| Transform update | 20ms | Required for 60fps drag |
| Simple dimension | 60ms | Acceptable for text input |
| Layout with nesting | 150ms | User can tolerate brief pause |
| Hierarchy refresh | 200ms | Infrequent operation |

### Frame Time Budget (60fps = 16.67ms)

| Task | Budget | Rationale |
|------|--------|-----------|
| Event processing | 3ms | Leave room for rendering |
| Layout calculation | 8ms | Most expensive operation |
| Geometry update | 3ms | Direct mesh manipulation |
| Render (Three.js) | 2ms | Scene rendering |
| **Total** | **16ms** | **60fps target** |

---

## Regression Detection

### Automated Checks

Performance tests will **fail** if:
- Any metric regresses by >20% without justification
- Any critical path exceeds budget
- Frame rate drops below 55fps (90% of 60fps)
- Memory growth >50% without new features

### Manual Review Required If

- Metric changes by 10-20%
- New bottleneck appears in profiler
- User reports perceived slowness
- Frame drops during specific operations

---

## References

- [PROPERTY-UPDATE-FLOW.md](../architecture/PROPERTY-UPDATE-FLOW.md) - Flow details
- [Refactoring Plan](../refactoring/REFACTORING-PLAN-2025-Q1.md) - Targets
- [Chrome DevTools Performance](https://developer.chrome.com/docs/devtools/performance/)
- [Web Performance API](https://developer.mozilla.org/en-US/docs/Web/API/Performance)

---

## Version History

- 1.0.0 (2025-01-13): Initial baseline framework (measurements TBD)

---

## Notes

**Status Legend**:
- ⏳ = Measurement pending
- ✅ = Meets target
- ⚠️ = Close to target (within 10%)
- ❌ = Exceeds target (needs optimization)

**Next Step**: Run automated baseline tests and fill in TBD values.
