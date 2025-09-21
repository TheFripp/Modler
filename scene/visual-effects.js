// Modler V2 - Scene Layer  
// Visual Effects - Face highlighting with minimal abstraction

class VisualEffects {
    // Configuration constants - centralized for easy modification
    static Config = {
        // Material settings
        materials: {
            face: {
                color: 0x00ffff,        // Bright cyan for face highlights
                opacity: 0.6,          // Visibility balance
                renderOrder: 1000      // Render on top
            },
            axis: {
                color: 0x00ff88,        // Green for axis highlights
                opacity: 0.3            // More subtle for dual faces
            },
            object: {
                color: 0xff6600,        // Orange for object selection
                opacity: 0.9,           // High visibility
                linewidth: 2
            },
            preview: {
                defaultColor: 0x00ff00, // Green for previews
                opacity: 0.8,
                linewidth: 1
            },
            layoutGuides: {
                color: 0xff0000,        // Red for layout guides
                opacity: 0.8,
                linewidth: 2,
                dashSize: 0.2,
                gapSize: 0.1
            }
        },

        // Animation settings
        animation: {
            fadeStep: 0.03,             // Opacity change per frame
            maxOpacity: 0.1,            // Maximum fade opacity
            timeout: 1000               // Double-click timeout (ms)
        },

        // Geometry settings
        geometry: {
            normalOffset: 0.001,        // Z-fighting prevention
            boxDetectionThreshold: 0.9, // Face normal detection
            duplicateThreshold: 0.1,    // Face duplicate detection
            minPreviewSize: 0.01        // Minimum preview dimensions
        },

        // Performance settings
        cache: {
            geometryPoolSize: 10,       // Geometry object pool size
            bboxCacheTime: 5000        // Bounding box cache duration (ms)
        }
    };

    constructor(scene) {
        this.scene = scene;

        // Highlight state
        this.highlightMaterial = null;
        this.currentHighlight = null;
        this.highlightMesh = null;

        // Animation state
        this.animationId = null;
        this.fadeDirection = 1;
        this.fadeOpacity = 0;

        // Performance caches
        this.geometryCache = new Map(); // Cache for reusable geometries
        this.boundingBoxCache = new Map(); // Cache for computed bounding boxes
        this.geometryPool = []; // Pool of reusable geometry objects
        this.materialCache = new Map(); // Cache for reusable materials

        // State management
        this.highlightState = 'idle'; // 'idle', 'highlighting', 'fading', 'transitioning'
        this.stateTransitions = {
            idle: ['highlighting'],
            highlighting: ['idle', 'fading', 'transitioning'],
            fading: ['idle', 'highlighting'],
            transitioning: ['highlighting', 'idle']
        };

        this.setupHighlightMaterial();
        // VisualEffects initialized

        // Register with ConfigurationManager for automatic updates
        this.registerWithConfigurationManager();
    }
    
    setupHighlightMaterial() {
        // Get face highlight settings from configuration
        const configManager = window.modlerComponents?.configurationManager;

        // Use selection color for face highlights instead of separate face color
        const selectionColor = configManager ?
            configManager.get('visual.selection.color') : '#ff6600';
        const faceOpacity = configManager ?
            configManager.get('visual.effects.materials.face.opacity') : 0.6;
        const renderOrder = configManager ?
            configManager.get('visual.effects.materials.face.renderOrder') : 1000;

        // Convert hex color to Three.js color
        const colorHex = parseInt(selectionColor.replace('#', ''), 16);

        // Create highlight material using selection color with face opacity
        this.highlightMaterial = new THREE.MeshBasicMaterial({
            color: colorHex,
            transparent: true,
            opacity: faceOpacity,
            side: THREE.DoubleSide, // Render both sides
            depthTest: false,
            depthWrite: false
        });

        // Ensure highlights render on top
        this.highlightMaterial.renderOrder = renderOrder;

        // Highlight material created
    }

    /**
     * Create highlight material based on object type (container vs regular object)
     */
    createContextualHighlightMaterial(targetObject) {
        const configManager = window.modlerComponents?.configurationManager;

        // Determine appropriate color based on object type
        let highlightColor;
        if (this.isContainer(targetObject)) {
            // Use container color for container face highlights
            highlightColor = configManager ?
                configManager.get('visual.containers.wireframeColor') : '#00ff00';
        } else {
            // Use selection color for regular object face highlights
            highlightColor = configManager ?
                configManager.get('visual.selection.color') : '#ff6600';
        }

        const faceOpacity = configManager ?
            configManager.get('visual.effects.materials.face.opacity') : 0.6;
        const renderOrder = configManager ?
            configManager.get('visual.effects.materials.face.renderOrder') : 1000;

        // Convert hex color to Three.js color
        const colorHex = parseInt(highlightColor.replace('#', ''), 16);

        // Dispose existing material if it exists
        if (this.highlightMaterial) {
            this.highlightMaterial.dispose();
        }

        // Create highlight material using appropriate color with face opacity
        this.highlightMaterial = new THREE.MeshBasicMaterial({
            color: colorHex,
            transparent: true,
            opacity: faceOpacity,
            side: THREE.DoubleSide, // Render both sides
            depthTest: false,
            depthWrite: false
        });

        // Ensure highlights render on top
        this.highlightMaterial.renderOrder = renderOrder;
    }

    /**
     * Check if an object is a container
     */
    isContainer(object) {
        const sceneController = window.modlerComponents?.sceneController;
        if (sceneController) {
            const objectData = sceneController.getObjectByMesh(object);
            return objectData && objectData.isContainer;
        }
        return false;
    }

    /**
     * Register this VisualEffects instance with ConfigurationManager
     */
    registerWithConfigurationManager() {
        if (window.modlerComponents?.configurationManager) {
            // Store reference for configuration updates
            window.modlerComponents.visualEffects = this;
        } else {
            // Wait for ConfigurationManager to be available
            const checkConfigManager = () => {
                if (window.modlerComponents?.configurationManager) {
                    window.modlerComponents.visualEffects = this;
                        } else {
                    setTimeout(checkConfigManager, 100);
                }
            };
            checkConfigManager();
        }
    }

