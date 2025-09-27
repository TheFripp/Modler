// Modler V2 - Camera Math Utilities
// Coordinate conversions and mathematical operations for camera systems
//
// STANDARD DRAGGING INTERFACE FOR TOOLS:
// 
// For cursor-following dragging with axis constraints:
// 1. Calculate mouse delta: CameraMathUtils.calculateMouseDelta(currentMouse, previousMouse)
// 2. Apply axis-constrained movement: CameraMathUtils.screenDeltaToAxisMovement(mouseDelta, objectPosition, constraintAxis, camera)
// 3. Update selection wireframes: CameraMathUtils.syncSelectionWireframes(transformedObject)
// 
// For free dragging on a plane:
// 1. Create drag plane: CameraMathUtils.createDragPlane(objectPosition, camera)  
// 2. Convert screen to world: CameraMathUtils.screenToWorldOnPlane(mouseNDC, dragPlane, camera)
// 3. Or use movement deltas: CameraMathUtils.screenDeltaToWorldMovement(mouseDelta, objectPosition, camera)
// 4. Update selection wireframes: CameraMathUtils.syncSelectionWireframes(transformedObject)
//
// REAL-TIME SELECTION SYNC:
// - Call CameraMathUtils.syncSelectionWireframes(object) after every transform during dragging
// - Supports both single objects and arrays of objects
// - Works with regular objects AND containers (with collision geometry)
// - Ensures selection wireframes follow objects smoothly in real-time
//
// CONTAINER SUPPORT:
// - Containers use dual geometry: visual wireframe + invisible collision mesh
// - MoveTool detects collision mesh faces for highlighting and dragging
// - Dragging moves the parent container, not the collision mesh
// - Real-time sync works seamlessly with container transforms
//
// All methods expect NDC coordinates (-1 to 1) for mouse positions

class CameraMathUtils {
    // Convert pixel coordinates to NDC (Normalized Device Coordinates)
    static pixelToNDC(pixelX, pixelY, canvasWidth, canvasHeight) {
        return new THREE.Vector2(
            (pixelX / canvasWidth) * 2 - 1,
            -(pixelY / canvasHeight) * 2 + 1
        );
    }
    
    // Convert NDC to pixel coordinates
    static ndcToPixel(ndcX, ndcY, canvasWidth, canvasHeight) {
        return new THREE.Vector2(
            (ndcX + 1) * canvasWidth / 2,
            (-ndcY + 1) * canvasHeight / 2
        );
    }
    
    // Convert mouse event to NDC coordinates using canvas bounds
    static mouseEventToNDC(event, canvas) {
        const rect = canvas.getBoundingClientRect();
        return this.pixelToNDC(
            event.clientX - rect.left,
            event.clientY - rect.top,
            rect.width,
            rect.height
        );
    }
    
    // Project 3D world position to screen NDC coordinates
    static worldToScreenNDC(worldPosition, camera) {
        const screenPosition = new THREE.Vector3();
        screenPosition.copy(worldPosition);
        screenPosition.project(camera);
        return new THREE.Vector2(screenPosition.x, screenPosition.y);
    }
    
    // Calculate screen distance between two world positions
    static screenDistanceBetweenWorldPositions(pos1, pos2, camera, canvas) {
        const screen1 = this.worldToScreenNDC(pos1, camera);
        const screen2 = this.worldToScreenNDC(pos2, camera);
        
        const rect = canvas.getBoundingClientRect();
        const pixel1 = this.ndcToPixel(screen1.x, screen1.y, rect.width, rect.height);
        const pixel2 = this.ndcToPixel(screen2.x, screen2.y, rect.width, rect.height);
        
        return pixel1.distanceTo(pixel2);
    }
    
    // Get camera's right and up vectors from transformation matrix
    static getCameraVectors(camera) {
        const right = new THREE.Vector3();
        right.setFromMatrixColumn(camera.matrix, 0);
        
        const up = new THREE.Vector3();
        up.setFromMatrixColumn(camera.matrix, 1);
        
        const forward = new THREE.Vector3();
        forward.setFromMatrixColumn(camera.matrix, 2);
        forward.negate(); // Forward is negative Z in camera space
        
        return { right, up, forward };
    }
    
