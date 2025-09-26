/**
 * Movement Utils - Shared Mouse and Container Operations
 *
 * Provides centralized movement and container update utilities shared between
 * face-based tools (MoveTool, PushTool) to eliminate code duplication and
 * ensure consistent behavior patterns.
 *
 * **Shared Functionality:**
 * - Mouse movement calculation and validation
 * - 3D projection and axis movement helpers
 * - Container update coordination with throttling
 * - Snap integration helpers
 *
 * @class MovementUtils
 */
class MovementUtils {
    // Performance monitoring for container updates
    static performanceStats = {
        totalUpdates: 0,
        immediateUpdates: 0,
        throttledUpdates: 0,
        averageUpdateTime: 0,
        lastUpdateTime: 0
    };
    /**
     * Calculate and validate mouse movement
     *
     * @param {Object} inputController - Input controller for mouse position
     * @param {THREE.Vector2} lastMousePosition - Previous mouse position
     * @returns {Object|null} Mouse delta and validation result
     */
    static calculateMouseMovement(inputController, lastMousePosition) {
        if (!inputController || !lastMousePosition || !window.CameraMathUtils) {
            return null;
        }

        const currentMouseNDC = inputController.mouse;
        const mouseDelta = window.CameraMathUtils.calculateMouseDelta(currentMouseNDC, lastMousePosition);

        // Validate significant movement
        if (mouseDelta.length() < 0.001) {
            return null;
        }

        return {
            delta: mouseDelta,
            current: currentMouseNDC,
            previous: lastMousePosition
        };
    }

    /**
     * Calculate 3D world movement using axis constraint
     *
     * @param {THREE.Vector2} mouseDelta - Mouse movement delta
     * @param {THREE.Vector3} objectPosition - Object position for projection
     * @param {THREE.Vector3} constraintAxis - Axis for constrained movement
     * @param {THREE.Camera} camera - Camera for projection calculations
     * @returns {THREE.Vector3|null} World space movement vector
     */
    static calculateWorldMovement(mouseDelta, objectPosition, constraintAxis, camera) {
        if (!mouseDelta || !objectPosition || !constraintAxis || !camera || !window.CameraMathUtils) {
            return null;
        }

        return window.CameraMathUtils.screenDeltaToAxisMovement(
            mouseDelta,
            objectPosition,
            constraintAxis,
            camera
        );
    }

    /**
     * Extract movement along specific axis
     *
     * @param {THREE.Vector3} worldMovement - World space movement vector
     * @param {string} axis - Axis to extract ('x', 'y', or 'z')
     * @returns {number} Movement amount along specified axis
     */
    static getAxisMovement(worldMovement, axis) {
        if (!worldMovement || !axis) return 0;

        switch (axis) {
            case 'x': return worldMovement.x;
            case 'y': return worldMovement.y;
            case 'z': return worldMovement.z;
            default: return 0;
        }
    }

