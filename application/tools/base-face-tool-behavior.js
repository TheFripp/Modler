/**
 * Base Face Tool Behavior - Shared Face Detection and Hover Logic
 *
 * Provides common face-based interaction patterns shared between MoveTool and PushTool.
 * Centralizes face detection, hover state management, and container interactive mesh handling
 * to eliminate code duplication and ensure consistent behavior.
 *
 * **Shared Functionality:**
 * - Face detection and highlighting on selected objects only
 * - Container interactive mesh handling with parent resolution
 * - Hover state management with visual feedback
 * - Common face-based event patterns
 *
 * @class BaseFaceToolBehavior
 */
class BaseFaceToolBehavior {
    /**
     * Initialize shared face tool behavior
     *
     * @param {Object} selectionController - Handles object selection state
     * @param {Object} visualEffects - Manages face highlighting and visual feedback
     * @param {string} toolType - Type of tool using this behavior ('move', 'push', etc.)
     */
    constructor(selectionController, visualEffects, toolType = 'unknown') {
        this.selectionController = selectionController;
        this.visualEffects = visualEffects;
        this.toolType = toolType;

        // Shared hover state
        this.hoveredObject = null;
        this.hoveredHit = null;
        this.hoveredFaceIndex = null; // Track which face is hovered to prevent repositioning flicker
    }

