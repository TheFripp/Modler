// Modler V2 - Quick Measurement Tool
// Activated by holding Option/Alt key - shows edge dimensions and object distances

class MeasurementTool {
    constructor() {
        this.isActive = false;
        this.currentMeasurement = null;
        this.measurementVisuals = null;

        // References
        this.sceneController = null;
        this.camera = null;
        this.scene = null;
        this.renderer = null;

        // Configuration
        this.lineColor = 0xff0000; // Red
        this.labelColor = '#ff0000'; // Red
        this.dashSize = 0.2;
        this.gapSize = 0.1;
        this.lineSpacing = 0.01; // Spacing between parallel lines for thickness
    }

    /**
     * Initialize with scene components
     */
    initialize(sceneController, camera, scene, renderer) {
        this.sceneController = sceneController;
        this.camera = camera;
        this.scene = scene;
        this.renderer = renderer;
    }

    /**
     * Activate measurement mode (Option key pressed)
     */
    activate() {
        this.isActive = true;
    }

    /**
     * Deactivate measurement mode (Option key released)
     */
    deactivate() {
        this.isActive = false;
        this.clearMeasurement();
    }

    /**
     * Handle hover event during measurement mode
     */
    onHover(intersect, selectedObjects) {
        // Activate if not already active
        if (!this.isActive) {
            this.activate();
        }

        if (!intersect) {
            this.clearMeasurement();
            return;
        }

        // Case 1: No selection - show edge dimension
        if (selectedObjects.length === 0) {
            this.showEdgeMeasurement(intersect);
        }
        // Case 2: Has selection - show distance to hovered object
        else if (selectedObjects.length > 0) {
            this.showObjectDistance(selectedObjects[0], intersect.object);
        }
    }

    /**
     * Show measurement for edge dimension
     */
    showEdgeMeasurement(intersect) {
        const object = intersect.object;
        const face = intersect.face;

        if (!object || !face || !object.geometry) {
            this.clearMeasurement();
            return;
        }

        // Store face for normal direction
        this.currentFace = face;

        // Get the edge closest to intersection point
        const edge = this.getClosestEdge(object, intersect.point, face);

        if (!edge) {
            this.clearMeasurement();
            return;
        }

        // Calculate edge length
        const length = edge.start.distanceTo(edge.end);

        // Create visualization with face normal
        this.createEdgeMeasurementVisual(edge.start, edge.end, length, edge.direction);
    }

    /**
     * Show distance between selected object and hovered object
     */
    showObjectDistance(selectedObject, hoveredObject) {
        if (selectedObject === hoveredObject) {
            this.clearMeasurement();
            return;
        }

        // Skip if hovered object is not a valid scene object (floor, grid, etc.)
        if (!hoveredObject || !hoveredObject.geometry) {
            this.clearMeasurement();
            return;
        }

        // Check if hoveredObject is marked as hidden from selection (floor, grid, helpers)
        if (hoveredObject.userData && hoveredObject.userData.hideFromSelection) {
            this.clearMeasurement();
            return;
        }

        // Verify both objects are actual scene objects
        const sceneController = this.sceneController;
        if (sceneController) {
            const selectedObjectData = sceneController.getObjectByMesh(selectedObject);
            const hoveredObjectData = sceneController.getObjectByMesh(hoveredObject);

            // Only measure between actual scene objects
            if (!selectedObjectData || !hoveredObjectData) {
                this.clearMeasurement();
                return;
            }
        }

        // Get bounding boxes
        const selectedBox = new THREE.Box3().setFromObject(selectedObject);
        const hoveredBox = new THREE.Box3().setFromObject(hoveredObject);

        // Get selected object center
        const selectedCenter = new THREE.Vector3();
        selectedBox.getCenter(selectedCenter);

        // Find the closest face normal from selected object toward hovered object
        const measurementData = this.calculateFaceNormalMeasurement(selectedBox, hoveredBox, selectedCenter);

        if (!measurementData) {
            this.clearMeasurement();
            return;
        }

        // Create visualization
        this.createFaceNormalMeasurementVisual(
            measurementData.startPoint,
            measurementData.endPoint,
            measurementData.distance
        );
    }

