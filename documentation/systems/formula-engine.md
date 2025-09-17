# Formula Engine Design

## Overview
The FormulaEngine provides safe, sandboxed evaluation of parametric expressions, enabling objects to dynamically calculate dimensions, positions, and other properties based on variables, object references, and mathematical expressions.

## Core Concepts

### Expression Types
```javascript
const ExpressionType = {
    LITERAL: 'literal',           // Direct values: 100, "text", true
    VARIABLE: 'variable',         // Variables: $spacing, containerWidth
    OBJECT_REFERENCE: 'object_ref', // Object.property: Object1.width
    FUNCTION: 'function',         // Functions: max(a, b), sin(angle)
    ARITHMETIC: 'arithmetic',     // Math operations: +, -, *, /, %
    LOGICAL: 'logical',          // Logical operations: &&, ||, !
    COMPARISON: 'comparison',     // Comparisons: ==, !=, <, >, <=, >=
    CONDITIONAL: 'conditional'    // Ternary: condition ? true : false
};
```

### Variable Scope
```javascript
const VariableScope = {
    GLOBAL: 'global',            // Available to all objects
    CONTAINER: 'container',      // Available to container children
    LOCAL: 'local',              // Available to single object
    TEMPLATE: 'template'         // Available to template instances
};
```

### Formula Context
```javascript
const FormulaContext = {
    SIZING: 'sizing',            // Width, height, depth calculations
    POSITIONING: 'positioning',   // X, Y, Z position calculations
    LAYOUT: 'layout',            // Gap, padding, alignment
    VISUAL: 'visual',            // Color, opacity, material properties
    CONDITIONAL: 'conditional'    // Visibility, state changes
};
```

## Architecture Design

### FormulaEngine Class
```javascript
class FormulaEngine {
    constructor(sceneController, dependencyGraph) {
        this.sceneController = sceneController;
        this.dependencyGraph = dependencyGraph;

        // Expression parsing and evaluation
        this.parser = new ExpressionParser();
        this.evaluator = new ExpressionEvaluator();
        this.validator = new FormulaValidator();

        // Variable management
        this.variableManager = new VariableManager();

        // Function registry
        this.functionRegistry = new Map();
        this.registerBuiltinFunctions();

        // Security and performance
        this.evaluationTimeout = 5000; // 5 second max evaluation time
        this.maxRecursionDepth = 50;
        this.evaluationCache = new Map();

        // Debug and metrics
        this.evaluationHistory = [];
        this.performanceMetrics = {
            totalEvaluations: 0,
            avgEvaluationTime: 0,
            cacheHitRate: 0,
            failureRate: 0
        };
    }
}
```

### Formula Class
```javascript
class Formula {
    constructor(expression, context, objectId) {
        this.id = this.generateId();
        this.expression = expression.trim();
        this.originalExpression = expression;
        this.context = context;
        this.objectId = objectId;

        // Parsing results
        this.isValid = false;
        this.ast = null; // Abstract Syntax Tree
        this.dependencies = []; // Objects/variables this formula depends on
        this.variables = []; // Variables used in the formula

        // Evaluation results
        this.lastValue = null;
        this.lastEvaluationTime = null;
        this.evaluationCount = 0;
        this.errors = [];

        // Optimization
        this.isConstant = false; // True if formula has no dependencies
        this.cacheKey = null;
    }

    generateId() {
        return `formula_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
}
```

### Expression AST Nodes
```javascript
class ASTNode {
    constructor(type, value = null) {
        this.type = type;
        this.value = value;
        this.children = [];
        this.metadata = {};
    }
}

class LiteralNode extends ASTNode {
    constructor(value, dataType) {
        super(ExpressionType.LITERAL, value);
        this.dataType = dataType; // 'number', 'string', 'boolean'
    }
}

class VariableNode extends ASTNode {
    constructor(variableName, scope = VariableScope.LOCAL) {
        super(ExpressionType.VARIABLE, variableName);
        this.scope = scope;
        this.resolvedValue = null;
    }
}

class ObjectReferenceNode extends ASTNode {
    constructor(objectId, property) {
        super(ExpressionType.OBJECT_REFERENCE);
        this.objectId = objectId;
        this.property = property;
        this.resolvedObject = null;
    }
}

class FunctionNode extends ASTNode {
    constructor(functionName, args) {
        super(ExpressionType.FUNCTION, functionName);
        this.args = args;
        this.function = null; // Resolved function reference
    }
}

