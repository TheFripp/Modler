// Modler V2 - Layout Geometry Utilities
// Geometry and bounds calculation utilities for layout containers
// Target: ~100 lines - focused geometry utilities

class LayoutGeometry {
    /**
     * Calculate bounding box of selected objects
     * @param {Array} selectedObjects - Array of mesh objects
     * @returns {Object} Bounds object with center, size, min, max
     */
    static calculateSelectionBounds(selectedObjects) {
        if (selectedObjects.length === 0) {
            return {
                center: new THREE.Vector3(0, 0, 0),
                size: new THREE.Vector3(1, 1, 1),
                min: new THREE.Vector3(0, 0, 0),
                max: new THREE.Vector3(1, 1, 1)
            };
        }
        
        // Filter to only objects with valid geometry and compute bounding boxes
        const validObjects = selectedObjects.filter(obj => {
            if (!obj || !obj.geometry) return false;
            
            // Ensure bounding box is computed
            obj.geometry.computeBoundingBox();
            
            // Check if bounding box was successfully computed
            return obj.geometry.boundingBox !== null;
        });
        
        if (validObjects.length === 0) {
            console.warn('No valid objects with geometry found for bounds calculation');
            console.warn('Original objects:', selectedObjects.map(obj => ({
                name: obj.name || 'unnamed',
                hasGeometry: !!obj.geometry,
                geometryType: obj.geometry?.type || 'none',
                boundingBox: obj.geometry?.boundingBox
            })));
            return {
                center: new THREE.Vector3(0, 0, 0),
                size: new THREE.Vector3(1, 1, 1),
                min: new THREE.Vector3(0, 0, 0),
                max: new THREE.Vector3(1, 1, 1)
            };
        }
        
        let minX = Infinity, minY = Infinity, minZ = Infinity;
        let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
        
        validObjects.forEach(obj => {
            // Calculate object's world bounding box
            if (obj.geometry) {
                obj.geometry.computeBoundingBox();
                const box = obj.geometry.boundingBox;
                
                if (box) {
                    // Transform bounding box points to world coordinates
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
                    
                    corners.forEach(corner => {
                        // CRITICAL FIX: Use world transform matrix instead of individual transforms
                        // This ensures correct positioning regardless of object's parent hierarchy
                        corner.applyMatrix4(obj.matrixWorld);
                        
                        // Update overall bounds
                        minX = Math.min(minX, corner.x);
                        minY = Math.min(minY, corner.y);
                        minZ = Math.min(minZ, corner.z);
                        maxX = Math.max(maxX, corner.x);
                        maxY = Math.max(maxY, corner.y);
                        maxZ = Math.max(maxZ, corner.z);
                    });
                }
            }
        });
        
        // Object bounds calculated without artificial padding for exact container-child alignment

        // REMOVED: Hardcoded 0.1 padding that caused container-child offset issues
        // Container should wrap objects exactly without artificial padding
        // If padding is needed, it should come from layout config, not hardcoded values

        const min = new THREE.Vector3(minX, minY, minZ);
        const max = new THREE.Vector3(maxX, maxY, maxZ);
        const center = new THREE.Vector3(
            (minX + maxX) / 2,
            (minY + maxY) / 2,
            (minZ + maxZ) / 2
        );
        const size = new THREE.Vector3(
            maxX - minX,
            maxY - minY,
            maxZ - minZ
        );


        return { center, size, min, max };
    }
    
