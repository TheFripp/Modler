/**
 * Layout Propagation Manager
 *
 * Scheduling-only system for bottom-up hierarchical layout propagation.
 * Does NOT perform mode-routing — always delegates to SceneLayoutManager.updateContainer().
 *
 * Responsibilities:
 * - Schedule parent layout updates when children change
 * - Process updates in correct order (deepest first)
 * - Manage depth caching for performance
 * - Defer grandparent propagations to avoid re-processing
 *
 * Version: 2.0.0
 * Part of: Layout Architecture Simplification (March 2026)
 */

class LayoutPropagationManager {
    constructor() {
        // Dependencies (lazy-loaded)
        this.sceneController = null;
        this.objectStateManager = null;

        // Scheduled layout updates (Set of container IDs)
        this.scheduledLayoutUpdates = new Set();
        this.nextFramePropagations = new Set();

        // Scheduling state
        this.layoutUpdateScheduled = false;
        this.deferredPropagationScheduled = false;

        // Depth caching for performance
        this.depthCache = new Map();

        // Statistics
        this.stats = {
            layoutsScheduled: 0,
            layoutsProcessed: 0,
            propagationsDeferred: 0,
            depthCacheHits: 0,
            depthCacheMisses: 0
        };
    }

    /**
     * Initialize with dependencies
     * @param {Object} sceneController - SceneController instance
     * @param {Object} objectStateManager - ObjectStateManager instance
     */
    initialize(sceneController, objectStateManager = null) {
        this.sceneController = sceneController;
        this.objectStateManager = objectStateManager || window.modlerComponents?.objectStateManager;

        console.log('✅ LayoutPropagationManager initialized');
    }

    /**
     * Get SceneController on demand (for testing/flexibility)
     */
    getSceneController() {
        if (!this.sceneController) {
            this.sceneController = window.modlerComponents?.sceneController;
        }
        return this.sceneController;
    }

    /**
     * Schedule layout update for parent container when child changes
     *
     * BIDIRECTIONAL HIERARCHICAL PROPAGATION
     * When a child object changes (dimension, position, etc.), its parent
     * container may need to update its layout.
     *
     * @param {string|number} childObjectId - ID of child that changed
     */
    scheduleParentLayoutUpdate(childObjectId) {
        const sceneController = this.getSceneController();
        if (!sceneController) {
            console.warn('LayoutPropagationManager: SceneController not available');
            return;
        }

        const childObject = sceneController.getObject(childObjectId);
        if (!childObject || !childObject.parentContainer) {
            return; // No parent or not in a container
        }

        // Use centralized state machine to check if parent has layout or hug enabled
        if (!this.objectStateManager?.isLayoutCapableMode(childObject.parentContainer)) {
            return; // Parent doesn't have layout or hug enabled
        }

        const parentContainer = sceneController.getObject(childObject.parentContainer);

        // Add parent to scheduled updates
        this.scheduledLayoutUpdates.add(childObject.parentContainer);
        this.stats.layoutsScheduled++;

        // Process in next frame (after current propagation completes)
        if (!this.layoutUpdateScheduled) {
            this.layoutUpdateScheduled = true;
            requestAnimationFrame(() => {
                this.processScheduledLayouts();
                this.layoutUpdateScheduled = false;
            });
        }
    }

    /**
     * Process all scheduled layout updates in bottom-up order
     *
     * PERFORMANCE OPTIMIZATIONS:
     * - Caches container depths to avoid O(n×d) recalculation during sort
     * - Defers grandparent propagations to next frame to avoid re-processing
     * - Processes deepest containers first to ensure proper propagation
     */
    processScheduledLayouts() {
        if (this.scheduledLayoutUpdates.size === 0) {
            return;
        }

        const sceneController = this.getSceneController();
        if (!sceneController) {
            console.warn('LayoutPropagationManager: SceneController not available');
            this.scheduledLayoutUpdates.clear();
            return;
        }

        // OPTIMIZATION: Build depth cache for this batch
        const containersToProcess = Array.from(this.scheduledLayoutUpdates);
        const depthMap = new Map();

        containersToProcess.forEach(containerId => {
            depthMap.set(containerId, this.getContainerDepthCached(containerId));
        });

        // Sort by container depth (deepest first) using cached depths
        const sorted = containersToProcess.sort((a, b) => {
            return depthMap.get(b) - depthMap.get(a); // Descending order (deepest first)
        });

        // OPTIMIZATION: Collect propagations for next frame instead of re-adding to current batch
        const deferredPropagations = new Set();

        // Update each container — SceneLayoutManager handles mode routing via updateContainer()
        sorted.forEach(containerId => {
            if (!this.objectStateManager?.isLayoutCapableMode(containerId)) {
                return;
            }

            const container = sceneController.getObject(containerId);

            // UNIFIED: Single call — SceneLayoutManager routes by mode internally
            sceneController.updateContainer(containerId);

            this.stats.layoutsProcessed++;

            // OPTIMIZATION: Defer grandparent propagations to next frame
            if (container.parentContainer) {
                if (this.objectStateManager?.isLayoutCapableMode(container.parentContainer)) {
                    deferredPropagations.add(container.parentContainer);
                    this.stats.propagationsDeferred++;
                }
            }
        });

        this.scheduledLayoutUpdates.clear();

        // Process parent propagations synchronously when within nesting depth limit.
        // MAX_NESTING_DEPTH = 2, so at most one parent level needs processing.
        // This eliminates the 1-2 frame delay that caused parent containers to read
        // intermediate child state, resulting in nested container misalignment.
        if (deferredPropagations.size > 0 && (this._propagationDepth || 0) < 2) {
            this._propagationDepth = (this._propagationDepth || 0) + 1;
            try {
                deferredPropagations.forEach(id => this.scheduledLayoutUpdates.add(id));
                this.processScheduledLayouts();
            } finally {
                this._propagationDepth--;
            }
        } else if (deferredPropagations.size > 0) {
            // Fallback for unexpected deep nesting — defer to next frame
            this.nextFramePropagations = new Set([...this.nextFramePropagations, ...deferredPropagations]);

            if (!this.deferredPropagationScheduled) {
                this.deferredPropagationScheduled = true;
                requestAnimationFrame(() => {
                    this.nextFramePropagations.forEach(id => {
                        this.scheduledLayoutUpdates.add(id);
                    });
                    this.nextFramePropagations.clear();
                    this.deferredPropagationScheduled = false;

                    this.processScheduledLayouts();
                });
            }
        }
    }

