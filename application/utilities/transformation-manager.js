/**
 * Transformation Manager
 * Centralized transformation operations following GeometryFactory pattern
 * Single source of truth for all object transformations, eliminating scattered THREE.js calls
 */

class TransformationManager {
    constructor() {
        // Transform operation cache for performance
        this.transformCache = new Map(); // objectId -> { lastTransform, timestamp }
        this.cacheMaxAge = 2000; // Cache expires after 2 seconds

        // Performance optimization - batch transform operations
        this.pendingTransforms = new Set();
        this.batchUpdateScheduled = false;

        // Integration with existing systems
        this.positionTransform = null;
        this.transformNotificationUtils = null;

        // Unified notification system integration
        this.objectEventBus = null;

        // Performance statistics
        this.stats = {
            totalTransforms: 0,
            cachedOperations: 0,
            batchOperations: 0,
            coordinateConversions: 0
        };

        // Initialize after systems are loaded
        this.initializeIntegrations();

        // Bind methods for callbacks
        this.performBatchUpdate = this.performBatchUpdate.bind(this);
    }

    /**
     * Initialize integrations with existing transform systems
     */
    initializeIntegrations() {
        // Will be set when available
        this.positionTransform = window.PositionTransform || null;
        this.transformNotificationUtils = window.TransformNotificationUtils || null;

        // Initialize unified notification system
        this.objectEventBus = window.unifiedNotificationSystem?.eventBus || null;

        // Check again after a delay for late-loading components
        if (!this.positionTransform || !this.transformNotificationUtils || !this.objectEventBus) {
            setTimeout(() => {
                this.positionTransform = window.PositionTransform || this.positionTransform;
                this.transformNotificationUtils = window.TransformNotificationUtils || this.transformNotificationUtils;
                this.objectEventBus = window.unifiedNotificationSystem?.eventBus || this.objectEventBus;
            }, 100);
        }
    }

    /**
     * Set object position with coordinate space awareness and optimization
     * @param {THREE.Object3D} object - Object to transform
     * @param {THREE.Vector3} position - New position
     * @param {Object} options - Transform options
     * @param {boolean} options.isWorldSpace - If true, position is in world coordinates
     * @param {boolean} options.preserveWorldPosition - Preserve world position when changing hierarchy
     * @param {boolean} options.batchUpdate - Defer notifications for batch processing
     * @param {boolean} options.skipNotifications - Skip transform notifications
     * @returns {boolean} Success status
     */
    setPosition(object, position, options = {}) {
        const {
            isWorldSpace = false,
            preserveWorldPosition = false,
            batchUpdate = false,
            skipNotifications = false
        } = options;

        if (!object || !position) {
            console.error('TransformationManager.setPosition: Invalid object or position');
            return false;
        }

        // Check cache for optimization
        const cacheKey = this.generateTransformKey(object, 'position', position);
        if (this.isOperationCached(object, cacheKey)) {
            this.stats.cachedOperations++;
            return true;
        }

        try {
            if (isWorldSpace && object.parent) {
                // Convert world position to local position in parent's coordinate space
                const worldMatrix = object.parent.matrixWorld.clone().invert();
                const localPosition = position.clone().applyMatrix4(worldMatrix);
                object.position.copy(localPosition);
                this.stats.coordinateConversions++;
            } else {
                // Direct local position assignment
                object.position.copy(position);
            }

            // Update matrix immediately for downstream calculations
            object.updateMatrix();

            // Cache this operation
            this.cacheTransformOperation(object, cacheKey);

            // Handle notifications
            if (!skipNotifications) {
                if (batchUpdate) {
                    this.pendingTransforms.add(object);
                    this.scheduleBatchUpdate();
                } else {
                    this.completeTransformation(object, 'position');
                }
            }

            this.stats.totalTransforms++;
            return true;

        } catch (error) {
            console.error('TransformationManager.setPosition error:', error);
            return false;
        }
    }