    /**
     * Handle configuration changes from ConfigurationManager
     * Called automatically when visual effects settings change
     */
    onConfigChanged() {
        // Clear material cache to force recreation with new settings
        this.cleanupMaterialCache();

        // Update highlight material with new configuration
        if (this.highlightMaterial) {
            const configManager = window.modlerComponents?.configurationManager;

            // Use selection color for face highlights instead of separate face color
            const selectionColor = configManager ?
                configManager.get('visual.selection.color') : '#ff6600';
            const faceOpacity = configManager ?
                configManager.get('visual.effects.materials.face.opacity') : 0.6;
            const renderOrder = configManager ?
                configManager.get('visual.effects.materials.face.renderOrder') : 1000;

            // Update material properties
            const colorHex = parseInt(selectionColor.replace('#', ''), 16);
            this.highlightMaterial.color.setHex(colorHex);
            this.highlightMaterial.opacity = faceOpacity;
            this.highlightMaterial.renderOrder = renderOrder;
            this.highlightMaterial.needsUpdate = true;
        }

        // If there's an active highlight, recreate it with new settings
        if (this.currentHighlight && this.highlightMesh) {
            const hit = {
                object: this.currentHighlight.object,
                face: { normal: this.currentHighlight.faceNormal },
                faceIndex: this.currentHighlight.faceIndex
            };

            // Store current state
            const wasHighlighting = this.highlightState === 'highlighting';

            // Clear and recreate with new settings
            this.clearHighlight();

            if (wasHighlighting) {
                // Recreate highlight with updated configuration
                this.showFaceHighlight(hit);
            }
        }

    }

    /**
     * Convert hex color to THREE.js format
     * @param {string} hexColor - Hex color string (e.g., '#ff6600')
     * @returns {number} THREE.js color number
     */
    hexToThreeColor(hexColor) {
        return parseInt(hexColor.replace('#', ''), 16);
    }

    /**
     * Deep merge objects (updates target in place)
     */
    deepMerge(target, source) {
        for (const key in source) {
            if (source.hasOwnProperty(key)) {
                if (typeof source[key] === 'object' && source[key] !== null &&
                    typeof target[key] === 'object' && target[key] !== null) {
                    this.deepMerge(target[key], source[key]);
                } else {
                    target[key] = source[key];
                }
            }
        }
    }

    /**
     * Update configuration from external source
     * @param {Object} newConfig - New configuration object
     */
    updateConfiguration(newConfig) {
        if (newConfig) {
            // Deep merge new configuration
            this.deepMerge(VisualEffects.Config, newConfig);

            // Apply changes
            this.onConfigChanged();
        }
    }

    /**
     * Validate and transition to a new state
     * @param {string} newState - Target state
     * @param {string} [context] - Context for logging/debugging
     * @returns {boolean} True if transition is valid and executed
     */
    transitionToState(newState, context = '') {
        const allowedTransitions = this.stateTransitions[this.highlightState] || [];

        if (!allowedTransitions.includes(newState)) {
            return false;
        }

        const previousState = this.highlightState;
        this.highlightState = newState;

        // Trigger cleanup for certain transitions
        if ((previousState === 'highlighting' || previousState === 'fading') && newState === 'idle') {
            this.cleanupGeometryCache();
        }

        return true;
    }

    /**
     * Check if operation is allowed in current state
     * @param {string} operation - Operation to check ('highlight', 'clear', 'animate')
     * @returns {boolean} True if operation is allowed
     */
    isOperationAllowed(operation) {
        switch (operation) {
            case 'highlight':
                return ['idle', 'highlighting', 'fading'].includes(this.highlightState);
            case 'clear':
                return ['highlighting', 'fading', 'transitioning'].includes(this.highlightState);
            case 'animate':
                return ['highlighting', 'fading'].includes(this.highlightState);
            case 'cleanup':
                return true; // Cleanup always allowed
            default:
                return false;
        }
    }

    /**
     * Validate input parameters for highlight operations
     * @param {Object} hit - Hit data to validate
     * @param {string} operation - Operation context
     * @returns {Object} Validation result with error details
     */
    validateHitData(hit, operation = 'highlight') {
        const result = { valid: true, errors: [] };

        if (!hit) {
            result.valid = false;
            result.errors.push('Hit data is null or undefined');
            return result;
        }

        if (!hit.object) {
            result.valid = false;
            result.errors.push('Hit object is missing');
        }

        if (operation === 'face-highlight' && !hit.face) {
            result.valid = false;
            result.errors.push('Hit face data is missing for face highlight');
        }

        if (hit.object && (!hit.object.geometry || !hit.object.geometry.getAttribute('position'))) {
            result.valid = false;
            result.errors.push('Object geometry is invalid or missing position attribute');
        }

        return result;
    }

    /**
     * Get cached bounding box or compute and cache it
     * @param {THREE.Geometry} geometry - The geometry to get bounding box for
     * @returns {THREE.Box3} Cached or computed bounding box
     */
    getCachedBoundingBox(geometry) {
        const cacheKey = geometry.uuid;
        const cached = this.boundingBoxCache.get(cacheKey);

        if (cached && (Date.now() - cached.timestamp) < VisualEffects.Config.cache.bboxCacheTime) {
            return cached.bbox;
        }

        // Compute and cache bounding box
        geometry.computeBoundingBox();
        const bbox = geometry.boundingBox.clone();

        this.boundingBoxCache.set(cacheKey, {
            bbox: bbox,
            timestamp: Date.now()
        });

        return bbox;
    }

    /**
     * Generate cache key for face geometry
     * @param {string} mode - Geometry mode
     * @param {string} axis - Axis for axis-faces mode
     * @param {string} side - Side for box faces
     * @param {THREE.Box3} bbox - Bounding box for size-dependent caching
     * @returns {string} Cache key
     */
    generateGeometryCacheKey(mode, axis = null, side = null, bbox = null) {
        let key = mode;
        if (axis) key += `_${axis}`;
        if (side) key += `_${side}`;
        if (bbox) {
            // Round bbox values for caching similar-sized geometries
            const size = bbox.getSize(new THREE.Vector3());
            key += `_${Math.round(size.x * 100)}_${Math.round(size.y * 100)}_${Math.round(size.z * 100)}`;
        }
        return key;
    }

