/**
 * Push Tool - Face-Based Geometry Modification
 */
class PushTool {
    constructor(selectionController, visualEffects) {
        this.selectionController = selectionController;
        this.visualEffects = visualEffects;

        this.selectionBehavior = new BaseSelectionBehavior(selectionController);
        this.faceToolBehavior = new BaseFaceToolBehavior(selectionController, visualEffects);

        // Core push state - simplified
        this.active = false;
        this.pushedObject = null;
        this.pushedFace = null;
        this.faceNormal = null;
        this.startPosition = null;
        this.pushAxis = null;
        this.pushDirection = 1;
        this.isContainerPush = false;
        this.originalContainerSize = null;

        // Movement tracking - simplified
        this.lastMousePosition = null;
        this.cumulativeAmount = 0;
        this.rawCursorMovement = 0;
        this.lastPushDelta = undefined;
        this.originalGeometry = null;

        // Cached objects for performance
        this.cache = {
            tempVector1: new THREE.Vector3(),
            tempVector2: new THREE.Vector3(),
            tempVector3: new THREE.Vector3(),
            tempVector4: new THREE.Vector3()
        };
    }

    // State management helpers
    resetPushState() {
        this.active = false;
        this.pushedObject = null;
        this.pushedFace = null;
        this.faceNormal = null;
        this.startPosition = null;
        this.pushAxis = null;
        this.pushDirection = 1;
        this.isContainerPush = false;
        this.originalContainerSize = null;
    }

    resetMovementState() {
        this.lastMousePosition = null;
        this.cumulativeAmount = 0;
        this.rawCursorMovement = 0;
        this.lastPushDelta = undefined;
    }

