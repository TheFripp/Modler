// Modler V2 - Streamlined Camera Controller
// Essential camera controls only - integrated with InputController
// Target: ~150 lines (down from 416 lines - 64% reduction)

class CameraController {
    constructor(camera, canvas) {
        this.camera = camera;
        this.canvas = canvas;

        // Core camera state
        this.isOrbiting = false;
        this.isPanning = false;

        // Camera settings (essential only)
        this.orbitTarget = new THREE.Vector3(0, 0, 0);
        this.orbitSpeed = 1.0;
        this.panSpeed = 0.5;
        this.zoomSpeed = 0.5;

        // Mouse tracking (simplified)
        this.lastMousePosition = new THREE.Vector2();
        this.orbitStartPosition = null;
        this.significantMovementThreshold = 0.5;

        // Spherical coordinates for orbit
        this.spherical = new THREE.Spherical();
        this.minPolarAngle = 0.01;
        this.maxPolarAngle = Math.PI - 0.01;

        // Initialize zoom centering (if available)
        if (window.ZoomCentering) {
            this.zoomCentering = new ZoomCentering(this.camera, this.canvas, { current: this.orbitTarget });
        }

        // Setup minimal event listeners
        this.setupEventListeners();
        this.updateSphericalFromCamera();

    }

    setupEventListeners() {
        // Only essential events - InputController handles mouse events
        this.canvas.addEventListener('wheel', this.onWheel.bind(this), { passive: false });
        this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
        this.canvas.addEventListener('mouseleave', this.onMouseLeave.bind(this));
    }

    // Called by InputController to start orbit
    startOrbitFromInputHandler(event, mousePos) {
        this.lastMousePosition.copy(mousePos);
        this.orbitStartPosition = this.camera.position.clone();
        this.isOrbiting = true;
        this.canvas.style.cursor = 'grab';
    }

    // Called by InputController to start pan
    startPanFromInputHandler(event, mousePos) {
        this.lastMousePosition.copy(mousePos);
        this.orbitStartPosition = this.camera.position.clone();
        this.isPanning = true;
        this.canvas.style.cursor = 'grabbing';
    }

    // Called by InputController during mouse move
    handleMouseMoveFromInputHandler(event) {
        // Calculate mouse delta using InputController's normalized coordinates
        const inputController = window.modlerComponents?.inputController;
        if (!inputController) return;

        const currentMouse = inputController.mouse;
        const deltaX = currentMouse.x - this.lastMousePosition.x;
        const deltaY = currentMouse.y - this.lastMousePosition.y;

        if (this.isOrbiting) {
            this.performOrbit(deltaX, deltaY);
        } else if (this.isPanning) {
            this.performPan(deltaX, deltaY);
        }

        this.lastMousePosition.copy(currentMouse);
    }

    performOrbit(deltaX, deltaY) {
        // Update spherical coordinates
        this.updateSphericalFromCamera();

        this.spherical.theta -= deltaX * this.orbitSpeed;
        this.spherical.phi += deltaY * this.orbitSpeed;

        // Apply limits
        this.spherical.phi = Math.max(this.minPolarAngle, Math.min(this.maxPolarAngle, this.spherical.phi));

        // Update camera position
        this.camera.position.setFromSpherical(this.spherical).add(this.orbitTarget);
        this.camera.lookAt(this.orbitTarget);
    }

    performPan(deltaX, deltaY) {
        // Calculate pan vector in world space
        const panVector = new THREE.Vector3();
        const cameraRight = new THREE.Vector3();
        const cameraUp = new THREE.Vector3();

        // Get camera right and up vectors
        this.camera.getWorldDirection(panVector);
        cameraRight.crossVectors(this.camera.up, panVector).normalize();
        cameraUp.crossVectors(panVector, cameraRight).normalize();

        // Calculate movement
        const distance = this.camera.position.distanceTo(this.orbitTarget);
        const panScale = this.panSpeed * distance;

        panVector.copy(cameraRight).multiplyScalar(deltaX * panScale);
        panVector.addScaledVector(cameraUp, -deltaY * panScale);

        // Apply to both camera and target
        this.camera.position.add(panVector);
        this.orbitTarget.add(panVector);
    }

