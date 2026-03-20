/**
 * Move Tool
 * Handles object movement with face highlighting and drag operations using centralized SelectionController
 * Features: Face-constrained dragging, axis-constrained snapping, container-aware updates
 */

class MoveTool {
    constructor(selectionController, visualEffects) {
        this.selectionController = selectionController;
        this.visualEffects = visualEffects;

        // Use shared behaviors for consistency
        this.faceToolBehavior = new BaseFaceToolBehavior(selectionController, visualEffects, 'move');
        this.eventHandler = new BaseFaceToolEventHandler(this, this.faceToolBehavior, selectionController);

        // Simplified drag state
        this.isDragging = false;
        this.dragObject = null;
        this.dragStartPosition = null;
        this.dragFaceNormal = null;
        this.lastMousePos = null;

        // Duplication mode (visual state managed by DuplicationMode)
        this.duplicationMode = new DuplicationMode();

        // Unified state management system
        this.objectStateManager = null;

        // Container update throttling using shared utils - use default 16ms for smooth updates
        this.containerThrottleState = MovementUtils.createThrottleState();

        // Direction change detection for immediate response
        this.lastMovementDelta = undefined;

        // Track cumulative movement for Tab key focus
        this.cumulativeMovement = { x: 0, y: 0, z: 0 };

        // Position update debouncing to prevent UI spam
        this.lastPositionUpdateTime = 0;
        this.positionUpdateThrottle = 16; // ~60fps max rate
        this.pendingPositionUpdate = null;

        // Initialize ObjectStateManager after components are loaded
        setTimeout(() => {
            this.objectStateManager = window.modlerComponents?.objectStateManager;
        }, 50);
    }
    
    /**
     * Check if face highlighting should be shown for this object
     */
    shouldShowFaceHighlight(hit) {
        if (!hit || !hit.object) return false;

        const targetObject = this.faceToolBehavior.getTargetObject(hit);
        if (!targetObject) return false;

        // Check if object is a child in a layout-enabled container
        // BUT: If the container itself is selected, allow highlights on the container
        const sceneController = window.modlerComponents?.sceneController;
        if (sceneController) {
            const objectData = sceneController.getObjectByMesh(targetObject);

            // If this is a child inside a layout container
            if (objectData && objectData.parentContainer) {
                // Use centralized state machine
                if (this.objectStateManager?.isLayoutMode(objectData.parentContainer)) {
                    const container = sceneController.getObject(objectData.parentContainer);
                    // Check if the CONTAINER is selected (not the child)
                    // If container is selected, we're trying to show highlights on the container, not the child
                    const isContainerSelected = this.selectionController?.isSelected(container?.mesh);

                    if (isContainerSelected) {
                        // Container is selected - allow highlights on container (face highlighting will redirect to container)
                        return true;
                    } else {
                        // Child is selected but in layout mode - block highlights
                        // User must double-click to enter container context to edit individual objects
                        return false;
                    }
                }
            }
        }

        return true; // Allow highlighting for everything else
    }

    /**
     * Handle mouse hover events - show face highlighting for selected objects and handle dragging
     */
    onHover(hit, isAltPressed) {
        // Handle dragging movement during hover
        if (this.isDragging && this.dragObject && this.dragFaceNormal) {
            this.updateDragMovement();
            return;
        }

        // Handle Alt-key measurement mode
        if (MovementUtils.handleMeasurementMode(isAltPressed, hit, this.selectionController)) return;

        // Check if we should show highlight for this object
        if (!this.shouldShowFaceHighlight(hit)) {
            this.faceToolBehavior.clearHover();
            return;
        }

        // Use shared face detection behavior
        this.faceToolBehavior.handleFaceDetection(hit);
    }
    
