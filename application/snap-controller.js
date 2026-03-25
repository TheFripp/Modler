import * as THREE from 'three';
/**
 * Snap Controller
 * Centralized snapping system for precise object positioning.
 * Manages snap state (enable/disable, current point, stability, notifications)
 * and tool behavior registration. Candidate detection delegated to SnapCandidateDetector.
 */

class SnapController {
    constructor(scene, camera, inputController) {
        this.scene = scene;
        this.camera = camera;
        this.inputController = inputController;

        // Centralized snap state — persisted across sessions
        this.isEnabled = localStorage.getItem('modler-snap-enabled') === 'true';
        this.snapThreshold = 16; // 16px screen space proximity for easier targeting
        this.currentSnapPoint = null;
        this.activeSnapType = null; // 'corner', 'edge', 'face'

        // Snap system registry - all snapping systems register here
        this.registeredSnapSystems = new Map();

        // Tool behavior registry
        this.toolSnapBehaviors = new Map();

        // Performance optimization - only run detection when needed
        this.shouldRunDetection = false;
        this.lastMousePosition = new THREE.Vector2();

        // Stability to prevent flickering
        this.lastSnapPoint = null;
        this.stabilityFrames = 0;
        this.requiredStableFrames = 2; // Must be stable for 2 frames before changing

        // Debug logging throttle
        this.lastLogTime = 0;
        this.logInterval = 500; // Log at most once per 500ms

        // Extracted candidate detection helper
        this.detector = new SnapCandidateDetector(this);
    }
    
    /**
     * Register a snap system component for centralized control
     * @param {string} systemName - Name of the snap system
     * @param {Object} systemRef - Reference to the system with enable/disable methods
     */
    registerSnapSystem(systemName, systemRef) {
        if (systemRef && typeof systemRef.setEnabled === 'function') {
            this.registeredSnapSystems.set(systemName, systemRef);
        }
    }

    /**
     * Unregister a snap system
     * @param {string} systemName - Name of the system to unregister
     */
    unregisterSnapSystem(systemName) {
        this.registeredSnapSystems.delete(systemName);
    }

    /**
     * Enable/disable snapping globally - controls ALL registered snap systems
     */
    setEnabled(enabled) {
        this.isEnabled = enabled;
        localStorage.setItem('modler-snap-enabled', enabled ? 'true' : 'false');

        // Control all registered snap systems
        this.registeredSnapSystems.forEach((system, name) => {
            try {
                system.setEnabled(enabled);
            } catch (error) {
            }
        });

        // Clear current snap point when disabled
        if (!enabled) {
            this.clearCurrentSnapPoint();
            this.shouldRunDetection = false;
        }

        // Notify UI about state change
        this.notifySnapStateChange();

    }

    /**
     * Request snap detection on next frame (for event-driven detection)
     */
    requestSnapDetection() {
        this.shouldRunDetection = true;
    }
    
    /**
     * Check if snapping is currently enabled
     */
    getEnabled() {
        return this.isEnabled;
    }

    /**
     * Toggle snapping on/off. Called from CommandRouter via toolbar button.
     */
    toggle() {
        this.setEnabled(!this.isEnabled);
    }

    /**
     * Register snap behavior for a specific tool
     */
    registerToolSnapBehavior(toolName, behavior) {
        this.toolSnapBehaviors.set(toolName, {
            showSnapPoints: behavior.showSnapPoints || (() => false),
            snapPointTypes: behavior.snapPointTypes || ['corner', 'edge', 'face'],
            snapOnHover: behavior.snapOnHover || false,
            attachmentMode: behavior.attachmentMode || 'free'
        });
        
    }
    