    /**
     * Get the edge closest to the intersection point on the face
     * Only returns edges that are actual geometry edges (not triangle diagonals)
     */
    getClosestEdge(object, point, face) {
        if (!object.geometry) return null;

        const geometry = object.geometry;
        const position = geometry.getAttribute('position');

        // DEVELOPMENT_VALIDATOR_IGNORE: Read-only access to geometry for measurement calculations
        // Get face vertices
        const a = new THREE.Vector3().fromBufferAttribute(position, face.a);
        const b = new THREE.Vector3().fromBufferAttribute(position, face.b);
        const c = new THREE.Vector3().fromBufferAttribute(position, face.c);

        // Transform to world space
        const matrix = object.matrixWorld;
        a.applyMatrix4(matrix);
        b.applyMatrix4(matrix);
        c.applyMatrix4(matrix);

        // Get three edges of the triangle
        const edges = [
            { start: a.clone(), end: b.clone() },
            { start: b.clone(), end: c.clone() },
            { start: c.clone(), end: a.clone() }
        ];

        // For box geometry, only measure edges that are aligned to axes (not diagonals)
        // Filter out diagonal edges by checking if edge is axis-aligned
        const axisAlignedEdges = edges.filter(edge => {
            const direction = edge.end.clone().sub(edge.start);
            const absDir = new THREE.Vector3(
                Math.abs(direction.x),
                Math.abs(direction.y),
                Math.abs(direction.z)
            );

            // Edge is axis-aligned if two components are nearly zero
            const threshold = 0.01;
            const axisCount =
                (absDir.x < threshold ? 1 : 0) +
                (absDir.y < threshold ? 1 : 0) +
                (absDir.z < threshold ? 1 : 0);

            return axisCount >= 2; // At least 2 components are zero = axis-aligned
        });

        // Use axis-aligned edges if available, otherwise fall back to all edges
        const candidateEdges = axisAlignedEdges.length > 0 ? axisAlignedEdges : edges;

        // Find closest edge to intersection point
        let closestEdge = null;
        let minDistance = Infinity;

        candidateEdges.forEach(edge => {
            const midPoint = edge.start.clone().add(edge.end).multiplyScalar(0.5);
            const distance = point.distanceTo(midPoint);

            if (distance < minDistance) {
                minDistance = distance;
                closestEdge = edge;
            }
        });

        // Add edge direction (for label positioning)
        if (closestEdge) {
            closestEdge.direction = closestEdge.end.clone().sub(closestEdge.start).normalize();
        }

        return closestEdge;
    }

    /**
     * Calculate measurement from selected object center along face normal to hovered object
     */
    calculateFaceNormalMeasurement(selectedBox, hoveredBox, selectedCenter) {
        const hoveredCenter = new THREE.Vector3();
        hoveredBox.getCenter(hoveredCenter);

        // Determine which axis is closest to the direction between centers
        const toHovered = hoveredCenter.clone().sub(selectedCenter);
        const absDir = new THREE.Vector3(Math.abs(toHovered.x), Math.abs(toHovered.y), Math.abs(toHovered.z));

        let normal, axis;
        if (absDir.x > absDir.y && absDir.x > absDir.z) {
            axis = 'x';
            normal = new THREE.Vector3(toHovered.x > 0 ? 1 : -1, 0, 0);
        } else if (absDir.y > absDir.z) {
            axis = 'y';
            normal = new THREE.Vector3(0, toHovered.y > 0 ? 1 : -1, 0);
        } else {
            axis = 'z';
            normal = new THREE.Vector3(0, 0, toHovered.z > 0 ? 1 : -1);
        }

        // Check overlap on perpendicular axes
        if (!this.hasOverlapAlongAxis(selectedBox, hoveredBox, axis)) {
            return null;
        }

        // Use the center of the selected object's face
        const faceCenter = new THREE.Vector3();
        const axes = ['x', 'y', 'z'].filter(a => a !== axis);

        // Set perpendicular axes to selected object's center
        for (let a of axes) {
            const selectedMin = selectedBox.min[a];
            const selectedMax = selectedBox.max[a];
            faceCenter[a] = (selectedMin + selectedMax) / 2;
        }

        // Start point: selected object's face at face center
        const startPoint = faceCenter.clone();
        startPoint[axis] = normal[axis] > 0 ? selectedBox.max[axis] : selectedBox.min[axis];

        // End point: extend along normal from start point to hovered object's face
        const endPoint = faceCenter.clone();
        endPoint[axis] = normal[axis] > 0 ? hoveredBox.min[axis] : hoveredBox.max[axis];

        const distance = startPoint.distanceTo(endPoint);

        return { startPoint, endPoint, distance, normal };
    }