    /**
     * Create container geometry with clean edge visualization and collision detection
     * @param {THREE.Vector3} size - Container size
     * @returns {Object} Object with visual mesh, collision mesh, and materials
     */
    static createContainerGeometry(size) {
        console.log('LayoutGeometry.createContainerGeometry - NEW ARCHITECTURE: Creating solid-first container');

        // NEW ARCHITECTURE: Create solid BoxGeometry as main mesh (like regular objects)
        const containerGeometry = new THREE.BoxGeometry(size.x, size.y, size.z);

        // Create invisible material for main solid mesh
        const mainMaterial = new THREE.MeshBasicMaterial({
            transparent: true,
            opacity: 0.0,
            colorWrite: false, // Don't write to color buffer - purely for raycasting
            depthWrite: false, // Don't write to depth buffer - prevents visual artifacts
            wireframe: false   // CRITICAL: Explicitly disable wireframe rendering to prevent triangle edges
        });

        // Create main solid mesh
        const mainMesh = new THREE.Mesh(containerGeometry, mainMaterial);
        // NOTE: Material-based invisibility (opacity: 0.0, colorWrite: false, depthWrite: false)
        // makes the container invisible while keeping child objects visible
        mainMesh.userData.isContainer = true;
        mainMesh.userData.containerType = 'main';

        // Get container configuration for wireframe child
        const configManager = window.modlerComponents?.configurationManager;
        const wireframeColor = configManager ?
            configManager.get('visual.containers.wireframeColor', '#00ff00') : '#00ff00';
        const opacity = configManager ?
            configManager.get('visual.containers.opacity', 0.8) : 0.8;
        const renderOrder = configManager ?
            configManager.get('visual.containers.renderOrder', 998) : 998;

        // Create wireframe as CHILD of main mesh (consistent with objects)
        const edgeGeometry = new THREE.EdgesGeometry(containerGeometry);
        const wireframeMaterial = new THREE.LineBasicMaterial({
            color: new THREE.Color(wireframeColor).getHex(),
            transparent: true,
            opacity: opacity
        });

        const wireframeChild = new THREE.LineSegments(edgeGeometry, wireframeMaterial);
        wireframeChild.position.set(0, 0.001, 0); // Small Y offset to prevent z-fighting
        wireframeChild.renderOrder = renderOrder;
        wireframeChild.raycast = () => {}; // Non-raycastable (like object wireframes)
        wireframeChild.userData.supportMeshType = 'wireframe';
        wireframeChild.visible = false; // Hidden by default - shown only when container is selected

        // Add wireframe as child
        mainMesh.add(wireframeChild);

        console.log('LayoutGeometry.createContainerGeometry - Solid main mesh with wireframe child created');

        return {
            mesh: mainMesh, // Return solid mesh as main (consistent with objects)
            geometry: containerGeometry, // Original solid geometry
            material: mainMaterial,
            wireframeChild: wireframeChild, // Reference to wireframe child
            isInteractiveMeshSceneLevel: false // No longer needed - support meshes will be children
        };
    }

