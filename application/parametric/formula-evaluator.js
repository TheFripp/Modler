/**
 * FormulaEvaluator - Mathematical Expression Evaluation
 *
 * Evaluates mathematical formulas for parametric design with:
 * - Safe expression parsing and evaluation
 * - Context-based variable resolution
 * - Dependency extraction
 * - Validation and error handling
 *
 * Supports basic math operations, functions, and property references.
 */

class FormulaEvaluator {
    constructor() {
        // Supported mathematical functions
        this.functions = {
            abs: Math.abs,
            ceil: Math.ceil,
            floor: Math.floor,
            round: Math.round,
            sqrt: Math.sqrt,
            pow: Math.pow,
            min: Math.min,
            max: Math.max,
            sin: Math.sin,
            cos: Math.cos,
            tan: Math.tan,
            asin: Math.asin,
            acos: Math.acos,
            atan: Math.atan,
            atan2: Math.atan2,
            log: Math.log,
            exp: Math.exp,
            PI: Math.PI,
            E: Math.E
        };

        // Statistics
        this.stats = {
            evaluations: 0,
            successes: 0,
            failures: 0,
            cacheHits: 0
        };

        // Simple cache for repeated evaluations
        this.cache = new Map(); // expression+context -> result
        this.cacheExpiration = 1000; // 1 second cache
    }

    /**
     * Evaluate a mathematical expression with given context
     * @param {string} expression - Formula expression (e.g., "width * 2 + height")
     * @param {Object} context - Variable values (e.g., {width: 10, height: 20})
     * @returns {number|null} Evaluated result or null on error
     */
    evaluate(expression, context = {}) {
        this.stats.evaluations++;

        if (!expression || typeof expression !== 'string') {
            console.error('FormulaEvaluator: Invalid expression:', expression);
            this.stats.failures++;
            return null;
        }

        try {
            // Check cache
            const cacheKey = `${expression}:${JSON.stringify(context)}`;
            const cached = this.cache.get(cacheKey);
            if (cached && Date.now() - cached.timestamp < this.cacheExpiration) {
                this.stats.cacheHits++;
                return cached.result;
            }

            // Clean and validate expression
            const cleanExpression = expression.trim();
            if (!this.validateExpression(cleanExpression)) {
                throw new Error('Invalid or unsafe expression');
            }

            // Parse and evaluate
            const result = this.evaluateExpression(cleanExpression, context);

            // Validate result
            if (typeof result !== 'number' || !isFinite(result)) {
                throw new Error('Expression did not evaluate to a valid number');
            }

            // Cache result
            this.cache.set(cacheKey, {
                result,
                timestamp: Date.now()
            });

            // Clean old cache entries
            if (this.cache.size > 100) {
                this.cleanCache();
            }

            this.stats.successes++;
            return result;

        } catch (error) {
            console.error('FormulaEvaluator.evaluate error:', error.message, 'Expression:', expression);
            this.stats.failures++;
            return null;
        }
    }

