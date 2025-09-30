---
title: Parametric Design System
version: 1.0.0
last_updated: September 30, 2025
maintained_by: Architecture Team
---

# Parametric Design System

Complete parametric design infrastructure enabling rule-based, formula-driven, and constraint-based design workflows in Modler V2.

## System Overview

The parametric design system consists of three core subsystems working together:

1. **FormulaEvaluator** - Safe mathematical expression evaluation
2. **DependencyGraph** - Dependency tracking and update ordering
3. **ConstraintSolver** - Multi-constraint resolution
4. **PropertySchemaRegistry** - Integration and coordination layer

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│           PropertySchemaRegistry (Integration)          │
│  - createParametricProperty()                           │
│  - updateParametricProperty()                           │
│  - propagateParametricChange()                          │
└────────────┬────────────┬────────────┬──────────────────┘
             │            │            │
    ┌────────▼──────┐ ┌──▼─────────┐ ┌▼──────────────┐
    │   Formula     │ │ Dependency │ │  Constraint   │
    │  Evaluator    │ │   Graph    │ │    Solver     │
    └───────────────┘ └────────────┘ └───────────────┘
         │                  │                │
         │ Evaluates        │ Determines     │ Applies
         │ expressions      │ update order   │ constraints
         │                  │                │
    ┌────▼──────────────────▼────────────────▼─────────┐
    │         ObjectEventBus (Event System)            │
    │  PARAMETRIC_UPDATE, FORMULA_UPDATE,              │
    │  CONSTRAINT_CHANGE, DEPENDENCY_UPDATE            │
    └──────────────────────────────────────────────────┘
```

## Core Components

### 1. FormulaEvaluator

**Purpose**: Safely evaluate mathematical expressions with variable substitution.

**Key Features:**
- Safe expression parsing (no `eval()` or dangerous patterns)
- Context-based variable resolution
- Dependency extraction from formulas
- Math function support (sin, cos, sqrt, pow, min, max, etc.)
- Result caching (1 second expiration)
- Expression validation

**Example Usage:**
```javascript
const evaluator = new FormulaEvaluator();

// Simple evaluation
const result = evaluator.evaluate('width * 2 + height', {
    width: 10,
    height: 20
});
// result = 40

// With math functions
const area = evaluator.evaluate('PI * pow(radius, 2)', {
    radius: 5
});
// area = 78.54

// Extract dependencies
const deps = evaluator.extractDependencies('chairHeight * 0.33 + offset');
// deps = ['chairHeight', 'offset']

// Validate formula
const validation = evaluator.validateFormula('width * height', {
    width: 10,
    height: 20
});
// validation = { valid: true, dependencies: ['width', 'height'], testResult: 200 }
```

**Supported Math Functions:**
- Basic: `abs`, `ceil`, `floor`, `round`, `sqrt`, `pow`, `min`, `max`
- Trigonometry: `sin`, `cos`, `tan`, `asin`, `acos`, `atan`, `atan2`
- Logarithmic: `log`, `exp`
- Constants: `PI`, `E`

**Safety Features:**
- Rejects expressions with `eval`, `function`, `=>`, `this`, `window`, `document`
- Length limit (500 characters)
- Character whitelist (alphanumeric, operators, parentheses only)
- No array/object access patterns

### 2. DependencyGraph

**Purpose**: Track dependencies between parametric properties and ensure correct update ordering.

**Key Features:**
- Directed acyclic graph (DAG) structure
- Circular dependency detection
- Topological sorting for update order
- Impact analysis (affected nodes, depth)
- Forward and reverse edge tracking

**Example Usage:**
```javascript
const graph = new DependencyGraph();

// Add nodes
graph.addNode('chair1.chairHeight', { type: 'parameter', value: 32 });
graph.addNode('chair1.legHeight', { type: 'property' });

// Add dependency (chairHeight drives legHeight)
const success = graph.addDependency('chair1.chairHeight', 'chair1.legHeight');
// success = true (no cycle)

