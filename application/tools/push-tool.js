/**
 * Push Tool - Face-Based Geometry Modification
 */
class PushTool {
    constructor(selectionController, visualEffects) {
        this.selectionController = selectionController;
        this.visualEffects = visualEffects;

        this.faceToolBehavior = new BaseFaceToolBehavior(selectionController, visualEffects, 'push');

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

        // Centralized transformation system
        this.transformationManager = null;

        // Initialize transformation manager after components are loaded
        setTimeout(() => {
            this.transformationManager = window.modlerComponents?.transformationManager;
        }, 50);


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
        this.actualPushedMesh = null;
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
        // Empty space clicks should ALWAYS deselect, regardless of tool state
        if (!hit || !hit.object) {
            this.selectionController.handleEmptySpaceClick(event);
            return;
        }

        // If tool is active, don't handle object clicks
        if (this.active) return;

        // Use immediate selection like other tools for consistent behavior
        this.selectionController.handleObjectClick(hit.object, event, { toolType: 'PushTool' });
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
            // For non-container pushes, we need to find the actual geometry to modify
            const actualMesh = this.resolveActualMeshForPush(hit, targetObject);
            if (actualMesh && actualMesh.geometry) {
                this.originalGeometry = actualMesh.geometry.clone();
                // Store reference to the actual mesh for geometry modifications
                this.actualPushedMesh = actualMesh;
            } else {
                this.originalGeometry = targetObject.geometry.clone();
                this.actualPushedMesh = targetObject;
            }
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
        if (this.isContainerPush) {
            // Container push: Full container repositioning and resizing
            const newContainerSize = this.calculateContainerSizeForFillObjects();
            MovementUtils.updateParentContainer(this.pushedObject, false, null, newContainerSize, true, false);

            // Trigger layout recalculation if pushing a container in layout mode
            const sceneController = window.modlerComponents?.sceneController;
            if (sceneController && this.pushedObject.userData && this.pushedObject.userData.id) {
                const objectData = sceneController.getObjectByMesh(this.pushedObject);
                if (objectData && objectData.isContainer && objectData.autoLayout && objectData.autoLayout.enabled) {
                    // Update layout to adapt container content to new size
                    sceneController.updateLayout(objectData.id);
                }
            }
        } else {
            // Individual object push: Lightweight real-time updates
            this.updateContainerForObjectPush(false, true); // false = not final, true = real-time
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
            false,
            null // No layout direction visualization during push operations
        );
    }

    /**
     * Modify regular object geometry with vertex manipulation
     * @param {number} delta - Incremental movement amount in world units
     */
    modifyRegularGeometry(delta) {
        // Use actualPushedMesh for geometry modifications (handles interactive/collision meshes)
        const meshToModify = this.actualPushedMesh || this.pushedObject;
        if (!meshToModify || !meshToModify.geometry) return;

        // Work with current geometry (not original)
        const geometry = meshToModify.geometry;
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
        // Use actualPushedMesh for geometry updates (handles interactive/collision meshes)
        const meshToUpdate = this.actualPushedMesh || this.pushedObject;

        // Update support mesh geometries to match modified main geometry
        const supportMeshFactory = window.SupportMeshFactory ? new SupportMeshFactory() : null;
        if (supportMeshFactory && meshToUpdate) {
            // Real-time updates: Update face highlights during push operations for immediate feedback
            supportMeshFactory.updateSupportMeshGeometries(meshToUpdate, true);
        }

        // Update face highlighting to match new geometry
        this.updateFaceHighlighting();

        // Sync geometry changes for wireframes and highlighting through centralized system
        MovementUtils.syncRelatedMeshes(meshToUpdate, 'geometry', true);

        // Update SceneController object data dimensions from modified geometry
        if (meshToUpdate?.userData?.id) {
            this.updateObjectDataDimensions(meshToUpdate.userData.id, meshToUpdate);
        }

        // Notify centralized system for real-time property panel updates
        if (window.notifyObjectModified) {
            window.notifyObjectModified(meshToUpdate, 'geometry');
        }
    }

