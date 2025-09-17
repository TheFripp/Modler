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

        // Container update throttling using shared utils
        this.containerThrottleState = MovementUtils.createThrottleState(50);
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
        
        // Check if this is a container collision mesh
        const isContainerCollision = hit.object.userData.isContainerCollision;
        const targetObject = isContainerCollision ? hit.object.parent : hit.object;
        
        this.isDragging = true;
        this.dragObject = targetObject; // Use the actual container, not the collision mesh
        this.dragStartPosition = targetObject.position.clone();

        // Store the hit point on the face for proper snap offset calculation
        this.dragHitPoint = hit.point.clone();

        // Request snap detection for drag operation
        const snapController = window.modlerComponents?.snapController;
        if (snapController) {
            snapController.requestSnapDetection();
        }

        // Get face normal in world space for movement direction
        const worldNormal = hit.face.normal.clone();

        // Transform normal based on the object that was hit (collision mesh or regular object)
        if (isContainerCollision) {
            // For container collision mesh, use the collision mesh transform
            worldNormal.transformDirection(hit.object.matrixWorld);
        } else {
            // For regular objects, use the object transform
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
                console.log('Snap attachment point recorded:', this.snapAttachmentPoint);
            }
        }
        
        // Store initial mouse position
        const inputController = window.modlerComponents?.inputController;
        if (inputController) {
            this.lastMousePos = inputController.mouse.clone();
        }
        
        // Clear the highlight since we're now dragging
        this.visualEffects.clearHighlight();
        
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
        
        // Update related meshes in real-time during drag through MeshSynchronizer
        const meshSynchronizer = window.modlerComponents?.meshSynchronizer;
        if (meshSynchronizer) {
            meshSynchronizer.syncAllRelatedMeshes(this.dragObject, 'transform');
        } else {
            // Fallback to legacy sync method
            window.CameraMathUtils.syncSelectionWireframes(this.dragObject);
        }
        
        // Update property panel in real-time during movement
        if (window.updatePropertyPanelFromObject) {
            window.updatePropertyPanelFromObject(this.dragObject);
        }
        
        // Update container context highlight if we're in container mode
        if (this.selectionController.isInContainerContext()) {
            this.updateContainerDuringDrag();
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

            // Notify layout tool of object movement for container updates
            const toolController = window.modlerComponents?.toolController;
            if (toolController) {
                const layoutTool = toolController.getTool('layout');
                if (layoutTool && layoutTool.onObjectMove) {
                    layoutTool.onObjectMove(this.dragObject);
                }
            }
        }

        // Clean up drag state - centralized system handles snap state
        this.isDragging = false;
        this.dragObject = null;
        this.dragStartPosition = null;
        this.dragFaceNormal = null;
        this.lastMousePos = null;
        this.snapAttachmentPoint = null;
        this.dragHitPoint = null;
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
        const containerManager = window.modlerComponents?.containerManager;
        if (containerManager) {
            // CRITICAL FIX: Throttled logging to prevent browser crashes from excessive logging
            if (!this.lastLogTime || Date.now() - this.lastLogTime > 500) { // Log max once per 500ms
                console.log('📦 CONTAINER RESIZE: Moving object within container:', {
                    object: objectData.name,
                    container: container.name,
                    newPosition: this.dragObject.position.clone()
                });
                this.lastLogTime = Date.now();
            }
            
            containerManager.updateContainerBounds(objectData.parentContainer);
            
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
     * Handle selection changes - clear highlights if selected object changes
     */
    onSelectionChange(selectedObjects) {
        const hoverState = this.faceToolBehavior.getHoverState();
        // Clear highlights if the highlighted object is no longer selected
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

    /**
     * Check if tool has active highlighting
     */
    hasActiveHighlight() {
        return this.faceToolBehavior.hasActiveHighlight();
    }
}