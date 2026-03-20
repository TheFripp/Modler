import * as THREE from 'three';
/**
 * AxisGizmo - 3D Orientation Indicator
 *
 * Displays a small 3D axis visualization in the top-right corner that rotates
 * with the main camera to show current orientation. Features three axes (X, Y, Z)
 * with labeled circles that move along the edge of a background circle.
 */

class AxisGizmo {
    constructor(containerElement) {
        this.container = containerElement;
        this.size = 48; // Match toolbar button size

        // Create separate renderer, scene, and camera for the gizmo
        this.renderer = null;
        this.scene = null;
        this.camera = null;
        this.axisGroup = null;
        this.backgroundCircle = null;
        this.axisLines = [];
        this.axisSprites = [];

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
        const frustumSize = 1.5;
        this.camera = new THREE.OrthographicCamera(
            -frustumSize, frustumSize,
            frustumSize, -frustumSize,
            0.1, 100
        );
        this.camera.position.set(0, 0, 10);
        this.camera.lookAt(0, 0, 0);

        // Create background circle (matches toolbar styling)
        this.createBackgroundCircle();

        // Create axis group
        this.axisGroup = new THREE.Group();
        this.scene.add(this.axisGroup);

        this.createAxes();
        this.render();
    }

    createBackgroundCircle() {
        // Background circle removed - colored circles will be on outer edge only
        // No inner circle line needed
    }

    createAxes() {
        const circleRadius = 1.2; // Outer edge position
        const endCircleRadius = 0.5; // 12px diameter circles (larger for readability)
        const lineWidth = 2;

        // Define axes with their directions, labels, and colors (line and circle colors match)
        const axes = [
            { axis: 'x', direction: new THREE.Vector3(1, 0, 0), label: 'X', lineColor: 0xff6b6b, circleColor: 0xff6b6b }, // Red line, red circle
            { axis: 'y', direction: new THREE.Vector3(0, 1, 0), label: 'Y', lineColor: 0x6bff6b, circleColor: 0x6bff6b }, // Green line, green circle
            { axis: 'z', direction: new THREE.Vector3(0, 0, 1), label: 'Z', lineColor: 0x6b6bff, circleColor: 0x6b6bff }  // Blue line, blue circle
        ];

        axes.forEach(({ axis, direction, label, lineColor, circleColor }) => {
            // Calculate endpoint position on the circle edge
            const endPoint = direction.clone().multiplyScalar(circleRadius);

            // Create line from origin to circle edge (will be updated dynamically)
            const lineGeometry = new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(0, 0, 0),
                endPoint
            ]);

            const lineMaterial = new THREE.LineBasicMaterial({
                color: lineColor,
                linewidth: lineWidth,
                transparent: true,
                opacity: 0.8
            });

            const line = new THREE.Line(lineGeometry, lineMaterial);
            line.userData.direction = direction.clone();
            line.userData.circleRadius = circleRadius;
            this.axisGroup.add(line);
            this.axisLines.push(line);

            // Create filled circle at endpoint (on the edge of background circle)
            // Use sprite so it always faces the camera
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            const canvasSize = 256;
            canvas.width = canvasSize;
            canvas.height = canvasSize;

            // Draw colored circle background
            const centerX = canvasSize / 2;
            const centerY = canvasSize / 2;
            const radius = canvasSize / 2 - 4; // Leave small margin

            context.fillStyle = '#' + circleColor.toString(16).padStart(6, '0');
            context.beginPath();
            context.arc(centerX, centerY, radius, 0, Math.PI * 2);
            context.fill();

            // Draw text label
            context.fillStyle = '#1a1a1a'; // Dark text for contrast
            context.font = 'bold 140px Arial';
            context.textAlign = 'center';
            context.textBaseline = 'middle';
            context.fillText(label, centerX, centerY);

            const texture = new THREE.CanvasTexture(canvas);
            const spriteMaterial = new THREE.SpriteMaterial({
                map: texture,
                transparent: true,
                opacity: 1.0
            });

            const sprite = new THREE.Sprite(spriteMaterial);
            sprite.scale.set(endCircleRadius * 2, endCircleRadius * 2, 1);
            sprite.position.copy(endPoint);
            sprite.userData.direction = direction.clone();
            sprite.userData.circleRadius = circleRadius;
            this.axisGroup.add(sprite);
            this.axisSprites.push(sprite);
        });
    }

    /**
     * Update gizmo orientation to match main camera view
     * @param {THREE.Camera} mainCamera - The main scene camera
     */
    updateOrientation(mainCamera) {
        if (!mainCamera || !this.axisGroup) return;

        // Use inverse of camera rotation so gizmo shows what camera is looking at
        this.axisGroup.quaternion.copy(mainCamera.quaternion).invert();

        // Update sprite positions to stay on the circle edge
        // This ensures circles are always positioned on the background circle line
        this.axisSprites.forEach((sprite, index) => {
            // Get the rotated direction vector
            const direction = sprite.userData.direction.clone();
            direction.applyQuaternion(this.axisGroup.quaternion);

            // Project to 2D plane (XY) and normalize to circle radius
            const projected2D = new THREE.Vector2(direction.x, direction.y);
            const length2D = projected2D.length();

            if (length2D > 0.001) {
                // Normalize and scale to circle radius
                projected2D.normalize().multiplyScalar(sprite.userData.circleRadius);

                // Update position to be on the circle edge in 2D
                sprite.position.set(projected2D.x, projected2D.y, 0);

                // Update corresponding line to match
                const line = this.axisLines[index];
                const positions = line.geometry.attributes.position.array;
                positions[3] = projected2D.x; // endpoint x
                positions[4] = projected2D.y; // endpoint y
                positions[5] = 0; // endpoint z
                line.geometry.attributes.position.needsUpdate = true;
            }
        });

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
