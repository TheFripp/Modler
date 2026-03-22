import * as THREE from 'three';
/**
 * Rotation Tool
 * Face-based rotation with anchor point pivot.
 * Hover a face to choose rotation axis, drag to rotate around nearest corner/edge.
 * Snap: 1° default, 15° with Shift.
 * Extends BaseTool — component getters, lifecycle inherited.
 */

class RotationTool extends BaseTool {
    constructor(selectionController, visualEffects) {
        super(selectionController, visualEffects);

        // Shared face detection behavior
        this.faceToolBehavior = new BaseFaceToolBehavior(selectionController, visualEffects, 'rotate');
        this.eventHandler = new BaseFaceToolEventHandler(this, this.faceToolBehavior, selectionController);

        // Rotation drag state
        this.isRotating = false;
        this.rotateObject = null;
        this.rotateAxis = null;         // 'x', 'y', or 'z'
        this.rotateAxisSign = 1;        // +1 or -1 for intuitive direction
        this.pivotPoint = null;         // THREE.Vector3 — world-space anchor
        this.startRotationDeg = null;   // { x, y, z } in degrees at drag start
        this.startPosition = null;      // THREE.Vector3 — object center at drag start
        this.currentAngle = 0;          // accumulated snapped angle delta in degrees
        this.lastMouseX = 0;            // NDC x at last frame
        this.dragFaceNormal = null;     // world-space normal of hovered face

        // Screen-anchor-only state (gizmo visible but no face hover)
        this.screenAnchor = null;           // { worldPos } from findNearestAnchorPoint
        this.screenAnchorNormal = null;     // face normal for screen-anchor-only rotation

        // Reusable math objects
        this._tempQuat = new THREE.Quaternion();
        this._tempVec = new THREE.Vector3();
        this._axisVec = new THREE.Vector3();
    }

    // --- Constants ---
    static SENSITIVITY = 360; // degrees per full screen width
    static SHIFT_SNAP = 15;   // degrees

    // --- Hover ---

    onHover(hit, isAltPressed) {
        // During active rotation, update from mouse movement
        if (this.isRotating) {
            this.updateRotation();
            return;
        }

        // Alt key measurement mode
        if (isAltPressed && this.handleMeasurementMode(isAltPressed, hit)) return;

        // Screen-space anchor detection on selected object (BEFORE face detection)
        // Works even when cursor is in empty space near a corner — same pipeline as move tool
        let screenAnchor = null;
        const selectedObjects = this.selectionController.getSelectedObjects();
        if (selectedObjects.length === 1 && this.toolGizmoManager && this.inputController) {
            screenAnchor = this.toolGizmoManager.findNearestAnchorPoint(
                selectedObjects[0], this.inputController.mouse, this.inputController.canvas,
                { threshold: 20 }
            );
        }

        // Face detection and highlight
        const detected = this.faceToolBehavior.handleFaceDetection(hit);

        if (detected) {
            // Face detected — clear screen-anchor-only state
            this.screenAnchor = null;
            this.screenAnchorNormal = null;
            const hoverState = this.faceToolBehavior.getHoverState();
            if (hoverState.hit) {
                const worldNormal = this.faceToolBehavior.getWorldFaceNormal(hoverState.hit);

                // Face-constrained anchor with edge midpoints (centralized pipeline)
                const faceAnchor = this.toolGizmoManager?.findNearestAnchorPoint(
                    hoverState.object, this.inputController.mouse, this.inputController.canvas,
                    { threshold: 20, includeEdgeMidpoints: true, faceNormal: worldNormal }
                );

                // Prefer face anchor > screen anchor > hit point
                const anchor = faceAnchor || screenAnchor;
                const gizmoPos = anchor ? anchor.worldPos : hoverState.hit.point;
                this.toolGizmoManager?.showRotationArc(gizmoPos, worldNormal);

                if (anchor) {
                    this.toolGizmoManager?.showAnchorPoint(anchor.worldPos);
                } else {
                    this.toolGizmoManager?.hide('circle');
                }
            }
        } else if (screenAnchor) {
            // Off-face but near a corner: show anchor circle + rotation arc aligned to most visible face
            this.toolGizmoManager?.showAnchorPoint(screenAnchor.worldPos);
            const faceNormal = this.toolGizmoManager?.getMostVisibleFaceNormal(selectedObjects[0]);
            this.toolGizmoManager?.showRotationArc(screenAnchor.worldPos, faceNormal);
            // Track for hasActiveHighlight() — gizmo is visible, tool should claim input
            this.screenAnchor = screenAnchor;
            this.screenAnchorNormal = faceNormal;
        } else {
            this.toolGizmoManager?.hide('rotation-arc');
            this.toolGizmoManager?.hide('circle');
            this.screenAnchor = null;
            this.screenAnchorNormal = null;
        }
    }

    // --- Mouse events ---

