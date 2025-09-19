/**
 * Push Tool - Face-Based Geometry Modification
 *
 * Provides face-based object resizing by modifying geometry through face manipulation.
 * Unlike move operations that translate entire objects, push operations modify the
 * object's geometry by moving individual faces along their normal directions.
 *
 * **Key Features:**
 * - Face-based geometry modification with real-time visual feedback
 * - Incremental vertex manipulation to prevent inside-out geometry
 * - Snap integration with cursor offset prevention
 * - Real-time container updates and wireframe synchronization
 * - Collision detection to maintain minimum object dimensions
 *
 * **Architecture:**
 * - Uses BaseSelectionBehavior for consistent selection patterns
 * - Integrates with MeshSynchronizer for real-time visual updates
 * - Follows V2 3-layer pattern: Click → Tool → SelectionController
 *
 * **Performance:**
 * - Incremental geometry updates avoid full recalculation
 * - Throttled container updates for smooth real-time interaction
 * - Smart face highlight updates based on movement thresholds
 *
 * @class PushTool
 */
class PushTool {
    /**
     * Initialize push tool with required dependencies
     *
     * @param {Object} selectionController - Handles object selection state
     * @param {Object} visualEffects - Manages face highlighting and visual feedback
     */
    constructor(selectionController, visualEffects) {
        this.selectionController = selectionController;
        this.visualEffects = visualEffects;

        // Use shared behaviors for consistency
        this.selectionBehavior = new BaseSelectionBehavior(selectionController);
        this.faceToolBehavior = new BaseFaceToolBehavior(selectionController, visualEffects);
        this.eventHandler = new BaseFaceToolEventHandler(this, this.faceToolBehavior, this.selectionBehavior);

        // Push-specific state
        this.isPushing = false;
        this.pushObject = null;
        this.pushFace = null;
        this.pushFaceNormal = null;
        this.pushStartPosition = null;
        this.originalGeometry = null;
        this.pushAxis = null; // 'x', 'y', or 'z'
        this.pushDirection = 1; // 1 or -1
        this.lastMousePosition = null; // For proper movement calculation
        this.cumulativePushAmount = 0; // Track total push amount

        // Container update throttling using shared utils - use default 16ms for smooth updates
        this.containerThrottleState = MovementUtils.createThrottleState();

        // Face highlight smart update tracking
        this.lastHighlightUpdateAmount = 0;
        this.highlightUpdateThreshold = 0.05; // Update when push amount changes by 0.05 units

        // Track raw cursor movement independently of snap adjustments
        this.rawCursorMovement = 0;
        this.lastPushDelta = undefined; // Track previous delta for direction change detection
    }

    /**
     * Handle mouse hover events - show face highlighting for selected objects
     */
    onHover(hit) {
        // Handle push movement during hover
        if (this.isPushing && this.pushObject && this.pushFaceNormal) {
            this.updatePushMovement();
            return;
        }

        // Use shared face detection behavior
        this.faceToolBehavior.handleFaceDetection(hit);
    }

    /**
     * Handle mouse down events using centralized event handler
     */
    onMouseDown(hit, event) {
        const operationCallbacks = BaseFaceToolEventHandler.createOperationCallbacks({
            isActiveCheck: () => this.isPushing,
            startCallback: (hit) => this.startFacePush(hit),
            operationName: 'push'
        });
        return this.eventHandler.handleMouseDown(hit, event, operationCallbacks);
    }

    /**
     * Handle mouse up events using centralized event handler
     */
    onMouseUp(hit, event) {
        const operationCallbacks = BaseFaceToolEventHandler.createOperationCallbacks({
            isActiveCheck: () => this.isPushing,
            endCallback: () => this.endFacePush()
        });
        return this.eventHandler.handleMouseUp(hit, event, operationCallbacks);
    }

    /**
     * Handle click events using centralized event handler
     */
    onClick(hit, event) {
        const operationCallbacks = { isOperationActive: () => this.isPushing };
        this.eventHandler.handleClick(hit, event, operationCallbacks);
    }

    /**
     * Handle double-click events using centralized event handler
     */
    onDoubleClick(hit, event) {
        const operationCallbacks = { isOperationActive: () => this.isPushing };
        this.eventHandler.handleDoubleClick(hit, event, operationCallbacks);
    }

