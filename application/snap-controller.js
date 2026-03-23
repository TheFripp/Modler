import * as THREE from 'three';
/**
 * Snap Controller
 * Centralized snapping system for precise object positioning
 * 34 methods covering: snap detection, proximity testing, visualization, tool integration
 * Current: ~1010 lines - comprehensive snapping with edge/vertex/center/midpoint support
 */

class SnapController {
    constructor(scene, camera, inputController) {
        this.scene = scene;
        this.camera = camera;
        this.inputController = inputController;

        // Centralized snap state — persisted across sessions
        this.isEnabled = localStorage.getItem('modler-snap-enabled') === 'true';
        this.snapThreshold = 16; // 16px screen space proximity for easier targeting
        this.currentSnapPoint = null;
        this.activeSnapType = null; // 'corner', 'edge', 'face'

        // Snap system registry - all snapping systems register here
        this.registeredSnapSystems = new Map();

        // Tool behavior registry
        this.toolSnapBehaviors = new Map();

        // Performance optimization - only run detection when needed
        this.shouldRunDetection = false;
        this.lastMousePosition = new THREE.Vector2();

        // Stability to prevent flickering
        this.lastSnapPoint = null;
        this.stabilityFrames = 0;
        this.requiredStableFrames = 2; // Must be stable for 2 frames before changing

        // Debug logging throttle
        this.lastLogTime = 0;
        this.logInterval = 500; // Log at most once per 500ms

    }
    
    /**
     * Register a snap system component for centralized control
     * @param {string} systemName - Name of the snap system
     * @param {Object} systemRef - Reference to the system with enable/disable methods
     */
    registerSnapSystem(systemName, systemRef) {
        if (systemRef && typeof systemRef.setEnabled === 'function') {
            this.registeredSnapSystems.set(systemName, systemRef);
        }
    }

    /**
     * Unregister a snap system
     * @param {string} systemName - Name of the system to unregister
     */
    unregisterSnapSystem(systemName) {
        this.registeredSnapSystems.delete(systemName);
    }

    /**
     * Enable/disable snapping globally - controls ALL registered snap systems
     */
    setEnabled(enabled) {
        this.isEnabled = enabled;
        localStorage.setItem('modler-snap-enabled', enabled ? 'true' : 'false');

        // Control all registered snap systems
        this.registeredSnapSystems.forEach((system, name) => {
            try {
                system.setEnabled(enabled);
            } catch (error) {
            }
        });

        // Clear current snap point when disabled
        if (!enabled) {
            this.clearCurrentSnapPoint();
            this.shouldRunDetection = false;
        }

        // Notify UI about state change
        this.notifySnapStateChange();

    }

    /**
     * Request snap detection on next frame (for event-driven detection)
     */
    requestSnapDetection() {
        this.shouldRunDetection = true;
    }
    
    /**
     * Check if snapping is currently enabled
     */
    getEnabled() {
        return this.isEnabled;
    }

    /**
     * Toggle snapping on/off. Called from CommandRouter via toolbar button.
     */
    toggle() {
        this.setEnabled(!this.isEnabled);
    }

    /**
     * Register snap behavior for a specific tool
     */
    registerToolSnapBehavior(toolName, behavior) {
        this.toolSnapBehaviors.set(toolName, {
            showSnapPoints: behavior.showSnapPoints || (() => false),
            snapPointTypes: behavior.snapPointTypes || ['corner', 'edge', 'face'],
            snapOnHover: behavior.snapOnHover || false,
            attachmentMode: behavior.attachmentMode || 'free'
        });
        
    }
    