    /**
     * Handle face detection and highlighting for selected objects
     *
     * Centralizes the common face detection logic used by both move and push tools.
     * Only highlights faces on currently selected objects or their collision meshes.
     *
     * @param {Object} hit - Raycast hit result with object and face information
     * @returns {boolean} True if face was highlighted, false otherwise
     */
    handleFaceDetection(hit) {
        if (!hit || !hit.object || !hit.face) {
            this.clearHover();
            return false;
        }

        // Handle container detection for both old and new architectures
        const isContainerInteractive = hit.object.userData.isContainerInteractive;
        const isContainerCollision = hit.object.userData.isContainerCollision;

        let targetObject;
        if (isContainerInteractive && hit.object.userData.containerMesh) {
            // NEW ARCHITECTURE: Interactive mesh has direct containerMesh reference
            targetObject = hit.object.userData.containerMesh;
        } else if (isContainerCollision && hit.object.parent) {
            // OLD ARCHITECTURE: Collision mesh is child of container
            targetObject = hit.object.parent;
        } else if (isContainerInteractive) {
            // FALLBACK: Scene-level interactive mesh with parent container ID
            const sceneController = window.modlerComponents?.sceneController;
            const containerId = hit.object.userData.parentContainer;

            if (sceneController && containerId) {
                const containerData = sceneController.getObject(containerId);
                targetObject = containerData?.mesh || hit.object;
            } else {
                targetObject = hit.object.parent || hit.object;
            }
        } else {
            // Regular objects
            targetObject = hit.object;
        }

        // CRITICAL FIX: If hit object is not selected, ignore it during face tool operations
        // This prevents non-selected containers from blocking face highlighting on selected containers
        if (!this.selectionController.isSelected(targetObject)) {
            const sceneController = window.modlerComponents?.sceneController;
            const objectData = sceneController?.getObjectByMesh(targetObject);

            // Check if it's a child of a selected container (allow this case)
            if (objectData && objectData.parentContainer) {
                const parentContainer = sceneController.getObject(objectData.parentContainer);
                if (!parentContainer || !this.selectionController.isSelected(parentContainer.mesh)) {
                    // Not a child of selected container - ignore this hit
                    this.clearHover();
                    return false;
                }
                // It IS a child of selected container - continue processing below
            } else {
                // Not selected and not a child of selected - ignore
                this.clearHover();
                return false;
            }
        }

        // Face detection completed

        // CONTAINER MESH REDIRECTION: For containers, always use interactive mesh for face detection
        // Container main mesh is EdgesGeometry (wireframe), not suitable for face highlighting
        // Interactive mesh is BoxGeometry with proper face data
        let hitForFaceDetection = hit;
        if (targetObject.userData?.isContainer && targetObject.userData?.supportMeshes?.interactiveMesh) {
            const interactiveMesh = targetObject.userData.supportMeshes.interactiveMesh;

            // If we hit the container's main mesh (not interactive), redirect to interactive mesh
            if (hit.object !== interactiveMesh) {
                hitForFaceDetection = this.createSyntheticHitForContainer(hit, targetObject, interactiveMesh);
            }
        }

        // CHILD OBJECT TRANSPARENCY: If we hit a child object inside a selected container,
        // redirect the hit to the container's interactive mesh for face highlighting
        // EXCEPTION: When stepped into container context, child objects should be directly selectable
        if (!this.selectionController.isSelected(targetObject)) {
            const sceneController = window.modlerComponents?.sceneController;
            const navigationController = window.modlerComponents?.navigationController;
            const isInContainerContext = navigationController?.isInContainerContext() || false;
            const objectData = sceneController?.getObjectByMesh(hit.object);

            if (objectData && objectData.parentContainer && !isInContainerContext) {
                const parentContainer = sceneController.getObject(objectData.parentContainer);
                if (parentContainer && this.selectionController.isSelected(parentContainer.mesh)) {
                    // Child object hit inside selected container
                    // Redirect to container's interactive mesh for face highlighting
                    targetObject = parentContainer.mesh;
                    const supportMeshes = targetObject.userData?.supportMeshes;

                    if (supportMeshes?.interactiveMesh) {
                        // Create synthetic hit using container's interactive mesh
                        hitForFaceDetection = this.createSyntheticHitForContainer(hit, parentContainer.mesh, supportMeshes.interactiveMesh);
                    }
                }
            }
        }

        // Only highlight faces of selected objects (including interactive meshes of selected containers)
        // Note: targetObject may have been changed above to the container when hitting child objects
        if (this.selectionController.isSelected(targetObject)) {
            // CAMERA-FACING CHECK: Only highlight faces oriented toward the camera
            if (!this.isFaceTowardCamera(hitForFaceDetection)) {
                this.clearHover();
                return false;
            }

            // CONTAINER MODE CHECK: Only show face highlights for containers in layout mode, not hug mode
            // This check only applies to push tool - move tool should work in hug mode
            const isDisabledAction = this.toolType === 'push' && this.isContainerInHugMode(targetObject);

            // Store the actual target object for interaction
            this.hoveredObject = targetObject;
            this.hoveredHit = hitForFaceDetection;

            // Face highlighting activated - use support mesh if available
            const supportMeshes = targetObject.userData.supportMeshes;
            if (supportMeshes?.faceHighlight) {
                // ARCHITECTURE COMPLIANCE: Position once per hover session, then show
                // Only reposition if we're hovering a different face to prevent flicker

                // For containers with synthetic hits, use face normal for change detection
                // For regular objects, use face indices
                let currentFaceKey;
                if (targetObject.userData?.isContainer) {
                    const normal = hitForFaceDetection.face.normal;
                    currentFaceKey = `${normal.x.toFixed(2)}-${normal.y.toFixed(2)}-${normal.z.toFixed(2)}`;
                } else {
                    currentFaceKey = hitForFaceDetection.face.a + '-' + hitForFaceDetection.face.b + '-' + hitForFaceDetection.face.c;
                }

                const faceChanged = this.hoveredFaceIndex !== currentFaceKey || this.hoveredObject !== targetObject;

                if (faceChanged) {
                    this.hoveredFaceIndex = currentFaceKey;
                    const supportMeshFactory = window.modlerComponents?.supportMeshFactory;
                    if (supportMeshFactory) {
                        // For containers, we need to create a modified hit that references the container mesh
                        // instead of the interactive mesh, so face normal calculation works correctly
                        let hitForPositioning = hitForFaceDetection;
                        if ((isContainerInteractive || isContainerCollision) && hitForFaceDetection.object !== targetObject) {
                            hitForPositioning = {
                                ...hitForFaceDetection,
                                object: targetObject // Use container mesh instead of interactive mesh
                            };
                        }
                        supportMeshFactory.positionFaceHighlightForHit(supportMeshes.faceHighlight, hitForPositioning);
                    }
                }

                // Show grey "disabled" face highlight if tool is not allowed on this object
                // Swap material temporarily to show disabled state
                if (isDisabledAction) {
                    const supportMeshFactory = window.modlerComponents?.supportMeshFactory;
                    if (supportMeshFactory && supportMeshFactory.materials.faceHighlightDisabled) {
                        // Only swap if not already using disabled material (prevent nested swaps)
                        if (supportMeshes.faceHighlight.material !== supportMeshFactory.materials.faceHighlightDisabled) {
                            // Store original material for restoration
                            supportMeshes.faceHighlight.userData.originalMaterial = supportMeshes.faceHighlight.material;
                            // Swap to grey disabled material
                            supportMeshes.faceHighlight.material = supportMeshFactory.materials.faceHighlightDisabled;
                        }
                    }
                } else {
                    // Restore original material if previously swapped
                    if (supportMeshes.faceHighlight.userData.originalMaterial) {
                        // Validate that original material still exists before restoring
                        if (supportMeshes.faceHighlight.userData.originalMaterial) {
                            supportMeshes.faceHighlight.material = supportMeshes.faceHighlight.userData.originalMaterial;
                        }
                        delete supportMeshes.faceHighlight.userData.originalMaterial;
                    }
                }

                supportMeshes.faceHighlight.visible = true;
            } else {
                // Fallback to Visual Effects for objects without support meshes
                const materialManager = window.modlerComponents?.materialManager;
                const disabledColor = materialManager?.colors?.DISABLED_STATE || 0x888888;
                this.visualEffects.showFaceHighlight(hitForFaceDetection, isDisabledAction ? disabledColor : null);
            }
            return !isDisabledAction; // Return false if disabled so hasValidFaceHover works correctly
        } else {
            // Object not selected - clearing hover
            this.clearHover();
            return false;
        }
    }