    /**
     * Start face pushing operation
     */
    startFacePush(hit) {
        const targetObject = this.faceToolBehavior.getTargetObject(hit);

        // Check if this is a container push operation
        const isContainerPush = this.isContainerPushOperation(hit, targetObject);

        this.isPushing = true;
        this.pushObject = targetObject;
        this.pushFace = hit.face;
        this.pushStartPosition = hit.point.clone();
        this.isContainerPush = isContainerPush;

        // Get face normal in world space
        const worldNormal = hit.face.normal.clone();

        // Handle both container architectures for normal transformation
        const isContainerCollision = hit.object.userData.isContainerCollision;
        const isContainerInteractive = hit.object.userData.isContainerInteractive;

        if (isContainerInteractive && hit.object.userData.containerMesh) {
            // NEW ARCHITECTURE: Interactive mesh with containerMesh reference
            worldNormal.transformDirection(hit.object.userData.containerMesh.matrixWorld);
        } else if (isContainerCollision && hit.object.parent) {
            // OLD ARCHITECTURE: Collision mesh is child of container
            worldNormal.transformDirection(hit.object.matrixWorld);
        } else {
            // Regular objects or fallback
            worldNormal.transformDirection(hit.object.matrixWorld);
        }
        worldNormal.normalize();
        this.pushFaceNormal = worldNormal;

        // Determine push axis and direction
        this.determinePushAxis(worldNormal);

        if (isContainerPush) {
            // Switch container to fixed sizing mode when push tool is used
            const sceneController = window.modlerComponents?.sceneController;
            if (sceneController) {
                const containerData = sceneController.getObjectByMesh(targetObject);
                if (containerData && containerData.sizingMode === 'hug') {
                    containerData.sizingMode = 'fixed';

                    // Update property panel to reflect new sizing mode (enable dimension inputs)
                    if (window.updatePropertyPanelFromObject) {
                        window.updatePropertyPanelFromObject(targetObject);
                    }
                }
            }

            // Store original container size for reference
            this.originalContainerSize = this.getContainerSize(targetObject);
            console.log('🔧 Starting container push:', {
                container: targetObject.name || 'Unnamed',
                axis: this.pushAxis,
                originalSize: this.originalContainerSize
            });
        } else {
            // Store original geometry for reference (regular objects)
            this.originalGeometry = targetObject.geometry.clone();
        }

        // Store initial mouse position for movement calculation
        const inputController = window.modlerComponents?.inputController;
        if (inputController) {
            this.lastMousePosition = inputController.mouse.clone();
        }

        // Reset cumulative push amount and direction tracking for new operation
        this.cumulativePushAmount = 0;
        this.rawCursorMovement = 0;
        this.lastPushDelta = undefined;
        this.lastHighlightUpdateAmount = 0;

        // Request snap detection for push operation
        const snapController = window.modlerComponents?.snapController;
        if (snapController) {
            snapController.requestSnapDetection();
        }

        // Set cursor to indicate pushing mode
        const canvas = window.modlerComponents?.sceneFoundation?.canvas;
        if (canvas) {
            canvas.style.cursor = 'move';
        }
    }

    /**
     * Determine which axis and direction the face push affects
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
     * Update push movement during mouse move using 3D projection
     *
     * Calculates incremental face movement based on cursor delta and applies
     * snap integration with offset prevention. Uses raw cursor tracking to
     * maintain smooth cursor-face attachment across snap transitions.
     *
     * @private
     */
    updatePushMovement() {
        const inputController = window.modlerComponents?.inputController;
        const camera = window.modlerComponents?.sceneFoundation?.camera;

        // Validate movement prerequisites
        if (!MovementUtils.validateMovementPrerequisites({
            inputController, camera, object: this.pushObject, lastMousePosition: this.lastMousePosition
        })) return;

        // Calculate mouse movement using shared utils
        const movement = MovementUtils.calculateMouseMovement(inputController, this.lastMousePosition);
        if (!movement) return;

        // Calculate world movement along face normal
        const worldMovement = MovementUtils.calculateWorldMovement(
            movement.delta, this.pushObject.position, this.pushFaceNormal, camera
        );
        if (!worldMovement) return;

        // Extract movement along push axis
        const pushDelta = MovementUtils.getAxisMovement(worldMovement, this.pushAxis);

        // Update mouse position for next frame
        this.lastMousePosition.copy(movement.current);

        // Always track raw cursor movement independently of snapping
        this.rawCursorMovement += pushDelta;
        let incrementalDelta = pushDelta;

        // Detect direction changes and reset throttle state for immediate response
        if (this.lastPushDelta !== undefined) {
            const directionChanged = (this.lastPushDelta > 0) !== (pushDelta > 0);
            if (directionChanged && Math.abs(pushDelta) > 0.001) {
                // Reset throttle states to ensure immediate response on direction change
                this.containerThrottleState.lastUpdateTime = 0;
                this.containerThrottleState.immediateUpdateTime = 0;

                // Clear bounds cache for this object to force fresh calculation
                if (window.PositionTransform && this.pushObject?.uuid) {
                    window.PositionTransform.clearCacheForObject(this.pushObject.uuid);
                }
            }
        }
        this.lastPushDelta = pushDelta;

        // Handle snap detection with geometric constraints for push tool
        const snapController = window.modlerComponents?.snapController;
        const currentSnapPoint = this.handlePushSnapDetection(snapController);

        if (currentSnapPoint) {
            // Snapping: use snap position but continue tracking raw movement
            const snapAdjustedTotal = this.calculateSnapAdjustedPushAmount(currentSnapPoint);
            incrementalDelta = snapAdjustedTotal - this.cumulativePushAmount;
            this.cumulativePushAmount = snapAdjustedTotal;
        } else {
            // No snapping: use raw cursor movement
            incrementalDelta = this.rawCursorMovement - this.cumulativePushAmount;
            this.cumulativePushAmount = this.rawCursorMovement;
        }

        // Apply geometry modification with incremental delta
        this.modifyGeometryIncremental(incrementalDelta);

        // Update face highlighting to follow the geometry changes
        this.refreshVisualFeedback();

        // Update parent container with fill-aware calculations - use immediate visuals for real-time feedback
        const newContainerSize = this.calculateContainerSizeForFillObjects();
        MovementUtils.updateParentContainer(this.pushObject, false, this.containerThrottleState, newContainerSize, true);
    }