// Check if adding edge would create cycle
const wouldCycle = graph.wouldCreateCycle('chair1.legHeight', 'chair1.chairHeight');
// wouldCycle = true (would create cycle)

// Get update order when chairHeight changes
const updateOrder = graph.getUpdateOrder('chair1.chairHeight');
// updateOrder = ['chair1.legHeight', 'chair1.seatHeight', ...] (topologically sorted)

// Analyze impact
const impact = graph.analyzeImpact('chair1.chairHeight');
// impact = {
//     affectedCount: 5,
//     affectedNodes: [...],
//     updateOrder: [...],
//     maxDepth: 2,
//     directDependents: 3
// }
```

**Graph Operations:**
- `addNode(nodeId, metadata)` - Add parameter/property node
- `addDependency(sourceId, targetId)` - Add dependency edge
- `removeDependency(sourceId, targetId)` - Remove edge
- `removeNode(nodeId)` - Remove node and all edges
- `canReach(fromId, toId)` - Check if path exists
- `getDescendants(nodeId)` - Get all dependent nodes
- `getDependencies(nodeId)` - Get what this node depends on
- `getDependents(nodeId)` - Get what depends on this node
- `getDependencyDepth(nodeId)` - Get longest dependency chain
- `detectAllCycles()` - Find all cycles in graph

### 3. ConstraintSolver

**Purpose**: Resolve multiple constraints on property values.

**Key Features:**
- Sequential constraint solving (default)
- Iterative solving for interdependent constraints
- Extensible constraint type system
- Priority-based constraint application
- Convergence detection

**Built-in Constraint Types:**
1. **min** (priority 1) - Enforce minimum value
2. **max** (priority 1) - Enforce maximum value
3. **range** (priority 1) - Enforce min/max range
4. **equals** (priority 2) - Set exact value
5. **ratio** (priority 3) - Value = other * ratio
6. **offset** (priority 3) - Value = other + offset
7. **locked** (priority 10) - Value cannot change

**Example Usage:**
```javascript
const solver = new ConstraintSolver();

// Define properties and constraints
const properties = {
    width: 15,
    height: 8,
    depth: 12
};

const constraints = {
    width: [
        { type: 'range', min: 10, max: 20 }
    ],
    height: [
        { type: 'ratio', referenceProperty: 'width', ratio: 0.5 },
        { type: 'min', min: 5 }
    ],
    depth: [
        { type: 'locked', lockedValue: 12 }
    ]
};

// Solve all constraints
const solved = solver.solve(properties, constraints);
// solved = { width: 15, height: 7.5, depth: 12 }

// Apply single constraint
const constrained = solver.applyConstraint(25,
    { type: 'range', min: 10, max: 20 },
    {}
);
// constrained = 20 (clamped to max)

