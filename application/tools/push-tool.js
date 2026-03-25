import * as THREE from 'three';
/**
 * Push Tool - Face-Based Geometry Modification (Simplified)
 *
 * Unified approach for both containers and regular objects using vertex manipulation.
 * Face highlight tracks the moving face for seamless visual feedback.
 * Extends BaseTool — component getters, lifecycle inherited
 */
class PushTool extends BaseTool {
    constructor(selectionController, visualEffects) {
        super(selectionController, visualEffects);
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
        this.hugTransitionState = null;
        this.gapTransitionState = null;
    }

    onHover(hit, isAltPressed) {
        if (this.isPushing) {
            this.updatePush();

            // Show push measurement overlay if Alt pressed during push
            if (isAltPressed) {
                const measurementTool = this.measurementTool;
                if (measurementTool && this.pushedObject && this.pushAxis) {
                    measurementTool.showPushMeasurement(this.pushedObject, this.pushAxis);
                }
            } else {
                const measurementTool = this.measurementTool;
                if (measurementTool) measurementTool.clearMeasurement();
            }
        } else {
            // Handle Alt-key measurement mode
            if (this.handleMeasurementMode(isAltPressed, hit)) return;

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

        const sceneController = this.sceneController;

        // Determine push axis early (needed for hug→layout transition)
        const worldNormal = this.faceToolBehavior.getWorldFaceNormal(hit);
        this.faceNormal = worldNormal;
        this.determinePushAxis(worldNormal);

        // If container is in hug mode, transition to layout mode
        if (sceneController && targetObject.userData?.id) {
            const objectData = sceneController.getObjectByMesh(targetObject);
            if (objectData?.isContainer) {
                const containerMode = this.objectStateManager?.getContainerMode(objectData.id);
                if (containerMode === 'hug') {
                    this.transitionHugToLayout(objectData, this.pushAxis);
                }

                // If layout container pushed perpendicular to layout direction,
                // set children to fill on the push axis (skip for tile containers —
                // tile instances must maintain uniform fixed dimensions)
                if (this.objectStateManager?.isLayoutMode(objectData.id)) {
                    const layoutDirection = objectData.autoLayout?.direction || 'x';
                    const isTile = objectData.autoLayout?.tileMode?.enabled;
                    if (this.pushAxis !== layoutDirection && !isTile) {
                        this.setChildrenToFillOnAxis(objectData, this.pushAxis);
                    }
                    // Tile containers pushed perpendicular: capture child state for
                    // uniform resize during drag (tiles can't use fill mode)
                    if (this.pushAxis !== layoutDirection && isTile) {
                        const children = sceneController.getChildObjects(objectData.id);
                        const initialChildStates = {};
                        children.forEach(child => {
                            initialChildStates[child.id] = {
                                dimensions: child.dimensions ? { ...child.dimensions } : null,
                                position: child.mesh ? {
                                    x: child.mesh.position.x,
                                    y: child.mesh.position.y,
                                    z: child.mesh.position.z
                                } : null
                            };
                        });
                        this.tileChildSyncState = {
                            containerId: objectData.id,
                            syncAxis: this.pushAxis,
                            initialChildStates
                        };
                    }
                }
            }
        }

        // If pushing a child inside a layout container, keep layout mode.
        // The child resizes normally; gap adjusts via space-between distribution.
        // (Previously transitioned parent to hug, breaking layout constraints.)

        this.isPushing = true;
        this.pushedObject = targetObject;
        this.pushedFace = hit.face;
        this.cumulativeAmount = 0;

        MovementUtils.registerFileOperation('push-tool-drag');

        // Disable hug updates during push to prevent interference
        if (sceneController && typeof sceneController.disableHugUpdates === 'function') {
            sceneController.disableHugUpdates();
        }

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
        const inputController = this.inputController;
        if (inputController) {
            this.startMousePos = inputController.mouse.clone();
            this.lastMousePos = inputController.mouse.clone();
        }

        // Enable snap detection
        const snapController = this.snapController;
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
     * Transition a hug-mode container to layout mode when push begins.
     * Sets layout direction to push axis and enables fill on all children.
     */
    transitionHugToLayout(objectData, pushAxis) {
        const sceneController = this.sceneController;
        if (!sceneController || !this.objectStateManager) return;

        // Snapshot pre-transition state for undo
        const children = sceneController.getChildObjects(objectData.id);
        const childStates = {};
        children.forEach(child => {
            childStates[child.id] = {
                originalLayoutProperties: child.layoutProperties
                    ? JSON.parse(JSON.stringify(child.layoutProperties))
                    : null
            };
        });

        this.hugTransitionState = {
            containerId: objectData.id,
            originalAutoLayout: JSON.parse(JSON.stringify(objectData.autoLayout || {})),
            childStates: childStates
        };

        // Transition container: hug → layout
        const baseAutoLayout = objectData.autoLayout || window.ObjectDataFormat.createDefaultAutoLayout();
        this.objectStateManager.updateObject(objectData.id, {
            ...ObjectStateManager.buildContainerModeUpdate('layout'),
            autoLayout: {
                ...baseAutoLayout,
                enabled: true,
                direction: pushAxis
            }
        }, 'push-tool');

        // Set all children to fill on the push axis
        const fillProperty = `size${pushAxis.toUpperCase()}`;
        children.forEach(child => {
            const currentLP = child.layoutProperties || {
                sizeX: 'fixed', sizeY: 'fixed', sizeZ: 'fixed',
                fixedSize: { x: null, y: null, z: null }
            };
            const fixedSize = { ...(currentLP.fixedSize || { x: null, y: null, z: null }) };
            fixedSize[pushAxis] = child.dimensions?.[pushAxis] || null;

            this.objectStateManager.updateObject(child.id, {
                layoutProperties: {
                    ...currentLP,
                    [fillProperty]: 'fill',
                    fixedSize: fixedSize
                }
            }, 'push-tool');
        });

        // Run initial layout to position children in new layout mode
        // Pass pushContext to skip container resize block (preserve current dimensions)
        sceneController.updateContainer(objectData.id, { pushContext: { axis: pushAxis } });
    }

    /**
     * Set children to fill on a specific axis (perpendicular push).
     * Stores undo state in this.fillTransitionState.
     */
    setChildrenToFillOnAxis(objectData, axis) {
        const sceneController = this.sceneController;
        if (!sceneController || !this.objectStateManager) return;

        const children = sceneController.getChildObjects(objectData.id);
        const fillProperty = `size${axis.toUpperCase()}`;

        // Snapshot original state for undo
        const childStates = {};
        children.forEach(child => {
            childStates[child.id] = {
                originalLayoutProperties: child.layoutProperties
                    ? JSON.parse(JSON.stringify(child.layoutProperties))
                    : null
            };
        });

        this.fillTransitionState = {
            containerId: objectData.id,
            childStates: childStates
        };

        // Set children to fill on the push axis
        children.forEach(child => {
            const currentLP = child.layoutProperties || {
                sizeX: 'fixed', sizeY: 'fixed', sizeZ: 'fixed',
                fixedSize: { x: null, y: null, z: null }
            };
            if (currentLP[fillProperty] !== 'fill') {
                const fixedSize = { ...(currentLP.fixedSize || { x: null, y: null, z: null }) };
                fixedSize[axis] = child.dimensions?.[axis] || null;

                this.objectStateManager.updateObject(child.id, {
                    layoutProperties: {
                        ...currentLP,
                        [fillProperty]: 'fill',
                        fixedSize: fixedSize
                    }
                }, 'push-tool');
            }
        });

        // Run layout to apply fill sizing
        // Pass pushContext to skip container resize block (preserve gaps on other axes)
        sceneController.updateContainer(objectData.id, { pushContext: { axis } });
    }

    /**
     * Sync tile siblings to match pushed child's dimensions.
     * Direct sync avoids relying on the indirect event chain through TileInstanceManager.
     */
    syncTileSiblings(pushedObjectData, container) {
        const dimensionManager = window.dimensionManager;
        if (!dimensionManager || !this.objectStateManager) return;

        const sourceDims = dimensionManager.getDimensions(pushedObjectData.mesh);
        if (!sourceDims) return;

        const siblings = this.sceneController.getAllObjects()
            .filter(obj => obj.parentContainer === container.id && obj.id !== pushedObjectData.id);

        for (const sibling of siblings) {
            dimensionManager.setDimensions(sibling.mesh, sourceDims, 'center');
            this.objectStateManager.updateObject(sibling.id, {
                dimensions: { ...sourceDims }
            }, 'push-tool');
        }
    }

    /**
     * Sync all tile children to match the pushed container's perpendicular dimension.
     * Called during drag when pushing a tile container perpendicular to layout direction.
     */
    syncTileChildrenToContainer(containerData) {
        const dimensionManager = window.dimensionManager;
        if (!dimensionManager || !this.objectStateManager) return;

        const containerDims = dimensionManager.getDimensions(containerData.mesh);
        if (!containerDims) return;

        const axis = this.tileChildSyncState.syncAxis;
        const padding = containerData.autoLayout?.padding || {};
        const paddingKey = { x: 'width', y: 'height', z: 'depth' }[axis];
        const paddingVal = (padding[paddingKey] || 0) * 2;

        const targetDim = containerDims[axis] - paddingVal;
        if (targetDim <= 0) return;

        const children = this.sceneController.getChildObjects(containerData.id);
        for (const child of children) {
            const currentDims = dimensionManager.getDimensions(child.mesh);
            if (!currentDims) continue;

            const newDims = { ...currentDims, [axis]: targetDim };
            dimensionManager.setDimensions(child.mesh, newDims, 'center');
            this.objectStateManager.updateObject(child.id, {
                dimensions: newDims
            }, 'push-tool');
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
        const inputController = this.inputController;
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
        if (!geometryUtils) return;

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
        const sceneController = this.sceneController;
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

                // Alignment determines which edge stays fixed during resize:
                // Min-edge aligned → keep min face fixed, max face moves
                // Max-edge aligned → keep max face fixed, min face moves
                // Center aligned → symmetric resize from center
                switch (alignment) {
                    case 'left':
                    case 'bottom':
                    case 'back':
                        anchorMode = 'min';
                        break;
                    case 'right':
                    case 'top':
                    case 'front':
                        anchorMode = 'max';
                        break;
                    case 'center':
                        anchorMode = 'center';
                        break;
                }
            }
        }

        // Store resolved anchor mode for property panel context forwarding
        this.anchorMode = anchorMode;

        // UNIFIED APPROACH: Use vertex manipulation for both containers and objects
        // Layout engine handles all child positioning/sizing based on container size
        const success = geometryUtils.resizeGeometry(
            this.pushedObject.geometry,
            this.pushAxis,
            newDimension,
            anchorMode
        );

        if (success) {

            // Re-center geometry so bounding box is symmetric around origin.
            // Push resize with 'min'/'max' anchor shifts vertices asymmetrically,
            // leaving the geometry off-center. This breaks duplication, serialization,
            // and undo/redo which all create fresh centered geometry from dimensions.
            // Re-centering + position adjustment cancel out visually.
            this.pushedObject.geometry.computeBoundingBox();
            const bbox = this.pushedObject.geometry.boundingBox;
            const geomCenter = new THREE.Vector3();
            bbox.getCenter(geomCenter);

            if (geomCenter.lengthSq() > 0.0001) {
                this.pushedObject.geometry.translate(-geomCenter.x, -geomCenter.y, -geomCenter.z);
                this.pushedObject.geometry.computeBoundingBox();
                this.pushedObject.position.add(geomCenter);
            }

            // Update all support meshes (wireframes, etc.) - unified for containers and objects
            geometryUtils.updateSupportMeshGeometries(this.pushedObject, false);

            // Update scene data dimensions and position through ObjectStateManager
            if (sceneController && this.pushedObject.userData?.id) {
                const finalObjectData = objectData2 || objectData;
                if (finalObjectData) {
                    const dims = geometryUtils.getGeometryDimensions(this.pushedObject.geometry);

                    // Update through ObjectStateManager to preserve all properties (like autoLayout)
                    const objectStateManager = this.objectStateManager;
                    if (objectStateManager) {
                        const updates = {
                            dimensions: { x: dims.x, y: dims.y, z: dims.z },
                            // Track position for all objects (re-centering shifts mesh.position)
                            position: {
                                x: this.pushedObject.position.x,
                                y: this.pushedObject.position.y,
                                z: this.pushedObject.position.z
                            }
                        };

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
     * Update container layout during push drag
     * Handles two cases:
     * 1. Pushed object IS a container → recalculate its internal layout
     * 2. Pushed object is a child INSIDE a container → resize the parent
     */
    updateContainerLayout() {
        const sceneController = this.sceneController;
        if (!sceneController || !this.pushedObject?.userData?.id) return;

        const objectData = sceneController.getObjectByMesh(this.pushedObject);
        if (!objectData) return;

        // If pushed object IS a container, recalculate its layout (mode routing handled internally)
        if (objectData.isContainer) {
            // Tile container pushed perpendicular: resize children to match container
            if (this.tileChildSyncState?.containerId === objectData.id) {
                this.syncTileChildrenToContainer(objectData);
            }
            sceneController.updateContainer(objectData.id, { pushContext: { axis: this.pushAxis } });
        }

        // If pushed object is a child INSIDE a container, update the parent
        if (objectData.parentContainer) {
            const parent = sceneController.getObject(objectData.parentContainer);

            // Tile containers: explicitly sync siblings and update layout
            if (parent?.autoLayout?.tileMode?.enabled) {
                this.syncTileSiblings(objectData, parent);
                sceneController.updateContainer(objectData.parentContainer);
                // Ensure container wireframe updates even if resize threshold wasn't met
                const geometryUtils = window.GeometryUtils;
                if (geometryUtils && parent.mesh) {
                    geometryUtils.updateSupportMeshGeometries(parent.mesh);
                }
                return;
            }

            if (parent?.isContainer && this.objectStateManager?.isLayoutMode(parent.id)) {
                // Layout container: pass pushContext so layout uses space-between gap distribution
                sceneController.updateContainer(objectData.parentContainer, {
                    pushContext: { axis: this.pushAxis }
                });
            } else {
                // Hug/manual container: resize to fit
                const containerCrudManager = this.containerCrudManager;
                if (containerCrudManager) {
                    containerCrudManager.resizeContainer(objectData.parentContainer, {
                        reason: 'child-changed',
                        immediate: false
                    });
                }
            }
        }
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
        const sceneController = this.sceneController;
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

                // Adjust mesh position to compensate (in parent-local space)
                // Use mesh's OWN rotation to convert geometry-local → parent-local
                // (matrixWorld would include parent rotation, which is wrong for local position)
                const localOffset = geometryCenter.clone().applyMatrix4(
                    new THREE.Matrix4().extractRotation(pushedObject.matrix)
                );
                pushedObject.position.add(localOffset);

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

                // If this is a container, persist gap and update layout
                if (objectData?.isContainer) {
                    // Persist dynamic gap as autoLayout.gap (same path as property panel)
                    // Only when pushing along the layout direction (space-between mode)
                    const layoutDirection = objectData.autoLayout?.direction;
                    if (layoutDirection === this.pushAxis && objectData.calculatedGap !== undefined) {
                        this.gapTransitionState = {
                            containerId: objectData.id,
                            oldGap: objectData.autoLayout.gap,
                            newGap: objectData.calculatedGap
                        };
                        this.objectStateManager.updateObject(objectData.id, {
                            autoLayout: { ...objectData.autoLayout, gap: objectData.calculatedGap }
                        }, 'push-tool');
                    }
                    sceneController.updateContainer(objectData.id);
                }

                // If object is inside a container, trigger final parent update
                if (objectData?.parentContainer) {
                    const parent = sceneController.getObject(objectData.parentContainer);
                    if (parent?.isContainer && this.objectStateManager?.isLayoutMode(parent.id)) {
                        // Layout container: persist gap if pushing along layout direction
                        const layoutDirection = parent.autoLayout?.direction;
                        if (this.pushAxis === layoutDirection && parent.calculatedGap !== undefined) {
                            this.gapTransitionState = {
                                containerId: parent.id,
                                oldGap: parent.autoLayout.gap,
                                newGap: parent.calculatedGap
                            };
                            this.objectStateManager.updateObject(parent.id, {
                                autoLayout: { ...parent.autoLayout, gap: parent.calculatedGap }
                            }, 'push-tool');
                        }
                        sceneController.updateContainer(parent.id);
                    } else {
                        // Hug/manual container: resize to fit
                        const containerCrudManager = this.containerCrudManager;
                        if (containerCrudManager) {
                            containerCrudManager.resizeContainer(objectData.parentContainer, {
                                reason: 'child-changed',
                                immediate: true
                            });
                        }
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
                    { pushDirection: this.pushDirection, pushAxis: this.pushAxis, anchorMode: this.anchorMode }
                );
            }
        }

        // Clear hover state
        this.faceToolBehavior.clearHover();

        // Reset state
        this.resetState();

        MovementUtils.unregisterFileOperation('push-tool-drag');

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
        const historyManager = this.historyManager;
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

            if (dimensionsChanged || positionChanged || this.hugTransitionState || this.fillTransitionState || this.gapTransitionState || this.tileChildSyncState) {
                // Calculate push distance based on dimension change along push axis
                let pushDistance = 0;
                if (this.pushAxis) {
                    const axis = this.pushAxis.toLowerCase();
                    pushDistance = (finalDimensions[axis] - this.initialDimensions[axis]) * this.pushDirection;
                }

                // Capture post-transition state for redo
                if (this.hugTransitionState) {
                    const sceneController = this.sceneController;
                    const objectData = sceneController?.getObject(this.hugTransitionState.containerId);
                    if (objectData) {
                        this.hugTransitionState.targetAutoLayout = JSON.parse(JSON.stringify(objectData.autoLayout));
                        const children = sceneController.getChildObjects(objectData.id);
                        children.forEach(child => {
                            const entry = this.hugTransitionState.childStates[child.id];
                            if (entry) {
                                entry.targetLayoutProperties = child.layoutProperties
                                    ? JSON.parse(JSON.stringify(child.layoutProperties))
                                    : null;
                            }
                        });
                    }
                }

                // Capture fill transition target state for redo
                if (this.fillTransitionState) {
                    const sceneController = this.sceneController;
                    const children = sceneController?.getChildObjects(this.fillTransitionState.containerId);
                    if (children) {
                        children.forEach(child => {
                            const entry = this.fillTransitionState.childStates[child.id];
                            if (entry) {
                                entry.targetLayoutProperties = child.layoutProperties
                                    ? JSON.parse(JSON.stringify(child.layoutProperties))
                                    : null;
                            }
                        });
                    }
                }

                // Capture final tile child state for redo
                if (this.tileChildSyncState) {
                    const sceneController = this.sceneController;
                    const children = sceneController?.getChildObjects(this.tileChildSyncState.containerId);
                    this.tileChildSyncState.finalChildStates = {};
                    if (children) {
                        const dimensionManager = window.dimensionManager;
                        children.forEach(child => {
                            this.tileChildSyncState.finalChildStates[child.id] = {
                                dimensions: dimensionManager ? { ...dimensionManager.getDimensions(child.mesh) } : null,
                                position: child.mesh ? {
                                    x: child.mesh.position.x,
                                    y: child.mesh.position.y,
                                    z: child.mesh.position.z
                                } : null
                            };
                        });
                    }
                }

                const command = new PushFaceCommand(
                    pushedObject.userData.id,
                    this.faceNormal,
                    pushDistance,
                    this.initialDimensions,
                    finalDimensions,
                    this.initialPosition,
                    finalPosition,
                    this.hugTransitionState,
                    this.fillTransitionState,
                    this.gapTransitionState,
                    this.tileChildSyncState
                );
                historyManager.executeCommand(command);
            }
        }
    }

    /**
     * Calculate minimum container size to fit all children.
     * Delegates to LayoutEngine.calculateMinimumContainerSize() for canonical sizing logic.
     */
    calculateMinimumContainerSize(children, axis, autoLayout) {
        const layoutEngine = window.LayoutEngine;
        if (!layoutEngine || !autoLayout) return 0;
        return layoutEngine.calculateMinimumContainerSize(children, axis, autoLayout);
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
        this.hugTransitionState = null;
        this.fillTransitionState = null;
        this.gapTransitionState = null;
        this.tileChildSyncState = null;
        this.anchorMode = null;
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