    /**
     * Modify object geometry incrementally for real-time pushing
     *
     * Handles both container resizing and regular vertex manipulation.
     * For containers: resizes container geometry and triggers layout updates.
     * For regular objects: performs incremental vertex manipulation.
     *
     * @param {number} delta - Incremental movement amount in world units
     */
    modifyGeometryIncremental(delta) {
        if (!this.pushObject || Math.abs(delta) < 0.0001) return;

        if (this.isContainerPush) {
            this.modifyContainerGeometry(delta);
        } else {
            this.modifyRegularGeometry(delta);
        }
    }

    /**
     * Modify container geometry by resizing container dimensions
     * @param {number} delta - Incremental movement amount in world units
     */
    modifyContainerGeometry(delta) {
        if (!this.pushObject || !this.originalContainerSize) return;

        // Calculate new container size
        const newSize = this.originalContainerSize.clone();

        // Determine which axis and direction to modify
        let sizeChange = this.cumulativePushAmount;

        if (this.pushAxis === 'x') {
            newSize.x = Math.max(0.1, this.originalContainerSize.x + sizeChange);
        } else if (this.pushAxis === 'y') {
            newSize.y = Math.max(0.1, this.originalContainerSize.y + sizeChange);
        } else if (this.pushAxis === 'z') {
            newSize.z = Math.max(0.1, this.originalContainerSize.z + sizeChange);
        }

        // Update container geometry using LayoutGeometry
        const success = LayoutGeometry.updateContainerGeometry(
            this.pushObject,
            newSize,
            this.pushObject.position, // Keep current position
            false // Don't reposition
        );

        if (success) {
            // Update padding visualization if it exists
            const unifiedContainerManager = window.modlerComponents?.unifiedContainerManager;
            const sceneController = window.modlerComponents?.sceneController;

            if (unifiedContainerManager && sceneController) {
                const objectData = sceneController.getObjectByMesh(this.pushObject);
                if (objectData) {
                    unifiedContainerManager.updatePaddingVisualization(objectData.id);
                }
            }

            // Trigger layout update for fill objects
            this.triggerContainerLayoutUpdate(newSize);

            console.log('🔧 Container resized:', {
                axis: this.pushAxis,
                newSize: newSize,
                sizeChange: sizeChange
            });
        }
    }

