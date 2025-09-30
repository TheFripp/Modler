/**
 * PropertySchemaRegistry - Extensible Property Definition System
 *
 * Central registry for property schemas supporting parametric design and component instancing.
 * Enables any system to register custom property types with validation, constraints, and UI metadata.
 *
 * Key Features:
 * - Extensible property type definitions
 * - Parametric property support with constraints and formulas
 * - Component instancing with master-instance relationships
 * - UI metadata for dynamic form generation
 * - Validation and type checking
 * - Plugin integration support
 */

class PropertySchemaRegistry {
    constructor() {
        // Core property schemas
        this.schemas = new Map();

        // Property type validators
        this.validators = new Map();

        // UI renderers for different property types
        this.uiRenderers = new Map();

        // Parametric relationship tracking
        this.parameterDependencies = new Map(); // parameterId -> Set<dependent objects>
        this.formulaRegistry = new Map(); // formulaId -> { expression, dependencies }

        // Component instancing tracking
        this.masterInstances = new Map(); // masterId -> Set<instance objects>
        this.instanceMasters = new Map(); // instanceId -> masterId

        // Parametric systems integration
        this.formulaEvaluator = null;
        this.dependencyGraph = null;
        this.constraintSolver = null;

        // Statistics
        this.stats = {
            registeredSchemas: 0,
            parametricProperties: 0,
            instanceRelationships: 0,
            formulaEvaluations: 0
        };

        // Initialize parametric systems
        this.initializeParametricSystems();

        // Initialize with core CAD property schemas
        this.initializeCoreSchemas();
    }

    /**
     * Initialize parametric evaluation systems
     * @private
     */
    initializeParametricSystems() {
        // Create formula evaluator
        if (window.FormulaEvaluator) {
            this.formulaEvaluator = new window.FormulaEvaluator();
        } else {
            console.warn('PropertySchemaRegistry: FormulaEvaluator not available');
        }

        // Create dependency graph
        if (window.DependencyGraph) {
            this.dependencyGraph = new window.DependencyGraph();
        } else {
            console.warn('PropertySchemaRegistry: DependencyGraph not available');
        }

        // Create constraint solver
        if (window.ConstraintSolver) {
            this.constraintSolver = new window.ConstraintSolver();
        } else {
            console.warn('PropertySchemaRegistry: ConstraintSolver not available');
        }
    }

    /**
     * Register a new property schema
     * @param {string} propertyName - Name of the property (e.g., 'dimensions.width')
     * @param {Object} schema - Property schema definition
     */
    registerSchema(propertyName, schema) {
        const fullSchema = {
            name: propertyName,
            type: schema.type || 'number',
            constraints: schema.constraints || {},
            parametric: schema.parametric || false,
            metadata: schema.metadata || {},
            validator: schema.validator || null,
            uiRenderer: schema.uiRenderer || 'default',
            ...schema
        };

        this.schemas.set(propertyName, fullSchema);

        // Register validator if provided
        if (schema.validator) {
            this.validators.set(propertyName, schema.validator);
        }

        // Register UI renderer if provided
        if (schema.uiRenderer && typeof schema.uiRenderer === 'function') {
            this.uiRenderers.set(propertyName, schema.uiRenderer);
        }

        this.stats.registeredSchemas++;

        if (fullSchema.parametric) {
            this.stats.parametricProperties++;
        }
    }

    /**
     * Get property schema by name
     * @param {string} propertyName - Property name
     * @returns {Object|null} Property schema or null if not found
     */
    getSchema(propertyName) {
        return this.schemas.get(propertyName) || null;
    }

    /**
     * Get all schemas matching a pattern
     * @param {string} pattern - Pattern to match (supports wildcards)
     * @returns {Array<Object>} Array of matching schemas
     */
    getSchemasMatching(pattern) {
        const regex = new RegExp(pattern.replace(/\*/g, '.*'));
        const matches = [];

        for (const [name, schema] of this.schemas.entries()) {
            if (regex.test(name)) {
                matches.push(schema);
            }
        }

        return matches;
    }

