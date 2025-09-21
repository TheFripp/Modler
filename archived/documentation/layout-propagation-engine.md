# Layout Propagation Engine Design

## Overview
The LayoutPropagationEngine efficiently manages cascading layout updates through container hierarchies, working with the DependencyGraph to minimize redundant calculations and ensure proper update ordering.

## Core Concepts

### Propagation Direction
```javascript
const PropagationDirection = {
    BOTTOM_UP: 'bottom_up',     // Child changes affect parents
    TOP_DOWN: 'top_down',       // Parent changes affect children
    BIDIRECTIONAL: 'bi'         // Change affects both directions
};
```

### Update Types
```javascript
const UpdateType = {
    SIZE_CHANGE: 'size_change',           // Object dimensions changed
    POSITION_CHANGE: 'position_change',   // Object position changed
    LAYOUT_CONFIG: 'layout_config',       // Container layout settings changed
    PROPERTY_CHANGE: 'property_change',   // Layout-affecting property changed
    HIERARCHY_CHANGE: 'hierarchy_change'  // Parent-child relationships changed
};
```

### Update Priority
```javascript
const UpdatePriority = {
    IMMEDIATE: 0,    // User direct manipulation
    HIGH: 1,         // Layout dependencies
    NORMAL: 2,       // Formula calculations
    LOW: 3,          // Template syncing
    BATCH: 4         // Background optimization
};
```

## Architecture Design

### LayoutPropagationEngine Class
```javascript
class LayoutPropagationEngine {
    constructor(dependencyGraph, sceneController, layoutEngine) {
        this.dependencyGraph = dependencyGraph;
        this.sceneController = sceneController;
        this.layoutEngine = layoutEngine;

        // Update queue with priority handling
        this.updateQueue = new PriorityQueue();

        // Batch update tracking
        this.batchUpdates = new Map(); // objectId → Set of pending updates
        this.batchTimeout = null;

        // Performance optimization
        this.calculationCache = new Map();
        this.frameRequestId = null;

        // Debug and metrics
        this.metrics = {
            totalUpdates: 0,
            avgUpdateTime: 0,
            maxCascadeDepth: 0,
            lastUpdateChain: []
        };

        this.isUpdating = false;
        this.updateHistory = [];
    }
}
```

### Update Request Structure
```javascript
class UpdateRequest {
    constructor(objectId, updateType, changeData, priority = UpdatePriority.NORMAL) {
        this.id = this.generateId();
        this.objectId = objectId;
        this.updateType = updateType;
        this.changeData = changeData;
        this.priority = priority;
        this.timestamp = Date.now();
        this.dependencies = new Set(); // Objects that must update after this one
        this.isProcessed = false;
        this.processingTime = 0;
    }

    generateId() {
        return `update_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
}
```

### Change Data Examples
```javascript
// Size change data
{
    property: 'width',
    oldValue: 100,
    newValue: 150,
    affectedAxes: ['x'],
    triggerReason: 'user_modification'
}

// Layout configuration change
{
    layoutProperty: 'direction',
    oldValue: 'x',
    newValue: 'y',
    affectedChildren: ['obj1', 'obj2', 'obj3'],
    requiresFullRecalculation: true
}

// Formula-driven change
{
    formulaExpression: 'containerWidth * 0.5',
    sourceObjectId: 'container_001',
    sourceProperty: 'width',
    evaluatedValue: 200,
    dependentFormulas: ['obj2.height', 'obj3.position.x']
}
```

## Core Operations

### 1. Propagate Change
```javascript
propagateChange(objectId, updateType, changeData, priority = UpdatePriority.NORMAL) {
    const updateRequest = new UpdateRequest(objectId, updateType, changeData, priority);

    // Calculate dependency chain
    const propagationPath = this.dependencyGraph.calculatePropagationPath(objectId);
    updateRequest.dependencies = this.extractDependencies(propagationPath);

    // Queue the update
    this.updateQueue.enqueue(updateRequest);

    // Schedule processing
    this.scheduleProcessing();

    return updateRequest.id;
}