    /**
     * Modify regular object geometry with vertex manipulation
     * @param {number} delta - Incremental movement amount in world units
     */
    modifyRegularGeometry(delta) {
        if (!this.pushObject || !this.pushObject.geometry) return;

        // Work with current geometry (not original)
        const geometry = this.pushObject.geometry;
        geometry.computeBoundingBox();
        const bbox = geometry.boundingBox;

        const positions = geometry.getAttribute('position');
        const vertices = positions.array;

        // Calculate current geometry bounds to determine which vertices to move
        let minCoord, maxCoord, axisIndex;
        if (this.pushAxis === 'x') {
            minCoord = bbox.min.x;
            maxCoord = bbox.max.x;
            axisIndex = 0;
        } else if (this.pushAxis === 'y') {
            minCoord = bbox.min.y;
            maxCoord = bbox.max.y;
            axisIndex = 1;
        } else if (this.pushAxis === 'z') {
            minCoord = bbox.min.z;
            maxCoord = bbox.max.z;
            axisIndex = 2;
        }

        // Calculate tolerance for vertex comparison
        const epsilon = 0.001;

        // Calculate which face we're pushing (max or min face)
        const isPushingMaxFace = this.pushDirection > 0;

        // Calculate new bounds after the push
        let newMinCoord, newMaxCoord;
        if (isPushingMaxFace) {
            // Pushing the max face outward: max moves, min stays
            newMinCoord = minCoord;
            newMaxCoord = maxCoord + delta;
        } else {
            // Pushing the min face inward: min moves, max stays
            newMinCoord = minCoord + delta;
            newMaxCoord = maxCoord;
        }

        // Calculate resulting size
        const newSize = newMaxCoord - newMinCoord;

        // Prevent geometry from becoming too small (minimum 0.001 units for very flat cubes)
        if (newSize < 0.001) {
            return; // Skip this modification
        }

        // Prevent faces from crossing over (inside-out geometry)
        if (newMinCoord >= newMaxCoord) {
            return; // Skip this modification
        }

        // Modify vertices: move only vertices on the target face
        const targetCoord = isPushingMaxFace ? maxCoord : minCoord;
        let verticesModified = 0;

        for (let i = 0; i < vertices.length; i += 3) {
            if (Math.abs(vertices[i + axisIndex] - targetCoord) < epsilon) {
                vertices[i + axisIndex] += delta;
                verticesModified++;
            }
        }

        // Early return if no vertices were modified
        if (verticesModified === 0) return;

        // Update geometry
        positions.needsUpdate = true;
        geometry.computeBoundingBox();
        geometry.computeBoundingSphere();

        // Synchronize related meshes using shared utils with immediate feedback
        MovementUtils.syncRelatedMeshes(this.pushObject, 'geometry', true);

        // Refresh visual feedback
        this.refreshVisualFeedback();
    }

    /**
     * Refresh visual feedback during push operations
     *
     * Updates face highlighting and selection wireframes with smart throttling
     * to maintain performance during real-time operations.
     */
    refreshVisualFeedback() {
        const hoverState = this.faceToolBehavior.getHoverState();

        // Update face highlighting if hovering - check target object correctly for containers
        if (hoverState.isActive) {
            // For containers, hoverState.object is the interactive mesh, but pushObject is the container wireframe
            // Use getTargetObject to resolve both to the same container for comparison
            const hoverTargetObject = this.faceToolBehavior.getTargetObject(hoverState.hit);

            if (hoverTargetObject === this.pushObject) {
                // Reduce throttling threshold for smoother highlighting during real-time movement
                const changeAmount = Math.abs(this.cumulativePushAmount - this.lastHighlightUpdateAmount);
                if (changeAmount >= 0.001) { // Much lower threshold for immediate feedback
                    this.lastHighlightUpdateAmount = this.cumulativePushAmount;
                    this.visualEffects.clearHighlight();

                    const updatedHit = this.createUpdatedHitInfo(hoverState.hit);
                    if (updatedHit) {
                        this.visualEffects.showFaceHighlight(updatedHit);
                    }
                }
            }
        }

        // Update selection wireframes using shared utils with immediate feedback
        MovementUtils.syncRelatedMeshes(this.pushObject, 'geometry', true);

        // Update container selection wireframes if container is selected
        this.updateContainerSelectionWireframes();
    }

    /**
     * Update container selection wireframes when container bounds change
     *
     * Ensures that if a container is currently selected or in context (stepped-into),
     * its selection wireframes and context highlighting are updated in real-time
     * when child objects are pushed and container bounds change.
     */
    updateContainerSelectionWireframes() {
        if (!this.pushObject) return;

        const sceneController = window.modlerComponents?.sceneController;
        if (!sceneController) return;

        // Get the object data for the pushed object
        const objectData = sceneController.getObjectByMesh(this.pushObject);
        if (!objectData || !objectData.parentContainer) return;

        // Get the parent container
        const containerData = sceneController.getObject(objectData.parentContainer);
        if (!containerData || !containerData.mesh) return;

        // Check if the container is currently selected
        if (this.selectionController.isSelected(containerData.mesh)) {
            // Update the container's selection wireframes
            MovementUtils.syncRelatedMeshes(containerData.mesh, 'geometry');

            // Also force refresh the selection visualizer for the container
            if (this.selectionController.selectionVisualizer) {
                this.selectionController.selectionVisualizer.updateObjectVisual(containerData.mesh, true);
            }
        }

        // Check if the container is in context (stepped-into) and update edge highlighting
        if (this.selectionController.isInContainerContext()) {
            const containerContext = this.selectionController.getContainerContext();
            if (containerContext === containerData.mesh) {
                // Update the container context edge highlight to reflect new bounds
                this.selectionController.updateContainerEdgeHighlight();
            }
        }
    }