    /**
     * Create parametric property with constraints and dependencies
     * @param {string} objectId - ID of object with parametric property
     * @param {string} parameterName - Name of the parameter
     * @param {Object} config - Parameter configuration
     */
    createParametricProperty(objectId, parameterName, config) {
        const {
            value,
            constraints = {},
            drives = [],
            formula = null,
            exposed = true,
            unit = null
        } = config;

        const parameterId = `${objectId}.${parameterName}`;

        // Register parameter dependencies
        const dependencySet = new Set(drives);
        this.parameterDependencies.set(parameterId, dependencySet);

        // Register in dependency graph
        if (this.dependencyGraph) {
            this.dependencyGraph.addNode(parameterId, {
                type: 'parameter',
                objectId,
                parameterName,
                value,
                unit
            });

            // Add edges for all driven properties
            for (const drivenProperty of drives) {
                const success = this.dependencyGraph.addDependency(parameterId, drivenProperty);
                if (!success) {
                    console.error('PropertySchemaRegistry: Cannot create dependency - would create cycle:',
                        parameterId, '->', drivenProperty);
                }
            }
        }

        // Register formula if provided
        if (formula) {
            // Validate and extract dependencies
            const formulaDeps = this.formulaEvaluator ?
                this.formulaEvaluator.extractDependencies(formula) :
                this.extractFormulaDependencies(formula);

            this.formulaRegistry.set(parameterId, {
                expression: formula,
                dependencies: formulaDeps
            });

            // Validate formula if evaluator available
            if (this.formulaEvaluator) {
                const testContext = {};
                for (const dep of formulaDeps) {
                    testContext[dep] = 1; // Test with dummy value
                }
                const validation = this.formulaEvaluator.validateFormula(formula, testContext);
                if (!validation.valid) {
                    console.warn('PropertySchemaRegistry: Formula validation warning:', validation.error);
                }
            }
        }

        // Emit parametric property creation event
        if (window.objectEventBus) {
            window.objectEventBus.emit(
                window.objectEventBus.EVENT_TYPES.PARAMETRIC_UPDATE,
                objectId,
                {
                    action: 'create',
                    parameter: parameterName,
                    value: value,
                    constraints: constraints,
                    drives: drives,
                    formula: formula,
                    exposed: exposed,
                    unit: unit
                },
                { source: 'PropertySchemaRegistry' }
            );
        }

        return parameterId;
    }

    /**
     * Update parametric property value with constraint checking
     * @param {string} parameterId - Parameter ID
     * @param {*} newValue - New parameter value
     * @returns {boolean} Success status
     */
    updateParametricProperty(parameterId, newValue) {
        const dependencies = this.parameterDependencies.get(parameterId);
        if (!dependencies) {
            console.warn('PropertySchemaRegistry: Parametric property not found:', parameterId);
            return false;
        }

        try {
            // Get object and parameter name
            const [objectId, parameterName] = parameterId.split('.');

            // Validate against constraints
            if (!this.validateParametricValue(parameterId, newValue)) {
                return false;
            }

            // Emit parametric update event
            if (window.objectEventBus) {
                window.objectEventBus.emit(
                    window.objectEventBus.EVENT_TYPES.PARAMETRIC_UPDATE,
                    objectId,
                    {
                        action: 'update',
                        parameter: parameterName,
                        oldValue: null, // Could be tracked if needed
                        newValue: newValue,
                        affectedObjects: Array.from(dependencies)
                    },
                    { source: 'PropertySchemaRegistry' }
                );
            }

            // Propagate changes to dependent objects with proper ordering
            this.propagateParametricChange(parameterId, newValue);

            this.stats.formulaEvaluations++;

            return true;

        } catch (error) {
            console.error('PropertySchemaRegistry.updateParametricProperty error:', error);
            return false;
        }
    }

    /**
     * Create component instance relationship
     * @param {string} instanceId - Instance object ID
     * @param {string} masterId - Master component ID
     * @returns {boolean} Success status
     */
    createInstanceRelationship(instanceId, masterId) {
        try {
            // Track master -> instances relationship
            if (!this.masterInstances.has(masterId)) {
                this.masterInstances.set(masterId, new Set());
            }
            this.masterInstances.get(masterId).add(instanceId);

            // Track instance -> master relationship
            this.instanceMasters.set(instanceId, masterId);

            this.stats.instanceRelationships++;

            // Emit instance relationship creation event
            if (window.objectEventBus) {
                window.objectEventBus.emit(
                    window.objectEventBus.EVENT_TYPES.INSTANCE_UPDATE,
                    instanceId,
                    {
                        action: 'create_relationship',
                        masterId: masterId,
                        instanceId: instanceId
                    },
                    { source: 'PropertySchemaRegistry' }
                );
            }

            return true;

        } catch (error) {
            console.error('PropertySchemaRegistry.createInstanceRelationship error:', error);
            return false;
        }
    }

