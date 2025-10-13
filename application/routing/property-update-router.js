/**
 * Property Update Router
 *
 * Optimizes property update paths based on type:
 * - Material changes: Skip layout (6 steps instead of 9)
 * - Transform changes: Reduced validation chain
 * - Dimension changes: Full chain (affects layout)
 *
 * Part of Phase 6: Property Update Optimization
 * Version: 1.0.0
 */

class PropertyUpdateRouter {
    constructor() {
        this.stats = {
            materialUpdates: 0,
            transformUpdates: 0,
            dimensionUpdates: 0,
            layoutUpdates: 0,
            totalUpdates: 0,
            timings: {
                material: [],
                transform: [],
                dimension: [],
                layout: []
            }
        };

        // Performance budgets (ms)
        this.budgets = {
            material: 10,    // Material changes should be fast
            transform: 16,   // Transform changes (1 frame @ 60fps)
            dimension: 50,   // Dimension changes may trigger layout
            layout: 100      // Layout updates can be slower
        };
    }

    get objectStateManager() {
        return window.modlerComponents?.objectStateManager;
    }

    get sceneController() {
        return window.modlerComponents?.sceneController;
    }

    get propertyUpdateHandler() {
        return window.modlerComponents?.propertyUpdateHandler;
    }

    /**
     * Route property update to optimized path based on type
     * @param {number|string} objectId - Object ID
     * @param {string} property - Property name (e.g., 'material.color', 'position.x')
     * @param {*} value - New value
     * @returns {boolean} Success
     */
    routeUpdate(objectId, property, value) {
        const startTime = performance.now();
        this.stats.totalUpdates++;

        let success = false;
        let updateType = null;

        // Classify update type and route to optimized path
        if (this.isMaterialProperty(property)) {
            updateType = 'material';
            success = this.routeMaterialUpdate(objectId, property, value);
            this.stats.materialUpdates++;
        }
        else if (this.isTransformProperty(property)) {
            updateType = 'transform';
            success = this.routeTransformUpdate(objectId, property, value);
            this.stats.transformUpdates++;
        }
        else if (this.isDimensionProperty(property)) {
            updateType = 'dimension';
            success = this.routeDimensionUpdate(objectId, property, value);
            this.stats.dimensionUpdates++;
        }
        else if (this.isLayoutProperty(property)) {
            updateType = 'layout';
            success = this.routeLayoutUpdate(objectId, property, value);
            this.stats.layoutUpdates++;
        }
        else {
            // Fallback to standard handler
            updateType = 'other';
            if (this.propertyUpdateHandler) {
                success = this.propertyUpdateHandler.handlePropertyChange(objectId, property, value);
            }
        }

        // Track timing
        const duration = performance.now() - startTime;
        if (updateType && this.stats.timings[updateType]) {
            this.stats.timings[updateType].push(duration);

            // Keep only last 100 samples per type
            if (this.stats.timings[updateType].length > 100) {
                this.stats.timings[updateType].shift();
            }

            // Check budget violation
            const budget = this.budgets[updateType];
            if (budget && duration > budget) {
                console.warn(`⚠️ Performance budget exceeded for ${updateType}: ${duration.toFixed(1)}ms (budget: ${budget}ms)`);
            }
        }

        return success;
    }

    /**
     * OPTIMIZED PATH: Material updates
     * Skip layout propagation entirely (material doesn't affect geometry)
     */
    routeMaterialUpdate(objectId, property, value) {
        if (!this.objectStateManager) return false;

        try {
            const materialProp = property.split('.')[1];
            const updates = {};

            if (materialProp === 'color') {
                updates.material = { color: value };
            } else if (materialProp === 'opacity') {
                updates.material = { opacity: value };
            } else {
                return false;
            }

            // Direct update - skips layout propagation
            this.objectStateManager.updateObject(objectId, updates, {
                skipLayoutPropagation: true // OPTIMIZATION: Material changes don't affect layout
            });

            return true;
        } catch (error) {
            console.error('PropertyUpdateRouter material error:', error);
            return false;
        }
    }

