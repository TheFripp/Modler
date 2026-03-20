/**
 * Push Tool - Face-Based Geometry Modification (Simplified)
 *
 * Unified approach for both containers and regular objects using vertex manipulation.
 * Face highlight tracks the moving face for seamless visual feedback.
 */
class PushTool {
    constructor(selectionController, visualEffects) {
        this.selectionController = selectionController;
        this.visualEffects = visualEffects;
        this.faceToolBehavior = new BaseFaceToolBehavior(selectionController, visualEffects, 'push');
        this.eventHandler = new BaseFaceToolEventHandler(this, this.faceToolBehavior, selectionController);

        // Core push state
        this.isPushing = false;
        this.pushedObject = null;
        this.pushedFace = null;
        this.faceNormal = null;
        this.pushAxis = null;
        this.pushDirection = 1;

        // Movement tracking
        this.startMousePos = null;
        this.lastMousePos = null;
        this.cumulativeAmount = 0;

        // Undo state
        this.initialDimensions = null;
        this.initialPosition = null;

        // State management
        this.objectStateManager = null;
        setTimeout(() => {
            this.objectStateManager = window.modlerComponents?.objectStateManager;
        }, 50);
    }

    onHover(hit, isAltPressed) {
        if (this.isPushing) {
            // During push, update push movement
            this.updatePush();

            // Show measurement overlay if Alt pressed during push
            if (isAltPressed) {
                const measurementTool = window.modlerComponents?.measurementTool;
                if (measurementTool && this.pushedObject && this.pushAxis) {
                    measurementTool.showPushMeasurement(this.pushedObject, this.pushAxis);
                }
            } else {
                // Clear measurement when Alt released
                const measurementTool = window.modlerComponents?.measurementTool;
                if (measurementTool) {
                    measurementTool.clearMeasurement();
                }
            }
        } else {
            // Normal hover behavior - check for measurement mode
            if (isAltPressed) {
                // Measurement mode - show edge/distance measurements
                const measurementTool = window.modlerComponents?.measurementTool;
                if (measurementTool) {
                    const selectedObjects = this.selectionController?.getSelectedObjects() || [];
                    measurementTool.onHover(hit, selectedObjects);
                }
            } else {
                // Normal face highlighting
                const measurementTool = window.modlerComponents?.measurementTool;
                if (measurementTool) {
                    measurementTool.clearMeasurement();
                }

                if (this.shouldShowFaceHighlight(hit)) {
                    this.faceToolBehavior.handleFaceDetection(hit);
                } else {
                    this.faceToolBehavior.clearHover();
                }
            }
        }
    }

    shouldShowFaceHighlight(hit) {
        if (!hit || !hit.object) return false;

        const targetObject = this.faceToolBehavior.getTargetObject(hit);
        if (!targetObject) return false;

        // Let base-face-tool-behavior handle showing disabled state for containers in hug mode
        // The actual push operation blocking happens in startPush()
        return true;
    }

    onMouseDown(hit, event) {
        const operationCallbacks = BaseFaceToolEventHandler.createOperationCallbacks({
            isActiveCheck: () => this.isPushing,
            startCallback: (hit) => this.startPush(hit),
            operationName: 'push'
        });
        return this.eventHandler.handleMouseDown(hit, event, operationCallbacks);
    }

    onMouseUp(hit, event) {
        // Check if we're pushing and if there was significant movement
        const wasPushing = this.isPushing;
        const hadSignificantMovement = wasPushing && Math.abs(this.cumulativeAmount) > 0.001;

        const operationCallbacks = BaseFaceToolEventHandler.createOperationCallbacks({
            isActiveCheck: () => this.isPushing,
            endCallback: () => this.stopPush()
        });

        const handled = this.eventHandler.handleMouseUp(hit, event, operationCallbacks);

        // If we ended a push but didn't move significantly, allow click/double-click processing
        // This enables double-click navigation even when face highlighting started a push
        if (handled && !hadSignificantMovement) {
            return false; // Allow InputController to process as click/double-click
        }

        return handled;
    }

