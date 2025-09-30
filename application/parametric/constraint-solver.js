/**
 * ConstraintSolver - Multi-Constraint Resolution System
 *
 * Solves systems of constraints for parametric design with:
 * - Sequential constraint propagation
 * - Multiple constraint types (min/max, equality, ratio, formula)
 * - Iterative solving for interdependent constraints
 * - Constraint priority system
 * - Convergence detection
 *
 * Starts with simple sequential solving and can be extended to
 * iterative/numerical methods for complex constraint systems.
 */

class ConstraintSolver {
    constructor() {
        // Constraint registry by type
        this.constraintTypes = new Map();

        // Solver configuration
        this.config = {
            maxIterations: 100,
            convergenceThreshold: 0.001,
            enableIterativeSolving: false // Start with sequential only
        };

        // Statistics
        this.stats = {
            solveAttempts: 0,
            successes: 0,
            failures: 0,
            iterations: 0,
            constraintsApplied: 0
        };

        // Register built-in constraint types
        this.registerBuiltInConstraints();
    }

    /**
     * Register built-in constraint solvers
     * @private
     */
    registerBuiltInConstraints() {
        // Min/Max constraints
        this.registerConstraintType('min', {
            priority: 1,
            solve: (value, constraint) => {
                return Math.max(value, constraint.min);
            }
        });

        this.registerConstraintType('max', {
            priority: 1,
            solve: (value, constraint) => {
                return Math.min(value, constraint.max);
            }
        });

        // Range constraint (combines min/max)
        this.registerConstraintType('range', {
            priority: 1,
            solve: (value, constraint) => {
                let result = value;
                if (constraint.min !== undefined) {
                    result = Math.max(result, constraint.min);
                }
                if (constraint.max !== undefined) {
                    result = Math.min(result, constraint.max);
                }
                return result;
            }
        });

        // Equality constraint
        this.registerConstraintType('equals', {
            priority: 2,
            solve: (value, constraint) => {
                return constraint.value;
            }
        });

        // Ratio constraint (value = other * ratio)
        this.registerConstraintType('ratio', {
            priority: 3,
            solve: (value, constraint, context) => {
                const otherValue = context[constraint.referenceProperty];
                if (otherValue !== undefined) {
                    return otherValue * constraint.ratio;
                }
                return value;
            }
        });

        // Offset constraint (value = other + offset)
        this.registerConstraintType('offset', {
            priority: 3,
            solve: (value, constraint, context) => {
                const otherValue = context[constraint.referenceProperty];
                if (otherValue !== undefined) {
                    return otherValue + constraint.offset;
                }
                return value;
            }
        });

        // Locked constraint (value cannot change)
        this.registerConstraintType('locked', {
            priority: 10,
            solve: (value, constraint) => {
                return constraint.lockedValue !== undefined ? constraint.lockedValue : value;
            }
        });
    }

    /**
     * Register a custom constraint type
     * @param {string} typeName - Name of constraint type
     * @param {Object} solver - Solver configuration {priority, solve: function}
     */
    registerConstraintType(typeName, solver) {
        if (!solver.solve || typeof solver.solve !== 'function') {
            console.error('ConstraintSolver: Invalid solver function for type:', typeName);
            return false;
        }

        this.constraintTypes.set(typeName, {
            priority: solver.priority || 5,
            solve: solver.solve,
            metadata: solver.metadata || {}
        });

        return true;
    }

    /**
     * Solve constraints for a set of properties
     * @param {Object} properties - Property values {propertyName: value}
     * @param {Object} constraints - Constraints {propertyName: [constraint objects]}
     * @param {Object} options - Solve options
     * @returns {Object} Solved property values or null on failure
     */
    solve(properties, constraints, options = {}) {
        this.stats.solveAttempts++;

        if (!properties || Object.keys(properties).length === 0) {
            console.warn('ConstraintSolver: No properties to solve');
            return properties;
        }

        try {
            // Clone properties to avoid mutation
            let currentValues = { ...properties };

            // Sequential solving (simple case)
            if (!this.config.enableIterativeSolving) {
                currentValues = this.solveSequential(currentValues, constraints);
                this.stats.successes++;
                return currentValues;
            }

            // Iterative solving (complex interdependent constraints)
            currentValues = this.solveIterative(currentValues, constraints);
            this.stats.successes++;
            return currentValues;

        } catch (error) {
            console.error('ConstraintSolver.solve error:', error);
            this.stats.failures++;
            return null;
        }
    }

    /**
     * Sequential constraint solving (one pass)
     * @private
     */
    solveSequential(properties, constraints) {
        const result = { ...properties };

        // Get all constrained properties
        const constrainedProperties = Object.keys(constraints);

        // Sort by constraint priority (process high priority first)
        const sortedProperties = this.sortByPriority(constrainedProperties, constraints);

        // Apply constraints in order
        for (const propertyName of sortedProperties) {
            const propertyConstraints = constraints[propertyName];
            if (!Array.isArray(propertyConstraints)) continue;

            let value = result[propertyName];

            // Apply each constraint in priority order
            const sortedConstraints = this.sortConstraintsByPriority(propertyConstraints);

            for (const constraint of sortedConstraints) {
                if (!constraint.type || !this.constraintTypes.has(constraint.type)) {
                    console.warn('ConstraintSolver: Unknown constraint type:', constraint.type);
                    continue;
                }

                const solver = this.constraintTypes.get(constraint.type);
                value = solver.solve(value, constraint, result);
                this.stats.constraintsApplied++;
            }

            result[propertyName] = value;
        }

        return result;
    }