    /**
     * Check if currently hovering over a highlighted face on a selected object
     *
     * @param {Object} hit - Current raycast hit
     * @returns {boolean} True if hovering over a valid highlighted face
     */
    hasValidFaceHover(hit) {
        if (!hit || !hit.object || !hit.face) return false;

        // Use same detection logic as handleFaceDetection
        const isContainerInteractive = hit.object.userData.isContainerInteractive;
        const isContainerCollision = hit.object.userData.isContainerCollision;

        let targetObject;
        if (isContainerInteractive && hit.object.userData.containerMesh) {
            // NEW ARCHITECTURE: Interactive mesh has direct containerMesh reference
            targetObject = hit.object.userData.containerMesh;
        } else if (isContainerCollision && hit.object.parent) {
            // OLD ARCHITECTURE: Collision mesh is child of container
            targetObject = hit.object.parent;
        } else if (isContainerInteractive) {
            // FALLBACK: Scene-level interactive mesh with parent container ID
            const sceneController = window.modlerComponents?.sceneController;
            const containerId = hit.object.userData.parentContainer;

            if (sceneController && containerId) {
                const containerData = sceneController.getObject(containerId);
                targetObject = containerData?.mesh || hit.object;
            } else {
                targetObject = hit.object.parent || hit.object;
            }
        } else {
            // Regular objects
            targetObject = hit.object;
        }

        // Check if target object is selected
        // InputController raycast already filters out children when parent container is selected
        const isSelectedObject = targetObject && this.selectionController.isSelected(targetObject);
        const hasHighlightedFace = this.hoveredObject === targetObject;
        const isNotHugMode = !this.isContainerInHugMode(targetObject);

        return isSelectedObject && hasHighlightedFace && isNotHugMode;
    }