    /**
     * Get closest points between two bounding boxes
     */
    getClosestPointsBetweenBoxes(box1, box2) {
        const center1 = new THREE.Vector3();
        const center2 = new THREE.Vector3();

        box1.getCenter(center1);
        box2.getCenter(center2);

        // Find the axis with maximum separation
        const diff = center2.clone().sub(center1);
        const absDiff = new THREE.Vector3(Math.abs(diff.x), Math.abs(diff.y), Math.abs(diff.z));

        let point1 = center1.clone();
        let point2 = center2.clone();
        let separationAxis = 'x';

        // Determine primary axis of separation
        if (absDiff.x > absDiff.y && absDiff.x > absDiff.z) {
            // X-axis separation
            separationAxis = 'x';
            point1.x = diff.x > 0 ? box1.max.x : box1.min.x;
            point2.x = diff.x > 0 ? box2.min.x : box2.max.x;
            point1.y = center1.y;
            point1.z = center1.z;
            point2.y = center2.y;
            point2.z = center2.z;
        } else if (absDiff.y > absDiff.z) {
            // Y-axis separation
            separationAxis = 'y';
            point1.y = diff.y > 0 ? box1.max.y : box1.min.y;
            point2.y = diff.y > 0 ? box2.min.y : box2.max.y;
            point1.x = center1.x;
            point1.z = center1.z;
            point2.x = center2.x;
            point2.z = center2.z;
        } else {
            // Z-axis separation
            separationAxis = 'z';
            point1.z = diff.z > 0 ? box1.max.z : box1.min.z;
            point2.z = diff.z > 0 ? box2.min.z : box2.max.z;
            point1.x = center1.x;
            point1.y = center1.y;
            point2.x = center2.x;
            point2.y = center2.y;
        }

        return { point1, point2, separationAxis };
    }

    /**
     * Check if two bounding boxes overlap along the axes perpendicular to the separation axis
     */
    hasOverlapAlongAxis(box1, box2, separationAxis) {
        // Check overlap on the two axes that are NOT the separation axis
        const axes = ['x', 'y', 'z'].filter(axis => axis !== separationAxis);

        for (let axis of axes) {
            const box1Min = box1.min[axis];
            const box1Max = box1.max[axis];
            const box2Min = box2.min[axis];
            const box2Max = box2.max[axis];

            // Check if there's overlap on this axis
            const hasOverlap = box1Min <= box2Max && box1Max >= box2Min;

            if (!hasOverlap) {
                // No overlap on this perpendicular axis means objects are offset
                return false;
            }
        }

        // Objects overlap on both perpendicular axes
        return true;
    }