    onClick(hit, event) {
        const operationCallbacks = BaseFaceToolEventHandler.createOperationCallbacks({
            isActiveCheck: () => this.isPushing
        });
        this.eventHandler.handleClick(hit, event, operationCallbacks);
    }

    onDoubleClick(hit, event) {
        // If actively pushing, stop the operation
        if (this.isPushing) {
            this.stopPush();
            return;
        }

        // Otherwise, handle container navigation (double-click to step into container)
        const operationCallbacks = { isOperationActive: () => this.isPushing };
        this.eventHandler.handleDoubleClick(hit, event, operationCallbacks);
    }

    /**
     * Start push operation
     */
    startPush(hit) {
        const targetObject = this.faceToolBehavior.getTargetObject(hit);
        if (!targetObject) return;

        // Block push operation on containers in hug mode
        const sceneController = window.modlerComponents?.sceneController;
        if (sceneController && targetObject.userData?.id) {
            const objectData = sceneController.getObjectByMesh(targetObject);
            if (objectData?.isContainer) {
                // Use centralized state machine
                const containerMode = this.objectStateManager?.getContainerMode(objectData.id);
                if (containerMode === 'hug') {
                    // Container is in hug mode - cannot push
                    console.log('⚠️ Push blocked: Container is in hug mode');
                    return;
                }
            }
        }

        this.isPushing = true;
        this.pushedObject = targetObject;
        this.pushedFace = hit.face;
        this.cumulativeAmount = 0;

        // Register operation with FileManager to prevent auto-save during drag
        const fileManager = window.modlerComponents?.fileManager;
        if (fileManager && typeof fileManager.registerOperation === 'function') {
            fileManager.registerOperation('push-tool-drag');
        }

        // Disable hug updates during push to prevent interference
        if (sceneController && typeof sceneController.disableHugUpdates === 'function') {
            sceneController.disableHugUpdates();
        }

        // Face highlight stays visible during push
        // Note: It may visually lag slightly during fast drags as it's positioned at face center
        // which changes as vertices move. Wireframe provides accurate feedback.
        // Face highlight repositions correctly when push completes.

        // Get face normal in world space
        const worldNormal = this.faceToolBehavior.getWorldFaceNormal(hit);
        this.faceNormal = worldNormal;

        // Determine push axis and direction
        this.determinePushAxis(worldNormal);

        // Store initial state for undo
        const objectData = sceneController?.getObjectByMesh(targetObject);
        if (objectData) {
            this.initialDimensions = objectData.dimensions ? { ...objectData.dimensions } : null;
            this.initialPosition = targetObject.position ? {
                x: targetObject.position.x,
                y: targetObject.position.y,
                z: targetObject.position.z
            } : null;
        }

        // Store initial mouse position
        const inputController = window.modlerComponents?.inputController;
        if (inputController) {
            this.startMousePos = inputController.mouse.clone();
            this.lastMousePos = inputController.mouse.clone();
        }

        // Enable snap detection
        const snapController = window.modlerComponents?.snapController;
        if (snapController) {
            snapController.requestSnapDetection();
        }

        // Set cursor
        const canvas = window.modlerComponents?.sceneFoundation?.canvas;
        if (canvas) {
            canvas.style.cursor = 'move';
        }
    }

    /**
     * Determine push axis and direction from face normal
     */
    determinePushAxis(normal) {
        const absX = Math.abs(normal.x);
        const absY = Math.abs(normal.y);
        const absZ = Math.abs(normal.z);

        if (absX > absY && absX > absZ) {
            this.pushAxis = 'x';
            this.pushDirection = normal.x > 0 ? 1 : -1;
        } else if (absY > absX && absY > absZ) {
            this.pushAxis = 'y';
            this.pushDirection = normal.y > 0 ? 1 : -1;
        } else {
            this.pushAxis = 'z';
            this.pushDirection = normal.z > 0 ? 1 : -1;
        }
    }