    /**
     * Get the target object from a hit, resolving container collision meshes
     * Container context aware: returns child objects when stepped into containers
     *
     * @param {Object} hit - Raycast hit result
     * @returns {Object|null} Target object (parent for collision meshes, object for direct hits)
     */
    getTargetObject(hit) {
        if (!hit || !hit.object) return null;

        // Check if we're in container context (stepped into a container)
        const navigationController = window.modlerComponents?.navigationController;
        const isInContainerContext = navigationController?.isInContainerContext() || false;

        // Use same detection logic as handleFaceDetection
        const isContainerInteractive = hit.object.userData.isContainerInteractive;
        const isContainerCollision = hit.object.userData.isContainerCollision;

        // CONTAINER INTEGRITY: Always resolve interactive/collision meshes to their parent containers
        // This ensures containers move as single units and maintains mesh hierarchy

        if (isContainerInteractive && hit.object.userData.containerMesh) {
            // NEW ARCHITECTURE: Interactive mesh with direct containerMesh reference
            const containerMesh = hit.object.userData.containerMesh;

            // Always return the container mesh to maintain container integrity
            // Interactive meshes should move with their parent containers
            return containerMesh;

        } else if (isContainerCollision && hit.object.parent) {
            // OLD ARCHITECTURE: Collision mesh is child of container
            const containerMesh = hit.object.parent;

            // Always return the container mesh to maintain container integrity
            // Collision meshes should move with their parent containers
            return containerMesh;

        } else if (isContainerInteractive) {
            // FALLBACK: Scene-level interactive mesh with parent container ID
            const sceneController = window.modlerComponents?.sceneController;
            const containerId = hit.object.userData.parentContainer;

            if (sceneController && containerId) {
                const containerData = sceneController.getObject(containerId);
                const containerMesh = containerData?.mesh;

                // Check if the container is explicitly selected
                if (containerMesh && this.selectionController.isSelected(containerMesh)) {
                    return containerMesh;
                }
            }

            // Default to the hit object for direct manipulation
            return hit.object;
        } else {
            // Regular objects - always return the hit object
            return hit.object;
        }
    }

    /**
     * Clear hover state and visual feedback
     */
    clearHover() {
        if (this.hoveredObject) {
            // Hide support mesh face highlight if it exists
            const supportMeshes = this.hoveredObject.userData.supportMeshes;
            if (supportMeshes?.faceHighlight) {
                // Restore original material if it was swapped to disabled state
                if (supportMeshes.faceHighlight.userData.originalMaterial) {
                    // Validate that original material still exists before restoring
                    if (supportMeshes.faceHighlight.userData.originalMaterial) {
                        supportMeshes.faceHighlight.material = supportMeshes.faceHighlight.userData.originalMaterial;
                    }
                    delete supportMeshes.faceHighlight.userData.originalMaterial;
                }
                supportMeshes.faceHighlight.visible = false;
            } else {
                // Fallback to Visual Effects for objects without support meshes
                this.visualEffects.clearHighlight();
            }
            this.hoveredObject = null;
            this.hoveredHit = null;
            this.hoveredFaceIndex = null;
        }
    }

    /**
     * Check if tool has active face highlighting
     * Only returns true when there's a valid face hover that can be interacted with
     *
     * @returns {boolean} True if currently highlighting a face that can be interacted with
     */
    hasActiveHighlight() {
        // Must have a hovered object first
        if (!this.hoveredObject || !this.hoveredHit) return false;

        // Use same validation logic as mouse interaction
        return this.hasValidFaceHover(this.hoveredHit);
    }

    /**
     * Get current hover state information
     *
     * @returns {Object} Object containing hovered object and hit information
     */
    getHoverState() {
        return {
            object: this.hoveredObject,
            hit: this.hoveredHit,
            isActive: this.hoveredObject !== null
        };
    }

    /**
     * Check if a container is in hug mode (no layout enabled)
     * Face highlights should only show for containers in layout mode or fixed mode
     *
     * @param {THREE.Object3D} object - Object to check (should be container mesh)
     * @returns {boolean} True if container is in hug mode (not pushable)
     */
    isContainerInHugMode(object) {
        if (!object) return false;

        const sceneController = window.modlerComponents?.sceneController;
        if (!sceneController) return false;

        const objectData = sceneController.getObjectByMesh(object);
        if (!objectData || !objectData.isContainer) {
            // Not a container - face highlights are OK for regular objects
            return false;
        }

        // Container is pushable if it has layout enabled OR is in fixed sizing mode
        const hasLayoutEnabled = objectData.autoLayout && objectData.autoLayout.enabled;
        const isFixedMode = objectData.sizingMode === 'fixed';

        // In hug mode if neither layout nor fixed sizing is active
        return !hasLayoutEnabled && !isFixedMode;
    }