    /**
     * Create updated hit info for face highlighting after geometry modification
     */
    createUpdatedHitInfo(originalHit) {
        if (!originalHit || !this.pushObject) return null;

        // For geometry modifications, we need to recalculate the face position
        // since the vertices have moved but the face topology remains the same
        try {
            // CONTAINER FIX: For containers, get geometry from the interactive mesh, not wireframe
            let sourceGeometry;
            let sourceObject;

            if (this.isContainerPush && originalHit.object.userData.isContainerInteractive) {
                // For container push, use the interactive mesh geometry that has the faces
                sourceGeometry = originalHit.object.geometry;
                sourceObject = originalHit.object;
            } else {
                // For regular objects, use the push object geometry
                sourceGeometry = this.pushObject.geometry;
                sourceObject = this.pushObject;
            }

            if (!sourceGeometry || !originalHit.face) return null;

            // Get the face vertices from current geometry
            const face = originalHit.face;
            const positionAttribute = sourceGeometry.attributes.position;

            if (!positionAttribute) return null;

            // Get the three vertices of the face
            const a = new THREE.Vector3().fromBufferAttribute(positionAttribute, face.a);
            const b = new THREE.Vector3().fromBufferAttribute(positionAttribute, face.b);
            const c = new THREE.Vector3().fromBufferAttribute(positionAttribute, face.c);

            // Transform vertices to world space using the source object's matrix
            a.applyMatrix4(sourceObject.matrixWorld);
            b.applyMatrix4(sourceObject.matrixWorld);
            c.applyMatrix4(sourceObject.matrixWorld);

            // Calculate face center as the new hit point
            const faceCenter = new THREE.Vector3()
                .add(a)
                .add(b)
                .add(c)
                .divideScalar(3);

            // Recalculate face normal
            const edge1 = new THREE.Vector3().subVectors(b, a);
            const edge2 = new THREE.Vector3().subVectors(c, a);
            const normal = new THREE.Vector3().crossVectors(edge1, edge2).normalize();

            // Create updated hit info with recalculated position and normal
            return {
                ...originalHit,
                object: originalHit.object, // Keep the original hit object (interactive mesh for containers)
                point: faceCenter,
                face: {
                    ...originalHit.face,
                    normal: normal
                }
            };

        } catch (error) {
            console.warn('Failed to update hit info for face highlighting:', error);
            // Fallback to original method
            return { ...originalHit, object: this.pushObject };
        }
    }

    /**
     * Handle snap detection with geometric constraints specific to push operations
     *
     * Passes geometric constraints to the snap controller so invalid snap points
     * are filtered out before becoming visible indicators.
     *
     * @param {Object} snapController - Snap controller instance
     * @returns {Object|null} Valid snap point or null
     */
    handlePushSnapDetection(snapController) {
        if (!snapController || !snapController.getEnabled()) return null;

        // Create geometric constraints for the snap controller
        const geometricConstraints = this.createGeometricConstraints();

        // Update snap detection with geometric constraints
        snapController.updateSnapDetection(
            'push',
            [this.pushObject],
            this.pushFaceNormal,
            geometricConstraints
        );

        return snapController.getCurrentSnapPoint();
    }

    /**
     * Create geometric constraints object for snap controller filtering
     *
     * Packages the current push operation's geometric state so the snap controller
     * can filter out invalid snap points before they become visible indicators.
     *
     * @returns {Object} Geometric constraints object
     */
    createGeometricConstraints() {
        if (!this.pushObject || !this.pushAxis || this.pushDirection === null) {
            return null; // No constraints if push state is incomplete
        }

        // Calculate current geometry bounds
        const geometry = this.pushObject.geometry;
        if (!geometry.boundingBox) {
            geometry.computeBoundingBox();
        }
        const bbox = geometry.boundingBox;

        // Get current bounds for the push axis
        let minCoord, maxCoord;
        if (this.pushAxis === 'x') {
            minCoord = bbox.min.x;
            maxCoord = bbox.max.x;
        } else if (this.pushAxis === 'y') {
            minCoord = bbox.min.y;
            maxCoord = bbox.max.y;
        } else if (this.pushAxis === 'z') {
            minCoord = bbox.min.z;
            maxCoord = bbox.max.z;
        } else {
            return null;
        }

        return {
            type: 'push_geometric',
            pushAxis: this.pushAxis,
            pushDirection: this.pushDirection,
            currentMinCoord: minCoord,
            currentMaxCoord: maxCoord,
            pushStartPosition: this.pushStartPosition.clone(),
            pushFaceNormal: this.pushFaceNormal.clone(),
            cumulativePushAmount: this.cumulativePushAmount,
            minimumSize: 0.01, // Minimum object size threshold

            // Helper method for the snap controller to validate points
            validateSnapPoint: (snapPoint) => {
                return this.validateSnapPointGeometry(snapPoint);
            }
        };
    }

