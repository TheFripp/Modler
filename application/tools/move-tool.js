/**
 * Move Tool
 * Handles object movement with face highlighting and drag operations using shared selection behavior
 * Target: ~150 lines - face highlighting + movement logic + shared selection
 */

class MoveTool {
    constructor(selectionController, visualEffects) {
        this.selectionController = selectionController;
        this.visualEffects = visualEffects;

        // Use shared behaviors for consistency
        this.selectionBehavior = new BaseSelectionBehavior(selectionController);
        this.faceToolBehavior = new BaseFaceToolBehavior(selectionController, visualEffects);
        this.eventHandler = new BaseFaceToolEventHandler(this, this.faceToolBehavior, this.selectionBehavior);
        
        // Simplified drag state
        this.isDragging = false;
        this.dragObject = null;
        this.dragStartPosition = null;
        this.dragFaceNormal = null;
        this.lastMousePos = null;

        // Container update throttling using shared utils - use default 16ms for smooth updates
        this.containerThrottleState = MovementUtils.createThrottleState();

        // Direction change detection for immediate response
        this.lastMovementDelta = undefined;
    }
    
    /**
     * Handle mouse hover events - show face highlighting for selected objects and handle dragging
     */
    onHover(hit) {
        // Handle dragging movement during hover
        if (this.isDragging && this.dragObject && this.dragFaceNormal) {
            this.updateDragMovement();
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
            isActiveCheck: () => this.isDragging,
            startCallback: (hit) => this.startFaceDrag(hit),
            operationName: 'drag'
        });
        return this.eventHandler.handleMouseDown(hit, event, operationCallbacks);
    }
    
    /**
     * Handle mouse up events using centralized event handler
     */
    onMouseUp(hit, event) {
        const operationCallbacks = BaseFaceToolEventHandler.createOperationCallbacks({
            isActiveCheck: () => this.isDragging,
            endCallback: () => this.endFaceDrag()
        });
        return this.eventHandler.handleMouseUp(hit, event, operationCallbacks);
    }

    /**
     * Handle click events using centralized event handler
     */
    onClick(hit, event) {
        const operationCallbacks = { isOperationActive: () => this.isDragging };
        this.eventHandler.handleClick(hit, event, operationCallbacks);
    }
    
    /**
     * Handle double-click events using centralized event handler
     */
    onDoubleClick(hit, event) {
        const operationCallbacks = { isOperationActive: () => this.isDragging };
        this.eventHandler.handleDoubleClick(hit, event, operationCallbacks);
    }
    
    /**
     * Start face-based dragging operation
     */
    startFaceDrag(hit) {
        
        // Use shared behavior to get target object (handles both old and new container architectures)
        const targetObject = this.faceToolBehavior.getTargetObject(hit);
        
        this.isDragging = true;
        this.dragObject = targetObject; // Use the actual container, not the collision mesh
        this.dragStartPosition = targetObject.position.clone();

        // Reset direction tracking for new drag operation
        this.lastMovementDelta = undefined;

        // Store the hit point on the face for proper snap offset calculation
        this.dragHitPoint = hit.point.clone();

        // Request snap detection for drag operation
        const snapController = window.modlerComponents?.snapController;
        if (snapController) {
            snapController.requestSnapDetection();
        }

        // Get face normal in world space for movement direction
        const worldNormal = hit.face.normal.clone();

        // Transform normal based on the object that was hit - handle all container architectures
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
        this.dragFaceNormal = worldNormal;

        // Store snap attachment point if snapping is enabled
        this.snapAttachmentPoint = null;
        if (snapController && snapController.getEnabled()) {
            const currentSnapPoint = snapController.getCurrentSnapPoint();
            if (currentSnapPoint) {
                // Record the exact point where snapping started
                this.snapAttachmentPoint = currentSnapPoint.worldPos.clone();
            }
        }
        
        // Store initial mouse position
        const inputController = window.modlerComponents?.inputController;
        if (inputController) {
            this.lastMousePos = inputController.mouse.clone();
        }
        
        // Clear the highlight since we're now dragging
        this.faceToolBehavior.clearHover();
        
    }
    
    /**
     * Update object position during drag - Uses global CameraMathUtils for proper cursor following
     */
    updateDragMovement() {
        const inputController = window.modlerComponents?.inputController;
        const camera = window.modlerComponents?.sceneFoundation?.camera;

        if (!inputController || !camera || !this.lastMousePos || !window.CameraMathUtils) return;

        // Get current mouse position in NDC
        const currentMouseNDC = inputController.mouse;
        const previousMouseNDC = this.lastMousePos;
        
        // Calculate mouse delta
        const mouseDelta = window.CameraMathUtils.calculateMouseDelta(currentMouseNDC, previousMouseNDC);
        
        // Only move if there's actual mouse movement
        if (mouseDelta.length() < 0.001) return;
        
        // Use global dragging system for axis-constrained movement along face normal
        const worldMovement = window.CameraMathUtils.screenDeltaToAxisMovement(
            mouseDelta, 
            this.dragObject.position, 
            this.dragFaceNormal, 
            camera
        );
        
        // Detect direction changes and reset throttle state for immediate response
        if (this.lastMovementDelta !== undefined) {
            // Check if movement direction changed significantly
            const directionChanged = this.lastMovementDelta.dot(worldMovement) < 0;
            if (directionChanged && worldMovement.length() > 0.001) {
                // Reset throttle states to ensure immediate response on direction change
                this.containerThrottleState.lastUpdateTime = 0;
                this.containerThrottleState.immediateUpdateTime = 0;

                // Clear bounds cache for this object to force fresh calculation
                if (window.PositionTransform && this.dragObject?.uuid) {
                    window.PositionTransform.clearCacheForObject(this.dragObject.uuid);
                }
            }
        }
        this.lastMovementDelta = worldMovement.clone();

        // Calculate potential new position
        const potentialPosition = this.dragObject.position.clone().add(worldMovement);
        
        // Update snap detection with travel axis information for edge filtering
        const snapController = window.modlerComponents?.snapController;
        if (snapController && snapController.getEnabled()) {
            // Provide travel axis information to filter edges perpendicular to movement
            snapController.updateSnapDetection('move', [this.dragObject], this.dragFaceNormal);
            const currentSnapPoint = snapController.getCurrentSnapPoint();
            if (currentSnapPoint) {
                // Apply axis-constrained snapping with face offset: face point snaps to snap point, not object center
                const axisConstrainedPosition = this.applyAxisConstrainedSnapWithFaceOffset(
                    potentialPosition,
                    currentSnapPoint.worldPos,
                    this.dragFaceNormal,
                    this.dragHitPoint,
                    this.dragStartPosition
                );

                // Use axis-constrained snapped position
                this.dragObject.position.copy(axisConstrainedPosition);
            } else {
                // No snap point, use regular movement
                this.dragObject.position.copy(potentialPosition);
            }
        } else {
            // Snapping disabled, use regular movement
            this.dragObject.position.copy(potentialPosition);
        }
        
        // Update related meshes in real-time during drag through MeshSynchronizer with immediate feedback
        const meshSynchronizer = window.modlerComponents?.meshSynchronizer;
        if (meshSynchronizer) {
            meshSynchronizer.syncAllRelatedMeshes(this.dragObject, 'transform', true);
        }

        // Notify centralized system for real-time property panel updates
        if (window.notifyObjectModified) {
            window.notifyObjectModified(this.dragObject, 'transform');
        }
        
        // Update container context highlight if we're in container mode and moving a container
        // Skip real-time updates when moving child objects - container will resize at end of drag
        if (this.selectionController.isInContainerContext()) {
            const sceneController = window.modlerComponents?.sceneController;
            if (sceneController) {
                const objectData = sceneController.getObjectByMesh(this.dragObject);
                // Only update container during drag if we're moving a container itself
                // Child object movements will trigger container resize via endFaceDrag() -> notifyObjectTransformChanged()
                if (objectData && objectData.isContainer) {
                    this.updateContainerDuringDrag();
                }
            }
        }
        
        // Update last mouse position for next frame
        this.lastMousePos = currentMouseNDC.clone();
    }
    
    /**
     * Apply axis-constrained snapping with face offset: face point snaps to snap point, not object center
     */
    applyAxisConstrainedSnapWithFaceOffset(currentPosition, snapPoint, travelAxis, faceHitPoint, objectStartPosition) {
        // Calculate offset from object center to the hit point on the face at drag start
        const faceOffset = faceHitPoint.clone().sub(objectStartPosition);

        // Determine which axis the object is primarily moving along
        const absAxis = {
            x: Math.abs(travelAxis.x),
            y: Math.abs(travelAxis.y),
            z: Math.abs(travelAxis.z)
        };

        // Find the dominant axis (the one with highest absolute value)
        let dominantAxis = 'x';
        let maxValue = absAxis.x;

        if (absAxis.y > maxValue) {
            dominantAxis = 'y';
            maxValue = absAxis.y;
        }
        if (absAxis.z > maxValue) {
            dominantAxis = 'z';
        }

        // Calculate target object position so that the face point reaches the snap point
        const targetObjectPosition = currentPosition.clone();
        const snapPointWithOffset = snapPoint.clone().sub(faceOffset);

        // Apply snap only along the dominant axis
        switch (dominantAxis) {
            case 'x':
                targetObjectPosition.x = snapPointWithOffset.x;
                break;
            case 'y':
                targetObjectPosition.y = snapPointWithOffset.y;
                break;
            case 'z':
                targetObjectPosition.z = snapPointWithOffset.z;
                break;
        }

        return targetObjectPosition;
    }
    
    /**
     * End face drag operation
     */
    endFaceDrag() {
        if (!this.isDragging) return;
        
        // Notify SceneController of final position change for container resizing
        if (this.dragObject) {
            const sceneController = window.modlerComponents?.sceneController;
            if (sceneController) {
                const objectData = sceneController.getObjectByMesh(this.dragObject);
                if (objectData) {
                    sceneController.notifyObjectTransformChanged(objectData.id);
                }
            }

            // Container updates are handled automatically by SceneController.notifyObjectTransformChanged
        }

        // Clean up drag state - centralized system handles snap state
        this.isDragging = false;
        this.dragObject = null;
        this.dragStartPosition = null;
        this.dragFaceNormal = null;
        this.lastMousePos = null;
        this.snapAttachmentPoint = null;
        this.dragHitPoint = null;

        // Clear any existing highlights and hover states to ensure clean state
        this.faceToolBehavior.clearHover();

        // Re-trigger face highlighting for current mouse position after tool operation ends
        this.checkForFaceHighlightAfterOperation();
    }
    
    /**
     * Update container during drag operation - triggers container resize
     */
    updateContainerDuringDrag() {
        const sceneController = window.modlerComponents?.sceneController;
        if (!sceneController || !this.dragObject) return;
        
        const objectData = sceneController.getObjectByMesh(this.dragObject);
        if (!objectData || !objectData.parentContainer) return;
        
        // Get the container
        const container = sceneController.getObject(objectData.parentContainer);
        if (!container) return;
        
        // Trigger container resize calculation
        const containerCrudManager = window.modlerComponents?.containerCrudManager;
        if (containerCrudManager) {
            
            // Use MovementUtils for consistent container update behavior with immediate visuals
            MovementUtils.updateParentContainer(this.dragObject, false, this.containerThrottleState, null, true);
            
            // Update the container selection highlight to reflect new size
            this.selectionController.updateContainerEdgeHighlight();
        }
    }
    
    
    /**
     * Tool activation using centralized event handler
     */
    onToolActivate() {
        this.eventHandler.handleToolActivate();

        // Store original snap state for legacy compatibility
        const snapController = window.modlerComponents?.snapController;
        if (snapController) {
            this.originalSnapState = snapController.getEnabled();
        }
    }

    /**
     * Tool deactivation using centralized event handler
     */
    onToolDeactivate() {
        const deactivationCallbacks = BaseFaceToolEventHandler.createDeactivationCallbacks({
            isActiveCheck: () => this.isDragging,
            endCallback: () => this.endFaceDrag()
        });
        this.eventHandler.handleToolDeactivate(deactivationCallbacks);

        // Clean up snap detection state
        const snapController = window.modlerComponents?.snapController;
        if (snapController) {
            this.originalSnapState = undefined;
        }
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
     * Check if tool has active highlighting
     */
    hasActiveHighlight() {
        return this.faceToolBehavior.hasActiveHighlight();
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

            // Get current mouse position in screen coordinates
            const rect = inputController.canvas?.getBoundingClientRect();
            if (!rect) return;

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

    /**
     * Check for face highlighting when object is selected
     * Shows face highlighting immediately if mouse is hovering over a selected object's face
     */
    checkForFaceHighlightOnSelection() {
        // Use a small delay to ensure selection state is fully updated
        setTimeout(() => {
            const inputController = window.modlerComponents?.inputController;
            if (!inputController) return;

            // Get current mouse position in screen coordinates
            const rect = inputController.canvas?.getBoundingClientRect();
            if (!rect) return;

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
}