    /**
     * Handle mouse down events - validates selection before starting drag
     * Trust SelectionController's previous selection decision
     */
    onMouseDown(hit, event) {
        // Only handle left mouse button
        if (event.button !== 0) return false;

        // Don't start new drag if already dragging
        if (this.isDragging) return false;

        // VALIDATION APPROACH: Only drag if hitting a SELECTED object
        // SelectionController already applied container-first logic during onClick
        // InputController raycast already filters out children when parent container is selected
        if (hit && hit.object) {
            const hitObject = this.faceToolBehavior.getTargetObject(hit);

            // Check if the hit object is currently selected
            const isSelected = hitObject && this.selectionController.isSelected(hitObject);

            if (isSelected) {
                // Selected object - start drag
                const sceneController = window.modlerComponents?.sceneController;
                const objectData = sceneController?.getObjectByMesh(hitObject);
                const isContainer = objectData?.isContainer;
                const hasValidFace = this.faceToolBehavior.hasValidFaceHover(hit);

                if (isContainer || hasValidFace) {
                    this.startFaceDrag(hit);
                    return true;
                }
            }
            // Not selected - ignore drag attempt (onClick already handled selection)
        }

        return false;
    }
    
    /**
     * Handle mouse up events using centralized event handler
     */
    onMouseUp(hit, event) {
        // Check if we're dragging and if there was significant movement
        const wasDragging = this.isDragging;
        const hadSignificantMovement = wasDragging && (
            Math.abs(this.cumulativeMovement.x) > 0.001 ||
            Math.abs(this.cumulativeMovement.y) > 0.001 ||
            Math.abs(this.cumulativeMovement.z) > 0.001
        );

        const operationCallbacks = BaseFaceToolEventHandler.createOperationCallbacks({
            isActiveCheck: () => this.isDragging,
            endCallback: () => this.endFaceDrag()
        });

        const handled = this.eventHandler.handleMouseUp(hit, event, operationCallbacks);

        // If we ended a drag but didn't move significantly, allow click/double-click processing
        // This enables double-click navigation even when face highlighting started a drag
        if (handled && !hadSignificantMovement) {
            return false; // Allow InputController to process as click/double-click
        }

        return handled;
    }

    /**
     * Handle click events using centralized event handler
     * SelectionController handles ALL selection logic including container-first redirection
     */
    onClick(hit, event) {
        if (this.isDragging) return;

        // Let SelectionController handle all selection logic (including container-first)
        // No tool-specific overrides - single source of truth
        if (hit && hit.object) {
            const targetObject = this.faceToolBehavior.getTargetObject(hit);
            this.selectionController.handleObjectClick(targetObject, event, { toolType: 'MoveTool' });
        } else {
            this.selectionController.handleEmptySpaceClick(event);
        }
    }
    
    /**
     * Handle double-click events using centralized event handler
     */
    onDoubleClick(hit, event) {
        const operationCallbacks = { isOperationActive: () => this.isDragging };
        this.eventHandler.handleDoubleClick(hit, event, operationCallbacks);
    }

    /**
     * Check if Command/Meta key is currently pressed
     * Direct query to KeyboardRouter - no event handlers needed
     */
    isCommandKeyPressed() {
        const keyboardRouter = window.modlerComponents?.keyboardRouter;
        return keyboardRouter?.keys.has('MetaLeft') || keyboardRouter?.keys.has('MetaRight') || false;
    }

    /**
     * Update object position through unified state management
     */
    updateObjectPosition(newPosition) {
        if (!this.dragObject) return;

        // Throttle position updates to prevent UI spam
        const now = Date.now();
        if (now - this.lastPositionUpdateTime < this.positionUpdateThrottle) {
            // Clear previous pending update and set new one
            if (this.pendingPositionUpdate) {
                clearTimeout(this.pendingPositionUpdate);
            }

            this.pendingPositionUpdate = setTimeout(() => {
                this.performPositionUpdate(newPosition);
                this.pendingPositionUpdate = null;
            }, this.positionUpdateThrottle);
            return;
        }

        this.performPositionUpdate(newPosition);
    }