    /**
     * Update push during mouse movement
     */
    updatePush() {
        const delta = this.calculateMovementDelta();
        if (!delta || Math.abs(delta) < 0.0001) return;

        // Modify geometry using unified approach
        this.modifyGeometry(delta);

        // Track face highlight to follow pushed face
        this.updateFaceHighlight(delta);

        // Update container layout if needed
        this.updateContainerLayout();
    }

    /**
     * Calculate movement delta from mouse movement
     */
    calculateMovementDelta() {
        const inputController = window.modlerComponents?.inputController;
        const camera = window.modlerComponents?.sceneFoundation?.camera;

        if (!inputController || !camera || !this.lastMousePos) return null;

        const currentMouse = inputController.mouse;
        const mouseDelta = new THREE.Vector2().subVectors(currentMouse, this.lastMousePos);

        if (mouseDelta.length() < 0.0001) return null;

        // Project mouse movement to world space
        const worldMovement = MovementUtils.calculateWorldMovement(
            mouseDelta,
            this.pushedObject.position,
            this.faceNormal,
            camera
        );

        if (!worldMovement) return null;

        // Get movement along push axis
        let axisDelta = MovementUtils.getAxisMovement(worldMovement, this.pushAxis);

        // Negate delta for negative-facing faces on all axes
        // When pushing a negative face (left/bottom/back), the mouse delta calculation
        // produces inverted values, so we need to negate them
        if (this.pushDirection === -1) {
            axisDelta = -axisDelta;
        }

        this.lastMousePos.copy(currentMouse);
        this.cumulativeAmount += axisDelta;

        return axisDelta;
    }

