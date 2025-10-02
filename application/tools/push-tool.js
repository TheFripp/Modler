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

    onHover(hit) {
        if (this.isPushing) {
            // During push, only update push movement - don't update face highlighting
            // Face highlight is being tracked separately via trackFaceHighlightToPushedFace
            this.updatePush();
        } else {
            // Normal hover behavior when not pushing
            if (this.shouldShowFaceHighlight(hit)) {
                this.faceToolBehavior.handleFaceDetection(hit);
            } else {
                this.faceToolBehavior.clearHover();
            }
        }
    }

    shouldShowFaceHighlight(hit) {
        if (!hit || !hit.object) return false;

        const targetObject = this.faceToolBehavior.getTargetObject(hit);
        if (!targetObject) return false;

        // Check if this is a container
        const sceneController = window.modlerComponents?.sceneController;
        if (sceneController && targetObject.userData?.id) {
            const objectData = sceneController.getObjectByMesh(targetObject);
            if (objectData?.isContainer) {
                // Only allow push on containers in layout mode
                const isLayoutEnabled = objectData.autoLayout?.enabled;
                if (!isLayoutEnabled) {
                    return false; // Block containers in hug mode
                }
            } else if (objectData && !objectData.isContainer) {
                // Block child objects inside layout-enabled containers
                if (objectData.parentContainer) {
                    const parent = sceneController.getObject(objectData.parentContainer);
                    if (parent?.autoLayout?.enabled) {
                        return false;
                    }
                }
            }
        }

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
        const operationCallbacks = BaseFaceToolEventHandler.createOperationCallbacks({
            isActiveCheck: () => this.isPushing,
            endCallback: () => this.stopPush()
        });
        return this.eventHandler.handleMouseUp(hit, event, operationCallbacks);
    }

    onClick(hit, event) {
        const operationCallbacks = BaseFaceToolEventHandler.createOperationCallbacks({
            isActiveCheck: () => this.isPushing
        });
        this.eventHandler.handleClick(hit, event, operationCallbacks);
    }

    onDoubleClick(hit, event) {
        if (this.isPushing) {
            this.stopPush();
        }
    }

    /**
     * Start push operation
     */
    startPush(hit) {
        const targetObject = this.faceToolBehavior.getTargetObject(hit);
        if (!targetObject) return;

        this.isPushing = true;
        this.pushedObject = targetObject;
        this.pushedFace = hit.face;
        this.cumulativeAmount = 0;

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
        const sceneController = window.modlerComponents?.sceneController;
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

        // Note: Don't call updateDimensionDisplay() during drag - it triggers
        // objectStateManager.updateObject() which calls updateObjectDimensions()
        // which resets the geometry to centered bounds via scaleGeometryAlongAxis().
        // We update dimensions directly in modifyGeometry() and finalize in stopPush().
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
        const axisDelta = MovementUtils.getAxisMovement(worldMovement, this.pushAxis);

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

        // Check minimum size for containers in layout mode
        const sceneController = window.modlerComponents?.sceneController;
        if (sceneController && this.pushedObject.userData?.id) {
            const objectData = sceneController.getObjectByMesh(this.pushedObject);
            if (objectData?.isContainer && objectData.autoLayout?.enabled) {
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

        // Determine anchor mode from push direction
        // pushDirection > 0 means pushing +face, so MIN face stays fixed
        // pushDirection < 0 means pushing -face, so MAX face stays fixed
        const anchorMode = this.pushDirection > 0 ? 'min' : 'max';

        // Use unified resize with anchor mode
        const success = geometryUtils.resizeGeometry(
            this.pushedObject.geometry,
            this.pushAxis,
            newDimension,
            anchorMode
        );

        if (success) {

            // Update all support meshes (wireframes, etc.) - unified for containers and objects
            geometryUtils.updateSupportMeshGeometries(this.pushedObject, false);

            // Update scene data dimensions
            const sceneController = window.modlerComponents?.sceneController;
            if (sceneController && this.pushedObject.userData?.id) {
                const objectData = sceneController.getObjectByMesh(this.pushedObject);
                if (objectData) {
                    const dims = geometryUtils.getGeometryDimensions(this.pushedObject.geometry);
                    objectData.dimensions = { x: dims.x, y: dims.y, z: dims.z };
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
     * Called during push to provide real-time visual feedback for fill objects
     */
    updateContainerLayout() {
        const sceneController = window.modlerComponents?.sceneController;
        if (!sceneController || !this.pushedObject?.userData?.id) return;

        const objectData = sceneController.getObjectByMesh(this.pushedObject);
        if (!objectData?.isContainer || !objectData.autoLayout?.enabled) return;

        // CRITICAL: Pass push context to layout update
        // This ensures fill objects resize from the correct edge (not center)
        const pushContext = {
            axis: this.pushAxis,
            anchorMode: this.pushDirection > 0 ? 'min' : 'max'
        };

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

        // Finalize geometry and recalculate face highlight position
        if (pushedObject) {
            const geometryUtils = window.GeometryUtils;
            if (geometryUtils) {
                // Now update face highlight for final geometry (updateFaceHighlight = true)
                geometryUtils.updateSupportMeshGeometries(pushedObject, true);
            }

            // Final dimension update
            // Source 'push-tool' tells ObjectStateManager to skip layout update
            // Positions stay fixed, fill objects already resized during drag
            if (this.objectStateManager && pushedObject.userData?.id) {
                const dimensions = geometryUtils?.getGeometryDimensions(pushedObject.geometry);
                if (dimensions) {
                    this.objectStateManager.updateObject(pushedObject.userData.id, {
                        dimensions: { x: dimensions.x, y: dimensions.y, z: dimensions.z }
                    }, 'push-tool');
                }
            }

            // Register undo action
            this.registerUndoAction(pushedObject);
        }

        // Clear hover state
        this.faceToolBehavior.clearHover();

        // Reset state
        this.resetState();

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
        const historyController = window.modlerComponents?.historyController;
        if (!historyController) return;

        const geometryUtils = window.GeometryUtils;
        const finalDimensions = geometryUtils?.getGeometryDimensions(pushedObject.geometry);

        if (this.initialDimensions && finalDimensions) {
            historyController.push({
                execute: () => {
                    this.objectStateManager?.updateObject(pushedObject.userData.id, {
                        dimensions: finalDimensions
                    });
                },
                undo: () => {
                    this.objectStateManager?.updateObject(pushedObject.userData.id, {
                        dimensions: this.initialDimensions
                    });
                },
                description: `Push ${pushedObject.userData.id}`
            });
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

        // CRITICAL: Filter out fill objects - they don't contribute to minimum size
        // Only non-fill (fixed-size) objects matter for minimum size calculation
        const nonFillChildren = children.filter(child => {
            return !child.layoutProperties || child.layoutProperties[sizeProperty] !== 'fill';
        });

        if (direction === axis) {
            // Layout direction matches push axis - sum all non-fill child sizes + gaps
            nonFillChildren.forEach((child, index) => {
                const childDims = child.dimensions || { x: 1, y: 1, z: 1 };
                minSize += childDims[axis];
            });
            // Add gaps between ALL children (including fill), not just non-fill
            if (children.length > 1) {
                minSize += gap * (children.length - 1);
            }
        } else {
            // Layout direction perpendicular to push axis - find maximum non-fill child size
            let maxChildSize = 0;
            nonFillChildren.forEach(child => {
                const childDims = child.dimensions || { x: 1, y: 1, z: 1 };
                maxChildSize = Math.max(maxChildSize, childDims[axis]);
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
