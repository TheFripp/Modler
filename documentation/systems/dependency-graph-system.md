# Dependency Graph System Design

## Overview
The DependencyGraph system tracks all relationships between objects, containers, formulas, and templates to enable efficient change propagation in the parametric design system.

## Core Concepts

### Dependency Types
```javascript
const DependencyType = {
    PARENT_CHILD: 'parent_child',           // Container → Child object
    LAYOUT: 'layout',                       // Objects affecting each other through layout
    FORMULA: 'formula',                     // Formula references another object's property
    TEMPLATE_INSTANCE: 'template_instance', // Master template → Instance
    CONSTRAINT: 'constraint'                // Future: geometric constraints
};
```

### Dependency Direction
```javascript
const DependencyDirection = {
    FORWARD: 'forward',   // A affects B (A changes → B updates)
    BIDIRECTIONAL: 'bi'   // A and B affect each other
};
```

## Architecture Design

### DependencyGraph Class
```javascript
class DependencyGraph {
    constructor() {
        // Map: objectId → Set of dependencies where this object is the source
        this.outgoingDependencies = new Map();

        // Map: objectId → Set of dependencies where this object is the target
        this.incomingDependencies = new Map();

        // Map: dependencyId → DependencyInfo object
        this.dependencies = new Map();

        // Cache for frequently calculated paths
        this.propagationPathCache = new Map();

        // Performance metrics
        this.metrics = {
            totalDependencies: 0,
            maxDepth: 0,
            lastCalculationTime: 0
        };
    }
}
```

### Dependency Structure
```javascript
class DependencyInfo {
    constructor(sourceId, targetId, type, metadata = {}) {
        this.id = this.generateId(sourceId, targetId, type);
        this.sourceId = sourceId;           // Object that triggers the change
        this.targetId = targetId;           // Object that receives the change
        this.type = type;                   // DependencyType
        this.direction = metadata.direction || DependencyDirection.FORWARD;
        this.metadata = metadata;           // Type-specific additional data
        this.createdAt = Date.now();
        this.isActive = true;               // Can be disabled without removal
    }

    generateId(sourceId, targetId, type) {
        return `${sourceId}->${targetId}:${type}`;
    }
}
```

### Metadata Examples
```javascript
// Layout dependency metadata
{
    direction: DependencyDirection.BIDIRECTIONAL,
    layoutProperty: 'size',
    affectedAxes: ['x', 'y'],
    containerContext: 'layout_calculation'
}

// Formula dependency metadata
{
    direction: DependencyDirection.FORWARD,
    formulaExpression: 'sourceObject.width * 0.5',
    targetProperty: 'height',
    sourceProperties: ['width']
}

// Template-instance metadata
{
    direction: DependencyDirection.FORWARD,
    templateId: 'button_template_001',
    overriddenProperties: ['backgroundColor'],
    isDisconnected: false
}
```

## Core Operations

### 1. Add Dependency
```javascript
addDependency(sourceId, targetId, type, metadata = {}) {
    // Validate objects exist
    if (!this.validateObjects(sourceId, targetId)) {
        throw new Error(`Invalid objects: ${sourceId} or ${targetId}`);
    }

    // Check for circular dependency
    if (this.wouldCreateCircularDependency(sourceId, targetId)) {
        throw new Error(`Circular dependency detected: ${sourceId} → ${targetId}`);
    }

    const dependency = new DependencyInfo(sourceId, targetId, type, metadata);

    // Store dependency
    this.dependencies.set(dependency.id, dependency);

    // Update outgoing/incoming maps
    this.addToOutgoing(sourceId, dependency.id);
    this.addToIncoming(targetId, dependency.id);

    // Clear affected caches
    this.clearPropagationCache(sourceId, targetId);

    this.metrics.totalDependencies++;

    return dependency.id;
}
```

### 2. Calculate Propagation Path
```javascript
calculatePropagationPath(sourceId, changeType = 'property') {
    const cacheKey = `${sourceId}:${changeType}`;

    if (this.propagationPathCache.has(cacheKey)) {
        return this.propagationPathCache.get(cacheKey);
    }

    const startTime = performance.now();
    const path = this.calculatePropagationPathRecursive(sourceId, new Set(), []);

    this.metrics.lastCalculationTime = performance.now() - startTime;
    this.propagationPathCache.set(cacheKey, path);

    return path;
}

calculatePropagationPathRecursive(objectId, visited, currentPath) {
    if (visited.has(objectId)) {
        // Circular dependency detected - return current path
        return currentPath;
    }

    visited.add(objectId);
    const propagationLevels = [];

    // Get all outgoing dependencies from this object
    const outgoing = this.outgoingDependencies.get(objectId) || new Set();

    for (const dependencyId of outgoing) {
        const dependency = this.dependencies.get(dependencyId);
        if (!dependency || !dependency.isActive) continue;

        const level = {
            dependencyId,
            sourceId: dependency.sourceId,
            targetId: dependency.targetId,
            type: dependency.type,
            metadata: dependency.metadata,
            children: this.calculatePropagationPathRecursive(
                dependency.targetId,
                new Set(visited),
                [...currentPath, dependencyId]
            )
        };

        propagationLevels.push(level);
    }

    return propagationLevels;
}
```