    // Convert NDC offset to world space camera movement
    static ndcToWorldSpaceMovement(ndcOffsetX, ndcOffsetY, camera, distance) {
        const { right, up } = this.getCameraVectors(camera);
        const scale = distance * 0.5; // Standard scaling factor
        
        const offset = new THREE.Vector3();
        offset.addScaledVector(right, ndcOffsetX * scale);
        offset.addScaledVector(up, ndcOffsetY * scale);
        
        return offset;
    }
    
    // Calculate center point of multiple 3D objects
    static calculateObjectsCenter(objects) {
        if (objects.length === 0) {
            return new THREE.Vector3(0, 0, 0);
        }
        
        if (objects.length === 1) {
            return objects[0].position.clone();
        }
        
        // Multiple objects - calculate average position
        const center = new THREE.Vector3();
        let validObjects = 0;
        
        objects.forEach(object => {
            if (object.position) {
                center.add(object.position);
                validObjects++;
            }
        });
        
        if (validObjects > 0) {
            center.divideScalar(validObjects);
        }
        
        return center;
    }
    
    // Clamp angle to prevent camera flipping
    static clampPolarAngle(phi, minAngle = 0.1, maxAngle = Math.PI - 0.1) {
        return Math.max(minAngle, Math.min(maxAngle, phi));
    }
    
    // Normalize angle to 0-2π range
    static normalizeAngle(angle) {
        while (angle < 0) angle += Math.PI * 2;
        while (angle >= Math.PI * 2) angle -= Math.PI * 2;
        return angle;
    }
    
    // Calculate optimal orbit speed based on canvas size and distance
    static calculateOrbitSpeed(canvasWidth, canvasHeight, distance) {
        const baseSpeed = 1.0;
        const canvasScale = Math.min(canvasWidth, canvasHeight) / 1000;
        const distanceScale = Math.max(0.1, Math.min(2.0, distance / 10));
        return baseSpeed * canvasScale * distanceScale;
    }
    
    // Calculate pan scale based on camera distance and field of view
    static calculatePanScale(camera, targetDistance) {
        const fovRadians = (camera.fov * Math.PI) / 180;
        const scale = targetDistance * Math.tan(fovRadians / 2) * 0.001;
        return scale;
    }
    
    // Smooth interpolation between two values
    static lerp(start, end, factor) {
        return start + (end - start) * factor;
    }
    
    // Smooth interpolation between two Vector3 positions
    static lerpVector3(start, end, factor, target = null) {
        if (!target) target = new THREE.Vector3();
        target.lerpVectors(start, end, factor);
        return target;
    }
    
    // ========== SCREEN DRAGGING UTILITIES ==========
    
    /**
     * Create an invisible drag plane at object position for accurate cursor following
     * @param {THREE.Vector3} objectPosition - Position of object being dragged
     * @param {THREE.Camera} camera - Camera reference
     * @returns {THREE.Plane} Plane perpendicular to camera at object position
     */
    static createDragPlane(objectPosition, camera) {
        // Create plane perpendicular to camera view direction at object position
        const cameraDirection = new THREE.Vector3();
        camera.getWorldDirection(cameraDirection);
        
        const plane = new THREE.Plane();
        plane.setFromNormalAndCoplanarPoint(cameraDirection, objectPosition);
        
        return plane;
    }
    
    /**
     * Convert screen mouse position to world position on drag plane
     * @param {THREE.Vector2} mouseNDC - Mouse position in NDC (-1 to 1)
     * @param {THREE.Plane} dragPlane - Plane to raycast onto
     * @param {THREE.Camera} camera - Camera reference
     * @returns {THREE.Vector3|null} World position on plane, or null if no intersection
     */
    static screenToWorldOnPlane(mouseNDC, dragPlane, camera) {
        // Create ray from camera through mouse position
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(mouseNDC, camera);
        
        // Intersect ray with drag plane
        const intersection = new THREE.Vector3();
        const intersects = raycaster.ray.intersectPlane(dragPlane, intersection);
        
        return intersects ? intersection : null;
    }
    
