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

        // Duplication mode state
        this.isDuplicationMode = false;
        this.ghostObject = null;

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
        if (!hit || !hit.object) {
            console.log('❌ MoveTool.shouldShowFaceHighlight: No hit or object');
            return false;
        }

        const targetObject = this.faceToolBehavior.getTargetObject(hit);
        if (!targetObject) {
            console.log('❌ MoveTool.shouldShowFaceHighlight: No target object');
            return false;
        }

        // Check if object is a child in a layout-enabled container
        // BUT: If the container itself is selected, allow highlights on the container
        const sceneController = window.modlerComponents?.sceneController;
        if (sceneController) {
            const objectData = sceneController.getObjectByMesh(targetObject);

            // If this is a child inside a layout container
            if (objectData && objectData.parentContainer) {
                const container = sceneController.getObject(objectData.parentContainer);
                if (container && container.autoLayout && container.autoLayout.enabled) {
                    // Check if the CONTAINER is selected (not the child)
                    // If container is selected, we're trying to show highlights on the container, not the child
                    const isContainerSelected = this.selectionController?.isSelected(container.mesh);

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

        // Check for measurement mode (Alt key)
        if (isAltPressed) {
            const measurementTool = window.modlerComponents?.measurementTool;
            if (measurementTool) {
                const selectedObjects = this.selectionController?.getSelectedObjects() || [];
                measurementTool.onHover(hit, selectedObjects);
            }
            return;
        }

        // Clear measurement when Alt not pressed
        const measurementTool = window.modlerComponents?.measurementTool;
        if (measurementTool) {
            measurementTool.clearMeasurement();
        }

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
     * CONTAINER FACE DRAGGING: When container is selected, ignore child hits to allow container face dragging
     */
    onMouseDown(hit, event) {
        // Only handle left mouse button
        if (event.button !== 0) return false;

        // Don't start new drag if already dragging
        if (this.isDragging) return false;

        // VALIDATION APPROACH: Only drag if hitting a SELECTED object (or its selected parent container)
        // SelectionController already applied container-first logic during onClick
        if (hit && hit.object) {
            const hitObject = this.faceToolBehavior.getTargetObject(hit);
            const sceneController = window.modlerComponents?.sceneController;
            const hitObjectData = sceneController?.getObjectByMesh(hitObject);

            // Check if the hit object itself is selected
            let isSelected = hitObject && this.selectionController.isSelected(hitObject);
            let dragTarget = hitObject;
            let dragTargetData = hitObjectData;

            // CONTAINER FACE DRAGGING FIX: If hit object is NOT selected, check if its parent container IS selected
            // This allows dragging container faces even when child objects are coplanar and get hit first
            if (!isSelected && hitObjectData?.parentContainer) {
                const parentContainer = sceneController.getObject(hitObjectData.parentContainer);
                if (parentContainer && this.selectionController.isSelected(parentContainer.mesh)) {
                    // Parent container is selected - use container as drag target instead of child
                    isSelected = true;
                    dragTarget = parentContainer.mesh;
                    dragTargetData = parentContainer;
                }
            }

            if (isSelected) {
                // Selected object (or selected parent container) - start drag
                const isContainer = dragTargetData?.isContainer;
                const hasValidFace = this.faceToolBehavior.hasValidFaceHover(hit);

                if (isContainer || hasValidFace) {
                    // For container drags triggered by child hits, redirect the hit to the container
                    if (dragTarget !== hitObject) {
                        // Create a new hit targeting the container's interactive mesh
                        const containerInteractiveMesh = dragTarget.children.find(
                            child => child.userData?.isContainerInteractive
                        );
                        if (containerInteractiveMesh) {
                            hit = {
                                ...hit,
                                object: containerInteractiveMesh,
                                // Preserve face data for direction detection
                            };
                        }
                    }

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
        const operationCallbacks = BaseFaceToolEventHandler.createOperationCallbacks({
            isActiveCheck: () => this.isDragging,
            endCallback: () => this.endFaceDrag()
        });
        return this.eventHandler.handleMouseUp(hit, event, operationCallbacks);
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
                if (parentContainer && parentContainer.autoLayout && parentContainer.autoLayout.enabled) {
                    const isDraggingChild = targetObject === objectData.mesh;
                    if (isDraggingChild) {
                        console.warn('MoveTool: Cannot move child objects in layout mode. Move the container instead.');
                        return false;
                    }
                }
            }
        }

        this.isDragging = true;
        this.dragObject = targetObject; // Use the resolved target (container if selected)
        this.dragStartPosition = targetObject.position.clone();

        // Register operation with FileManager to prevent auto-save during drag
        const fileManager = window.modlerComponents?.fileManager;
        if (fileManager && typeof fileManager.registerOperation === 'function') {
            fileManager.registerOperation('move-tool-drag');
        }

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
            this.enterDuplicationMode();
        }

        // Clear the highlight since we're now dragging
        this.faceToolBehavior.clearHover();

        // Enable interactive mesh visibility for face-based tool interaction (objects only, not containers)
        if (targetObject?.userData?.supportMeshes?.interactiveMesh && !targetObject.userData.isContainer) {
            targetObject.userData.supportMeshes.interactiveMesh.visible = true;
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
        if (isCommandPressed && !this.isDuplicationMode) {
            this.enterDuplicationMode();
        } else if (!isCommandPressed && this.isDuplicationMode) {
            this.exitDuplicationMode();
        }

        // Update duplication measurement during drag
        if (this.isDuplicationMode) {
            this.updateDuplicationMeasurement();
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
     * Enter duplication mode - create ghost object at original position
     * Visual: dragged object = duplicate (being positioned), ghost = original (stays at start)
     */
    enterDuplicationMode() {
        if (!this.dragObject || this.isDuplicationMode) return;

        this.isDuplicationMode = true;

        // Store current position of dragged object
        const currentDragPosition = this.dragObject.position.clone();

        // Create ghost object at START position to show where original will stay
        const sceneController = window.modlerComponents?.sceneController;
        const objectData = sceneController?.getObjectByMesh(this.dragObject);

        if (objectData) {
            // Create a temporary ghost wireframe (not pooled - short-lived visualization)
            const ghostEdgesGeometry = new THREE.EdgesGeometry(this.dragObject.geometry);
            const ghostMaterial = new THREE.LineBasicMaterial({
                color: 0x888888,
                opacity: 0.5,
                transparent: true
            });

            this.ghostObject = new THREE.LineSegments(ghostEdgesGeometry, ghostMaterial);
            this.ghostObject.position.copy(this.dragStartPosition);
            this.ghostObject.rotation.copy(this.dragObject.rotation);
            this.ghostObject.scale.copy(this.dragObject.scale);

            // Add to scene
            const scene = window.modlerComponents?.sceneFoundation?.scene;
            if (scene) {
                scene.add(this.ghostObject);
            }
        }

        // Keep dragged object at its current position (it represents the duplicate being created)
        this.dragObject.position.copy(currentDragPosition);

        // Show measurement line between original and duplicate
        this.showDuplicationMeasurement();
    }

    /**
     * Show measurement line between original and duplicate during duplication mode
     */
    showDuplicationMeasurement() {
        const measurementTool = window.modlerComponents?.measurementTool;
        if (!measurementTool || !this.ghostObject || !this.dragObject) return;

        // Get positions
        const originalPos = this.ghostObject.position;
        const duplicatePos = this.dragObject.position;

        // Calculate distance and direction
        const distance = originalPos.distanceTo(duplicatePos);
        const direction = duplicatePos.clone().sub(originalPos).normalize();

        // Create measurement visualization
        measurementTool.createFaceNormalMeasurementVisual(
            originalPos,
            duplicatePos,
            distance,
            false, // No start connector needed
            false, // No end connector needed
            this.ghostObject,
            this.dragObject
        );
    }

    /**
     * Update duplication measurement during drag
     */
    updateDuplicationMeasurement() {
        if (!this.isDuplicationMode) return;
        this.showDuplicationMeasurement();
    }

    /**
     * Exit duplication mode - return to normal move mode
     */
    exitDuplicationMode() {
        if (!this.isDuplicationMode) return;

        this.isDuplicationMode = false;

        // Clear measurement visualization
        const measurementTool = window.modlerComponents?.measurementTool;
        if (measurementTool) {
            measurementTool.clearMeasurement();
        }

        // Remove and dispose ghost object
        if (this.ghostObject) {
            const scene = window.modlerComponents?.sceneFoundation?.scene;
            if (scene) {
                scene.remove(this.ghostObject);
            }

            // Dispose temporary ghost resources
            if (this.ghostObject.geometry) {
                this.ghostObject.geometry.dispose();
            }
            if (this.ghostObject.material) {
                this.ghostObject.material.dispose();
            }

            this.ghostObject = null;
        }
    }

    /**
     * End face-based dragging operation
     */
    endFaceDrag() {
        if (!this.isDragging) return;

        const draggedObject = this.dragObject; // Store reference before clearing
        const wasDuplicationMode = this.isDuplicationMode;

        // Record which axis was manipulated for Tab key focus (based on actual movement, not face normal)
        if (draggedObject && window.inputFocusManager) {
            const dominantAxis = this.getDominantAxisFromMovement(this.cumulativeMovement);
            // Try multiple ways to get the object ID
            const objectId = draggedObject.userData?.objectId || draggedObject.userData?.id || draggedObject.id;
            window.inputFocusManager.recordManipulation(objectId, `position.${dominantAxis}`);
        }

        // Unregister field navigation
        const fieldNavigationManager = window.modlerComponents?.fieldNavigationManager;
        if (fieldNavigationManager) {
            fieldNavigationManager.unregisterNavigationWorkflow('move-tool-drag');
        }

        // Handle duplication mode vs normal move
        if (wasDuplicationMode && draggedObject) {
            // DUPLICATION MODE: Create duplicate at final position, keep original at start
            const sceneController = window.modlerComponents?.sceneController;
            const objectData = sceneController?.getObjectByMesh?.(draggedObject);

            if (objectData && sceneController) {
                const finalPosition = {
                    x: draggedObject.position.x,
                    y: draggedObject.position.y,
                    z: draggedObject.position.z
                };

                // Check if actually moved
                const hasMoved =
                    Math.abs(finalPosition.x - this.dragStartPosition.x) > 0.001 ||
                    Math.abs(finalPosition.y - this.dragStartPosition.y) > 0.001 ||
                    Math.abs(finalPosition.z - this.dragStartPosition.z) > 0.001;

                if (hasMoved) {
                    // Move original object back to start position
                    draggedObject.position.copy(this.dragStartPosition);
                    draggedObject.updateMatrixWorld(true);

                    // Update original object's position in state
                    this.objectStateManager?.updateObject(objectData.id, {
                        position: this.dragStartPosition
                    });

                    // Duplicate the object at the final position
                    const geometryFactory = window.modlerComponents?.geometryFactory;
                    if (geometryFactory) {
                        // Create COMPLETELY NEW geometry by cloning original geometry
                        // This ensures the duplicate is independent and not sharing geometry reference
                        const newGeometry = draggedObject.geometry.clone();

                        // Create NEW material by cloning original material
                        // This ensures materials are independent
                        const newMaterial = draggedObject.material.clone();

                        // Create duplicate with same properties but as independent object
                        // NOTE: For future component instancing feature, we would add:
                        // - isMasterComponent flag for original
                        // - masterComponentId reference for instances
                        // - one-way property sync from master to instances

                        // Prepare rotation - convert from degrees to THREE.Euler
                        const rotationEuler = objectData.rotation
                            ? new THREE.Euler(
                                THREE.MathUtils.degToRad(objectData.rotation.x || 0),
                                THREE.MathUtils.degToRad(objectData.rotation.y || 0),
                                THREE.MathUtils.degToRad(objectData.rotation.z || 0),
                                'XYZ'
                              )
                            : new THREE.Euler(0, 0, 0, 'XYZ');

                        const duplicateData = sceneController.addObject(newGeometry, newMaterial, {
                            name: `${objectData.name} copy`,
                            type: objectData.type,
                            position: finalPosition,
                            rotation: rotationEuler,
                            dimensions: { ...objectData.dimensions },  // Clone dimensions object
                            parentContainer: objectData.parentContainer,
                            layoutProperties: objectData.layoutProperties ? { ...objectData.layoutProperties } : undefined
                        });

                        if (duplicateData) {
                            // Select the new duplicate
                            this.selectionController.clearSelection();
                            this.selectionController.select(duplicateData.mesh);
                        }
                    }
                }
            }
        } else {
            // NORMAL MOVE MODE: Update position
            // CRITICAL: Sync final position to ObjectStateManager before clearing drag state
            // This ensures system state, UI panels, and events get the final position
            if (draggedObject && this.objectStateManager) {
                const sceneController = window.modlerComponents?.sceneController;
                const objectData = sceneController?.getObjectByMesh?.(draggedObject);
                const objectId = objectData?.id || draggedObject.uuid;

                const finalPosition = {
                    x: draggedObject.position.x,
                    y: draggedObject.position.y,
                    z: draggedObject.position.z
                };

                this.objectStateManager.updateObject(objectId, {
                    position: finalPosition
                });

                // Register move as undoable command
                const historyManager = window.modlerComponents?.historyManager;
                if (historyManager && this.dragStartPosition) {
                    // Only create command if position actually changed
                    const hasMoved =
                        Math.abs(finalPosition.x - this.dragStartPosition.x) > 0.001 ||
                        Math.abs(finalPosition.y - this.dragStartPosition.y) > 0.001 ||
                        Math.abs(finalPosition.z - this.dragStartPosition.z) > 0.001;

                    if (hasMoved) {
                        const command = new MoveObjectCommand(objectId, this.dragStartPosition, finalPosition);
                        // Use executeCommand() to properly handle command execution and history tracking
                        // ARCHITECTURAL FIX: Commands must go through executeCommand() for proper undo/redo
                        historyManager.executeCommand(command);
                    }
                }
            }
        }

        // Clear duplication mode and ghost
        if (this.isDuplicationMode) {
            this.exitDuplicationMode();
        }

        // Clear drag state
        this.isDragging = false;
        this.dragObject = null;
        this.dragStartPosition = null;
        this.dragFaceNormal = null;
        this.lastMousePos = null;
        this.snapAttachmentPoint = null;
        this.dragHitPoint = null;

        // Unregister operation with FileManager (allow auto-save again)
        const fileManager = window.modlerComponents?.fileManager;
        if (fileManager && typeof fileManager.unregisterOperation === 'function') {
            fileManager.unregisterOperation('move-tool-drag');
        }

        // Clear face highlights
        this.faceToolBehavior.clearHover();

        // Final updates for dragged object
        if (draggedObject) {
            // Hide interactive mesh after drag (objects only, containers keep them hidden)
            if (draggedObject.userData?.supportMeshes?.interactiveMesh && !draggedObject.userData.isContainer) {
                draggedObject.userData.supportMeshes.interactiveMesh.visible = false;
            }

            // Ensure final sync of all support meshes (wireframes, highlights, etc.)
            const geometryUtils = window.GeometryUtils;
            if (geometryUtils) {
                geometryUtils.updateSupportMeshGeometries(draggedObject);
            }

            // Update parent container after drag completion
            const sceneController = window.modlerComponents?.sceneController;
            const containerCrudManager = window.modlerComponents?.containerCrudManager;

            if (sceneController && containerCrudManager) {
                const objectData = sceneController.getObjectByMesh(draggedObject);

                // Check if the dragged object itself is a container
                const isDraggedObjectContainer = objectData && objectData.isContainer;

                // Also check if we're dragging an interactive/collision mesh that represents a container
                const isContainerInteractive = draggedObject.userData?.isContainerInteractive;
                const isContainerCollision = draggedObject.userData?.isContainerCollision;
                const representsContainer = (isContainerInteractive || isContainerCollision) &&
                                          draggedObject.userData?.containerMesh;

                if (isDraggedObjectContainer || representsContainer) {
                    // Moving a container: Update its parent container
                    const containerToUpdate = representsContainer ? draggedObject.userData.containerMesh : draggedObject;
                    const containerData = sceneController.getObjectByMesh(containerToUpdate);

                    if (containerData && containerData.parentContainer) {
                        // UNIFIED API: Container moved - parent needs to update
                        containerCrudManager.resizeContainer(containerData.parentContainer, {
                            reason: 'child-changed',
                            immediate: true
                        });
                    }
                } else if (objectData && objectData.parentContainer) {
                    // Individual object move: Resize parent container
                    // UNIFIED API: Child object moved - parent adapts
                    containerCrudManager.resizeContainer(objectData.parentContainer, {
                        reason: 'child-changed',
                        immediate: true
                    });
                }
            }
        }

        // Re-trigger face highlighting for current mouse position after tool operation ends
        this.checkForFaceHighlight();
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

    /**
     * Get dominant axis from face normal vector
     * @param {THREE.Vector3} normal - Face normal vector
     * @returns {string} - 'x', 'y', or 'z'
     */
    getDominantAxisFromNormal(normal) {
        const absX = Math.abs(normal.x);
        const absY = Math.abs(normal.y);
        const absZ = Math.abs(normal.z);

        if (absX > absY && absX > absZ) return 'x';
        if (absY > absZ) return 'y';
        return 'z';
    }

    /**
     * Get dominant axis from cumulative movement (for Tab key focus)
     */
    getDominantAxisFromMovement(movement) {
        if (movement.x > movement.y && movement.x > movement.z) return 'x';
        if (movement.y > movement.z) return 'y';
        return 'z';
    }

}