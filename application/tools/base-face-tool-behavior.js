import * as THREE from 'three';
/**
 * Base Face Tool Behavior - Shared Face Detection and Hover Logic
 *
 * Provides common face-based interaction patterns shared between MoveTool and PushTool.
 * Centralizes face detection, hover state management, and container interactive mesh handling
 * to eliminate code duplication and ensure consistent behavior.
 *
 * Face Highlight Rules (per-tool via this.rules):
 * | Rule                    | Move  | Push  | Default |
 * |-------------------------|-------|-------|---------|
 * | blockHugModeContainers  | false | false | false   |
 * | showDisabledState       | false | false | false   |
 * | allowLayoutChildren     | false | false | false   |
 *
 * Common rules (always applied):
 * - Face highlights show on any hovered object; interaction requires selection
 * - Only camera-facing faces get highlights
 * - Container interactive mesh redirects to parent container
 * - Children in selected containers redirect to container face
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
    constructor(selectionController, visualEffects, toolType = 'unknown', options = {}) {
        this.selectionController = selectionController;
        this.visualEffects = visualEffects;
        this.toolType = toolType;

        // Declarative highlight rules (configured per tool, see table in class doc)
        this.rules = {
            blockHugModeContainers: false,
            showDisabledState: false,
            allowLayoutChildren: false,
            ...options.rules
        };

        // Shared hover state
        this.hoveredObject = null;
        this.hoveredHit = null;
        this.hoveredFaceIndex = null; // Track which face is hovered to prevent repositioning flicker
    }

    /**
     * Resolve the target object from a raycast hit, handling container architectures.
     * Resolves interactive/collision meshes to their parent container mesh.
     *
     * @param {Object} hit - Raycast hit result
     * @returns {Object|null} Resolved target object
     */
    _resolveContainerTarget(hit) {
        if (!hit || !hit.object) return null;

        const isContainerInteractive = hit.object.userData.isContainerInteractive;
        const isContainerCollision = hit.object.userData.isContainerCollision;

        if (isContainerInteractive && hit.object.userData.containerMesh) {
            return hit.object.userData.containerMesh;
        } else if (isContainerCollision && hit.object.parent) {
            return hit.object.parent;
        } else if (isContainerInteractive) {
            const sceneController = window.modlerComponents?.sceneController;
            const containerId = hit.object.userData.parentContainer;
            if (sceneController && containerId) {
                const containerData = sceneController.getObject(containerId);
                return containerData?.mesh || hit.object;
            }
            return hit.object.parent || hit.object;
        }
        return hit.object;
    }

    /**
     * Handle face detection and highlighting for hovered objects
     *
     * Centralizes the common face detection logic used by both move and push tools.
     * Shows face highlights on any hovered object; interaction gated by hasValidFaceHover.
     *
     * @param {Object} hit - Raycast hit result with object and face information
     * @returns {boolean} True if face was highlighted, false otherwise
     */
    handleFaceDetection(hit) {
        if (!hit || !hit.object || !hit.face) {
            this.clearHover();
            return false;
        }

        let targetObject = this._resolveContainerTarget(hit);
        const isContainerInteractive = hit.object.userData.isContainerInteractive;
        const isContainerCollision = hit.object.userData.isContainerCollision;

        // Block children of non-selected containers from showing face highlights
        // Standalone non-selected objects pass through to show hover preview
        if (!this.selectionController.isSelected(targetObject)) {
            const sceneController = window.modlerComponents?.sceneController;
            const objectData = sceneController?.getObjectByMesh(targetObject);

            if (objectData && objectData.parentContainer) {
                const parentContainer = sceneController.getObject(objectData.parentContainer);
                if (!parentContainer || !this.selectionController.isSelected(parentContainer.mesh)) {
                    this.clearHover();
                    return false;
                }
                // Child of selected container - continue processing below
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

        // Face highlight for any hovered object (interaction still requires selection via hasValidFaceHover)

        // CAMERA-FACING CHECK: Only highlight faces oriented toward the camera
        if (!this.isFaceTowardCamera(hitForFaceDetection)) {
            this.clearHover();
            return false;
        }

        // CONTAINER MODE CHECK: Use declarative rules to determine if action is blocked
        const isDisabledAction = this.rules.blockHugModeContainers && this.isContainerInHugMode(targetObject);

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
            // Use centralized disabled state management
            {
                const supportMeshFactory = window.modlerComponents?.supportMeshFactory;
                if (supportMeshFactory) {
                    supportMeshFactory.setFaceHighlightDisabled(targetObject, isDisabledAction);
                    supportMeshFactory.showFaceHighlight(targetObject);
                } else {
                    supportMeshes.faceHighlight.visible = true;
                }
            }
        } else {
            // Fallback to Visual Effects for objects without support meshes
            const materialManager = window.modlerComponents?.materialManager;
            const disabledColor = materialManager?.colors?.DISABLED_STATE || 0x888888;
            this.visualEffects.showFaceHighlight(hitForFaceDetection, isDisabledAction ? disabledColor : null);
        }
        return !isDisabledAction;
    }

    /**
     * Check if currently hovering over a highlighted face on a selected object
     *
     * @param {Object} hit - Current raycast hit
     * @returns {boolean} True if hovering over a valid highlighted face
     */
    hasValidFaceHover(hit) {
        if (!hit || !hit.object || !hit.face) return false;

        const targetObject = this._resolveContainerTarget(hit);

        // Check if target object is selected
        // InputController raycast already filters out children when parent container is selected
        const isSelectedObject = targetObject && this.selectionController.isSelected(targetObject);
        const hasHighlightedFace = this.hoveredObject === targetObject;
        // Only block for tools that declare blockHugModeContainers (e.g. push)
        const isNotBlocked = !this.rules.blockHugModeContainers || !this.isContainerInHugMode(targetObject);

        return isSelectedObject && hasHighlightedFace && isNotBlocked;
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

        const resolved = this._resolveContainerTarget(hit);

        // For the fallback case (scene-level interactive mesh without containerMesh reference),
        // additionally check if the resolved container is selected
        const isContainerInteractive = hit.object.userData.isContainerInteractive;
        if (isContainerInteractive && !hit.object.userData.containerMesh && resolved !== hit.object) {
            // Only return container if it's explicitly selected
            if (!this.selectionController.isSelected(resolved)) {
                return hit.object;
            }
        }

        return resolved;
    }

    /**
     * Clear hover state and visual feedback
     */
    clearHover() {
        if (this.hoveredObject) {
            // Hide support mesh face highlight via centralized API
            const supportMeshFactory = window.modlerComponents?.supportMeshFactory;
            const supportMeshes = this.hoveredObject.userData.supportMeshes;
            if (supportMeshes?.faceHighlight) {
                if (supportMeshFactory) {
                    // Restore disabled material and hide
                    supportMeshFactory.setFaceHighlightDisabled(this.hoveredObject, false);
                    supportMeshFactory.hideFaceHighlight(this.hoveredObject);
                } else {
                    supportMeshes.faceHighlight.visible = false;
                }
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
        if (!objectData?.isContainer) return false;
        const osm = window.modlerComponents?.objectStateManager;
        return osm?.isHugMode(objectData.id) || false;
    }

    /**
     * Get world-space face normal, handling all container architectures
     * @param {Object} hit - Raycast hit result with face and object
     * @returns {THREE.Vector3} Normalized face normal in world space
     */
    getWorldFaceNormal(hit) {
        if (!hit || !hit.face) return new THREE.Vector3(0, 1, 0); // Default up

        const worldNormal = hit.face.normal.clone();

        // For interactive meshes with containerMesh reference, use container's matrix
        // All other cases (collision meshes, regular objects) use the hit object's own matrix
        if (hit.object.userData.isContainerInteractive && hit.object.userData.containerMesh) {
            worldNormal.transformDirection(hit.object.userData.containerMesh.matrixWorld);
        } else {
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