    /**
     * Get geometry from cache or create new one
     * @param {string} cacheKey - Cache key
     * @param {Function} createFn - Function to create geometry if not cached
     * @returns {THREE.BufferGeometry} Cached or new geometry
     */
    getCachedGeometry(cacheKey, createFn) {
        const cached = this.geometryCache.get(cacheKey);
        if (cached) {
            return cached.clone(); // Clone to avoid shared modifications
        }

        const geometry = createFn();
        if (geometry && this.geometryCache.size < VisualEffects.Config.cache.geometryPoolSize) {
            this.geometryCache.set(cacheKey, geometry.clone());
        }

        return geometry;
    }

    /**
     * Clean up geometry cache to prevent memory leaks
     */
    cleanupGeometryCache() {
        if (this.geometryCache.size > VisualEffects.Config.cache.geometryPoolSize * 2) {
            // Remove oldest entries
            const entries = Array.from(this.geometryCache.entries());
            const toRemove = entries.slice(0, Math.floor(entries.length / 2));
            toRemove.forEach(([key, geometry]) => {
                geometry.dispose();
                this.geometryCache.delete(key);
            });
        }
    }

    /**
     * Material Factory - Creates and caches materials to prevent duplication
     * @param {string} type - Material type ('object', 'axis', 'preview', 'layoutGuides')
     * @param {Object} [overrides] - Configuration overrides
     * @returns {THREE.Material} Cached or new material
     */
    createMaterial(type, overrides = {}) {
        const cacheKey = `${type}_${JSON.stringify(overrides)}`;
        const cached = this.materialCache.get(cacheKey);
        if (cached) {
            return cached;
        }

        let material;
        const config = { ...VisualEffects.Config.materials[type], ...overrides };

        switch (type) {
            case 'object':
                material = new THREE.LineBasicMaterial({
                    color: config.color,
                    linewidth: config.linewidth,
                    transparent: true,
                    opacity: config.opacity,
                    depthTest: false
                });
                break;

            case 'axis':
                material = new THREE.MeshBasicMaterial({
                    color: config.color,
                    opacity: config.opacity,
                    transparent: true,
                    side: THREE.DoubleSide,
                    depthTest: false,
                    depthWrite: false
                });
                break;

            case 'preview':
                material = new THREE.LineBasicMaterial({
                    color: config.color || config.defaultColor,
                    linewidth: config.linewidth
                });
                break;

            case 'layoutGuides':
                material = new THREE.LineDashedMaterial({
                    color: config.color,
                    linewidth: config.linewidth,
                    scale: 1,
                    dashSize: config.dashSize,
                    gapSize: config.gapSize,
                    transparent: true,
                    opacity: config.opacity,
                    depthTest: false,
                    depthWrite: false
                });
                break;

            default:
                return null;
        }

        // Cache the material if there's room
        if (this.materialCache.size < VisualEffects.Config.cache.geometryPoolSize) {
            this.materialCache.set(cacheKey, material);
        }

        return material;
    }

    /**
     * Clean up material cache to prevent memory leaks
     */
    cleanupMaterialCache() {
        if (this.materialCache.size > VisualEffects.Config.cache.geometryPoolSize * 2) {
            // Remove oldest entries
            const entries = Array.from(this.materialCache.entries());
            const toRemove = entries.slice(0, Math.floor(entries.length / 2));
            toRemove.forEach(([key, material]) => {
                material.dispose();
                this.materialCache.delete(key);
            });
        }
    }

    /**
     * Get the target object for container architectures
     * Handles both collision and interactive mesh architectures
     * @param {THREE.Object3D} hitObject - The object that was hit by raycast
     * @returns {THREE.Object3D} The target object for positioning and synchronizer registration
     */
    getContainerTarget(hitObject) {
        if (!hitObject) return null;

        const isContainerInteractive = hitObject.userData?.isContainerInteractive;
        const isContainerCollision = hitObject.userData?.isContainerCollision;

        if (isContainerInteractive && hitObject.userData.containerMesh) {
            // NEW ARCHITECTURE: Interactive mesh with containerMesh reference
            return hitObject.userData.containerMesh;
        } else if (isContainerCollision && hitObject.parent) {
            // OLD ARCHITECTURE: Collision mesh with parent container
            return hitObject.parent;
        } else {
            // Regular objects: use the hit object directly
            return hitObject;
        }
    }

    /**
     * Apply container-aware transform to target mesh
     * Handles positioning for both container architectures
     * @param {THREE.Object3D} hitObject - The object that was hit
     * @param {THREE.Mesh} targetMesh - The mesh to position
     * @param {THREE.Vector3} [normalOffset] - Optional normal offset for z-fighting prevention
     */
    applyContainerTransform(hitObject, targetMesh, normalOffset = null) {
        const targetObject = this.getContainerTarget(hitObject);

        if (targetObject) {
            targetMesh.position.copy(targetObject.position);
            targetMesh.rotation.copy(targetObject.rotation);
            targetMesh.scale.copy(targetObject.scale);

            // Apply normal offset if provided
            if (normalOffset) {
                targetMesh.position.add(normalOffset);
            }
        }
    }

    /**
     * Validate highlight request and check for duplicates
     * @param {Object} hit - Raycast hit data
     * @returns {Object} { isValid: boolean, isDuplicate: boolean }
     */
    validateHighlightRequest(hit) {
        if (!hit || !hit.object || !hit.face) {
            return { isValid: false, isDuplicate: false };
        }

        // Check for duplicate highlights on same face
        if (this.currentHighlight && this.currentHighlight.object === hit.object) {
            // For box geometries, check if we're highlighting the same logical face
            // by comparing face normals instead of face indices
            if (hit.object.geometry.type === 'BoxGeometry' || this.isBoxLikeGeometry(hit.object.geometry)) {
                const currentNormal = this.currentHighlight.faceNormal;
                const newNormal = hit.face.normal.clone().normalize();

                // If normals are very similar (same face), it's a duplicate
                if (currentNormal && currentNormal.distanceTo(newNormal) < VisualEffects.Config.geometry.duplicateThreshold) {
                    return { isValid: true, isDuplicate: true };
                }
            } else {
                // For other geometries, use exact face index matching
                if (this.currentHighlight.faceIndex === hit.faceIndex) {
                    return { isValid: true, isDuplicate: true };
                }
            }
        }

        return { isValid: true, isDuplicate: false };
    }

