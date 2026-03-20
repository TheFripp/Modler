import * as THREE from 'three';
/**
 * Duplication Mode - Visual state management for Cmd+drag duplication
 *
 * Manages ghost object display, measurement lines, and cleanup for the
 * duplication workflow. Used by MoveTool when Command key is held during drag.
 */

class DuplicationMode {
    constructor() {
        this.isActive = false;
        this.ghostObject = null;
    }

    /**
     * Enter duplication mode - create ghost wireframe at original position
     * Visual: dragged object = duplicate (being positioned), ghost = original (stays at start)
     */
    enter(dragObject, dragStartPosition) {
        if (!dragObject || this.isActive) return;

        this.isActive = true;

        // Store current position of dragged object
        const currentDragPosition = dragObject.position.clone();

        // Create ghost object at START position to show where original will stay
        const sceneController = window.modlerComponents?.sceneController;
        const objectData = sceneController?.getObjectByMesh(dragObject);

        if (objectData) {
            // Create a temporary ghost wireframe (not pooled - short-lived visualization)
            const ghostEdgesGeometry = new THREE.EdgesGeometry(dragObject.geometry);
            const ghostMaterial = new THREE.LineBasicMaterial({
                color: 0x888888,
                opacity: 0.5,
                transparent: true
            });

            this.ghostObject = new THREE.LineSegments(ghostEdgesGeometry, ghostMaterial);
            this.ghostObject.position.copy(dragStartPosition);
            this.ghostObject.rotation.copy(dragObject.rotation);
            this.ghostObject.scale.copy(dragObject.scale);

            // Add to scene
            const scene = window.modlerComponents?.sceneFoundation?.scene;
            if (scene) {
                scene.add(this.ghostObject);
            }
        }

        // Keep dragged object at its current position (it represents the duplicate being created)
        dragObject.position.copy(currentDragPosition);

        // Show measurement line between original and duplicate
        this.showMeasurement(dragObject);
    }

    /**
     * Show measurement line between original and duplicate during duplication mode
     */
    showMeasurement(dragObject) {
        const measurementTool = window.modlerComponents?.measurementTool;
        if (!measurementTool || !this.ghostObject || !dragObject) return;

        // Get positions
        const originalPos = this.ghostObject.position;
        const duplicatePos = dragObject.position;

        // Calculate distance
        const distance = originalPos.distanceTo(duplicatePos);

        // Create measurement visualization
        measurementTool.createFaceNormalMeasurementVisual(
            originalPos,
            duplicatePos,
            distance,
            false, // No start connector needed
            false, // No end connector needed
            this.ghostObject,
            dragObject
        );
    }

    /**
     * Update duplication measurement during drag
     */
    updateMeasurement(dragObject) {
        if (!this.isActive) return;
        this.showMeasurement(dragObject);
    }

    /**
     * Exit duplication mode - clean up ghost object and measurement
     */
    exit() {
        if (!this.isActive) return;

        this.isActive = false;

        // Clear measurement visualization
        const measurementTool = window.modlerComponents?.measurementTool;
        if (measurementTool) {
            measurementTool.clearMeasurement();
        }

        // Remove and dispose ghost object
        if (this.ghostObject) {
            const scene = window.modlerComponents?.sceneFoundation?.scene;
            if (scene) {
                scene.remove(this.ghostObject);
            }

            // Dispose temporary ghost resources
            if (this.ghostObject.geometry) {
                this.ghostObject.geometry.dispose();
            }
            if (this.ghostObject.material) {
                this.ghostObject.material.dispose();
            }

            this.ghostObject = null;
        }
    }
}

// Export for use in MoveTool
window.DuplicationMode = DuplicationMode;
