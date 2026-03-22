import * as THREE from 'three';
import { LineSegments2 } from 'three/lines/LineSegments2';
import { LineSegmentsGeometry } from 'three/lines/LineSegmentsGeometry';
/**
 * Tool Gizmo Manager
 * Centralized visual aid system for tools — arrows, circles, and rotation indicators.
 * All gizmos use unified wireframe line style via LineSegments2 + LineMaterial.
 * Screen-space sized: gizmos maintain constant apparent size regardless of zoom.
 * Color and line width configurable via visual.gizmo.color / visual.gizmo.lineWidth settings.
 * Tools access via BaseTool.toolGizmoManager getter.
 */

class ToolGizmoManager {
    // Screen-space scale factor (gizmo world size = cameraDistance * factor)
    static SCREEN_SCALE_FACTOR = 0.012;

    constructor(scene, camera, materialManager) {
        this.scene = scene;
        this.camera = camera;

        // Get shared gizmo material from MaterialManager
        this._material = materialManager.createToolGizmoLineMaterial();

        // Reusable math objects (avoid GC during drag)
        this._upVector = new THREE.Vector3(0, 1, 0);
        this._tempQuaternion = new THREE.Quaternion();
        this._tempVector = new THREE.Vector3();

        // Pre-create all gizmos (hidden)
        this._arrowGroup = this._createArrowGizmo();
        this._circleGroup = this._createCircleGizmo();
        this._rotationArcGroup = this._createRotationArcGizmo();

        // Add to scene (hidden by default)
        this.scene.add(this._arrowGroup);
        this.scene.add(this._circleGroup);
        this.scene.add(this._rotationArcGroup);
    }

    // --- Private: Screen-space scaling ---

    _getScreenSpaceScale(worldPosition) {
        return this.camera.position.distanceTo(worldPosition) * ToolGizmoManager.SCREEN_SCALE_FACTOR;
    }

    // --- Private: Gizmo creation ---

    _createArrowGizmo() {
        const group = new THREE.Group();
        group.visible = false;

        // Arrow pointing along +Y: shaft line + V-shaped head in two planes
        // All coordinates in unit space, scaled by screen-space factor at show time
        const positions = [
            // Shaft
            0, 0, 0,   0, 0.7, 0,
            // Head — XY plane
            -0.15, 0.65, 0,   0, 1.0, 0,
            0, 1.0, 0,   0.15, 0.65, 0,
            // Head — ZY plane (cross for 3D visibility)
            0, 0.65, -0.15,   0, 1.0, 0,
            0, 1.0, 0,   0, 0.65, 0.15
        ];

        const geometry = new LineSegmentsGeometry();
        geometry.setPositions(positions);

        const lines = new LineSegments2(geometry, this._material);
        lines.renderOrder = 1000;
        lines.raycast = () => {};
        lines.computeLineDistances();
        group.add(lines);

        group.renderOrder = 1000;
        group.traverse(child => { child.raycast = () => {}; });

        return group;
    }

    _createCircleGizmo() {
        const group = new THREE.Group();
        group.visible = false;

        // Circle as line segments in XY plane, unit radius
        const segments = 32;
        const positions = [];
        for (let i = 0; i < segments; i++) {
            const a0 = (i / segments) * Math.PI * 2;
            const a1 = ((i + 1) / segments) * Math.PI * 2;
            positions.push(
                Math.cos(a0), Math.sin(a0), 0,
                Math.cos(a1), Math.sin(a1), 0
            );
        }

        const geometry = new LineSegmentsGeometry();
        geometry.setPositions(positions);

        const lines = new LineSegments2(geometry, this._material);
        lines.renderOrder = 1000;
        lines.raycast = () => {};
        lines.computeLineDistances();
        group.add(lines);

        group.renderOrder = 1000;
        group.traverse(child => { child.raycast = () => {}; });

        return group;
    }

    _createRotationArcGizmo() {
        const group = new THREE.Group();
        group.visible = false;

        // Ring — 64 line segments forming a circle, unit radius
        const segments = 64;
        const ringPositions = [];
        for (let i = 0; i < segments; i++) {
            const a0 = (i / segments) * Math.PI * 2;
            const a1 = ((i + 1) / segments) * Math.PI * 2;
            ringPositions.push(
                Math.cos(a0), Math.sin(a0), 0,
                Math.cos(a1), Math.sin(a1), 0
            );
        }

        const ringGeometry = new LineSegmentsGeometry();
        ringGeometry.setPositions(ringPositions);

        const ring = new LineSegments2(ringGeometry, this._material);
        ring.renderOrder = 1000;
        ring.raycast = () => {};
        ring.computeLineDistances();
        group.add(ring);

        // Pivot crosshair — 3 perpendicular line segments at origin
        // Placed in a sub-group so it can be independently scaled for screen-space sizing
        this._pivotGroup = new THREE.Group();
        const crossSize = 0.5;
        const crossPositions = [
            -crossSize, 0, 0,   crossSize, 0, 0,
            0, -crossSize, 0,   0, crossSize, 0,
            0, 0, -crossSize,   0, 0, crossSize
        ];

        const crossGeometry = new LineSegmentsGeometry();
        crossGeometry.setPositions(crossPositions);

        const cross = new LineSegments2(crossGeometry, this._material);
        cross.renderOrder = 1000;
        cross.raycast = () => {};
        cross.computeLineDistances();
        this._pivotGroup.add(cross);

        this._pivotGroup.renderOrder = 1000;
        group.add(this._pivotGroup);

        group.renderOrder = 1000;
        group.traverse(child => { child.raycast = () => {}; });

        return group;
    }

