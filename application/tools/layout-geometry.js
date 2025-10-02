// Modler V2 - Layout Geometry Utilities
// Geometry and bounds calculation utilities for layout containers
// Target: ~100 lines - focused geometry utilities

class LayoutGeometry {
    /**
     * Calculate bounding box of selected objects (now delegates to LayoutEngine for consistency)
     * @param {Array} selectedObjects - Array of mesh objects
     * @returns {Object} Bounds object with center, size, min, max
     */
    static calculateSelectionBounds(selectedObjects) {
        // Delegate to LayoutEngine's unified bounds calculation
        return window.LayoutEngine.calculateUnifiedBounds(selectedObjects, {
            type: 'selection',
            useWorldSpace: true
        });
    }
    
    /**
     * Create container geometry with clean edge visualization and collision detection
     * @param {THREE.Vector3} size - Container size
     * @returns {Object} Object with visual mesh, collision mesh, and materials
     */
    static createContainerGeometry(size, geometryFactory, materialManager) {
        console.log('LayoutGeometry.createContainerGeometry - NEW ARCHITECTURE: Creating solid-first container');

        // Use injected factories (factories are now required - no fallback access)
        const gFactory = geometryFactory;
        const mManager = materialManager;
        const resourcePool = window.modlerComponents?.resourcePool || new VisualizationResourcePool();

        // NEW ARCHITECTURE: Create solid BoxGeometry as main mesh (like regular objects)
        let containerGeometry;
        if (gFactory) {
            containerGeometry = gFactory.createBoxGeometry(size.x, size.y, size.z);
        } else {
            containerGeometry = new THREE.BoxGeometry(size.x, size.y, size.z);
        }

        // Create invisible material for main solid mesh using MaterialManager
        let mainMaterial;
        if (mManager) {
            mainMaterial = mManager.createInvisibleRaycastMaterial({
                wireframe: false   // CRITICAL: Explicitly disable wireframe rendering to prevent triangle edges
            });
        } else {
            mainMaterial = new THREE.MeshBasicMaterial({
                transparent: true,
                opacity: 0.0,
                colorWrite: false, // Don't write to color buffer - purely for raycasting
                depthWrite: false, // Don't write to depth buffer - prevents visual artifacts
                wireframe: false   // CRITICAL: Explicitly disable wireframe rendering to prevent triangle edges
            });
        }

        const mainMesh = new THREE.Mesh(containerGeometry, mainMaterial);
        // NOTE: Material-based invisibility (opacity: 0.0, colorWrite: false, depthWrite: false)
        // makes the container invisible while keeping child objects visible
        mainMesh.userData.isContainer = true;
        mainMesh.userData.containerType = 'main';

        // CONTAINER-FIRST SELECTION: Conditionally enable raycasting based on selection state
        // When NOT selected: raycast disabled (select via children)
        // When selected: raycast enabled (allow face-based tools like push/move)
        const originalRaycast = mainMesh.raycast.bind(mainMesh);
        mainMesh.raycast = function(raycaster, intersects) {
            const selectionController = window.modlerComponents?.selectionController;
            if (selectionController && selectionController.isSelected(mainMesh)) {
                // Container is selected - enable raycasting for face-based tools
                originalRaycast(raycaster, intersects);
            }
            // Otherwise, raycast is blocked (select via children)
        };

        // ARCHITECTURE SIMPLIFICATION: Wireframe creation moved to SupportMeshFactory
        // This ensures containers and objects follow identical wireframe management patterns
        // SupportMeshFactory.createObjectSupportMeshes() will create the wireframe child

        return {
            mesh: mainMesh, // Return solid mesh as main (consistent with objects)
            geometry: containerGeometry, // Original solid geometry
            material: mainMaterial,
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

        let interactiveMaterial;
        if (mManager) {
            interactiveMaterial = mManager.createInvisibleRaycastMaterial({
                side: THREE.DoubleSide, // Ensure faces can be hit from both sides
                depthTest: false, // Ensure it doesn't get occluded by child objects
                wireframe: false // Solid faces for raycasting
            });
        } else {
            interactiveMaterial = new THREE.MeshBasicMaterial({
                transparent: true,
                opacity: 0.0, // Invisible but raycastable
                side: THREE.DoubleSide, // Ensure faces can be hit from both sides
                depthTest: false, // Ensure it doesn't get occluded by child objects
                color: 0x000000, // Doesn't matter since invisible
                colorWrite: false, // Don't write to color buffer - purely for raycasting
                wireframe: false // Solid faces for raycasting
            });
        }


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
    static updateContainerGeometry(containerMesh, newSize, newCenter, shouldReposition = true, layoutDirection = null, geometryFactory, materialManager) {
        if (!containerMesh) {
            console.error('Container mesh not found for geometry update');
            return false;
        }

        // ARCHITECTURE SIMPLIFICATION: This method now ONLY updates container geometry
        // Wireframe updates are handled by SupportMeshFactory via GeometryUtils.updateSupportMeshGeometries()
        // Caller is responsible for triggering wireframe update after geometry change

        // Use injected factories
        const gFactory = geometryFactory;

        // Create new solid BoxGeometry
        let newGeometry;
        if (gFactory) {
            newGeometry = gFactory.createBoxGeometry(newSize.x, newSize.y, newSize.z);
        } else {
            newGeometry = new THREE.BoxGeometry(newSize.x, newSize.y, newSize.z);
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

        // Update main mesh geometry (solid BoxGeometry for raycasting)
        if (containerMesh.geometry) {
            containerMesh.geometry.dispose();
        }
        containerMesh.geometry = newGeometry;

        // Force matrix world update after geometry change
        containerMesh.updateMatrixWorld(true);

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
            const newInteractiveGeometry = this.createInteractiveFacesFromWireframe(newGeometry, gFactory);
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

        // Optimize raycast for updated geometry
        newGeometry.computeBoundingBox();
        newGeometry.computeBoundingSphere();

        // ARCHITECTURE SIMPLIFICATION: Wireframe update removed from here
        // Caller must explicitly call GeometryUtils.updateSupportMeshGeometries() after this method
        // This prevents double updates and ensures single source of truth

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

    // REMOVED: createLayoutAwareWireframe() - Complexity removed
    // Layout direction is now visible through child object arrangement
    // All wireframes use simple EdgesGeometry managed by SupportMeshFactory

    /**
     * Create interactive face geometry from container wireframe
     * Converts box geometry into faces that can be raycast for interaction
     * @param {THREE.BoxGeometry} containerGeometry - Original container geometry
     * @returns {THREE.BufferGeometry} Face geometry for interaction
     */
    static createInteractiveFacesFromWireframe(containerGeometry, geometryFactory) {
        // For box containers, create 6 faces that match the wireframe bounds
        if (containerGeometry.type === 'BoxGeometry' && containerGeometry.parameters) {
            const { width, height, depth } = containerGeometry.parameters;

            // Create slightly larger box geometry for reliable raycasting without oversized selection
            // Minimal increase ensures interactive mesh is hit instead of child objects
            let faceGeometry;
            const gFactory = geometryFactory;
            if (gFactory) {
                faceGeometry = gFactory.createBoxGeometry(
                    width * 1.01,  // 1% larger - enough for reliable raycasting, not user-noticeable
                    height * 1.01,
                    depth * 1.01
                );
            } else {
                faceGeometry = new THREE.BoxGeometry(
                    width * 1.01,  // 1% larger - enough for reliable raycasting, not user-noticeable
                    height * 1.01,
                    depth * 1.01
                );
            }

            return faceGeometry;
        } else {
            // Fallback: clone the original geometry for non-box containers
            return containerGeometry.clone();
        }
    }
}

// Export for use in main application
window.LayoutGeometry = LayoutGeometry;