    /**
     * Get world-space face normal, handling all container architectures
     * @param {Object} hit - Raycast hit result with face and object
     * @returns {THREE.Vector3} Normalized face normal in world space
     */
    getWorldFaceNormal(hit) {
        if (!hit || !hit.face) return new THREE.Vector3(0, 1, 0); // Default up

        // Get face normal in local space
        const worldNormal = hit.face.normal.clone();

        // Transform normal based on the object that was hit - handle all container architectures
        const isContainerCollision = hit.object.userData.isContainerCollision;
        const isContainerInteractive = hit.object.userData.isContainerInteractive;

        if (isContainerInteractive && hit.object.userData.containerMesh) {
            // NEW ARCHITECTURE: Interactive mesh with containerMesh reference
            worldNormal.transformDirection(hit.object.userData.containerMesh.matrixWorld);
        } else if (isContainerCollision && hit.object.parent) {
            // OLD ARCHITECTURE: Collision mesh is child of container
            worldNormal.transformDirection(hit.object.matrixWorld);
        } else {
            // Regular objects or fallback
            worldNormal.transformDirection(hit.object.matrixWorld);
        }

        worldNormal.normalize();
        return worldNormal;
    }

    /**
     * Check if a face is oriented toward the camera (front-facing)
     * @param {Object} hit - Raycast hit result with face and object
     * @returns {boolean} True if face is oriented toward camera, false if back-facing
     */
    isFaceTowardCamera(hit) {
        const camera = window.modlerComponents?.sceneFoundation?.camera;
        if (!camera || !hit.face || !hit.point) {
            return true; // Fallback to allow highlighting if camera not available
        }

        // Get world-space face normal
        const worldNormal = this.getWorldFaceNormal(hit);

        // Calculate camera to hit point direction
        const cameraDirection = new THREE.Vector3();
        cameraDirection.subVectors(hit.point, camera.position).normalize();

        // Face is toward camera if dot product is negative
        // (normal points opposite to camera direction)
        return worldNormal.dot(cameraDirection) < 0;
    }

    /**
     * Create a synthetic hit for container when child object is hit
     * Estimates which container face was hit based on hit point location
     * @param {Object} childHit - Original hit on child object
     * @param {THREE.Mesh} containerMesh - Container's main mesh
     * @param {THREE.Mesh} interactiveMesh - Container's interactive mesh (BoxGeometry)
     * @returns {Object} Synthetic hit with container interactive mesh and estimated face
     */
    createSyntheticHitForContainer(childHit, containerMesh, interactiveMesh) {
        // Get hit point in world space
        const hitPoint = childHit.point;

        // Transform hit point to container local space
        const localPoint = hitPoint.clone();
        interactiveMesh.worldToLocal(localPoint);

        // Get bounding box of interactive mesh to determine which face was hit
        interactiveMesh.geometry.computeBoundingBox();
        const bbox = interactiveMesh.geometry.boundingBox;

        // Determine which face is closest to the hit point
        const distances = {
            left: Math.abs(localPoint.x - bbox.min.x),
            right: Math.abs(localPoint.x - bbox.max.x),
            bottom: Math.abs(localPoint.y - bbox.min.y),
            top: Math.abs(localPoint.y - bbox.max.y),
            back: Math.abs(localPoint.z - bbox.min.z),
            front: Math.abs(localPoint.z - bbox.max.z)
        };

        // Find the closest face
        const closestFace = Object.keys(distances).reduce((a, b) =>
            distances[a] < distances[b] ? a : b
        );

        // Map face to normal vector
        const faceNormals = {
            left: new THREE.Vector3(-1, 0, 0),
            right: new THREE.Vector3(1, 0, 0),
            bottom: new THREE.Vector3(0, -1, 0),
            top: new THREE.Vector3(0, 1, 0),
            back: new THREE.Vector3(0, 0, -1),
            front: new THREE.Vector3(0, 0, 1)
        };

        // Create synthetic face object
        const syntheticFace = {
            normal: faceNormals[closestFace],
            a: 0, b: 1, c: 2  // Dummy indices for face tracking
        };

        // Return synthetic hit
        return {
            object: interactiveMesh,
            face: syntheticFace,
            point: hitPoint,
            distance: childHit.distance
        };
    }
}

// Export for use in tools
window.BaseFaceToolBehavior = BaseFaceToolBehavior;