    performPositionUpdate(newPosition) {
        // Safety check: dragObject might have been cleared by deactivate()
        if (!this.dragObject) {
            return;
        }

        this.lastPositionUpdateTime = Date.now();

        // Get object ID for state management
        const sceneController = window.modlerComponents?.sceneController;
        const objectData = sceneController?.getObjectByMesh?.(this.dragObject);
        const objectId = objectData?.id || this.dragObject.uuid;

        // FAST PATH: During drag, update mesh directly AND notify UI
        // Skip full propagation (no container updates, no event bus spam)
        if (this.isDragging) {
            this.dragObject.position.copy(newPosition);
            this.dragObject.updateMatrixWorld(true);

            // Update UI panel in real-time without full ObjectStateManager propagation
            if (this.objectStateManager) {
                const object = this.objectStateManager.getObject(objectId);
                if (object) {
                    // Update local state copy for UI sync
                    object.position = {
                        x: newPosition.x,
                        y: newPosition.y,
                        z: newPosition.z
                    };
                    // Trigger UI update only (skip SceneController and event propagation)
                    this.objectStateManager.updateUISystems([object]);
                }
            }
            return;
        }

        // FULL PATH: Discrete updates (non-drag) go through full ObjectStateManager
        if (this.objectStateManager) {
            // Use unified state management - automatically handles 3D scene, UI notifications, layout updates
            this.objectStateManager.updateObject(objectId, {
                position: {
                    x: newPosition.x,
                    y: newPosition.y,
                    z: newPosition.z
                }
            });
        } else {
            // Fallback to direct manipulation if ObjectStateManager unavailable
            this.dragObject.position.copy(newPosition);
            this.dragObject.updateMatrixWorld(true);
        }
    }

    /**
     * Register field navigation for Tab key during dragging
     */
    registerFieldNavigation() {
        if (!this.dragFaceNormal || !this.dragObject) return;

        // Get dominant axis from face normal
        const dominantAxis = window.CameraMathUtils.getDominantAxisFromNormal(this.dragFaceNormal);

        // Get field navigation manager
        const fieldNavigationManager = window.modlerComponents?.fieldNavigationManager;
        if (!fieldNavigationManager) return;

        // Define field order based on dominant axis
        const axisOrder = {
            'x': ['pos-x', 'pos-y', 'pos-z'],
            'y': ['pos-y', 'pos-x', 'pos-z'],
            'z': ['pos-z', 'pos-x', 'pos-y']
        };

        // Register navigation workflow starting with the axis being manipulated
        fieldNavigationManager.registerNavigationWorkflow('move-tool-drag', {
            fieldOrder: axisOrder[dominantAxis],
            onFieldFocus: (fieldId, index) => {
                // Focus on the selected field in property panel
            },
            onFieldApply: (fieldId, value, event) => {
                // Apply value immediately during Tab navigation
            },
            onWorkflowComplete: () => {
                // Navigation workflow completed
            }
        });
    }

    /**
     * Start face-based dragging operation
     * DEFENSIVE: Last line of defense to ensure we're dragging the selected object
     */
    startFaceDrag(hit) {

        // Use shared behavior to get target object (handles both old and new container architectures)
        let targetObject = this.faceToolBehavior.getTargetObject(hit);

        const sceneController = window.modlerComponents?.sceneController;
        const selectedObjects = this.selectionController.getSelectedObjects();

        if (sceneController && selectedObjects.length > 0) {
            const objectData = sceneController.getObjectByMesh(targetObject);

            // DEFENSIVE CHECK: If hit object has a parent container that's selected,
            // use the container instead (safety net against child dragging)
            if (objectData && objectData.parentContainer) {
                const parentContainer = sceneController.getObject(objectData.parentContainer);

                // If parent container is selected, drag it instead
                if (parentContainer && selectedObjects.includes(parentContainer.mesh)) {
                    targetObject = parentContainer.mesh;
                }

                // Check if still trying to drag child in layout mode (shouldn't happen, but defensive)
                // Use centralized state machine
                if (this.objectStateManager?.isLayoutMode(objectData?.parentContainer)) {
                    const isDraggingChild = targetObject === objectData.mesh;
                    if (isDraggingChild) {
                        return false;
                    }
                }
            }
        }

        this.isDragging = true;
        this.dragObject = targetObject; // Use the resolved target (container if selected)
        this.dragStartPosition = targetObject.position.clone();

        MovementUtils.registerFileOperation('move-tool-drag');

        // Reset direction tracking for new drag operation
        this.lastMovementDelta = undefined;

        // Reset cumulative movement tracking for Tab key focus
        this.cumulativeMovement = { x: 0, y: 0, z: 0 };

        // Store the hit point on the face for proper snap offset calculation
        this.dragHitPoint = hit.point.clone();

        // Request snap detection for drag operation
        const snapController = window.modlerComponents?.snapController;
        if (snapController) {
            snapController.requestSnapDetection();
        }

        // Get face normal in world space using shared behavior (handles all container architectures)
        this.dragFaceNormal = this.faceToolBehavior.getWorldFaceNormal(hit);

        // Register field navigation for Tab key during dragging
        this.registerFieldNavigation();

        // Store snap attachment point if snapping is enabled
        this.snapAttachmentPoint = null;
        if (snapController && snapController.getEnabled()) {
            const currentSnapPoint = snapController.getCurrentSnapPoint();
            if (currentSnapPoint) {
                // Record the exact point where snapping started
                this.snapAttachmentPoint = currentSnapPoint.worldPos.clone();
            }
        }
        
        // Store initial mouse position and check for Command/Meta key at drag start
        const inputController = window.modlerComponents?.inputController;
        if (inputController) {
            this.lastMousePos = inputController.mouse.clone();
        }

        // Check if Command/Meta key is already pressed when starting drag
        if (this.isCommandKeyPressed()) {
            this.duplicationMode.enter(targetObject, this.dragStartPosition);
        }

        // Clear the highlight since we're now dragging
        this.faceToolBehavior.clearHover();

        // Enable interactive mesh visibility for face-based tool interaction (objects only, not containers)
        if (targetObject?.userData?.supportMeshes?.interactiveMesh && !targetObject.userData.isContainer) {
            const supportMeshFactory = window.modlerComponents?.supportMeshFactory;
            if (supportMeshFactory) {
                supportMeshFactory.showInteractiveMesh(targetObject);
            }
        }

    }
    