    // REMOVED: Old complex createContainerGeometry method with scene-level interactive mesh
    static createContainerGeometry_OLD(size) {

        // Create container box geometry for collision detection
        const containerGeometry = new THREE.BoxGeometry(size.x, size.y, size.z);

        // Get container configuration values
        const configManager = window.modlerComponents?.configurationManager;
        const wireframeColor = configManager ?
            configManager.get('visual.containers.wireframeColor', '#00ff00') : '#00ff00';
        const opacity = configManager ?
            configManager.get('visual.containers.opacity', 0.8) : 0.8;
        const lineWidth = configManager ?
            configManager.get('visual.containers.lineWidth', 1) : 1;
        const renderOrder = configManager ?
            configManager.get('visual.containers.renderOrder', 998) : 998;

        // Convert hex color to THREE.js color
        const color = new THREE.Color(wireframeColor).getHex();

        // Try to use centralized VisualEffects wireframe creation to prevent triangulation issues
        const visualEffects = window.modlerComponents?.visualEffects;
        let edgeContainer, edgeMaterial;

        if (visualEffects) {

            // Use centralized wireframe creation (prevents triangles)
            edgeContainer = visualEffects.createPreviewBox(
                size.x, size.y, size.z,
                new THREE.Vector3(0, 0, 0), // Position at origin, will be positioned by SceneController
                color, // Use configured color
                opacity // Use configured opacity
            );
            edgeMaterial = edgeContainer.material;


            // Update line width if supported
            if (edgeMaterial && edgeMaterial.linewidth !== undefined) {
                edgeMaterial.linewidth = lineWidth;
            }
        } else {
            // Fallback to manual wireframe creation if VisualEffects not available
            console.warn('VisualEffects not available, using fallback wireframe creation');

            const edgeGeometry = new THREE.EdgesGeometry(containerGeometry);
            edgeMaterial = new THREE.LineBasicMaterial({
                color: color, // Use configured color
                linewidth: lineWidth, // Use configured line width
                transparent: true,
                opacity: opacity // Use configured opacity
            });
            edgeContainer = new THREE.LineSegments(edgeGeometry, edgeMaterial);

        }
        
        // Use configured renderOrder to ensure wireframes render after solid objects but remain visible during orbit
        edgeContainer.renderOrder = renderOrder;

        // Add small Y-offset to prevent z-fighting with floor grid when objects are at y=0
        // This ensures wireframes appear slightly above the grid level without going through geometry
        edgeContainer.position.y += 0.001;
        
        // Create interactive face geometry from wireframe for reliable face detection
        // This eliminates the need for separate collision meshes and child object conflicts
        const faceGeometry = this.createInteractiveFacesFromWireframe(containerGeometry);

        const interactiveMaterial = new THREE.MeshBasicMaterial({
            transparent: true,
            opacity: 0.0, // Invisible but raycastable
            side: THREE.DoubleSide, // Ensure faces can be hit from both sides
            depthTest: false, // Ensure it doesn't get occluded by child objects
            color: 0x000000, // Doesn't matter since invisible
            colorWrite: false, // Don't write to color buffer - purely for raycasting
            wireframe: false // Solid faces for raycasting
        });


        const interactiveMesh = new THREE.Mesh(faceGeometry, interactiveMaterial);
        interactiveMesh.visible = false; // Hidden by default - only visible when needed for interaction
        interactiveMesh.renderOrder = 1000; // Higher than wireframe for raycasting priority
        interactiveMesh.userData.isContainerInteractive = true;
        interactiveMesh.userData.isContainerCollision = true;  // For tool compatibility
        interactiveMesh.userData.containerType = 'interactive';


        // CRITICAL FIX: Add interactive mesh to scene instead of container child
        // This ensures it remains visible and raycastable even when wireframe is hidden
        const scene = window.modlerComponents?.sceneFoundation?.scene;
        if (scene) {
            scene.add(interactiveMesh);

            // Position at origin initially - will be positioned by SceneController when container is added
            interactiveMesh.position.set(0, 0, 0);

            // Store reference to container for position syncing
            interactiveMesh.userData.containerMesh = edgeContainer;

            // ARCHITECTURAL FIX: Register interactive mesh separately as selectable
            // This allows it to be hit by raycast when wireframe is non-selectable
            const sceneController = window.modlerComponents?.sceneController;
            if (sceneController) {
                // Register interactive mesh as its own selectable object
                const interactiveMeshObject = sceneController.addObject(interactiveMesh, null, {
                    name: edgeContainer.name + ' (Interactive)',
                    type: 'container-interactive',
                    selectable: true, // INTERACTIVE MESH IS SELECTABLE
                    category: 'system', // System object, not user-created
                    isContainer: false, // Not a container itself, but container interaction
                    parentContainer: null // Will be linked to container via userData
                });

            }

        } else {
            console.warn('Scene not available, adding interactive mesh as container child (may have visibility issues)');
            edgeContainer.add(interactiveMesh);
            interactiveMesh.position.set(0, 0, 0);
        }

        // Update matrices for proper raycasting
        interactiveMesh.updateMatrixWorld(true);

        // Make visual container invisible by default - only show when selected
        edgeContainer.visible = false;

        // Interactive mesh is now independent and always visible for selection
        interactiveMesh.visible = true;
        
        // CRITICAL FIX: DISABLE wireframe raycasting - only interactive mesh should be raycastable
        // The wireframe is purely visual - collision detection should go through interactive mesh only
        edgeContainer.raycast = () => {}; // Disable raycasting on wireframe

        
        // Mark the visual container with container metadata
        edgeContainer.userData.isContainer = true;
        edgeContainer.userData.containerType = 'visual';


        // Optimize raycast for more precise clicking
        if (edgeContainer.geometry) {
            edgeContainer.geometry.computeBoundingBox();
            edgeContainer.geometry.computeBoundingSphere();

        }
        containerGeometry.computeBoundingBox();
        containerGeometry.computeBoundingSphere();
        
        return {
            mesh: edgeContainer,
            interactiveMesh: interactiveMesh,
            geometry: edgeContainer.geometry,
            interactiveGeometry: faceGeometry,
            material: edgeMaterial,
            interactiveMaterial: interactiveMaterial,
            isInteractiveMeshSceneLevel: !!scene // Flag to indicate if interactive mesh is at scene level
        };
    }
    