    /**
     * Update snap detection based on current mouse position and active tool
     * Now with performance optimization - only run when needed
     */
    updateSnapDetection(activeToolName, selectedObjects = [], travelAxis = null, geometricConstraints = null, sourceWorldPos = null) {
        // Early return if snapping disabled - CRITICAL for performance
        if (!this.isEnabled) {
            this.clearCurrentSnapPoint();
            this.shouldRunDetection = false;
            return null;
        }

        // Performance optimization: only run detection when mouse moves or conditions change
        const currentMousePos = this.inputController.mouse;
        const mouseMovedSignificantly = this.lastMousePosition.distanceTo(currentMousePos) > 0.005; // Larger threshold for stability

        if (!mouseMovedSignificantly && !this.shouldRunDetection) {
            return this.currentSnapPoint; // Return cached result
        }

        // Only log when we actually find snap candidates (moved below)

        this.lastMousePosition.copy(currentMousePos);
        this.shouldRunDetection = false;
        
        // Get tool behavior
        const toolBehavior = this.toolSnapBehaviors.get(activeToolName);
        if (!toolBehavior) {
            this.clearCurrentSnapPoint();
            return null;
        }

        // If no objects selected and tool doesn't need snap points, skip detection
        // This reduces interference with camera controls
        if (selectedObjects.length === 0 && !toolBehavior.showSnapPoints(selectedObjects) && activeToolName !== 'box-creation') {
            this.clearCurrentSnapPoint();
            return null;
        }
        
        // Use proper tool registration instead of hardcoded special cases
        {
            // Check if tool wants snap points shown for current selection state
            if (!toolBehavior.showSnapPoints(selectedObjects)) {
                this.clearCurrentSnapPoint();
                return null;
            }
        }
        
        // Get current mouse position from InputController
        const mouseNDC = this.inputController.mouse;

        // Find closest snap point within threshold
        const snapPoint = this.findClosestSnapPoint(mouseNDC, toolBehavior.snapPointTypes, selectedObjects, travelAxis, geometricConstraints, sourceWorldPos);

        // Only log when we actually find snap points
        if (snapPoint) {
        }

        // Update current snap point
        this.updateCurrentSnapPoint(snapPoint);

        return this.currentSnapPoint;
    }
    
    /**
     * Find the closest snap point to the mouse cursor with optional travel axis filtering
     */
    findClosestSnapPoint(mouseNDC, allowedTypes, selectedObjects, travelAxis = null, geometricConstraints = null, sourceWorldPos = null) {
        // Use dragged anchor's screen position when provided (anchor-to-anchor snap),
        // otherwise fall back to mouse cursor position
        const referencePixel = sourceWorldPos
            ? this.worldToPixel(sourceWorldPos)
            : this.ndcToPixel(mouseNDC);

        const objectsToCheck = this.getObjectsForSnapping(selectedObjects);

        // Two-pass priority: corners/midpoints always beat edges
        let bestCorner = null;
        let bestCornerDist = this.snapThreshold;
        let bestEdge = null;
        let bestEdgeDist = this.snapThreshold;

        for (const object of objectsToCheck) {
            // Pass 1: Corners + edge midpoints (discrete snap points)
            if (allowedTypes.includes('corner')) {
                for (const corner of this.getVisibleObjectCorners(object)) {
                    const distance = this.getScreenDistance(corner.screenPos, referencePixel);
                    if (distance < bestCornerDist) {
                        const candidate = {
                            type: 'corner',
                            worldPos: corner.worldPos,
                            screenPos: corner.screenPos,
                            object: object,
                            distance: distance
                        };
                        if (this.isValidSnapPoint(candidate, geometricConstraints)) {
                            bestCornerDist = distance;
                            bestCorner = candidate;
                        }
                    }
                }
            }

            // Pass 2: Edge sliding (closest point along edge)
            if (allowedTypes.includes('edge')) {
                for (const edge of this.getVisibleObjectEdges(object, travelAxis)) {
                    const startScreen = this.worldToPixel(edge.start);
                    const endScreen = this.worldToPixel(edge.end);
                    const { distance, t } = this.getDistanceAndParamToLineSegment(referencePixel, startScreen, endScreen);

                    if (distance < bestEdgeDist) {
                        const worldPos = edge.start.clone().lerp(edge.end, t);
                        const screenPos = this.worldToPixel(worldPos);
                        const candidate = {
                            type: 'edge',
                            worldPos,
                            screenPos,
                            object: object,
                            distance: distance,
                            edgeStart: edge.start,
                            edgeEnd: edge.end
                        };
                        if (this.isValidSnapPoint(candidate, geometricConstraints)) {
                            bestEdgeDist = distance;
                            bestEdge = candidate;
                        }
                    }
                }
            }
            
        }

        // Corners always win if found; edges only fill in when no corner is near
        return bestCorner || bestEdge;
    }