    /**
     * Update object position during drag - Uses global CameraMathUtils for proper cursor following
     */
    updateDragMovement() {
        const inputController = window.modlerComponents?.inputController;
        const camera = window.modlerComponents?.sceneFoundation?.camera;

        if (!inputController || !camera || !this.lastMousePos || !window.CameraMathUtils) return;

        // Check Command/Meta key state each frame - toggle duplication mode dynamically
        const isCommandPressed = this.isCommandKeyPressed();
        if (isCommandPressed && !this.duplicationMode.isActive) {
            this.duplicationMode.enter(this.dragObject, this.dragStartPosition);
        } else if (!isCommandPressed && this.duplicationMode.isActive) {
            this.duplicationMode.exit();
        }

        // Update duplication measurement during drag
        if (this.duplicationMode.isActive) {
            this.duplicationMode.updateMeasurement(this.dragObject);
        }

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

        // Track cumulative movement for determining dominant axis
        this.cumulativeMovement.x += Math.abs(worldMovement.x);
        this.cumulativeMovement.y += Math.abs(worldMovement.y);
        this.cumulativeMovement.z += Math.abs(worldMovement.z);

        // Calculate potential new position
        const potentialPosition = this.dragObject.position.clone().add(worldMovement);

        // Update snap detection with travel axis information for edge filtering
        const snapController = window.modlerComponents?.snapController;
        if (snapController && snapController.getEnabled()) {
            // Provide travel axis information to filter edges perpendicular to movement
            snapController.updateSnapDetection('move', [this.dragObject], this.dragFaceNormal);
            const currentSnapPoint = snapController.getCurrentSnapPoint();
            if (currentSnapPoint) {
                // Apply axis-constrained snapping with face offset using CameraMathUtils
                const axisConstrainedPosition = window.CameraMathUtils.applyAxisConstrainedSnapWithFaceOffset(
                    potentialPosition,
                    currentSnapPoint.worldPos,
                    this.dragFaceNormal,
                    this.dragHitPoint,
                    this.dragStartPosition
                );

                // Use unified state management for snapped position
                this.updateObjectPosition(axisConstrainedPosition);
            } else {
                // No snap point, use regular movement
                this.updateObjectPosition(potentialPosition);
            }
        } else {
            // Snapping disabled, use regular movement
            this.updateObjectPosition(potentialPosition);
        }

        // ObjectStateManager handles all notifications automatically
        // No manual ObjectEventBus emissions needed - unified state propagation
        
        // Update container context highlight if we're in container mode and moving a container
        // Skip real-time updates when moving child objects - container will resize at end of drag
        const navigationController = window.modlerComponents?.navigationController;
        if (navigationController?.isInContainerContext()) {
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
            // UNIFIED API: Real-time drag update (throttled)
            containerCrudManager.resizeContainer(objectData.parentContainer, {
                reason: 'child-changed',
                immediate: false  // Throttling handled by requestAnimationFrame
            });

            // Update the container selection highlight to reflect new size
            this.selectionController.updateContainerEdgeHighlight();
        }
    }

