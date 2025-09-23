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

        // Face detection completed

        // Filter out child objects of selected containers - they should not show face highlighting
        if (!this.selectionController.isSelected(targetObject)) {
            const sceneController = window.modlerComponents?.sceneController;
            const objectData = sceneController?.getObjectByMesh(hit.object);

            if (objectData && objectData.parentContainer) {
                const parentContainer = sceneController.getObject(objectData.parentContainer);
                if (parentContainer && this.selectionController.isSelected(parentContainer.mesh)) {
                    // Object is child of selected container - don't show any highlighting
                    this.clearHover();
                    return false;
                }
            }
        }

        // Only highlight faces of selected objects (including interactive meshes of selected containers)
        if (this.selectionController.isSelected(targetObject)) {
            // CAMERA-FACING CHECK: Only highlight faces oriented toward the camera
            if (!this.isFaceTowardCamera(hit)) {
                this.clearHover();
                return false;
            }

            // CONTAINER MODE CHECK: Only show face highlights for containers in layout mode, not hug mode
            // This check only applies to push tool - move tool should work in hug mode
            if (this.toolType === 'push' && this.isContainerInHugMode(targetObject)) {
                // Container is in hug mode and push tool is active - don't show face highlights
                this.clearHover();
                return false;
            }

            // Store the actual target object for interaction
            this.hoveredObject = targetObject;
            this.hoveredHit = hit;

            // Face highlighting activated - use support mesh if available
            const supportMeshes = targetObject.userData.supportMeshes;
            if (supportMeshes?.faceHighlight) {
                // ARCHITECTURE COMPLIANCE: Position once per hover session, then show
                const supportMeshFactory = window.SupportMeshFactory ? new SupportMeshFactory() : null;
                if (supportMeshFactory) {
                    supportMeshFactory.positionFaceHighlightForHit(supportMeshes.faceHighlight, hit);
                }
                supportMeshes.faceHighlight.visible = true;
            } else {
                // Fallback to Visual Effects for objects without support meshes
                this.visualEffects.showFaceHighlight(hit);
            }
            return true;
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
        const isInContainerContext = this.selectionController.isInContainerContext();

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
                supportMeshes.faceHighlight.visible = false;
            } else {
                // Fallback to Visual Effects for objects without support meshes
                this.visualEffects.clearHighlight();
            }
            this.hoveredObject = null;
            this.hoveredHit = null;
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
     * Check if a container is in hug mode (sizing mode is 'hug')
     * Face highlights should only show for containers in layout/fixed mode, not hug mode
     *
     * @param {THREE.Object3D} object - Object to check (should be container mesh)
     * @returns {boolean} True if container is in hug mode
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

        // Check if container is in hug sizing mode
        return objectData.sizingMode === 'hug';
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
}

// Export for use in tools
window.BaseFaceToolBehavior = BaseFaceToolBehavior;