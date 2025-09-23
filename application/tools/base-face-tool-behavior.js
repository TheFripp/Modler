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
     */
    constructor(selectionController, visualEffects) {
        this.selectionController = selectionController;
        this.visualEffects = visualEffects;

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

        // Only highlight faces of selected objects (including interactive meshes of selected containers)
        if (this.selectionController.isSelected(targetObject)) {
            // CONTAINER MODE CHECK: Only show face highlights for containers in layout mode, not hug mode
            if (this.isContainerInHugMode(targetObject)) {
                // Container is in hug mode - don't show face highlights
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

        // When in container context, return the actual hit object (child) instead of resolving to container
        if (isInContainerContext) {
            return hit.object;
        }

        // When NOT in container context, resolve to containers for moving containers as units
        if (isContainerInteractive && hit.object.userData.containerMesh) {
            // NEW ARCHITECTURE: Interactive mesh has direct containerMesh reference
            return hit.object.userData.containerMesh;
        } else if (isContainerCollision && hit.object.parent) {
            // OLD ARCHITECTURE: Collision mesh is child of container
            return hit.object.parent;
        } else if (isContainerInteractive) {
            // FALLBACK: Scene-level interactive mesh with parent container ID
            const sceneController = window.modlerComponents?.sceneController;
            const containerId = hit.object.userData.parentContainer;

            if (sceneController && containerId) {
                const containerData = sceneController.getObject(containerId);
                return containerData?.mesh || hit.object;
            } else {
                return hit.object.parent || hit.object;
            }
        } else {
            // Regular objects
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
}

// Export for use in tools
window.BaseFaceToolBehavior = BaseFaceToolBehavior;