    /**
     * Create and position highlight mesh for a face
     * @param {Object} hit - Raycast hit data
     * @param {THREE.BufferGeometry} faceGeometry - Face geometry to highlight
     * @returns {THREE.Mesh|null} Created highlight mesh or null if failed
     */
    createAndPositionHighlight(hit, faceGeometry) {
        // Create highlight mesh
        const highlightMesh = new THREE.Mesh(faceGeometry, this.highlightMaterial);

        // Apply container-aware positioning with z-fighting offset
        const normalOffset = hit.face.normal.clone().multiplyScalar(VisualEffects.Config.geometry.normalOffset);
        this.applyContainerTransform(hit.object, highlightMesh, normalOffset);

        // Make highlight non-interactive
        highlightMesh.raycast = () => {};

        return highlightMesh;
    }

    /**
     * Register highlight with MeshSynchronizer for automatic position sync
     * @param {Object} hit - Raycast hit data
     * @param {THREE.Mesh} highlightMesh - The highlight mesh to register
     */
    registerHighlightWithSynchronizer(hit, highlightMesh) {
        const meshSynchronizer = window.modlerComponents?.meshSynchronizer;
        if (meshSynchronizer) {
            const targetObject = this.getContainerTarget(hit.object);
            meshSynchronizer.registerRelatedMesh(targetObject, highlightMesh, 'highlight', {
                enabled: true,
                description: 'Face highlight',
                faceNormalOffset: hit.face.normal.clone().multiplyScalar(VisualEffects.Config.geometry.normalOffset),
                geometryUpdater: (mainMesh, relatedMesh) => {
                    // Update face highlight position when geometry changes
                    return this.updateFaceHighlightGeometry(mainMesh, relatedMesh, hit);
                }
            });
        }
    }

    /**
     * Update face highlight geometry when main object geometry changes
     * Used as geometryUpdater callback for MeshSynchronizer
     */
    updateFaceHighlightGeometry(mainMesh, highlightMesh, originalHit) {
        try {
            if (!mainMesh || !mainMesh.geometry || !highlightMesh || !originalHit) {
                return false;
            }

            // Recalculate face information based on current geometry
            const updatedHit = this.recalculateFaceHit(mainMesh, originalHit);
            if (!updatedHit) {
                return false;
            }

            // Create new face geometry based on updated face data
            const updatedFaceGeometry = this.createFaceGeometry(updatedHit, 'auto');
            if (!updatedFaceGeometry) {
                return false;
            }

            // Dispose old geometry
            if (highlightMesh.geometry) {
                highlightMesh.geometry.dispose();
            }

            // Apply new geometry
            highlightMesh.geometry = updatedFaceGeometry;

            // Reapply positioning with updated normal offset
            const normalOffset = updatedHit.face.normal.clone().multiplyScalar(VisualEffects.Config.geometry.normalOffset);
            this.applyContainerTransform(updatedHit.object, highlightMesh, normalOffset);

            return true;
        } catch (error) {
            return false;
        }
    }

    /**
     * Recalculate face hit information based on current geometry
     */
    recalculateFaceHit(mesh, originalHit) {
        try {
            const geometry = mesh.geometry;
            const faceIndex = originalHit.faceIndex;

            if (!geometry.index) {
                // Non-indexed geometry
                const positions = geometry.attributes.position;
                if (!positions || faceIndex * 3 + 2 >= positions.count) {
                    return null;
                }

                const a = new THREE.Vector3().fromBufferAttribute(positions, faceIndex * 3);
                const b = new THREE.Vector3().fromBufferAttribute(positions, faceIndex * 3 + 1);
                const c = new THREE.Vector3().fromBufferAttribute(positions, faceIndex * 3 + 2);

                // Calculate face normal from current vertices
                const cb = new THREE.Vector3().subVectors(c, b);
                const ab = new THREE.Vector3().subVectors(a, b);
                const normal = new THREE.Vector3().crossVectors(cb, ab).normalize();

                // Calculate face center
                const center = new THREE.Vector3().addVectors(a, b).add(c).multiplyScalar(1/3);

                return {
                    object: mesh,
                    face: {
                        a: faceIndex * 3,
                        b: faceIndex * 3 + 1,
                        c: faceIndex * 3 + 2,
                        normal: normal
                    },
                    faceIndex: faceIndex,
                    point: center
                };
            } else {
                // Indexed geometry
                const index = geometry.index;
                const positions = geometry.attributes.position;

                if (!index || !positions || faceIndex * 3 + 2 >= index.count) {
                    return null;
                }

                const a = new THREE.Vector3().fromBufferAttribute(positions, index.getX(faceIndex * 3));
                const b = new THREE.Vector3().fromBufferAttribute(positions, index.getY(faceIndex * 3 + 1));
                const c = new THREE.Vector3().fromBufferAttribute(positions, index.getZ(faceIndex * 3 + 2));

                // Calculate face normal from current vertices
                const cb = new THREE.Vector3().subVectors(c, b);
                const ab = new THREE.Vector3().subVectors(a, b);
                const normal = new THREE.Vector3().crossVectors(cb, ab).normalize();

                // Calculate face center
                const center = new THREE.Vector3().addVectors(a, b).add(c).multiplyScalar(1/3);

                return {
                    object: mesh,
                    face: {
                        a: index.getX(faceIndex * 3),
                        b: index.getY(faceIndex * 3 + 1),
                        c: index.getZ(faceIndex * 3 + 2),
                        normal: normal
                    },
                    faceIndex: faceIndex,
                    point: center
                };
            }
        } catch (error) {
            return null;
        }
    }