    onMouseDown(hit, event) {
        if (event.button !== 0 || this.isRotating) return false;

        // Normal face-hover path
        if (this.faceToolBehavior.hasValidFaceHover(hit)) {
            this.startRotation(hit);
            return true;
        }

        // Screen-anchor-only path (gizmo visible near corner, no face hover)
        if (this.screenAnchor && this.screenAnchorNormal) {
            this.startRotation(hit);
            return true;
        }

        return false;
    }

    onMouseUp(hit, event) {
        const callbacks = {
            isOperationActive: () => this.isRotating,
            endOperation: () => this.endRotation()
        };
        return this.eventHandler.handleMouseUp(hit, event, callbacks);
    }

    onClick(hit, event) {
        const callbacks = { isOperationActive: () => this.isRotating };
        this.eventHandler.handleClick(hit, event, callbacks);
    }

    onDoubleClick(hit, event) {
        const callbacks = { isOperationActive: () => this.isRotating };
        this.eventHandler.handleDoubleClick(hit, event, callbacks);
    }

    hasActiveHighlight() {
        if (this.screenAnchor) return true;
        return this.faceToolBehavior.hasActiveHighlight();
    }

    // --- Rotation lifecycle ---

    startRotation(hit) {
        const hoverState = this.faceToolBehavior.getHoverState();

        // Determine target object: face hover takes priority, then screen-anchor-only
        let targetObject, worldNormal, pivotPoint;

        if (hoverState.object && hoverState.hit) {
            // Normal case: face hover
            targetObject = hoverState.object;
            worldNormal = this.faceToolBehavior.getWorldFaceNormal(hoverState.hit);

            const anchorResult = this.toolGizmoManager?.findNearestAnchorPoint(
                targetObject, this.inputController?.mouse, this.inputController?.canvas,
                { threshold: 20, includeEdgeMidpoints: true, faceNormal: worldNormal }
            );
            pivotPoint = anchorResult ? anchorResult.worldPos.clone() : hoverState.hit.point.clone();
        } else if (this.screenAnchor && this.screenAnchorNormal) {
            // Screen-anchor-only case: gizmo visible near corner but no face hover
            const selectedObjects = this.selectionController.getSelectedObjects();
            if (selectedObjects.length !== 1) return;
            targetObject = selectedObjects[0];
            worldNormal = this.screenAnchorNormal;
            pivotPoint = this.screenAnchor.worldPos.clone();
        } else {
            return;
        }

        const sceneController = this.sceneController;
        const objectData = sceneController?.getObjectByMesh(targetObject);
        if (!objectData) return;

        // Determine rotation axis from face normal
        const axis = this.getDominantAxis(worldNormal);

        this.isRotating = true;
        this.rotateObject = targetObject;
        this.rotateAxis = axis;
        this.rotateAxisSign = Math.sign(worldNormal[axis]);
        this.dragFaceNormal = worldNormal.clone();

        // Store starting rotation in degrees
        this.startRotationDeg = {
            x: (targetObject.rotation.x * 180) / Math.PI,
            y: (targetObject.rotation.y * 180) / Math.PI,
            z: (targetObject.rotation.z * 180) / Math.PI
        };

        // Store starting position
        this.startPosition = targetObject.position.clone();

        this.pivotPoint = pivotPoint;

        this.currentAngle = 0;
        this.lastMouseX = this.inputController?.mouse?.x ?? 0;

        // Capture pointer so drag continues outside canvas
        this.inputController?.capturePointer();

        // Hide face highlight and corner circle during drag, keep rotation arc
        this.faceToolBehavior.clearHover();
        this.toolGizmoManager?.hide('circle');
    }