    /**
     * Modify geometry using unified resize system
     */
    modifyGeometry(delta) {
        if (!this.pushedObject || Math.abs(delta) < 0.0001) return;

        const geometryUtils = window.GeometryUtils;
        if (!geometryUtils) {
            console.warn('PushTool: GeometryUtils not available');
            return;
        }

        // Get current dimensions
        const currentDims = geometryUtils.getGeometryDimensions(this.pushedObject.geometry);
        if (!currentDims) return;

        // Calculate new dimension after delta
        const newDimension = currentDims[this.pushAxis] + delta;

        // Enforce minimum dimension (0.1 units)
        const MIN_DIMENSION = 0.1;
        if (newDimension < MIN_DIMENSION) {
            return; // Don't allow dimensions smaller than minimum
        }

        // Check minimum size for containers in layout mode
        const sceneController = window.modlerComponents?.sceneController;
        if (sceneController && this.pushedObject.userData?.id) {
            const objectData = sceneController.getObjectByMesh(this.pushedObject);
            // Use centralized state machine
            if (objectData?.isContainer && this.objectStateManager?.isLayoutMode(objectData.id)) {
                // Get minimum size needed to contain all children
                const children = sceneController.getChildObjects(objectData.id);

                if (children.length > 0) {
                    const minSize = this.calculateMinimumContainerSize(children, this.pushAxis, objectData.autoLayout);

                    if (newDimension < minSize) {
                        // Don't allow pushing smaller than contents
                        return;
                    }
                }
            }
        }

        // Check if this is a container or child in layout container
        const objectData2 = sceneController?.getObjectByMesh(this.pushedObject);
        const isContainer = objectData2?.isContainer;

        // Determine anchor mode from the CLICKED FACE, not the drag direction
        // The face you clicked should be the one that moves, regardless of drag direction
        // pushDirection > 0: clicked max face (positive normal) → keep min face fixed
        // pushDirection < 0: clicked min face (negative normal) → keep max face fixed
        let anchorMode = this.pushDirection > 0 ? 'min' : 'max';

        // Check if this object is inside a layout-enabled container with alignment
        if (!isContainer && objectData2?.parentContainer && sceneController) {
            const parent = sceneController.getObject(objectData2.parentContainer);
            // Use centralized state machine
            if (this.objectStateManager?.isLayoutMode(parent?.id) && parent.autoLayout.alignment) {
                const alignment = parent.autoLayout.alignment[this.pushAxis];

                // If center-aligned on this axis: use 'center' mode for symmetric expansion
                // If edge-aligned: use normal behavior (pushed face moves, opposite stays)
                if (alignment === 'center') {
                    anchorMode = 'center';
                }
            }
        }

        // UNIFIED APPROACH: Use vertex manipulation for both containers and objects
        // Layout engine handles all child positioning/sizing based on container size
        const success = geometryUtils.resizeGeometry(
            this.pushedObject.geometry,
            this.pushAxis,
            newDimension,
            anchorMode
        );

        if (success) {

            // Update all support meshes (wireframes, etc.) - unified for containers and objects
            geometryUtils.updateSupportMeshGeometries(this.pushedObject, false);

            // Update scene data dimensions and position through ObjectStateManager
            if (sceneController && this.pushedObject.userData?.id) {
                const finalObjectData = objectData2 || objectData;
                if (finalObjectData) {
                    const dims = geometryUtils.getGeometryDimensions(this.pushedObject.geometry);

                    // Update through ObjectStateManager to preserve all properties (like autoLayout)
                    const objectStateManager = window.modlerComponents?.objectStateManager;
                    if (objectStateManager) {
                        const updates = {
                            dimensions: { x: dims.x, y: dims.y, z: dims.z }
                        };

                        // Update position for containers
                        if (isContainer) {
                            updates.position = {
                                x: this.pushedObject.position.x,
                                y: this.pushedObject.position.y,
                                z: this.pushedObject.position.z
                            };
                        }

                        // Pass 'push-tool' as source to suppress parent layout updates during drag
                        // Layout will be updated once when push is complete
                        objectStateManager.updateObject(finalObjectData.id, updates, 'push-tool');
                    }
                    // Dimensions automatically updated via DimensionManager getter from geometry
                }
            }
        }
    }

    /**
     * Update face highlight to track pushed face
     * Note: We hide it during push since the wireframe provides visual feedback
     */
    updateFaceHighlight(delta) {
        // Update face highlight to follow the pushed face
        // The face highlight needs to be repositioned as the geometry changes
        const geometryUtils = window.GeometryUtils;
        if (geometryUtils && this.pushedObject) {
            // Update face highlight position (but not full geometry rebuild during drag)
            geometryUtils.updateSupportMeshGeometries(this.pushedObject, true);
        }
    }

    /**
     * Update container layout for containers in layout mode
     * Called during push to recalculate child positions/sizes based on new container size
     */
    updateContainerLayout() {
        const sceneController = window.modlerComponents?.sceneController;
        if (!sceneController || !this.pushedObject?.userData?.id) return;

        const objectData = sceneController.getObjectByMesh(this.pushedObject);
        // Use centralized state machine
        if (!objectData?.isContainer || !this.objectStateManager?.isLayoutMode(objectData.id)) return;

        // Let layout engine handle all positioning and sizing
        // It will recalculate based on new container size:
        // - Fill objects resize on their fill axes
        // - Fixed objects maintain size
        // - All objects reposition based on alignment
        // - Gaps adjust if no fill objects
        const pushContext = { axis: this.pushAxis };
        sceneController.updateLayout(objectData.id, pushContext);
    }

    /**
     * Update dimension display in property panel
     */
    updateDimensionDisplay() {
        if (!this.objectStateManager || !this.pushedObject.userData?.id) return;

        const geometryUtils = window.GeometryUtils;
        if (!geometryUtils) return;

        const dimensions = geometryUtils.getGeometryDimensions(this.pushedObject.geometry);
        if (dimensions) {
            this.objectStateManager.updateObject(this.pushedObject.userData.id, {
                dimensions: { x: dimensions.x, y: dimensions.y, z: dimensions.z }
            });
        }
    }