    onHover(hit) {
        if (this.active) {
            this.updatePushMovement();
        } else {
            // Check if we should show face highlighting
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

        // Check if this is a container and determine if it should be highlightable
        const sceneController = window.modlerComponents?.sceneController;
        if (sceneController && targetObject.userData && targetObject.userData.id) {
            const objectData = sceneController.getObjectByMesh(targetObject);
            if (objectData && objectData.isContainer) {
                // Allow highlighting if container is in layout mode OR fixed sizing mode
                const isLayoutEnabled = objectData.autoLayout && objectData.autoLayout.enabled;
                const isFixedMode = objectData.sizingMode === 'fixed';

                if (!isLayoutEnabled && !isFixedMode) {
                    return false; // Only block containers in hug mode without layout
                }
            }
        }

        return true; // Allow highlighting for everything else
    }

    onMouseDown(hit, event) {
        if (!hit || !hit.object || !hit.face) return false;

        if (this.active) {
            this.endFacePush();
            return true;
        }

        const targetObject = this.faceToolBehavior.getTargetObject(hit);
        if (!targetObject) return false;

        this.startFacePush(hit);
        return true;
    }

    onMouseUp(hit, event) {
        if (this.active) {
            this.endFacePush();
            return true;
        }
        return false;
    }

    onClick(hit, event) {
        if (this.active) return;

        if (hit && hit.object) {
            this.selectionBehavior.handleObjectClick(hit.object, event);
        } else {
            this.selectionBehavior.handleEmptySpaceClick(event);
        }
    }

    onDoubleClick(hit, event) {
        if (this.active) {
            this.endFacePush();
        }
    }

    /**
     * Start face pushing operation
     */
    startFacePush(hit) {
        const targetObject = this.faceToolBehavior.getTargetObject(hit);

        // Check if this is a container push operation
        const isContainerPush = this.isContainerPushOperation(hit, targetObject);

        // Prevent pushing containers in 'hug' mode
        if (isContainerPush && !this.canPushContainer(targetObject)) {
            return false;
        }

        this.active = true;
        this.pushedObject = targetObject;
        this.pushedFace = hit.face;
        this.startPosition = new THREE.Vector3().copy(hit.point);
        this.isContainerPush = isContainerPush;

        // Get face normal in world space
        const worldNormal = new THREE.Vector3().copy(hit.face.normal);

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
        this.faceNormal = worldNormal;

        // Determine push axis and direction
        this.determinePushAxis(worldNormal);

        if (isContainerPush) {
            this.originalContainerSize = this.getContainerSize(targetObject);
        } else {
            this.originalGeometry = targetObject.geometry.clone();
        }

        // Store initial mouse position for movement calculation
        const inputController = window.modlerComponents?.inputController;
        if (inputController) {
            this.lastMousePosition = inputController.mouse.clone();
        }

        // Reset cumulative push amount and direction tracking for new operation
        this.cumulativeAmount = 0;
        this.rawCursorMovement = 0;
        this.lastPushDelta = undefined;

        // Enable standard snap detection
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
        const movementDelta = this.calculateMovementDelta();
        if (!movementDelta) return;

        const incrementalDelta = this.processSnapDetection(movementDelta);
        this.modifyGeometryIncremental(incrementalDelta);
        this.refreshVisualFeedback();
        this.syncContainerUpdates();
    }

    calculateMovementDelta() {
        const inputController = window.modlerComponents?.inputController;
        const camera = window.modlerComponents?.sceneFoundation?.camera;

        if (!MovementUtils.validateMovementPrerequisites({
            inputController, camera, object: this.pushedObject, lastMousePosition: this.lastMousePosition
        })) return null;

        const movement = MovementUtils.calculateMouseMovement(inputController, this.lastMousePosition);
        if (!movement) return null;

        const worldMovement = MovementUtils.calculateWorldMovement(
            movement.delta, this.pushedObject.position, this.faceNormal, camera
        );
        if (!worldMovement) return null;

        const pushDelta = MovementUtils.getAxisMovement(worldMovement, this.pushAxis);
        this.lastMousePosition.copy(movement.current);
        this.rawCursorMovement += pushDelta;

        this.handleDirectionChange(pushDelta);
        return pushDelta;
    }

    handleDirectionChange(pushDelta) {
        if (this.lastPushDelta !== undefined) {
            const directionChanged = (this.lastPushDelta > 0) !== (pushDelta > 0);
            if (directionChanged && Math.abs(pushDelta) > 0.001) {
                // Clear cache on direction change
                if (window.PositionTransform && this.pushedObject?.uuid) {
                    window.PositionTransform.clearCacheForObject(this.pushedObject.uuid);
                }
            }
        }
        this.lastPushDelta = pushDelta;
    }

    processSnapDetection(pushDelta) {
        const snapController = window.modlerComponents?.snapController;
        if (snapController && snapController.getEnabled()) {
            const snapPoint = snapController.getCurrentSnapPoint();
            if (snapPoint) {
                const snapAdjustedTotal = this.calculateSnapAdjustedPushAmount(snapPoint);
                const incrementalDelta = snapAdjustedTotal - this.cumulativeAmount;
                this.cumulativeAmount = snapAdjustedTotal;
                return incrementalDelta;
            }
        }

        const incrementalDelta = this.rawCursorMovement - this.cumulativeAmount;
        this.cumulativeAmount = this.rawCursorMovement;
        return incrementalDelta;
    }


    syncContainerUpdates() {
        const newContainerSize = this.calculateContainerSizeForFillObjects();
        MovementUtils.updateParentContainer(this.pushedObject, false, null, newContainerSize, true);

        // Trigger layout recalculation if pushing a container in layout mode
        if (this.isContainerPush) {
            const sceneController = window.modlerComponents?.sceneController;
            if (sceneController && this.pushedObject.userData && this.pushedObject.userData.id) {
                const objectData = sceneController.getObjectByMesh(this.pushedObject);
                if (objectData && objectData.isContainer && objectData.autoLayout && objectData.autoLayout.enabled) {
                    // Update layout to adapt container content to new size
                    sceneController.updateLayout(objectData.id);
                }
            }
        }
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
        if (!this.pushedObject || Math.abs(delta) < 0.0001) return;

        if (this.isContainerPush) {
            this.modifyContainerGeometry();
        } else {
            this.modifyRegularGeometry(delta);
        }
    }

    modifyContainerGeometry() {
        if (!this.pushedObject || !this.originalContainerSize) return;

        // Calculate new container size
        const newSize = this.cache.tempVector1.copy(this.originalContainerSize);
        const sizeChange = this.cumulativeAmount;

        if (this.pushAxis === 'x') {
            newSize.x = Math.max(0.1, this.originalContainerSize.x + sizeChange);
        } else if (this.pushAxis === 'y') {
            newSize.y = Math.max(0.1, this.originalContainerSize.y + sizeChange);
        } else if (this.pushAxis === 'z') {
            newSize.z = Math.max(0.1, this.originalContainerSize.z + sizeChange);
        }

        // Delegate to centralized container service
        LayoutGeometry.updateContainerGeometry(
            this.pushedObject,
            newSize,
            this.pushedObject.position,
            false
        );
    }

    /**
     * Modify regular object geometry with vertex manipulation
     * @param {number} delta - Incremental movement amount in world units
     */
    modifyRegularGeometry(delta) {
        if (!this.pushedObject || !this.pushedObject.geometry) return;

        // Work with current geometry (not original)
        const geometry = this.pushedObject.geometry;
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

        // Refresh visual feedback - this will handle all mesh synchronization
        this.refreshVisualFeedback();
    }

    refreshVisualFeedback() {
        // Sync geometry changes for wireframes and highlighting through centralized system
        // MeshSynchronizer will automatically update face highlights via updateFaceHighlightGeometry callback
        MovementUtils.syncRelatedMeshes(this.pushedObject, 'geometry', true);
    }

    updateFaceHighlighting() {
        const hoverState = this.faceToolBehavior.getHoverState();
        if (hoverState.isActive) {
            const targetObject = this.faceToolBehavior.getTargetObject(hoverState.hit);
            if (targetObject === this.pushedObject) {
                // Clear current highlight and create updated hit info
                this.visualEffects.clearHighlight();

                // Create updated hit info with current geometry
                const updatedHit = this.createUpdatedHitInfo(hoverState.hit);
                if (updatedHit) {
                    this.visualEffects.showFaceHighlight(updatedHit);
                }
            }
        }
    }

    createUpdatedHitInfo(originalHit) {
        if (!originalHit || !this.pushedObject) return null;

        try {
            // Get current geometry and face
            const geometry = this.pushedObject.geometry;
            const face = originalHit.face;
            const positionAttribute = geometry.attributes.position;

            if (!positionAttribute || !face) return null;

            // Get the three vertices of the face using cached vectors
            const a = this.cache.tempVector1.fromBufferAttribute(positionAttribute, face.a).applyMatrix4(this.pushedObject.matrixWorld);
            const b = this.cache.tempVector2.fromBufferAttribute(positionAttribute, face.b).applyMatrix4(this.pushedObject.matrixWorld);
            const c = this.cache.tempVector3.fromBufferAttribute(positionAttribute, face.c).applyMatrix4(this.pushedObject.matrixWorld);

            // Calculate face center as the new hit point
            const faceCenter = this.cache.tempVector4.addVectors(a, b).add(c).divideScalar(3);

            // Recalculate face normal
            const edge1 = this.cache.tempVector1.subVectors(b, a);
            const edge2 = this.cache.tempVector2.subVectors(c, a);
            const normal = edge1.cross(edge2).normalize();

            // Create updated hit info with recalculated position and normal
            return {
                ...originalHit,
                object: originalHit.object,
                point: faceCenter.clone(),
                face: {
                    ...originalHit.face,
                    normal: normal.clone()
                }
            };

        } catch (error) {
            return originalHit;
        }
    }






    /**
     * Calculate snap-adjusted push amount for smooth snap transitions
     */
    calculateSnapAdjustedPushAmount(snapPoint) {
        if (!snapPoint?.worldPos || !this.faceNormal || !this.startPosition) {
            return this.cumulativeAmount;
        }

        const currentFacePos = this.cache.tempVector1
            .copy(this.startPosition)
            .addScaledVector(this.faceNormal, this.cumulativeAmount);

        const snapAdjustment = this.cache.tempVector2
            .subVectors(snapPoint.worldPos, currentFacePos)
            .dot(this.faceNormal);

        return Math.abs(snapAdjustment) > 0.01 ?
            this.cumulativeAmount + snapAdjustment :
            this.cumulativeAmount;
    }



    /**
     * End face push operation
     */
    endFacePush() {
        const pushedObject = this.pushedObject; // Store reference before clearing

        this.resetPushState();
        this.resetMovementState();
        // Reset visual state

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

        // Force final container update with fill-aware calculations
        const finalContainerSize = this.calculateContainerSizeForFillObjects();
        MovementUtils.updateParentContainer(pushedObject, true, null, finalContainerSize);
    }

    calculateContainerSizeForFillObjects() {
        // Simple container size calculation - let MovementUtils handle the complexity
        return null;
    }

    clearHover() {
        this.faceToolBehavior.clearHover();
    }

    hasActiveHighlight() {
        return this.faceToolBehavior.hasActiveHighlight();
    }

    onToolActivate() {
        // No special activation logic needed for push tool
    }

    isContainerPushOperation(hit, targetObject) {
        // Delegate container detection to centralized service
        const sceneController = window.modlerComponents?.sceneController;
        if (!sceneController || !targetObject) return false;

        const objectData = sceneController.getObjectByMesh(targetObject);
        return objectData && objectData.isContainer;
    }

    canPushContainer(targetObject) {
        const sceneController = window.modlerComponents?.sceneController;
        if (!sceneController || !targetObject) return false;

        const objectData = sceneController.getObjectByMesh(targetObject);
        if (!objectData || !objectData.isContainer) return true; // Allow pushing non-containers

        // Allow pushing containers in layout mode OR fixed sizing mode
        const isLayoutEnabled = objectData.autoLayout && objectData.autoLayout.enabled;
        const isFixedMode = objectData.sizingMode === 'fixed';

        return isLayoutEnabled || isFixedMode;
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
     * Tool deactivation using centralized event handler
     */
    onToolDeactivate() {
        this.faceToolBehavior.clearHover();
        if (this.active) {
            this.endFacePush();
        }
    }

    onSelectionChange(selectedObjects) {
        const hoverState = this.faceToolBehavior.getHoverState();
        if (hoverState.object && !selectedObjects.includes(hoverState.object)) {
            this.clearHover();
        }
    }

    /**
     * Clear hover state using shared behavior
     */
    clearHover() {
        this.faceToolBehavior.clearHover();
    }


}

// Export for use in main application
window.PushTool = PushTool;