    /**
     * Validate snap point against geometric constraints
     *
     * Used to filter out snap points that would cause invalid geometry
     * (e.g., inside-out objects in push operations) before they become
     * visible indicators.
     *
     * @param {Object} snapPoint - Candidate snap point to validate
     * @param {Object} geometricConstraints - Constraints object from tool
     * @returns {boolean} True if snap point is valid, false to filter out
     */
    isValidSnapPoint(snapPoint, geometricConstraints) {
        // If no constraints provided, all snap points are valid
        if (!geometricConstraints) return true;

        // Handle push tool geometric constraints
        if (geometricConstraints.type === 'push_geometric') {
            // Use the validation function provided by the push tool
            if (geometricConstraints.validateSnapPoint) {
                const validatedPoint = geometricConstraints.validateSnapPoint(snapPoint);
                return validatedPoint !== null;
            }
        }

        // Unknown constraint type or no validation needed
        return true;
    }

    /**
     * Get objects that should be checked for snap points
     */
    getObjectsForSnapping(selectedObjects) {
        const objectsToCheck = [];
        const sceneController = window.modlerComponents?.sceneController;
        if (!sceneController) return objectsToCheck;

        // Collect IDs of any containers being dragged, so we can exclude their children
        const draggedContainerIds = new Set();
        for (const mesh of selectedObjects) {
            const objData = sceneController.getObjectByMesh(mesh);
            if (objData?.isContainer) {
                draggedContainerIds.add(objData.id);
            }
        }

        // Whitelist approach: only include registered CAD objects
        // This inherently excludes support meshes, gizmos, grid lines, floor plane
        for (const [id, objectData] of sceneController.objects) {
            const mesh = objectData.mesh;
            if (!mesh || !mesh.visible) continue;

            // Skip floor/grid objects
            if (objectData.type === 'grid' || objectData.category === 'system') continue;

            // Skip selected objects (prevent self-snapping)
            if (selectedObjects.includes(mesh)) continue;

            // Skip containers
            if (objectData.isContainer) continue;

            // Skip children of any container being dragged (they move with it)
            if (draggedContainerIds.size > 0 && objectData.parentContainer) {
                let isChildOfDragged = false;
                for (const cid of draggedContainerIds) {
                    if (this.isObjectInContainer(objectData, cid, sceneController)) {
                        isChildOfDragged = true;
                        break;
                    }
                }
                if (isChildOfDragged) continue;
            }

            if (mesh.isMesh && mesh.geometry) {
                objectsToCheck.push(mesh);
            }
        }

        return objectsToCheck;
    }

    /**
     * Check if a mesh is container-related (container, interactive mesh, collision mesh, wireframe, etc.)
     * @param {THREE.Object3D} mesh - Mesh to check
     * @returns {boolean} True if the mesh is related to any container
     */
    isContainerRelatedMesh(mesh) {
        const sceneController = window.modlerComponents?.sceneController;
        if (!sceneController || !mesh) return false;

        // Check if it's a registered container
        const objectData = sceneController.getObjectByMesh(mesh);
        if (objectData && objectData.isContainer) {
            return true; // This is a container mesh
        }

        // Check userData flags for container-related meshes
        if (mesh.userData) {
            // Interactive/collision meshes
            if (mesh.userData.isContainerInteractive ||
                mesh.userData.isContainerCollision ||
                mesh.userData.parentContainerId) {
                return true;
            }

            // Support meshes (wireframes, visual effects, etc.)
            if (mesh.userData.isSupportMesh ||
                mesh.userData.isWireframe ||
                mesh.userData.isContainerWireframe ||
                mesh.userData.isSelectionWireframe) {
                return true;
            }

            // Visual effect meshes
            if (mesh.userData.isVisualEffect ||
                mesh.userData.isHighlight ||
                mesh.userData.isEdgeHighlight) {
                return true;
            }
        }

        // Check object names for container-related patterns
        const meshName = mesh.name ? mesh.name.toLowerCase() : '';
        if (meshName.includes('container') ||
            meshName.includes('wireframe') ||
            meshName.includes('interactive') ||
            meshName.includes('collision') ||
            meshName.includes('support')) {
            return true;
        }

        // Check if object is registered as container-related type
        if (objectData &&
            (objectData.type === 'container-interactive' ||
             objectData.type === 'container-collision' ||
             objectData.type === 'container-wireframe' ||
             objectData.type === 'support-mesh')) {
            return true;
        }

        return false; // Not container-related
    }