    /**
     * Validate snap point against geometric constraints to prevent inside-out geometry
     *
     * Checks if snapping to the given point would cause the pushed face to cross
     * over the opposite face, which would create invalid (inside-out) geometry.
     *
     * @param {Object} snapPoint - Potential snap point to validate
     * @returns {Object|null} Valid snap point or null if it would cause inside-out geometry
     */
    validateSnapPointGeometry(snapPoint) {
        if (!snapPoint?.worldPos || !this.pushObject || !this.pushFaceNormal || !this.pushStartPosition) {
            return snapPoint; // Can't validate, pass through
        }

        // Calculate current geometry bounds
        const geometry = this.pushObject.geometry;
        if (!geometry.boundingBox) {
            geometry.computeBoundingBox();
        }
        const bbox = geometry.boundingBox;

        // Get axis information from push state
        let minCoord, maxCoord, axisIndex;
        if (this.pushAxis === 'x') {
            minCoord = bbox.min.x;
            maxCoord = bbox.max.x;
            axisIndex = 0;
        } else if (this.pushAxis === 'y') {
            minCoord = bbox.min.y;
            maxCoord = bbox.max.y;
            axisIndex = 1;
        } else if (this.pushAxis === 'z') {
            minCoord = bbox.min.z;
            maxCoord = bbox.max.z;
            axisIndex = 2;
        } else {
            return snapPoint; // Unknown axis, pass through
        }

        // Calculate what the push amount would be if we snapped to this point
        const potentialSnapAmount = this.calculateSnapAdjustedPushAmount(snapPoint);

        // Determine face direction
        const isPushingMaxFace = this.pushDirection > 0;

        // Calculate what the new bounds would be
        let newMinCoord, newMaxCoord;
        if (isPushingMaxFace) {
            // Pushing the max face: max moves, min stays
            newMinCoord = minCoord;
            newMaxCoord = maxCoord + potentialSnapAmount;
        } else {
            // Pushing the min face: min moves, max stays
            newMinCoord = minCoord + potentialSnapAmount;
            newMaxCoord = maxCoord;
        }

        // Check for inside-out geometry (faces crossing over)
        if (newMinCoord >= newMaxCoord) {
            return null; // Reject this snap point
        }

        // Check for minimum geometry size (prevent extremely thin objects)
        const newSize = newMaxCoord - newMinCoord;
        if (newSize < 0.01) { // Minimum 0.01 units
            return null; // Reject this snap point
        }

        // Snap point is geometrically valid
        return snapPoint;
    }

    /**
     * Calculate snap-adjusted push amount for smooth snap transitions
     */
    calculateSnapAdjustedPushAmount(snapPoint) {
        if (!snapPoint?.worldPos || !this.pushFaceNormal || !this.pushStartPosition) {
            return this.cumulativePushAmount;
        }

        const currentFacePos = this.pushStartPosition.clone()
            .add(this.pushFaceNormal.clone().multiplyScalar(this.cumulativePushAmount));

        const snapAdjustment = snapPoint.worldPos.clone().sub(currentFacePos).dot(this.pushFaceNormal);

        return Math.abs(snapAdjustment) > 0.01 ?
            this.cumulativePushAmount + snapAdjustment :
            this.cumulativePushAmount;
    }