    /**
     * Update parent container with fill-aware resizing support
     *
     * CRITICAL: Shared logic used by both push tool and property panel to ensure identical behavior.
     * This centralizes container update operations to prevent tool-specific behavioral differences.
     *
     * @param {THREE.Object3D} object - Object whose container should be updated
     * @param {boolean} realTime - If true, updates immediately; if false, uses throttling
     * @param {Object} throttleState - Throttling state object (lastUpdateTime, interval)
     * @param {THREE.Vector3} newContainerSize - Optional new container size for fill calculations
     * @param {boolean} immediateVisuals - If true, bypasses throttling for visual updates
     * @param {boolean} preservePosition - If true, containers resize without repositioning
     * @returns {boolean} True if update was performed
     */
    static updateParentContainer(object, realTime = false, throttleState = null, newContainerSize = null, immediateVisuals = false, preservePosition = false) {
        const startTime = performance.now();

        const sceneController = window.modlerComponents?.sceneController;
        const containerCrudManager = window.modlerComponents?.containerCrudManager;

        if (!sceneController || !containerCrudManager || !object) return false;

        // Apply throttling for real-time updates (but allow immediate visual updates to bypass)
        if (!realTime && throttleState && !immediateVisuals) {
            const now = Date.now();
            const interval = throttleState.interval || 16; // Default to 60 FPS

            if (throttleState.lastUpdateTime && now - throttleState.lastUpdateTime < interval) {
                return false;
            }
            throttleState.lastUpdateTime = now;
        }

        // Track immediate visual updates to prevent excessive calls (but be very permissive)
        if (immediateVisuals && throttleState) {
            const now = Date.now();
            // Use very light throttling (1ms) only to prevent same-frame duplicate calls
            if (throttleState.immediateUpdateTime && now - throttleState.immediateUpdateTime < 1) {
                return false; // Allow up to 1000 FPS to prevent same-millisecond duplicates
            }
            throttleState.immediateUpdateTime = now;
        }

        const objectData = sceneController.getObjectByMesh(object);
        if (!objectData || !objectData.parentContainer) return false;

        // Resize parent container chain with fill-aware calculations
        let currentContainerId = objectData.parentContainer;
        let updatedContainers = 0;

        while (currentContainerId) {
            const containerData = sceneController.getObject(currentContainerId);
            if (!containerData) break;

            // For the immediate parent, pass the new container size for fill calculations
            const containerSizeToUse = (updatedContainers === 0) ? newContainerSize : null;
            const resizeSuccess = containerCrudManager.resizeContainerToFitChildren(containerData, containerSizeToUse, preservePosition, immediateVisuals);

            // Container visibility and padding are handled by selection visualizer - don't override here

            updatedContainers++;
            currentContainerId = containerData.parentContainer;
        }

        // Track performance stats
        const endTime = performance.now();
        const updateTime = endTime - startTime;

        this.performanceStats.totalUpdates++;
        if (immediateVisuals) {
            this.performanceStats.immediateUpdates++;
        } else {
            this.performanceStats.throttledUpdates++;
        }

        // Update average time (running average)
        this.performanceStats.averageUpdateTime =
            (this.performanceStats.averageUpdateTime * (this.performanceStats.totalUpdates - 1) + updateTime) /
            this.performanceStats.totalUpdates;

        this.performanceStats.lastUpdateTime = updateTime;

        return updatedContainers > 0;
    }

    /**
     * Handle snap detection integration
     *
     * @param {Object} snapController - Snap controller instance
     * @param {string} toolName - Tool name for snap behavior
     * @param {Array} objects - Objects to exclude from snapping
     * @param {THREE.Vector3} constraintAxis - Movement constraint axis
     * @returns {Object|null} Current snap point if any
     */
    static handleSnapDetection(snapController, toolName, objects, constraintAxis, geometricConstraints = null) {
        if (!snapController || !snapController.getEnabled()) return null;

        snapController.updateSnapDetection(toolName, objects, constraintAxis, geometricConstraints);
        return snapController.getCurrentSnapPoint();
    }


    /**
     * Synchronize related meshes after object modification
     *
     * @param {THREE.Object3D} object - Object that was modified
     * @param {string} changeType - Type of change ('transform' or 'geometry')
     * @param {boolean} immediateVisuals - If true, use immediate sync for visual feedback
     */
    static syncRelatedMeshes(object, changeType = 'transform', immediateVisuals = false) {
        if (!object) return;

        // Update UI system
        if (window.notifyObjectModified) {
            window.notifyObjectModified(object, changeType);
        }

        // Support meshes are now children and inherit transforms automatically
    }

    /**
     * Create throttling state object for container updates
     *
     * @param {number} interval - Throttling interval in milliseconds (default: 16 for 60 FPS)
     * @returns {Object} Throttling state object
     */
    static createThrottleState(interval = 16) {
        return {
            lastUpdateTime: 0,
            interval: interval,
            immediateUpdateTime: 0 // Track immediate updates separately
        };
    }

    /**
     * Validate movement prerequisites for tools
     *
     * @param {Object} options - Validation options
     * @returns {boolean} True if all prerequisites are met
     */
    static validateMovementPrerequisites(options) {
        const {
            inputController,
            camera,
            object,
            lastMousePosition
        } = options;

        return !!(
            inputController &&
            camera &&
            object &&
            lastMousePosition &&
            window.CameraMathUtils
        );
    }

    /**
     * Get performance statistics for container updates
     * @returns {Object} Performance statistics
     */
    static getPerformanceStats() {
        return {
            ...this.performanceStats,
            cacheStats: window.PositionTransform?.boundsCache?.size || 0
        };
    }

    /**
     * Reset performance statistics
     */
    static resetPerformanceStats() {
        this.performanceStats = {
            totalUpdates: 0,
            immediateUpdates: 0,
            throttledUpdates: 0,
            averageUpdateTime: 0,
            lastUpdateTime: 0
        };
    }
}

// Export for use in tools
window.MovementUtils = MovementUtils;