    /**
     * Stop push operation and finalize
     */
    stopPush() {
        if (!this.isPushing) return;

        const pushedObject = this.pushedObject;

        // Re-enable hug updates
        const sceneController = window.modlerComponents?.sceneController;
        if (sceneController && typeof sceneController.enableHugUpdates === 'function') {
            sceneController.enableHugUpdates();
        }

        // Finalize geometry and recalculate face highlight position
        if (pushedObject) {
            const geometryUtils = window.GeometryUtils;
            if (geometryUtils) {
                // Now update face highlight for final geometry (updateFaceHighlight = true)
                geometryUtils.updateSupportMeshGeometries(pushedObject, true);
            }

            // Recenter geometry to keep rotation pivot at geometric center
            if (geometryUtils && pushedObject.geometry) {
                // Calculate current bounding box center
                pushedObject.geometry.computeBoundingBox();
                const boundingBox = pushedObject.geometry.boundingBox;
                const geometryCenter = new THREE.Vector3();
                boundingBox.getCenter(geometryCenter);

                // Offset geometry so its center is at origin
                pushedObject.geometry.translate(-geometryCenter.x, -geometryCenter.y, -geometryCenter.z);

                // Recompute bounding box and attributes after translation
                pushedObject.geometry.computeBoundingBox();
                pushedObject.geometry.computeBoundingSphere();
                if (pushedObject.geometry.attributes.position) {
                    pushedObject.geometry.attributes.position.needsUpdate = true;
                }

                // Adjust mesh position to compensate (in world space)
                const worldOffset = geometryCenter.clone().applyMatrix4(
                    new THREE.Matrix4().extractRotation(pushedObject.matrixWorld)
                );
                pushedObject.position.add(worldOffset);

                // CRITICAL: Adjust children positions to compensate for container movement
                // Children already have correct alignment from real-time adjustments during push
                // We just need standard compensation for the geometry recentering
                if (sceneController && pushedObject.userData?.id) {
                    const children = sceneController.getChildObjects(pushedObject.userData.id);
                    children.forEach(child => {
                        if (child.mesh) {
                            child.mesh.position.sub(geometryCenter);
                        }
                    });
                }

                // Update matrices
                pushedObject.updateMatrix();
                pushedObject.updateMatrixWorld(true);

                // Final dimension update AFTER recentering
                // Source 'push-tool' tells ObjectStateManager to skip layout update
                // Positions stay fixed, fill objects already resized during drag
                if (this.objectStateManager && pushedObject.userData?.id) {
                    const dimensions = geometryUtils.getGeometryDimensions(pushedObject.geometry);
                    if (dimensions) {
                        this.objectStateManager.updateObject(pushedObject.userData.id, {
                            dimensions: { x: dimensions.x, y: dimensions.y, z: dimensions.z },
                            position: { x: pushedObject.position.x, y: pushedObject.position.y, z: pushedObject.position.z }
                        }, 'push-tool');
                    }
                }
            }

            // Trigger final container update now that push is complete
            if (sceneController && pushedObject.userData?.id) {
                const objectData = sceneController.getObjectByMesh(pushedObject);

                // If this is a hug container, update its size (using centralized state machine)
                if (this.objectStateManager?.isHugMode(objectData?.id)) {
                    sceneController.updateHugContainerSize(objectData.id);
                }

                // If object is inside a layout container, trigger final layout update
                // No pushContext needed - children are already correctly positioned
                if (objectData?.parentContainer) {
                    // Use centralized state machine
                    if (this.objectStateManager?.isLayoutMode(objectData.parentContainer)) {
                        sceneController.updateLayout(objectData.parentContainer);
                    }
                }
            }

            // Register undo action
            this.registerUndoAction(pushedObject);

            // Record manipulation for Tab key focus (dimensions along push axis)
            // Include push direction so property panel knows which face to keep stationary
            if (window.inputFocusManager && pushedObject.userData?.id && this.pushAxis) {
                window.inputFocusManager.recordManipulation(
                    pushedObject.userData.id,
                    `dimensions.${this.pushAxis}`,
                    { pushDirection: this.pushDirection, pushAxis: this.pushAxis }
                );
            }
        }

        // Clear hover state
        this.faceToolBehavior.clearHover();

        // Reset state
        this.resetState();

        // Unregister operation with FileManager (allow auto-save again)
        const fileManager = window.modlerComponents?.fileManager;
        if (fileManager && typeof fileManager.unregisterOperation === 'function') {
            fileManager.unregisterOperation('push-tool-drag');
        }

        // Reset cursor
        const canvas = window.modlerComponents?.sceneFoundation?.canvas;
        if (canvas) {
            canvas.style.cursor = 'default';
        }
    }

