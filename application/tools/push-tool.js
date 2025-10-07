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

        this.isPushing = true;
        this.pushedObject = targetObject;
        this.pushedFace = hit.face;
        this.cumulativeAmount = 0;

        // Disable hug updates during push to prevent interference
        const sceneController = window.modlerComponents?.sceneController;
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

        // Check if this is a container or child in layout container
        const objectData2 = sceneController?.getObjectByMesh(this.pushedObject);
        const isContainer = objectData2?.isContainer;

        // Determine anchor mode from ACTUAL movement direction, not face normal
        // If delta > 0: expanding in positive direction → min face stays fixed
        // If delta < 0: shrinking or expanding in negative direction → max face stays fixed
        let anchorMode = delta > 0 ? 'min' : 'max';

        // Check if this object is inside a layout-enabled container with alignment
        if (!isContainer && objectData2?.parentContainer && sceneController) {
            const parent = sceneController.getObject(objectData2.parentContainer);
            if (parent?.autoLayout?.enabled && parent.autoLayout.alignment) {
                const alignment = parent.autoLayout.alignment[this.pushAxis];

                // If center-aligned on this axis: use 'center' mode for symmetric expansion
                // If edge-aligned: use normal behavior (pushed face moves, opposite stays)
                if (alignment === 'center') {
                    anchorMode = 'center';
                }
            }
        }

        let success;
        if (isContainer) {
            // CONTAINERS: Replace geometry instead of modifying vertices
            // This keeps geometry centered and avoids accumulating offsets
            const geometryFactory = window.modlerComponents?.geometryFactory;
            if (!geometryFactory) {
                console.warn('PushTool: GeometryFactory not available');
                return;
            }

            // Calculate position shift based on anchor mode
            let positionShift = 0;
            if (anchorMode === 'center') {
                // Center mode: no position shift (symmetric expansion)
                positionShift = 0;
            } else {
                // Edge-anchored: shift to keep anchor face fixed
                const shiftAmount = (newDimension - currentDims[this.pushAxis]) / 2;
                positionShift = this.pushDirection > 0 ? shiftAmount : -shiftAmount;
            }

            // Create new centered geometry
            const oldGeometry = this.pushedObject.geometry;
            const newGeometry = geometryFactory.createBoxGeometry(
                this.pushAxis === 'x' ? newDimension : currentDims.x,
                this.pushAxis === 'y' ? newDimension : currentDims.y,
                this.pushAxis === 'z' ? newDimension : currentDims.z
            );

            // Replace geometry
            this.pushedObject.geometry = newGeometry;
            geometryFactory.returnGeometry(oldGeometry, 'box');

            // Shift object position if needed (but NOT if inside a layout container)
            const parentContainer = objectData2?.parentContainer ? sceneController.getObject(objectData2.parentContainer) : null;
            const isInLayoutContainer = parentContainer?.autoLayout?.enabled;

            if (positionShift !== 0 && !isInLayoutContainer) {
                // Only shift position if NOT inside a layout container
                // Layout containers will handle positioning via their layout engine
                this.pushedObject.position[this.pushAxis] += positionShift;
            }

            // Check if this container has layout enabled
            const hasLayoutEnabled = objectData2?.autoLayout?.enabled;

            if (!hasLayoutEnabled) {
                // NON-LAYOUT CONTAINERS (hug mode): Counter-shift children to keep them visually in place
                // CRITICAL: When container moves, children (in local coords) move with it in world space
                // To keep children visually in place, shift their local positions by opposite amount
                if (sceneController && this.pushedObject.userData?.id) {
                    const children = sceneController.getChildObjects(this.pushedObject.userData.id);
                    children.forEach(child => {
                        if (child.mesh) {
                            child.mesh.position[this.pushAxis] -= positionShift;
                        }
                    });
                }
            }
            // LAYOUT CONTAINERS: Don't counter-shift children
            // The layout engine will recalculate child positions based on new container size

            success = true;
        } else {
            // REGULAR OBJECTS: Use vertex manipulation (existing behavior)
            success = geometryUtils.resizeGeometry(
                this.pushedObject.geometry,
                this.pushAxis,
                newDimension,
                anchorMode
            );
        }

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
                    } else {
                        // Fallback to direct update
                        finalObjectData.dimensions = { x: dims.x, y: dims.y, z: dims.z };
                        if (isContainer) {
                            finalObjectData.position = this.pushedObject.position.clone();
                        }
                    }
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

        // Get layout direction
        const layoutDirection = objectData.autoLayout.direction || 'x';
        const children = sceneController.getChildObjects(objectData.id);

        // Check if there are fill objects on the PUSH AXIS (not layout axis)
        // Fill objects should resize when container size changes on their fill axis,
        // regardless of whether that's the layout direction or perpendicular to it
        const sizeProperty = `size${this.pushAxis.toUpperCase()}`;
        const hasFillObjects = children.some(child => {
            return child.layoutProperties?.[sizeProperty] === 'fill';
        });

        if (hasFillObjects) {
            // WITH FILL OBJECTS on push axis: Resize them to match new container size
            this.updateFillObjectsDuringPush(objectData, children);
        } else if (this.pushAxis === layoutDirection) {
            // NO FILL OBJECTS, pushing on layout axis: Use space-between distribution
            const pushContext = {
                axis: this.pushAxis,
                // Use cumulative movement to determine anchor
                anchorMode: this.cumulativeAmount > 0 ? 'min' : 'max'
            };
            sceneController.updateLayout(objectData.id, pushContext);
        }
        // If pushing perpendicular to layout direction with no fill objects, do nothing
        // (children positions along layout axis don't change)
    }

    /**
     * Update fill objects directly during push without recalculating layout
     */
    updateFillObjectsDuringPush(containerData, children) {
        const geometryUtils = window.GeometryUtils;
        if (!geometryUtils) return;

        const containerSize = geometryUtils.getGeometryDimensions(this.pushedObject.geometry);
        if (!containerSize) return;

        const layoutConfig = containerData.autoLayout;
        const gap = layoutConfig.gap || 0;
        const padding = layoutConfig.padding || {};

        // Calculate available space for fill objects
        const axis = this.pushAxis;
        const containerAxisSize = containerSize[axis];

        // Get correct padding for this axis
        let paddingTotal = 0;
        if (axis === 'x') paddingTotal = (padding.width || 0) * 2;
        else if (axis === 'y') paddingTotal = (padding.height || 0) * 2;
        else if (axis === 'z') paddingTotal = (padding.depth || 0) * 2;

        let totalFixedSize = 0;
        let fillCount = 0;

        children.forEach(child => {
            const sizeProperty = `size${axis.toUpperCase()}`;
            if (child.layoutProperties?.[sizeProperty] === 'fill') {
                fillCount++;
            } else if (child.mesh?.geometry) {
                const dims = geometryUtils.getGeometryDimensions(child.mesh.geometry);
                totalFixedSize += dims[axis];
            }
        });

        if (fillCount === 0) return;

        const totalGaps = (children.length - 1) * gap;
        const availableSpace = Math.max(0, containerAxisSize - totalFixedSize - totalGaps - paddingTotal);
        const fillSizePerObject = availableSpace / fillCount;

        // Resize fill objects
        const geometryFactory = window.modlerComponents?.geometryFactory;
        if (!geometryFactory) return;

        children.forEach(child => {
            const sizeProperty = `size${axis.toUpperCase()}`;

            if (child.layoutProperties?.[sizeProperty] === 'fill' && child.mesh) {
                const currentDims = geometryUtils.getGeometryDimensions(child.mesh.geometry);
                // Use calculated fill size directly - no minimum constraint
                // If calculation results in negative/zero, that means container is too small
                const newDimension = Math.max(fillSizePerObject, 0.01);

                // FILL OBJECTS: Replace geometry instead of vertex manipulation
                // This keeps geometry centered and avoids position shifts
                const oldGeometry = child.mesh.geometry;
                const newGeometry = geometryFactory.createBoxGeometry(
                    axis === 'x' ? newDimension : currentDims.x,
                    axis === 'y' ? newDimension : currentDims.y,
                    axis === 'z' ? newDimension : currentDims.z
                );

                // Replace geometry
                child.mesh.geometry = newGeometry;
                geometryFactory.returnGeometry(oldGeometry, 'box');

                // Update support meshes
                geometryUtils.updateSupportMeshGeometries(child.mesh, false);

                // Update object data
                child.dimensions[axis] = newDimension;
            }
        });
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

                // If this is a hug container, update its size
                if (objectData?.isHug && objectData?.isContainer) {
                    sceneController.updateHugContainerSize(objectData.id);
                }

                // If object is inside a layout container, trigger layout update with push context
                // This preserves the anchor point so container grows from pushed edge, not recenter
                if (objectData?.parentContainer) {
                    const parentContainer = sceneController.getObject(objectData.parentContainer);
                    if (parentContainer?.autoLayout?.enabled) {
                        // Pass push context to preserve anchor during layout
                        // anchorMode determines which edge stays fixed:
                        // - direction 1 (pushing +X/+Y/+Z face): use 'min' anchor (left/bottom/front edge fixed)
                        // - direction -1 (pushing -X/-Y/-Z face): use 'max' anchor (right/top/back edge fixed)
                        const pushContext = {
                            axis: this.pushAxis,
                            direction: this.pushDirection,
                            anchorMode: this.pushDirection === 1 ? 'min' : 'max',
                            isPush: true
                        };
                        sceneController.updateLayout(objectData.parentContainer, pushContext);
                    }
                }
            }

            // Register undo action
            this.registerUndoAction(pushedObject);

            // Record manipulation for Tab key focus (dimensions along push axis)
            if (window.inputFocusManager && pushedObject.userData?.id && this.pushAxis) {
                window.inputFocusManager.recordManipulation(
                    pushedObject.userData.id,
                    `dimensions.${this.pushAxis}`
                );
            }
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
                // ARCHITECTURAL FIX: Use PushFaceCommand for proper undo/redo
                const command = new PushFaceCommand(
                    pushedObject.userData.id,
                    this.initialDimensions,
                    finalDimensions,
                    this.initialPosition,
                    finalPosition
                );
                historyManager.executeCommand(command);
                logger.debug(`📝 Registered push in history: ${pushedObject.userData.id}`);
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