    /**
     * Check if a given object is a parent container of any selected object
     * @param {THREE.Object3D} potentialContainer - Object to check
     * @param {Array} selectedObjects - Array of selected objects
     * @returns {boolean} True if the object is a parent container of any selected object
     */
    isParentContainerOfSelected(potentialContainer, selectedObjects) {
        const sceneController = window.modlerComponents?.sceneController;
        if (!sceneController || !potentialContainer) return false;

        // Check if this is a container interactive/collision mesh
        if (potentialContainer.userData &&
            (potentialContainer.userData.isContainerInteractive || potentialContainer.userData.isContainerCollision)) {

            // Get the parent container ID from the interactive/collision mesh
            const parentContainerId = potentialContainer.userData.parentContainerId;
            if (parentContainerId) {
                // Check if any selected object is inside this container
                for (const selectedObject of selectedObjects) {
                    const selectedObjectData = sceneController.getObjectByMesh(selectedObject);
                    if (selectedObjectData && this.isObjectInContainer(selectedObjectData, parentContainerId, sceneController)) {
                        return true; // This interactive/collision mesh belongs to a parent container
                    }
                }
            }
            return false; // Interactive/collision mesh but not a parent container
        }

        // Get the container data for the potential container
        const containerData = sceneController.getObjectByMesh(potentialContainer);
        if (!containerData || !containerData.isContainer) {
            return false; // Not a container, so can't be a parent container
        }

        // Check if any selected object has this container as a parent
        for (const selectedObject of selectedObjects) {
            const selectedObjectData = sceneController.getObjectByMesh(selectedObject);
            if (selectedObjectData && this.isObjectInContainer(selectedObjectData, containerData.id, sceneController)) {
                return true; // This container is a parent of at least one selected object
            }
        }

        return false;
    }

    /**
     * Check if an object is inside a specific container (directly or indirectly)
     * @param {Object} objectData - Object data from SceneController
     * @param {string} containerId - Container ID to check against
     * @param {Object} sceneController - SceneController instance
     * @returns {boolean} True if object is inside the container
     */
    isObjectInContainer(objectData, containerId, sceneController) {
        if (!objectData || !containerId) return false;

        let currentParentId = objectData.parentContainer;

        // Traverse up the container hierarchy to check for containment
        while (currentParentId) {
            if (currentParentId === containerId) {
                return true; // Found the container in the parent chain
            }

            // Move up to the next parent container
            const parentData = sceneController.getObject(currentParentId);
            currentParentId = parentData?.parentContainer;
        }

        return false; // Object is not inside this container
    }

    /**
     * Check if currently hovering over an object (for box creation tool)
     */
    checkIfHoveringObject() {
        try {
            // Use raycasting to check if mouse is over any object
            this.inputController.raycaster.setFromCamera(this.inputController.mouse, this.camera);
            const intersects = this.inputController.raycaster.intersectObjects(this.scene.children, true);

            // Filter out floor objects
            const validIntersects = intersects.filter(hit =>
                hit.object &&
                hit.object.geometry &&
                !this.isFloorObject(hit.object) &&
                hit.object.visible
            );

            return validIntersects.length > 0;
        } catch (error) {
            // Fail silently to avoid breaking camera controls
            return false;
        }
    }
    