    /**
     * Set object rotation with proper quaternion handling
     * @param {THREE.Object3D} object - Object to transform
     * @param {THREE.Euler|THREE.Quaternion} rotation - New rotation
     * @param {Object} options - Transform options
     */
    setRotation(object, rotation, options = {}) {
        const { batchUpdate = false, skipNotifications = false } = options;

        if (!object || !rotation) {
            console.error('TransformationManager.setRotation: Invalid object or rotation');
            return false;
        }

        try {
            if (rotation.isEuler) {
                object.rotation.copy(rotation);
            } else if (rotation.isQuaternion) {
                object.quaternion.copy(rotation);
            } else {
                console.error('TransformationManager.setRotation: Invalid rotation type');
                return false;
            }

            object.updateMatrix();

            if (!skipNotifications) {
                if (batchUpdate) {
                    this.pendingTransforms.add(object);
                    this.scheduleBatchUpdate();
                } else {
                    this.completeTransformation(object, 'rotation');
                }
            }

            this.stats.totalTransforms++;
            return true;

        } catch (error) {
            console.error('TransformationManager.setRotation error:', error);
            return false;
        }
    }

    /**
     * Set object scale with uniform and non-uniform scaling support
     * @param {THREE.Object3D} object - Object to transform
     * @param {THREE.Vector3|number} scale - New scale (Vector3 or uniform scale number)
     * @param {Object} options - Transform options
     */
    setScale(object, scale, options = {}) {
        const { batchUpdate = false, skipNotifications = false } = options;

        if (!object) {
            console.error('TransformationManager.setScale: Invalid object');
            return false;
        }

        try {
            if (typeof scale === 'number') {
                // Uniform scaling
                object.scale.setScalar(scale);
            } else if (scale.isVector3) {
                // Non-uniform scaling
                object.scale.copy(scale);
            } else {
                console.error('TransformationManager.setScale: Invalid scale type');
                return false;
            }

            object.updateMatrix();

            if (!skipNotifications) {
                if (batchUpdate) {
                    this.pendingTransforms.add(object);
                    this.scheduleBatchUpdate();
                } else {
                    this.completeTransformation(object, 'scale');
                }
            }

            this.stats.totalTransforms++;
            return true;

        } catch (error) {
            console.error('TransformationManager.setScale error:', error);
            return false;
        }
    }

    /**
     * Apply a complete transform (position, rotation, scale) atomically
     * @param {THREE.Object3D} object - Object to transform
     * @param {Object} transform - Transform components
     * @param {THREE.Vector3} transform.position - Position (optional)
     * @param {THREE.Euler|THREE.Quaternion} transform.rotation - Rotation (optional)
     * @param {THREE.Vector3|number} transform.scale - Scale (optional)
     * @param {Object} options - Transform options
     */
    applyTransform(object, transform, options = {}) {
        const { batchUpdate = false, skipNotifications = false } = options;

        if (!object || !transform) {
            console.error('TransformationManager.applyTransform: Invalid object or transform');
            return false;
        }

        try {
            let hasChanges = false;

            // Apply position
            if (transform.position) {
                this.setPosition(object, transform.position, { ...options, skipNotifications: true });
                hasChanges = true;
            }

            // Apply rotation
            if (transform.rotation) {
                this.setRotation(object, transform.rotation, { ...options, skipNotifications: true });
                hasChanges = true;
            }

            // Apply scale
            if (transform.scale) {
                this.setScale(object, transform.scale, { ...options, skipNotifications: true });
                hasChanges = true;
            }

            // Single notification for combined transform
            if (hasChanges && !skipNotifications) {
                if (batchUpdate) {
                    this.pendingTransforms.add(object);
                    this.scheduleBatchUpdate();
                } else {
                    this.completeTransformation(object, 'transform');
                }
            }

            return hasChanges;

        } catch (error) {
            console.error('TransformationManager.applyTransform error:', error);
            return false;
        }
    }

