/**
 * Position Transform Utility
 * Centralized coordinate space transformations to eliminate position bugs
 * Single source of truth for world ↔ local coordinate conversions
 */

class PositionTransform {
    // Cache for object bounds to avoid recalculating unchanged objects
    static boundsCache = new Map(); // objectId -> { bounds, lastMatrix, timestamp }
    static cacheMaxAge = 1000; // Cache expires after 1 second
    
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
        
        
        return successCount === objects.length;
    }
    
    /**
     * Check if object transform has changed since last bounds calculation
     * @param {THREE.Object3D} object - Object to check
     * @param {Object} cacheEntry - Previous cache entry
     * @returns {boolean} True if transform changed
     */
    static hasTransformChanged(object, cacheEntry) {
        if (!object || !cacheEntry || !cacheEntry.lastMatrix) return true;

        // Compare current matrix with cached matrix
        const currentMatrix = object.matrixWorld;
        const cachedMatrix = cacheEntry.lastMatrix;

        // Quick check: compare matrix elements (positions 12,13,14 for translation)
        return (
            Math.abs(currentMatrix.elements[12] - cachedMatrix.elements[12]) > 0.001 ||
            Math.abs(currentMatrix.elements[13] - cachedMatrix.elements[13]) > 0.001 ||
            Math.abs(currentMatrix.elements[14] - cachedMatrix.elements[14]) > 0.001 ||
            Math.abs(currentMatrix.elements[0] - cachedMatrix.elements[0]) > 0.001 ||   // Scale X
            Math.abs(currentMatrix.elements[5] - cachedMatrix.elements[5]) > 0.001 ||   // Scale Y
            Math.abs(currentMatrix.elements[10] - cachedMatrix.elements[10]) > 0.001    // Scale Z
        );
    }

    /**
     * Combine multiple bounds objects into a single bounds
     * @param {Array} boundsArray - Array of bounds objects
     * @returns {Object} Combined bounds object
     */
    static combineBounds(boundsArray) {
        if (boundsArray.length === 0) {
            return {
                center: new THREE.Vector3(0, 0, 0),
                size: new THREE.Vector3(1, 1, 1),
                min: new THREE.Vector3(0, 0, 0),
                max: new THREE.Vector3(1, 1, 1)
            };
        }

        if (boundsArray.length === 1) {
            return boundsArray[0];
        }

        let minX = Infinity, minY = Infinity, minZ = Infinity;
        let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

        boundsArray.forEach(bounds => {
            minX = Math.min(minX, bounds.min.x);
            minY = Math.min(minY, bounds.min.y);
            minZ = Math.min(minZ, bounds.min.z);
            maxX = Math.max(maxX, bounds.max.x);
            maxY = Math.max(maxY, bounds.max.y);
            maxZ = Math.max(maxZ, bounds.max.z);
        });

        const min = new THREE.Vector3(minX, minY, minZ);
        const max = new THREE.Vector3(maxX, maxY, maxZ);
        const center = new THREE.Vector3(
            (minX + maxX) / 2,
            (minY + maxY) / 2,
            (minZ + maxZ) / 2
        );
        const size = new THREE.Vector3(
            maxX - minX,
            maxY - minY,
            maxZ - minZ
        );

        return { center, size, min, max };
    }

    /**
     * Calculate bounds of objects in their current coordinate space
     * Enhanced with smart caching to avoid recalculating unchanged objects
     * @param {Array} objects - Array of THREE.Object3D objects
     * @param {boolean} bypassCache - If true, skip caching for immediate real-time updates
     * @returns {Object} Bounds with center, size, min, max
     */
    static calculateObjectBounds(objects, bypassCache = false) {
        if (!Array.isArray(objects) || objects.length === 0) {
            return {
                center: new THREE.Vector3(0, 0, 0),
                size: new THREE.Vector3(1, 1, 1),
                min: new THREE.Vector3(0, 0, 0),
                max: new THREE.Vector3(1, 1, 1)
            };
        }

        // If bypassing cache (for real-time updates), calculate directly
        if (bypassCache) {
            // Force matrix world updates for all objects to ensure accurate bounds
            objects.forEach(obj => {
                if (obj && obj.updateMatrixWorld) {
                    obj.updateMatrixWorld(true);
                }
            });
            return window.LayoutGeometry.calculateSelectionBounds(objects);
        }

        const now = Date.now();
        const objectsToCalculate = [];
        const cachedBounds = [];

        // Check each object for cached bounds
        objects.forEach(obj => {
            if (!obj || !obj.uuid) {
                objectsToCalculate.push(obj);
                return;
            }

            // Update matrix for comparison
            if (obj.updateMatrixWorld) {
                obj.updateMatrixWorld(true);
            }

            const cacheEntry = this.boundsCache.get(obj.uuid);

            // Use cached bounds if valid and unchanged
            if (cacheEntry &&
                (now - cacheEntry.timestamp) < this.cacheMaxAge &&
                !this.hasTransformChanged(obj, cacheEntry)) {
                cachedBounds.push(cacheEntry.bounds);
            } else {
                objectsToCalculate.push(obj);
            }
        });

        // Calculate bounds for objects that need it
        let newBounds = null;
        if (objectsToCalculate.length > 0) {
            newBounds = window.LayoutGeometry.calculateSelectionBounds(objectsToCalculate);

            // Cache bounds for objects that were calculated
            objectsToCalculate.forEach(obj => {
                if (obj && obj.uuid && obj.matrixWorld) {
                    this.boundsCache.set(obj.uuid, {
                        bounds: {
                            center: newBounds.center.clone(),
                            size: newBounds.size.clone(),
                            min: newBounds.min.clone(),
                            max: newBounds.max.clone()
                        },
                        lastMatrix: obj.matrixWorld.clone(),
                        timestamp: now
                    });
                }
            });
        }

        // Combine cached and new bounds
        if (cachedBounds.length === 0 && newBounds) {
            return newBounds;
        } else if (cachedBounds.length > 0 && !newBounds) {
            return this.combineBounds(cachedBounds);
        } else if (cachedBounds.length > 0 && newBounds) {
            return this.combineBounds([...cachedBounds, newBounds]);
        } else {
            // Fallback to original calculation
            return window.LayoutGeometry.calculateSelectionBounds(objects);
        }
    }

    /**
     * Clean up expired cache entries to prevent memory leaks
     */
    static cleanupBoundsCache() {
        const now = Date.now();
        for (const [uuid, cacheEntry] of this.boundsCache.entries()) {
            if ((now - cacheEntry.timestamp) > this.cacheMaxAge) {
                this.boundsCache.delete(uuid);
            }
        }
    }

    /**
     * Clear cache for specific object (useful when object is deleted)
     * @param {string} uuid - Object UUID to remove from cache
     */
    static clearCacheForObject(uuid) {
        if (uuid) {
            this.boundsCache.delete(uuid);
        }
    }

    /**
     * Create container at specific position with proper coordinate handling
     * @param {THREE.Vector3} size - Container size
     * @param {THREE.Vector3} position - Container world position
     * @returns {Object} Container data object
     */
    static createContainerAtPosition(size, position) {
        const containerCrudManager = window.modlerComponents?.containerCrudManager;
        if (!containerCrudManager) {
            console.error('PositionTransform: ContainerCrudManager not available');
            return null;
        }

        // Use centralized container creation with positioning
        return containerCrudManager.createContainerGeometryAtPosition(size, position);
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

    /**
     * NESTED CONTAINER SUPPORT: Extended coordinate transformation chain
     * Handles multiple levels of container nesting
     */

    /**
     * Get the full transformation chain from world space to an object's local space
     * @param {string} objectId - Target object ID
     * @returns {Array<Object>} Array of transform steps: [{container, transform}, ...]
     */
    static getTransformationChain(objectId) {
        const sceneController = window.modlerComponents?.sceneController;
        if (!sceneController) {
            console.error('PositionTransform: SceneController not available');
            return [];
        }

        const chain = [];
        let currentObject = sceneController.getObject(objectId);

        // Walk up the parent chain, collecting transformations
        while (currentObject && currentObject.parentContainer) {
            const parentContainer = sceneController.getObject(currentObject.parentContainer);
            if (!parentContainer || !parentContainer.mesh) break;

            chain.unshift({
                container: parentContainer,
                mesh: parentContainer.mesh,
                transform: parentContainer.mesh.matrix.clone()
            });

            currentObject = parentContainer;
        }

        return chain;
    }

    /**
     * Transform a world position through nested container hierarchy
     * @param {THREE.Vector3} worldPosition - Position in world space
     * @param {string} targetContainerId - Target container to transform into
     * @returns {THREE.Vector3} Position in target container's local space
     */
    static worldToNestedLocal(worldPosition, targetContainerId) {
        const sceneController = window.modlerComponents?.sceneController;
        if (!sceneController) {
            console.error('PositionTransform: SceneController not available');
            return worldPosition.clone();
        }

        const targetContainer = sceneController.getObject(targetContainerId);
        if (!targetContainer || !targetContainer.mesh) {
            return worldPosition.clone();
        }

        // Get the full transformation chain to the target container
        const chain = this.getTransformationChain(targetContainerId);

        // Apply inverse transformations in reverse order
        let transformedPosition = worldPosition.clone();

        // Include the target container's own transform
        chain.push({
            container: targetContainer,
            mesh: targetContainer.mesh,
            transform: targetContainer.mesh.matrix.clone()
        });

        // Apply inverse of each transformation in the chain
        for (let i = chain.length - 1; i >= 0; i--) {
            const step = chain[i];
            const inverseMatrix = step.transform.clone().invert();
            transformedPosition.applyMatrix4(inverseMatrix);
        }

        return transformedPosition;
    }

    /**
     * Transform a position from nested local space to world space
     * @param {THREE.Vector3} localPosition - Position in container's local space
     * @param {string} containerId - Container the position is relative to
     * @returns {THREE.Vector3} Position in world space
     */
    static nestedLocalToWorld(localPosition, containerId) {
        const sceneController = window.modlerComponents?.sceneController;
        if (!sceneController) {
            console.error('PositionTransform: SceneController not available');
            return localPosition.clone();
        }

        const container = sceneController.getObject(containerId);
        if (!container || !container.mesh) {
            return localPosition.clone();
        }

        // Get the full transformation chain from world to container
        const chain = this.getTransformationChain(containerId);

        // Start with the local position
        let transformedPosition = localPosition.clone();

        // Include the container's own transform
        chain.push({
            container: container,
            mesh: container.mesh,
            transform: container.mesh.matrix.clone()
        });

        // Apply each transformation in forward order
        chain.forEach(step => {
            transformedPosition.applyMatrix4(step.transform);
        });

        return transformedPosition;
    }

    /**
     * Handle nested container positioning when a container is moved to another container
     * @param {THREE.Object3D} containerMesh - Container mesh to move
     * @param {THREE.Object3D} targetParentMesh - Target parent container mesh
     * @returns {boolean} Success status
     */
    static preserveNestedContainerPosition(containerMesh, targetParentMesh) {
        if (!containerMesh || !targetParentMesh) {
            console.error('PositionTransform: Invalid container or parent for nested positioning');
            return false;
        }

        // Store world position before hierarchy changes
        const worldPosition = containerMesh.getWorldPosition(new THREE.Vector3());

        // Add to new parent (Three.js will handle the transform automatically)
        targetParentMesh.add(containerMesh);

        // Calculate the local position needed to maintain world position
        const parentWorldPosition = targetParentMesh.getWorldPosition(new THREE.Vector3());
        const localPosition = worldPosition.sub(parentWorldPosition);

        // Set the local position to maintain world position
        containerMesh.position.copy(localPosition);

        // Ensure normal Three.js transform management
        containerMesh.matrixAutoUpdate = true;
        containerMesh.updateMatrixWorld();

        return true;
    }

    /**
     * Calculate nested bounds considering the full container hierarchy
     * @param {Array<Object>} objects - Objects to calculate bounds for
     * @param {string} targetContainerId - Container space to calculate bounds in
     * @returns {Object} {min, max, center, size} in target container's space
     */
    static calculateNestedBounds(objects, targetContainerId) {
        if (!objects || objects.length === 0) {
            return {
                min: new THREE.Vector3(),
                max: new THREE.Vector3(),
                center: new THREE.Vector3(),
                size: new THREE.Vector3()
            };
        }

        const sceneController = window.modlerComponents?.sceneController;
        if (!sceneController) {
            console.error('PositionTransform: SceneController not available for bounds calculation');
            return null;
        }

        let min = new THREE.Vector3(Infinity, Infinity, Infinity);
        let max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);

        objects.forEach(obj => {
            if (!obj.mesh) return;

            // Get object's world bounding box
            const worldBox = new THREE.Box3().setFromObject(obj.mesh);

            // Transform bounding box corners to target container space
            const corners = [
                new THREE.Vector3(worldBox.min.x, worldBox.min.y, worldBox.min.z),
                new THREE.Vector3(worldBox.max.x, worldBox.min.y, worldBox.min.z),
                new THREE.Vector3(worldBox.min.x, worldBox.max.y, worldBox.min.z),
                new THREE.Vector3(worldBox.max.x, worldBox.max.y, worldBox.min.z),
                new THREE.Vector3(worldBox.min.x, worldBox.min.y, worldBox.max.z),
                new THREE.Vector3(worldBox.max.x, worldBox.min.y, worldBox.max.z),
                new THREE.Vector3(worldBox.min.x, worldBox.max.y, worldBox.max.z),
                new THREE.Vector3(worldBox.max.x, worldBox.max.y, worldBox.max.z)
            ];

            corners.forEach(corner => {
                const localCorner = this.worldToNestedLocal(corner, targetContainerId);
                min.min(localCorner);
                max.max(localCorner);
            });
        });

        const center = new THREE.Vector3(
            (min.x + max.x) / 2,
            (min.y + max.y) / 2,
            (min.z + max.z) / 2
        );

        const size = new THREE.Vector3(
            max.x - min.x,
            max.y - min.y,
            max.z - min.z
        );

        return { min, max, center, size };
    }
}

// Export for use in main application
window.PositionTransform = PositionTransform;