    /**
     * End face-based dragging operation
     */
    endFaceDrag() {
        if (!this.isDragging) return;

        const draggedObject = this.dragObject;
        const wasDuplicationMode = this.duplicationMode.isActive;

        // Record which axis was manipulated for Tab key focus
        if (draggedObject && window.inputFocusManager) {
            const dominantAxis = MovementUtils.getDominantAxisFromMovement(this.cumulativeMovement);
            const objectId = draggedObject.userData?.objectId || draggedObject.userData?.id || draggedObject.id;
            window.inputFocusManager.recordManipulation(objectId, `position.${dominantAxis}`);
        }

        // Unregister field navigation
        const fieldNavigationManager = window.modlerComponents?.fieldNavigationManager;
        if (fieldNavigationManager) {
            fieldNavigationManager.unregisterNavigationWorkflow('move-tool-drag');
        }

        // Finalize the move or duplication
        if (wasDuplicationMode && draggedObject) {
            this.finalizeDuplication(draggedObject);
        } else if (draggedObject) {
            this.finalizeMoveCommand(draggedObject);
        }

        // Cleanup
        this.cleanupDragState(draggedObject);
    }

    /**
     * Finalize duplication mode: create duplicate at final position, restore original
     */
    finalizeDuplication(draggedObject) {
        const sceneController = window.modlerComponents?.sceneController;
        const objectData = sceneController?.getObjectByMesh?.(draggedObject);
        if (!objectData || !sceneController) return;

        const finalPosition = {
            x: draggedObject.position.x,
            y: draggedObject.position.y,
            z: draggedObject.position.z
        };

        const hasMoved =
            Math.abs(finalPosition.x - this.dragStartPosition.x) > 0.001 ||
            Math.abs(finalPosition.y - this.dragStartPosition.y) > 0.001 ||
            Math.abs(finalPosition.z - this.dragStartPosition.z) > 0.001;

        if (!hasMoved) return;

        const historyManager = window.modlerComponents?.historyManager;
        if (!historyManager) return;

        // Create duplicate BEFORE moving source back (children's world positions must be correct)
        const command = new DuplicateObjectCommand(objectData.id, {
            position: finalPosition,
            customName: `${objectData.name} copy`
        });
        const success = historyManager.executeCommand(command);

        // Restore original to start position
        draggedObject.position.copy(this.dragStartPosition);
        draggedObject.updateMatrixWorld(true);
        this.objectStateManager?.updateObject(objectData.id, {
            position: this.dragStartPosition
        });

        // Select the new duplicate
        if (success && command.duplicatedObjectId) {
            const duplicateData = sceneController.getObject(command.duplicatedObjectId);
            if (duplicateData?.mesh) {
                this.selectionController.clearSelection();
                this.selectionController.select(duplicateData.mesh);
            }
        }
    }

    /**
     * Finalize normal move: sync position to state and create undo command
     */
    finalizeMoveCommand(draggedObject) {
        if (!this.objectStateManager) return;

        const sceneController = window.modlerComponents?.sceneController;
        const objectData = sceneController?.getObjectByMesh?.(draggedObject);
        const objectId = objectData?.id || draggedObject.uuid;

        const finalPosition = {
            x: draggedObject.position.x,
            y: draggedObject.position.y,
            z: draggedObject.position.z
        };

        this.objectStateManager.updateObject(objectId, { position: finalPosition });

        // Create undoable command if position changed
        const historyManager = window.modlerComponents?.historyManager;
        if (historyManager && this.dragStartPosition) {
            const hasMoved =
                Math.abs(finalPosition.x - this.dragStartPosition.x) > 0.001 ||
                Math.abs(finalPosition.y - this.dragStartPosition.y) > 0.001 ||
                Math.abs(finalPosition.z - this.dragStartPosition.z) > 0.001;

            if (hasMoved) {
                const command = new MoveObjectCommand(objectId, this.dragStartPosition, finalPosition);
                historyManager.executeCommand(command);
            }
        }
    }