// Register custom constraint type
solver.registerConstraintType('fibonacci', {
    priority: 4,
    solve: (value, constraint, context) => {
        const n = context[constraint.referenceProperty];
        // Calculate nth Fibonacci number
        return calculateFib(n);
    }
});
```

**Constraint Priority System:**
- Priority 1-10 (higher = applied later, can override lower priority)
- Allows complex constraint interactions
- Locked constraints (priority 10) always win

**Solving Modes:**
- **Sequential** (default): Single pass, fast, works for most cases
- **Iterative**: Multiple passes until convergence, for interdependent constraints

### 4. PropertySchemaRegistry Integration

**Purpose**: Coordinate all parametric systems and integrate with Modler V2 core.

**Enhanced Methods:**

#### `createParametricProperty(objectId, parameterName, config)`

Creates a parametric property with formula and dependencies.

```javascript
propertySchemaRegistry.createParametricProperty('chair1', 'chairHeight', {
    value: 32,
    unit: 'inches',
    constraints: { min: 24, max: 48 },
    drives: [
        'chair1.seatHeight',
        'chair1.legHeight'
    ],
    formula: null, // Optional formula for this parameter
    exposed: true  // Show in UI
});
```

**What it does:**
1. Registers parameter in dependency map
2. Adds node to dependency graph
3. Creates edges for all driven properties
4. Validates formula (if provided)
5. Emits PARAMETRIC_UPDATE event

#### `updateParametricProperty(parameterId, newValue)`

Updates a parameter and propagates to all dependents.

```javascript
propertySchemaRegistry.updateParametricProperty('chair1.chairHeight', 36);
```

**Propagation Flow:**
1. Validate new value against constraints
2. Get topologically sorted update order from dependency graph
3. Build evaluation context with new value
4. For each dependent property (in order):
   - Get formula from registry
   - Evaluate formula with current context
   - Update context with result
   - Emit FORMULA_UPDATE event
5. Update all affected objects in SceneController

## Event System Integration

### New Event Types

**PARAMETRIC_UPDATE** - Parameter value changed
```javascript
{
    action: 'create' | 'update',
    parameter: 'chairHeight',
    value: 36,
    constraints: { min: 24, max: 48 },
    drives: ['seatHeight', 'legHeight']
}
```

**FORMULA_UPDATE** - Formula evaluated and property updated
```javascript
{
    property: 'legHeight',
    value: 12,
    formula: 'chairHeight * 0.33',
    sourceParameter: 'chair1.chairHeight'
}
```

**CONSTRAINT_CHANGE** - Property constraints modified
```javascript
{
    property: 'width',
    constraints: { min: 10, max: 20 },
    previousConstraints: { min: 5, max: 30 }
}
```

**DEPENDENCY_UPDATE** - Dependency relationship changed
```javascript
{
    sourceParameter: 'chair1.chairHeight',
    dependentProperty: 'chair1.legHeight',
    newValue: 36
}
```

## Usage Patterns

### Pattern 1: Simple Parameter Driving Properties

```javascript
// Create parameter that drives leg height
propertySchemaRegistry.createParametricProperty('chair1', 'chairHeight', {
    value: 32,
    drives: ['chair1.legHeight']
});

// Set formula on driven property
propertySchemaRegistry.formulaRegistry.set('chair1.legHeight', {
    expression: 'chairHeight * 0.33',
    dependencies: ['chairHeight']
});

// Update parameter - leg height automatically recalculates
propertySchemaRegistry.updateParametricProperty('chair1.chairHeight', 36);
// legHeight becomes 11.88 (36 * 0.33)
```

### Pattern 2: Chained Dependencies

```javascript
// chairHeight drives seatHeight, seatHeight drives legHeight
propertySchemaRegistry.createParametricProperty('chair1', 'chairHeight', {
    value: 32,
    drives: ['chair1.seatHeight']
});

propertySchemaRegistry.formulaRegistry.set('chair1.seatHeight', {
    expression: 'chairHeight * 0.33',
    dependencies: ['chairHeight']
});

// seatHeight drives legHeight
propertySchemaRegistry.dependencyGraph.addDependency(
    'chair1.seatHeight',
    'chair1.legHeight'
);

propertySchemaRegistry.formulaRegistry.set('chair1.legHeight', {
    expression: 'seatHeight',
    dependencies: ['seatHeight']
});

// Update chairHeight - both seatHeight and legHeight update in order
```

### Pattern 3: Component Instancing with Master-Instance

```javascript
// Create master chair
propertySchemaRegistry.createParametricProperty('masterChair', 'chairHeight', {
    value: 32,
    drives: ['masterChair.seatHeight', 'masterChair.legHeight']
});

// Create instances
propertySchemaRegistry.createInstanceRelationship('chair1', 'masterChair');
propertySchemaRegistry.createInstanceRelationship('chair2', 'masterChair');

// Update master - all instances update automatically
propertySchemaRegistry.propagateMasterChange('masterChair', {
    property: 'chairHeight',
    newValue: 36
});
```

### Pattern 4: Complex Constraints

```javascript
const solver = new ConstraintSolver();

// Define object with multiple constraints
const properties = {
    tableWidth: 60,
    tableHeight: 30,
    tableDepth: 40
};