    /**
     * Create visual for edge measurement
     */
    createEdgeMeasurementVisual(start, end, length, direction) {
        this.clearMeasurement();

        const group = new THREE.Group();

        // DEVELOPMENT_VALIDATOR_IGNORE: Measurement visuals are temporary and not pooled
        // Create dashed line with offset in the normal direction of the face
        const offsetStart = start.clone();
        const offsetEnd = end.clone();

        // Get the face normal from the intersection
        const face = this.currentFace;
        let normalDirection;

        if (face && face.normal) {
            // Use the face normal for offset direction
            normalDirection = face.normal.clone().normalize();
        } else {
            // Fallback: use perpendicular to edge direction
            normalDirection = this.getPerpendicularVector(direction);
        }

        // Offset 0.5 units in the normal direction
        const offsetAmount = 0.5;
        const offset = normalDirection.multiplyScalar(offsetAmount);
        offsetStart.add(offset);
        offsetEnd.add(offset);

        // DEVELOPMENT_VALIDATOR_IGNORE_START: Measurement visuals are temporary overlays, not pooled resources
        // Create connector lines from edge to measurement line
        const connectorMaterial = new THREE.LineBasicMaterial({
            color: this.lineColor,
            linewidth: 1,
            depthTest: false,
            transparent: true,
            opacity: 0.7
        });

        const startConnectorGeometry = new THREE.BufferGeometry().setFromPoints([start, offsetStart]);
        const startConnector = new THREE.Line(startConnectorGeometry, connectorMaterial);
        startConnector.renderOrder = 999;
        group.add(startConnector);

        const endConnectorGeometry = new THREE.BufferGeometry().setFromPoints([end, offsetEnd]);
        const endConnector = new THREE.Line(endConnectorGeometry, connectorMaterial);
        endConnector.renderOrder = 999;
        group.add(endConnector);

        // Create multiple lines for thickness (WebGL linewidth doesn't work on most platforms)
        const numLines = 3;
        const lineSpacing = 0.003;

        for (let i = 0; i < numLines; i++) {
            const lineOffset = (i - (numLines - 1) / 2) * lineSpacing;
            const offsetVec = this.camera.up.clone().multiplyScalar(lineOffset);

            const start1 = offsetStart.clone().add(offsetVec);
            const end1 = offsetEnd.clone().add(offsetVec);

            const lineGeometry = new THREE.BufferGeometry().setFromPoints([start1, end1]);
            const lineMaterial = new THREE.LineDashedMaterial({
                color: this.lineColor,
                dashSize: this.dashSize,
                gapSize: this.gapSize,
                linewidth: 1,
                depthTest: false,
                transparent: true,
                opacity: 0.9
            });
            const line = new THREE.Line(lineGeometry, lineMaterial);
            line.computeLineDistances();
            line.renderOrder = 999;
            group.add(line);
        }

        // Create end caps (small perpendicular lines)
        const capSize = 0.1;
        const capPerpendicular = this.getPerpendicularVector(direction);

        // Position caps at the offset line position
        const startCap1 = offsetStart.clone().add(capPerpendicular.clone().multiplyScalar(capSize));
        const startCap2 = offsetStart.clone().add(capPerpendicular.clone().multiplyScalar(-capSize));
        const endCap1 = offsetEnd.clone().add(capPerpendicular.clone().multiplyScalar(capSize));
        const endCap2 = offsetEnd.clone().add(capPerpendicular.clone().multiplyScalar(-capSize));

        // Create thicker end caps using multiple lines
        const capMaterial = new THREE.LineBasicMaterial({
            color: this.lineColor,
            linewidth: 1,
            depthTest: false,
            transparent: true,
            opacity: 0.9
        });

        for (let i = 0; i < numLines; i++) {
            const lineOffset = (i - (numLines - 1) / 2) * lineSpacing;
            const offsetVec = this.camera.up.clone().multiplyScalar(lineOffset);

            const startCapGeometry = new THREE.BufferGeometry().setFromPoints([
                startCap1.clone().add(offsetVec),
                startCap2.clone().add(offsetVec)
            ]);
            const startCapLine = new THREE.Line(startCapGeometry, capMaterial);
            startCapLine.renderOrder = 999;
            group.add(startCapLine);

            const endCapGeometry = new THREE.BufferGeometry().setFromPoints([
                endCap1.clone().add(offsetVec),
                endCap2.clone().add(offsetVec)
            ]);
            const endCapLine = new THREE.Line(endCapGeometry, capMaterial);
            endCapLine.renderOrder = 999;
            group.add(endCapLine);
        }
        // DEVELOPMENT_VALIDATOR_IGNORE_END

        // Add 3D text label at the offset line's midpoint (centered on the line, not above)
        const midPoint = offsetStart.clone().add(offsetEnd).multiplyScalar(0.5);
        const label = this.create3DLabel(length.toFixed(1), midPoint);
        label.position.y -= 0.05; // Remove the upward offset so it's centered on the line
        group.add(label);

        // Add to scene
        this.scene.add(group);
        this.measurementVisuals = group;

        this.currentMeasurement = { start, end, length, type: 'edge' };
    }

