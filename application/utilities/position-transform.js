/**
 * Position Transform Utility
 * Centralized coordinate space transformations to eliminate position bugs
 * Single source of truth for world ↔ local coordinate conversions
 */

class PositionTransform {
    
    /**
     * Preserve world position when changing object parent
     * Handles all matrix updates and coordinate space conversions correctly
     * @param {THREE.Object3D} object - Object to move
     * @param {THREE.Object3D} newParent - New parent object
     */
    static preserveWorldPosition(object, newParent) {
        if (!object || !newParent) {
            console.error('PositionTransform.preserveWorldPosition: Invalid object or parent');
            return false;
        }
        
        // Store world transform before any hierarchy changes
        const worldPosition = object.getWorldPosition(new THREE.Vector3());
        const worldRotation = object.getWorldQuaternion(new THREE.Quaternion());
        const worldScale = object.getWorldScale(new THREE.Vector3());
        
        // Removed excessive logging
        
        // Remove from current parent
        if (object.parent) {
            object.parent.remove(object);
        }
        
        // Add to new parent
        newParent.add(object);
        
        // CRITICAL FIX: Ensure both parent and object matrices are updated before coordinate conversion
        newParent.updateMatrixWorld(true);
        object.updateMatrixWorld(true);
        
        // CRITICAL FIX: Use proper coordinate space conversion
        // Convert world position to local position in new parent's coordinate space
        const newParentWorldMatrix = newParent.matrixWorld.clone();
        const inverseParentMatrix = newParentWorldMatrix.invert();
        
        // Transform world position to local coordinate space of new parent
        const localPosition = worldPosition.clone().applyMatrix4(inverseParentMatrix);
        object.position.copy(localPosition);
        
        // CRITICAL FIX: Handle rotation properly
        // Get new parent's world rotation and invert it to convert world rotation to local
        const parentWorldQuaternion = newParent.getWorldQuaternion(new THREE.Quaternion()).invert();
        const localRotation = worldRotation.clone().premultiply(parentWorldQuaternion);
        object.quaternion.copy(localRotation);
        
        // CRITICAL FIX: Handle scale properly
        const parentWorldScale = newParent.getWorldScale(new THREE.Vector3());
        const localScale = worldScale.clone();
        localScale.x /= parentWorldScale.x;
        localScale.y /= parentWorldScale.y; 
        localScale.z /= parentWorldScale.z;
        object.scale.copy(localScale);
        
        // Update matrices after setting local transform
        object.updateMatrix();
        object.updateMatrixWorld(true);
        
        // Position transform completed successfully
        
        return true;
    }
    
    /**
     * Move multiple objects to new parent while preserving their world positions
     * @param {Array} objects - Array of THREE.Object3D objects to move
     * @param {THREE.Object3D} newParent - New parent object
     * @returns {boolean} Success status
     */
    static preserveWorldPositions(objects, newParent) {
        if (!Array.isArray(objects) || !newParent) {
            console.error('PositionTransform.preserveWorldPositions: Invalid objects array or parent');
            return false;
        }
        
        let successCount = 0;
        
        objects.forEach(object => {
            if (this.preserveWorldPosition(object, newParent)) {
                successCount++;
            }
        });
        
        console.log(`🔄 POSITION TRANSFORM: Moved ${successCount}/${objects.length} objects to new parent`);
        
        return successCount === objects.length;
    }
    
    /**
     * Calculate bounds of objects in their current coordinate space
     * Ensures proper matrix world updates before calculation
     * @param {Array} objects - Array of THREE.Object3D objects
     * @returns {Object} Bounds with center, size, min, max
     */
    static calculateObjectBounds(objects) {
        if (!Array.isArray(objects) || objects.length === 0) {
            return {
                center: new THREE.Vector3(0, 0, 0),
                size: new THREE.Vector3(1, 1, 1),
                min: new THREE.Vector3(0, 0, 0),
                max: new THREE.Vector3(1, 1, 1)
            };
        }
        
        // Force matrix world updates for all objects to ensure accurate bounds
        objects.forEach(obj => {
            if (obj && obj.updateMatrixWorld) {
                obj.updateMatrixWorld(true);
            }
        });
        
        // Use LayoutGeometry for consistent bounds calculation
        return window.LayoutGeometry.calculateSelectionBounds(objects);
    }
    
    /**
     * Create container at specific position with proper coordinate handling
     * @param {THREE.Vector3} size - Container size
     * @param {THREE.Vector3} position - Container world position
     * @returns {Object} Container data object
     */
    static createContainerAtPosition(size, position) {
        if (!window.LayoutGeometry) {
            console.error('PositionTransform: LayoutGeometry not available');
            return null;
        }
        
        const containerData = window.LayoutGeometry.createContainerGeometry(size);
        
        if (containerData && containerData.mesh) {
            containerData.mesh.position.copy(position);
            containerData.mesh.updateMatrixWorld(true);
        }
        
        return containerData;
    }
    
    /**
     * Validate that object positions are preserved correctly
     * Debug utility to catch coordinate space issues
     * @param {THREE.Object3D} object - Object to validate
     * @param {THREE.Vector3} expectedWorldPosition - Expected world position
     * @returns {boolean} True if position is correct
     */
    static validateWorldPosition(object, expectedWorldPosition) {
        if (!object || !expectedWorldPosition) return false;
        
        const actualWorldPosition = object.getWorldPosition(new THREE.Vector3());
        const distance = actualWorldPosition.distanceTo(expectedWorldPosition);
        
        if (distance > 0.001) { // Tolerance for floating point precision
            console.warn('⚠️ POSITION VALIDATION FAILED:', {
                object: object.name || 'unnamed',
                expected: expectedWorldPosition.clone(),
                actual: actualWorldPosition.clone(),
                distance: distance
            });
            return false;
        }
        
        return true;
    }
}

// Export for use in main application
window.PositionTransform = PositionTransform;

console.log('🔧 PositionTransform utility loaded');