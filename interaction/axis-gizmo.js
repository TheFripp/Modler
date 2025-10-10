/**
 * AxisGizmo - 3D Orientation Indicator
 *
 * Displays a small 3D axis visualization in the top-right corner that rotates
 * with the main camera to show current orientation. Features three axes (X, Y, Z)
 * with labeled endpoints and synchronizes with main scene rotation.
 */

class AxisGizmo {
    constructor(containerElement) {
        this.container = containerElement;
        this.size = 60; // 25% taller than 48px toolbar buttons

        // Create separate renderer, scene, and camera for the gizmo
        this.renderer = null;
        this.scene = null;
        this.camera = null;
        this.axisGroup = null;

        this.init();
    }

    init() {
        // Create canvas element
        const canvas = document.createElement('canvas');
        canvas.width = this.size;
        canvas.height = this.size;
        canvas.style.width = `${this.size}px`;
        canvas.style.height = `${this.size}px`;
        this.container.appendChild(canvas);

        // Create WebGL renderer
        this.renderer = new THREE.WebGLRenderer({
            canvas: canvas,
            alpha: true,
            antialias: true
        });
        this.renderer.setSize(this.size, this.size);
        this.renderer.setClearColor(0x000000, 0);

        // Create scene
        this.scene = new THREE.Scene();

        // Create orthographic camera for consistent sizing
        const frustumSize = 2;
        this.camera = new THREE.OrthographicCamera(
            -frustumSize, frustumSize,
            frustumSize, -frustumSize,
            0.1, 100
        );
        this.camera.position.set(0, 0, 10);
        this.camera.lookAt(0, 0, 0);

        // Create axis group
        this.axisGroup = new THREE.Group();
        this.scene.add(this.axisGroup);

        this.createAxes();
        this.render();
    }

    createAxes() {
        const axisLength = 1;
        const sphereRadius = 0.15;
        const lineWidth = 2;

        // Define axes with their directions and labels
        const axes = [
            { axis: 'x', direction: new THREE.Vector3(1, 0, 0), label: 'X' },
            { axis: 'y', direction: new THREE.Vector3(0, 1, 0), label: 'Y' },
            { axis: 'z', direction: new THREE.Vector3(0, 0, 1), label: 'Z' }
        ];

        axes.forEach(({ axis, direction, label }) => {
            // Create line
            const lineGeometry = new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(0, 0, 0),
                direction.clone().multiplyScalar(axisLength)
            ]);

            const lineMaterial = new THREE.LineBasicMaterial({
                color: 0xffffff,
                linewidth: lineWidth,
                transparent: true,
                opacity: 0.8
            });

            const line = new THREE.Line(lineGeometry, lineMaterial);
            this.axisGroup.add(line);

            // Create sphere at endpoint
            const sphereGeometry = new THREE.SphereGeometry(sphereRadius, 16, 16);
            const sphereMaterial = new THREE.MeshBasicMaterial({
                color: 0xffffff,
                transparent: true,
                opacity: 0.9
            });

            const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
            sphere.position.copy(direction.clone().multiplyScalar(axisLength));
            this.axisGroup.add(sphere);

            // Create text label using canvas texture
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.width = 64;
            canvas.height = 64;

            context.fillStyle = 'white';
            context.font = 'bold 48px Arial';
            context.textAlign = 'center';
            context.textBaseline = 'middle';
            context.fillText(label, 32, 32);

            const texture = new THREE.CanvasTexture(canvas);
            const spriteMaterial = new THREE.SpriteMaterial({
                map: texture,
                transparent: true,
                opacity: 0.9
            });

            const sprite = new THREE.Sprite(spriteMaterial);
            sprite.scale.set(0.4, 0.4, 1);
            sprite.position.copy(direction.clone().multiplyScalar(axisLength + 0.3));
            this.axisGroup.add(sprite);
        });
    }

    /**
     * Update gizmo orientation to match main camera view
     * @param {THREE.Camera} mainCamera - The main scene camera
     */
    updateOrientation(mainCamera) {
        if (!mainCamera || !this.axisGroup) return;

        // Use inverse of camera rotation so gizmo shows what camera is looking at
        // (not the camera's rotation itself)
        this.axisGroup.quaternion.copy(mainCamera.quaternion).invert();

        this.render();
    }

    render() {
        if (!this.renderer || !this.scene || !this.camera) return;
        this.renderer.render(this.scene, this.camera);
    }

    dispose() {
        if (this.renderer) {
            this.renderer.dispose();
        }

        if (this.container && this.container.firstChild) {
            this.container.removeChild(this.container.firstChild);
        }
    }
}

// Make globally available
window.AxisGizmo = AxisGizmo;