const constraints = {
    tableWidth: [
        { type: 'range', min: 48, max: 72 },
        { type: 'ratio', referenceProperty: 'tableDepth', ratio: 1.5 }
    ],
    tableHeight: [
        { type: 'ratio', referenceProperty: 'tableWidth', ratio: 0.5 },
        { type: 'range', min: 28, max: 32 }
    ]
};

const solved = solver.solve(properties, constraints);
// Applies all constraints in priority order
```

## Performance Considerations

### Formula Evaluation
- **Caching**: Results cached for 1 second
- **Complexity**: Keep formulas under 10 operations
- **Optimization**: Use pre-computed values where possible

### Dependency Updates
- **Update Order**: Topological sort O(V + E)
- **Batch Updates**: Throttled at 60fps via ObjectEventBus
- **Impact**: Check `analyzeImpact()` before complex updates

### Constraint Solving
- **Sequential**: Fast single-pass, O(n) constraints
- **Iterative**: Multiple passes until convergence, O(n * iterations)
- **Max Iterations**: Default 100, configurable

## Scalability Limits

**Recommended Limits:**
- Parametric objects: 100-200
- Dependencies per parameter: 10-20
- Formula operations: 10-15
- Constraint chain depth: 10 levels
- Dependency graph nodes: 500-1000

**Performance Thresholds:**
- Formula evaluation: < 1ms per formula
- Topological sort: < 5ms for 100 nodes
- Constraint solving: < 10ms for 20 constraints
- Full propagation: < 50ms for 50 dependencies

## Error Handling

### Formula Errors
```javascript
const result = evaluator.evaluate('badFormula()', {});
// result = null (error logged)
// Stats: failures increment
```

### Circular Dependencies
```javascript
const success = graph.addDependency('A', 'B');
const cycle = graph.addDependency('B', 'A');
// cycle = false (rejected)
// Warning logged
```

### Constraint Violations
```javascript
const validation = solver.validateConstraint({ type: 'unknown' });
// validation = { valid: false, error: 'Unknown constraint type: unknown' }
```

## Debugging and Statistics

### Formula Evaluator Stats
```javascript
evaluator.getStats();
// {
//     evaluations: 150,
//     successes: 145,
//     failures: 5,
//     cacheHits: 50,
//     cacheSize: 12,
//     successRate: '96.7%'
// }
```

### Dependency Graph Stats
```javascript
graph.getStats();
// {
//     nodes: 50,
//     edges: 75,
//     cyclesDetected: 2,
//     topologicalSorts: 25,
//     currentNodes: 50,
//     currentEdges: 75,
//     avgDependenciesPerNode: '1.50'
// }
```

### Constraint Solver Stats
```javascript
solver.getStats();
// {
//     solveAttempts: 100,
//     successes: 98,
//     failures: 2,
//     iterations: 150,
//     constraintsApplied: 450,
//     registeredTypes: 7,
//     successRate: '98.0%',
//     avgIterations: '1.50'
// }
```

## Future Enhancements

### Planned Features
- [ ] UI for visual formula editing
- [ ] Formula debugging visualization
- [ ] Constraint conflict resolution UI
- [ ] Parametric template system
- [ ] Rule engine for conditional logic
- [ ] Import/export of parametric definitions
- [ ] Parametric animation curves

### Potential Extensions
- [ ] Boolean constraint types
- [ ] Geometric constraint solver
- [ ] Optimization solver (minimize/maximize)
- [ ] Constraint relaxation for over-constrained systems
- [ ] Parallel evaluation for independent branches

## Related Documentation

- [Object/Container Hierarchy](./containers.md) - Container system foundation
- [Layout Engine](./layout.md) - Auto-layout integration
- [Event System](../architecture/event-coordination.md) - ObjectEventBus details
- [Property Management](./property-management.md) - Property update flow

---

**Implementation Files:**
- `application/parametric/formula-evaluator.js` (312 lines)
- `application/parametric/dependency-graph.js` (382 lines)
- `application/parametric/constraint-solver.js` (429 lines)
- `application/schemas/property-schema-registry.js` (enhanced)
- `application/examples/parametric-chair-example.js` (working example)

**Status**: ✅ Production Ready (v1.0.0)