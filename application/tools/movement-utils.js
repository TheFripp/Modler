import * as THREE from 'three';
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

    // REMOVED: updateParentContainer() - migrated to ContainerCrudManager.resizeContainer()
    // All callers should now use the unified API with semantic reason parameters

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

        // Emit direct ObjectEventBus event for unified notification system
        if (window.objectEventBus) {
            if (changeType === 'geometry') {
                window.objectEventBus.emit(
                    window.objectEventBus.EVENT_TYPES.GEOMETRY,
                    object.id,
                    { changeType: 'geometry' },
                    { source: 'movement-utils', throttle: true }
                );
            } else {
                window.objectEventBus.emit(
                    window.objectEventBus.EVENT_TYPES.TRANSFORM,
                    object.id,
                    { changeType: 'transform' },
                    { source: 'movement-utils', throttle: true }
                );
            }
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

    /**
     * Handle Alt-key measurement mode in tool onHover methods.
     * Shows edge/distance measurements when Alt is pressed, clears when released.
     *
     * @param {boolean} isAltPressed - Whether Alt key is held
     * @param {Object} hit - Current raycast hit
     * @param {Object} selectionController - Selection controller for selected objects
     * @returns {boolean} True if measurement mode handled the event (caller should return)
     */
    static handleMeasurementMode(isAltPressed, hit, selectionController) {
        const measurementTool = window.modlerComponents?.measurementTool;
        if (!measurementTool) return false;

        if (isAltPressed) {
            const selectedObjects = selectionController?.getSelectedObjects() || [];
            measurementTool.onHover(hit, selectedObjects);
            return true;
        }

        measurementTool.clearMeasurement();
        return false;
    }

    /**
     * Register a drag operation with FileManager to prevent auto-save during drag.
     * @param {string} operationName - Name of the operation (e.g., 'move-tool-drag')
     */
    static registerFileOperation(operationName) {
        const fileManager = window.modlerComponents?.fileManager;
        if (fileManager && typeof fileManager.registerOperation === 'function') {
            fileManager.registerOperation(operationName);
        }
    }

    /**
     * Unregister a drag operation with FileManager to allow auto-save again.
     * @param {string} operationName - Name of the operation to unregister
     */
    static unregisterFileOperation(operationName) {
        const fileManager = window.modlerComponents?.fileManager;
        if (fileManager?.unregisterOperation) {
            fileManager.unregisterOperation(operationName);
        }
    }

    /**
     * Get dominant axis from cumulative movement object (for Tab key focus)
     * @param {{ x: number, y: number, z: number }} movement - Cumulative movement per axis
     * @returns {string} 'x', 'y', or 'z'
     */
    static getDominantAxisFromMovement(movement) {
        if (movement.x > movement.y && movement.x > movement.z) return 'x';
        if (movement.y > movement.z) return 'y';
        return 'z';
    }
}

// Export for use in tools
window.MovementUtils = MovementUtils;