scheduleProcessing() {
    if (this.frameRequestId) return;

    this.frameRequestId = requestAnimationFrame(() => {
        this.processUpdateQueue();
        this.frameRequestId = null;
    });
}
```

### 2. Process Update Queue
```javascript
async processUpdateQueue() {
    if (this.isUpdating) return;

    this.isUpdating = true;
    const startTime = performance.now();
    const updateChain = [];

    try {
        while (!this.updateQueue.isEmpty()) {
            const updateRequest = this.updateQueue.dequeue();

            if (updateRequest.isProcessed) continue;

            const updateResult = await this.processUpdateRequest(updateRequest);
            updateChain.push(updateResult);

            // Check if this update spawned additional updates
            if (updateResult.additionalUpdates) {
                updateResult.additionalUpdates.forEach(additionalUpdate => {
                    this.updateQueue.enqueue(additionalUpdate);
                });
            }
        }

        // Batch process any remaining container bounds updates
        await this.processBatchedBoundsUpdates();

    } finally {
        this.isUpdating = false;
        this.updateMetrics(startTime, updateChain);
    }
}

async processUpdateRequest(updateRequest) {
    const startTime = performance.now();

    try {
        const result = await this.executeUpdate(updateRequest);
        updateRequest.isProcessed = true;
        updateRequest.processingTime = performance.now() - startTime;

        return {
            requestId: updateRequest.id,
            objectId: updateRequest.objectId,
            success: true,
            result: result,
            additionalUpdates: this.generateCascadeUpdates(updateRequest, result)
        };

    } catch (error) {
        console.error(`Update failed for ${updateRequest.objectId}:`, error);
        return {
            requestId: updateRequest.id,
            objectId: updateRequest.objectId,
            success: false,
            error: error.message
        };
    }
}
```

### 3. Execute Update
```javascript
async executeUpdate(updateRequest) {
    const { objectId, updateType, changeData } = updateRequest;

    switch (updateType) {
        case UpdateType.SIZE_CHANGE:
            return await this.processSizeChange(objectId, changeData);

        case UpdateType.LAYOUT_CONFIG:
            return await this.processLayoutConfigChange(objectId, changeData);

        case UpdateType.HIERARCHY_CHANGE:
            return await this.processHierarchyChange(objectId, changeData);

        case UpdateType.PROPERTY_CHANGE:
            return await this.processPropertyChange(objectId, changeData);

        default:
            throw new Error(`Unknown update type: ${updateType}`);
    }
}

async processSizeChange(objectId, changeData) {
    const objectData = this.sceneController.getObject(objectId);
    if (!objectData) throw new Error(`Object not found: ${objectId}`);

    // Update object size
    const oldBounds = this.calculateObjectBounds(objectData);
    this.updateObjectSize(objectData, changeData);
    const newBounds = this.calculateObjectBounds(objectData);

    // Check if this affects parent container
    if (objectData.parentContainer) {
        await this.updateParentContainerBounds(objectData.parentContainer, {
            childId: objectId,
            oldBounds,
            newBounds,
            boundsChanged: !this.boundsEqual(oldBounds, newBounds)
        });
    }

    return {
        oldBounds,
        newBounds,
        parentContainer: objectData.parentContainer,
        requiresVisualUpdate: true
    };
}