    // Show face highlight on a specific face
    showFaceHighlight(hit) {
        // State validation
        if (!this.isOperationAllowed('highlight')) {
            return false;
        }

        // Input validation
        const inputValidation = this.validateHitData(hit, 'face-highlight');
        if (!inputValidation.valid) {
            return false;
        }

        // Validate highlight request and check for duplicates
        const validation = this.validateHighlightRequest(hit);
        if (!validation.isValid) return false;
        if (validation.isDuplicate) return true; // Already highlighting this face

        // Clear existing highlight first
        this.clearHighlight();

        // Transition to highlighting state
        if (!this.transitionToState('highlighting', 'showFaceHighlight')) {
            return false;
        }

        // Create object-specific highlight material
        this.createContextualHighlightMaterial(hit.object);

        // Get face geometry using unified factory
        const faceGeometry = this.createFaceGeometry(hit, 'auto');
        if (!faceGeometry) {
            return false;
        }

        // Create and position highlight mesh
        this.highlightMesh = this.createAndPositionHighlight(hit, faceGeometry);
        if (!this.highlightMesh) return false;

        // Add to scene
        this.scene.add(this.highlightMesh);

        // Register with MeshSynchronizer for automatic position sync
        this.registerHighlightWithSynchronizer(hit, this.highlightMesh);

        // Store current highlight info
        this.currentHighlight = {
            object: hit.object,
            faceIndex: hit.faceIndex,
            mesh: this.highlightMesh,
            faceNormal: hit.face.normal.clone()
        };

        // Start fade in animation
        this.startFadeAnimation(true);

        return true;
    }

    /**
     * Unified Face Geometry Factory
     * Consolidates all face geometry creation into a single, focused method
     * @param {Object} hit - Raycast hit data
     * @param {string} mode - 'triangle', 'box-face', or 'axis-faces'
     * @param {string} [axis] - Required for 'axis-faces' mode ('x', 'y', or 'z')
     * @returns {THREE.BufferGeometry|null} Face geometry or null if failed
     */
    createFaceGeometry(hit, mode = 'auto', axis = null) {
        if (!hit?.object?.geometry || !hit?.face) {
            return null;
        }

        const object = hit.object;
        const geometry = object.geometry;

        try {
            // Auto-detect mode based on geometry type
            if (mode === 'auto') {
                mode = (geometry.type === 'BoxGeometry' || this.isBoxLikeGeometry(geometry))
                    ? 'box-face'
                    : 'triangle';
            }

            switch (mode) {
                case 'triangle':
                    return this.createTriangleFaceGeometry(hit);

                case 'box-face':
                    return this.createRectangularFaceGeometry(hit);

                case 'axis-faces':
                    if (!axis) {
                        console.error('createFaceGeometry: axis parameter required for axis-faces mode');
                        return null;
                    }
                    return this.createAxisFacesGeometry(object, axis);

                default:
                    console.error('createFaceGeometry: Unknown mode:', mode);
                    return null;
            }
        } catch (error) {
            console.error('createFaceGeometry error:', error);
            return null;
        }
    }

    /**
     * Create triangle face geometry from hit data
     * @param {Object} hit - Raycast hit data
     * @returns {THREE.BufferGeometry|null} Triangle geometry
     */
    createTriangleFaceGeometry(hit) {
        const positionAttribute = hit.object.geometry.getAttribute('position');
        if (!positionAttribute) {
            console.error('createTriangleFaceGeometry: No position attribute found');
            return null;
        }

        // Triangle face vertices (a, b, c)
        const va = new THREE.Vector3().fromBufferAttribute(positionAttribute, hit.face.a);
        const vb = new THREE.Vector3().fromBufferAttribute(positionAttribute, hit.face.b);
        const vc = new THREE.Vector3().fromBufferAttribute(positionAttribute, hit.face.c);

        const positions = [va.x, va.y, va.z, vb.x, vb.y, vb.z, vc.x, vc.y, vc.z];

        const faceGeometry = new THREE.BufferGeometry();
        faceGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        return faceGeometry;
    }

    /**
     * Create rectangular face geometry for box-like objects
     * @param {Object} hit - Raycast hit data
     * @returns {THREE.BufferGeometry|null} Rectangular face geometry
     */
    createRectangularFaceGeometry(hit) {
        const object = hit.object;
        const face = hit.face;

        // Get face normal to determine which box face this triangle belongs to
        const normal = face.normal.clone().normalize();

        // Get cached bounding box to determine face dimensions
        const box = this.getCachedBoundingBox(object.geometry);
        if (!box) return null;

        // Determine which complete face to highlight based on normal direction
        const absNormal = new THREE.Vector3(Math.abs(normal.x), Math.abs(normal.y), Math.abs(normal.z));

        let axis, side;
        const threshold = VisualEffects.Config.geometry.boxDetectionThreshold;
        if (absNormal.x > threshold) {
            axis = 'x';
            side = normal.x > 0 ? 'max' : 'min';
        } else if (absNormal.y > threshold) {
            axis = 'y';
            side = normal.y > 0 ? 'max' : 'min';
        } else if (absNormal.z > threshold) {
            axis = 'z';
            side = normal.z > 0 ? 'max' : 'min';
        } else {
            // Fallback to triangle if face detection fails
            return this.createTriangleFaceGeometry(hit);
        }

        // Use caching for similar-sized rectangular faces
        const cacheKey = this.generateGeometryCacheKey('box-face', axis, side, box);
        return this.getCachedGeometry(cacheKey, () => {
            // Generate rectangular face vertices using the new parameterized helper
            const vertices = this.generateRectangularFaceVertices(box, axis, side);

            const faceGeometry = new THREE.BufferGeometry();
            faceGeometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
            return faceGeometry;
        });
    }