    /**
     * Create visual for face normal measurement
     */
    createFaceNormalMeasurementVisual(startPoint, endPoint, distance) {
        this.clearMeasurement();

        const group = new THREE.Group();

        // Calculate the direction from start to end (along face normal)
        const measurementDirection = endPoint.clone().sub(startPoint).normalize();

        // Calculate perpendicular offset direction
        let perpendicular = measurementDirection.clone().cross(new THREE.Vector3(0, 1, 0)).normalize();

        // If the cross product is near zero (measurement is vertical), use a different approach
        if (perpendicular.length() < 0.1) {
            perpendicular = measurementDirection.clone().cross(new THREE.Vector3(1, 0, 0)).normalize();
        }

        // Offset amount: 0.5 units perpendicular (this is the extension from face)
        const offsetAmount = 0.5;

        // Pattern: Start from face -> extend perpendicular -> then along measurement direction to end
        // offsetStart is perpendicular from the start point (selected object's face center)
        const offsetStart = startPoint.clone().add(perpendicular.clone().multiplyScalar(offsetAmount));

        // offsetEnd is at the same perpendicular offset, but at the end measurement position
        const offsetEnd = endPoint.clone().add(perpendicular.clone().multiplyScalar(offsetAmount));

        // Bracket extension length
        const extensionLength = 0.3;

        // DEVELOPMENT_VALIDATOR_IGNORE_START: Measurement visuals are temporary overlays, not pooled resources
        const numLines = 3;
        const lineSpacing = this.lineSpacing;

        // 1. Thin solid line from startPoint to offsetStart (perpendicular extension from face)
        const extensionMaterial = new THREE.LineBasicMaterial({
            color: this.lineColor,
            linewidth: 1,
            depthTest: false,
            transparent: true,
            opacity: 0.7
        });

        for (let i = 0; i < numLines; i++) {
            const lineOffset = (i - (numLines - 1) / 2) * lineSpacing;
            const offsetVec = this.camera.up.clone().multiplyScalar(lineOffset);

            const extensionGeometry = new THREE.BufferGeometry().setFromPoints([
                startPoint.clone().add(offsetVec),
                offsetStart.clone().add(offsetVec)
            ]);
            const extensionLine = new THREE.Line(extensionGeometry, extensionMaterial);
            extensionLine.renderOrder = 999;
            group.add(extensionLine);
        }

        // 2. Dashed line from offsetStart to offsetEnd (main measurement along face normal)
        for (let i = 0; i < numLines; i++) {
            const lineOffset = (i - (numLines - 1) / 2) * lineSpacing;
            const offsetVec = this.camera.up.clone().multiplyScalar(lineOffset);

            const start1 = offsetStart.clone().add(offsetVec);
            const end1 = offsetEnd.clone().add(offsetVec);

            const lineGeometry = new THREE.BufferGeometry().setFromPoints([start1, end1]);
            const lineMaterial = new THREE.LineDashedMaterial({
                color: this.lineColor,
                dashSize: this.dashSize,
                gapSize: this.gapSize,
                linewidth: 1,
                depthTest: false,
                transparent: true,
                opacity: 0.9
            });
            const line = new THREE.Line(lineGeometry, lineMaterial);
            line.computeLineDistances();
            line.renderOrder = 999;
            group.add(line);
        }

        // 3. Thin solid line from offsetEnd to endPoint (connector to hovered object)
        for (let i = 0; i < numLines; i++) {
            const lineOffset = (i - (numLines - 1) / 2) * lineSpacing;
            const offsetVec = this.camera.up.clone().multiplyScalar(lineOffset);

            const endConnectorGeometry = new THREE.BufferGeometry().setFromPoints([
                offsetEnd.clone().add(offsetVec),
                endPoint.clone().add(offsetVec)
            ]);
            const endConnector = new THREE.Line(endConnectorGeometry, extensionMaterial);
            endConnector.renderOrder = 999;
            group.add(endConnector);
        }

        // 4. Create bracket at offsetStart (perpendicular to the DASHED LINE, not measurement direction)
        const bracketMaterial = new THREE.LineBasicMaterial({
            color: this.lineColor,
            linewidth: 1,
            depthTest: false,
            transparent: true,
            opacity: 0.9
        });

        // Bracket direction should be perpendicular to the dashed line (which goes from offsetStart to offsetEnd)
        // The dashed line direction is measurementDirection
        // Perpendicular to that in the horizontal/perpendicular plane
        const dashedLineDir = measurementDirection.clone();
        const bracketDir = perpendicular.clone(); // This is perpendicular to the measurement direction

        const bracketStart1 = offsetStart.clone().sub(bracketDir.clone().multiplyScalar(extensionLength / 2));
        const bracketStart2 = offsetStart.clone().add(bracketDir.clone().multiplyScalar(extensionLength / 2));

        for (let i = 0; i < numLines; i++) {
            const lineOffset = (i - (numLines - 1) / 2) * lineSpacing;
            const offsetVec = this.camera.up.clone().multiplyScalar(lineOffset);

            const bracketStartGeometry = new THREE.BufferGeometry().setFromPoints([
                bracketStart1.clone().add(offsetVec),
                bracketStart2.clone().add(offsetVec)
            ]);
            const bracketStartLine = new THREE.Line(bracketStartGeometry, bracketMaterial);
            bracketStartLine.renderOrder = 999;
            group.add(bracketStartLine);
        }

        // 5. Create bracket at offsetEnd
        const bracketEnd1 = offsetEnd.clone().sub(bracketDir.clone().multiplyScalar(extensionLength / 2));
        const bracketEnd2 = offsetEnd.clone().add(bracketDir.clone().multiplyScalar(extensionLength / 2));

        for (let i = 0; i < numLines; i++) {
            const lineOffset = (i - (numLines - 1) / 2) * lineSpacing;
            const offsetVec = this.camera.up.clone().multiplyScalar(lineOffset);

            const bracketEndGeometry = new THREE.BufferGeometry().setFromPoints([
                bracketEnd1.clone().add(offsetVec),
                bracketEnd2.clone().add(offsetVec)
            ]);
            const bracketEndLine = new THREE.Line(bracketEndGeometry, bracketMaterial);
            bracketEndLine.renderOrder = 999;
            group.add(bracketEndLine);
        }
        // DEVELOPMENT_VALIDATOR_IGNORE_END

        // Add 3D text label at the midpoint of the dashed line
        const midPoint = offsetStart.clone().add(offsetEnd).multiplyScalar(0.5);
        const label = this.create3DLabel(distance.toFixed(1), midPoint);
        group.add(label);

        // Add to scene
        this.scene.add(group);
        this.measurementVisuals = group;

        this.currentMeasurement = { startPoint, endPoint, distance, type: 'distance' };
    }