    /**
     * Validate expression syntax and safety
     * @param {string} expression - Expression to validate
     * @returns {boolean} True if valid and safe
     */
    validateExpression(expression) {
        // Reject empty expressions
        if (!expression || expression.length === 0) {
            return false;
        }

        // Reject expressions that are too long (prevent DoS)
        if (expression.length > 500) {
            console.error('FormulaEvaluator: Expression too long');
            return false;
        }

        // Check for dangerous patterns
        const dangerousPatterns = [
            /eval\(/i,
            /function\s*\(/i,
            /=>/,
            /\bthis\b/,
            /\bwindow\b/,
            /\bdocument\b/,
            /\bprocess\b/,
            /\brequire\b/,
            /\bimport\b/,
            /__proto__/,
            /constructor/i,
            /\[\s*['"`]/  // Array/object access
        ];

        for (const pattern of dangerousPatterns) {
            if (pattern.test(expression)) {
                console.error('FormulaEvaluator: Dangerous pattern detected:', pattern);
                return false;
            }
        }

        // Must contain only safe characters
        const safePattern = /^[a-zA-Z0-9_\s\+\-\*\/\(\)\.\,<>=&|!%]+$/;
        if (!safePattern.test(expression)) {
            console.error('FormulaEvaluator: Expression contains unsafe characters');
            return false;
        }

        return true;
    }

    /**
     * Evaluate expression with context
     * @private
     */
    evaluateExpression(expression, context) {
        // Replace context variables with values
        let processedExpression = expression;

        // Sort by length (longest first) to avoid partial replacements
        const variables = Object.keys(context).sort((a, b) => b.length - a.length);

        for (const variable of variables) {
            const value = context[variable];
            if (typeof value === 'number') {
                // Replace variable with its value
                const regex = new RegExp(`\\b${variable}\\b`, 'g');
                processedExpression = processedExpression.replace(regex, value.toString());
            }
        }

        // Replace function names with Math equivalents
        for (const [name, func] of Object.entries(this.functions)) {
            if (typeof func === 'number') {
                // Constants like PI, E
                const regex = new RegExp(`\\b${name}\\b`, 'g');
                processedExpression = processedExpression.replace(regex, func.toString());
            }
        }

        // Evaluate using Function constructor (safer than eval)
        try {
            // Build function body with Math functions available
            const funcBody = `
                const { abs, ceil, floor, round, sqrt, pow, min, max, sin, cos, tan, asin, acos, atan, atan2, log, exp } = Math;
                const PI = Math.PI;
                const E = Math.E;
                return (${processedExpression});
            `;

            const evaluator = new Function(funcBody);
            return evaluator();

        } catch (error) {
            throw new Error(`Expression evaluation failed: ${error.message}`);
        }
    }

    /**
     * Extract variable dependencies from expression
     * @param {string} expression - Formula expression
     * @returns {Array<string>} Array of variable names
     */
    extractDependencies(expression) {
        if (!expression || typeof expression !== 'string') {
            return [];
        }

        try {
            // Find all variable-like tokens (word characters not followed by parentheses)
            const tokenRegex = /\b([a-zA-Z_][a-zA-Z0-9_\.]*)\b(?!\s*\()/g;
            const matches = expression.match(tokenRegex) || [];

            // Filter out known functions and constants
            const functionNames = new Set(Object.keys(this.functions));
            const dependencies = matches.filter(token => !functionNames.has(token));

            // Remove duplicates and return
            return [...new Set(dependencies)];

        } catch (error) {
            console.error('FormulaEvaluator.extractDependencies error:', error);
            return [];
        }
    }

    /**
     * Validate formula with test context
     * @param {string} expression - Formula to validate
     * @param {Object} testContext - Test values for variables
     * @returns {Object} Validation result {valid, error, dependencies}
     */
    validateFormula(expression, testContext = {}) {
        try {
            // Extract dependencies
            const dependencies = this.extractDependencies(expression);

            // Check if all dependencies are provided in test context
            const missingDependencies = dependencies.filter(dep => !(dep in testContext));
            if (missingDependencies.length > 0) {
                return {
                    valid: false,
                    error: `Missing dependencies: ${missingDependencies.join(', ')}`,
                    dependencies
                };
            }

            // Try to evaluate with test context
            const result = this.evaluate(expression, testContext);
            if (result === null) {
                return {
                    valid: false,
                    error: 'Expression failed to evaluate',
                    dependencies
                };
            }

            return {
                valid: true,
                error: null,
                dependencies,
                testResult: result
            };

        } catch (error) {
            return {
                valid: false,
                error: error.message,
                dependencies: []
            };
        }
    }

    /**
     * Clean old cache entries
     * @private
     */
    cleanCache() {
        const now = Date.now();
        for (const [key, value] of this.cache.entries()) {
            if (now - value.timestamp > this.cacheExpiration) {
                this.cache.delete(key);
            }
        }
    }

    /**
     * Get evaluator statistics
     * @returns {Object} Statistics
     */
    getStats() {
        return {
            ...this.stats,
            cacheSize: this.cache.size,
            successRate: this.stats.evaluations > 0 ?
                (this.stats.successes / this.stats.evaluations * 100).toFixed(1) + '%' : '0%'
        };
    }

    /**
     * Clear cache and reset statistics
     */
    reset() {
        this.cache.clear();
        this.stats = {
            evaluations: 0,
            successes: 0,
            failures: 0,
            cacheHits: 0
        };
    }

    /**
     * Dispose of evaluator resources
     */
    dispose() {
        this.cache.clear();
    }
}

// Export for use in main application
window.FormulaEvaluator = FormulaEvaluator;