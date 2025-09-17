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
     * @param {THREE.Object3D} object - Object whose container should be updated
     * @param {boolean} realTime - If true, updates immediately; if false, uses throttling
     * @param {Object} throttleState - Throttling state object (lastUpdateTime, interval)
     * @param {THREE.Vector3} newContainerSize - Optional new container size for fill calculations
     * @returns {boolean} True if update was performed
     */
    static updateParentContainer(object, realTime = false, throttleState = null, newContainerSize = null) {
        const sceneController = window.modlerComponents?.sceneController;
        const containerManager = window.modlerComponents?.containerManager;

        if (!sceneController || !containerManager || !object) return false;

        // Apply throttling for real-time updates
        if (!realTime && throttleState) {
            const now = Date.now();
            const interval = throttleState.interval || 50;

            if (throttleState.lastUpdateTime && now - throttleState.lastUpdateTime < interval) {
                return false;
            }
            throttleState.lastUpdateTime = now;
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
            containerManager.resizeContainerToFitChildren(containerData, containerSizeToUse);

            updatedContainers++;
            currentContainerId = containerData.parentContainer;
        }

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
     */
    static syncRelatedMeshes(object, changeType = 'transform') {
        if (!object) return;

        // Update UI system
        if (window.notifyObjectModified) {
            window.notifyObjectModified(object, changeType);
        }

        // Update related meshes through MeshSynchronizer
        const meshSynchronizer = window.modlerComponents?.meshSynchronizer;
        if (meshSynchronizer) {
            meshSynchronizer.syncAllRelatedMeshes(object, changeType);
        }
    }

    /**
     * Create throttling state object for container updates
     *
     * @param {number} interval - Throttling interval in milliseconds (default: 50)
     * @returns {Object} Throttling state object
     */
    static createThrottleState(interval = 50) {
        return {
            lastUpdateTime: 0,
            interval: interval
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
}

// Export for use in tools
window.MovementUtils = MovementUtils;