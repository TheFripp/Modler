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

        // Check if this is a container interactive mesh (new wireframe approach)
        const isContainerInteractive = hit.object.userData.isContainerInteractive;

        let targetObject;
        if (isContainerInteractive) {
            // For scene-level interactive meshes, find container by ID
            const sceneController = window.modlerComponents?.sceneController;
            const containerId = hit.object.userData.parentContainer;

            if (sceneController && containerId) {
                const containerData = sceneController.getObject(containerId);
                targetObject = containerData?.mesh || hit.object;
            } else {
                // Fallback: try parent reference (for child interactive meshes)
                targetObject = hit.object.parent || hit.object;
            }
        } else {
            targetObject = hit.object;
        }

        console.log('🎯 FACE DETECTION:', {
            hasHit: !!hit,
            hitObjectName: hit.object.name || 'unnamed',
            isContainerInteractive,
            containerId: hit.object.userData?.parentContainer,
            targetObjectName: targetObject?.name || 'unnamed',
            isSelected: this.selectionController.isSelected(targetObject),
            hasUserData: !!hit.object.userData,
            userData: hit.object.userData,
            hitObjectType: hit.object.type,
            hitObjectRenderOrder: hit.object.renderOrder,
            hitObjectMaterial: hit.object.material?.type,
            hitObjectOpacity: hit.object.material?.opacity,
            hitObjectParent: hit.object.parent?.name || 'scene',
            hitObjectVisible: hit.object.visible,
            // Enhanced debugging
            timestamp: Date.now(),
            selectionCount: this.selectionController.getSelectedObjects().length,
            selectedObjectNames: this.selectionController.getSelectedObjects().map(obj => obj.name || 'unnamed')
        });

        // Only highlight faces of selected objects (including interactive meshes of selected containers)
        if (this.selectionController.isSelected(targetObject)) {
            // Store the actual target object for interaction
            this.hoveredObject = targetObject;
            this.hoveredHit = hit;

            console.log('✅ FACE HIGHLIGHTING: Showing face highlight for', targetObject.name, {
                isContainerInteractive,
                containerId: hit.object.userData?.parentContainer,
                targetObjectSelected: this.selectionController.isSelected(targetObject),
                hitObjectMaterial: hit.object.material?.type,
                hitObjectOpacity: hit.object.material?.opacity
            });
            this.visualEffects.showFaceHighlight(hit);
            return true;
        } else {
            console.log('❌ FACE HIGHLIGHTING: Object not selected, clearing hover', {
                targetObjectName: targetObject?.name || 'unnamed',
                isContainerInteractive,
                containerId: hit.object.userData?.parentContainer,
                selectedObjects: this.selectionController.getSelectedObjects().map(obj => obj.name || 'unnamed'),
                reasonForFailure: 'Target object not in selectedObjects Set'
            });
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

        const isContainerInteractive = hit.object.userData.isContainerInteractive;

        let targetObject;
        if (isContainerInteractive) {
            // For scene-level interactive meshes, find container by ID
            const sceneController = window.modlerComponents?.sceneController;
            const containerId = hit.object.userData.parentContainer;

            if (sceneController && containerId) {
                const containerData = sceneController.getObject(containerId);
                targetObject = containerData?.mesh || hit.object;
            } else {
                // Fallback: try parent reference (for child interactive meshes)
                targetObject = hit.object.parent || hit.object;
            }
        } else {
            targetObject = hit.object;
        }

        const isSelectedObject = targetObject && this.selectionController.isSelected(targetObject);
        const hasHighlightedFace = this.hoveredObject === targetObject;

        return isSelectedObject && hasHighlightedFace;
    }

    /**
     * Get the target object from a hit, resolving container collision meshes
     *
     * @param {Object} hit - Raycast hit result
     * @returns {Object|null} Target object (parent for collision meshes, object for direct hits)
     */
    getTargetObject(hit) {
        if (!hit || !hit.object) return null;

        const isContainerInteractive = hit.object.userData.isContainerInteractive;

        if (isContainerInteractive) {
            // For scene-level interactive meshes, find container by ID
            const sceneController = window.modlerComponents?.sceneController;
            const containerId = hit.object.userData.parentContainer;

            if (sceneController && containerId) {
                const containerData = sceneController.getObject(containerId);
                return containerData?.mesh || hit.object;
            } else {
                // Fallback: try parent reference (for child interactive meshes)
                return hit.object.parent || hit.object;
            }
        } else {
            return hit.object;
        }
    }

    /**
     * Clear hover state and visual feedback
     */
    clearHover() {
        if (this.hoveredObject) {
            this.visualEffects.clearHighlight();
            this.hoveredObject = null;
            this.hoveredHit = null;
        }
    }

    /**
     * Check if tool has active face highlighting
     *
     * @returns {boolean} True if currently highlighting a face
     */
    hasActiveHighlight() {
        return this.hoveredObject !== null;
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
}

// Export for use in tools
window.BaseFaceToolBehavior = BaseFaceToolBehavior;