    /**
     * Register undo action for history
     */
    registerUndoAction(pushedObject) {
        const historyManager = window.modlerComponents?.historyManager;
        if (!historyManager) return;

        const geometryUtils = window.GeometryUtils;
        const finalDimensions = geometryUtils?.getGeometryDimensions(pushedObject.geometry);
        const finalPosition = {
            x: pushedObject.position.x,
            y: pushedObject.position.y,
            z: pushedObject.position.z
        };

        if (this.initialDimensions && finalDimensions && this.initialPosition) {
            // Check if dimensions or position actually changed
            const dimensionsChanged =
                Math.abs(finalDimensions.x - this.initialDimensions.x) > 0.001 ||
                Math.abs(finalDimensions.y - this.initialDimensions.y) > 0.001 ||
                Math.abs(finalDimensions.z - this.initialDimensions.z) > 0.001;

            const positionChanged =
                Math.abs(finalPosition.x - this.initialPosition.x) > 0.001 ||
                Math.abs(finalPosition.y - this.initialPosition.y) > 0.001 ||
                Math.abs(finalPosition.z - this.initialPosition.z) > 0.001;

            if (dimensionsChanged || positionChanged) {
                // Calculate push distance based on dimension change along push axis
                let pushDistance = 0;
                if (this.pushAxis) {
                    const axis = this.pushAxis.toLowerCase();
                    pushDistance = (finalDimensions[axis] - this.initialDimensions[axis]) * this.pushDirection;
                }

                // ARCHITECTURAL FIX: Use PushFaceCommand for proper undo/redo with all required parameters
                const command = new PushFaceCommand(
                    pushedObject.userData.id,
                    this.faceNormal,
                    pushDistance,
                    this.initialDimensions,
                    finalDimensions,
                    this.initialPosition,
                    finalPosition
                );
                historyManager.executeCommand(command);
            }
        }
    }