    /**
     * OPTIMIZED PATH: Transform updates
     * Skip layout propagation (position/rotation don't trigger container layout)
     */
    routeTransformUpdate(objectId, property, value) {
        if (!this.objectStateManager) return false;

        try {
            const updates = {};

            if (property.startsWith('position.')) {
                const axis = property.split('.')[1];
                if (['x', 'y', 'z'].includes(axis)) {
                    updates.position = { [axis]: value };
                }
            }

            if (property.startsWith('rotation.')) {
                const axis = property.split('.')[1];
                if (['x', 'y', 'z'].includes(axis)) {
                    updates.rotation = { [axis]: value * Math.PI / 180 };
                }
            }

            if (Object.keys(updates).length > 0) {
                // Direct update - skips layout propagation for transforms
                this.objectStateManager.updateObject(objectId, updates, {
                    skipLayoutPropagation: true // OPTIMIZATION: Transforms don't affect container layout
                });
                return true;
            }

            return false;
        } catch (error) {
            console.error('PropertyUpdateRouter transform error:', error);
            return false;
        }
    }

    /**
     * STANDARD PATH: Dimension updates
     * Keep full chain - dimensions affect layout
     */
    routeDimensionUpdate(objectId, property, value) {
        if (!this.objectStateManager) return false;

        try {
            const axis = property.split('.')[1];
            if (!['x', 'y', 'z'].includes(axis)) {
                return false;
            }

            const updates = {
                dimensions: { [axis]: value }
            };

            // Full chain - dimensions affect parent container layout
            this.objectStateManager.updateObject(objectId, updates);
            return true;
        } catch (error) {
            console.error('PropertyUpdateRouter dimension error:', error);
            return false;
        }
    }

    /**
     * STANDARD PATH: Layout updates
     * Keep full chain - layout affects entire hierarchy
     */
    routeLayoutUpdate(objectId, property, value) {
        // Delegate to PropertyUpdateHandler for layout properties
        if (this.propertyUpdateHandler) {
            return this.propertyUpdateHandler.handlePropertyChange(objectId, property, value);
        }
        return false;
    }

    /**
     * Property type classifiers
     */
    isMaterialProperty(property) {
        return property.startsWith('material.');
    }

    isTransformProperty(property) {
        return property.startsWith('position.') || property.startsWith('rotation.');
    }

    isDimensionProperty(property) {
        return property.startsWith('dimensions.');
    }

    isLayoutProperty(property) {
        const layoutProps = ['direction', 'gap', 'padding.width', 'padding.height', 'padding.depth', 'sizingMode'];
        return layoutProps.some(prop => property === prop || property.startsWith(prop + '.'));
    }

    /**
     * Get performance statistics
     */
    getStats() {
        const stats = { ...this.stats };

        // Calculate average timings
        stats.averages = {};
        for (const [type, timings] of Object.entries(this.stats.timings)) {
            if (timings.length > 0) {
                const sum = timings.reduce((a, b) => a + b, 0);
                const avg = sum / timings.length;
                const sorted = [...timings].sort((a, b) => a - b);
                const p90Index = Math.floor(timings.length * 0.9);
                const p90 = sorted[p90Index] || 0;

                stats.averages[type] = {
                    mean: avg.toFixed(2),
                    p90: p90.toFixed(2),
                    count: timings.length,
                    budget: this.budgets[type],
                    withinBudget: p90 <= this.budgets[type]
                };
            }
        }

        return stats;
    }

    /**
     * Reset statistics
     */
    resetStats() {
        this.stats = {
            materialUpdates: 0,
            transformUpdates: 0,
            dimensionUpdates: 0,
            layoutUpdates: 0,
            totalUpdates: 0,
            timings: {
                material: [],
                transform: [],
                dimension: [],
                layout: []
            }
        };
    }

    /**
     * Print performance report to console
     */
    printReport() {
        const stats = this.getStats();

        console.log('📊 Property Update Performance Report');
        console.log('=====================================');
        console.log(`Total updates: ${stats.totalUpdates}`);
        console.log('');

        for (const [type, data] of Object.entries(stats.averages)) {
            const status = data.withinBudget ? '✅' : '❌';
            console.log(`${status} ${type.toUpperCase()}`);
            console.log(`   Mean: ${data.mean}ms`);
            console.log(`   P90: ${data.p90}ms (budget: ${data.budget}ms)`);
            console.log(`   Count: ${data.count}`);
            console.log('');
        }
    }
}

// Export globally
if (typeof window !== 'undefined') {
    window.PropertyUpdateRouter = PropertyUpdateRouter;
}
