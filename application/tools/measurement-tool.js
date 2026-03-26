import * as THREE from 'three';
// Modler V2 - Quick Measurement Tool
// Activated by holding Option/Alt key - shows edge dimensions and object distances

class MeasurementTool {
    constructor() {
        this.isActive = false;

        // References
        this.sceneController = null;
        this.camera = null;
        this.scene = null;
        this.renderer = null;

        // Configuration - will be updated from settings
        this.lineColor = 0xff0000; // Red (default)
        this.labelColor = '#ff0000'; // Red (default)
        this.dashSize = 0.05;
        this.gapSize = 0.03;
        this.screenSpaceLineWidth = 3; // Target width in screen pixels

        // Current measurement state for Tab key focus
        this.currentEdgeAxis = null; // 'x', 'y', or 'z' - which dimension is being measured
        this.currentObject = null; // The object being measured
        // currentLabelSprite is now on this.visuals

        // Stabilization to prevent flickering
        this.lastUpdateTime = 0; // Timestamp of last measurement update
        this.stabilizationDelay = 500; // 0.5 seconds in milliseconds

        // Load color from configuration
        this.loadColorFromConfig();

        // Delegated rendering (MeasurementVisuals owns visual creation/clearing)
        this.visuals = new MeasurementVisuals(this);
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
        this.visuals.clearMeasurement();
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
            this.visuals.clearMeasurement();
            this.lastUpdateTime = 0;
            return;
        }

        // Check if enough time has passed since last update
        const currentTime = Date.now();
        const timeSinceLastUpdate = currentTime - this.lastUpdateTime;

        // If no measurement exists OR stabilization delay has passed, update immediately
        if (!this.visuals.currentMeasurement || timeSinceLastUpdate >= this.stabilizationDelay) {
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
            this.visuals.clearMeasurement();
            return;
        }

        // Store face for normal direction
        this.currentFace = face;

        // Get the edge closest to intersection point
        const edge = this.getClosestEdge(object, intersect.point, face);

        if (!edge) {
            this.visuals.clearMeasurement();
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
        this.visuals.createEdgeMeasurementVisual(edge.start, edge.end, length, edge.direction, this.currentFace, this.currentObject);
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
        this.currentFace = null; // Clear stale face data so offset uses camera direction

        // Find edge aligned with push axis
        const edge = this.findAxisAlignedEdge(object, pushAxis);
        if (!edge) {
            return;
        }

        // Calculate edge length
        const length = edge.start.distanceTo(edge.end);

        // Create measurement visual
        this.visuals.createEdgeMeasurementVisual(edge.start, edge.end, length, edge.direction, this.currentFace, this.currentObject);
    }

    /**
     * Find an edge of the object's bounding box aligned with the specified axis
     * Picks the edge closest to the camera so measurements face the viewer
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
        const cameraPos = this.camera ? this.camera.position : null;

        // For each axis, there are 4 parallel edges defined by the 2 perpendicular axes.
        // Pick the combination of min/max on perpendicular axes closest to camera.
        const perpAxes = ['x', 'y', 'z'].filter(a => a !== axis);

        // For each perpendicular axis, pick min or max based on camera position
        const coords = {};
        for (const a of perpAxes) {
            if (cameraPos) {
                const mid = (min[a] + max[a]) / 2;
                coords[a] = cameraPos[a] >= mid ? max[a] : min[a];
            } else {
                coords[a] = min[a];
            }
        }

        const start = new THREE.Vector3();
        const end = new THREE.Vector3();

        start[axis] = min[axis];
        end[axis] = max[axis];
        for (const a of perpAxes) {
            start[a] = coords[a];
            end[a] = coords[a];
        }

        const direction = end.clone().sub(start).normalize();

        return { start, end, direction };
    }

    /**
     * Show distance between selected object and hovered object
     */
    showObjectDistance(selectedObject, hoveredObject) {
        if (selectedObject === hoveredObject) {
            this.visuals.clearMeasurement();
            return;
        }

        // Skip if hovered object is not a valid scene object (floor, grid, etc.)
        if (!hoveredObject || !hoveredObject.geometry) {
            this.visuals.clearMeasurement();
            return;
        }

        // Check if hoveredObject is marked as hidden from selection (floor, grid, helpers)
        if (hoveredObject.userData && hoveredObject.userData.hideFromSelection) {
            this.visuals.clearMeasurement();
            return;
        }

        // Verify both objects are actual scene objects
        const sceneController = this.sceneController;
        if (sceneController) {
            const selectedObjectData = sceneController.getObjectByMesh(selectedObject);
            const hoveredObjectData = sceneController.getObjectByMesh(hoveredObject);

            // Only measure between actual scene objects
            if (!selectedObjectData || !hoveredObjectData) {
                this.visuals.clearMeasurement();
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
            this.visuals.clearMeasurement();
            return;
        }

        // Create visualization
        this.visuals.createFaceNormalMeasurementVisual(
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
        const needsStartConnector = !this.visuals.isPointWithinObjectBounds(measurementPosition, selectedBox, axis);
        const needsEndConnector = !this.visuals.isPointWithinObjectBounds(measurementPosition, hoveredBox, axis);

        return { startPoint, endPoint, distance, normal, needsStartConnector, needsEndConnector };
    }

    /**
     * Check if two bounding boxes overlap along the axes perpendicular to the separation axis
     */
    hasOverlapAlongAxis(box1, box2, separationAxis) {
        const axes = ['x', 'y', 'z'].filter(axis => axis !== separationAxis);

        for (let axis of axes) {
            const box1Min = box1.min[axis];
            const box1Max = box1.max[axis];
            const box2Min = box2.min[axis];
            const box2Max = box2.max[axis];

            const hasOverlap = box1Min <= box2Max && box1Max >= box2Min;

            if (!hasOverlap) {
                return false;
            }
        }

        return true;
    }

    /**
     * Delegate to visuals for external callers (e.g., measure-tool-adapter)
     */
    isMouseNearLabel(mouse) {
        return this.visuals.isMouseNearLabel(mouse);
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
        this.visuals.clearMeasurement();
        this.isActive = false;
    }
}

// Export for use in application
window.MeasurementTool = MeasurementTool;
