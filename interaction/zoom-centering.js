// Modler V2 - Zoom Centering System
// Smooth centering of selected objects during zoom operations

class ZoomCentering {
    constructor(camera, canvas, orbitTargetRef) {
        this.camera = camera;
        this.canvas = canvas;
        this.orbitTargetRef = orbitTargetRef; // Reference to camera controller's orbitTarget
        
        // Centering parameters
        this.targetDistance = 1.0; // Distance where centering should complete
        this.maxProgressPerEvent = 0.1; // Cap progress at 10% per zoom event for smoothness
        this.minimumOffset = 0.01; // Minimum offset threshold to avoid micro-adjustments
    }
    
    // Main centering function - called during zoom operations
    applySmoothCentering(selectionCenter, zoomDelta, currentDistance, zoomSpeed) {
        // Skip centering if already very close to target distance
        if (currentDistance <= this.targetDistance * 1.1) {
            return false; // No centering applied
        }
        
        // Calculate zoom progress: how much of the total zoom journey this delta represents
        const zoomAmount = Math.abs(zoomDelta / 100 * zoomSpeed);
        const totalZoomDistance = currentDistance - this.targetDistance;
        const zoomProgress = Math.min(zoomAmount / totalZoomDistance, this.maxProgressPerEvent);
        
        // Calculate how far off-center the selection currently is
        const targetOffset = this.calculateCenteringOffset(selectionCenter);
        
        // Apply proportional centering based on zoom progress
        if (targetOffset.length() > this.minimumOffset) {
            const centeringOffset = targetOffset.clone().multiplyScalar(zoomProgress);
            
            // Move orbit target toward selection center
            this.orbitTargetRef.current.sub(centeringOffset);
            
            return true; // Centering applied
        }
        
        return false; // No centering needed
    }
    
    // Calculate the 3D offset needed to center the selection in the viewport
    calculateCenteringOffset(selectionCenter) {
        // Project selection center to screen NDC coordinates
        const screenNDC = CameraMathUtils.worldToScreenNDC(selectionCenter, this.camera);
        
        // Screen center is 0,0 in NDC, so the offset is just the projected position
        const ndcOffsetX = screenNDC.x;
        const ndcOffsetY = screenNDC.y;
        
        // Convert NDC offset to world space using camera vectors
        const distance = this.camera.position.distanceTo(this.orbitTargetRef.current);
        const offset = CameraMathUtils.ndcToWorldSpaceMovement(
            ndcOffsetX, 
            ndcOffsetY, 
            this.camera, 
            distance
        );
        
        return offset;
    }
    
    // Check if an object is significantly off-center (useful for UI feedback)
    isSignificantlyOffCenter(objectPosition, pixelThreshold = 50) {
        const screenNDC = CameraMathUtils.worldToScreenNDC(objectPosition, this.camera);
        const rect = this.canvas.getBoundingClientRect();
        const pixelPos = CameraMathUtils.ndcToPixel(screenNDC.x, screenNDC.y, rect.width, rect.height);
        
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;
        const pixelDistance = Math.sqrt(
            Math.pow(pixelPos.x - centerX, 2) + 
            Math.pow(pixelPos.y - centerY, 2)
        );
        
        return pixelDistance > pixelThreshold;
    }
    
    // Calculate expected centering completion distance for a given object
    calculateCenteringCompletionDistance(selectionCenter, currentDistance) {
        if (currentDistance <= this.targetDistance) {
            return currentDistance; // Already at or past target
        }
        
        const offset = this.calculateCenteringOffset(selectionCenter);
        const centeringDistance = offset.length();
        
        // Estimate how much zoom distance is needed to complete centering
        const estimatedCompletionDistance = Math.max(
            this.targetDistance,
            currentDistance * 0.1 // At least 10% of current distance
        );
        
        return estimatedCompletionDistance;
    }
    
    // Preview where the orbit target will be after full centering (for debugging)
    previewFinalCenteringPosition(selectionCenter) {
        const offset = this.calculateCenteringOffset(selectionCenter);
        const finalPosition = this.orbitTargetRef.current.clone();
        finalPosition.sub(offset);
        return finalPosition;
    }
    
    // Set custom centering parameters
    setCenteringParameters(targetDistance = null, maxProgress = null, minOffset = null) {
        if (targetDistance !== null) this.targetDistance = targetDistance;
        if (maxProgress !== null) this.maxProgressPerEvent = maxProgress;
        if (minOffset !== null) this.minimumOffset = minOffset;
    }

    /**
     * Handle wheel events - integrates with camera controller
     */
    handleWheel(event) {
        // Get selection center from SelectionController
        const selectionController = window.modlerComponents?.selectionController;
        if (!selectionController || !selectionController.hasSelection()) {
            return false; // No selection to center on
        }

        // Calculate selection center
        const selectedObjects = selectionController.getSelectedObjects();
        const selectionCenter = this.calculateSelectionCenter(selectedObjects);
        if (!selectionCenter) return false;

        // Calculate current distance and zoom parameters
        const currentDistance = this.camera.position.distanceTo(this.orbitTargetRef.current);
        const zoomDelta = event.deltaY;
        const zoomSpeed = 0.5; // Match camera controller zoom speed

        // Apply smooth centering
        return this.applySmoothCentering(selectionCenter, zoomDelta, currentDistance, zoomSpeed);
    }

    /**
     * Calculate center point of selected objects
     */
    calculateSelectionCenter(selectedObjects) {
        if (!selectedObjects || selectedObjects.length === 0) return null;

        const center = new THREE.Vector3();
        selectedObjects.forEach(obj => {
            center.add(obj.position);
        });
        center.divideScalar(selectedObjects.length);
        return center;
    }

    // Get current centering status for debugging
    getCenteringStatus(selectionCenter, currentDistance) {
        const targetOffset = this.calculateCenteringOffset(selectionCenter);
        const isOffCenter = this.isSignificantlyOffCenter(selectionCenter);
        const completionDistance = this.calculateCenteringCompletionDistance(selectionCenter, currentDistance);
        
        return {
            offsetMagnitude: targetOffset.length(),
            isSignificantlyOffCenter: isOffCenter,
            centeringCompletionDistance: completionDistance,
            distanceToTarget: Math.max(0, currentDistance - this.targetDistance),
            canCenter: currentDistance > this.targetDistance * 1.1
        };
    }
}

// Export for use in camera system
window.ZoomCentering = ZoomCentering;