    /**
     * Check if an edge has at least one adjacent face that is visible to the camera
     * This allows internal edges while excluding edges where both faces are back-facing
     */
    edgeHasVisibleFace(object, edgeStart, edgeEnd, camera) {
        try {
            const geometry = object.geometry;
            if (!geometry || !geometry.index) return true; // Fallback: assume visible for non-indexed geometry

            const positions = geometry.getAttribute('position');
            const indices = geometry.index.array;

            // Calculate edge direction and midpoint in local space
            const edgeDirection = edgeEnd.clone().sub(edgeStart).normalize();
            const edgeMidpoint = edgeStart.clone().lerp(edgeEnd, 0.5);

            // Find faces that share this edge (contain both edge vertices)
            const adjacentFaces = [];
            const tolerance = 0.001;

            // Check each triangle face
            for (let i = 0; i < indices.length; i += 3) {
                const faceVertices = [
                    new THREE.Vector3().fromBufferAttribute(positions, indices[i]),
                    new THREE.Vector3().fromBufferAttribute(positions, indices[i + 1]),
                    new THREE.Vector3().fromBufferAttribute(positions, indices[i + 2])
                ];

                // Check if this face contains both edge vertices
                let edgeStartFound = false;
                let edgeEndFound = false;

                for (const vertex of faceVertices) {
                    if (vertex.distanceTo(edgeStart) < tolerance) edgeStartFound = true;
                    if (vertex.distanceTo(edgeEnd) < tolerance) edgeEndFound = true;
                }

                if (edgeStartFound && edgeEndFound) {
                    // Calculate face normal
                    const v1 = faceVertices[1].clone().sub(faceVertices[0]);
                    const v2 = faceVertices[2].clone().sub(faceVertices[0]);
                    const faceNormal = v1.cross(v2).normalize();

                    // Transform to world space
                    faceNormal.transformDirection(object.matrixWorld);
                    const faceCenter = faceVertices[0].clone()
                        .add(faceVertices[1])
                        .add(faceVertices[2])
                        .multiplyScalar(1/3)
                        .applyMatrix4(object.matrixWorld);

                    adjacentFaces.push({ normal: faceNormal, center: faceCenter });
                }
            }

            // Check if at least one adjacent face is facing the camera
            for (const face of adjacentFaces) {
                const cameraDirection = camera.position.clone().sub(face.center).normalize();
                const dotProduct = face.normal.dot(cameraDirection);

                // Face is visible if normal points generally toward camera (dot product > 0)
                if (dotProduct > 0.1) { // Small threshold to avoid edge cases
                    return true;
                }
            }

            // If no visible faces found, edge should be hidden
            return adjacentFaces.length === 0; // Show edge if we couldn't find adjacent faces (fallback)

        } catch (error) {
            // On error, assume edge is visible to avoid breaking snapping
            return true;
        }
    }

    /**
     * Check if object is a floor/grid object (should be excluded from snapping)
     */
    isFloorObject(object) {
        if (!object) return false;

        // Check if object is GridHelper
        if (object.isGridHelper) return true;

        // Check object name (case insensitive)
        const objName = object.name ? object.name.toLowerCase() : '';
        if (objName.includes('floor') || objName.includes('grid')) {
            return true;
        }

        // Check object type through SceneController metadata
        const sceneController = window.modlerComponents?.sceneController;
        if (sceneController) {
            const objectData = sceneController.getObjectByMesh(object);
            if (objectData && (objectData.type === 'grid' || objectData.category === 'system')) {
                return true;
            }
        }

        return false;
    }
    