    /**
     * Update container geometry to new size
     * @param {THREE.Object3D} containerMesh - Container mesh to update
     * @param {THREE.Vector3} newSize - New container size
     * @param {THREE.Vector3} newCenter - New container center position
     * @param {boolean} shouldReposition - Whether to update container position (default: true)
     */
    static updateContainerGeometry(containerMesh, newSize, newCenter, shouldReposition = true) {
        if (!containerMesh) {
            console.error('Container mesh not found for geometry update');
            return false;
        }
        
        // Container visibility is managed entirely by selection system
        // Geometry updates should not interfere with visibility state
        
        // Get container configuration values
        const configManager = window.modlerComponents?.configurationManager;
        const wireframeColor = configManager ?
            configManager.get('visual.containers.wireframeColor', '#00ff00') : '#00ff00';
        const opacity = configManager ?
            configManager.get('visual.containers.opacity', 0.8) : 0.8;
        const lineWidth = configManager ?
            configManager.get('visual.containers.lineWidth', 1) : 1;
        const renderOrder = configManager ?
            configManager.get('visual.containers.renderOrder', 998) : 998;

        // Convert hex color to THREE.js color
        const color = new THREE.Color(wireframeColor).getHex();

        // Try to create new wireframe using centralized function (prevents triangles)
        const visualEffects = window.modlerComponents?.visualEffects;
        let newEdgeGeometry, newMaterial;
        const newGeometry = new THREE.BoxGeometry(newSize.x, newSize.y, newSize.z);

        if (visualEffects) {
            // Use centralized wireframe creation
            const newWireframe = visualEffects.createPreviewBox(
                newSize.x, newSize.y, newSize.z,
                new THREE.Vector3(0, 0, 0), // Position will be set below
                color, // Use configured color
                opacity // Use configured opacity
            );
            newEdgeGeometry = newWireframe.geometry;
            newMaterial = newWireframe.material;

            // Update line width if supported
            if (newMaterial && newMaterial.linewidth !== undefined) {
                newMaterial.linewidth = lineWidth;
            }

            // Clean up the temporary wireframe object (we only needed its geometry and material)
            newWireframe.geometry = null; // Don't dispose, we're using it
            newWireframe.material = null; // Don't dispose, we're using it
        } else {
            // Fallback to manual wireframe creation
            console.warn('VisualEffects not available, using fallback wireframe update');
            newEdgeGeometry = new THREE.EdgesGeometry(newGeometry);
            newMaterial = new THREE.LineBasicMaterial({
                color: color, // Use configured color
                linewidth: lineWidth, // Use configured line width
                transparent: true,
                opacity: opacity // Use configured opacity
            });
        }
        
        // Find interactive mesh - check both as child and at scene level
        let interactiveMesh = containerMesh.children.find(child =>
            child.userData.isContainerInteractive
        );

        // If not found as child, look for scene-level interactive mesh linked to this container
        if (!interactiveMesh) {
            const scene = window.modlerComponents?.sceneFoundation?.scene;
            if (scene) {
                scene.traverse((object) => {
                    if (object.userData.isContainerInteractive &&
                        object.userData.containerMesh === containerMesh) {
                        interactiveMesh = object;
                    }
                });
            }
        }

        // NEW ARCHITECTURE: Update wireframe child, not main mesh
        // Main mesh should always remain solid BoxGeometry with invisible material

        // Update main mesh geometry (solid BoxGeometry for raycasting)
        if (containerMesh.geometry) {
            containerMesh.geometry.dispose();
        }
        containerMesh.geometry = newGeometry; // Keep as solid BoxGeometry

        // Find and update wireframe child
        const wireframeChild = containerMesh.children.find(child =>
            child.userData.supportMeshType === 'wireframe'
        );

        if (wireframeChild) {
            // Dispose old wireframe geometry
            if (wireframeChild.geometry) {
                wireframeChild.geometry.dispose();
            }

            // Update wireframe child with new edge geometry and material
            wireframeChild.geometry = newEdgeGeometry;
            wireframeChild.material = newMaterial;
            wireframeChild.renderOrder = renderOrder;
        } else {
            console.warn('updateContainerGeometry: wireframe child not found in container');
        }

        // Dispose old interactive mesh geometry
        if (interactiveMesh && interactiveMesh.geometry) {
            interactiveMesh.geometry.dispose();
        }

        // UNIFIED POSITION MANAGEMENT: All container-related meshes must stay together
        const finalContainerPosition = shouldReposition ? newCenter : containerMesh.position;

        // Update container position if requested
        if (shouldReposition) {
            containerMesh.position.copy(newCenter);
        }

        // Update interactive mesh geometry if it exists
        if (interactiveMesh) {

            // Create new interactive face geometry
            const newInteractiveGeometry = this.createInteractiveFacesFromWireframe(newGeometry);
            interactiveMesh.geometry = newInteractiveGeometry;

            // Ensure interactive mesh properties for reliable raycasting
            if (interactiveMesh.material) {
                interactiveMesh.material.depthTest = false;
                interactiveMesh.material.opacity = 0.0; // Keep invisible
            }
            interactiveMesh.renderOrder = 1000;

            // UNIFIED POSITION MANAGEMENT: Interactive mesh ALWAYS matches container position
            if (interactiveMesh.parent === containerMesh) {
                // Interactive mesh is child of container - keep at (0,0,0) relative position
                interactiveMesh.position.set(0, 0, 0);
            } else {
                // Interactive mesh is at scene level - ALWAYS match container position
                interactiveMesh.position.copy(finalContainerPosition);
            }


            // CRITICAL FIX: Force matrix world update after geometry change for proper raycasting
            interactiveMesh.updateMatrixWorld(true);
        }
        
        // Visibility is entirely managed by selection system - don't interfere here

        // Geometry update completed successfully
        
        // Optimize raycast for updated geometry
        newEdgeGeometry.computeBoundingBox();
        newEdgeGeometry.computeBoundingSphere();
        newGeometry.computeBoundingBox();
        newGeometry.computeBoundingSphere();
        
        // Update support mesh geometries to match new container geometry
        const supportMeshFactory = window.SupportMeshFactory ? new SupportMeshFactory() : null;
        if (supportMeshFactory) {
            supportMeshFactory.updateSupportMeshGeometries(containerMesh);
        }

        // CRITICAL FIX: Force MeshSynchronizer to update all related meshes after geometry change
        // This ensures selection wireframes and other related meshes get updated geometry
        const meshSynchronizer = window.modlerComponents?.meshSynchronizer;
        if (meshSynchronizer) {
            // Force geometry sync for all related meshes (selection wireframes, etc.)
            meshSynchronizer.syncAllRelatedMeshes(containerMesh, 'geometry');
        }
        
        return true;
    }