    /**
     * Calculate minimum container size to fit all children
     * CRITICAL: Only considers non-fill objects, since fill objects resize to fit
     */
    calculateMinimumContainerSize(children, axis, autoLayout) {
        const layoutEngine = window.LayoutEngine;
        if (!layoutEngine || !autoLayout) {
            return 0;
        }

        // Calculate the minimum size needed along the layout axis
        const direction = autoLayout.direction;
        const paddingValue = autoLayout.padding || 0;

        // CRITICAL: In space-between mode (no fill objects), gaps are flexible (can be zero)
        // Only use fixed gap when there are fill objects
        const sizeProperty = `size${axis.toUpperCase()}`;
        const hasFillObjects = children.some(child =>
            child.layoutProperties?.[sizeProperty] === 'fill'
        );
        const gap = hasFillObjects ? (autoLayout.gap || 0) : 0;

        // CRITICAL FIX: Padding might be an object {top, right, bottom, left} or a number
        // For the given axis, we need to extract the appropriate padding values
        let paddingStart = 0;
        let paddingEnd = 0;

        if (typeof paddingValue === 'object' && paddingValue !== null) {
            // Padding is an object - extract values based on axis
            if (axis === 'x') {
                paddingStart = paddingValue.left || 0;
                paddingEnd = paddingValue.right || 0;
            } else if (axis === 'y') {
                paddingStart = paddingValue.bottom || 0;
                paddingEnd = paddingValue.top || 0;
            } else if (axis === 'z') {
                paddingStart = paddingValue.front || 0;
                paddingEnd = paddingValue.back || 0;
            }
        } else if (typeof paddingValue === 'number') {
            // Padding is a single number - use for both sides
            paddingStart = paddingValue;
            paddingEnd = paddingValue;
        }

        const totalPadding = paddingStart + paddingEnd;
        let minSize = totalPadding; // Start with padding on both sides

        // Filter children into fill and non-fill groups using centralized state machine
        const nonFillChildren = children.filter(child => {
            return this.objectStateManager?.getChildSizeMode(child.id, axis) !== 'fill';
        });
        const fillChildren = children.filter(child => {
            return this.objectStateManager?.getChildSizeMode(child.id, axis) === 'fill';
        });

        if (direction === axis) {
            // Layout direction matches push axis

            // Sum all non-fill child sizes (actual space needed)
            nonFillChildren.forEach((child, index) => {
                const childDims = child.dimensions || { x: 1, y: 1, z: 1 };
                minSize += childDims[axis];
            });

            // CRITICAL FIX: Add minimum size for fill objects (0.1 units each)
            // Fill objects don't contribute their current size to minimum,
            // but they still need their enforced minimum space (matches layout-engine.js behavior)
            const MIN_FILL_SIZE = 0.1;
            minSize += fillChildren.length * MIN_FILL_SIZE;

            // Add gaps between ALL children (including fill objects)
            if (children.length > 1) {
                minSize += gap * (children.length - 1);
            }
        } else {
            // Layout direction perpendicular to push axis

            // Find maximum non-fill child size on this axis
            let maxChildSize = 0;
            nonFillChildren.forEach(child => {
                const childDims = child.dimensions || { x: 1, y: 1, z: 1 };
                maxChildSize = Math.max(maxChildSize, childDims[axis]);
            });

            // Check fill objects ONLY if they're NOT filled on the push axis
            // If they're filled on push axis, they'll shrink with container
            fillChildren.forEach(child => {
                // Use centralized state machine to check if filled on push axis
                const isFillOnPushAxis = this.objectStateManager?.hasFillEnabled(child.id, axis);
                if (!isFillOnPushAxis) {
                    const childDims = child.dimensions || { x: 1, y: 1, z: 1 };
                    maxChildSize = Math.max(maxChildSize, childDims[axis]);
                }
                // If filled on push axis, use minimum (0.1)
                else {
                    maxChildSize = Math.max(maxChildSize, 0.1);
                }
            });

            minSize += maxChildSize;
        }

        return minSize;
    }

    /**
     * Reset tool state
     */
    resetState() {
        this.isPushing = false;
        this.pushedObject = null;
        this.pushedFace = null;
        this.faceNormal = null;
        this.pushAxis = null;
        this.pushDirection = 1;
        this.startMousePos = null;
        this.lastMousePos = null;
        this.cumulativeAmount = 0;
        this.initialDimensions = null;
        this.initialPosition = null;
    }

    /**
     * Cleanup on tool deactivation
     */
    deactivate() {
        if (this.isPushing) {
            this.stopPush();
        }
        this.faceToolBehavior.clearHover();
    }

    /**
     * Check if tool has active face highlighting
     */
    hasActiveHighlight() {
        return this.faceToolBehavior.hasActiveHighlight();
    }

    /**
     * Get tool name
     */
    getName() {
        return 'PushTool';
    }
}

// Export
window.PushTool = PushTool;