async processLayoutConfigChange(objectId, changeData) {
    const containerData = this.sceneController.getObject(objectId);
    if (!containerData || !containerData.isContainer) {
        throw new Error(`Container not found: ${objectId}`);
    }

    // Update layout configuration
    this.updateContainerLayoutConfig(containerData, changeData);

    // Recalculate layout for all children
    const children = this.getContainerChildren(objectId);
    const layoutResult = this.layoutEngine.calculateLayout(
        children,
        containerData.autoLayout,
        this.getContainerSize(containerData)
    );

    // Apply new positions and sizes
    await this.applyLayoutResult(objectId, children, layoutResult);

    // Update container bounds if needed
    if (containerData.autoLayout.sizingMode === 'shrink_to_fit') {
        await this.updateContainerBoundsFromChildren(objectId);
    }

    return {
        affectedChildren: children.map(child => child.id),
        layoutResult,
        requiresVisualUpdate: true
    };
}
```

### 4. Cascade Update Generation
```javascript
generateCascadeUpdates(originalRequest, updateResult) {
    const cascadeUpdates = [];

    // Get objects that depend on the updated object
    const dependentObjects = this.dependencyGraph.getAffectedObjects(originalRequest.objectId);

    for (const dependentId of dependentObjects) {
        const dependency = this.dependencyGraph.getDependency(originalRequest.objectId, dependentId);

        if (dependency.type === 'layout') {
            // Generate layout update for dependent object
            cascadeUpdates.push(new UpdateRequest(
                dependentId,
                UpdateType.LAYOUT_CONFIG,
                {
                    triggerSource: originalRequest.objectId,
                    triggerData: updateResult
                },
                UpdatePriority.HIGH
            ));

        } else if (dependency.type === 'formula') {
            // Generate formula evaluation update
            cascadeUpdates.push(new UpdateRequest(
                dependentId,
                UpdateType.PROPERTY_CHANGE,
                {
                    formulaDependency: dependency,
                    sourceChange: updateResult
                },
                UpdatePriority.NORMAL
            ));
        }
    }

    return cascadeUpdates;
}
```

## Performance Optimizations

### 1. Batched Bounds Updates
```javascript
processBatchedBoundsUpdates() {
    const containerUpdates = new Map();

    // Group updates by container
    for (const [objectId, updates] of this.batchUpdates) {
        const objectData = this.sceneController.getObject(objectId);
        if (objectData && objectData.parentContainer) {
            const containerId = objectData.parentContainer;
            if (!containerUpdates.has(containerId)) {
                containerUpdates.set(containerId, []);
            }
            containerUpdates.get(containerId).push({objectId, updates});
        }
    }

    // Process each container's updates as a batch
    const promises = [];
    for (const [containerId, childUpdates] of containerUpdates) {
        promises.push(this.updateContainerBoundsFromMultipleChildren(containerId, childUpdates));
    }

    this.batchUpdates.clear();
    return Promise.all(promises);
}
```

### 2. Calculation Caching
```javascript
getCachedCalculation(cacheKey, calculationFn) {
    if (this.calculationCache.has(cacheKey)) {
        const cached = this.calculationCache.get(cacheKey);
        if (Date.now() - cached.timestamp < 5000) { // 5 second cache
            return cached.result;
        }
    }

    const result = calculationFn();
    this.calculationCache.set(cacheKey, {
        result,
        timestamp: Date.now()
    });

    return result;
}

clearCalculationCache(objectId) {
    // Clear caches that might be affected by changes to this object
    for (const [cacheKey, _] of this.calculationCache) {
        if (cacheKey.includes(objectId)) {
            this.calculationCache.delete(cacheKey);
        }
    }
}
```

### 3. Debounced Updates
```javascript
debounceUpdates(objectId, updateType, changeData, debounceMs = 16) {
    const debounceKey = `${objectId}:${updateType}`;

    // Cancel previous debounced update
    if (this.debounceTimers.has(debounceKey)) {
        clearTimeout(this.debounceTimers.get(debounceKey));
    }

    // Schedule new debounced update
    const timerId = setTimeout(() => {
        this.propagateChange(objectId, updateType, changeData, UpdatePriority.NORMAL);
        this.debounceTimers.delete(debounceKey);
    }, debounceMs);

    this.debounceTimers.set(debounceKey, timerId);
}
```

## Integration Points

### Scene Controller Integration
```javascript
// Extend SceneController to automatically trigger propagation
class SceneController {
    updateObjectProperty(objectId, property, value) {
        const oldValue = this.getObjectProperty(objectId, property);
        const result = super.updateObjectProperty(objectId, property, value);

        // Determine if this property affects layout
        if (this.isLayoutAffectingProperty(property)) {
            this.layoutPropagationEngine.propagateChange(
                objectId,
                UpdateType.PROPERTY_CHANGE,
                { property, oldValue, newValue: value },
                UpdatePriority.IMMEDIATE
            );
        }

        return result;
    }