    /**
     * Clean up all drag state and update parent containers
     */
    cleanupDragState(draggedObject) {
        if (this.duplicationMode.isActive) {
            this.duplicationMode.exit();
        }

        // Clear drag state
        this.isDragging = false;
        this.dragObject = null;
        this.dragStartPosition = null;
        this.dragFaceNormal = null;
        this.lastMousePos = null;
        this.snapAttachmentPoint = null;
        this.dragHitPoint = null;

        MovementUtils.unregisterFileOperation('move-tool-drag');

        this.faceToolBehavior.clearHover();

        if (!draggedObject) {
            this.checkForFaceHighlight();
            return;
        }

        // Hide interactive mesh after drag (objects only)
        if (draggedObject.userData?.supportMeshes?.interactiveMesh && !draggedObject.userData.isContainer) {
            const supportMeshFactory = window.modlerComponents?.supportMeshFactory;
            if (supportMeshFactory) {
                supportMeshFactory.hideInteractiveMesh(draggedObject);
            }
        }

        // Sync support meshes
        if (window.GeometryUtils) {
            window.GeometryUtils.updateSupportMeshGeometries(draggedObject);
        }

        // Update parent container after drag
        this.updateParentContainerAfterDrag(draggedObject);

        this.checkForFaceHighlight();
    }

    /**
     * Notify parent container that a child was moved
     */
    updateParentContainerAfterDrag(draggedObject) {
        const sceneController = window.modlerComponents?.sceneController;
        const containerCrudManager = window.modlerComponents?.containerCrudManager;
        if (!sceneController || !containerCrudManager) return;

        const objectData = sceneController.getObjectByMesh(draggedObject);

        // Check if dragged object is or represents a container
        const isContainerInteractive = draggedObject.userData?.isContainerInteractive;
        const isContainerCollision = draggedObject.userData?.isContainerCollision;
        const representsContainer = (isContainerInteractive || isContainerCollision) &&
                                  draggedObject.userData?.containerMesh;

        let parentContainerId = null;

        if (objectData?.isContainer || representsContainer) {
            const containerToCheck = representsContainer ? draggedObject.userData.containerMesh : draggedObject;
            const containerData = sceneController.getObjectByMesh(containerToCheck);
            parentContainerId = containerData?.parentContainer;
        } else if (objectData?.parentContainer) {
            parentContainerId = objectData.parentContainer;
        }

        if (parentContainerId) {
            containerCrudManager.resizeContainer(parentContainerId, {
                reason: 'child-changed',
                immediate: true
            });
        }
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

        // Clear any pending position updates to prevent null access
        if (this.pendingPositionUpdate) {
            clearTimeout(this.pendingPositionUpdate);
            this.pendingPositionUpdate = null;
        }

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
            this.checkForFaceHighlight();
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
     * Move tool should allow moving ANY selected object, including containers in hug mode
     */
    hasActiveHighlight() {
        // Check base face highlight first
        const baseHighlight = this.faceToolBehavior.hasActiveHighlight();
        if (baseHighlight) return true;

        // SPECIAL CASE: Allow moving selected containers even in hug mode
        // (Push tool correctly blocks hug containers, but move tool should always work)
        const hoveredObject = this.faceToolBehavior.hoveredObject;
        const hoveredHit = this.faceToolBehavior.hoveredHit;

        if (!hoveredObject || !hoveredHit) return false;

        // Check if hovering over a selected object
        const isSelected = this.selectionController.isSelected(hoveredObject);
        if (!isSelected) return false;

        // Check if it's a container (which might be in hug mode)
        const sceneController = window.modlerComponents?.sceneController;
        if (!sceneController) return isSelected;

        const objectData = sceneController.getObjectByMesh(hoveredObject);
        if (objectData && objectData.isContainer) {
            // Container is selected - allow movement regardless of hug mode
            return true;
        }

        return isSelected;
    }

    /**
     * Check for face highlighting at current mouse position
     * Re-triggers hover detection for proper face highlighting
     */
    checkForFaceHighlight() {
        // Standard delay for state updates
        const delay = 50;

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
        }, delay);
    }

}
window.MoveTool = MoveTool;