    /**
     * End face push operation
     */
    endFacePush() {
        const pushedObject = this.pushObject; // Store reference before clearing

        this.isPushing = false;
        this.pushObject = null;
        this.pushFace = null;
        this.pushFaceNormal = null;
        this.pushStartPosition = null;
        this.originalGeometry = null;
        this.pushAxis = null;
        this.pushDirection = 1;
        this.cumulativePushAmount = 0;
        this.lastHighlightUpdateAmount = 0;

        // Reset raw cursor tracking
        this.rawCursorMovement = 0;

        // Clear snap detection
        const snapController = window.modlerComponents?.snapController;
        if (snapController) {
            snapController.clearCurrentSnapPoint();
        }

        // Reset cursor
        const canvas = window.modlerComponents?.sceneFoundation?.canvas;
        if (canvas) {
            canvas.style.cursor = 'default';
        }

        // Force final selection wireframe update to ensure proper alignment
        if (pushedObject && this.selectionController.isSelected(pushedObject)) {
            const meshSynchronizer = window.modlerComponents?.meshSynchronizer;
            if (meshSynchronizer) {
                // Force immediate geometry update for selection wireframes
                meshSynchronizer.syncAllRelatedMeshes(pushedObject, 'geometry', true);
            }
        }

        // Also force selection visualizer refresh (only if object was selected)
        if (pushedObject && this.selectionController.isSelected(pushedObject)) {
            if (this.selectionController.selectionVisualizer) {
                this.selectionController.selectionVisualizer.updateObjectVisual(pushedObject, true);
            }
        }

        // Restore properties panel to show current selection state
        if (this.selectionController.updatePropertyPanelForCurrentSelection) {
            this.selectionController.updatePropertyPanelForCurrentSelection();
        }

        // Clear any existing highlights and hover states to ensure clean state
        this.visualEffects.clearHighlight();
        this.faceToolBehavior.clearHover();

        // Re-trigger face highlighting for current mouse position after tool operation ends
        // This ensures the user can immediately see face highlights without moving the mouse
        this.checkForFaceHighlightAfterOperation();

        // Force final container update with fill-aware calculations
        const finalContainerSize = this.calculateContainerSizeForFillObjects();
        MovementUtils.updateParentContainer(pushedObject, true, null, finalContainerSize);
    }

    /**
     * Calculate new container size for fill-aware layout calculations
     * This provides the container size that would result from the current push operation
     * @returns {THREE.Vector3|null} New container size or null if not applicable
     */
    calculateContainerSizeForFillObjects() {
        if (!this.pushObject || !this.pushObject.geometry) return null;

        const sceneController = window.modlerComponents?.sceneController;
        if (!sceneController) return null;

        // Get the object data for the pushed object
        const objectData = sceneController.getObjectByMesh(this.pushObject);
        if (!objectData || !objectData.parentContainer) return null;

        // Get the parent container
        const containerData = sceneController.getObject(objectData.parentContainer);
        if (!containerData || !containerData.isContainer) return null;

        // Check if container has layout with fill objects
        const childObjects = sceneController.getChildObjects(containerData.id);
        const hasLayoutWithFill = containerData.layoutProperties &&
                                  containerData.layoutProperties.direction &&
                                  childObjects.some(child => {
                                      if (!child.layoutProperties) return false;
                                      const { sizeX, sizeY, sizeZ } = child.layoutProperties;
                                      return sizeX === 'fill' || sizeY === 'fill' || sizeZ === 'fill';
                                  });

        if (!hasLayoutWithFill) return null;

        // Calculate current container bounds to understand the size change
        const childMeshes = childObjects
            .map(child => {
                if (child.isContainer && child.mesh) {
                    const collisionMesh = child.mesh.children.find(grandchild =>
                        grandchild.userData.isContainerCollision
                    );
                    if (collisionMesh) return collisionMesh;
                }
                return child.mesh;
            })
            .filter(mesh => mesh && mesh.geometry && mesh.geometry.type !== 'EdgesGeometry');

        if (childMeshes.length === 0) return null;

        // Calculate bounds with current object positions (including pushed object)
        const bounds = window.PositionTransform?.calculateObjectBounds(childMeshes);
        if (!bounds) return null;

        return bounds.size;
    }

    /**
     * Clear hover state using shared behavior
     */
    clearHover() {
        this.faceToolBehavior.clearHover();
    }

    /**
     * Check if tool has active highlighting
     */
    hasActiveHighlight() {
        return this.faceToolBehavior.hasActiveHighlight();
    }

    /**
     * Tool activation using centralized event handler
     */
    onToolActivate() {
        this.eventHandler.handleToolActivate();
    }

    /**
     * Check if this is a container push operation
     * @param {Object} hit - Raycast hit result
     * @param {THREE.Object3D} targetObject - Target object from face tool behavior
     * @returns {boolean} True if this is a container push operation
     */
    isContainerPushOperation(hit, targetObject) {
        if (!hit || !targetObject) return false;

        const sceneController = window.modlerComponents?.sceneController;
        if (!sceneController) return false;

        // Check if hit object is a container collision mesh
        const isCollisionMesh = hit.object.userData.isContainerCollision;
        if (isCollisionMesh && hit.object.parent === targetObject) {
            // Verify that target object is actually a container
            const objectData = sceneController.getObjectByMesh(targetObject);
            return objectData && objectData.isContainer;
        }

        return false;
    }