    setObjectSize(objectId, newSize) {
        const objectData = this.getObject(objectId);
        const oldSize = this.getObjectSize(objectData);

        super.setObjectSize(objectId, newSize);

        this.layoutPropagationEngine.propagateChange(
            objectId,
            UpdateType.SIZE_CHANGE,
            { oldSize, newSize },
            UpdatePriority.IMMEDIATE
        );
    }
}
```

### Property Update Handler Integration
```javascript
class PropertyUpdateHandler {
    handlePropertyUpdate(objectId, property, value) {
        // Update the property
        this.sceneController.updateObjectProperty(objectId, property, value);

        // The propagation is automatically triggered by SceneController
        // No need for manual propagation here
    }

    handleLayoutConfigUpdate(containerId, layoutConfig) {
        this.layoutPropagationEngine.propagateChange(
            containerId,
            UpdateType.LAYOUT_CONFIG,
            { layoutConfig },
            UpdatePriority.HIGH
        );
    }
}
```

## Debug and Monitoring

### Update Chain Visualization
```javascript
getUpdateChainVisualization(requestId) {
    const chain = this.updateHistory.find(h => h.requestId === requestId);
    if (!chain) return null;

    return {
        originalRequest: chain.originalRequest,
        updatePath: chain.updatePath,
        totalObjects: chain.affectedObjects.length,
        totalTime: chain.totalTime,
        steps: chain.steps.map(step => ({
            objectId: step.objectId,
            updateType: step.updateType,
            processingTime: step.processingTime,
            cascadeCount: step.cascadeUpdates.length
        }))
    };
}
```

### Performance Metrics
```javascript
getPerformanceMetrics() {
    return {
        queueSize: this.updateQueue.size(),
        avgProcessingTime: this.metrics.avgUpdateTime,
        maxCascadeDepth: this.metrics.maxCascadeDepth,
        cacheHitRate: this.calculateCacheHitRate(),
        totalUpdatesProcessed: this.metrics.totalUpdates,
        memoryUsage: this.estimateMemoryUsage()
    };
}
```

## File Structure
```
/application/systems/
├── layout-propagation-engine.js     # Main engine class
├── update-request.js                # UpdateRequest class
├── priority-queue.js                # Priority queue implementation
└── propagation-constants.js         # Constants and enums
```

## Usage Examples

### Container Size Changes
```javascript
// When user resizes a container
propagationEngine.propagateChange(
    containerId,
    UpdateType.SIZE_CHANGE,
    {
        property: 'size',
        oldValue: { x: 100, y: 200, z: 50 },
        newValue: { x: 150, y: 200, z: 50 }
    },
    UpdatePriority.IMMEDIATE
);
```

### Layout Configuration Updates
```javascript
// When user changes layout direction
propagationEngine.propagateChange(
    containerId,
    UpdateType.LAYOUT_CONFIG,
    {
        layoutProperty: 'direction',
        oldValue: 'x',
        newValue: 'y',
        requiresFullRecalculation: true
    },
    UpdatePriority.HIGH
);
```

### Hierarchy Changes
```javascript
// When moving object to different container
propagationEngine.propagateChange(
    objectId,
    UpdateType.HIERARCHY_CHANGE,
    {
        oldParent: oldContainerId,
        newParent: newContainerId,
        requiresBoundsUpdate: true
    },
    UpdatePriority.HIGH
);
```

This layout propagation engine provides efficient, ordered updates through complex container hierarchies while maintaining performance and providing detailed debugging capabilities.