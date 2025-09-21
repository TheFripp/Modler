# Enhanced Property Update Handler Design

## Overview
The PropertyUpdateHandler serves as the orchestrator between the property panel UI and the backend systems (DependencyGraph, LayoutPropagationEngine, FormulaEngine), ensuring property changes are properly validated, processed, and propagated through the system.

## Core Concepts

### Property Categories
```javascript
const PropertyCategory = {
    LAYOUT: 'layout',           // direction, gap, padding, sizing mode
    SIZING: 'sizing',           // sizeX, sizeY, sizeZ, fixedSize
    PARAMETRIC: 'parametric',   // formula expressions, variables
    TRANSFORM: 'transform',     // position, rotation, scale
    VISUAL: 'visual',           // color, material, visibility
    TEMPLATE: 'template',       // component master/instance properties
    METADATA: 'metadata'        // name, tags, custom properties
};
```

### Property Types
```javascript
const PropertyType = {
    DIRECT: 'direct',           // Direct value assignment
    FORMULA: 'formula',         // Expression that needs evaluation
    REFERENCE: 'reference',     // Reference to another object's property
    COMPUTED: 'computed',       // Computed from other properties
    INHERITED: 'inherited'      // Inherited from template/parent
};
```

### Update Strategy
```javascript
const UpdateStrategy = {
    IMMEDIATE: 'immediate',     // Update immediately (user interaction)
    DEBOUNCED: 'debounced',     // Debounce rapid changes (formula editing)
    BATCHED: 'batched',         // Batch multiple related changes
    DEFERRED: 'deferred'        // Defer until explicitly committed
};
```

## Architecture Design

### PropertyUpdateHandler Class
```javascript
class PropertyUpdateHandler {
    constructor(sceneController, dependencyGraph, layoutPropagationEngine, formulaEngine) {
        this.sceneController = sceneController;
        this.dependencyGraph = dependencyGraph;
        this.layoutPropagationEngine = layoutPropagationEngine;
        this.formulaEngine = formulaEngine;

        // Property validation and processing
        this.propertyValidators = new Map();
        this.propertyProcessors = new Map();
        this.propertyPostProcessors = new Map();

        // Batching and debouncing
        this.updateBatches = new Map(); // objectId → Map<property, value>
        this.debounceTimers = new Map();
        this.batchTimeout = null;

        // Change tracking
        this.changeHistory = [];
        this.undoStack = [];
        this.redoStack = [];

        // Event handling
        this.eventListeners = new Map();

        this.initializePropertyHandlers();
    }

    initializePropertyHandlers() {
        this.registerPropertyValidators();
        this.registerPropertyProcessors();
        this.registerPropertyPostProcessors();
    }
}
```

### Property Update Request
```javascript
class PropertyUpdateRequest {
    constructor(objectId, property, value, options = {}) {
        this.id = this.generateId();
        this.objectId = objectId;
        this.property = property;
        this.newValue = value;
        this.oldValue = null; // Will be populated before processing

        // Options
        this.updateStrategy = options.updateStrategy || UpdateStrategy.IMMEDIATE;
        this.validateOnly = options.validateOnly || false;
        this.source = options.source || 'property_panel';
        this.batchId = options.batchId || null;

        // Processing metadata
        this.category = this.determinePropertyCategory(property);
        this.type = this.determinePropertyType(value);
        this.requiresDependencyUpdate = false;
        this.requiresLayoutPropagation = false;
        this.requiresFormulaEvaluation = false;

        // Validation and results
        this.isValid = false;
        this.validationErrors = [];
        this.processedValue = null;
        this.affectedObjects = [];

        this.timestamp = Date.now();
    }

    generateId() {
        return `prop_update_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    determinePropertyCategory(property) {
        if (['direction', 'gap', 'padding', 'sizingMode'].includes(property)) {
            return PropertyCategory.LAYOUT;
        }
        if (['sizeX', 'sizeY', 'sizeZ', 'fixedSize'].includes(property)) {
            return PropertyCategory.SIZING;
        }
        if (property.startsWith('formula_') || typeof this.newValue === 'string' && this.newValue.startsWith('=')) {
            return PropertyCategory.PARAMETRIC;
        }
        if (['position', 'rotation', 'scale'].includes(property)) {
            return PropertyCategory.TRANSFORM;
        }
        if (['color', 'material', 'visible'].includes(property)) {
            return PropertyCategory.VISUAL;
        }
        return PropertyCategory.METADATA;
    }

    determinePropertyType(value) {
        if (typeof value === 'string' && value.startsWith('=')) {
            return PropertyType.FORMULA;
        }
        if (typeof value === 'string' && value.includes('.')) {
            // Check if it's an object reference pattern
            const parts = value.split('.');
            if (parts.length === 2) {
                return PropertyType.REFERENCE;
            }
        }
        return PropertyType.DIRECT;
    }
}
```

## Core Operations

### 1. Handle Property Update
```javascript
async handlePropertyUpdate(objectId, property, value, options = {}) {
    const request = new PropertyUpdateRequest(objectId, property, value, options);

    try {
        // Step 1: Pre-validation
        await this.preValidateRequest(request);

        // Step 2: Determine update strategy
        const strategy = this.determineUpdateStrategy(request);
        request.updateStrategy = strategy;

        // Step 3: Process based on strategy
        switch (strategy) {
            case UpdateStrategy.IMMEDIATE:
                return await this.processImmediateUpdate(request);

            case UpdateStrategy.DEBOUNCED:
                return this.processDebouncedUpdate(request);

            case UpdateStrategy.BATCHED:
                return this.processBatchedUpdate(request);

            case UpdateStrategy.DEFERRED:
                return this.processDeferredUpdate(request);
        }

    } catch (error) {
        console.error(`Property update failed for ${objectId}.${property}:`, error);
        throw new PropertyUpdateError(error.message, request);
    }
}