    onWheel(event) {
        event.preventDefault();

        // Try zoom centering first (for selected objects), fallback to simple zoom
        if (this.zoomCentering && this.zoomCentering.handleWheel(event)) {
            // ZoomCentering handled the event and applied centering
            this.performSimpleZoom(event);
        } else {
            // No selection or centering not applied, use simple zoom
            this.performSimpleZoom(event);
        }
    }

    performSimpleZoom(event) {
        // Distance-based zoom speed: slower when close, max speed when far
        const distance = this.camera.position.distanceTo(this.orbitTarget);
        const minDistance = 2.0;
        const maxDistance = 50.0;
        const maxZoomFactor = 0.1; // Maximum 10% change per wheel event

        // Calculate zoom factor based on distance (linear interpolation)
        const normalizedDistance = Math.min(Math.max((distance - minDistance) / (maxDistance - minDistance), 0), 1);
        const zoomFactor = 0.02 + (normalizedDistance * maxZoomFactor); // 2% minimum, 10% maximum

        const scale = event.deltaY > 0 ? (1 + zoomFactor) : (1 - zoomFactor);

        // Move camera towards/away from target
        const direction = new THREE.Vector3()
            .subVectors(this.camera.position, this.orbitTarget)
            .multiplyScalar(scale);

        this.camera.position.copy(this.orbitTarget).add(direction);
    }

    // Called by InputController to stop operations
    stopCameraOperation() {
        const wasActive = this.isOrbiting || this.isPanning;
        let movedSignificantly = false;

        if (wasActive && this.orbitStartPosition) {
            const distance = this.camera.position.distanceTo(this.orbitStartPosition);
            movedSignificantly = distance > this.significantMovementThreshold;
        }

        this.isOrbiting = false;
        this.isPanning = false;
        this.canvas.style.cursor = 'default';

        return movedSignificantly;
    }

    onMouseLeave() {
        // Stop any active camera operations when mouse leaves canvas
        this.isOrbiting = false;
        this.isPanning = false;
        this.canvas.style.cursor = 'default';
    }

    updateSphericalFromCamera() {
        const offset = new THREE.Vector3().subVectors(this.camera.position, this.orbitTarget);
        this.spherical.setFromVector3(offset);
    }

    // Utility methods for external use
    setOrbitTarget(target) {
        this.orbitTarget.copy(target);
    }

    getOrbitTarget() {
        return this.orbitTarget.clone();
    }

    /**
     * Frame a specific object in the camera view
     * @param {THREE.Object3D} object - The object to frame
     */
    frameObject(object) {
        if (!object) return;

        // Calculate object bounds
        const box = new THREE.Box3().setFromObject(object);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());

        // Calculate appropriate distance based on object size
        const maxDim = Math.max(size.x, size.y, size.z);
        const distance = maxDim * 2.5; // Multiply by 2.5 to give some breathing room

        // Update orbit target to object center
        this.setOrbitTarget(center);

        // Position camera at a nice angle relative to the object
        const cameraPosition = new THREE.Vector3(
            center.x + distance * 0.7,
            center.y + distance * 0.7,
            center.z + distance * 0.7
        );

        this.camera.position.copy(cameraPosition);
        this.camera.lookAt(center);

        // Update spherical coordinates to match new camera position
        this.updateSphericalFromCamera();

        console.log('Framed object at center:', center, 'distance:', distance);
    }

    /**
     * Reset camera to default position and target
     */
    resetCamera() {
        // Default camera position (similar to initialization)
        this.camera.position.set(10, 10, 10);

        // Reset orbit target to origin
        this.setOrbitTarget(new THREE.Vector3(0, 0, 0));

        // Point camera at origin
        this.camera.lookAt(0, 0, 0);

        // Update spherical coordinates to match reset position
        this.updateSphericalFromCamera();

        console.log('Camera reset to default position');
    }

    destroy() {
        this.canvas.removeEventListener('wheel', this.onWheel);
        this.canvas.removeEventListener('contextmenu', this.onContextMenu);
        this.canvas.removeEventListener('mouseleave', this.onMouseLeave);

        if (this.zoomCentering) {
            this.zoomCentering.destroy();
        }
    }
}

// Export for use in main application
window.CameraController = CameraController;