    /**
     * Move object to new parent while preserving world position
     * Integrates with PositionTransform for coordinate space handling
     * @param {THREE.Object3D} object - Object to move
     * @param {THREE.Object3D} newParent - New parent object
     * @param {Object} options - Transform options
     */
    moveToParent(object, newParent, options = {}) {
        const { skipNotifications = false } = options;

        if (!this.positionTransform) {
            console.error('TransformationManager.moveToParent: PositionTransform not available');
            return false;
        }

        try {
            const success = this.positionTransform.preserveWorldPosition(object, newParent);

            if (success && !skipNotifications) {
                this.completeTransformation(object, 'hierarchy');
            }

            return success;

        } catch (error) {
            console.error('TransformationManager.moveToParent error:', error);
            return false;
        }
    }

    /**
     * Copy transform from source to target object
     * @param {THREE.Object3D} sourceObject - Source object
     * @param {THREE.Object3D} targetObject - Target object
     * @param {Object} options - Copy options
     * @param {boolean} options.copyPosition - Copy position (default: true)
     * @param {boolean} options.copyRotation - Copy rotation (default: true)
     * @param {boolean} options.copyScale - Copy scale (default: true)
     */
    copyTransform(sourceObject, targetObject, options = {}) {
        const {
            copyPosition = true,
            copyRotation = true,
            copyScale = true,
            batchUpdate = false,
            skipNotifications = false
        } = options;

        if (!sourceObject || !targetObject) {
            console.error('TransformationManager.copyTransform: Invalid source or target object');
            return false;
        }

        const transform = {};

        if (copyPosition) {
            transform.position = sourceObject.position.clone();
        }

        if (copyRotation) {
            transform.rotation = sourceObject.rotation.clone();
        }

        if (copyScale) {
            transform.scale = sourceObject.scale.clone();
        }

        return this.applyTransform(targetObject, transform, { batchUpdate, skipNotifications });
    }

    /**
     * Generate cache key for transform operations
     * @param {THREE.Object3D} object - Object being transformed
     * @param {string} transformType - Type of transform
     * @param {*} value - Transform value
     * @returns {string} Cache key
     */
    generateTransformKey(object, transformType, value) {
        const objectId = object.uuid;
        const valueHash = this.hashTransformValue(value);
        return `${objectId}_${transformType}_${valueHash}`;
    }

    /**
     * Create hash for transform values
     * @param {*} value - Transform value to hash
     * @returns {string} Hash string
     */
    hashTransformValue(value) {
        if (value.isVector3) {
            return `${value.x.toFixed(3)}_${value.y.toFixed(3)}_${value.z.toFixed(3)}`;
        } else if (value.isEuler) {
            return `${value.x.toFixed(3)}_${value.y.toFixed(3)}_${value.z.toFixed(3)}`;
        } else if (value.isQuaternion) {
            return `${value.x.toFixed(3)}_${value.y.toFixed(3)}_${value.z.toFixed(3)}_${value.w.toFixed(3)}`;
        } else if (typeof value === 'number') {
            return value.toFixed(3);
        }
        return 'unknown';
    }

    /**
     * Check if transform operation is cached and still valid
     * @param {THREE.Object3D} object - Object to check
     * @param {string} cacheKey - Cache key
     * @returns {boolean} True if operation is cached
     */
    isOperationCached(object, cacheKey) {
        const cacheEntry = this.transformCache.get(cacheKey);
        if (!cacheEntry) return false;

        const age = Date.now() - cacheEntry.timestamp;
        if (age > this.cacheMaxAge) {
            this.transformCache.delete(cacheKey);
            return false;
        }

        return true;
    }

    /**
     * Cache transform operation
     * @param {THREE.Object3D} object - Object that was transformed
     * @param {string} cacheKey - Cache key
     */
    cacheTransformOperation(object, cacheKey) {
        this.transformCache.set(cacheKey, {
            objectId: object.uuid,
            timestamp: Date.now()
        });

        // Clean up old cache entries periodically
        if (this.transformCache.size > 1000) {
            this.cleanupTransformCache();
        }
    }