    /**
     * Update snap detection based on current mouse position and active tool
     * Now with performance optimization - only run when needed
     */
    updateSnapDetection(activeToolName, selectedObjects = [], travelAxis = null, geometricConstraints = null, sourceWorldPos = null) {
        // Early return if snapping disabled - CRITICAL for performance
        if (!this.isEnabled) {
            this.clearCurrentSnapPoint();
            this.shouldRunDetection = false;
            return null;
        }

        // Performance optimization: only run detection when mouse moves or conditions change
        const currentMousePos = this.inputController.mouse;
        const mouseMovedSignificantly = this.lastMousePosition.distanceTo(currentMousePos) > 0.005; // Larger threshold for stability

        if (!mouseMovedSignificantly && !this.shouldRunDetection) {
            return this.currentSnapPoint; // Return cached result
        }

        // Only log when we actually find snap candidates (moved below)

        this.lastMousePosition.copy(currentMousePos);
        this.shouldRunDetection = false;
        
        // Get tool behavior
        const toolBehavior = this.toolSnapBehaviors.get(activeToolName);
        if (!toolBehavior) {
            this.clearCurrentSnapPoint();
            return null;
        }

        // If no objects selected and tool doesn't need snap points, skip detection
        // This reduces interference with camera controls
        if (selectedObjects.length === 0 && !toolBehavior.showSnapPoints(selectedObjects) && activeToolName !== 'box-creation') {
            this.clearCurrentSnapPoint();
            return null;
        }
        
        // Use proper tool registration instead of hardcoded special cases
        {
            // Check if tool wants snap points shown for current selection state
            if (!toolBehavior.showSnapPoints(selectedObjects)) {
                this.clearCurrentSnapPoint();
                return null;
            }
        }
        
        // Get current mouse position from InputController
        const mouseNDC = this.inputController.mouse;

        // Find closest snap point within threshold
        const snapPoint = this.findClosestSnapPoint(mouseNDC, toolBehavior.snapPointTypes, selectedObjects, travelAxis, geometricConstraints, sourceWorldPos);

        // Only log when we actually find snap points
        if (snapPoint) {
        }

        // Update current snap point
        this.updateCurrentSnapPoint(snapPoint);

        return this.currentSnapPoint;
    }
    
    /**
     * Find the closest snap point to the mouse cursor with optional travel axis filtering
     */
    findClosestSnapPoint(mouseNDC, allowedTypes, selectedObjects, travelAxis = null, geometricConstraints = null, sourceWorldPos = null) {
        const d = this.detector;
        const referencePixel = sourceWorldPos
            ? d.worldToPixel(sourceWorldPos)
            : d.ndcToPixel(mouseNDC);

        const objectsToCheck = d.getObjectsForSnapping(selectedObjects);

        let bestCorner = null;
        let bestCornerDist = this.snapThreshold;
        let bestEdge = null;
        let bestEdgeDist = this.snapThreshold;

        for (const object of objectsToCheck) {
            if (allowedTypes.includes('corner')) {
                for (const corner of d.getVisibleObjectCorners(object)) {
                    const distance = d.getScreenDistance(corner.screenPos, referencePixel);
                    if (distance < bestCornerDist) {
                        const candidate = {
                            type: 'corner',
                            worldPos: corner.worldPos,
                            screenPos: corner.screenPos,
                            object: object,
                            distance: distance
                        };
                        if (this.isValidSnapPoint(candidate, geometricConstraints)) {
                            bestCornerDist = distance;
                            bestCorner = candidate;
                        }
                    }
                }
            }

            if (allowedTypes.includes('edge')) {
                for (const edge of d.getVisibleObjectEdges(object, travelAxis)) {
                    const startScreen = d.worldToPixel(edge.start);
                    const endScreen = d.worldToPixel(edge.end);
                    const { distance, t } = d.getDistanceAndParamToLineSegment(referencePixel, startScreen, endScreen);

                    if (distance < bestEdgeDist) {
                        const worldPos = edge.start.clone().lerp(edge.end, t);
                        const screenPos = d.worldToPixel(worldPos);
                        const candidate = {
                            type: 'edge',
                            worldPos,
                            screenPos,
                            object: object,
                            distance: distance,
                            edgeStart: edge.start,
                            edgeEnd: edge.end
                        };
                        if (this.isValidSnapPoint(candidate, geometricConstraints)) {
                            bestEdgeDist = distance;
                            bestEdge = candidate;
                        }
                    }
                }
            }
        }

        return bestCorner || bestEdge;
    }

