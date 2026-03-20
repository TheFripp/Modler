import * as THREE from 'three';
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

        // CRITICAL FIX: Ensure geometry is centered at origin
        // BoxGeometry should be centered by default, but explicitly center it to be safe
        containerGeometry.center();

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
            const isSelected = selectionController && selectionController.isSelected(mainMesh);

            if (isSelected) {
                // Container is selected - enable raycasting for face-based tools
                originalRaycast(raycaster, intersects);
            }
            // Otherwise, raycast is blocked (select via children)
        };

        // Mark that this container has the raycast override
        mainMesh.userData.hasRaycastOverride = true;

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

    /**
     * Apply raycast override to existing container meshes
     * Used to update containers that were created before the raycast override was implemented
     */
    static applyRaycastOverrideToContainer(containerMesh) {
        if (!containerMesh || !containerMesh.userData.isContainer) {
            console.warn('applyRaycastOverrideToContainer: Invalid container mesh');
            return false;
        }

        // Check if override is already applied
        if (containerMesh.userData.hasRaycastOverride) {
            return false; // Already applied
        }

        // Store original raycast function
        const originalRaycast = containerMesh.raycast.bind(containerMesh);

        // Apply conditional raycast override
        containerMesh.raycast = function(raycaster, intersects) {
            const selectionController = window.modlerComponents?.selectionController;
            const isSelected = selectionController && selectionController.isSelected(containerMesh);

            if (isSelected) {
                // Container is selected - enable raycasting for face-based tools
                originalRaycast(raycaster, intersects);
            }
            // Otherwise, raycast is blocked (select via children)
        };

        // Mark as having override applied
        containerMesh.userData.hasRaycastOverride = true;
        return true;
    }

    /**
     * Apply raycast override to all existing containers in the scene
     * Call this once on app initialization to update old containers
     */
    static updateAllContainersWithRaycastOverride() {
        const sceneController = window.modlerComponents?.sceneController;
        if (!sceneController) {
            console.warn('updateAllContainersWithRaycastOverride: SceneController not available');
            return 0;
        }

        let updatedCount = 0;
        for (const [id, objectData] of sceneController.objects) {
            if (objectData.isContainer && objectData.mesh) {
                if (this.applyRaycastOverrideToContainer(objectData.mesh)) {
                    updatedCount++;
                }
            }
        }

        return updatedCount;
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

        // Validate inputs before creating geometry
        if (isNaN(newSize.x) || isNaN(newSize.y) || isNaN(newSize.z)) {
            console.error('Invalid container size (NaN):', newSize);
            return false;
        }
        if (isNaN(newCenter.x) || isNaN(newCenter.y) || isNaN(newCenter.z)) {
            console.error('Invalid container center (NaN):', newCenter);
            return false;
        }

        // Create new solid BoxGeometry
        let newGeometry;
        if (gFactory) {
            newGeometry = gFactory.createBoxGeometry(newSize.x, newSize.y, newSize.z);
        } else {
            newGeometry = new THREE.BoxGeometry(newSize.x, newSize.y, newSize.z);
        }

        // CRITICAL FIX: Ensure geometry is centered at origin
        // BoxGeometry should be centered by default, but explicitly center it to be safe
        newGeometry.center();


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

        // Validate position attributes before computing bounding sphere
        const positionAttr = newGeometry.getAttribute('position');
        if (positionAttr && positionAttr.array) {
            let hasNaN = false;
            for (let i = 0; i < positionAttr.array.length; i++) {
                if (isNaN(positionAttr.array[i])) {
                    hasNaN = true;
                    console.error('NaN detected in geometry position attribute at index', i,
                        'Container size:', newSize, 'Center:', newCenter);
                    break;
                }
            }
            if (!hasNaN) {
                newGeometry.computeBoundingSphere();
            }
        } else {
            newGeometry.computeBoundingSphere();
        }

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