    /**
     * Clean up expired cache entries
     */
    cleanupTransformCache() {
        const now = Date.now();
        for (const [key, entry] of this.transformCache.entries()) {
            if ((now - entry.timestamp) > this.cacheMaxAge) {
                this.transformCache.delete(key);
            }
        }
    }

    /**
     * Schedule batch update for performance
     */
    scheduleBatchUpdate() {
        if (this.batchUpdateScheduled) return;

        this.batchUpdateScheduled = true;
        requestAnimationFrame(this.performBatchUpdate);
    }

    /**
     * Perform batch update of pending transforms
     */
    performBatchUpdate() {
        if (this.pendingTransforms.size === 0) {
            this.batchUpdateScheduled = false;
            return;
        }

        // Process all pending transforms
        const objectsToProcess = Array.from(this.pendingTransforms);
        this.pendingTransforms.clear();

        // Batch notify all transformations
        objectsToProcess.forEach(object => {
            try {
                this.completeTransformation(object, 'batch');
            } catch (error) {
                console.error('TransformationManager batch update error:', error);
            }
        });

        this.stats.batchOperations++;
        this.batchUpdateScheduled = false;
    }

    /**
     * Complete transformation with integrated notifications
     * @param {THREE.Object3D} object - Object that was transformed
     * @param {string} transformType - Type of transform
     */
    completeTransformation(object, transformType) {
        if (!object) return;

        try {
            // Ensure matrix is updated
            object.updateMatrix();
            object.updateMatrixWorld(true);

            // NEW: Emit through unified notification system if available
            if (this.objectEventBus && object.userData?.id) {
                // Map transform types to standardized event types
                let eventType;
                switch (transformType) {
                    case 'position':
                    case 'rotation':
                    case 'scale':
                    case 'transform':
                    case 'batch':
                        eventType = this.objectEventBus.EVENT_TYPES.TRANSFORM;
                        break;
                    case 'hierarchy':
                        eventType = this.objectEventBus.EVENT_TYPES.HIERARCHY;
                        break;
                    default:
                        eventType = this.objectEventBus.EVENT_TYPES.TRANSFORM;
                }

                // Emit through unified system with transform data
                this.objectEventBus.emit(eventType, object.userData.id, {
                    transformType: transformType,
                    position: object.position.toArray(),
                    rotation: object.rotation.toArray(),
                    scale: object.scale.toArray(),
                    timestamp: Date.now()
                }, {
                    source: 'TransformationManager',
                    throttle: true // Enable throttling for smooth real-time updates
                });
            }

            // Integrate with TransformNotificationUtils
            if (this.transformNotificationUtils) {
                this.transformNotificationUtils.completeObjectModification(
                    object,
                    'transform',
                    true,
                    {
                        updateContainers: true,
                        syncMeshes: true,
                        suppressContainerWireframes: false
                    }
                );
            }

            // Direct support mesh update if notification utils unavailable
            else {
                const geometryUtils = window.GeometryUtils;
                if (geometryUtils) {
                    geometryUtils.updateSupportMeshGeometries(object);
                }
            }

            // LEGACY: Continue with legacy notification for compatibility
            if (window.notifyObjectModified) {
                window.notifyObjectModified(object, transformType);
            }

        } catch (error) {
            console.error('TransformationManager.completeTransformation error:', error);
        }
    }

    /**
     * Get transformation statistics for debugging
     * @returns {Object} Statistics object
     */
    getStats() {
        return {
            ...this.stats,
            cacheSize: this.transformCache.size,
            pendingTransforms: this.pendingTransforms.size,
            integrations: {
                positionTransform: !!this.positionTransform,
                transformNotificationUtils: !!this.transformNotificationUtils,
                geometryUtils: !!window.GeometryUtils,
                objectEventBus: !!this.objectEventBus
            }
        };
    }

    /**
     * Clear all caches and reset state
     */
    dispose() {
        this.transformCache.clear();
        this.pendingTransforms.clear();
        this.batchUpdateScheduled = false;
    }
}

// Export for use in main application
window.TransformationManager = TransformationManager;