    updateFaceHighlighting() {
        const hoverState = this.faceToolBehavior.getHoverState();
        if (hoverState.isActive) {
            const targetObject = this.faceToolBehavior.getTargetObject(hoverState.hit);
            if (targetObject === this.pushedObject) {
                // Use support mesh face highlight - show/hide only during push operations
                const supportMeshes = this.pushedObject.userData.supportMeshes;
                if (supportMeshes?.faceHighlight) {
                    // ARCHITECTURE COMPLIANCE: During push operations, only show - NO repositioning
                    // Face highlight was positioned when hover started, now it moves naturally with geometry
                    supportMeshes.faceHighlight.visible = true;
                } else {
                    // Fallback to Visual Effects for objects without support meshes
                    this.visualEffects.clearHighlight();
                    this.visualEffects.showFaceHighlight(hoverState.hit);
                }
            }
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

            // Update SceneController object data dimensions for final state
            if (pushedObject?.userData?.id) {
                this.updateObjectDataDimensions(pushedObject.userData.id, pushedObject);
            }

            // Notify centralized system of final geometry state for property panel updates
            if (window.notifyObjectModified) {
                window.notifyObjectModified(pushedObject, 'geometry');
            }
        }

        // Also force visualization refresh (only if object was selected)
        if (pushedObject && this.selectionController.isSelected(pushedObject)) {
            if (this.selectionController.visualizationManager) {
                this.selectionController.visualizationManager.updateGeometry(pushedObject);
            }
        }

        // Restore properties panel to show current selection state
        if (this.selectionController.updatePropertyPanelForCurrentSelection) {
            this.selectionController.updatePropertyPanelForCurrentSelection();
        }

        // Clear any existing highlights and hover states to ensure clean state
        this.faceToolBehavior.clearHover();

        // Final container updates based on push type
        if (this.isContainerPush) {
            // Container push: Full container repositioning and resizing
            const finalContainerSize = this.calculateContainerSizeForFillObjects();
            MovementUtils.updateParentContainer(pushedObject, true, null, finalContainerSize, false, false);
        } else {
            // Individual object push: Final container update with directional adjustment
            this.updateContainerForObjectPush(true);
        }
    }

    calculateContainerSizeForFillObjects() {
        // Simple container size calculation - let MovementUtils handle the complexity
        return null;
    }