class ArithmeticNode extends ASTNode {
    constructor(operator, left, right) {
        super(ExpressionType.ARITHMETIC, operator);
        this.children = [left, right];
    }
}
```

## Core Operations

### 1. Parse Formula
```javascript
async parseFormula(expression, context = FormulaContext.SIZING, objectId = null) {
    const formula = new Formula(expression, context, objectId);

    try {
        // Tokenize the expression
        const tokens = this.tokenize(expression);

        // Parse tokens into AST
        formula.ast = this.parseTokensToAST(tokens);

        // Validate the AST
        const validationResult = await this.validator.validate(formula.ast, context);
        formula.isValid = validationResult.isValid;
        formula.errors = validationResult.errors;

        if (!formula.isValid) {
            throw new FormulaParseError(formula.errors.join(', '), formula);
        }

        // Extract dependencies and variables
        formula.dependencies = this.extractDependencies(formula.ast);
        formula.variables = this.extractVariables(formula.ast);

        // Check if formula is constant (no dependencies)
        formula.isConstant = formula.dependencies.length === 0 && formula.variables.length === 0;

        // Generate cache key for optimization
        formula.cacheKey = this.generateCacheKey(formula);

        return formula;

    } catch (error) {
        formula.errors.push(error.message);
        throw error;
    }
}

tokenize(expression) {
    const tokens = [];
    const tokenPatterns = [
        { type: 'NUMBER', pattern: /^\d+(\.\d+)?/ },
        { type: 'STRING', pattern: /^"([^"]*)"/ },
        { type: 'IDENTIFIER', pattern: /^[a-zA-Z_][a-zA-Z0-9_]*/ },
        { type: 'OBJECT_REF', pattern: /^[a-zA-Z_][a-zA-Z0-9_]*\.[a-zA-Z_][a-zA-Z0-9_]*/ },
        { type: 'VARIABLE', pattern: /^\$[a-zA-Z_][a-zA-Z0-9_]*/ },
        { type: 'OPERATOR', pattern: /^(\+|\-|\*|\/|\%|\=\=|\!\=|\<\=|\>\=|\<|\>|\&\&|\|\||\!)/ },
        { type: 'PARENTHESIS', pattern: /^(\(|\))/ },
        { type: 'COMMA', pattern: /^,/ },
        { type: 'QUESTION', pattern: /^\?/ },
        { type: 'COLON', pattern: /^:/ },
        { type: 'WHITESPACE', pattern: /^\s+/ }
    ];

    let position = 0;
    while (position < expression.length) {
        let matched = false;

        for (const { type, pattern } of tokenPatterns) {
            const match = expression.slice(position).match(pattern);
            if (match) {
                if (type !== 'WHITESPACE') { // Skip whitespace tokens
                    tokens.push({
                        type,
                        value: match[0],
                        position
                    });
                }
                position += match[0].length;
                matched = true;
                break;
            }
        }

        if (!matched) {
            throw new Error(`Unexpected character at position ${position}: ${expression[position]}`);
        }
    }

    return tokens;
}

parseTokensToAST(tokens) {
    const parser = new RecursiveDescentParser(tokens);
    return parser.parseExpression();
}
```

### 2. Evaluate Formula
```javascript
async evaluateFormula(formula, evaluationContext = {}) {
    if (typeof formula === 'string') {
        formula = await this.parseFormula(formula);
    }

    const startTime = performance.now();

    try {
        // Check cache first
        if (formula.isConstant && formula.lastValue !== null) {
            return formula.lastValue;
        }

        const cacheKey = this.buildEvaluationCacheKey(formula, evaluationContext);
        if (this.evaluationCache.has(cacheKey)) {
            const cached = this.evaluationCache.get(cacheKey);
            if (Date.now() - cached.timestamp < 1000) { // 1 second cache
                return cached.value;
            }
        }

        // Evaluate with timeout protection
        const result = await this.evaluateWithTimeout(formula, evaluationContext);

        // Cache the result
        this.evaluationCache.set(cacheKey, {
            value: result,
            timestamp: Date.now()
        });

        // Update formula metadata
        formula.lastValue = result;
        formula.lastEvaluationTime = Date.now();
        formula.evaluationCount++;

        // Update performance metrics
        this.updatePerformanceMetrics(performance.now() - startTime, true);

        return result;

    } catch (error) {
        this.updatePerformanceMetrics(performance.now() - startTime, false);
        throw new FormulaEvaluationError(error.message, formula);
    }
}

async evaluateWithTimeout(formula, evaluationContext) {
    return new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
            reject(new Error(`Formula evaluation timeout: ${formula.expression}`));
        }, this.evaluationTimeout);

        this.evaluateASTNode(formula.ast, evaluationContext, 0)
            .then(result => {
                clearTimeout(timeoutId);
                resolve(result);
            })
            .catch(error => {
                clearTimeout(timeoutId);
                reject(error);
            });
    });
}