    /**
     * Create geometry for both faces of a specific axis
     * @param {THREE.Object3D} object - The object to highlight
     * @param {string} axis - The axis ('x', 'y', or 'z')
     * @returns {THREE.BufferGeometry|null} Dual face geometry
     */
    createAxisFacesGeometry(object, axis) {
        if (!object.geometry) return null;

        // Get cached bounding box
        const box = this.getCachedBoundingBox(object.geometry);
        if (!box) return null;

        // Use caching for axis faces geometry
        const cacheKey = this.generateGeometryCacheKey('axis-faces', axis, null, box);
        return this.getCachedGeometry(cacheKey, () => {
            // Generate vertices for both faces of the specified axis
            const minVertices = this.generateRectangularFaceVertices(box, axis, 'min');
            const maxVertices = this.generateRectangularFaceVertices(box, axis, 'max');

            // Combine both faces
            const allVertices = [...minVertices, ...maxVertices];

            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(allVertices), 3));
            return geometry;
        });
    }

    /**
     * Generate rectangular face vertices for a specific axis and side
     * Parameterized helper to eliminate repetitive vertex creation patterns
     * @param {THREE.Box3} bbox - Bounding box of the object
     * @param {string} axis - The axis ('x', 'y', or 'z')
     * @param {string} side - The side ('min' or 'max')
     * @returns {number[]} Array of vertices (18 numbers = 6 vertices = 2 triangles)
     */
    generateRectangularFaceVertices(bbox, axis, side) {
        const vertices = [];
        let coord, minVal1, maxVal1, minVal2, maxVal2;

        // Determine coordinates based on axis
        switch (axis) {
            case 'x':
                coord = side === 'max' ? bbox.max.x : bbox.min.x;
                minVal1 = bbox.min.y; maxVal1 = bbox.max.y;
                minVal2 = bbox.min.z; maxVal2 = bbox.max.z;
                break;
            case 'y':
                coord = side === 'max' ? bbox.max.y : bbox.min.y;
                minVal1 = bbox.min.x; maxVal1 = bbox.max.x;
                minVal2 = bbox.min.z; maxVal2 = bbox.max.z;
                break;
            case 'z':
                coord = side === 'max' ? bbox.max.z : bbox.min.z;
                minVal1 = bbox.min.x; maxVal1 = bbox.max.x;
                minVal2 = bbox.min.y; maxVal2 = bbox.max.y;
                break;
            default:
                console.error('generateRectangularFaceVertices: Invalid axis:', axis);
                return [];
        }

        // Generate the two triangles for the rectangular face
        // Triangle 1
        const v1 = this.createVertexForAxis(axis, coord, minVal1, minVal2);
        const v2 = this.createVertexForAxis(axis, coord, maxVal1, minVal2);
        const v3 = this.createVertexForAxis(axis, coord, maxVal1, maxVal2);

        // Triangle 2
        const v4 = this.createVertexForAxis(axis, coord, minVal1, minVal2);
        const v5 = this.createVertexForAxis(axis, coord, maxVal1, maxVal2);
        const v6 = this.createVertexForAxis(axis, coord, minVal1, maxVal2);

        // Ensure correct winding order based on side
        if ((axis === 'x' && side === 'min') || (axis === 'y' && side === 'max') || (axis === 'z' && side === 'min')) {
            // Reverse winding for these cases
            vertices.push(...v1, ...v3, ...v2, ...v4, ...v6, ...v5);
        } else {
            vertices.push(...v1, ...v2, ...v3, ...v4, ...v5, ...v6);
        }

        return vertices;
    }

    /**
     * Create a vertex array for a specific axis configuration
     * @param {string} axis - The primary axis ('x', 'y', or 'z')
     * @param {number} coord - The coordinate value for the primary axis
     * @param {number} val1 - The coordinate value for the first secondary axis
     * @param {number} val2 - The coordinate value for the second secondary axis
     * @returns {number[]} Array of 3 coordinates [x, y, z]
     */
    createVertexForAxis(axis, coord, val1, val2) {
        switch (axis) {
            case 'x': return [coord, val1, val2];
            case 'y': return [val1, coord, val2];
            case 'z': return [val1, val2, coord];
            default: return [0, 0, 0];
        }
    }


    /**
     * Check if geometry is box-like (has rectangular faces even if type is not BoxGeometry)
     */
    isBoxLikeGeometry(geometry) {
        if (!geometry || !geometry.getAttribute('position')) return false;

        const positions = geometry.getAttribute('position');
        const vertexCount = positions.count;

        // Box geometries typically have 24 vertices (6 faces × 4 vertices each)
        // But modified boxes might have different counts, so check for characteristic properties
        if (vertexCount === 24 || vertexCount === 8) {
            // Check if geometry has a bounding box that suggests rectangular faces
            const bbox = this.getCachedBoundingBox(geometry);

            if (bbox) {
                // Simple heuristic: if it has distinct min/max values for all 3 axes, it's likely box-like
                const threshold = VisualEffects.Config.geometry.normalOffset;
                const hasDistinctX = Math.abs(bbox.max.x - bbox.min.x) > threshold;
                const hasDistinctY = Math.abs(bbox.max.y - bbox.min.y) > threshold;
                const hasDistinctZ = Math.abs(bbox.max.z - bbox.min.z) > threshold;

                return hasDistinctX && hasDistinctY && hasDistinctZ;
            }
        }

        return false;
    }

    
    
    // Clear current highlight with robust cleanup
    // Show object highlight (for entire object selection)
    showObjectHighlight(hit) {
        // Reduced logging for better console readability
        
        if (!hit || !hit.object) {
            return;
        }
        
        this.clearHighlight();
        
        try {
            // Create highlight geometry from the entire object geometry
            const object = hit.object;
            const geometry = object.geometry;
            
            if (!geometry) {
                return;
            }
            
            // Create clean edge highlight of the entire object
            const edgeGeometry = new THREE.EdgesGeometry(geometry);
            const edgeMaterial = this.createMaterial('object');
            
            const edgeMesh = new THREE.LineSegments(edgeGeometry, edgeMaterial);
            
            // Copy transform from original object
            edgeMesh.position.copy(object.position);
            edgeMesh.rotation.copy(object.rotation);  
            edgeMesh.scale.copy(object.scale);
            
            // Add to same parent as original object
            if (object.parent) {
                object.parent.add(edgeMesh);
            } else {
                this.scene.add(edgeMesh);
            }
            
            this.currentHighlight = { object, hit };
            this.highlightMesh = edgeMesh;
            
        } catch (error) {
            console.error('VisualEffects.showObjectHighlight error:', error);
        }
    }

    /**
     * Unified resource cleanup helper
     * Standardizes disposal order and error handling across all cleanup methods
     * @param {THREE.Object3D} mesh - The mesh to clean up
     * @param {Object} options - Cleanup options
     * @param {boolean} [options.disposeGeometry=true] - Whether to dispose geometry
     * @param {boolean} [options.disposeMaterial=true] - Whether to dispose material
     * @param {Material} [options.excludeMaterial] - Shared material to exclude from disposal
     * @param {Function} [options.beforeRemove] - Custom function to call before removal
     */
    cleanupVisualResource(mesh, options = {}) {
        if (!mesh) return;

        const {
            disposeGeometry = true,
            disposeMaterial = true,
            excludeMaterial = null,
            beforeRemove = null
        } = options;

        try {
            // Execute custom cleanup before removal
            if (beforeRemove && typeof beforeRemove === 'function') {
                beforeRemove(mesh);
            }

            // Remove from scene/parent first
            if (mesh.parent) {
                mesh.parent.remove(mesh);
            }

            // Clean up geometry
            if (disposeGeometry && mesh.geometry) {
                mesh.geometry.dispose();
            }

            // Clean up material (respecting shared materials)
            if (disposeMaterial && mesh.material && mesh.material !== excludeMaterial) {
                if (Array.isArray(mesh.material)) {
                    mesh.material.forEach(mat => {
                        if (mat !== excludeMaterial) mat.dispose();
                    });
                } else {
                    mesh.material.dispose();
                }
            }
        } catch (error) {
        }
    }

    clearHighlight() {
        // State validation for clear operation
        if (!this.isOperationAllowed('clear')) {
            // If we're in idle state and there's no highlight, that's fine
            if (this.highlightState === 'idle' && !this.highlightMesh) {
                return;
            }
            return;
        }

        if (this.highlightMesh) {
            // Clean up using unified helper with custom MeshSynchronizer unregistration
            this.cleanupVisualResource(this.highlightMesh, {
                excludeMaterial: this.highlightMaterial, // Don't dispose shared material
                beforeRemove: (mesh) => {
                    // Unregister from MeshSynchronizer first
                    const meshSynchronizer = window.modlerComponents?.meshSynchronizer;
                    if (meshSynchronizer && this.currentHighlight) {
                        const targetObject = this.getContainerTarget(this.currentHighlight.object);
                        meshSynchronizer.unregisterRelatedMesh(targetObject, mesh, 'highlight');
                    }
                }
            });

            this.highlightMesh = null;
        }

        // Clear highlight state
        this.currentHighlight = null;
        this.stopFadeAnimation();

        // Clear rectangle preview if it exists
        this.clearRectanglePreview();

        // Transition to idle state
        this.transitionToState('idle', 'clearHighlight');
    }

    /**
     * Show axis-specific face highlighting for selected object
     * Highlights faces that are perpendicular to the specified axis
     * @param {string} axis - The axis ('x', 'y', or 'z')
     */
    showAxisFaceHighlight(axis) {
        // Get currently selected object
        const selectionController = window.modlerComponents?.selectionController;
        if (!selectionController) return false;

        const selectedObjects = selectionController.getSelectedObjects();
        if (selectedObjects.length === 0) return false;

        const selectedObject = selectedObjects[0];
        if (!selectedObject || !selectedObject.geometry) return false;

        // Clear existing highlight
        this.clearHighlight();

        // Create highlight for both faces of the specified axis using unified factory
        const hit = { object: selectedObject, face: null }; // Mock hit for factory compatibility
        const faceGeometry = this.createFaceGeometry(hit, 'axis-faces', axis);
        if (!faceGeometry) return false;

        // Create highlight mesh with material from factory
        const axisMaterial = this.createMaterial('axis');

        this.highlightMesh = new THREE.Mesh(faceGeometry, axisMaterial);

        // Position the highlight mesh
        this.highlightMesh.position.copy(selectedObject.position);
        this.highlightMesh.rotation.copy(selectedObject.rotation);
        this.highlightMesh.scale.copy(selectedObject.scale);

        // Add to scene
        const scene = window.modlerComponents?.scene;
        if (scene) {
            scene.add(this.highlightMesh);
        }

        // Store highlight state for cleanup
        this.currentHighlight = {
            object: selectedObject,
            axis: axis,
            type: 'axis'
        };

        return true;
    }


    /**
     * Show rectangle preview during box creation
     */
    showRectanglePreview(startPos, currentPos) {
        if (!startPos || !currentPos) return;

        this.clearRectanglePreview();

        const width = Math.abs(currentPos.x - startPos.x);
        const depth = Math.abs(currentPos.z - startPos.z);

        const minSize = VisualEffects.Config.geometry.minPreviewSize;
        if (width < minSize || depth < minSize) return; // Too small

        // Create rectangle outline
        const geometry = new THREE.PlaneGeometry(width, depth);
        const edges = new THREE.EdgesGeometry(geometry);
        // Get configurable color from configuration manager
        const configManager = window.modlerComponents?.configurationManager;
        const configColor = configManager?.get('visual.boxCreation.color') || '#00ff00';
        const color = parseInt(configColor.replace('#', ''), 16);

        const material = new THREE.LineBasicMaterial({
            color: color,
            linewidth: VisualEffects.Config.materials.preview.linewidth
        });

        this.rectanglePreview = new THREE.LineSegments(edges, material);

        // Position slightly above ground level to prevent z-fighting with floor grid
        const centerX = (startPos.x + currentPos.x) / 2;
        const centerZ = (startPos.z + currentPos.z) / 2;
        this.rectanglePreview.position.set(centerX, VisualEffects.Config.geometry.normalOffset, centerZ);
        this.rectanglePreview.rotation.x = -Math.PI / 2; // Lay flat on ground

        this.scene.add(this.rectanglePreview);
    }

    /**
     * Clear rectangle preview
     */
    clearRectanglePreview() {
        if (this.rectanglePreview) {
            this.cleanupVisualResource(this.rectanglePreview);
            this.rectanglePreview = null;
        }
    }


    // Check if currently highlighting a specific object/face
    isHighlighting(object = null, faceIndex = null) {
        if (!this.currentHighlight) return false;
        
        if (object && this.currentHighlight.object !== object) return false;
        if (faceIndex !== null && this.currentHighlight.faceIndex !== faceIndex) return false;
        
        return true;
    }
    
    // Start fade animation
    startFadeAnimation(fadeIn = true) {
        // State validation for animation
        if (!this.isOperationAllowed('animate')) {
            return;
        }

        this.stopFadeAnimation();

        // Transition to fading state
        if (!this.transitionToState('fading', `startFadeAnimation(${fadeIn})`)) {
            return;
        }

        this.fadeDirection = fadeIn ? 1 : -1;
        this.fadeOpacity = fadeIn ? 0 : VisualEffects.Config.animation.maxOpacity;

        this.animationId = requestAnimationFrame(this.updateFadeAnimation.bind(this));
    }
    
    // Update fade animation
    updateFadeAnimation() {
        if (!this.highlightMesh) {
            this.stopFadeAnimation();
            return;
        }
        
        // Update opacity
        this.fadeOpacity += this.fadeDirection * VisualEffects.Config.animation.fadeStep;

        // Clamp opacity
        const maxOpacity = VisualEffects.Config.animation.maxOpacity;
        if (this.fadeDirection > 0) {
            this.fadeOpacity = Math.min(maxOpacity, this.fadeOpacity);
            if (this.fadeOpacity >= maxOpacity) {
                this.stopFadeAnimation();
                return;
            }
        } else {
            this.fadeOpacity = Math.max(0, this.fadeOpacity);
            if (this.fadeOpacity <= 0) {
                this.clearHighlight();
                return;
            }
        }
        
        // Apply opacity to material
        this.highlightMaterial.opacity = this.fadeOpacity;
        
        // Continue animation
        this.animationId = requestAnimationFrame(this.updateFadeAnimation.bind(this));
    }
    
    // Stop fade animation
    stopFadeAnimation() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
    }
    
    // Hide highlight with fade out
    hideHighlight() {
        if (this.highlightMesh) {
            this.startFadeAnimation(false);
        }
    }
    
    // Get current highlight info
    getCurrentHighlight() {
        return this.currentHighlight;
    }
    
    // Memory cleanup
    /**
     * Create preview box with edge wireframe - centralized for consistency
     * @param {number} width - Box width
     * @param {number} height - Box height  
     * @param {number} depth - Box depth
     * @param {THREE.Vector3} position - Box position
     * @param {number} color - Hex color (default: 0x00ff00 green)
     * @param {number} opacity - Opacity (default: 0.8)
     * @returns {THREE.LineSegments} Edge wireframe mesh
     */
    createPreviewBox(width, height, depth, position, color = 0x00ff00, opacity = 0.8) {
        // Create box geometry
        const geometry = new THREE.BoxGeometry(width, height, depth);
        
        // Create edges for clean wireframe (no triangulation)
        const edges = new THREE.EdgesGeometry(geometry);
        const material = new THREE.LineBasicMaterial({ 
            color: color,
            transparent: true,
            opacity: opacity,
            linewidth: 1
        });
        
        const edgesMesh = new THREE.LineSegments(edges, material);
        edgesMesh.position.copy(position);
        
        // Clean up intermediate geometry
        geometry.dispose();
        
        return edgesMesh;
    }
    
    /**
     * Color constants for different tools - easy to maintain and consistent
     */
    static Colors = {
        BOX_CREATION: 0x00ff00,    // Green for box creation
        SELECTION: 0xff6600,       // Orange for selection
        MOVE_TOOL: 0x00ffff,      // Cyan for move tool
        LAYOUT_TOOL: 0xff00ff,     // Magenta for layout
        ERROR: 0xff0000,           // Red for errors
        DISABLED: 0x666666         // Gray for disabled states
    };

    destroy() {
        this.clearHighlight();

        if (this.highlightMaterial) {
            this.highlightMaterial.dispose();
            this.highlightMaterial = null;
        }

        // Clean up performance caches
        this.geometryCache.forEach(geometry => geometry.dispose());
        this.geometryCache.clear();
        this.materialCache.forEach(material => material.dispose());
        this.materialCache.clear();
        this.boundingBoxCache.clear();
        this.geometryPool.length = 0;

        this.stopFadeAnimation();
    }

    /**
     * Show layout axis guides for a container
     * Creates dashed red lines between opposite face centers along the specified axis
     */
    showLayoutAxisGuides(container, axis) {
        // Clear any existing guides
        this.clearLayoutAxisGuides();

        if (!container || !container.geometry) return;

        // Calculate container bounds
        container.geometry.computeBoundingBox();
        const bbox = container.geometry.boundingBox;
        if (!bbox) return;

        // Get opposite face centers based on axis
        let startPoint, endPoint;
        switch (axis) {
            case 'x':
                startPoint = new THREE.Vector3(bbox.min.x, (bbox.min.y + bbox.max.y) / 2, (bbox.min.z + bbox.max.z) / 2);
                endPoint = new THREE.Vector3(bbox.max.x, (bbox.min.y + bbox.max.y) / 2, (bbox.min.z + bbox.max.z) / 2);
                break;
            case 'y':
                startPoint = new THREE.Vector3((bbox.min.x + bbox.max.x) / 2, bbox.min.y, (bbox.min.z + bbox.max.z) / 2);
                endPoint = new THREE.Vector3((bbox.min.x + bbox.max.x) / 2, bbox.max.y, (bbox.min.z + bbox.max.z) / 2);
                break;
            case 'z':
                startPoint = new THREE.Vector3((bbox.min.x + bbox.max.x) / 2, (bbox.min.y + bbox.max.y) / 2, bbox.min.z);
                endPoint = new THREE.Vector3((bbox.min.x + bbox.max.x) / 2, (bbox.min.y + bbox.max.y) / 2, bbox.max.z);
                break;
            default:
                return;
        }

        // Transform points to world space
        const containerWorldMatrix = container.matrixWorld;
        startPoint.applyMatrix4(containerWorldMatrix);
        endPoint.applyMatrix4(containerWorldMatrix);

        // Create dashed line geometry
        const points = [startPoint, endPoint];
        const geometry = new THREE.BufferGeometry().setFromPoints(points);

        // Create dashed material from factory
        const material = this.createMaterial('layoutGuides');

        // Create line mesh
        const line = new THREE.Line(geometry, material);
        line.computeLineDistances(); // Required for dashed lines
        line.renderOrder = 1001; // Render above other objects

        // Store reference for cleanup
        this.layoutAxisGuides = line;

        // Add to scene
        this.scene.add(line);

    }

    /**
     * Clear layout axis guides
     */
    clearLayoutAxisGuides() {
        if (this.layoutAxisGuides) {
            this.cleanupVisualResource(this.layoutAxisGuides);
            this.layoutAxisGuides = null;
        }
    }
}

// Export for use in main application
window.VisualEffects = VisualEffects;