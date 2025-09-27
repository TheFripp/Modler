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
            MovementUtils.updateParentContainer(this.pushedObject, false, null, null, true, false);

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

        // Delegate to centralized container service via ContainerCrudManager
        const containerCrudManager = window.modlerComponents?.containerCrudManager;
        if (containerCrudManager) {
            containerCrudManager.updateContainerForPushTool(this.pushedObject, newSize);
        } else {
            console.error('PushTool: ContainerCrudManager not available for container update');
        }
    }

    /**
     * Modify regular object geometry using centralized GeometryUtils
     * @param {number} delta - Incremental movement amount in world units
     */
    modifyRegularGeometry(delta) {
        // Use actualPushedMesh for geometry modifications (handles interactive/collision meshes)
        const meshToModify = this.actualPushedMesh || this.pushedObject;
        if (!meshToModify || !meshToModify.geometry) return;

        // Use centralized GeometryUtils for face-based pushing
        const geometryUtils = window.GeometryUtils;
        if (!geometryUtils) {
            console.warn('PushTool: GeometryUtils not available');
            return;
        }

        // Perform face push using centralized utility
        const success = geometryUtils.pushGeometryFace(
            meshToModify.geometry,
            this.pushAxis,
            this.pushDirection,
            delta
        );

        if (success) {
            // Refresh visual feedback - this will handle all mesh synchronization
            this.refreshVisualFeedback();
        }
    }

    refreshVisualFeedback() {
        // Use actualPushedMesh for geometry updates (handles interactive/collision meshes)
        const meshToUpdate = this.actualPushedMesh || this.pushedObject;

        // Update support mesh geometries to match modified main geometry
        const geometryUtils = window.GeometryUtils;
        if (geometryUtils && meshToUpdate) {
            // Real-time updates: Update support meshes centrally during push operations for immediate feedback
            geometryUtils.updateSupportMeshGeometries(meshToUpdate);
        }

        // Update face highlighting to match new geometry
        this.updateFaceHighlighting();

        // Update SceneController object data dimensions from modified geometry
        if (meshToUpdate?.userData?.id) {
            this.updateObjectDataDimensions(meshToUpdate.userData.id, meshToUpdate);
        }

        // Sync geometry changes to pushedObject if they're different objects
        if (meshToUpdate !== this.pushedObject && meshToUpdate?.geometry && this.pushedObject?.geometry) {
            // Copy the modified geometry to the selected object for proper serialization
            this.pushedObject.geometry = meshToUpdate.geometry;
        }

        // NEW: Emit through unified notification system if available
        const objectEventBus = window.unifiedNotificationSystem?.eventBus;
        if (objectEventBus && this.pushedObject?.userData?.id) {
            // Emit geometry change event for real-time dimension updates
            objectEventBus.emit(objectEventBus.EVENT_TYPES.GEOMETRY, this.pushedObject.userData.id, {
                changeType: 'dimension',
                axis: this.pushAxis,
                timestamp: Date.now()
            }, {
                source: 'PushTool',
                throttle: true // Enable throttling for smooth real-time updates
            });
        }

        // LEGACY: Continue with legacy notification for compatibility
        if (window.notifyObjectModified) {
            window.notifyObjectModified(this.pushedObject, 'geometry');
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

        // Final updates for pushed object
        if (pushedObject && this.selectionController.isSelected(pushedObject)) {
            // Update SceneController object data dimensions for final state
            if (pushedObject?.userData?.id) {
                this.updateObjectDataDimensions(pushedObject.userData.id, pushedObject);
            }

            // Update support meshes and notify system - handles property panel updates automatically
            const geometryUtils = window.GeometryUtils;
            if (geometryUtils) {
                geometryUtils.updateSupportMeshGeometries(pushedObject);
            }

            // Centralized notification handles property panel updates and data sync
            if (window.notifyObjectModified) {
                window.notifyObjectModified(pushedObject, 'geometry');
            }
        }

        // Clear any existing highlights and hover states to ensure clean state
        this.faceToolBehavior.clearHover();

        // Final container updates based on push type
        if (this.isContainerPush) {
            // Container push: Full container repositioning and resizing
            MovementUtils.updateParentContainer(pushedObject, true, null, null, false, false);
        } else {
            // Individual object push: Final container update with directional adjustment
            this.updateContainerForObjectPush(true);
        }
    }


    /**
     * Update SceneController object data dimensions using centralized GeometryUtils
     */
    updateObjectDataDimensions(objectId, mesh) {
        if (!mesh || !mesh.geometry) return;

        const sceneController = window.modlerComponents?.sceneController;
        if (!sceneController) return;

        const objectData = sceneController.getObject(objectId);
        if (!objectData) return;

        // Use centralized GeometryUtils for dimension calculation
        const dimensions = window.GeometryUtils?.getGeometryDimensions(mesh.geometry);
        if (dimensions) {
            // Update SceneController object data
            objectData.dimensions = dimensions;

            // Also update mesh userData for consistency
            if (!mesh.userData.dimensions) {
                mesh.userData.dimensions = {};
            }
            Object.assign(mesh.userData.dimensions, dimensions);
        }
    }

    clearHover() {
        this.faceToolBehavior.clearHover();
    }

    hasActiveHighlight() {
        return this.faceToolBehavior.hasActiveHighlight();
    }

    /**
     * Tool activation wrapper for ToolController compatibility
     */
    activate() {
        this.onToolActivate();
    }

    /**
     * Tool deactivation wrapper for ToolController compatibility
     */
    deactivate() {
        this.onToolDeactivate();
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
     * Update container for individual object push using centralized MovementUtils
     */
    updateContainerForObjectPush(isFinalUpdate = false, isRealTime = false) {
        if (!this.pushedObject) return;

        // Use centralized MovementUtils for container updates
        MovementUtils.updateParentContainer(
            this.pushedObject,
            isFinalUpdate, // realTime parameter
            null, // throttleState (let MovementUtils handle)
            null, // newContainerSize (let it calculate)
            !isRealTime, // immediateVisuals (opposite of isRealTime)
            false // preservePosition
        );
    }

    /**
     * Get container size using centralized GeometryUtils
     * @param {THREE.Object3D} containerMesh - Container mesh object
     * @returns {THREE.Vector3} Container size
     */
    getContainerSize(containerMesh) {
        if (!containerMesh || !containerMesh.geometry) {
            return new THREE.Vector3(1, 1, 1);
        }

        const dimensions = window.GeometryUtils?.getGeometryDimensions(containerMesh.geometry);
        if (dimensions) {
            return new THREE.Vector3(dimensions.x, dimensions.y, dimensions.z);
        }

        // Fallback
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
}

// Export for use in main application
window.PushTool = PushTool;