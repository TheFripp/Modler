import * as THREE from 'three';
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

        // Configuration - will be updated from settings
        this.lineColor = 0xff0000; // Red (default)
        this.labelColor = '#ff0000'; // Red (default)
        this.dashSize = 0.2;
        this.gapSize = 0.1;
        this.screenSpaceLineWidth = 3; // Target width in screen pixels

        // Current measurement state for Tab key focus
        this.currentEdgeAxis = null; // 'x', 'y', or 'z' - which dimension is being measured
        this.currentObject = null; // The object being measured

        // Stabilization to prevent flickering
        this.lastUpdateTime = 0; // Timestamp of last measurement update
        this.stabilizationDelay = 500; // 0.5 seconds in milliseconds

        // Load color from configuration
        this.loadColorFromConfig();
    }

    /**
     * Calculate screen-space perpendicular offset vector for parallel line spacing
     * Returns a world-space vector that represents a perpendicular offset in screen space
     */
    getScreenSpacePerpendicularOffset(position, lineStart, lineEnd, pixelOffset) {
        if (!this.camera || !this.renderer) {
            return this.camera.up.clone().multiplyScalar(0.01);
        }

        const canvas = this.renderer.domElement;

        // Project line endpoints to screen space
        const screenStart = lineStart.clone().project(this.camera);
        const screenEnd = lineEnd.clone().project(this.camera);

        // Calculate line direction in screen space (normalized device coordinates)
        const screenLineDir = new THREE.Vector2(
            screenEnd.x - screenStart.x,
            screenEnd.y - screenStart.y
        ).normalize();

        // Get perpendicular direction in screen space (rotate 90 degrees)
        const screenPerpDir = new THREE.Vector2(-screenLineDir.y, screenLineDir.x);

        // Convert pixel offset to NDC (Normalized Device Coordinates)
        const ndcOffsetX = (pixelOffset / canvas.clientWidth) * 2;
        const ndcOffsetY = (pixelOffset / canvas.clientHeight) * 2;

        // Project position to screen space
        const screenPos = position.clone().project(this.camera);

        // Create offset position in screen space
        const screenOffset = new THREE.Vector3(
            screenPos.x + screenPerpDir.x * ndcOffsetX,
            screenPos.y + screenPerpDir.y * ndcOffsetY,
            screenPos.z
        );

        // Unproject both points back to world space
        const worldPos = position.clone();
        const worldOffset = screenOffset.unproject(this.camera);

        // Return the offset vector
        return worldOffset.clone().sub(worldPos);
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
        this.lastUpdateTime = 0;
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
            this.lastUpdateTime = 0;
            return;
        }

        // Check if enough time has passed since last update
        const currentTime = Date.now();
        const timeSinceLastUpdate = currentTime - this.lastUpdateTime;

        // If no measurement exists OR stabilization delay has passed, update immediately
        if (!this.currentMeasurement || timeSinceLastUpdate >= this.stabilizationDelay) {
            // Case 1: No selection - show edge dimension
            if (selectedObjects.length === 0) {
                this.showEdgeMeasurement(intersect);
            }
            // Case 2: Has selection - check if hovering the same object or different object
            else if (selectedObjects.length > 0) {
                const selectedObject = selectedObjects[0];
                const hoveredObject = intersect.object;

                // If hovering the same selected object, show edge measurement
                if (selectedObject === hoveredObject) {
                    this.showEdgeMeasurement(intersect);
                } else {
                    // Different object - show distance measurement
                    this.showObjectDistance(selectedObject, hoveredObject);
                }
            }

            // Update the last update time
            this.lastUpdateTime = currentTime;
        }
        // Otherwise, ignore the update (within stabilization window)
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

        // Determine which axis this edge aligns with
        const edgeDirection = edge.end.clone().sub(edge.start);
        const absDir = new THREE.Vector3(
            Math.abs(edgeDirection.x),
            Math.abs(edgeDirection.y),
            Math.abs(edgeDirection.z)
        );

        // Store the axis for Tab key functionality
        if (absDir.x > absDir.y && absDir.x > absDir.z) {
            this.currentEdgeAxis = 'x';
        } else if (absDir.y > absDir.z) {
            this.currentEdgeAxis = 'y';
        } else {
            this.currentEdgeAxis = 'z';
        }
        this.currentObject = object;

        // Create visualization with face normal
        this.createEdgeMeasurementVisual(edge.start, edge.end, length, edge.direction);
    }

    /**
     * Show measurement for active push operation
     * Displays the dimension being manipulated on the push axis
     * @param {THREE.Mesh} object - Object being pushed
     * @param {string} pushAxis - Axis being pushed ('x', 'y', or 'z')
     */
    showPushMeasurement(object, pushAxis) {
        if (!object || !pushAxis || !object.geometry) {
            return;
        }

        // Store for Tab key functionality
        this.currentEdgeAxis = pushAxis;
        this.currentObject = object;

        // Find edge aligned with push axis
        const edge = this.findAxisAlignedEdge(object, pushAxis);
        if (!edge) {
            return;
        }

        // Calculate edge length
        const length = edge.start.distanceTo(edge.end);

        // Create measurement visual
        this.createEdgeMeasurementVisual(edge.start, edge.end, length, edge.direction);
    }

    /**
     * Find an edge of the object's bounding box aligned with the specified axis
     * @param {THREE.Mesh} object - The object to measure
     * @param {string} axis - The axis to align with ('x', 'y', or 'z')
     * @returns {Object|null} Edge object with start, end, direction properties
     */
    findAxisAlignedEdge(object, axis) {
        if (!object || !object.geometry) return null;

        // Get bounding box in world space
        const box = new THREE.Box3().setFromObject(object);
        const min = box.min;
        const max = box.max;

        // Define edges along each axis
        let start, end;

        switch (axis) {
            case 'x':
                // Use bottom-front edge along X axis
                start = new THREE.Vector3(min.x, min.y, min.z);
                end = new THREE.Vector3(max.x, min.y, min.z);
                break;
            case 'y':
                // Use front-left edge along Y axis
                start = new THREE.Vector3(min.x, min.y, min.z);
                end = new THREE.Vector3(min.x, max.y, min.z);
                break;
            case 'z':
                // Use bottom-left edge along Z axis
                start = new THREE.Vector3(min.x, min.y, min.z);
                end = new THREE.Vector3(min.x, min.y, max.z);
                break;
            default:
                return null;
        }

        // Calculate direction
        const direction = end.clone().sub(start).normalize();

        return {
            start: start,
            end: end,
            direction: direction
        };
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
            measurementData.distance,
            measurementData.needsStartConnector,
            measurementData.needsEndConnector,
            selectedObject,
            hoveredObject
        );
    }

    /**
     * Check if an edge is a real geometry edge (not a diagonal across a face)
     * For box geometry, real edges are axis-aligned in LOCAL space
     * @param {BufferGeometry} geometry - The geometry to check
     * @param {number} v1 - First vertex index
     * @param {number} v2 - Second vertex index
     * @returns {boolean} True if this is a real edge (not diagonal)
     */
    isGeometryEdge(geometry, v1, v2) {
        const position = geometry.getAttribute('position');

        // Get vertex positions in LOCAL space (before world transform)
        const p1 = new THREE.Vector3().fromBufferAttribute(position, v1);
        const p2 = new THREE.Vector3().fromBufferAttribute(position, v2);

        // Calculate edge direction in local space
        const direction = p2.clone().sub(p1);
        const absDir = new THREE.Vector3(
            Math.abs(direction.x),
            Math.abs(direction.y),
            Math.abs(direction.z)
        );

        // Edge is axis-aligned in local space if two components are nearly zero
        const threshold = 0.001;
        const zeroComponents =
            (absDir.x < threshold ? 1 : 0) +
            (absDir.y < threshold ? 1 : 0) +
            (absDir.z < threshold ? 1 : 0);

        // Real edges have at least 2 zero components (axis-aligned)
        // Diagonals have all 3 components non-zero
        return zeroComponents >= 2;
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
            { start: a.clone(), end: b.clone(), indices: [face.a, face.b] },
            { start: b.clone(), end: c.clone(), indices: [face.b, face.c] },
            { start: c.clone(), end: a.clone(), indices: [face.c, face.a] }
        ];

        // Find edges that are shared between multiple faces (real geometry edges)
        // Diagonal edges only appear in one triangle, real edges appear in 2+ triangles
        const realEdges = edges.filter(edge => {
            return this.isGeometryEdge(geometry, edge.indices[0], edge.indices[1]);
        });

        // Use real geometry edges if found, otherwise use all edges
        const candidateEdges = realEdges.length > 0 ? realEdges : edges;

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

        // Calculate measurement position using overlap region and camera-facing logic
        const measurementPosition = new THREE.Vector3();
        const axes = ['x', 'y', 'z'].filter(a => a !== axis);
        const cameraPos = this.camera.position;

        for (let a of axes) {
            const selectedMin = selectedBox.min[a];
            const selectedMax = selectedBox.max[a];
            const hoveredMin = hoveredBox.min[a];
            const hoveredMax = hoveredBox.max[a];

            // Calculate overlap region
            const overlapMin = Math.max(selectedMin, hoveredMin);
            const overlapMax = Math.min(selectedMax, hoveredMax);

            if (a === 'y') {
                // Y-axis: Always use the lowest point (bottom)
                measurementPosition[a] = overlapMin;
            } else {
                // X/Z axes: Use camera-facing side, but only if camera is above the overlap
                // This prevents measurements from appearing below the objects
                const overlapCenter = (overlapMin + overlapMax) / 2;
                const toCameraDir = cameraPos[a] - overlapCenter;

                // If camera is roughly at the same level or below, default to the edge closest to camera
                if (Math.abs(toCameraDir) < 0.1) {
                    // Camera aligned with overlap - use max side (camera-facing)
                    measurementPosition[a] = overlapMax;
                } else {
                    measurementPosition[a] = toCameraDir > 0 ? overlapMax : overlapMin;
                }
            }
        }

        // Find actual closest surface points along the separation axis
        // Use measurementPosition for perpendicular coordinates
        const startPoint = measurementPosition.clone();
        const endPoint = measurementPosition.clone();

        // Set the separation axis coordinate to the facing surfaces
        if (normal.x !== 0) {
            startPoint.x = normal.x > 0 ? selectedBox.max.x : selectedBox.min.x;
            endPoint.x = normal.x > 0 ? hoveredBox.min.x : hoveredBox.max.x;
        } else if (normal.y !== 0) {
            startPoint.y = normal.y > 0 ? selectedBox.max.y : selectedBox.min.y;
            endPoint.y = normal.y > 0 ? hoveredBox.min.y : hoveredBox.max.y;
        } else {
            startPoint.z = normal.z > 0 ? selectedBox.max.z : selectedBox.min.z;
            endPoint.z = normal.z > 0 ? hoveredBox.min.z : hoveredBox.max.z;
        }

        const distance = Math.abs(endPoint[axis] - startPoint[axis]);

        // Check if the offset measurement line position is within object bounds
        // Only show connectors if the offset position is OUTSIDE the object
        // When the offset position is ON the object edge, we don't need a connector going INTO it
        const needsStartConnector = !this.isPointWithinObjectBounds(measurementPosition, selectedBox, axis);
        const needsEndConnector = !this.isPointWithinObjectBounds(measurementPosition, hoveredBox, axis);

        return { startPoint, endPoint, distance, normal, needsStartConnector, needsEndConnector };
    }

    /**
     * Check if a point's perpendicular position is within object bounds
     */
    isPointWithinObjectBounds(point, box, excludeAxis) {
        const axes = ['x', 'y', 'z'].filter(a => a !== excludeAxis);
        const tolerance = 0.001;

        for (let a of axes) {
            // Check if point is between min and max on this axis
            if (point[a] < box.min[a] - tolerance || point[a] > box.max[a] + tolerance) {
                return false;
            }
        }
        return true;
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
        let offsetStart = start.clone();
        let offsetEnd = end.clone();

        // Calculate offset direction perpendicular to edge in the face plane
        const face = this.currentFace;
        let normalDirection;
        let isBottomFace = false;

        if (face && face.normal) {
            const faceNormal = face.normal.clone().normalize();

            // Check if this is a bottom face (normal pointing downward)
            // Face normal Y component should be significantly negative
            isBottomFace = faceNormal.y < -0.7;

            if (isBottomFace) {
                // For bottom faces, position measurement on floor plane below object
                const object = this.currentObject;
                if (object) {
                    const bbox = new THREE.Box3().setFromObject(object);
                    const floorY = bbox.min.y - 0.5; // 0.5 units below object bottom

                    // Project edge points to floor plane
                    offsetStart.y = floorY;
                    offsetEnd.y = floorY;
                }
            } else {
                // Normal offset behavior for non-bottom faces
                // Calculate direction perpendicular to both edge and face normal
                const edgeDirection = end.clone().sub(start).normalize();
                normalDirection = edgeDirection.clone().cross(faceNormal).normalize();

                // Make sure it points away from the face (outward)
                if (normalDirection.dot(faceNormal) < 0) {
                    normalDirection.negate();
                }

                // Offset 0.5 units in the calculated direction
                const offsetAmount = 0.5;
                const offset = normalDirection.multiplyScalar(offsetAmount);
                offsetStart.add(offset);
                offsetEnd.add(offset);
            }
        } else {
            // Fallback: use perpendicular to edge direction
            normalDirection = this.getPerpendicularVector(direction);
            const offsetAmount = 0.5;
            const offset = normalDirection.multiplyScalar(offsetAmount);
            offsetStart.add(offset);
            offsetEnd.add(offset);
        }

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

        // Create multiple lines for thickness using screen-space perpendicular offsets
        const numLines = 3;
        const midPoint = offsetStart.clone().add(offsetEnd).multiplyScalar(0.5);

        for (let i = 0; i < numLines; i++) {
            const pixelOffset = (i - (numLines - 1) / 2) * 1; // 1 pixel spacing between lines
            const offsetVec = this.getScreenSpacePerpendicularOffset(midPoint, offsetStart, offsetEnd, pixelOffset);

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
            const pixelOffset = (i - (numLines - 1) / 2) * 1; // 1 pixel spacing
            const offsetVec = this.getScreenSpacePerpendicularOffset(midPoint, offsetStart, offsetEnd, pixelOffset);

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

        // Add 3D text label at the offset line's midpoint (centered on the line)
        const edgeLabelPos = offsetStart.clone().add(offsetEnd).multiplyScalar(0.5);
        const label = this.create3DLabel(this.formatMeasurementWithUnit(length), edgeLabelPos);
        group.add(label);

        // Add to scene
        this.scene.add(group);
        this.measurementVisuals = group;

        this.currentMeasurement = { start, end, length, type: 'edge' };
    }

    /**
     * Create visual for face normal measurement
     */
    createFaceNormalMeasurementVisual(startPoint, endPoint, distance, needsStartConnector, needsEndConnector, selectedObject, hoveredObject) {
        this.clearMeasurement();

        const group = new THREE.Group();

        // Use the SAME logic as edge measurements for consistency
        // Calculate measurement direction
        const measurementDirection = endPoint.clone().sub(startPoint).normalize();

        // Get the midpoint to determine the face normal direction
        const midPoint = startPoint.clone().add(endPoint).multiplyScalar(0.5);

        // Calculate perpendicular offset direction (same as edge measurements)
        // Use the cross product with camera up vector to get a perpendicular direction
        let perpendicular = measurementDirection.clone().cross(this.camera.up).normalize();

        // If cross product is too small, use a different approach
        if (perpendicular.length() < 0.1) {
            perpendicular = measurementDirection.clone().cross(new THREE.Vector3(1, 0, 0)).normalize();
            if (perpendicular.length() < 0.1) {
                perpendicular = new THREE.Vector3(0, 0, 1);
            }
        }

        // Make sure perpendicular points toward camera
        const toCamera = this.camera.position.clone().sub(midPoint);
        if (perpendicular.dot(toCamera) < 0) {
            perpendicular.negate();
        }

        // Offset amount: 0.5 units perpendicular (same as edge measurements)
        const offsetAmount = 0.5;

        // Offset the measurement line
        const offsetStart = startPoint.clone().add(perpendicular.clone().multiplyScalar(offsetAmount));
        const offsetEnd = endPoint.clone().add(perpendicular.clone().multiplyScalar(offsetAmount));

        // Determine if we need connectors by checking if offset line is outside object bounds
        // Connectors should only appear when the measurement line is positioned outside the object
        const axis = Math.abs(endPoint.x - startPoint.x) > 0.001 ? 'x'
                   : Math.abs(endPoint.y - startPoint.y) > 0.001 ? 'y' : 'z';

        const selectedBox = new THREE.Box3().setFromObject(selectedObject);
        const hoveredBox = new THREE.Box3().setFromObject(hoveredObject);

        // Check if the perpendicular offset pushes the line outside the object bounds
        const actualNeedsStartConnector = !this.isPointWithinObjectBounds(offsetStart, selectedBox, axis);
        const actualNeedsEndConnector = !this.isPointWithinObjectBounds(offsetEnd, hoveredBox, axis);

        // Bracket extension length
        const extensionLength = 0.3;

        // DEVELOPMENT_VALIDATOR_IGNORE_START: Measurement visuals are temporary overlays, not pooled resources
        const numLines = 3;
        const lineMidPoint = offsetStart.clone().add(offsetEnd).multiplyScalar(0.5);

        // 1. Thin solid line from startPoint to offsetStart (only if needed)
        const extensionMaterial = new THREE.LineBasicMaterial({
            color: this.lineColor,
            linewidth: 1,
            depthTest: false,
            transparent: true,
            opacity: 0.5  // 50% opacity
        });

        if (actualNeedsStartConnector) {
            for (let i = 0; i < numLines; i++) {
                const pixelOffset = (i - (numLines - 1) / 2) * 1; // 1 pixel spacing
                const offsetVec = this.getScreenSpacePerpendicularOffset(lineMidPoint, offsetStart, offsetEnd, pixelOffset);

                const extensionGeometry = new THREE.BufferGeometry().setFromPoints([
                    startPoint.clone().add(offsetVec),
                    offsetStart.clone().add(offsetVec)
                ]);
                const extensionLine = new THREE.Line(extensionGeometry, extensionMaterial);
                extensionLine.renderOrder = 999;
                group.add(extensionLine);
            }
        }

        // 2. Dashed line from offsetStart to offsetEnd (main measurement along face normal)
        for (let i = 0; i < numLines; i++) {
            const pixelOffset = (i - (numLines - 1) / 2) * 1; // 1 pixel spacing
            const offsetVec = this.getScreenSpacePerpendicularOffset(lineMidPoint, offsetStart, offsetEnd, pixelOffset);

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

        // 3. Thin solid line from offsetEnd to endPoint (only if needed)
        if (actualNeedsEndConnector) {
            for (let i = 0; i < numLines; i++) {
                const pixelOffset = (i - (numLines - 1) / 2) * 1; // 1 pixel spacing
                const offsetVec = this.getScreenSpacePerpendicularOffset(lineMidPoint, offsetStart, offsetEnd, pixelOffset);

                const endConnectorGeometry = new THREE.BufferGeometry().setFromPoints([
                    offsetEnd.clone().add(offsetVec),
                    endPoint.clone().add(offsetVec)
                ]);
                const endConnector = new THREE.Line(endConnectorGeometry, extensionMaterial);
                endConnector.renderOrder = 999;
                group.add(endConnector);
            }
        }

        // 4. Create brackets at measurement line ends (only when connectors are shown)
        const bracketMaterial = new THREE.LineBasicMaterial({
            color: this.lineColor,
            linewidth: 1,
            depthTest: false,
            transparent: true,
            opacity: 0.9
        });

        // Bracket direction should be perpendicular to the dashed line
        const bracketDir = perpendicular.clone();

        // Only draw start bracket if we have a start connector
        if (actualNeedsStartConnector) {
            const bracketStart1 = offsetStart.clone().sub(bracketDir.clone().multiplyScalar(extensionLength / 2));
            const bracketStart2 = offsetStart.clone().add(bracketDir.clone().multiplyScalar(extensionLength / 2));

            for (let i = 0; i < numLines; i++) {
                const pixelOffset = (i - (numLines - 1) / 2) * 1; // 1 pixel spacing
                const offsetVec = this.getScreenSpacePerpendicularOffset(lineMidPoint, offsetStart, offsetEnd, pixelOffset);

                const bracketStartGeometry = new THREE.BufferGeometry().setFromPoints([
                    bracketStart1.clone().add(offsetVec),
                    bracketStart2.clone().add(offsetVec)
                ]);
                const bracketStartLine = new THREE.Line(bracketStartGeometry, bracketMaterial);
                bracketStartLine.renderOrder = 999;
                group.add(bracketStartLine);
            }
        }

        // Only draw end bracket if we have an end connector
        if (actualNeedsEndConnector) {
            const bracketEnd1 = offsetEnd.clone().sub(bracketDir.clone().multiplyScalar(extensionLength / 2));
            const bracketEnd2 = offsetEnd.clone().add(bracketDir.clone().multiplyScalar(extensionLength / 2));

            for (let i = 0; i < numLines; i++) {
                const pixelOffset = (i - (numLines - 1) / 2) * 1; // 1 pixel spacing
                const offsetVec = this.getScreenSpacePerpendicularOffset(lineMidPoint, offsetStart, offsetEnd, pixelOffset);

                const bracketEndGeometry = new THREE.BufferGeometry().setFromPoints([
                    bracketEnd1.clone().add(offsetVec),
                    bracketEnd2.clone().add(offsetVec)
                ]);
                const bracketEndLine = new THREE.Line(bracketEndGeometry, bracketMaterial);
                bracketEndLine.renderOrder = 999;
                group.add(bracketEndLine);
            }
        }
        // DEVELOPMENT_VALIDATOR_IGNORE_END

        // Add 3D text label at the midpoint of the dashed line
        const labelPosition = offsetStart.clone().add(offsetEnd).multiplyScalar(0.5);
        const label = this.create3DLabel(this.formatMeasurementWithUnit(distance), labelPosition);
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
        // Create canvas for text - compact with minimal padding
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = 42;  // Tighter width
        canvas.height = 24; // Tighter height

        // Draw rounded rectangle background with minimal padding
        const paddingX = 1.5; // Minimal horizontal padding
        const paddingY = 6;   // Moderate vertical padding
        context.fillStyle = this.labelColor;
        context.beginPath();
        context.roundRect(0, 0, canvas.width, canvas.height, 3);
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
        // No offset - position should be exactly where requested
        sprite.scale.set(0.053, 0.03, 1); // Compact size matching reduced canvas
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
     * Format measurement value with unit suffix
     * @param {number} valueInMeters - Measurement value in internal meters
     * @returns {string} Formatted string like "1.2m" or "2' 3\""
     */
    formatMeasurementWithUnit(valueInMeters) {
        const unitConverter = window.modlerComponents?.unitConverter;

        if (!unitConverter) {
            // Fallback to meters with 1 decimal if no converter available
            return `${valueInMeters.toFixed(1)}m`;
        }

        const userUnit = unitConverter.userUnit;

        // Handle imperial feet/inches format specially
        if (userUnit === 'ft' || userUnit === 'in') {
            // Convert to inches first
            const totalInches = valueInMeters * unitConverter.conversionFromMeters['in'];

            if (userUnit === 'ft') {
                // Display as feet and inches (e.g., "2' 3\"")
                const feet = Math.floor(totalInches / 12);
                const inches = Math.round(totalInches % 12);

                if (inches === 0) {
                    return `${feet}'`;
                } else {
                    return `${feet}' ${inches}"`;
                }
            } else {
                // Just inches
                return `${Math.round(totalInches)}"`;
            }
        }

        // For metric and other units, use standard formatting
        const convertedValue = unitConverter.convertFromInternal(valueInMeters);
        const precision = unitConverter.unitPrecision[userUnit] || 1;

        return `${convertedValue.toFixed(precision)}${userUnit}`;
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
     * Load measurement color from configuration
     */
    loadColorFromConfig() {
        const configManager = window.modlerComponents?.configurationManager;
        if (configManager) {
            const colorHex = configManager.get('visual.measurement.color');
            if (colorHex) {
                // Convert hex string to number for THREE.js
                this.lineColor = parseInt(colorHex.replace('#', ''), 16);
                this.labelColor = colorHex; // Keep as string for canvas text
            }
        }
    }

    /**
     * Update measurement color (called when settings change)
     * @param {string} colorHex - New color in hex format
     */
    updateColor(colorHex) {
        this.lineColor = parseInt(colorHex.replace('#', ''), 16);
        this.labelColor = colorHex;
    }

    /**
     * Clean up
     */
    destroy() {
        this.lastUpdateTime = 0;
        this.clearMeasurement();
        this.isActive = false;
    }
}

// Export for use in application
window.MeasurementTool = MeasurementTool;