    /**
     * Get visible corner points and edge midpoints using camera-facing visibility.
     * Uses same algorithm as ToolGizmoManager._getVisibleCandidates().
     */
    getVisibleObjectCorners(object) {
        if (!object.geometry) return [];

        const geometry = object.geometry;
        geometry.computeBoundingBox();
        const box = geometry.boundingBox;
        if (!box) return [];

        // Camera direction in object's local space
        const objectCenter = object.getWorldPosition(new THREE.Vector3());
        const cameraDir = objectCenter.clone().sub(this.camera.position).normalize();
        const invMatrix = new THREE.Matrix4().copy(object.matrixWorld).invert();
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

        const boxCorners = [
            new THREE.Vector3(box.min.x, box.min.y, box.min.z),
            new THREE.Vector3(box.max.x, box.min.y, box.min.z),
            new THREE.Vector3(box.min.x, box.max.y, box.min.z),
            new THREE.Vector3(box.max.x, box.max.y, box.min.z),
            new THREE.Vector3(box.min.x, box.min.y, box.max.z),
            new THREE.Vector3(box.max.x, box.min.y, box.max.z),
            new THREE.Vector3(box.min.x, box.max.y, box.max.z),
            new THREE.Vector3(box.max.x, box.max.y, box.max.z)
        ];

        const results = [];

        // Add visible corners
        for (let i = 0; i < 8; i++) {
            if (!cornerVisible[i]) continue;
            const worldPos = boxCorners[i].clone().applyMatrix4(object.matrixWorld);
            const screenPos = this.worldToPixel(worldPos);
            results.push({ worldPos, screenPos, index: i });
        }

        // Add edge midpoints for visible edges (edge visible if either adjacent face is visible)
        const edges = [
            [0,1,'nY','nZ'], [0,4,'nY','nX'], [1,5,'nY','pX'], [4,5,'nY','pZ'],
            [2,3,'pY','nZ'], [2,6,'pY','nX'], [3,7,'pY','pX'], [6,7,'pY','pZ'],
            [0,2,'nX','nZ'], [1,3,'pX','nZ'], [4,6,'nX','pZ'], [5,7,'pX','pZ']
        ];
        for (const [a, b, f1, f2] of edges) {
            if (vf[f1] || vf[f2]) {
                const midLocal = boxCorners[a].clone().add(boxCorners[b]).multiplyScalar(0.5);
                const worldPos = midLocal.applyMatrix4(object.matrixWorld);
                const screenPos = this.worldToPixel(worldPos);
                results.push({ worldPos, screenPos, index: `mid_${a}_${b}` });
            }
        }

        return results;
    }
    
    /**
     * Get visible edge lines of an object using logical bounding box edges for clean snapping
     * Avoids triangulated edges that cause triangle structure artifacts
     */
    getVisibleObjectEdges(object, travelAxis = null) {
        if (!object.geometry) return [];

        // Check if this is a box-like geometry (most CAD objects)
        if (this.isBoxLikeGeometry(object.geometry)) {
            // Use logical bounding box edges for clean snapping
            return this.getBoundingBoxEdges(object, travelAxis);
        }

        // For complex geometries, fall back to triangulated edges with filtering
        return this.getTriangulatedEdges(object, travelAxis);
    }

    /**
     * Check if geometry is box-like (cube, rectangular prism)
     */
    isBoxLikeGeometry(geometry) {
        if (!geometry || !geometry.index) return false;

        // Check if geometry has a reasonable number of vertices for a box
        const vertexCount = geometry.getAttribute('position')?.count || 0;
        const triangleCount = geometry.index.array.length / 3;

        // Box geometry typically has 8 vertices and 12 triangles (6 faces * 2 triangles each)
        // Allow some tolerance for variations in box creation
        return vertexCount <= 24 && triangleCount <= 36; // Allow for duplicated vertices and subdivisions
    }

    /**
     * Get triangulated edges for complex geometries (fallback method)
     */
    getTriangulatedEdges(object, travelAxis = null) {
        const edges = [];

        try {
            const edgesGeometry = new THREE.EdgesGeometry(object.geometry, 15);
            const positionAttribute = edgesGeometry.getAttribute('position');

            for (let i = 0; i < positionAttribute.count; i += 2) {
                const start = new THREE.Vector3().fromBufferAttribute(positionAttribute, i);
                const end = new THREE.Vector3().fromBufferAttribute(positionAttribute, i + 1);

                const worldStart = start.clone().applyMatrix4(object.matrixWorld);
                const worldEnd = end.clone().applyMatrix4(object.matrixWorld);

                if (worldStart.distanceTo(worldEnd) < 0.01) continue;

                const hasVisibleFace = this.edgeHasVisibleFace(object, start, end, this.camera);
                if (!hasVisibleFace) continue;

                if (travelAxis) {
                    const edgeDirection = worldEnd.clone().sub(worldStart).normalize();
                    if (Math.abs(edgeDirection.dot(travelAxis)) >= 0.3) continue;
                }

                edges.push({ start: worldStart, end: worldEnd });
            }

            // Clean up the temporary geometry
            edgesGeometry.dispose();

        } catch (error) {
            console.error('❌ Error processing geometry edges:', error);
            return this.getBoundingBoxEdges(object, travelAxis);
        }

        return edges;
    }

