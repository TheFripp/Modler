import * as THREE from 'three';
/**
 * Move Tool
 * Handles object movement with face highlighting and drag operations using centralized SelectionController
 * Features: Face-constrained dragging, corner-point dragging (camera-plane), snapping, container-aware updates
 * Extends BaseTool — component getters, lifecycle inherited
 */

class MoveTool extends BaseTool {
    constructor(selectionController, visualEffects) {
        super(selectionController, visualEffects);

        // Use shared behaviors for consistency
        this.faceToolBehavior = new BaseFaceToolBehavior(selectionController, visualEffects, 'move');
        this.eventHandler = new BaseFaceToolEventHandler(this, this.faceToolBehavior, selectionController);

        // Simplified drag state
        this.isDragging = false;
        this.dragObject = null;
        this.dragStartPosition = null;
        this.dragFaceNormal = null;
        this.lastMousePos = null;

        // Parent coordinate space tracking (for children in containers)
        this.dragParentMesh = null;
        this.dragStartWorldPos = null;

        // Duplication mode (visual state managed by DuplicationMode)
        this.duplicationMode = new DuplicationMode();

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

        // Corner drag state
        this.nearestCorner = null;          // { worldPos, screenPos, index } - hovered corner
        this.cornerHoverObject = null;      // Mesh whose corner is being hovered
        this.isCornerDragging = false;      // Distinguishes corner vs face drag
        this.dragCornerOffset = null;       // Vector3: local-space offset from object origin to dragged corner
        this.dragPlane = null;              // THREE.Plane for camera-perpendicular movement
        this.dragStartMouseWorldPos = null; // World position of mouse on drag plane at start
        this.cornerThreshold = 20;         // Screen pixels proximity for corner detection
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
        const sceneController = this.sceneController;
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
     * Detect nearest visible corner of a selected object.
     * Delegates to centralized ToolGizmoManager.findNearestVisibleCorner().
     */
    detectNearestCorner(targetObject) {
        const gizmo = this.toolGizmoManager;
        const inputController = this.inputController;
        if (!gizmo || !inputController) { this.clearCornerHover(); return; }

        const nearest = gizmo.findNearestVisibleCorner(
            targetObject, inputController.mouse, inputController.canvas, this.cornerThreshold
        );

        if (nearest) {
            this.nearestCorner = nearest;
            this.cornerHoverObject = targetObject;
            gizmo.showAnchorPoint(nearest.worldPos);
            this.toolGizmoManager?.hide('arrow');
        } else {
            this.clearCornerHover();
        }
    }

    /**
     * Clear corner hover state and hide circle gizmo
     */
    clearCornerHover() {
        if (this.nearestCorner) {
            this.nearestCorner = null;
            this.cornerHoverObject = null;
            this.toolGizmoManager?.hide('circle');
        }
    }

    /**
     * Handle mouse hover events - show face highlighting for selected objects and handle dragging
     */
    onHover(hit, isAltPressed) {
        // Handle dragging movement during hover
        if (this.isDragging && this.dragObject) {
            if (this.isCornerDragging) {
                this.updateCornerDragMovement();
            } else if (this.dragFaceNormal) {
                this.updateDragMovement();
            }
            return;
        }

        // Handle Alt-key measurement mode
        if (this.handleMeasurementMode(isAltPressed, hit)) return;

        // Corner detection runs on selected objects, independent of raycast hit.
        // Checks screen-space proximity to visible corners even when cursor is outside the object.
        let cornerDetected = false;
        const selectedObjects = this.selectionController.getSelectedObjects();
        if (selectedObjects.length === 1) {
            this.detectNearestCorner(selectedObjects[0]);
            cornerDetected = !!this.nearestCorner;
        } else {
            this.clearCornerHover();
        }

        // Face highlighting (separate from corner detection)
        if (!this.shouldShowFaceHighlight(hit)) {
            this.faceToolBehavior.clearHover();
            if (!cornerDetected) this.toolGizmoManager?.hide('arrow');
            return;
        }

        const faceDetected = this.faceToolBehavior.handleFaceDetection(hit);

        // Show arrow gizmo at face center (only if no corner detected — corner circle takes priority)
        if (!cornerDetected) {
            if (faceDetected) {
                const hoverState = this.faceToolBehavior.getHoverState();
                const faceHighlight = hoverState.object?.userData?.supportMeshes?.faceHighlight;
                if (faceHighlight && hoverState.hit) {
                    const worldPos = faceHighlight.getWorldPosition(new THREE.Vector3());
                    const worldNormal = this.faceToolBehavior.getWorldFaceNormal(hoverState.hit);
                    this.toolGizmoManager?.showArrow(worldPos, worldNormal);
                }
            } else {
                this.toolGizmoManager?.hide('arrow');
            }
        }
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

        // Corner drag — works even without a direct hit (mouse near corner in empty space)
        if (this.nearestCorner && this.cornerHoverObject) {
            if (this.selectionController.isSelected(this.cornerHoverObject)) {
                this.startCornerDrag(hit);
                return true;
            }
        }

        // VALIDATION APPROACH: Only drag if hitting a SELECTED object
        // SelectionController already applied container-first logic during onClick
        // InputController raycast already filters out children when parent container is selected
        if (hit && hit.object) {
            const hitObject = this.faceToolBehavior.getTargetObject(hit);

            // Check if the hit object is currently selected
            const isSelected = hitObject && this.selectionController.isSelected(hitObject);

            if (isSelected) {
                // Selected object - start face drag
                const sceneController = this.sceneController;
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
        const sceneController = this.sceneController;
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
                    this.objectStateManager.refreshSelectionUI([{ object }]);
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

        const sceneController = this.sceneController;
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

        // Cache parent mesh for local/world coordinate conversion during drag
        // Scene-root objects have local === world, so no conversion needed
        const scene = window.modlerComponents?.sceneFoundation?.scene;
        this.dragParentMesh = targetObject.parent && targetObject.parent !== scene
            ? targetObject.parent : null;

        // Store world-space start position for snap calculations
        this.dragStartWorldPos = this.dragParentMesh
            ? targetObject.getWorldPosition(new THREE.Vector3())
            : this.dragStartPosition.clone();

        MovementUtils.registerFileOperation('move-tool-drag');

        // Reset direction tracking for new drag operation
        this.lastMovementDelta = undefined;

        // Reset cumulative movement tracking for Tab key focus
        this.cumulativeMovement = { x: 0, y: 0, z: 0 };

        // Store the hit point on the face for proper snap offset calculation
        this.dragHitPoint = hit.point.clone();

        // Request snap detection for drag operation
        const snapController = this.snapController;
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
        const inputController = this.inputController;
        if (inputController) {
            this.lastMousePos = inputController.mouse.clone();
        }

        // Check if Command/Meta key is already pressed when starting drag
        if (this.isCommandKeyPressed()) {
            this.duplicationMode.enter(targetObject, this.dragStartPosition);
        }

        // Store arrow gizmo offset in object local space so it moves with the object
        if (this.toolGizmoManager?.isArrowVisible()) {
            const arrowWorldPos = this.toolGizmoManager.getArrowPosition();
            this._arrowLocalOffset = arrowWorldPos.sub(targetObject.getWorldPosition(new THREE.Vector3()));
        } else {
            this._arrowLocalOffset = null;
        }

        // Clear the highlight since we're now dragging (arrow gizmo stays visible)
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
     * Start corner-based dragging — free movement on camera-perpendicular plane
     */
    startCornerDrag(hit) {
        const camera = window.modlerComponents?.sceneFoundation?.camera;
        const inputController = this.inputController;
        if (!camera || !inputController || !this.nearestCorner) return false;

        // Resolve target object (same container logic as startFaceDrag)
        let targetObject = this.cornerHoverObject || this.faceToolBehavior.getTargetObject(hit);

        const sceneController = this.sceneController;
        const selectedObjects = this.selectionController.getSelectedObjects();

        if (sceneController && selectedObjects.length > 0) {
            const objectData = sceneController.getObjectByMesh(targetObject);

            // Defensive: if child's parent container is selected, use container
            if (objectData && objectData.parentContainer) {
                const parentContainer = sceneController.getObject(objectData.parentContainer);
                if (parentContainer && selectedObjects.includes(parentContainer.mesh)) {
                    targetObject = parentContainer.mesh;
                }
                if (this.objectStateManager?.isLayoutMode(objectData?.parentContainer)) {
                    const isDraggingChild = targetObject === objectData.mesh;
                    if (isDraggingChild) return false;
                }
            }
        }

        this.isDragging = true;
        this.isCornerDragging = true;
        this.dragObject = targetObject;
        this.dragStartPosition = targetObject.position.clone();
        this.dragFaceNormal = null; // Not axis-constrained

        // Cache parent mesh for coordinate conversion
        const scene = window.modlerComponents?.sceneFoundation?.scene;
        this.dragParentMesh = targetObject.parent && targetObject.parent !== scene
            ? targetObject.parent : null;

        this.dragStartWorldPos = this.dragParentMesh
            ? targetObject.getWorldPosition(new THREE.Vector3())
            : this.dragStartPosition.clone();

        // Compute corner offset in local space (corner position relative to object origin)
        const cornerWorldPos = this.nearestCorner.worldPos.clone();
        const objectWorldPos = targetObject.getWorldPosition(new THREE.Vector3());
        // Store offset in world space for snap calculations
        this.dragCornerOffset = cornerWorldPos.clone().sub(objectWorldPos);

        // Create drag plane perpendicular to camera at the corner position
        this.dragPlane = window.CameraMathUtils.createDragPlane(cornerWorldPos, camera);

        // Get initial mouse position on the drag plane
        this.dragStartMouseWorldPos = window.CameraMathUtils.screenToWorldOnPlane(
            inputController.mouse, this.dragPlane, camera
        );
        if (!this.dragStartMouseWorldPos) {
            this.isDragging = false;
            this.isCornerDragging = false;
            return false;
        }

        MovementUtils.registerFileOperation('move-tool-corner-drag');

        this.lastMovementDelta = undefined;
        this.cumulativeMovement = { x: 0, y: 0, z: 0 };
        this.lastMousePos = inputController.mouse.clone();

        // Store hit point for snap offset (use corner world pos)
        this.dragHitPoint = cornerWorldPos.clone();

        // Request snap detection
        const snapController = this.snapController;
        if (snapController) {
            snapController.requestSnapDetection();
        }

        // Check duplication mode
        if (this.isCommandKeyPressed()) {
            this.duplicationMode.enter(targetObject, this.dragStartPosition);
        }

        // Hide arrow, keep circle visible at corner
        this.toolGizmoManager?.hide('arrow');
        this._arrowLocalOffset = null;
        this.faceToolBehavior.clearHover();

        return true;
    }

    /**
     * Update object position during drag - Uses global CameraMathUtils for proper cursor following
     */
    updateDragMovement() {
        const inputController = this.inputController;
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
        
        // Use world position for drag plane projection (local position is wrong for children in containers)
        const objectWorldPos = this.dragParentMesh
            ? this.dragObject.getWorldPosition(new THREE.Vector3())
            : this.dragObject.position;

        // Update arrow gizmo — maintain local offset so it moves with the object
        if (this._arrowLocalOffset && this.toolGizmoManager?.isArrowVisible()) {
            this.toolGizmoManager.updateArrow(objectWorldPos.clone().add(this._arrowLocalOffset));
        }

        // Use global dragging system for axis-constrained movement along face normal
        const worldMovement = window.CameraMathUtils.screenDeltaToAxisMovement(
            mouseDelta,
            objectWorldPos,
            this.dragFaceNormal,
            camera
        );

        // Convert world movement delta to local space for children in containers
        // Root objects: local === world, no conversion needed
        let localMovement = worldMovement;
        if (this.dragParentMesh) {
            const parentInverse = new THREE.Matrix4().copy(this.dragParentMesh.matrixWorld).invert();
            localMovement = worldMovement.clone().transformDirection(parentInverse);
        }

        // Detect direction changes and reset throttle state for immediate response
        if (this.lastMovementDelta !== undefined) {
            // Check if movement direction changed significantly
            const directionChanged = this.lastMovementDelta.dot(localMovement) < 0;
            if (directionChanged && localMovement.length() > 0.001) {
                // Reset throttle states to ensure immediate response on direction change
                this.containerThrottleState.lastUpdateTime = 0;
                this.containerThrottleState.immediateUpdateTime = 0;

                // Clear bounds cache for this object to force fresh calculation
                if (window.PositionTransform && this.dragObject?.uuid) {
                    window.PositionTransform.clearCacheForObject(this.dragObject.uuid);
                }
            }
        }
        this.lastMovementDelta = localMovement.clone();

        // Track cumulative movement for determining dominant axis
        this.cumulativeMovement.x += Math.abs(localMovement.x);
        this.cumulativeMovement.y += Math.abs(localMovement.y);
        this.cumulativeMovement.z += Math.abs(localMovement.z);

        // Calculate potential new position (in local space)
        const potentialPosition = this.dragObject.position.clone().add(localMovement);

        // Update snap detection with travel axis information for edge filtering
        const snapController = this.snapController;
        if (snapController && snapController.getEnabled()) {
            // Provide travel axis information to filter edges perpendicular to movement
            snapController.updateSnapDetection('move', [this.dragObject], this.dragFaceNormal);
            const currentSnapPoint = snapController.getCurrentSnapPoint();
            if (currentSnapPoint) {
                // Snap works in world space — compute world position for snap calculation
                const snapWorldPos = this.dragParentMesh
                    ? objectWorldPos.clone().add(worldMovement)
                    : potentialPosition.clone();

                const snappedWorldPos = window.CameraMathUtils.applyAxisConstrainedSnapWithFaceOffset(
                    snapWorldPos,
                    currentSnapPoint.worldPos,
                    this.dragFaceNormal,
                    this.dragHitPoint,
                    this.dragStartWorldPos
                );

                if (this.dragParentMesh) {
                    // Convert snapped world position back to local space
                    const parentInverse = new THREE.Matrix4().copy(this.dragParentMesh.matrixWorld).invert();
                    const snappedLocalPos = snappedWorldPos.applyMatrix4(parentInverse);
                    this.updateObjectPosition(snappedLocalPos);
                } else {
                    this.updateObjectPosition(snappedWorldPos);
                }
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
        
        // Real-time parent container resize when dragging any child object
        // Applies to all child types (boxes, nested containers) regardless of navigation context
        const sceneController = this.sceneController;
        if (sceneController) {
            const objectData = sceneController.getObjectByMesh(this.dragObject);
            if (objectData && objectData.parentContainer) {
                this.updateContainerDuringDrag();
            }
        }
        
        // Update last mouse position for next frame
        this.lastMousePos = currentMouseNDC.clone();
    }

    /**
     * Update object position during corner drag — free movement on camera-perpendicular plane
     */
    updateCornerDragMovement() {
        const inputController = this.inputController;
        const camera = window.modlerComponents?.sceneFoundation?.camera;

        if (!inputController || !camera || !this.dragPlane || !this.dragStartMouseWorldPos) return;

        // Check duplication mode toggle
        const isCommandPressed = this.isCommandKeyPressed();
        if (isCommandPressed && !this.duplicationMode.isActive) {
            this.duplicationMode.enter(this.dragObject, this.dragStartPosition);
        } else if (!isCommandPressed && this.duplicationMode.isActive) {
            this.duplicationMode.exit();
        }
        if (this.duplicationMode.isActive) {
            this.duplicationMode.updateMeasurement(this.dragObject);
        }

        // Raycast current mouse onto drag plane for exact cursor-following
        const currentMouseWorldPos = window.CameraMathUtils.screenToWorldOnPlane(
            inputController.mouse, this.dragPlane, camera
        );
        if (!currentMouseWorldPos) return;

        // World-space delta from drag start
        const worldDelta = currentMouseWorldPos.clone().sub(this.dragStartMouseWorldPos);

        if (worldDelta.length() < 0.0001) return;

        // Convert to local space if in container
        let localDelta = worldDelta;
        if (this.dragParentMesh) {
            const parentInverse = new THREE.Matrix4().copy(this.dragParentMesh.matrixWorld).invert();
            localDelta = worldDelta.clone().transformDirection(parentInverse);
        }

        // Track cumulative movement (absolute delta from start, not incremental)
        this.cumulativeMovement.x = Math.abs(localDelta.x);
        this.cumulativeMovement.y = Math.abs(localDelta.y);
        this.cumulativeMovement.z = Math.abs(localDelta.z);

        // Calculate potential new position
        const potentialPosition = this.dragStartPosition.clone().add(localDelta);

        // Compute where the dragged corner would be in world space
        const draggedCornerWorldPos = this.dragStartWorldPos.clone()
            .add(this.dragCornerOffset)
            .add(worldDelta);

        // Snap check — null travelAxis includes all edges/corners
        // Pass dragged corner world position for anchor-to-anchor snap detection
        const snapController = this.snapController;
        if (snapController && snapController.getEnabled()) {
            snapController.updateSnapDetection('move', [this.dragObject], null, null, draggedCornerWorldPos);
            const currentSnapPoint = snapController.getCurrentSnapPoint();
            if (currentSnapPoint) {
                // Snap: position object so the dragged corner lands at the snap point
                const snappedObjectWorldPos = currentSnapPoint.worldPos.clone().sub(this.dragCornerOffset);

                if (this.dragParentMesh) {
                    const parentInverse = new THREE.Matrix4().copy(this.dragParentMesh.matrixWorld).invert();
                    const snappedLocalPos = snappedObjectWorldPos.applyMatrix4(parentInverse);
                    this.updateObjectPosition(snappedLocalPos);
                } else {
                    this.updateObjectPosition(snappedObjectWorldPos);
                }

                // Update circle to snap target position
                this.toolGizmoManager?.updateCircle(currentSnapPoint.worldPos, null);
            } else {
                this.updateObjectPosition(potentialPosition);
                this.toolGizmoManager?.updateCircle(draggedCornerWorldPos, null);
            }
        } else {
            this.updateObjectPosition(potentialPosition);
            this.toolGizmoManager?.updateCircle(draggedCornerWorldPos, null);
        }

        // Container resize during drag
        const sceneController = this.sceneController;
        if (sceneController) {
            const objectData = sceneController.getObjectByMesh(this.dragObject);
            if (objectData && objectData.parentContainer) {
                this.updateContainerDuringDrag();
            }
        }
    }

    /**
     * Update container during drag operation - triggers container resize
     */
    updateContainerDuringDrag() {
        const sceneController = this.sceneController;
        if (!sceneController || !this.dragObject) return;

        const objectData = sceneController.getObjectByMesh(this.dragObject);
        if (!objectData || !objectData.parentContainer) return;

        // Get the container
        const container = sceneController.getObject(objectData.parentContainer);
        if (!container) return;

        // Skip real-time hug updates during drag — hug recenter modifies the
        // dragged child's position, creating a feedback loop with the move delta.
        // Final hug update runs in updateParentContainerAfterDrag() after drag ends.
        if (container.containerMode === 'hug') return;

        // Trigger container resize calculation
        const containerCrudManager = this.containerCrudManager;
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
        const sceneController = this.sceneController;
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

        const historyManager = this.historyManager;
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

        const sceneController = this.sceneController;
        const objectData = sceneController?.getObjectByMesh?.(draggedObject);
        const objectId = objectData?.id || draggedObject.uuid;

        const finalPosition = {
            x: draggedObject.position.x,
            y: draggedObject.position.y,
            z: draggedObject.position.z
        };

        this.objectStateManager.updateObject(objectId, { position: finalPosition });

        // Create undoable command if position changed
        const historyManager = this.historyManager;
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
        this.dragParentMesh = null;
        this.dragStartWorldPos = null;
        this._arrowLocalOffset = null;

        // Clear corner drag state
        const wasCornerDrag = this.isCornerDragging;
        this.isCornerDragging = false;
        this.dragCornerOffset = null;
        this.dragPlane = null;
        this.dragStartMouseWorldPos = null;
        this.nearestCorner = null;
        this.cornerHoverObject = null;

        MovementUtils.unregisterFileOperation(wasCornerDrag ? 'move-tool-corner-drag' : 'move-tool-drag');

        this.toolGizmoManager?.hideAll();
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
        const sceneController = this.sceneController;
        const containerCrudManager = this.containerCrudManager;
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


    activate() {
        this.eventHandler.handleToolActivate();

        // Store original snap state for legacy compatibility
        if (this.snapController) {
            this.originalSnapState = this.snapController.getEnabled();
        }
    }

    deactivate() {
        this.toolGizmoManager?.hideAll();

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
        if (this.snapController) {
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

        // Clear corner hover when selection changes
        this.clearCornerHover();

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
     * Move tool allows moving ANY selected object, including containers in hug mode
     * (rules config in BaseFaceToolBehavior handles this — move tool doesn't block hug containers)
     */
    hasActiveHighlight() {
        if (this.nearestCorner) return true;
        if (this.faceToolBehavior.hasActiveHighlight()) return true;

        // Allow dragging selected containers even without explicit face highlight
        const hoveredObject = this.faceToolBehavior.hoveredObject;
        if (!hoveredObject) return false;

        const isSelected = this.selectionController.isSelected(hoveredObject);
        if (!isSelected) return false;

        const sceneController = this.sceneController;
        const objectData = sceneController?.getObjectByMesh(hoveredObject);
        return objectData?.isContainer === true;
    }

    /**
     * Check for face highlighting at current mouse position
     * Re-triggers hover detection for proper face highlighting
     */
    checkForFaceHighlight() {
        // Standard delay for state updates
        const delay = 50;

        setTimeout(() => {
            const inputController = this.inputController;
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