async preValidateRequest(request) {
    // Get current object data
    const objectData = this.sceneController.getObject(request.objectId);
    if (!objectData) {
        throw new Error(`Object not found: ${request.objectId}`);
    }

    // Store old value for undo functionality
    request.oldValue = this.getObjectProperty(objectData, request.property);

    // Validate property exists and is modifiable
    if (!this.isPropertyModifiable(objectData, request.property)) {
        throw new Error(`Property '${request.property}' is not modifiable for object ${request.objectId}`);
    }

    // Run category-specific validators
    const validator = this.propertyValidators.get(request.category);
    if (validator) {
        const validationResult = await validator(request, objectData);
        request.isValid = validationResult.isValid;
        request.validationErrors = validationResult.errors;

        if (!request.isValid) {
            throw new Error(`Validation failed: ${validationResult.errors.join(', ')}`);
        }
    }
}
```

### 2. Process Update by Strategy
```javascript
async processImmediateUpdate(request) {
    // Step 1: Process the value
    await this.processPropertyValue(request);

    // Step 2: Apply the change
    await this.applyPropertyChange(request);

    // Step 3: Update dependencies
    await this.updateDependencies(request);

    // Step 4: Trigger propagation
    await this.triggerPropagation(request);

    // Step 5: Post-processing
    await this.runPostProcessors(request);

    // Step 6: Notify listeners
    this.notifyPropertyChanged(request);

    return {
        success: true,
        requestId: request.id,
        affectedObjects: request.affectedObjects,
        oldValue: request.oldValue,
        newValue: request.processedValue
    };
}

processDebouncedUpdate(request) {
    const debounceKey = `${request.objectId}:${request.property}`;

    // Clear existing debounce timer
    if (this.debounceTimers.has(debounceKey)) {
        clearTimeout(this.debounceTimers.get(debounceKey));
    }

    // Set new debounce timer
    const timerId = setTimeout(async () => {
        await this.processImmediateUpdate(request);
        this.debounceTimers.delete(debounceKey);
    }, this.getDebounceDelay(request.category));

    this.debounceTimers.set(debounceKey, timerId);

    return {
        success: true,
        requestId: request.id,
        status: 'debounced',
        willProcessIn: this.getDebounceDelay(request.category)
    };
}

processBatchedUpdate(request) {
    // Add to batch
    if (!this.updateBatches.has(request.objectId)) {
        this.updateBatches.set(request.objectId, new Map());
    }

    this.updateBatches.get(request.objectId).set(request.property, request);

    // Schedule batch processing
    this.scheduleBatchProcessing();

    return {
        success: true,
        requestId: request.id,
        status: 'batched',
        batchId: request.objectId
    };
}
```

### 3. Property Value Processing
```javascript
async processPropertyValue(request) {
    const processor = this.propertyProcessors.get(request.category);
    if (!processor) {
        // Default processing - use value as-is
        request.processedValue = request.newValue;
        return;
    }

    const processingResult = await processor(request);
    request.processedValue = processingResult.value;
    request.requiresDependencyUpdate = processingResult.requiresDependencyUpdate;
    request.requiresLayoutPropagation = processingResult.requiresLayoutPropagation;
    request.requiresFormulaEvaluation = processingResult.requiresFormulaEvaluation;
}