    /**
     * Get bounding box edges with camera-facing visibility filtering.
     * Only returns edges where at least one adjacent face points toward the camera.
     */
    getBoundingBoxEdges(object, travelAxis = null) {
        const edges = [];
        const geometry = object.geometry;

        geometry.computeBoundingBox();
        const box = geometry.boundingBox;
        if (!box) return edges;

        // Camera direction in object's local space (same as getVisibleObjectCorners)
        const objectCenter = object.getWorldPosition(new THREE.Vector3());
        const cameraDir = objectCenter.clone().sub(this.camera.position).normalize();
        const invMatrix = new THREE.Matrix4().copy(object.matrixWorld).invert();
        const localCameraDir = cameraDir.transformDirection(invMatrix);

        const vf = {
            pX: localCameraDir.x < 0, nX: localCameraDir.x > 0,
            pY: localCameraDir.y < 0, nY: localCameraDir.y > 0,
            pZ: localCameraDir.z < 0, nZ: localCameraDir.z > 0
        };

        const c = [
            new THREE.Vector3(box.min.x, box.min.y, box.min.z), // 0
            new THREE.Vector3(box.max.x, box.min.y, box.min.z), // 1
            new THREE.Vector3(box.min.x, box.max.y, box.min.z), // 2
            new THREE.Vector3(box.max.x, box.max.y, box.min.z), // 3
            new THREE.Vector3(box.min.x, box.min.y, box.max.z), // 4
            new THREE.Vector3(box.max.x, box.min.y, box.max.z), // 5
            new THREE.Vector3(box.min.x, box.max.y, box.max.z), // 6
            new THREE.Vector3(box.max.x, box.max.y, box.max.z)  // 7
        ];

        // 12 edges with their two adjacent faces
        const edgeDefs = [
            [0,1,'nY','nZ'], [1,5,'nY','pX'], [5,4,'nY','pZ'], [4,0,'nY','nX'],
            [2,3,'pY','nZ'], [3,7,'pY','pX'], [7,6,'pY','pZ'], [6,2,'pY','nX'],
            [0,2,'nX','nZ'], [1,3,'pX','nZ'], [5,7,'pX','pZ'], [4,6,'nX','pZ']
        ];

        for (const [a, b, f1, f2] of edgeDefs) {
            // Only include if at least one adjacent face is visible
            if (!vf[f1] && !vf[f2]) continue;

            const worldStart = c[a].clone().applyMatrix4(object.matrixWorld);
            const worldEnd = c[b].clone().applyMatrix4(object.matrixWorld);

            // Travel axis filter
            if (travelAxis) {
                const edgeDirection = worldEnd.clone().sub(worldStart).normalize();
                if (Math.abs(edgeDirection.dot(travelAxis)) >= 0.3) continue;
            }

            edges.push({ start: worldStart, end: worldEnd });
        }

        return edges;
    }

    /**
     * Get face snap point using raycasting
     */
    getFaceSnapPoint(object, mouseNDC) {
        // Use existing raycasting to detect face intersection
        this.inputController.raycaster.setFromCamera(mouseNDC, this.camera);
        const intersects = this.inputController.raycaster.intersectObject(object, false);
        
        if (intersects.length > 0) {
            const hit = intersects[0];
            const worldPos = hit.point;
            const screenPos = this.worldToPixel(worldPos);
            
            return {
                worldPos: worldPos,
                screenPos: screenPos,
                face: hit.face
            };
        }
        
        return null;
    }
    
    /**
     * Convert world position to pixel coordinates
     */
    worldToPixel(worldPos) {
        const canvas = this.inputController.canvas;
        const vector = worldPos.clone().project(this.camera);

        // Use clientWidth/clientHeight (CSS pixels) to match mouse event coordinates
        return {
            x: (vector.x + 1) * canvas.clientWidth / 2,
            y: (-vector.y + 1) * canvas.clientHeight / 2
        };
    }

    /**
     * Convert NDC to pixel coordinates
     */
    ndcToPixel(ndc) {
        const canvas = this.inputController.canvas;
        return {
            x: (ndc.x + 1) * canvas.clientWidth / 2,
            y: (-ndc.y + 1) * canvas.clientHeight / 2
        };
    }
    