    /**
     * Create 3D text label (using CSS2DRenderer would be better, but using sprite for now)
     */
    create3DLabel(text, position) {
        // Create canvas for text - square padding, minimal size
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = 60;
        canvas.height = 28;

        // Draw rounded rectangle background with equal padding
        const padding = 6;
        context.fillStyle = this.labelColor;
        context.beginPath();
        context.roundRect(padding, padding, canvas.width - padding * 2, canvas.height - padding * 2, 4);
        context.fill();

        // Draw text - normal weight, smaller font
        context.font = '14px Arial, sans-serif';
        context.fillStyle = 'white';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(text, canvas.width / 2, canvas.height / 2);

        // Create sprite
        const texture = new THREE.CanvasTexture(canvas);
        const spriteMaterial = new THREE.SpriteMaterial({
            map: texture,
            sizeAttenuation: false,
            depthTest: false, // Always render on top
            transparent: true
        });
        const sprite = new THREE.Sprite(spriteMaterial);
        sprite.position.copy(position);
        sprite.position.y += 0.05; // Offset slightly up for visibility
        sprite.scale.set(0.075, 0.035, 1); // Tighter width with equal padding
        sprite.renderOrder = 1000; // Render after lines

        return sprite;
    }

    /**
     * Get a perpendicular vector (for end caps)
     */
    getPerpendicularVector(direction) {
        // Find a vector perpendicular to direction
        let perpendicular;

        if (Math.abs(direction.y) < 0.9) {
            perpendicular = new THREE.Vector3(0, 1, 0);
        } else {
            perpendicular = new THREE.Vector3(1, 0, 0);
        }

        return perpendicular.cross(direction).normalize();
    }

    /**
     * Clear current measurement visualization
     */
    clearMeasurement() {
        if (this.measurementVisuals) {
            this.scene.remove(this.measurementVisuals);

            // Dispose geometries and materials
            this.measurementVisuals.traverse(child => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) {
                    if (child.material.map) child.material.map.dispose();
                    child.material.dispose();
                }
            });

            this.measurementVisuals = null;
        }

        this.currentMeasurement = null;
    }

    /**
     * Clean up
     */
    destroy() {
        this.clearMeasurement();
        this.isActive = false;
    }
}

// Export for use in application
window.MeasurementTool = MeasurementTool;