// Layout property processor
async processLayoutProperty(request) {
    const { property, newValue, objectId } = request;

    if (property === 'direction') {
        // Validate direction value
        const validDirections = ['x', 'y', 'z', 'xy', 'xyz'];
        if (!validDirections.includes(newValue)) {
            throw new Error(`Invalid layout direction: ${newValue}`);
        }

        return {
            value: newValue,
            requiresLayoutPropagation: true,
            requiresDependencyUpdate: false,
            requiresFormulaEvaluation: false
        };
    }

    if (property === 'gap' || property.startsWith('padding.')) {
        // Validate numeric value
        const numericValue = parseFloat(newValue);
        if (isNaN(numericValue) || numericValue < 0) {
            throw new Error(`Invalid ${property} value: ${newValue}`);
        }

        return {
            value: numericValue,
            requiresLayoutPropagation: true,
            requiresDependencyUpdate: false,
            requiresFormulaEvaluation: false
        };
    }

    return {
        value: newValue,
        requiresLayoutPropagation: true,
        requiresDependencyUpdate: false,
        requiresFormulaEvaluation: false
    };
}

// Parametric property processor
async processParametricProperty(request) {
    const { newValue, objectId } = request;

    if (request.type === PropertyType.FORMULA) {
        // Parse and validate formula
        const formula = newValue.startsWith('=') ? newValue.slice(1) : newValue;

        try {
            const parseResult = await this.formulaEngine.parseFormula(formula);
            const dependencies = parseResult.dependencies;

            // Register formula dependencies in dependency graph
            for (const dep of dependencies) {
                this.dependencyGraph.addDependency(
                    dep.objectId,
                    objectId,
                    'formula',
                    {
                        formulaExpression: formula,
                        targetProperty: request.property,
                        sourceProperty: dep.property
                    }
                );
            }

            // Evaluate formula to get initial value
            const evaluatedValue = await this.formulaEngine.evaluateFormula(formula, objectId);

            return {
                value: evaluatedValue,
                requiresDependencyUpdate: true,
                requiresLayoutPropagation: this.isLayoutAffectingProperty(request.property),
                requiresFormulaEvaluation: true,
                formulaMetadata: {
                    expression: formula,
                    dependencies: dependencies
                }
            };

        } catch (error) {
            throw new Error(`Formula parsing failed: ${error.message}`);
        }
    }

    return {
        value: newValue,
        requiresDependencyUpdate: false,
        requiresLayoutPropagation: false,
        requiresFormulaEvaluation: false
    };
}
```

### 4. Dependency and Propagation Updates
```javascript
async updateDependencies(request) {
    if (!request.requiresDependencyUpdate) return;

    // Remove old dependencies for this property
    this.dependencyGraph.removeDependenciesByTarget(request.objectId, request.property);

    // Add new dependencies based on processed value
    if (request.formulaMetadata) {
        for (const dep of request.formulaMetadata.dependencies) {
            this.dependencyGraph.addDependency(
                dep.objectId,
                request.objectId,
                'formula',
                {
                    formulaExpression: request.formulaMetadata.expression,
                    targetProperty: request.property,
                    sourceProperty: dep.property
                }
            );
        }
    }
}

async triggerPropagation(request) {
    if (!request.requiresLayoutPropagation) return;

    // Determine update type based on property category
    let updateType;
    switch (request.category) {
        case PropertyCategory.LAYOUT:
            updateType = 'layout_config';
            break;
        case PropertyCategory.SIZING:
            updateType = 'size_change';
            break;
        case PropertyCategory.TRANSFORM:
            updateType = 'position_change';
            break;
        default:
            updateType = 'property_change';
    }

    // Trigger layout propagation
    await this.layoutPropagationEngine.propagateChange(
        request.objectId,
        updateType,
        {
            property: request.property,
            oldValue: request.oldValue,
            newValue: request.processedValue,
            source: 'property_update'
        }
    );

    // Get affected objects for reporting
    request.affectedObjects = this.dependencyGraph.getAffectedObjects(request.objectId);
}
```

### 5. Batch Processing
```javascript
async processBatchUpdates() {
    const batchResults = [];

    for (const [objectId, propertyUpdates] of this.updateBatches) {
        try {
            const batchResult = await this.processSingleObjectBatch(objectId, propertyUpdates);
            batchResults.push(batchResult);
        } catch (error) {
            console.error(`Batch processing failed for object ${objectId}:`, error);
        }
    }

    this.updateBatches.clear();
    return batchResults;
}