    // --- Private: Orientation helpers ---

    _orientToDirection(object, direction) {
        this._tempQuaternion.setFromUnitVectors(this._upVector, this._tempVector.copy(direction).normalize());
        object.quaternion.copy(this._tempQuaternion);
    }

    _orientToNormal(object, normal) {
        // Geometry lies in XY plane (normal is +Z); rotate so its normal aligns with target
        const zAxis = this._tempVector.set(0, 0, 1);
        this._tempQuaternion.setFromUnitVectors(zAxis, normal);
        object.quaternion.copy(this._tempQuaternion);
    }

    // --- Public API ---

    showArrow(position, direction) {
        this._arrowGroup.visible = true;
        this._arrowGroup.position.copy(position).addScaledVector(direction, 0.005);
        this._orientToDirection(this._arrowGroup, direction);
        this._arrowGroup.scale.setScalar(this._getScreenSpaceScale(position));
        this._requestRender();
    }

    updateArrow(position, direction) {
        if (!this._arrowGroup.visible) return;
        this._arrowGroup.position.copy(position);
        if (direction) {
            this._arrowGroup.position.addScaledVector(direction, 0.005);
            this._orientToDirection(this._arrowGroup, direction);
        }
        this._arrowGroup.scale.setScalar(this._getScreenSpaceScale(this._arrowGroup.position));
        this._requestRender();
    }

    showCircle(position, normal) {
        this._circleGroup.visible = true;
        this._circleGroup.position.copy(position);
        this._circleGroup.scale.setScalar(this._getScreenSpaceScale(position) * 0.3);
        if (normal) {
            this._orientToNormal(this._circleGroup, normal);
        } else {
            this._circleGroup.lookAt(this.camera.position);
        }
        this._requestRender();
    }

    updateCircle(position, normal) {
        if (!this._circleGroup.visible) return;
        this._circleGroup.position.copy(position);
        this._circleGroup.scale.setScalar(this._getScreenSpaceScale(position) * 0.3);
        if (normal) {
            this._orientToNormal(this._circleGroup, normal);
        } else {
            this._circleGroup.lookAt(this.camera.position);
        }
        this._requestRender();
    }

    showRotationArc(position, normal, radius = 0.1) {
        this._rotationArcGroup.visible = true;
        this._rotationArcGroup.position.copy(position);
        // Use provided radius for object-relative sizing
        this._rotationArcGroup.scale.setScalar(radius);
        // Scale pivot crosshair to constant screen-space size, independent of arc radius
        const screenScale = this._getScreenSpaceScale(position);
        this._pivotGroup.scale.setScalar(screenScale / radius);
        if (normal) {
            this._orientToNormal(this._rotationArcGroup, normal);
        }
        this._requestRender();
    }

    updateRotationArc(position, normal, radius) {
        if (!this._rotationArcGroup.visible) return;
        this._rotationArcGroup.position.copy(position);
        if (radius !== undefined) {
            this._rotationArcGroup.scale.setScalar(radius);
            const screenScale = this._getScreenSpaceScale(position);
            this._pivotGroup.scale.setScalar(screenScale / radius);
        }
        if (normal) {
            this._orientToNormal(this._rotationArcGroup, normal);
        }
        this._requestRender();
    }

    hide(type) {
        if (type === 'arrow') this._arrowGroup.visible = false;
        else if (type === 'circle') this._circleGroup.visible = false;
        else if (type === 'rotation-arc') this._rotationArcGroup.visible = false;
        this._requestRender();
    }

    hideAll() {
        this._arrowGroup.visible = false;
        this._circleGroup.visible = false;
        this._rotationArcGroup.visible = false;
        this._requestRender();
    }

    // --- Public accessors (avoid direct private field access from tools) ---

    isArrowVisible() {
        return this._arrowGroup.visible;
    }

    getArrowPosition() {
        return this._arrowGroup.position.clone();
    }

