import * as THREE from 'three';
/**
 * Tool Gizmo Manager
 * Centralized visual aid system for tools — arrows, circles, and future gizmo types.
 * Pre-creates meshes once, shows/hides via visibility toggle.
 * Tools access via BaseTool.toolGizmoManager getter.
 */

class ToolGizmoManager {
    constructor(scene, camera) {
        this.scene = scene;
        this.camera = camera;

        // Reusable math objects (avoid GC during drag)
        this._upVector = new THREE.Vector3(0, 1, 0);
        this._tempQuaternion = new THREE.Quaternion();
        this._tempVector = new THREE.Vector3();

        // Pre-create all gizmos (hidden)
        this._arrowGroup = this._createArrowGizmo();
        this._circleMesh = this._createCircleGizmo();

        // Add to scene (hidden by default)
        this.scene.add(this._arrowGroup);
        this.scene.add(this._circleMesh);
    }

    // --- Private: Gizmo creation ---

    _createArrowGizmo() {
        const group = new THREE.Group();
        group.visible = false;

        const material = new THREE.MeshBasicMaterial({
            color: 0xff6600,
            opacity: 0.9,
            transparent: true,
            depthTest: false,
            depthWrite: false
        });

        // Shaft — thin cylinder along +Y
        const shaftGeometry = new THREE.CylinderGeometry(0.006, 0.006, 0.15, 8);
        shaftGeometry.translate(0, 0.075, 0); // bottom at origin
        const shaft = new THREE.Mesh(shaftGeometry, material);
        group.add(shaft);

        // Head — cone at top of shaft
        const headGeometry = new THREE.ConeGeometry(0.025, 0.06, 12);
        headGeometry.translate(0, 0.15 + 0.03, 0); // sit on top of shaft
        const head = new THREE.Mesh(headGeometry, material);
        group.add(head);

        // Non-raycastable
        group.traverse(child => { child.raycast = () => {}; });

        // Render on top
        group.renderOrder = 1000;
        group.traverse(child => {
            if (child.isMesh) child.renderOrder = 1000;
        });

        return group;
    }

    _createCircleGizmo() {
        const geometry = new THREE.RingGeometry(0.02, 0.04, 32);
        const material = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            opacity: 0.8,
            transparent: true,
            depthTest: false,
            depthWrite: false,
            side: THREE.DoubleSide
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.visible = false;
        mesh.renderOrder = 1000;
        mesh.raycast = () => {};

        return mesh;
    }

    // --- Private: Orientation helpers ---

    _orientToDirection(object, direction) {
        this._tempQuaternion.setFromUnitVectors(this._upVector, this._tempVector.copy(direction).normalize());
        object.quaternion.copy(this._tempQuaternion);
    }

    _orientToNormal(object, normal) {
        // Ring lies in XY plane by default; rotate so its normal aligns with the given direction
        // RingGeometry normal is +Z, so we rotate from +Z to the target normal
        const zAxis = this._tempVector.set(0, 0, 1);
        this._tempQuaternion.setFromUnitVectors(zAxis, normal);
        object.quaternion.copy(this._tempQuaternion);
    }

    // --- Public API ---

    showArrow(position, direction) {
        this._arrowGroup.visible = true;
        // Small offset along normal to avoid z-fighting
        this._arrowGroup.position.copy(position).addScaledVector(direction, 0.005);
        this._orientToDirection(this._arrowGroup, direction);
        this._requestRender();
    }

    updateArrow(position, direction) {
        if (!this._arrowGroup.visible) return;
        this._arrowGroup.position.copy(position);
        if (direction) {
            this._arrowGroup.position.addScaledVector(direction, 0.005);
            this._orientToDirection(this._arrowGroup, direction);
        }
        this._requestRender();
    }

    showCircle(position, normal) {
        this._circleMesh.visible = true;
        this._circleMesh.position.copy(position);
        if (normal) {
            this._orientToNormal(this._circleMesh, normal);
        } else {
            // Billboard: face the camera
            this._circleMesh.lookAt(this.camera.position);
        }
        this._requestRender();
    }

    updateCircle(position, normal) {
        if (!this._circleMesh.visible) return;
        this._circleMesh.position.copy(position);
        if (normal) {
            this._orientToNormal(this._circleMesh, normal);
        } else {
            this._circleMesh.lookAt(this.camera.position);
        }
        this._requestRender();
    }

    hide(type) {
        if (type === 'arrow') this._arrowGroup.visible = false;
        else if (type === 'circle') this._circleMesh.visible = false;
        this._requestRender();
    }

    hideAll() {
        this._arrowGroup.visible = false;
        this._circleMesh.visible = false;
        this._requestRender();
    }

    // --- Lifecycle ---

    _requestRender() {
        window.modlerComponents?.sceneFoundation?.requestRender();
    }

    dispose() {
        this.scene.remove(this._arrowGroup);
        this.scene.remove(this._circleMesh);

        this._arrowGroup.traverse(child => {
            if (child.isMesh) {
                child.geometry.dispose();
                child.material.dispose();
            }
        });
        this._circleMesh.geometry.dispose();
        this._circleMesh.material.dispose();
    }
}

window.ToolGizmoManager = ToolGizmoManager;
