/**
 * Layout Propagation Manager
 *
 * Extracted from ObjectStateManager for better separation of concerns.
 * Handles bottom-up and deferred hierarchical layout propagation.
 *
 * Responsibilities:
 * - Schedule parent layout updates when children change
 * - Process updates in correct order (deepest first)
 * - Manage depth caching for performance
 * - Defer grandparent propagations to avoid re-processing
 *
 * Version: 1.0.0
 * Part of: Phase 4 - State Management Clarification
 * Extracted from: object-state-manager.js (lines 862-1023)
 */

class LayoutPropagationManager {
    constructor() {
        // Dependencies (lazy-loaded)
        this.sceneController = null;
        this.containerCrudManager = null;
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
     */
    initialize(sceneController, containerCrudManager, objectStateManager = null) {
        this.sceneController = sceneController;
        this.containerCrudManager = containerCrudManager;
        this.objectStateManager = objectStateManager || window.modlerComponents?.objectStateManager;

        console.log('✅ LayoutPropagationManager initialized');
    }

    /**
     * Get dependencies on demand (for testing/flexibility)
     */
    getSceneController() {
        if (!this.sceneController) {
            this.sceneController = window.modlerComponents?.sceneController;
        }
        return this.sceneController;
    }

    getContainerCrudManager() {
        if (!this.containerCrudManager) {
            this.containerCrudManager = window.modlerComponents?.containerCrudManager;
        }
        return this.containerCrudManager;
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

        // Use centralized state machine to check if parent has layout enabled
        if (!this.objectStateManager?.isLayoutMode(childObject.parentContainer)) {
            return; // Parent doesn't have layout enabled
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

        // Update each container's layout
        sorted.forEach(containerId => {
            // Use centralized state machine to check layout mode
            if (!this.objectStateManager?.isLayoutMode(containerId)) {
                return; // Container no longer has layout enabled
            }

            const container = sceneController.getObject(containerId);

            // Trigger layout recalculation
            const layoutResult = sceneController.updateLayout(containerId);
            this.stats.layoutsProcessed++;

            // CRITICAL ARCHITECTURE: Only auto-resize in HUG mode
            // In LAYOUT mode, container size is ground truth - no auto-resize
            if (layoutResult?.success) {
                const containerCrudManager = this.getContainerCrudManager();
                if (containerCrudManager) {
                    // UNIFIED API: Automatically detects mode and applies correct behavior
                    containerCrudManager.resizeContainer(container, {
                        reason: 'child-changed',           // BOTTOM-UP: Child changed
                        layoutBounds: layoutResult.layoutBounds,  // Provide bounds for layout mode
                        immediate: false                   // Already in RAF, no need for immediate
                    });
                }
            }

            // OPTIMIZATION: Defer grandparent propagations to next frame
            if (container.parentContainer) {
                // Use centralized state machine to check if grandparent has layout
                if (this.objectStateManager?.isLayoutMode(container.parentContainer)) {
                    deferredPropagations.add(container.parentContainer);
                    this.stats.propagationsDeferred++;
                }
            }
        });

        this.scheduledLayoutUpdates.clear();

        // Schedule deferred propagations for next frame
        if (deferredPropagations.size > 0) {
            this.nextFramePropagations = new Set([...this.nextFramePropagations, ...deferredPropagations]);

            if (!this.deferredPropagationScheduled) {
                this.deferredPropagationScheduled = true;
                requestAnimationFrame(() => {
                    // Move deferred propagations to scheduled updates
                    this.nextFramePropagations.forEach(id => {
                        this.scheduledLayoutUpdates.add(id);
                    });
                    this.nextFramePropagations.clear();
                    this.deferredPropagationScheduled = false;

                    // Process the propagations
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