    // --- Anchor point detection ---
    // Centralized corner/anchor detection for any tool.
    // Returns visible box corners within a screen-space pixel radius.

    /**
     * Find the nearest visible corner of an object within screen-space threshold.
     * Only returns corners on camera-facing surfaces.
     * @param {THREE.Object3D} object - Mesh to detect corners on
     * @param {THREE.Vector2} mouseNDC - Mouse position in NDC (-1 to 1)
     * @param {HTMLCanvasElement} canvas - Renderer canvas for pixel conversion
     * @param {number} threshold - Screen-space pixel radius (default 16)
     * @returns {{ worldPos: THREE.Vector3, screenPos: THREE.Vector2, index: number }|null}
     */
    findNearestVisibleCorner(object, mouseNDC, canvas, threshold = 16) {
        if (!object?.geometry || !this.camera) return null;

        const geometry = object.geometry;
        geometry.computeBoundingBox();
        const box = geometry.boundingBox;
        if (!box) return null;

        // Camera direction in object's local space for face visibility
        const objectCenter = object.getWorldPosition(this._tempVector.set(0, 0, 0));
        const cameraDir = objectCenter.clone().sub(this.camera.position).normalize();
        const invMatrix = new THREE.Matrix4().copy(object.matrixWorld).invert();
        const localCameraDir = cameraDir.transformDirection(invMatrix);

        // Which faces are visible (outward normal dot camera dir < 0)
        const vf = {
            pX: localCameraDir.x < 0, nX: localCameraDir.x > 0,
            pY: localCameraDir.y < 0, nY: localCameraDir.y > 0,
            pZ: localCameraDir.z < 0, nZ: localCameraDir.z > 0
        };

        // Each corner's 3 adjacent faces: [xFace, yFace, zFace]
        const cornerVisible = [
            vf.nX || vf.nY || vf.nZ,  // 0: min,min,min
            vf.pX || vf.nY || vf.nZ,  // 1: max,min,min
            vf.nX || vf.pY || vf.nZ,  // 2: min,max,min
            vf.pX || vf.pY || vf.nZ,  // 3: max,max,min
            vf.nX || vf.nY || vf.pZ,  // 4: min,min,max
            vf.pX || vf.nY || vf.pZ,  // 5: max,min,max
            vf.nX || vf.pY || vf.pZ,  // 6: min,max,max
            vf.pX || vf.pY || vf.pZ   // 7: max,max,max
        ];

        const corners = [
            new THREE.Vector3(box.min.x, box.min.y, box.min.z),
            new THREE.Vector3(box.max.x, box.min.y, box.min.z),
            new THREE.Vector3(box.min.x, box.max.y, box.min.z),
            new THREE.Vector3(box.max.x, box.max.y, box.min.z),
            new THREE.Vector3(box.min.x, box.min.y, box.max.z),
            new THREE.Vector3(box.max.x, box.min.y, box.max.z),
            new THREE.Vector3(box.min.x, box.max.y, box.max.z),
            new THREE.Vector3(box.max.x, box.max.y, box.max.z)
        ];

        const rect = canvas.getBoundingClientRect();
        const mousePixel = window.CameraMathUtils.ndcToPixel(mouseNDC.x, mouseNDC.y, rect.width, rect.height);

        let nearest = null;
        let nearestDist = threshold;

        for (let i = 0; i < 8; i++) {
            if (!cornerVisible[i]) continue;

            const worldPos = corners[i].applyMatrix4(object.matrixWorld);
            const screenNDC = window.CameraMathUtils.worldToScreenNDC(worldPos, this.camera);
            const screenPixel = window.CameraMathUtils.ndcToPixel(screenNDC.x, screenNDC.y, rect.width, rect.height);

            const dx = screenPixel.x - mousePixel.x;
            const dy = screenPixel.y - mousePixel.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < nearestDist) {
                nearestDist = dist;
                nearest = { worldPos: worldPos.clone(), screenPos: screenPixel, index: i };
            }
        }

        return nearest;
    }

    /**
     * Show circle gizmo at an anchor point (screen-space scaled automatically).
     * @param {THREE.Vector3} worldPos - Anchor world position
     */
    showAnchorPoint(worldPos) {
        this.showCircle(worldPos, null);
    }

    // --- Lifecycle ---

    _requestRender() {
        window.modlerComponents?.sceneFoundation?.requestRender();
    }

    dispose() {
        this.scene.remove(this._arrowGroup);
        this.scene.remove(this._circleGroup);
        this.scene.remove(this._rotationArcGroup);

        [this._arrowGroup, this._circleGroup, this._rotationArcGroup].forEach(group => {
            group.traverse(child => {
                if (child.geometry) child.geometry.dispose();
                // Shared material owned by MaterialManager — don't dispose here
            });
        });
    }
}

window.ToolGizmoManager = ToolGizmoManager;