    /**
     * Update all existing container wireframes with new configuration values
     * Called when container visual configuration changes
     */
    static updateAllContainerMaterials() {
        const sceneController = window.modlerComponents?.sceneController;
        const configManager = window.modlerComponents?.configurationManager;

        if (!sceneController || !configManager) {
            // Don't warn during initialization - this is expected
            return false;
        }

        // Check if scene controller is fully initialized
        if (!sceneController.getAllObjects) {
            return false;
        }

        // Get new configuration values
        const wireframeColor = configManager.get('visual.containers.wireframeColor', '#00ff00');
        const opacity = configManager.get('visual.containers.opacity', 0.8);
        const lineWidth = configManager.get('visual.containers.lineWidth', 1);
        const renderOrder = configManager.get('visual.containers.renderOrder', 998);

        // Convert hex color to THREE.js color
        const color = new THREE.Color(wireframeColor).getHex();

        // Get all container objects
        const allObjects = sceneController.getAllObjects();
        let updatedCount = 0;

        allObjects.forEach(objectData => {
            if (objectData.isContainer && objectData.mesh) {
                const containerMesh = objectData.mesh;

                // Update material properties
                if (containerMesh.material) {
                    containerMesh.material.color.setHex(color);
                    containerMesh.material.opacity = opacity;
                    containerMesh.material.transparent = opacity < 1.0;

                    // Update line width if supported
                    if (containerMesh.material.linewidth !== undefined) {
                        containerMesh.material.linewidth = lineWidth;
                    }

                    // Update render order
                    containerMesh.renderOrder = renderOrder;

                    // Mark material for update
                    containerMesh.material.needsUpdate = true;

                    updatedCount++;
                }
            }
        });

        return updatedCount > 0;
    }

    /**
     * Create interactive face geometry from container wireframe
     * Converts box geometry into faces that can be raycast for interaction
     * @param {THREE.BoxGeometry} containerGeometry - Original container geometry
     * @returns {THREE.BufferGeometry} Face geometry for interaction
     */
    static createInteractiveFacesFromWireframe(containerGeometry) {
        // For box containers, create 6 faces that match the wireframe bounds
        if (containerGeometry.type === 'BoxGeometry' && containerGeometry.parameters) {
            const { width, height, depth } = containerGeometry.parameters;

            // Create slightly larger box geometry for reliable raycasting without oversized selection
            // Minimal increase ensures interactive mesh is hit instead of child objects
            const faceGeometry = new THREE.BoxGeometry(
                width * 1.01,  // 1% larger - enough for reliable raycasting, not user-noticeable
                height * 1.01,
                depth * 1.01
            );

            return faceGeometry;
        } else {
            // Fallback: clone the original geometry for non-box containers
            return containerGeometry.clone();
        }
    }
}

// Export for use in main application
window.LayoutGeometry = LayoutGeometry;