### 3. Get Affected Objects
```javascript
getAffectedObjects(sourceId, maxDepth = 10) {
    const affected = new Set();
    const queue = [{id: sourceId, depth: 0}];

    while (queue.length > 0) {
        const {id, depth} = queue.shift();

        if (depth >= maxDepth) continue;

        const outgoing = this.outgoingDependencies.get(id) || new Set();

        for (const dependencyId of outgoing) {
            const dependency = this.dependencies.get(dependencyId);
            if (!dependency || !dependency.isActive) continue;

            const targetId = dependency.targetId;
            if (!affected.has(targetId)) {
                affected.add(targetId);
                queue.push({id: targetId, depth: depth + 1});
            }
        }
    }

    return Array.from(affected);
}
```

### 4. Circular Dependency Detection
```javascript
wouldCreateCircularDependency(sourceId, targetId) {
    // Quick check: if target already has path back to source
    return this.hasPathBetween(targetId, sourceId);
}

hasPathBetween(startId, endId, visited = new Set()) {
    if (startId === endId) return true;
    if (visited.has(startId)) return false;

    visited.add(startId);

    const outgoing = this.outgoingDependencies.get(startId) || new Set();

    for (const dependencyId of outgoing) {
        const dependency = this.dependencies.get(dependencyId);
        if (!dependency || !dependency.isActive) continue;

        if (this.hasPathBetween(dependency.targetId, endId, new Set(visited))) {
            return true;
        }
    }

    return false;
}
```

## Integration Points

### Scene Controller Integration
```javascript
// Extend SceneController to register dependencies automatically
class SceneController {
    addObject(geometry, material, options) {
        const object = super.addObject(geometry, material, options);

        // Register parent-child dependency if parent container specified
        if (options.parentContainer) {
            this.dependencyGraph.addDependency(
                options.parentContainer,
                object.id,
                DependencyType.PARENT_CHILD,
                { containerContext: 'parent_child_relationship' }
            );
        }

        return object;
    }

    updateObjectProperty(objectId, property, value) {
        // Update the property
        const result = super.updateObjectProperty(objectId, property, value);

        // Trigger dependency propagation
        this.propagateChange(objectId, property, value);

        return result;
    }
}
```

### Layout Engine Integration
```javascript
// Register layout dependencies when calculating layouts
static calculateLayout(objects, layoutConfig, containerSize) {
    const result = super.calculateLayout(objects, layoutConfig, containerSize);

    // Register layout dependencies for objects with 'fill' behavior
    objects.forEach(obj => {
        if (this.objectHasFillBehavior(obj, layoutConfig.direction)) {
            // This object depends on container size changes
            window.modlerComponents?.dependencyGraph?.addDependency(
                obj.parentContainer,
                obj.id,
                DependencyType.LAYOUT,
                {
                    layoutAxis: layoutConfig.direction,
                    sizingBehavior: 'fill'
                }
            );
        }
    });

    return result;
}
```

## Performance Optimizations

### 1. Batch Operations
```javascript
batchDependencyOperations(operations) {
    this.clearAllCaches();

    const results = [];
    for (const operation of operations) {
        switch (operation.type) {
            case 'add':
                results.push(this.addDependency(...operation.args));
                break;
            case 'remove':
                results.push(this.removeDependency(...operation.args));
                break;
        }
    }

    this.rebuildOptimizedCaches();
    return results;
}
```

### 2. Smart Cache Management
```javascript
clearPropagationCache(sourceId, targetId) {
    // Only clear caches that could be affected by this change
    for (const [cacheKey, _] of this.propagationPathCache) {
        const [cachedSourceId] = cacheKey.split(':');

        // Clear if the cached path might include the changed dependency
        if (this.pathMightInclude(cachedSourceId, sourceId, targetId)) {
            this.propagationPathCache.delete(cacheKey);
        }
    }
}
```

### 3. Dependency Metrics
```javascript
getDependencyMetrics() {
    return {
        totalDependencies: this.metrics.totalDependencies,
        maxDepth: this.calculateMaxDepth(),
        avgCalculationTime: this.metrics.lastCalculationTime,
        memoryUsage: this.estimateMemoryUsage(),
        circularDependencies: this.detectAllCircularDependencies().length
    };
}
```

## File Structure
```
/application/systems/
├── dependency-graph.js              # Main DependencyGraph class
├── dependency-info.js               # DependencyInfo class
├── dependency-types.js              # Constants and enums
└── dependency-performance.js        # Performance monitoring utilities
```

## Usage Examples

### Container Hierarchy
```javascript
// When creating a container with children
dependencyGraph.addDependency(
    containerId,
    childObjectId,
    DependencyType.PARENT_CHILD
);

// Calculate what updates when container changes
const affected = dependencyGraph.getAffectedObjects(containerId);
```

### Formula Dependencies
```javascript
// Object A's height formula: "ObjectB.width * 1.5"
dependencyGraph.addDependency(
    objectBId,
    objectAId,
    DependencyType.FORMULA,
    {
        formulaExpression: 'ObjectB.width * 1.5',
        targetProperty: 'height',
        sourceProperties: ['width']
    }
);
```

### Template-Instance
```javascript
// Component instance depends on master template
dependencyGraph.addDependency(
    masterTemplateId,
    instanceId,
    DependencyType.TEMPLATE_INSTANCE,
    {
        templateId: masterTemplateId,
        overriddenProperties: ['color']
    }
);
```

This dependency graph system provides the foundation for efficient change propagation across all types of parametric relationships while maintaining performance and preventing circular dependencies.