    /**
     * Calculate world movement from screen mouse delta using drag plane
     * @param {THREE.Vector2} mouseDelta - Mouse movement in NDC units
     * @param {THREE.Vector3} objectPosition - Current object position  
     * @param {THREE.Camera} camera - Camera reference
     * @returns {THREE.Vector3} World space movement vector
     */
    static screenDeltaToWorldMovement(mouseDelta, objectPosition, camera) {
        // Create drag plane at object position
        const dragPlane = this.createDragPlane(objectPosition, camera);
        
        // Get world positions for start and end mouse positions
        const startMouse = new THREE.Vector2(0, 0); // Reference point
        const endMouse = startMouse.clone().add(mouseDelta);
        
        const startWorld = this.screenToWorldOnPlane(startMouse, dragPlane, camera);
        const endWorld = this.screenToWorldOnPlane(endMouse, dragPlane, camera);
        
        if (!startWorld || !endWorld) {
            return new THREE.Vector3(0, 0, 0);
        }
        
        // Return the movement vector
        return endWorld.clone().sub(startWorld);
    }
    
    /**
     * Project world movement onto a specific axis (for constrained dragging)
     * @param {THREE.Vector3} worldMovement - World space movement vector
     * @param {THREE.Vector3} constraintAxis - Axis to constrain movement to (should be normalized)
     * @returns {THREE.Vector3} Movement vector along constraint axis only
     */
    static projectMovementOntoAxis(worldMovement, constraintAxis) {
        // Project movement onto the constraint axis
        const projectionLength = worldMovement.dot(constraintAxis);
        return constraintAxis.clone().multiplyScalar(projectionLength);
    }
    
    /**
     * Calculate axis-constrained movement from screen delta
     * @param {THREE.Vector2} mouseDelta - Mouse movement in NDC units
     * @param {THREE.Vector3} objectPosition - Current object position
     * @param {THREE.Vector3} constraintAxis - Axis to constrain movement to
     * @param {THREE.Camera} camera - Camera reference
     * @returns {THREE.Vector3} Constrained movement vector
     */
    static screenDeltaToAxisMovement(mouseDelta, objectPosition, constraintAxis, camera) {
        // Get free world movement from screen delta
        const worldMovement = this.screenDeltaToWorldMovement(mouseDelta, objectPosition, camera);
        
        // Project onto constraint axis
        return this.projectMovementOntoAxis(worldMovement, constraintAxis);
    }
    
    /**
     * Calculate mouse delta from current and previous mouse positions
     * @param {THREE.Vector2} currentMouse - Current mouse NDC position
     * @param {THREE.Vector2} previousMouse - Previous mouse NDC position  
     * @returns {THREE.Vector2} Mouse delta in NDC units
     */
    static calculateMouseDelta(currentMouse, previousMouse) {
        return currentMouse.clone().sub(previousMouse);
    }
    
    /**
     * Update selection wireframes for transformed objects (legacy method)
     * Support meshes are now children and inherit transforms automatically
     * @param {THREE.Object3D|Array<THREE.Object3D>} objects - Object or array of objects
     */
    static syncSelectionWireframes(objects) {
        // Support meshes are now children - sync happens automatically via Three.js hierarchy
        // This method maintained for backwards compatibility but does nothing
        return;
    }
    
    /**
     * Apply axis-constrained snapping with face offset
     * Snaps the face point (not object center) to the snap point along the dominant movement axis
     * @param {THREE.Vector3} currentPosition - Object's current position
     * @param {THREE.Vector3} snapPoint - Target snap point in world space
     * @param {THREE.Vector3} travelAxis - Movement axis (face normal)
     * @param {THREE.Vector3} faceHitPoint - Point on face where drag started
     * @param {THREE.Vector3} objectStartPosition - Object position when drag started
     * @returns {THREE.Vector3} Object position so face point snaps to snap point
     */
    static applyAxisConstrainedSnapWithFaceOffset(currentPosition, snapPoint, travelAxis, faceHitPoint, objectStartPosition) {
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
     * Get the dominant axis from a face normal vector
     * @param {THREE.Vector3} normal - Face normal vector
     * @returns {string} Dominant axis ('x', 'y', or 'z')
     */
    static getDominantAxisFromNormal(normal) {
        const absAxis = {
            x: Math.abs(normal.x),
            y: Math.abs(normal.y),
            z: Math.abs(normal.z)
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

        return dominantAxis;
    }

    /**
     * Debug helper: Log dragging calculations
     * @param {string} operation - Name of operation being debugged
     * @param {Object} data - Data to log
     */
    static debugDrag(operation, data) {
        console.log(`CameraMathUtils.${operation}:`, data);
    }
}

// Export for use in camera system
window.CameraMathUtils = CameraMathUtils;