    updateRotation() {
        if (!this.isRotating || !this.rotateObject) return;

        const mouse = this.inputController?.mouse;
        if (!mouse) return;

        // Calculate angle delta from horizontal mouse movement
        const deltaX = mouse.x - this.lastMouseX;
        this.lastMouseX = mouse.x;

        // Convert screen delta to angle (NDC range is -1 to 1, so full width = 2)
        // Negate sign so dragging right rotates clockwise from the camera's perspective
        const rawDelta = (deltaX / 2) * RotationTool.SENSITIVITY * -this.rotateAxisSign;
        this.currentAngle += rawDelta;

        // Snap: check if Shift is held
        const keyboardRouter = window.modlerComponents?.keyboardRouter;
        const shiftHeld = keyboardRouter?.keys?.has('ShiftLeft') || keyboardRouter?.keys?.has('ShiftRight');

        let snappedAngle;
        if (shiftHeld) {
            // Snap absolute rotation to 15° in scene coordinates, then derive delta
            const absoluteDeg = this.startRotationDeg[this.rotateAxis] + this.currentAngle;
            const snappedAbsolute = Math.round(absoluteDeg / RotationTool.SHIFT_SNAP) * RotationTool.SHIFT_SNAP;
            snappedAngle = snappedAbsolute - this.startRotationDeg[this.rotateAxis];
        } else {
            snappedAngle = Math.round(this.currentAngle);
        }

        // Apply rotation + pivot orbit (FAST PATH — direct mesh mutation)
        const newRotRad = (this.startRotationDeg[this.rotateAxis] + snappedAngle) * Math.PI / 180;

        // Build rotation delta quaternion for pivot orbit
        const deltaAngleRad = snappedAngle * Math.PI / 180;
        this._axisVec.set(
            this.rotateAxis === 'x' ? 1 : 0,
            this.rotateAxis === 'y' ? 1 : 0,
            this.rotateAxis === 'z' ? 1 : 0
        );
        this._tempQuat.setFromAxisAngle(this._axisVec, deltaAngleRad);

        // Compute new position: pivot + rotated offset
        this._tempVec.copy(this.startPosition).sub(this.pivotPoint);
        this._tempVec.applyQuaternion(this._tempQuat);
        const newPosition = this._tempVec.add(this.pivotPoint);

        // Apply to mesh directly
        this.rotateObject.rotation[this.rotateAxis] = newRotRad;
        this.rotateObject.position.copy(newPosition);
        this.rotateObject.updateMatrixWorld(true);

        // Lightweight UI sync (same pattern as MoveTool fast path)
        if (this.objectStateManager) {
            const objectData = this.sceneController?.getObjectByMesh(this.rotateObject);
            const objectId = objectData?.id || this.rotateObject.userData?.id;
            if (objectId) {
                const object = this.objectStateManager.getObject(objectId);
                if (object) {
                    object.rotation = {
                        x: (this.rotateObject.rotation.x * 180) / Math.PI,
                        y: (this.rotateObject.rotation.y * 180) / Math.PI,
                        z: (this.rotateObject.rotation.z * 180) / Math.PI
                    };
                    object.position = {
                        x: newPosition.x,
                        y: newPosition.y,
                        z: newPosition.z
                    };
                    this.objectStateManager.refreshSelectionUI([{ object }]);
                }
            }
        }

        // Update gizmo at pivot
        this.toolGizmoManager?.updateRotationArc(this.pivotPoint, this.dragFaceNormal);

        // Request render
        window.modlerComponents?.sceneFoundation?.requestRender();
    }

    endRotation() {
        this.inputController?.releasePointer();

        if (!this.isRotating || !this.rotateObject) {
            this.isRotating = false;
            return;
        }

        const sceneController = this.sceneController;
        const objectData = sceneController?.getObjectByMesh(this.rotateObject);
        const objectId = objectData?.id || this.rotateObject.userData?.id;

        if (objectId && this.objectStateManager) {
            // Read final state from mesh
            const newRotationDeg = {
                x: (this.rotateObject.rotation.x * 180) / Math.PI,
                y: (this.rotateObject.rotation.y * 180) / Math.PI,
                z: (this.rotateObject.rotation.z * 180) / Math.PI
            };
            const newPosition = {
                x: this.rotateObject.position.x,
                y: this.rotateObject.position.y,
                z: this.rotateObject.position.z
            };

            // Full state update through ObjectStateManager
            this.objectStateManager.updateObject(objectId, {
                rotation: newRotationDeg,
                position: newPosition
            });

            // Undo command
            const command = new RotateObjectCommand(
                objectId,
                this.startRotationDeg,
                newRotationDeg,
                { x: this.startPosition.x, y: this.startPosition.y, z: this.startPosition.z },
                newPosition
            );
            this.historyManager?.executeCommand(command);

            // Resize parent container if applicable
            if (objectData?.parentContainer) {
                this.containerCrudManager?.resizeContainer(objectData.parentContainer);
            }
        }

        // Clean up
        this.isRotating = false;
        this.rotateObject = null;
        this.rotateAxis = null;
        this.pivotPoint = null;
        this.startRotationDeg = null;
        this.startPosition = null;
        this.currentAngle = 0;
        this.dragFaceNormal = null;
        this.screenAnchor = null;
        this.screenAnchorNormal = null;

        this.toolGizmoManager?.hide('rotation-arc');
        this.toolGizmoManager?.hide('circle');
    }

    // --- Helpers ---

    /**
     * Get the dominant axis from a world-space normal vector.
     * @param {THREE.Vector3} normal - World-space normal
     * @returns {'x'|'y'|'z'} The axis most aligned with the normal
     */
    getDominantAxis(normal) {
        const ax = Math.abs(normal.x);
        const ay = Math.abs(normal.y);
        const az = Math.abs(normal.z);
        if (ax >= ay && ax >= az) return 'x';
        if (ay >= ax && ay >= az) return 'y';
        return 'z';
    }

    // --- Lifecycle ---

    activate() {
        this.eventHandler.handleToolActivate();
    }

    deactivate() {
        const callbacks = BaseFaceToolEventHandler.createDeactivationCallbacks({
            isActiveCheck: () => this.isRotating,
            endCallback: () => this.endRotation(),
            afterDeactivation: () => {
                this.toolGizmoManager?.hideAll();
            }
        });
        this.eventHandler.handleToolDeactivate(callbacks);
    }
}

window.RotationTool = RotationTool;