async evaluateASTNode(node, context, depth = 0) {
    if (depth > this.maxRecursionDepth) {
        throw new Error('Maximum recursion depth exceeded');
    }

    switch (node.type) {
        case ExpressionType.LITERAL:
            return node.value;

        case ExpressionType.VARIABLE:
            return await this.resolveVariable(node, context);

        case ExpressionType.OBJECT_REFERENCE:
            return await this.resolveObjectReference(node, context);

        case ExpressionType.FUNCTION:
            return await this.evaluateFunction(node, context, depth);

        case ExpressionType.ARITHMETIC:
            return await this.evaluateArithmetic(node, context, depth);

        case ExpressionType.LOGICAL:
            return await this.evaluateLogical(node, context, depth);

        case ExpressionType.COMPARISON:
            return await this.evaluateComparison(node, context, depth);

        case ExpressionType.CONDITIONAL:
            return await this.evaluateConditional(node, context, depth);

        default:
            throw new Error(`Unknown node type: ${node.type}`);
    }
}
```

### 3. Dependency Resolution
```javascript
async resolveVariable(variableNode, context) {
    const variableName = variableNode.value;

    // Try to resolve in order: local → container → global → template
    const scopes = [
        VariableScope.LOCAL,
        VariableScope.CONTAINER,
        VariableScope.GLOBAL,
        VariableScope.TEMPLATE
    ];

    for (const scope of scopes) {
        const value = await this.variableManager.getVariable(
            variableName,
            scope,
            context.objectId,
            context.containerId
        );

        if (value !== undefined) {
            variableNode.resolvedValue = value;
            return value;
        }
    }

    throw new Error(`Variable not found: ${variableName}`);
}

async resolveObjectReference(objectRefNode, context) {
    const { objectId, property } = objectRefNode;

    // Resolve object ID (could be name or actual ID)
    let resolvedObjectId = objectId;
    if (!this.sceneController.hasObject(objectId)) {
        // Try to find object by name
        resolvedObjectId = this.sceneController.findObjectIdByName(objectId);
        if (!resolvedObjectId) {
            throw new Error(`Object not found: ${objectId}`);
        }
    }

    const objectData = this.sceneController.getObject(resolvedObjectId);
    if (!objectData) {
        throw new Error(`Object not found: ${resolvedObjectId}`);
    }

    // Resolve property value
    const value = this.getObjectProperty(objectData, property);
    if (value === undefined) {
        throw new Error(`Property not found: ${resolvedObjectId}.${property}`);
    }

    objectRefNode.resolvedObject = objectData;
    return value;
}

getObjectProperty(objectData, property) {
    const propertyPath = property.split('.');
    let value = objectData;

    for (const part of propertyPath) {
        if (value && typeof value === 'object' && part in value) {
            value = value[part];
        } else {
            return undefined;
        }
    }

    return value;
}
```

### 4. Function Evaluation
```javascript
async evaluateFunction(functionNode, context, depth) {
    const functionName = functionNode.value;
    const functionImpl = this.functionRegistry.get(functionName);

    if (!functionImpl) {
        throw new Error(`Unknown function: ${functionName}`);
    }

    // Evaluate arguments
    const evaluatedArgs = [];
    for (const argNode of functionNode.args) {
        const argValue = await this.evaluateASTNode(argNode, context, depth + 1);
        evaluatedArgs.push(argValue);
    }

    // Validate argument count and types
    if (functionImpl.minArgs && evaluatedArgs.length < functionImpl.minArgs) {
        throw new Error(`Function ${functionName} requires at least ${functionImpl.minArgs} arguments`);
    }

    if (functionImpl.maxArgs && evaluatedArgs.length > functionImpl.maxArgs) {
        throw new Error(`Function ${functionName} accepts at most ${functionImpl.maxArgs} arguments`);
    }

    // Execute function
    try {
        return await functionImpl.execute(evaluatedArgs, context);
    } catch (error) {
        throw new Error(`Function ${functionName} execution failed: ${error.message}`);
    }
}