async processSingleObjectBatch(objectId, propertyUpdates) {
    const updates = Array.from(propertyUpdates.values());

    // Sort updates by dependency order
    const sortedUpdates = this.sortUpdatesByDependencies(updates);

    const batchResult = {
        objectId,
        totalUpdates: updates.length,
        successCount: 0,
        errors: [],
        affectedObjects: new Set()
    };

    // Process each update in order
    for (const request of sortedUpdates) {
        try {
            await this.processPropertyValue(request);
            await this.applyPropertyChange(request);

            batchResult.successCount++;
            request.affectedObjects.forEach(obj => batchResult.affectedObjects.add(obj));

        } catch (error) {
            batchResult.errors.push({
                property: request.property,
                error: error.message
            });
        }
    }

    // Trigger propagation once for the entire batch
    if (batchResult.successCount > 0) {
        await this.triggerBatchPropagation(objectId, sortedUpdates);
    }

    return batchResult;
}
```

## Integration Points

### Property Panel Integration
```javascript
// Property panel UI integration
class PropertyPanelHandler {
    constructor(propertyUpdateHandler) {
        this.propertyUpdateHandler = propertyUpdateHandler;
        this.setupEventListeners();
    }

    setupEventListeners() {
        // Listen for property input changes
        document.addEventListener('property-input-change', async (event) => {
            const { objectId, property, value } = event.detail;

            try {
                await this.propertyUpdateHandler.handlePropertyUpdate(
                    objectId,
                    property,
                    value,
                    { source: 'property_panel' }
                );

                this.showUpdateSuccess(property);

            } catch (error) {
                this.showUpdateError(property, error.message);
            }
        });

        // Listen for batch property changes
        document.addEventListener('property-batch-update', async (event) => {
            const { objectId, properties } = event.detail;

            const batchId = this.generateBatchId();

            for (const [property, value] of Object.entries(properties)) {
                await this.propertyUpdateHandler.handlePropertyUpdate(
                    objectId,
                    property,
                    value,
                    {
                        source: 'property_panel',
                        updateStrategy: UpdateStrategy.BATCHED,
                        batchId
                    }
                );
            }
        });
    }
}
```

### Formula Editor Integration
```javascript
// Formula editor specific handling
class FormulaEditorHandler {
    constructor(propertyUpdateHandler) {
        this.propertyUpdateHandler = propertyUpdateHandler;
    }

    async handleFormulaChange(objectId, property, formulaText) {
        // Use debounced strategy for formula editing
        return await this.propertyUpdateHandler.handlePropertyUpdate(
            objectId,
            property,
            formulaText,
            {
                source: 'formula_editor',
                updateStrategy: UpdateStrategy.DEBOUNCED
            }
        );
    }

    async validateFormula(formulaText) {
        // Validate without applying changes
        return await this.propertyUpdateHandler.handlePropertyUpdate(
            'temp_object',
            'temp_property',
            formulaText,
            {
                validateOnly: true,
                source: 'formula_validation'
            }
        );
    }
}
```

## File Structure
```
/application/handlers/
├── property-update-handler.js       # Main handler class
├── property-update-request.js       # Request class
├── property-validators.js           # Validation functions
├── property-processors.js           # Processing functions
└── property-constants.js            # Constants and enums
```

## Usage Examples

### Direct Property Update
```javascript
// User changes container gap in property panel
await propertyUpdateHandler.handlePropertyUpdate(
    'container_001',
    'gap',
    20,
    { source: 'property_panel' }
);
```

### Formula Property Update
```javascript
// User enters formula in property panel
await propertyUpdateHandler.handlePropertyUpdate(
    'object_001',
    'width',
    '=container.width * 0.5',
    {
        source: 'property_panel',
        updateStrategy: UpdateStrategy.DEBOUNCED
    }
);
```

### Batch Property Update
```javascript
// User modifies multiple properties simultaneously
const properties = {
    direction: 'y',
    gap: 15,
    'padding.top': 10,
    'padding.bottom': 10
};

for (const [property, value] of Object.entries(properties)) {
    await propertyUpdateHandler.handlePropertyUpdate(
        'container_001',
        property,
        value,
        { updateStrategy: UpdateStrategy.BATCHED }
    );
}
```

This enhanced PropertyUpdateHandler provides a robust, coordinated approach to property management that integrates seamlessly with the dependency graph and layout propagation systems while supporting complex parametric design workflows.