    /**
     * Propagate master component changes to all instances
     * @param {string} masterId - Master component ID
     * @param {Object} changeData - Change information
     */
    propagateMasterChange(masterId, changeData) {
        const instances = this.masterInstances.get(masterId);
        if (!instances || instances.size === 0) {
            return;
        }

        try {
            // Emit master change event
            if (window.objectEventBus) {
                window.objectEventBus.emit(
                    window.objectEventBus.EVENT_TYPES.MASTER_CHANGE,
                    masterId,
                    {
                        ...changeData,
                        affectedInstances: Array.from(instances)
                    },
                    { source: 'PropertySchemaRegistry' }
                );
            }

            // Emit individual instance update events
            for (const instanceId of instances) {
                if (window.objectEventBus) {
                    window.objectEventBus.emit(
                        window.objectEventBus.EVENT_TYPES.INSTANCE_UPDATE,
                        instanceId,
                        {
                            action: 'sync_from_master',
                            masterId: masterId,
                            changeData: changeData
                        },
                        { source: 'PropertySchemaRegistry' }
                    );
                }
            }

        } catch (error) {
            console.error('PropertySchemaRegistry.propagateMasterChange error:', error);
        }
    }

    /**
     * Initialize core CAD property schemas
     * @private
     */
    initializeCoreSchemas() {
        // Basic transform properties
        this.registerSchema('position.x', {
            type: 'number',
            unit: 'units',
            constraints: { min: -1000, max: 1000 },
            metadata: { label: 'X Position', category: 'Transform' }
        });

        this.registerSchema('position.y', {
            type: 'number',
            unit: 'units',
            constraints: { min: -1000, max: 1000 },
            metadata: { label: 'Y Position', category: 'Transform' }
        });

        this.registerSchema('position.z', {
            type: 'number',
            unit: 'units',
            constraints: { min: -1000, max: 1000 },
            metadata: { label: 'Z Position', category: 'Transform' }
        });

        // Dimension properties with parametric support
        this.registerSchema('dimensions.x', {
            type: 'number',
            unit: 'units',
            constraints: { min: 0.1, max: 1000 },
            parametric: true,
            metadata: { label: 'Width', category: 'Dimensions' }
        });

        this.registerSchema('dimensions.y', {
            type: 'number',
            unit: 'units',
            constraints: { min: 0.1, max: 1000 },
            parametric: true,
            metadata: { label: 'Height', category: 'Dimensions' }
        });

        this.registerSchema('dimensions.z', {
            type: 'number',
            unit: 'units',
            constraints: { min: 0.1, max: 1000 },
            parametric: true,
            metadata: { label: 'Depth', category: 'Dimensions' }
        });

        // Material properties
        this.registerSchema('material.color', {
            type: 'color',
            metadata: { label: 'Color', category: 'Material' }
        });

        this.registerSchema('material.opacity', {
            type: 'number',
            constraints: { min: 0, max: 1 },
            metadata: { label: 'Opacity', category: 'Material' }
        });

        // Parametric properties for common use cases
        this.registerSchema('parametric.chairHeight', {
            type: 'number',
            unit: 'inches',
            constraints: { min: 24, max: 48 },
            parametric: true,
            metadata: {
                label: 'Chair Height',
                category: 'Parametric',
                description: 'Overall height of chair - drives leg and seat heights'
            }
        });

        this.registerSchema('parametric.woodThickness', {
            type: 'number',
            unit: 'inches',
            constraints: { min: 0.125, max: 2 },
            parametric: true,
            metadata: {
                label: 'Wood Thickness',
                category: 'Parametric',
                description: 'Standard wood thickness - constrains depth of components'
            }
        });

        // Component type definitions
        this.registerSchema('component.type', {
            type: 'enum',
            options: ['drawer', 'shelf', 'leg', 'custom'],
            metadata: { label: 'Component Type', category: 'Component' }
        });

        this.registerSchema('component.master', {
            type: 'reference',
            metadata: { label: 'Master Component', category: 'Component' }
        });
    }