registerBuiltinFunctions() {
    // Math functions
    this.functionRegistry.set('max', {
        minArgs: 2,
        maxArgs: null,
        execute: (args) => Math.max(...args)
    });

    this.functionRegistry.set('min', {
        minArgs: 2,
        maxArgs: null,
        execute: (args) => Math.min(...args)
    });

    this.functionRegistry.set('abs', {
        minArgs: 1,
        maxArgs: 1,
        execute: ([value]) => Math.abs(value)
    });

    this.functionRegistry.set('round', {
        minArgs: 1,
        maxArgs: 1,
        execute: ([value]) => Math.round(value)
    });

    this.functionRegistry.set('floor', {
        minArgs: 1,
        maxArgs: 1,
        execute: ([value]) => Math.floor(value)
    });

    this.functionRegistry.set('ceil', {
        minArgs: 1,
        maxArgs: 1,
        execute: ([value]) => Math.ceil(value)
    });

    // Trigonometric functions
    this.functionRegistry.set('sin', {
        minArgs: 1,
        maxArgs: 1,
        execute: ([angle]) => Math.sin(angle)
    });

    this.functionRegistry.set('cos', {
        minArgs: 1,
        maxArgs: 1,
        execute: ([angle]) => Math.cos(angle)
    });

    // Container-specific functions
    this.functionRegistry.set('containerWidth', {
        minArgs: 0,
        maxArgs: 1,
        execute: async (args, context) => {
            const containerId = args[0] || context.containerId;
            const container = this.sceneController.getObject(containerId);
            return container ? this.getObjectProperty(container, 'size.x') : 0;
        }
    });

    this.functionRegistry.set('containerHeight', {
        minArgs: 0,
        maxArgs: 1,
        execute: async (args, context) => {
            const containerId = args[0] || context.containerId;
            const container = this.sceneController.getObject(containerId);
            return container ? this.getObjectProperty(container, 'size.y') : 0;
        }
    });

    this.functionRegistry.set('siblingCount', {
        minArgs: 0,
        maxArgs: 1,
        execute: async (args, context) => {
            const containerId = args[0] || context.containerId;
            const children = this.sceneController.getContainerChildren(containerId);
            return children.length;
        }
    });

    // Conditional functions
    this.functionRegistry.set('if', {
        minArgs: 3,
        maxArgs: 3,
        execute: ([condition, trueValue, falseValue]) => {
            return condition ? trueValue : falseValue;
        }
    });
}
```

### 5. Variable Management
```javascript
class VariableManager {
    constructor() {
        this.variables = new Map(); // scope:name → value
        this.subscribers = new Map(); // variable → Set of objectIds
    }

    async setVariable(name, value, scope = VariableScope.GLOBAL, contextId = null) {
        const key = this.buildVariableKey(name, scope, contextId);
        const oldValue = this.variables.get(key);

        this.variables.set(key, value);

        // Notify subscribers of variable change
        if (oldValue !== value) {
            await this.notifyVariableChange(name, scope, contextId, oldValue, value);
        }
    }

    async getVariable(name, scope, objectId = null, containerId = null) {
        let contextId = null;

        switch (scope) {
            case VariableScope.LOCAL:
                contextId = objectId;
                break;
            case VariableScope.CONTAINER:
                contextId = containerId;
                break;
            case VariableScope.TEMPLATE:
                // Find template context
                const objectData = this.sceneController.getObject(objectId);
                contextId = objectData?.templateId;
                break;
        }

        const key = this.buildVariableKey(name, scope, contextId);
        return this.variables.get(key);
    }

    buildVariableKey(name, scope, contextId) {
        return contextId ? `${scope}:${contextId}:${name}` : `${scope}:${name}`;
    }