    /**
     * Validate snap point against geometric constraints
     *
     * Used to filter out snap points that would cause invalid geometry
     * (e.g., inside-out objects in push operations) before they become
     * visible indicators.
     *
     * @param {Object} snapPoint - Candidate snap point to validate
     * @param {Object} geometricConstraints - Constraints object from tool
     * @returns {boolean} True if snap point is valid, false to filter out
     */
    isValidSnapPoint(snapPoint, geometricConstraints) {
        // If no constraints provided, all snap points are valid
        if (!geometricConstraints) return true;

        // Handle push tool geometric constraints
        if (geometricConstraints.type === 'push_geometric') {
            // Use the validation function provided by the push tool
            if (geometricConstraints.validateSnapPoint) {
                const validatedPoint = geometricConstraints.validateSnapPoint(snapPoint);
                return validatedPoint !== null;
            }
        }

        // Unknown constraint type or no validation needed
        return true;
    }

    /**
     * Update current snap point with stability check to prevent flickering
     */
    updateCurrentSnapPoint(snapPoint) {
        // Check if this snap point is the same as the last detected one
        const isSameAsLast = this.isSameSnapPoint(this.lastSnapPoint, snapPoint);

        if (isSameAsLast) {
            // Same snap point detected, increment stability counter
            this.stabilityFrames++;
        } else {
            // Different snap point, reset stability counter
            this.stabilityFrames = 0;
            this.lastSnapPoint = snapPoint;
        }

        // Only update if snap point is stable for required frames, or if clearing
        const shouldUpdate = !snapPoint || this.stabilityFrames >= this.requiredStableFrames;

        if (shouldUpdate) {
            const changed = !this.isSameSnapPoint(this.currentSnapPoint, snapPoint);

            this.currentSnapPoint = snapPoint;
            this.activeSnapType = snapPoint ? snapPoint.type : null;

            if (changed) {
                this.notifySnapPointChange();
            }
        }
    }
    
    /**
     * Check if two snap points are the same
     */
    isSameSnapPoint(point1, point2) {
        if (!point1 && !point2) return true;
        if (!point1 || !point2) return false;
        
        return point1.type === point2.type &&
               point1.object === point2.object &&
               point1.worldPos.distanceTo(point2.worldPos) < 0.001;
    }
    
    /**
     * Clear current snap point
     */
    clearCurrentSnapPoint() {
        if (this.currentSnapPoint) {
            this.currentSnapPoint = null;
            this.activeSnapType = null;
            this.lastSnapPoint = null;
            this.stabilityFrames = 0;
            this.notifySnapPointChange();
        }
    }
    
    /**
     * Get current snap point (for tools to use)
     */
    getCurrentSnapPoint() {
        return this.currentSnapPoint;
    }
    
    /**
     * Notify snap visualizer about snap point changes
     */
    notifySnapPointChange() {
        const snapVisualizer = window.modlerComponents?.snapVisualizer;
        if (snapVisualizer) {
            snapVisualizer.updateSnapIndicator(this.currentSnapPoint);
        }
    }
    
    /**
     * Notify UI about snap state changes via ObjectEventBus → SimpleCommunication → iframe
     */
    notifySnapStateChange() {
        if (window.objectEventBus) {
            window.objectEventBus.emit(
                window.objectEventBus.EVENT_TYPES.TOOL_STATE,
                null,
                {
                    toolState: { snapEnabled: this.isEnabled }
                },
                { source: 'snap-controller', immediate: true }
            );
        }
    }
    
    /**
     * Cleanup
     */
    destroy() {
        this.clearCurrentSnapPoint();
        this.toolSnapBehaviors.clear();
    }
}

// Export for use in main application
window.SnapController = SnapController;