    /**
     * Calculate screen space distance between two pixel points
     */
    getScreenDistance(pos1, pos2) {
        const dx = pos1.x - pos2.x;
        const dy = pos1.y - pos2.y;
        return Math.sqrt(dx * dx + dy * dy);
    }

    /**
     * Calculate distance from point to line segment in screen space.
     * Returns scaled distance only (legacy, used by getTriangulatedEdges callers).
     */
    getDistanceToLineSegment(point, lineStart, lineEnd) {
        const { distance } = this.getDistanceAndParamToLineSegment(point, lineStart, lineEnd);
        return distance;
    }

    /**
     * Calculate distance and parametric t from point to line segment in screen space.
     * t is clamped [0,1] — the position along the edge of the closest point.
     */
    getDistanceAndParamToLineSegment(point, lineStart, lineEnd) {
        const C = lineEnd.x - lineStart.x;
        const D = lineEnd.y - lineStart.y;
        const lenSq = C * C + D * D;

        if (lenSq < 0.01) {
            return { distance: this.getScreenDistance(point, lineStart), t: 0 };
        }

        const A = point.x - lineStart.x;
        const B = point.y - lineStart.y;
        const t = Math.max(0, Math.min(1, (A * C + B * D) / lenSq));

        const closestPoint = {
            x: lineStart.x + t * C,
            y: lineStart.y + t * D
        };

        const distance = this.getScreenDistance(point, closestPoint);
        return { distance, t };
    }
    
    /**
     * Update current snap point with stability check to prevent flickering
     */
    updateCurrentSnapPoint(snapPoint) {
        // Check if this snap point is the same as the last detected one
        const isSameAsLast = this.isSameSnapPoint(this.lastSnapPoint, snapPoint);

        if (isSameAsLast) {
            // Same snap point detected, increment stability counter
            this.stabilityFrames++;
        } else {
            // Different snap point, reset stability counter
            this.stabilityFrames = 0;
            this.lastSnapPoint = snapPoint;
        }

        // Only update if snap point is stable for required frames, or if clearing
        const shouldUpdate = !snapPoint || this.stabilityFrames >= this.requiredStableFrames;

        if (shouldUpdate) {
            const changed = !this.isSameSnapPoint(this.currentSnapPoint, snapPoint);

            this.currentSnapPoint = snapPoint;
            this.activeSnapType = snapPoint ? snapPoint.type : null;

            if (changed) {
                this.notifySnapPointChange();
            }
        }
    }
    
    /**
     * Check if two snap points are the same
     */
    isSameSnapPoint(point1, point2) {
        if (!point1 && !point2) return true;
        if (!point1 || !point2) return false;
        
        return point1.type === point2.type &&
               point1.object === point2.object &&
               point1.worldPos.distanceTo(point2.worldPos) < 0.001;
    }
    
    /**
     * Clear current snap point
     */
    clearCurrentSnapPoint() {
        if (this.currentSnapPoint) {
            this.currentSnapPoint = null;
            this.activeSnapType = null;
            this.lastSnapPoint = null;
            this.stabilityFrames = 0;
            this.notifySnapPointChange();
        }
    }
    
    /**
     * Get current snap point (for tools to use)
     */
    getCurrentSnapPoint() {
        return this.currentSnapPoint;
    }
    
    /**
     * Notify snap visualizer about snap point changes
     */
    notifySnapPointChange() {
        const snapVisualizer = window.modlerComponents?.snapVisualizer;
        if (snapVisualizer) {
            snapVisualizer.updateSnapIndicator(this.currentSnapPoint);
        }
    }
    
    /**
     * Notify UI about snap state changes via ObjectEventBus → SimpleCommunication → iframe
     */
    notifySnapStateChange() {
        if (window.objectEventBus) {
            window.objectEventBus.emit(
                window.objectEventBus.EVENT_TYPES.TOOL_STATE,
                null,
                {
                    toolState: { snapEnabled: this.isEnabled }
                },
                { source: 'snap-controller', immediate: true }
            );
        }
    }
    
    /**
     * Cleanup
     */
    destroy() {
        this.clearCurrentSnapPoint();
        this.toolSnapBehaviors.clear();
    }
}

// Export for use in main application
window.SnapController = SnapController;