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
    static SCREEN_SCALE_FACTOR = 0.024;

    // Industry-standard axis colors: Red=X, Green=Y, Blue=Z
    static AXIS_COLORS = { x: 0xE74C3C, y: 0x2ECC71, z: 0x3498DB };

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
        this._quickRotateArcGroup = this._createQuickRotateArcGizmo();

        // Add to scene (hidden by default)
        this.scene.add(this._arrowGroup);
        this.scene.add(this._circleGroup);
        this.scene.add(this._rotationArcGroup);
        this.scene.add(this._quickRotateArcGroup);
    }

    // --- Private: Screen-space scaling ---

    _getScreenSpaceScale(worldPosition) {
        return this.camera.position.distanceTo(worldPosition) * ToolGizmoManager.SCREEN_SCALE_FACTOR;
    }

    _setAxisColor(directionOrNormal) {
        const ax = Math.abs(directionOrNormal.x), ay = Math.abs(directionOrNormal.y), az = Math.abs(directionOrNormal.z);
        const axis = (ax >= ay && ax >= az) ? 'x' : (ay >= ax && ay >= az) ? 'y' : 'z';
        this._material.color.setHex(ToolGizmoManager.AXIS_COLORS[axis]);
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

        // Circle as line segments in XY plane, radius 0.3
        // Radius baked into geometry so group scales at same factor as other gizmos
        const segments = 32;
        const r = 0.3;
        const positions = [];
        for (let i = 0; i < segments; i++) {
            const a0 = (i / segments) * Math.PI * 2;
            const a1 = ((i + 1) / segments) * Math.PI * 2;
            positions.push(
                Math.cos(a0) * r, Math.sin(a0) * r, 0,
                Math.cos(a1) * r, Math.sin(a1) * r, 0
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

        // Arc — ~300° from 30° to 330°, gap at top indicates rotation direction
        const segments = 54;
        const startAngle = (30 * Math.PI) / 180;
        const endAngle = (330 * Math.PI) / 180;
        const arcSpan = endAngle - startAngle;

        const arcPositions = [];
        for (let i = 0; i < segments; i++) {
            const a0 = startAngle + (i / segments) * arcSpan;
            const a1 = startAngle + ((i + 1) / segments) * arcSpan;
            arcPositions.push(
                Math.cos(a0), Math.sin(a0), 0,
                Math.cos(a1), Math.sin(a1), 0
            );
        }

        // Arrowhead at arc end (330°), tangent to arc
        const tipX = Math.cos(endAngle);
        const tipY = Math.sin(endAngle);
        // Tangent at tip: (-sin θ, cos θ) — counterclockwise direction
        const tanX = -Math.sin(endAngle);
        const tanY = Math.cos(endAngle);
        // Radial normal at tip: (cos θ, sin θ)
        const normX = Math.cos(endAngle);
        const normY = Math.sin(endAngle);

        const headLength = 0.15;
        const headWidth = 0.08;
        // Step back along negative tangent for wing base
        const baseX = tipX - tanX * headLength;
        const baseY = tipY - tanY * headLength;
        arcPositions.push(
            baseX + normX * headWidth, baseY + normY * headWidth, 0,  tipX, tipY, 0,
            tipX, tipY, 0,  baseX - normX * headWidth, baseY - normY * headWidth, 0
        );

        const arcGeometry = new LineSegmentsGeometry();
        arcGeometry.setPositions(arcPositions);

        const arc = new LineSegments2(arcGeometry, this._material);
        arc.renderOrder = 1000;
        arc.raycast = () => {};
        arc.computeLineDistances();
        group.add(arc);

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

    _createQuickRotateArcGizmo() {
        const group = new THREE.Group();
        group.visible = false;

        // 90° arc starting at face center, dropping down then curving outward (CCW visual)
        // Local +X = face outward direction, local +Y = toward-floor direction
        // Arc center at (R, 0, 0), radius R
        // Sweep CW from θ=π to θ=π/2: start (0,0) → end (R,R)
        // Initial tangent = (0,1) = downward, arc curves away from face
        const segments = 16;
        const R = 1;
        const positions = [];
        for (let i = 0; i < segments; i++) {
            const a0 = Math.PI - (i / segments) * (Math.PI / 2);
            const a1 = Math.PI - ((i + 1) / segments) * (Math.PI / 2);
            positions.push(
                R + R * Math.cos(a0), R * Math.sin(a0), 0,
                R + R * Math.cos(a1), R * Math.sin(a1), 0
            );
        }

        // Arrowhead at end (R, R, 0), pointing downward (+Y)
        const tipX = R;
        const tipY = R;
        const headLength = 0.15;
        const headWidth = 0.08;
        positions.push(
            tipX - headWidth, tipY - headLength, 0,  tipX, tipY, 0,
            tipX, tipY, 0,  tipX + headWidth, tipY - headLength, 0
        );

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

    _orientQuickRotateArc(object, faceNormal) {
        // Map local +X → face outward, local +Y → toward floor, local +Z → rotation axis
        const down = new THREE.Vector3(0, -1, 0);
        const basisX = this._tempVector.copy(faceNormal).normalize();
        const basisZ = new THREE.Vector3().crossVectors(basisX, down).normalize();
        const basisY = new THREE.Vector3().crossVectors(basisZ, basisX).normalize();
        const m = new THREE.Matrix4().makeBasis(basisX, basisY, basisZ);
        object.quaternion.setFromRotationMatrix(m);
    }

    // --- Public API ---

    showArrow(position, direction) {
        this._arrowGroup.visible = true;
        this._arrowGroup.position.copy(position).addScaledVector(direction, 0.005);
        this._orientToDirection(this._arrowGroup, direction);
        this._arrowGroup.scale.setScalar(this._getScreenSpaceScale(position) * 2);
        this._setAxisColor(direction);
        this._requestRender();
    }

    updateArrow(position, direction) {
        if (!this._arrowGroup.visible) return;
        this._arrowGroup.position.copy(position);
        if (direction) {
            this._arrowGroup.position.addScaledVector(direction, 0.005);
            this._orientToDirection(this._arrowGroup, direction);
        }
        this._arrowGroup.scale.setScalar(this._getScreenSpaceScale(this._arrowGroup.position) * 2);
        this._requestRender();
    }

    showCircle(position, normal) {
        this._circleGroup.visible = true;
        this._circleGroup.position.copy(position);
        this._circleGroup.scale.setScalar(this._getScreenSpaceScale(position));
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
        this._circleGroup.scale.setScalar(this._getScreenSpaceScale(position));
        if (normal) {
            this._orientToNormal(this._circleGroup, normal);
        } else {
            this._circleGroup.lookAt(this.camera.position);
        }
        this._requestRender();
    }

    showRotationArc(position, normal) {
        this._rotationArcGroup.visible = true;
        this._rotationArcGroup.position.copy(position);
        this._rotationArcGroup.scale.setScalar(this._getScreenSpaceScale(position) * 2);
        this._pivotGroup.scale.setScalar(1);
        if (normal) {
            this._orientToNormal(this._rotationArcGroup, normal);
            this._setAxisColor(normal);
        } else {
            this._rotationArcGroup.lookAt(this.camera.position);
        }
        this._requestRender();
    }

    updateRotationArc(position, normal) {
        if (!this._rotationArcGroup.visible) return;
        this._rotationArcGroup.position.copy(position);
        this._rotationArcGroup.scale.setScalar(this._getScreenSpaceScale(position) * 2);
        this._pivotGroup.scale.setScalar(1);
        if (normal) {
            this._orientToNormal(this._rotationArcGroup, normal);
        } else {
            this._rotationArcGroup.lookAt(this.camera.position);
        }
        this._requestRender();
    }

    showQuickRotateArc(position, faceNormal) {
        this._quickRotateArcGroup.visible = true;
        this._quickRotateArcGroup.position.copy(position);
        this._quickRotateArcGroup.scale.setScalar(this._getScreenSpaceScale(position) * 2);
        this._orientQuickRotateArc(this._quickRotateArcGroup, faceNormal);
        // Color by rotation axis (cross of faceNormal and down)
        const rotAxis = new THREE.Vector3().crossVectors(faceNormal, new THREE.Vector3(0, -1, 0));
        this._setAxisColor(rotAxis);
        this._requestRender();
    }

    hide(type) {
        if (type === 'arrow') this._arrowGroup.visible = false;
        else if (type === 'circle') this._circleGroup.visible = false;
        else if (type === 'rotation-arc') this._rotationArcGroup.visible = false;
        else if (type === 'quick-rotate-arc') this._quickRotateArcGroup.visible = false;
        this._requestRender();
    }

    hideAll() {
        this._arrowGroup.visible = false;
        this._circleGroup.visible = false;
        this._rotationArcGroup.visible = false;
        this._quickRotateArcGroup.visible = false;
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
    // Centralized anchor detection for any tool.
    // Returns visible corners (and optionally edge midpoints) within a screen-space pixel radius.

    /**
     * Backward-compat wrapper — calls findNearestAnchorPoint with corners only.
     */
    findNearestVisibleCorner(object, mouseNDC, canvas, threshold = 16) {
        return this.findNearestAnchorPoint(object, mouseNDC, canvas, { threshold });
    }

    /**
     * Find the nearest anchor point (corner or edge midpoint) on an object.
     * Supports camera-visibility mode and face-constrained mode.
     * @param {THREE.Object3D} object - Mesh to detect anchors on
     * @param {THREE.Vector2} mouseNDC - Mouse position in NDC (-1 to 1)
     * @param {HTMLCanvasElement} canvas - Renderer canvas for pixel conversion
     * @param {Object} options
     * @param {number} [options.threshold=16] - Screen-space pixel radius
     * @param {boolean} [options.includeEdgeMidpoints=false] - Include edge midpoints as candidates
     * @param {THREE.Vector3} [options.faceNormal=null] - Constrain to a specific face
     * @returns {{ worldPos: THREE.Vector3, screenPos: THREE.Vector2, index: number }|null}
     */
    findNearestAnchorPoint(object, mouseNDC, canvas, options = {}) {
        const { threshold = 16, includeEdgeMidpoints = false, faceNormal = null } = options;

        // Handle containers (use interactiveMesh for reliable bbox)
        const geomSource = object?.userData?.supportMeshes?.interactiveMesh || object;
        if (!geomSource?.geometry || !this.camera) return null;

        const geometry = geomSource.geometry;
        geometry.computeBoundingBox();
        const box = geometry.boundingBox;
        if (!box) return null;

        // Build candidate list based on mode
        const candidates = faceNormal
            ? this._getFaceCandidates(box, faceNormal, includeEdgeMidpoints)
            : this._getVisibleCandidates(box, geomSource, includeEdgeMidpoints);

        // Project to screen space and find nearest
        const rect = canvas.getBoundingClientRect();
        const mousePixel = window.CameraMathUtils.ndcToPixel(mouseNDC.x, mouseNDC.y, rect.width, rect.height);

        let nearest = null;
        let nearestDist = threshold;

        for (let i = 0; i < candidates.length; i++) {
            const worldPos = candidates[i].applyMatrix4(geomSource.matrixWorld);
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
     * Get visible candidates based on camera direction.
     * @private
     */
    _getVisibleCandidates(box, geomSource, includeEdgeMidpoints) {
        // Camera direction in object's local space
        const objectCenter = geomSource.getWorldPosition(this._tempVector.set(0, 0, 0));
        const cameraDir = objectCenter.clone().sub(this.camera.position).normalize();
        const invMatrix = new THREE.Matrix4().copy(geomSource.matrixWorld).invert();
        const localCameraDir = cameraDir.transformDirection(invMatrix);

        // Which faces are visible (outward normal dot camera dir < 0)
        const vf = {
            pX: localCameraDir.x < 0, nX: localCameraDir.x > 0,
            pY: localCameraDir.y < 0, nY: localCameraDir.y > 0,
            pZ: localCameraDir.z < 0, nZ: localCameraDir.z > 0
        };

        // Corner visibility (visible if any adjacent face is visible)
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

        const candidates = [];
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

        for (let i = 0; i < 8; i++) {
            if (cornerVisible[i]) candidates.push(corners[i]);
        }

        if (includeEdgeMidpoints) {
            // 12 edges: [cornerA, cornerB, adjacentFace1, adjacentFace2]
            const edges = [
                [0,1,'nY','nZ'], [0,4,'nY','nX'], [1,5,'nY','pX'], [4,5,'nY','pZ'],
                [2,3,'pY','nZ'], [2,6,'pY','nX'], [3,7,'pY','pX'], [6,7,'pY','pZ'],
                [0,2,'nX','nZ'], [1,3,'pX','nZ'], [4,6,'nX','pZ'], [5,7,'pX','pZ']
            ];
            for (const [a, b, f1, f2] of edges) {
                if (vf[f1] || vf[f2]) {
                    candidates.push(corners[a].clone().add(corners[b]).multiplyScalar(0.5));
                }
            }
        }

        return candidates;
    }

    /**
     * Get candidates constrained to a specific face.
     * @private
     */
    _getFaceCandidates(box, faceNormal, includeEdgeMidpoints) {
        const min = box.min;
        const max = box.max;

        // Determine face from dominant axis of normal
        const ax = Math.abs(faceNormal.x), ay = Math.abs(faceNormal.y), az = Math.abs(faceNormal.z);
        let axis, sign;
        if (ax >= ay && ax >= az) { axis = 'x'; sign = Math.sign(faceNormal.x); }
        else if (ay >= ax && ay >= az) { axis = 'y'; sign = Math.sign(faceNormal.y); }
        else { axis = 'z'; sign = Math.sign(faceNormal.z); }

        const faceValue = sign > 0 ? max[axis] : min[axis];
        const axes = ['x', 'y', 'z'].filter(a => a !== axis);
        const a0 = axes[0], a1 = axes[1];

        const candidates = [];

        // 4 face corners
        const faceCorners = [
            [min[a0], min[a1]], [max[a0], min[a1]],
            [min[a0], max[a1]], [max[a0], max[a1]]
        ];
        for (const [v0, v1] of faceCorners) {
            const pt = new THREE.Vector3();
            pt[axis] = faceValue; pt[a0] = v0; pt[a1] = v1;
            candidates.push(pt);
        }

        if (includeEdgeMidpoints) {
            // 4 edge midpoints on this face
            const mid0 = (min[a0] + max[a0]) / 2;
            const mid1 = (min[a1] + max[a1]) / 2;
            const mids = [
                [mid0, min[a1]], [mid0, max[a1]],
                [min[a0], mid1], [max[a0], mid1]
            ];
            for (const [v0, v1] of mids) {
                const pt = new THREE.Vector3();
                pt[axis] = faceValue; pt[a0] = v0; pt[a1] = v1;
                candidates.push(pt);
            }
        }

        return candidates;
    }

    /**
     * Show circle gizmo at an anchor point (screen-space scaled automatically).
     * @param {THREE.Vector3} worldPos - Anchor world position
     */
    showAnchorPoint(worldPos) {
        this.showCircle(worldPos, null);
    }

    /**
     * Get the world-space normal of the most camera-facing face of an object.
     * @param {THREE.Object3D} object - Mesh to check
     * @returns {THREE.Vector3} World-space face normal
     */
    getMostVisibleFaceNormal(object) {
        const geomSource = object?.userData?.supportMeshes?.interactiveMesh || object;
        if (!geomSource || !this.camera) return new THREE.Vector3(0, 0, 1);

        // Camera direction in object's local space
        const objectCenter = geomSource.getWorldPosition(this._tempVector.set(0, 0, 0));
        const toCamera = this.camera.position.clone().sub(objectCenter).normalize();
        const invMatrix = new THREE.Matrix4().copy(geomSource.matrixWorld).invert();
        const localToCamera = toCamera.transformDirection(invMatrix);

        // Find the axis with the largest component — that face points most toward camera
        const ax = Math.abs(localToCamera.x);
        const ay = Math.abs(localToCamera.y);
        const az = Math.abs(localToCamera.z);

        const localNormal = new THREE.Vector3();
        if (ax >= ay && ax >= az) localNormal.x = Math.sign(localToCamera.x);
        else if (ay >= ax && ay >= az) localNormal.y = Math.sign(localToCamera.y);
        else localNormal.z = Math.sign(localToCamera.z);

        // Transform back to world space
        return localNormal.transformDirection(geomSource.matrixWorld).normalize();
    }

    // --- Lifecycle ---

    _requestRender() {
        window.modlerComponents?.sceneFoundation?.requestRender();
    }

    dispose() {
        this.scene.remove(this._arrowGroup);
        this.scene.remove(this._circleGroup);
        this.scene.remove(this._rotationArcGroup);
        this.scene.remove(this._quickRotateArcGroup);

        [this._arrowGroup, this._circleGroup, this._rotationArcGroup, this._quickRotateArcGroup].forEach(group => {
            group.traverse(child => {
                if (child.geometry) child.geometry.dispose();
                // Shared material owned by MaterialManager — don't dispose here
            });
        });
    }
}

window.ToolGizmoManager = ToolGizmoManager;