    /**
     * Get container size from mesh geometry
     * @param {THREE.Object3D} containerMesh - Container mesh object
     * @returns {THREE.Vector3} Container size
     */
    getContainerSize(containerMesh) {
        if (!containerMesh || !containerMesh.geometry) {
            return new THREE.Vector3(1, 1, 1);
        }

        // Force geometry bounds recalculation
        containerMesh.geometry.computeBoundingBox();
        const box = containerMesh.geometry.boundingBox;

        if (box) {
            return new THREE.Vector3(
                box.max.x - box.min.x,
                box.max.y - box.min.y,
                box.max.z - box.min.z
            );
        }

        return new THREE.Vector3(1, 1, 1);
    }

    /**
     * Trigger layout update for container with fill objects
     * @param {THREE.Vector3} newContainerSize - New container size after push
     */
    triggerContainerLayoutUpdate(newContainerSize) {
        const sceneController = window.modlerComponents?.sceneController;
        if (!sceneController) return;

        const objectData = sceneController.getObjectByMesh(this.pushObject);
        if (!objectData || !objectData.isContainer) return;

        // Check if container has layout enabled
        if (objectData.autoLayout && objectData.autoLayout.enabled) {
            // Use ContainerManager for proper fill object resizing
            const containerManager = window.modlerComponents?.containerManager;
            if (containerManager) {
                // Resize fill objects for new container size
                // Parameters: containerData, newContainerSize, preservePosition, immediateUpdate
                containerManager.resizeContainerToFitChildren(objectData, newContainerSize, false, true);
            }
        }
    }

    /**
     * Tool deactivation using centralized event handler
     */
    onToolDeactivate() {
        const deactivationCallbacks = BaseFaceToolEventHandler.createDeactivationCallbacks({
            isActiveCheck: () => this.isPushing,
            endCallback: () => this.endFacePush()
        });
        this.eventHandler.handleToolDeactivate(deactivationCallbacks);
    }

    /**
     * Handle selection changes - clear highlights if selected object changes, show highlights on new selection
     */
    onSelectionChange(selectedObjects) {
        const hoverState = this.faceToolBehavior.getHoverState();
        // Clear highlights if the highlighted object is no longer selected
        if (hoverState.object && !selectedObjects.includes(hoverState.object)) {
            this.clearHover();
        }

        // If new objects are selected and we're the active tool, check for immediate face highlighting
        if (selectedObjects.length > 0) {
            this.checkForFaceHighlightOnSelection();
        }
    }

    /**
     * Clear hover state using shared behavior
     */
    clearHover() {
        this.faceToolBehavior.clearHover();
    }

    /**
     * Check for face highlighting when object is selected
     * Shows face highlighting immediately if mouse is hovering over a selected object's face
     */
    checkForFaceHighlightOnSelection() {
        // Use a small delay to ensure selection state is fully updated
        setTimeout(() => {
            const inputController = window.modlerComponents?.inputController;
            if (!inputController) return;

            // Perform raycast at current mouse position using inputController's raycast method
            const hit = inputController.raycast();

            if (hit) {
                // Find the first hit that matches selected objects
                const selectedObjects = this.selectionController.getSelectedObjects();

                // Handle collision meshes properly using shared behavior
                const targetObject = this.faceToolBehavior.getTargetObject(hit);

                if (selectedObjects.includes(hit.object) ||
                    selectedObjects.includes(targetObject) ||
                    (hit.object.parent && selectedObjects.includes(hit.object.parent))) {
                    // Trigger hover event to show face highlighting
                    this.onHover(hit);
                }
            }
        }, 50); // Small delay to ensure selection state is fully updated
    }

    /**
     * Check for face highlighting after tool operation ends
     * Re-triggers hover detection at current mouse position
     */
    checkForFaceHighlightAfterOperation() {
        // Use a small delay to ensure all cleanup is complete
        setTimeout(() => {
            const inputController = window.modlerComponents?.inputController;
            if (!inputController) return;

            // Perform raycast at current mouse position using inputController's raycast method
            const hit = inputController.raycast();

            if (hit) {
                // Find the first hit that matches selected objects
                const selectedObjects = this.selectionController.getSelectedObjects();

                // Handle collision meshes properly using shared behavior
                const targetObject = this.faceToolBehavior.getTargetObject(hit);

                if (selectedObjects.includes(hit.object) ||
                    selectedObjects.includes(targetObject) ||
                    (hit.object.parent && selectedObjects.includes(hit.object.parent))) {
                    // Trigger hover event to show face highlighting
                    this.onHover(hit);
                }
            }
        }, 50); // Small delay to ensure tool state is fully reset
    }
}

// Export for use in main application
window.PushTool = PushTool;