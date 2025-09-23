/**
 * Snap Controller
 * Centralized snapping system for precise object positioning
 * Target: ~200 lines - snap point detection, proximity testing, tool integration
 */

class SnapController {
    constructor(scene, camera, inputController) {
        this.scene = scene;
        this.camera = camera;
        this.inputController = inputController;

        // Centralized snap state
        this.isEnabled = true; // Default on
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
        } else {
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
    updateSnapDetection(activeToolName, selectedObjects = [], travelAxis = null, geometricConstraints = null) {
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

        // Get objects to check
        const objectsToCheck = this.getObjectsForSnapping(selectedObjects);


        // Find closest snap point within threshold
        const snapPoint = this.findClosestSnapPoint(mouseNDC, toolBehavior.snapPointTypes, selectedObjects, travelAxis, geometricConstraints);

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
    findClosestSnapPoint(mouseNDC, allowedTypes, selectedObjects, travelAxis = null, geometricConstraints = null) {
        const mousePixel = this.ndcToPixel(mouseNDC);
        let closestSnapPoint = null;
        let closestDistance = this.snapThreshold;
        
        // Get all objects to check for snap points
        const objectsToCheck = this.getObjectsForSnapping(selectedObjects);
        
        for (const object of objectsToCheck) {
            // Check corners - only visible ones for better accuracy
            if (allowedTypes.includes('corner')) {
                const corners = this.getVisibleObjectCorners(object);

                for (const corner of corners) {
                    const distance = this.getScreenDistance(corner.screenPos, mousePixel);

                    // Give corners priority by reducing their effective distance
                    const adjustedDistance = distance * 0.7; // 30% distance advantage over edges

                    if (adjustedDistance < closestDistance) {
                        const candidateSnapPoint = {
                            type: 'corner',
                            worldPos: corner.worldPos,
                            screenPos: corner.screenPos,
                            object: object,
                            distance: distance // Store real distance for display
                        };

                        // Apply geometric constraints if provided
                        if (this.isValidSnapPoint(candidateSnapPoint, geometricConstraints)) {
                            closestDistance = adjustedDistance;
                            closestSnapPoint = candidateSnapPoint;
                        }
                    }
                }
            }
            
            // Check edges with line-to-point distance for better hit detection
            if (allowedTypes.includes('edge')) {
                const edges = this.getVisibleObjectEdges(object, travelAxis);

                for (const edge of edges) {
                    // Calculate distance from mouse to the edge line in screen space
                    const startScreen = this.worldToPixel(edge.start);
                    const endScreen = this.worldToPixel(edge.end);

                    const distance = this.getDistanceToLineSegment(mousePixel, startScreen, endScreen);

                    if (distance < closestDistance) {
                        const candidateSnapPoint = {
                            type: 'edge',
                            worldPos: edge.worldPos, // Use midpoint for visualization
                            screenPos: edge.screenPos,
                            object: object,
                            distance: distance,
                            edgeStart: edge.start,
                            edgeEnd: edge.end
                        };

                        // Apply geometric constraints if provided
                        if (this.isValidSnapPoint(candidateSnapPoint, geometricConstraints)) {
                            closestDistance = distance;
                            closestSnapPoint = candidateSnapPoint;
                        }
                    }
                }
            }
            
            // DISABLED: Face snapping conflicts with corner/edge precision
            // Faces always win with 0.0 distance due to raycasting returning exact mouse intersection
            // if (allowedTypes.includes('face')) {
            //     const facePoint = this.getFaceSnapPoint(object, mouseNDC);
            //     if (facePoint) {
            //         const distance = this.getScreenDistance(facePoint.screenPos, mousePixel);
            //         if (distance < closestDistance) {
            //             closestDistance = distance;
            //             closestSnapPoint = {
            //                 type: 'face',
            //                 worldPos: facePoint.worldPos,
            //                 screenPos: facePoint.screenPos,
            //                 object: object,
            //                 distance: distance,
            //                 face: facePoint.face
            //             };
            //         }
            //     }
            // }
        }
        
        return closestSnapPoint;
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
        // Check all scene objects except selected ones, ALL containers, and floor
        const objectsToCheck = [];

        this.scene.traverse((child) => {
            if (child.isMesh && child.geometry && child.visible) {
                // Check if it's a floor object
                const isFloor = this.isFloorObject(child);
                const isSelected = selectedObjects.includes(child);
                const isContainerRelated = this.isContainerRelatedMesh(child);

                if (isFloor) {
                    // Floor object excluded from snapping
                } else if (isSelected) {
                    // Selected/manipulated object excluded from snapping to prevent self-snapping
                } else if (isContainerRelated) {
                    // ALL container-related meshes excluded from snapping
                } else {
                    objectsToCheck.push(child);
                }
            }
        });
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
     * Get visible corner points of an object using precise geometry analysis
     */
    getVisibleObjectCorners(object) {
        if (!object.geometry) return [];

        const corners = [];
        const geometry = object.geometry;

        // Get bounding box corners - use actual geometry vertices for precision
        geometry.computeBoundingBox();
        const box = geometry.boundingBox;

        if (!box) return [];

        // All 8 corners of the bounding box
        const boxCorners = [
            new THREE.Vector3(box.min.x, box.min.y, box.min.z), // 0: min corner
            new THREE.Vector3(box.max.x, box.min.y, box.min.z), // 1: +X
            new THREE.Vector3(box.min.x, box.max.y, box.min.z), // 2: +Y
            new THREE.Vector3(box.max.x, box.max.y, box.min.z), // 3: +XY
            new THREE.Vector3(box.min.x, box.min.y, box.max.z), // 4: +Z
            new THREE.Vector3(box.max.x, box.min.y, box.max.z), // 5: +XZ
            new THREE.Vector3(box.min.x, box.max.y, box.max.z), // 6: +YZ
            new THREE.Vector3(box.max.x, box.max.y, box.max.z)  // 7: max corner
        ];

        for (let i = 0; i < boxCorners.length; i++) {
            const corner = boxCorners[i];

            // Transform to world space with proper matrix application
            const worldPos = corner.clone().applyMatrix4(object.matrixWorld);

            // Improved visibility check: corner must be in camera's view frustum
            const screenPos = this.worldToPixel(worldPos);
            const canvas = this.inputController.canvas;

            // Check if corner is within screen bounds (with margin for edge cases)
            const inScreenBounds = screenPos.x >= -20 && screenPos.x <= canvas.width + 20 &&
                                   screenPos.y >= -20 && screenPos.y <= canvas.height + 20;

            if (inScreenBounds) {
                // Additional check: ensure corner is not behind the camera
                const cameraToCorner = worldPos.clone().sub(this.camera.position);
                const distance = cameraToCorner.length();

                // Don't include corners that are too close or too far
                if (distance > this.camera.near && distance < this.camera.far) {
                    corners.push({
                        worldPos: worldPos.clone(), // Ensure clean copy
                        screenPos: screenPos,
                        index: i // Include corner index for debugging
                    });
                }
            }
        }

        return corners;
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
            // For complex geometries, use angle-based edge detection
            const edgesGeometry = new THREE.EdgesGeometry(object.geometry, 15); // 15 degree threshold
            const positionAttribute = edgesGeometry.getAttribute('position');

            // Process edge pairs (every 2 vertices form an edge)
            for (let i = 0; i < positionAttribute.count; i += 2) {
                const start = new THREE.Vector3();
                const end = new THREE.Vector3();

                start.fromBufferAttribute(positionAttribute, i);
                end.fromBufferAttribute(positionAttribute, i + 1);

                // Transform to world space
                const worldStart = start.clone().applyMatrix4(object.matrixWorld);
                const worldEnd = end.clone().applyMatrix4(object.matrixWorld);
                const worldMidpoint = worldStart.clone().lerp(worldEnd, 0.5);

                // Check if edge has reasonable length
                const edgeLength = worldStart.distanceTo(worldEnd);
                if (edgeLength < 0.01) continue;

                // VISIBILITY CHECK: Check if edge has at least one visible adjacent face
                const camera = this.inputController.camera;
                const hasVisibleFace = this.edgeHasVisibleFace(object, start, end, camera);
                if (!hasVisibleFace) continue;

                // Convert to screen space
                const startScreen = this.worldToPixel(worldStart);
                const endScreen = this.worldToPixel(worldEnd);
                const screenPos = this.worldToPixel(worldMidpoint);

                // Check if edge is on screen
                const canvas = this.inputController.canvas;
                const isOnScreen = (startScreen.x >= -100 && startScreen.x <= canvas.width + 100 &&
                                   startScreen.y >= -100 && startScreen.y <= canvas.height + 100) ||
                                  (endScreen.x >= -100 && endScreen.x <= canvas.width + 100 &&
                                   endScreen.y >= -100 && endScreen.y <= canvas.height + 100);

                if (isOnScreen) {
                    // Filter edges based on travel axis if provided
                    let includeEdge = true;

                    if (travelAxis) {
                        const edgeDirection = worldEnd.clone().sub(worldStart).normalize();
                        const dotProduct = Math.abs(edgeDirection.dot(travelAxis));
                        includeEdge = dotProduct < 0.3; // Only perpendicular edges
                    }

                    if (includeEdge) {
                        edges.push({
                            worldPos: worldMidpoint,
                            screenPos: screenPos,
                            start: worldStart,
                            end: worldEnd
                        });
                    }
                }
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
     * Fallback method: Get bounding box edges when geometry processing fails
     */
    getBoundingBoxEdges(object, travelAxis = null) {
        const edges = [];
        const geometry = object.geometry;

        geometry.computeBoundingBox();
        const box = geometry.boundingBox;

        if (!box) return edges;

        // Define the 12 edges of a bounding box
        const boxEdges = [
            // Bottom face edges (4 edges)
            [new THREE.Vector3(box.min.x, box.min.y, box.min.z), new THREE.Vector3(box.max.x, box.min.y, box.min.z)],
            [new THREE.Vector3(box.max.x, box.min.y, box.min.z), new THREE.Vector3(box.max.x, box.min.y, box.max.z)],
            [new THREE.Vector3(box.max.x, box.min.y, box.max.z), new THREE.Vector3(box.min.x, box.min.y, box.max.z)],
            [new THREE.Vector3(box.min.x, box.min.y, box.max.z), new THREE.Vector3(box.min.x, box.min.y, box.min.z)],
            // Top face edges (4 edges)
            [new THREE.Vector3(box.min.x, box.max.y, box.min.z), new THREE.Vector3(box.max.x, box.max.y, box.min.z)],
            [new THREE.Vector3(box.max.x, box.max.y, box.min.z), new THREE.Vector3(box.max.x, box.max.y, box.max.z)],
            [new THREE.Vector3(box.max.x, box.max.y, box.max.z), new THREE.Vector3(box.min.x, box.max.y, box.max.z)],
            [new THREE.Vector3(box.min.x, box.max.y, box.max.z), new THREE.Vector3(box.min.x, box.max.y, box.min.z)],
            // Vertical edges (4 edges)
            [new THREE.Vector3(box.min.x, box.min.y, box.min.z), new THREE.Vector3(box.min.x, box.max.y, box.min.z)],
            [new THREE.Vector3(box.max.x, box.min.y, box.min.z), new THREE.Vector3(box.max.x, box.max.y, box.min.z)],
            [new THREE.Vector3(box.max.x, box.min.y, box.max.z), new THREE.Vector3(box.max.x, box.max.y, box.max.z)],
            [new THREE.Vector3(box.min.x, box.min.y, box.max.z), new THREE.Vector3(box.min.x, box.max.y, box.max.z)]
        ];

        for (const [start, end] of boxEdges) {
            const worldStart = start.clone().applyMatrix4(object.matrixWorld);
            const worldEnd = end.clone().applyMatrix4(object.matrixWorld);
            const worldMidpoint = worldStart.clone().lerp(worldEnd, 0.5);

            const startScreen = this.worldToPixel(worldStart);
            const endScreen = this.worldToPixel(worldEnd);
            const screenPos = this.worldToPixel(worldMidpoint);

            const canvas = this.inputController.canvas;
            const isOnScreen = (startScreen.x >= -100 && startScreen.x <= canvas.width + 100 &&
                               startScreen.y >= -100 && startScreen.y <= canvas.height + 100) ||
                              (endScreen.x >= -100 && endScreen.x <= canvas.width + 100 &&
                               endScreen.y >= -100 && endScreen.y <= canvas.height + 100);

            if (isOnScreen) {
                let includeEdge = true;

                if (travelAxis) {
                    const edgeDirection = worldEnd.clone().sub(worldStart).normalize();
                    const dotProduct = Math.abs(edgeDirection.dot(travelAxis));
                    includeEdge = dotProduct < 0.3;
                }

                if (includeEdge) {
                    edges.push({
                        worldPos: worldMidpoint,
                        screenPos: screenPos,
                        start: worldStart,
                        end: worldEnd
                    });
                }
            }
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
        
        return {
            x: (vector.x + 1) * canvas.width / 2,
            y: (-vector.y + 1) * canvas.height / 2
        };
    }
    
    /**
     * Convert NDC to pixel coordinates
     */
    ndcToPixel(ndc) {
        const canvas = this.inputController.canvas;
        return {
            x: (ndc.x + 1) * canvas.width / 2,
            y: (-ndc.y + 1) * canvas.height / 2
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
     * Calculate distance from point to line segment in screen space with enhanced precision
     */
    getDistanceToLineSegment(point, lineStart, lineEnd) {
        const A = point.x - lineStart.x;
        const B = point.y - lineStart.y;
        const C = lineEnd.x - lineStart.x;
        const D = lineEnd.y - lineStart.y;

        const dot = A * C + B * D;
        const lenSq = C * C + D * D;

        if (lenSq < 0.01) {
            // Line segment is too short, treat as point
            return this.getScreenDistance(point, lineStart);
        }

        let param = dot / lenSq;

        // Enhanced clamping: allow slight extension beyond line segment for easier hitting
        const tolerance = 0.1; // 10% extension on each side
        if (param < -tolerance) param = -tolerance;
        else if (param > 1 + tolerance) param = 1 + tolerance;

        const closestPoint = {
            x: lineStart.x + param * C,
            y: lineStart.y + param * D
        };

        const distance = this.getScreenDistance(point, closestPoint);

        // Apply distance scaling for edges - make edges slightly easier to hit
        return distance * 0.85; // Reduce effective distance by 15% for edges
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
     * Notify UI about snap state changes
     */
    notifySnapStateChange() {
        // Update snap button UI state
        const snapButton = document.getElementById('snap-toggle');
        if (snapButton) {
            snapButton.classList.toggle('active', this.isEnabled);
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