    /**
     * Validate parametric property value against constraints
     * @private
     */
    validateParametricValue(parameterId, value) {
        const [objectId, parameterName] = parameterId.split('.');
        const schema = this.getSchema(`parametric.${parameterName}`) ||
                      this.getSchema(`dimensions.${parameterName}`) ||
                      this.getSchema(parameterName);

        if (!schema || !schema.constraints) {
            return true; // No constraints to validate
        }

        const { min, max, options } = schema.constraints;

        // Number constraints
        if (typeof value === 'number') {
            if (min !== undefined && value < min) return false;
            if (max !== undefined && value > max) return false;
        }

        // Enum constraints
        if (options && Array.isArray(options)) {
            if (!options.includes(value)) return false;
        }

        return true;
    }

    /**
     * Propagate parametric change to dependent objects
     * @private
     */
    propagateParametricChange(parameterId, newValue) {
        const dependencies = this.parameterDependencies.get(parameterId);
        if (!dependencies) return;

        // Get update order from dependency graph
        let updateOrder = Array.from(dependencies);
        if (this.dependencyGraph) {
            updateOrder = this.dependencyGraph.getUpdateOrder(parameterId);
        }

        // Build context for formula evaluation
        const context = { [parameterId.split('.')[1]]: newValue };

        // Update each dependent property in order
        for (const dependentProperty of updateOrder) {
            try {
                // Get formula for this dependent property
                const formulaData = this.formulaRegistry.get(dependentProperty);

                if (formulaData && this.formulaEvaluator) {
                    // Evaluate formula with current context
                    const evaluatedValue = this.formulaEvaluator.evaluate(
                        formulaData.expression,
                        context
                    );

                    if (evaluatedValue !== null) {
                        // Update context for next property
                        const [, propName] = dependentProperty.split('.');
                        context[propName] = evaluatedValue;

                        // Emit update event with evaluated value
                        if (window.objectEventBus) {
                            const [objId] = dependentProperty.split('.');
                            window.objectEventBus.emit(
                                window.objectEventBus.EVENT_TYPES.FORMULA_UPDATE,
                                objId,
                                {
                                    property: propName,
                                    value: evaluatedValue,
                                    formula: formulaData.expression,
                                    sourceParameter: parameterId
                                },
                                { source: 'PropertySchemaRegistry.propagateParametricChange' }
                            );
                        }
                    }
                } else {
                    // No formula - emit basic dependency update
                    if (window.objectEventBus) {
                        window.objectEventBus.emit(
                            window.objectEventBus.EVENT_TYPES.DEPENDENCY_UPDATE,
                            parameterId.split('.')[0],
                            {
                                sourceParameter: parameterId,
                                dependentProperty: dependentProperty,
                                newValue: newValue
                            },
                            { source: 'PropertySchemaRegistry' }
                        );
                    }
                }
            } catch (error) {
                console.error('PropertySchemaRegistry.propagateParametricChange: Error updating', dependentProperty, error);
            }
        }
    }

    /**
     * Extract dependencies from formula expression
     * @private
     */
    extractFormulaDependencies(formula) {
        // Simple regex to find property references like 'container.width', 'parent.height'
        const dependencyRegex = /(\w+\.\w+)/g;
        const matches = formula.match(dependencyRegex) || [];
        return [...new Set(matches)]; // Remove duplicates
    }

    /**
     * Get registry statistics
     * @returns {Object} Statistics object
     */
    getStats() {
        return {
            ...this.stats,
            totalSchemas: this.schemas.size,
            validators: this.validators.size,
            uiRenderers: this.uiRenderers.size,
            activeDependencies: this.parameterDependencies.size,
            formulas: this.formulaRegistry.size,
            masterComponents: this.masterInstances.size,
            instanceRelationships: this.instanceMasters.size
        };
    }

    /**
     * Dispose of the registry and clean up resources
     */
    dispose() {
        this.schemas.clear();
        this.validators.clear();
        this.uiRenderers.clear();
        this.parameterDependencies.clear();
        this.formulaRegistry.clear();
        this.masterInstances.clear();
        this.instanceMasters.clear();

        Object.keys(this.stats).forEach(key => this.stats[key] = 0);
    }
}

// Export for use in main application
window.PropertySchemaRegistry = PropertySchemaRegistry;

// Create global instance
window.propertySchemaRegistry = new PropertySchemaRegistry();