    /**
     * Get container nesting depth with caching
     *
     * PERFORMANCE: Caches depths to avoid O(d) recalculation for each container during sort
     *
     * @param {string|number} containerId - Container ID
     * @returns {number} Depth (0 for root-level containers)
     */
    getContainerDepthCached(containerId) {
        // Check cache first
        if (this.depthCache.has(containerId)) {
            this.stats.depthCacheHits++;
            return this.depthCache.get(containerId);
        }

        // Calculate and cache
        this.stats.depthCacheMisses++;
        const depth = this.calculateContainerDepth(containerId);
        this.depthCache.set(containerId, depth);
        return depth;
    }

    /**
     * Get container nesting depth (0 for root-level containers)
     * Use getContainerDepthCached() for better performance in batch operations
     *
     * @param {string|number} containerId - Container ID
     * @returns {number} Depth
     */
    getContainerDepth(containerId) {
        return this.calculateContainerDepth(containerId);
    }

    /**
     * Calculate container depth by walking up parent chain
     * @private
     */
    calculateContainerDepth(containerId) {
        const sceneController = this.getSceneController();
        if (!sceneController) {
            return 0;
        }

        let depth = 0;
        let current = sceneController.getObject(containerId);

        while (current?.parentContainer) {
            depth++;
            current = sceneController.getObject(current.parentContainer);

            // Safety check for circular references
            if (depth > 50) {
                console.error('LayoutPropagationManager: Detected circular parent chain for container', containerId);
                break;
            }
        }

        return depth;
    }

    /**
     * Clear depth cache when hierarchy changes
     * Should be called automatically on hierarchy modifications
     */
    clearDepthCache() {
        this.depthCache.clear();
    }

    /**
     * Flush all pending layout updates immediately
     * Useful for testing or when synchronous behavior is needed
     */
    flush() {
        // Cancel any scheduled processing
        this.layoutUpdateScheduled = false;
        this.deferredPropagationScheduled = false;

        // Process all pending layouts
        if (this.scheduledLayoutUpdates.size > 0) {
            this.processScheduledLayouts();
        }

        // Process deferred propagations
        if (this.nextFramePropagations.size > 0) {
            this.nextFramePropagations.forEach(id => {
                this.scheduledLayoutUpdates.add(id);
            });
            this.nextFramePropagations.clear();
            this.processScheduledLayouts();
        }
    }

    /**
     * Get statistics for debugging/monitoring
     */
    getStats() {
        return {
            ...this.stats,
            scheduledCount: this.scheduledLayoutUpdates.size,
            deferredCount: this.nextFramePropagations.size,
            cacheSize: this.depthCache.size,
            cacheHitRate: this.stats.depthCacheHits / (this.stats.depthCacheHits + this.stats.depthCacheMisses) || 0
        };
    }

    /**
     * Reset statistics
     */
    resetStats() {
        this.stats = {
            layoutsScheduled: 0,
            layoutsProcessed: 0,
            propagationsDeferred: 0,
            depthCacheHits: 0,
            depthCacheMisses: 0
        };
    }

    /**
     * Dispose and cleanup
     */
    dispose() {
        this.scheduledLayoutUpdates.clear();
        this.nextFramePropagations.clear();
        this.depthCache.clear();
        this.layoutUpdateScheduled = false;
        this.deferredPropagationScheduled = false;

        console.log('🗑️ LayoutPropagationManager disposed');
    }
}

// Export for global use
if (typeof window !== 'undefined') {
    window.LayoutPropagationManager = LayoutPropagationManager;
}

// Export for Node/module environments
if (typeof module !== 'undefined' && module.exports) {
    module.exports = LayoutPropagationManager;
}