    /**
     * Iterative constraint solving (multiple passes until convergence)
     * @private
     */
    solveIterative(properties, constraints) {
        let currentValues = { ...properties };
        let previousValues = {};

        for (let iteration = 0; iteration < this.config.maxIterations; iteration++) {
            this.stats.iterations++;

            // Store previous values for convergence check
            previousValues = { ...currentValues };

            // Perform one sequential pass
            currentValues = this.solveSequential(currentValues, constraints);

            // Check for convergence
            if (this.hasConverged(currentValues, previousValues)) {
                return currentValues;
            }
        }

        console.warn('ConstraintSolver: Failed to converge after', this.config.maxIterations, 'iterations');
        return currentValues;
    }

    /**
     * Check if iterative solving has converged
     * @private
     */
    hasConverged(currentValues, previousValues) {
        for (const property in currentValues) {
            const current = currentValues[property];
            const previous = previousValues[property];

            if (typeof current === 'number' && typeof previous === 'number') {
                const diff = Math.abs(current - previous);
                if (diff > this.config.convergenceThreshold) {
                    return false;
                }
            }
        }
        return true;
    }

    /**
     * Sort properties by constraint priority
     * @private
     */
    sortByPriority(properties, constraints) {
        return properties.sort((a, b) => {
            const priorityA = this.getMaxPriority(constraints[a]);
            const priorityB = this.getMaxPriority(constraints[b]);
            return priorityB - priorityA; // Higher priority first
        });
    }

    /**
     * Get maximum priority from a list of constraints
     * @private
     */
    getMaxPriority(constraintList) {
        if (!Array.isArray(constraintList) || constraintList.length === 0) return 0;

        let maxPriority = 0;
        for (const constraint of constraintList) {
            const solver = this.constraintTypes.get(constraint.type);
            if (solver && solver.priority > maxPriority) {
                maxPriority = solver.priority;
            }
        }
        return maxPriority;
    }

    /**
     * Sort constraints by priority
     * @private
     */
    sortConstraintsByPriority(constraints) {
        return [...constraints].sort((a, b) => {
            const priorityA = this.constraintTypes.get(a.type)?.priority || 0;
            const priorityB = this.constraintTypes.get(b.type)?.priority || 0;
            return priorityB - priorityA;
        });
    }

    /**
     * Validate constraint configuration
     * @param {Object} constraint - Constraint to validate
     * @returns {Object} Validation result {valid, error}
     */
    validateConstraint(constraint) {
        if (!constraint || !constraint.type) {
            return {
                valid: false,
                error: 'Constraint missing type'
            };
        }

        if (!this.constraintTypes.has(constraint.type)) {
            return {
                valid: false,
                error: `Unknown constraint type: ${constraint.type}`
            };
        }

        // Type-specific validation
        const type = constraint.type;

        switch (type) {
            case 'min':
                if (constraint.min === undefined) {
                    return { valid: false, error: 'min constraint requires min value' };
                }
                break;

            case 'max':
                if (constraint.max === undefined) {
                    return { valid: false, error: 'max constraint requires max value' };
                }
                break;

            case 'range':
                if (constraint.min === undefined && constraint.max === undefined) {
                    return { valid: false, error: 'range constraint requires min or max value' };
                }
                break;

            case 'equals':
                if (constraint.value === undefined) {
                    return { valid: false, error: 'equals constraint requires value' };
                }
                break;

            case 'ratio':
                if (constraint.referenceProperty === undefined || constraint.ratio === undefined) {
                    return { valid: false, error: 'ratio constraint requires referenceProperty and ratio' };
                }
                break;

            case 'offset':
                if (constraint.referenceProperty === undefined || constraint.offset === undefined) {
                    return { valid: false, error: 'offset constraint requires referenceProperty and offset' };
                }
                break;
        }

        return { valid: true, error: null };
    }

    /**
     * Apply a single constraint to a value
     * @param {*} value - Current value
     * @param {Object} constraint - Constraint to apply
     * @param {Object} context - Other property values for reference
     * @returns {*} Constrained value
     */
    applyConstraint(value, constraint, context = {}) {
        const validation = this.validateConstraint(constraint);
        if (!validation.valid) {
            console.error('ConstraintSolver: Invalid constraint:', validation.error);
            return value;
        }

        const solver = this.constraintTypes.get(constraint.type);
        return solver.solve(value, constraint, context);
    }

    /**
     * Get solver statistics
     * @returns {Object} Statistics
     */
    getStats() {
        return {
            ...this.stats,
            registeredTypes: this.constraintTypes.size,
            successRate: this.stats.solveAttempts > 0 ?
                (this.stats.successes / this.stats.solveAttempts * 100).toFixed(1) + '%' : '0%',
            avgIterations: this.stats.solveAttempts > 0 ?
                (this.stats.iterations / this.stats.solveAttempts).toFixed(2) : 0
        };
    }

    /**
     * Configure solver behavior
     * @param {Object} options - Configuration options
     */
    configure(options) {
        if (options.maxIterations !== undefined) {
            this.config.maxIterations = options.maxIterations;
        }
        if (options.convergenceThreshold !== undefined) {
            this.config.convergenceThreshold = options.convergenceThreshold;
        }
        if (options.enableIterativeSolving !== undefined) {
            this.config.enableIterativeSolving = options.enableIterativeSolving;
        }
    }

    /**
     * Reset statistics
     */
    resetStats() {
        this.stats = {
            solveAttempts: 0,
            successes: 0,
            failures: 0,
            iterations: 0,
            constraintsApplied: 0
        };
    }

    /**
     * Dispose of solver resources
     */
    dispose() {
        this.constraintTypes.clear();
        this.resetStats();
    }
}

// Export for use in main application
window.ConstraintSolver = ConstraintSolver;