    /**
     * Update SceneController object data dimensions from current geometry
     * Ensures property panel sync after geometry modifications
     */
    updateObjectDataDimensions(objectId, mesh) {
        if (!mesh || !mesh.geometry) return;

        const sceneController = window.modlerComponents?.sceneController;
        if (!sceneController) return;

        const objectData = sceneController.getObject(objectId);
        if (!objectData) return;

        // Force geometry bounds recalculation
        mesh.geometry.computeBoundingBox();
        const box = mesh.geometry.boundingBox;

        if (box) {
            // Calculate actual dimensions from bounding box
            const dimensions = {
                x: Math.abs(box.max.x - box.min.x),
                y: Math.abs(box.max.y - box.min.y),
                z: Math.abs(box.max.z - box.min.z)
            };

            // Update SceneController object data
            objectData.dimensions = dimensions;

            // Also update mesh userData for consistency
            if (!mesh.userData.dimensions) {
                mesh.userData.dimensions = {};
            }
            mesh.userData.dimensions.x = dimensions.x;
            mesh.userData.dimensions.y = dimensions.y;
            mesh.userData.dimensions.z = dimensions.z;
        }
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

    /**
     * Resolve the actual mesh to modify for push operations
     * Handles interactive/collision meshes by finding the real object geometry
     */
    resolveActualMeshForPush(hit, targetObject) {
        const sceneController = window.modlerComponents?.sceneController;
        if (!sceneController) return targetObject;

        const isContainerInteractive = hit.object.userData.isContainerInteractive;
        const isContainerCollision = hit.object.userData.isContainerCollision;

        // If we're hitting an interactive or collision mesh, find the actual object
        if (isContainerInteractive || isContainerCollision) {
            // For interactive meshes, check if they have a reference to the actual object
            if (hit.object.userData.actualObject) {
                return hit.object.userData.actualObject;
            }

            // For collision meshes, the actual object might be a sibling or parent
            if (hit.object.parent) {
                // Look for siblings that are the actual object (not collision/interactive meshes)
                const siblings = hit.object.parent.children;
                for (const sibling of siblings) {
                    if (!sibling.userData.isContainerInteractive &&
                        !sibling.userData.isContainerCollision &&
                        sibling.geometry) {
                        return sibling;
                    }
                }
            }

            // Fallback: try to find object by ID from scene controller
            const objectId = hit.object.userData.objectId || hit.object.userData.id;
            if (objectId) {
                const objectData = sceneController.getObject(objectId);
                if (objectData && objectData.mesh) {
                    return objectData.mesh;
                }
            }
        }

        // Default: return the target object
        return targetObject;
    }

    isContainerPushOperation(hit, targetObject) {
        const sceneController = window.modlerComponents?.sceneController;
        if (!sceneController || !targetObject) return false;

        // Check if the target object itself is a container that's explicitly selected
        const objectData = sceneController.getObjectByMesh(targetObject);
        if (objectData && objectData.isContainer) {
            // This is a container mesh - check if it's explicitly selected
            if (this.selectionController.isSelected(targetObject)) {
                return true; // Container push operation
            }
        }

        // Check if we're hitting an interactive/collision mesh but the target resolved to a container
        // This means getTargetObject() resolved to a container because it's selected
        const isContainerInteractive = hit.object.userData.isContainerInteractive;
        const isContainerCollision = hit.object.userData.isContainerCollision;

        if ((isContainerInteractive || isContainerCollision) && objectData && objectData.isContainer) {
            // We hit a container mesh and it resolved to a container - this is a container push
            return true;
        }

        return false; // Regular object push operation
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
     * Update container for individual object push with child position compensation
     * Key insight: compensate for container movement by moving children back
     */
    updateContainerForObjectPush(isFinalUpdate = false, isRealTime = false) {
        const sceneController = window.modlerComponents?.sceneController;
        if (!sceneController || !this.pushedObject) return;

        const objectData = sceneController.getObjectByMesh(this.pushedObject);
        if (!objectData || !objectData.parentContainer) return;

        const containerData = sceneController.getObject(objectData.parentContainer);
        if (!containerData || !containerData.mesh) return;

        if (isRealTime) {
            // LIGHTWEIGHT REAL-TIME UPDATE: Just use cached calculations
            this.updateContainerRealTime(containerData);
        } else {
            // FULL UPDATE: Complete recalculation for final positioning
            this.updateContainerFull(containerData, isFinalUpdate);
        }
    }

    updateContainerRealTime(containerData) {
        if (!this.lastContainerCalculation) return;

        const containerMesh = containerData.mesh;

        // Calculate directional offset based on current push amount
        const directionalOffset = this.cumulativeAmount * this.pushDirection * 0.5;
        const newPosition = this.lastContainerCalculation.originalPosition.clone();

        if (this.pushAxis === 'x') {
            newPosition.x += directionalOffset;
        } else if (this.pushAxis === 'y') {
            newPosition.y += directionalOffset;
        } else if (this.pushAxis === 'z') {
            newPosition.z += directionalOffset;
        }

        // Just move the container using centralized transformation
        if (this.transformationManager) {
            this.transformationManager.setPosition(containerMesh, newPosition, { batchUpdate: true });
        } else {
            // Fallback to direct manipulation
            containerMesh.position.copy(newPosition);
        }
    }

    updateContainerFull(containerData, isFinalUpdate) {
        const sceneController = window.modlerComponents?.sceneController;
        const containerMesh = containerData.mesh;
        const originalContainerPosition = containerMesh.position.clone();

        // Cache this calculation for real-time updates
        this.lastContainerCalculation = {
            originalPosition: originalContainerPosition.clone()
        };

        // Calculate what the container bounds should be
        const childObjects = sceneController.getChildObjects(containerData.id);
        const childMeshes = childObjects
            .map(child => child.mesh)
            .filter(mesh => mesh && mesh.geometry && mesh.geometry.type !== 'EdgesGeometry');

        if (childMeshes.length === 0) return;

        // Calculate bounds of all children (includes the pushed object)
        const bounds = PositionTransform.calculateObjectBounds(childMeshes, isFinalUpdate);
        if (!bounds) return;

        // Calculate directional position to keep fixed edge in place
        const currentSize = this.getContainerSize(containerMesh);
        const axisIndex = this.pushAxis === 'x' ? 0 : (this.pushAxis === 'y' ? 1 : 2);

        // Calculate where the fixed edge should be (opposite to push direction)
        const fixedEdgeOffset = (currentSize.getComponent(axisIndex) / 2) * -this.pushDirection;
        const fixedEdgePosition = containerMesh.position.getComponent(axisIndex) + fixedEdgeOffset;

        // Calculate new container center position to keep fixed edge in place
        const newCenterPosition = containerMesh.position.clone();
        const newFixedEdgeOffset = (bounds.size.getComponent(axisIndex) / 2) * -this.pushDirection;
        const newCenterCoord = fixedEdgePosition - newFixedEdgeOffset;

        if (this.pushAxis === 'x') {
            newCenterPosition.x = newCenterCoord;
        } else if (this.pushAxis === 'y') {
            newCenterPosition.y = newCenterCoord;
        } else if (this.pushAxis === 'z') {
            newCenterPosition.z = newCenterCoord;
        }

        // Calculate container movement
        const containerMovement = new THREE.Vector3().subVectors(newCenterPosition, originalContainerPosition);

        // Move all child objects back to compensate for container movement
        childObjects.forEach(childData => {
            if (childData.mesh) {
                if (this.transformationManager) {
                    const newChildPosition = childData.mesh.position.clone().sub(containerMovement);
                    this.transformationManager.setPosition(childData.mesh, newChildPosition, { batchUpdate: true });
                } else {
                    // Fallback to direct manipulation
                    childData.mesh.position.sub(containerMovement);
                }
                sceneController.updateObject(childData.id, { position: childData.mesh.position });
            }
        });

        // Full update for final positioning
        LayoutGeometry.updateContainerGeometry(
            containerMesh,
            bounds.size,
            newCenterPosition,
            true, // shouldReposition = true
            null // No layout direction visualization during push operations
        );

        // Update SceneController with new container position
        sceneController.updateObject(containerData.id, { position: newCenterPosition });
    }

    /**
     * Update interactive mesh position to match container position
     */
    updateInteractiveMeshPosition(containerData) {
        const scene = window.modlerComponents?.sceneFoundation?.scene;
        if (!scene) return;

        // Find interactive mesh linked to this container
        scene.traverse((object) => {
            if (object.userData.isContainerInteractive &&
                object.userData.containerMesh === containerData.mesh) {
                if (this.transformationManager) {
                    this.transformationManager.setPosition(object, containerData.mesh.position, { batchUpdate: true });
                } else {
                    // Fallback to direct manipulation
                    object.position.copy(containerData.mesh.position);
                    object.updateMatrixWorld(true);
                }
            }
        });
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