    async notifyVariableChange(name, scope, contextId, oldValue, newValue) {
        const subscriberKey = this.buildVariableKey(name, scope, contextId);
        const subscribers = this.subscribers.get(subscriberKey);

        if (subscribers) {
            // Trigger re-evaluation for all objects using this variable
            for (const objectId of subscribers) {
                await this.triggerFormulaReevaluation(objectId, name);
            }
        }
    }
}
```

## Security and Performance

### 1. Sandboxed Execution
```javascript
class SecureEvaluator {
    constructor() {
        this.allowedOperations = new Set([
            '+', '-', '*', '/', '%',
            '==', '!=', '<', '>', '<=', '>=',
            '&&', '||', '!'
        ]);

        this.forbiddenPatterns = [
            /eval\s*\(/,
            /Function\s*\(/,
            /setTimeout\s*\(/,
            /setInterval\s*\(/,
            /import\s*\(/,
            /require\s*\(/,
            /process\./,
            /global\./,
            /window\./,
            /document\./
        ];
    }

    validateExpression(expression) {
        // Check for forbidden patterns
        for (const pattern of this.forbiddenPatterns) {
            if (pattern.test(expression)) {
                throw new Error(`Forbidden pattern detected: ${pattern}`);
            }
        }

        // Additional security validations
        this.validateOperators(expression);
        this.validateIdentifiers(expression);
    }

    validateOperators(expression) {
        const operatorRegex = /[+\-*/%=<>!&|]/g;
        const matches = expression.match(operatorRegex);

        if (matches) {
            for (const op of matches) {
                if (!this.allowedOperations.has(op)) {
                    throw new Error(`Unsafe operator: ${op}`);
                }
            }
        }
    }
}
```

### 2. Performance Optimization
```javascript
class FormulaOptimizer {
    optimizeFormula(formula) {
        // Constant folding
        formula.ast = this.foldConstants(formula.ast);

        // Dead code elimination
        formula.ast = this.eliminateDeadCode(formula.ast);

        // Common subexpression elimination
        formula.ast = this.eliminateCommonSubexpressions(formula.ast);

        return formula;
    }

    foldConstants(node) {
        if (node.type === ExpressionType.ARITHMETIC) {
            const left = this.foldConstants(node.children[0]);
            const right = this.foldConstants(node.children[1]);

            // If both operands are literals, compute the result
            if (left.type === ExpressionType.LITERAL && right.type === ExpressionType.LITERAL) {
                const result = this.computeArithmetic(node.value, left.value, right.value);
                return new LiteralNode(result, typeof result);
            }

            node.children = [left, right];
        }

        return node;
    }
}
```

## Integration Points

### Scene Controller Integration
```javascript
class SceneController {
    setObjectFormula(objectId, property, formulaExpression) {
        const formula = await this.formulaEngine.parseFormula(
            formulaExpression,
            FormulaContext.SIZING,
            objectId
        );

        // Store formula metadata on object
        const objectData = this.getObject(objectId);
        if (!objectData.formulas) {
            objectData.formulas = new Map();
        }
        objectData.formulas.set(property, formula);

        // Register dependencies
        for (const dependency of formula.dependencies) {
            this.dependencyGraph.addDependency(
                dependency.objectId,
                objectId,
                'formula',
                {
                    formulaId: formula.id,
                    targetProperty: property,
                    sourceProperty: dependency.property
                }
            );
        }

        // Evaluate and apply initial value
        const value = await this.formulaEngine.evaluateFormula(formula, {
            objectId,
            containerId: objectData.parentContainer
        });

        this.setObjectProperty(objectId, property, value);
    }
}
```

### Property Update Handler Integration
```javascript
// Handle formula property updates
async processFormulaProperty(request) {
    const formula = await this.formulaEngine.parseFormula(
        request.newValue,
        FormulaContext.SIZING,
        request.objectId
    );

    const evaluatedValue = await this.formulaEngine.evaluateFormula(formula, {
        objectId: request.objectId,
        containerId: this.getObjectParentContainer(request.objectId)
    });

    return {
        value: evaluatedValue,
        formulaMetadata: {
            expression: formula.expression,
            dependencies: formula.dependencies,
            formulaId: formula.id
        },
        requiresDependencyUpdate: true,
        requiresLayoutPropagation: this.isLayoutAffectingProperty(request.property)
    };
}
```

## File Structure
```
/application/systems/
├── formula-engine.js                # Main engine class
├── expression-parser.js             # Expression parsing
├── expression-evaluator.js          # AST evaluation
├── formula-validator.js             # Formula validation
├── variable-manager.js              # Variable management
├── function-registry.js             # Built-in functions
├── formula-optimizer.js             # Performance optimization
└── formula-security.js              # Security validation
```

## Usage Examples

### Basic Mathematical Expression
```javascript
// Object width = container width * 0.5
const formula = await formulaEngine.parseFormula('containerWidth() * 0.5');
const value = await formulaEngine.evaluateFormula(formula, { objectId: 'obj1' });
```

### Object Reference Expression
```javascript
// Object height = another object's width + gap
const formula = await formulaEngine.parseFormula('Object1.width + $gap');
const value = await formulaEngine.evaluateFormula(formula, { objectId: 'obj2' });
```

### Conditional Expression
```javascript
// Conditional sizing based on sibling count
const formula = await formulaEngine.parseFormula(
    'siblingCount() > 3 ? containerWidth() / siblingCount() : 100'
);
const value = await formulaEngine.evaluateFormula(formula, { objectId: 'obj3' });
```

### Complex Layout Expression
```javascript
// Position based on siblings and container properties
const formula = await formulaEngine.parseFormula(`
    (containerWidth() - (siblingCount() * $objectWidth) - ((siblingCount() - 1) * $gap)) / 2
`);
const value = await formulaEngine.evaluateFormula(formula, { objectId: 'obj4' });
```

This formula engine provides a powerful, secure foundation for parametric design with comprehensive dependency tracking, performance optimization, and seamless integration with the broader container architecture.