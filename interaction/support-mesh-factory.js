// Modler V2 - Support Mesh Factory
// Creates all support meshes (selection wireframe, face highlights, interaction mesh) as children
// Implements "create once, show/hide only" architecture

class SupportMeshFactory {
    constructor(geometryFactory = null, materialManager = null) {
        // Use injected factories (Phase 1 - Factory Consolidation)
        // Fallback to new instances for backward compatibility during transition
        this.geometryFactory = geometryFactory || new GeometryFactory();
        this.materialManager = materialManager || new MaterialManager();
        this.resourcePool = new VisualizationResourcePool();

        // Material cache for reuse - now managed by MaterialManager
        this.materials = {
            selectionWireframe: null,
            faceHighlight: null,
            faceHighlightContainer: null,
            faceHighlightDisabled: null, // Grey color for disabled tool states
            containerWireframe: null,
            containerInteractive: null,
            cadWireframe: null
        };

        this.createBaseMaterials();
    }

    /**
     * Create base materials using MaterialManager for centralized management
     */
    createBaseMaterials() {
        // Use MaterialManager for centralized material creation and caching
        this.materials.selectionWireframe = this.materialManager.createSelectionEdgeMaterial();
        this.materials.faceHighlight = this.materialManager.createFaceHighlightMaterial();
        this.materials.faceHighlightContainer = this.materialManager.createContainerFaceHighlightMaterial();

        // Create disabled state material via MaterialManager
        // This material type is only updated for opacity changes, NOT color changes
        // Maintains grey color (0x888888) while syncing opacity with other face highlights
        this.materials.faceHighlightDisabled = this.materialManager.createDisabledFaceHighlightMaterial();

        this.materials.containerWireframe = this.materialManager.createContainerWireframeMaterial();
        this.materials.cadWireframe = this.materialManager.createCadEdgeMaterial();

        // Container interactive material - specialized invisible raycasting material
        // Using MaterialManager's invisible raycast material method for better resource management
        this.materials.containerInteractive = this.materialManager.createInvisibleRaycastMaterial({
            side: THREE.DoubleSide,
            depthTest: true // Enable depth test for proper rendering
        });

        // Update existing objects to use new materials
        // This is needed when materials are recreated after ConfigurationManager initialization
        this.updateExistingFaceHighlightMaterials();
    }

    /**
     * Update all existing face highlight meshes to use the new pooled materials
     * Called after materials are recreated to ensure all objects use updated materials
     */
    updateExistingFaceHighlightMaterials() {
        const sceneController = window.modlerComponents?.sceneController;
        if (!sceneController) return;

        let updatedCount = 0;

        // Iterate through all objects and update their face highlight materials
        for (const [id, objectData] of sceneController.objects) {
            const mesh = objectData.mesh;
            if (!mesh || !mesh.userData.supportMeshes) continue;

            const faceHighlight = mesh.userData.supportMeshes.faceHighlight;
            if (!faceHighlight) continue;

            // Determine correct material based on object type
            const isContainer = mesh.userData.isContainer;
            const newMaterial = isContainer
                ? this.materials.faceHighlightContainer
                : this.materials.faceHighlight;

            // Update the material reference
            if (faceHighlight.material !== newMaterial) {
                faceHighlight.material = newMaterial;
                updatedCount++;
            }
        }
    }

    /**
     * Refresh base materials to pick up new configuration values
     * Called by MaterialManager when configuration changes
     */
    refreshBaseMaterials() {
        // Note: We DON'T recreate materials here because MaterialManager.updateMaterialsOfType
        // already updates the existing material instances. The materials are shared references,
        // so updates to them automatically apply to all objects using them.
        // This method exists for future use if we need to handle material recreation.
    }

    /**
     * Create all support meshes for any object (unified for regular objects and containers)
     */
    createObjectSupportMeshes(mainMesh) {
        // Check if this is a container
        const isContainer = mainMesh.userData.isContainer;

        // ARCHITECTURE SIMPLIFICATION: Unified support mesh creation for containers and objects
        // Containers now create wireframes just like objects (no special registration logic)

        // CLEANUP: Remove any legacy support meshes if they exist
        if (mainMesh.userData.supportMeshes) {
            const oldSupportMeshes = mainMesh.userData.supportMeshes;
            Object.entries(oldSupportMeshes).forEach(([key, mesh]) => {
                if (mesh) {
                    mainMesh.remove(mesh);
                    if (mesh.geometry) {
                        this.geometryFactory.returnGeometry(mesh.geometry, 'edge');
                    }
                    if (mesh.material &&
                        mesh.material !== this.materials.faceHighlight &&
                        mesh.material !== this.materials.faceHighlightContainer) {
                        this.materialManager.disposeMaterial(mesh.material);
                    }
                }
            });
        }

        // Create support meshes - containers and objects use same pattern
        const supportMeshes = isContainer ? {
            faceHighlight: this.createFaceHighlight(mainMesh, true), // true = isContainer
            interactiveMesh: this.createContainerInteractiveMesh(mainMesh),
            cadWireframe: this.createContainerWireframe(mainMesh) // Containers use containerWireframe for ContainerVisualizer compatibility
        } : {
            selectionWireframe: this.createSelectionWireframe(mainMesh),
            faceHighlight: this.createFaceHighlight(mainMesh, false), // false = not container
            cadWireframe: this.createCadWireframe(mainMesh)
        };

        // Add as children of main mesh (only if they were created successfully)
        if (supportMeshes.selectionWireframe) {
            mainMesh.add(supportMeshes.selectionWireframe);
            supportMeshes.selectionWireframe.visible = false;
        }
        if (supportMeshes.faceHighlight) {
            mainMesh.add(supportMeshes.faceHighlight);
            supportMeshes.faceHighlight.visible = false;
        }
        if (supportMeshes.cadWireframe) {
            mainMesh.add(supportMeshes.cadWireframe);
            // Containers: hidden by default, shown when selected
            // Objects: visible by default for CAD wireframes
            supportMeshes.cadWireframe.visible = !isContainer;
        }
        if (supportMeshes.interactiveMesh) {
            mainMesh.add(supportMeshes.interactiveMesh);
            supportMeshes.interactiveMesh.visible = true; // Must be visible for raycasting - material is already transparent
        }

        // Store references for easy access
        mainMesh.userData.supportMeshes = supportMeshes;

        return supportMeshes;
    }

    /**
     * Create selection wireframe for regular objects
     */
    createSelectionWireframe(mainMesh) {
        if (!mainMesh.geometry || mainMesh.type === 'Group') {
            return null;
        }

        const edgeGeometry = this.geometryFactory.createEdgeGeometry(mainMesh.geometry);
        if (!edgeGeometry) {
            console.warn('❌ Failed to create edge geometry for selection wireframe:', mainMesh.name);
            return null;
        }
        // Get fresh material from MaterialManager to pick up current config values
        const material = this.materialManager.createSelectionEdgeMaterial();

        // CRITICAL: Force material update to ensure it renders properly
        material.needsUpdate = true;

        const wireframe = this.resourcePool.getLineMesh(edgeGeometry, material);

        // CRITICAL: Compute bounding sphere to prevent frustum culling issues
        // EdgesGeometry may have stale/incorrect bounding data
        edgeGeometry.computeBoundingSphere();
        edgeGeometry.computeBoundingBox();

        // CAD PRINCIPLE: Never use mesh.scale for visibility
        // Scale is always (1, 1, 1) - geometry defines exact dimensions
        wireframe.scale.set(1, 1, 1);
        wireframe.renderOrder = 9999; // Very high render order - always on top
        wireframe.raycast = () => {}; // Non-raycastable
        wireframe.userData.supportMeshType = 'selectionWireframe';

        // Material already configured by MaterialManager with depthTest: false
        // This ensures selection wireframe always renders on top without z-fighting

        // Ensure proper rendering settings
        wireframe.matrixAutoUpdate = true;
        wireframe.frustumCulled = true;

        return wireframe;
    }

    /**
     * Create CAD wireframe (always visible, thin edges for CAD visibility)
     */
    createCadWireframe(mainMesh) {
        if (!mainMesh.geometry || mainMesh.type === 'Group') {
            return null;
        }

        const edgeGeometry = this.geometryFactory.createEdgeGeometry(mainMesh.geometry);
        if (!edgeGeometry) {
            return null;
        }

        // Get fresh material from MaterialManager to pick up current config values
        const material = this.materialManager.createCadEdgeMaterial();

        // CRITICAL: Force material update to ensure it renders properly
        material.needsUpdate = true;

        const wireframe = this.resourcePool.getLineMesh(edgeGeometry, material);

        // CRITICAL: Compute bounding sphere to prevent frustum culling issues
        // EdgesGeometry may have stale/incorrect bounding data
        edgeGeometry.computeBoundingSphere();
        edgeGeometry.computeBoundingBox();

        // CAD PRINCIPLE: Never use mesh.scale for visibility
        // Scale is always (1, 1, 1) - geometry defines exact dimensions
        wireframe.scale.set(1, 1, 1);
        wireframe.renderOrder = 998; // Render on top but below selection wireframe
        wireframe.raycast = () => {}; // Non-raycastable
        wireframe.userData.supportMeshType = 'cadWireframe';

        // Ensure proper rendering settings
        wireframe.matrixAutoUpdate = true;
        wireframe.frustumCulled = true;

        return wireframe;
    }

    /**
     * Create container wireframe
     */
    createContainerWireframe(mainMesh) {
        if (!mainMesh.geometry) return null;

        // Check if this container is nested inside another container
        const sceneController = window.modlerComponents?.sceneController;
        let isNested = false;
        if (sceneController && mainMesh.userData?.id) {
            const objectData = sceneController.getObjectByMesh(mainMesh);
            isNested = objectData?.parentContainer != null;
        }

        // Clone base material and adjust opacity for nested containers
        let material;
        if (isNested) {
            // Clone the material and reduce opacity to 50%
            material = this.materials.containerWireframe.clone();
            material.opacity = this.materials.containerWireframe.opacity * 0.5;
            material.needsUpdate = true;
        } else {
            material = this.materials.containerWireframe;
        }

        const edgeGeometry = this.geometryFactory.createEdgeGeometry(mainMesh.geometry);
        const wireframe = this.resourcePool.getLineMesh(edgeGeometry, material);

        // CRITICAL: Compute bounding sphere to prevent frustum culling issues
        // EdgesGeometry may have stale/incorrect bounding data
        edgeGeometry.computeBoundingSphere();
        edgeGeometry.computeBoundingBox();

        wireframe.position.set(0, 0, 0); // No offset - wireframe should match geometry exactly
        wireframe.scale.set(1, 1, 1);
        wireframe.renderOrder = 9999; // Same as selection wireframe - always on top
        wireframe.raycast = () => {}; // Non-raycastable
        wireframe.userData.supportMeshType = 'wireframe'; // ContainerVisualizer looks for 'wireframe'

        // Material already configured by MaterialManager with depthTest: false
        // This ensures container wireframe always renders on top without z-fighting

        // Ensure proper rendering settings
        wireframe.matrixAutoUpdate = true;
        wireframe.frustumCulled = true;

        return wireframe;
    }

    /**
     * Create face highlight mesh - ARCHITECTURE: position once per hover, no repositioning during geometry changes
     * Uses pooled shared materials for consistent opacity across all objects
     * @param {THREE.Mesh} mainMesh - The main mesh to create face highlight for
     * @param {boolean} isContainer - Whether this is for a container (uses different material/opacity)
     */
    createFaceHighlight(mainMesh, isContainer = false) {
        // Create generic plane geometry using GeometryFactory
        const faceGeometry = this.geometryFactory.createPlaneGeometry(1, 1);

        // Use pre-created shared material from pool
        // This ensures all objects share the same material instance, so opacity updates affect all objects
        const material = isContainer
            ? this.materials.faceHighlightContainer
            : this.materials.faceHighlight;

        const faceHighlight = this.resourcePool.getMeshHighlight(faceGeometry, material);
        faceHighlight.position.set(0, 0, 0); // Initial position - will be set when first shown
        faceHighlight.raycast = () => {}; // Non-raycastable
        faceHighlight.userData.supportMeshType = 'faceHighlight';
        faceHighlight.visible = false; // Hidden by default

        return faceHighlight;
    }

    /**
     * Create container interactive mesh for tool interaction
     */
    createContainerInteractiveMesh(mainMesh) {
        if (!mainMesh.geometry) return null;

        // IMPORTANT: Create solid BoxGeometry for reliable raycasting
        // The main mesh uses EdgesGeometry (wireframe) which is not suitable for raycasting
        // We need to reconstruct the original box dimensions for solid geometry

        // Get container dimensions from DimensionManager (single source of truth)
        const dimensionManager = window.dimensionManager;
        let size;

        if (dimensionManager) {
            // CRITICAL: Use DimensionManager for accurate dimensions (works for both new and deserialized containers)
            const dimensions = dimensionManager.getDimensions(mainMesh);
            size = new THREE.Vector3(dimensions.x, dimensions.y, dimensions.z);
        } else {
            // Fallback: Try original bounds from scene controller
            const sceneController = window.modlerComponents?.sceneController;
            if (sceneController) {
                const objectData = sceneController.getObjectByMesh(mainMesh);
                if (objectData && objectData.originalBounds) {
                    size = objectData.originalBounds.size.clone();
                }
            }

            // Last resort: Extract from mesh bounds (least reliable)
            if (!size) {
                const fallbackBounds = new THREE.Box3().setFromObject(mainMesh);
                size = fallbackBounds.getSize(new THREE.Vector3());
            }
        }

        // Create solid box geometry with the extracted dimensions
        const faceGeometry = this.geometryFactory.createBoxGeometry(size.x, size.y, size.z);

        // Verify BoxGeometry centering
        faceGeometry.computeBoundingBox();
        const geometryCenter = faceGeometry.boundingBox.getCenter(new THREE.Vector3());

        const interactiveMesh = this.resourcePool.getMeshHighlight(faceGeometry, this.materials.containerInteractive);


        interactiveMesh.position.set(0, 0, 0);
        interactiveMesh.renderOrder = 1000; // High render order for raycasting priority
        interactiveMesh.visible = true; // CRITICAL: Must be visible for raycaster (material is already transparent/invisible)

        // RAYCASTING FIX: Resource pool sets raycast = () => {} (non-raycastable)
        // Delete the override to restore default THREE.js raycasting behavior
        delete interactiveMesh.raycast;

        // RAYCASTING LAYERS: Enable Layer 1 in addition to Layer 0 for container interactive meshes
        // This allows raycaster to selectively target them when switching to Layer 1
        // NOTE: Keep Layer 0 enabled for visibility, add Layer 1 for selective raycasting
        interactiveMesh.layers.enable(1); // Add Layer 1 (Layer 0 remains enabled by default)

        interactiveMesh.userData.isContainerInteractive = true;
        interactiveMesh.userData.isContainerCollision = true;
        interactiveMesh.userData.containerMesh = mainMesh; // Direct reference to parent
        interactiveMesh.userData.supportMeshType = 'interactiveMesh';

        return interactiveMesh;
    }


    /**
     * Update support mesh geometries when main object geometry changes
     * @param {THREE.Mesh} mainMesh - The main object mesh
     * @param {boolean} updateFaceHighlight - Whether to update face highlight position (default: true)
     */
    updateSupportMeshGeometries(mainMesh, updateFaceHighlight = true) {
        const supportMeshes = mainMesh.userData.supportMeshes;
        if (!supportMeshes || !mainMesh.geometry) return;

        // Update wireframes using GeometryFactory
        if (supportMeshes.selectionWireframe) {
            const newEdgeGeometry = this.geometryFactory.createEdgeGeometry(mainMesh.geometry);
            // Return old geometry to pool instead of disposing
            this.geometryFactory.returnGeometry(supportMeshes.selectionWireframe.geometry, 'edge');
            supportMeshes.selectionWireframe.geometry = newEdgeGeometry;
        }

        if (supportMeshes.containerWireframe) {
            const newEdgeGeometry = this.geometryFactory.createEdgeGeometry(mainMesh.geometry);
            // Return old geometry to pool instead of disposing
            this.geometryFactory.returnGeometry(supportMeshes.containerWireframe.geometry, 'edge');
            supportMeshes.containerWireframe.geometry = newEdgeGeometry;
        }

        // Update CAD wireframes
        if (supportMeshes.cadWireframe) {
            const newEdgeGeometry = this.geometryFactory.createEdgeGeometry(mainMesh.geometry);
            // Return old geometry to pool instead of disposing
            this.geometryFactory.returnGeometry(supportMeshes.cadWireframe.geometry, 'edge');
            supportMeshes.cadWireframe.geometry = newEdgeGeometry;
        }

        // contextHighlight removed - using single wireframeMesh managed above

        // Update interactive mesh for containers
        if (supportMeshes.interactiveMesh) {
            const newFaceGeometry = mainMesh.geometry.clone();
            // Return old geometry to pool instead of disposing
            this.geometryFactory.returnGeometry(supportMeshes.interactiveMesh.geometry, 'face');
            supportMeshes.interactiveMesh.geometry = newFaceGeometry;
        }

        // Smart face highlight updates - only if visible and geometry tracking is needed
        if (updateFaceHighlight && supportMeshes.faceHighlight && supportMeshes.faceHighlight.visible) {
            this.updateFaceHighlightAfterGeometryChange(mainMesh, supportMeshes.faceHighlight);
        }
    }

    /**
     * Update face highlight geometry for specific face
     */
    updateFaceHighlightGeometry(mainMesh, face) {
        const supportMeshes = mainMesh.userData.supportMeshes;
        if (!supportMeshes?.faceHighlight || !face || !mainMesh.geometry) return;

        // Get position attribute to convert face indices to vertex coordinates
        const positionAttribute = mainMesh.geometry.getAttribute('position');
        if (!positionAttribute) return;

        // Convert face indices to actual vertex positions
        const va = new THREE.Vector3().fromBufferAttribute(positionAttribute, face.a);
        const vb = new THREE.Vector3().fromBufferAttribute(positionAttribute, face.b);
        const vc = new THREE.Vector3().fromBufferAttribute(positionAttribute, face.c);

        // Update face highlight geometry
        const vertices = new Float32Array([
            va.x, va.y, va.z,
            vb.x, vb.y, vb.z,
            vc.x, vc.y, vc.z
        ]);

        // Return old geometry to pool instead of disposing
        this.geometryFactory.returnGeometry(supportMeshes.faceHighlight.geometry, 'face');
        // TODO: Consider adding dynamic BufferGeometry creation to GeometryFactory
        const faceGeometry = new THREE.BufferGeometry();
        faceGeometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
        supportMeshes.faceHighlight.geometry = faceGeometry;
    }

    /**
     * Resolve the main object from a hit that might be on a collision/interactive mesh
     * @param {Object} hit - Raycast hit data
     * @returns {THREE.Mesh|null} The main object mesh
     */
    resolveMainObjectFromHit(hit) {
        if (!hit || !hit.object) return null;

        // Check if hit object is a container interactive/collision mesh
        const isContainerInteractive = hit.object.userData.isContainerInteractive;
        const isContainerCollision = hit.object.userData.isContainerCollision;

        if (isContainerInteractive && hit.object.userData.containerMesh) {
            // NEW ARCHITECTURE: Interactive mesh has direct containerMesh reference
            return hit.object.userData.containerMesh;
        } else if (isContainerCollision && hit.object.parent) {
            // OLD ARCHITECTURE: Collision mesh is child of container
            return hit.object.parent;
        } else if (isContainerInteractive) {
            // FALLBACK: Scene-level interactive mesh with parent container ID
            const sceneController = window.modlerComponents?.sceneController;
            const containerId = hit.object.userData.parentContainer;

            if (sceneController && containerId) {
                const containerData = sceneController.getObject(containerId);
                return containerData?.mesh || hit.object;
            } else {
                return hit.object.parent || hit.object;
            }
        } else {
            // Regular objects - walk up parent hierarchy to find object with userData.id
            // This handles wireframes, support meshes, and other child meshes
            let current = hit.object;
            while (current) {
                // Check if this object has a userData.id (main object)
                if (current.userData && current.userData.id !== undefined) {
                    return current;
                }
                // Move up to parent
                current = current.parent;
            }

            // Fallback: return original hit object if no parent with id found
            return hit.object;
        }
    }

    /**
     * Update face highlight position after geometry changes (smart tracking)
     * @param {THREE.Mesh} mainMesh - The main object mesh
     * @param {THREE.Mesh} faceHighlightMesh - The face highlight mesh
     */
    updateFaceHighlightAfterGeometryChange(mainMesh, faceHighlightMesh) {
        if (!mainMesh || !faceHighlightMesh || !mainMesh.geometry) return;

        try {
            // Use stored face information instead of trying to reverse-engineer from position
            const storedFaceInfo = faceHighlightMesh.userData.faceInfo;
            if (!storedFaceInfo) {
                // No stored face info - face highlight was created without proper positioning
                // Hide it since we don't know which face it should represent
                faceHighlightMesh.visible = false;
                return;
            }

            // Calculate current geometry bounds
            mainMesh.geometry.computeBoundingBox();
            const bbox = mainMesh.geometry.boundingBox;
            const size = bbox.getSize(new THREE.Vector3());

            // Use stored face info to recalculate position for the same face
            const { faceType, isPositive } = storedFaceInfo;
            let width, height, localCenter, localNormal;

            if (faceType === 'x') {
                // X face (left/right)
                width = size.z;
                height = size.y;
                localNormal = new THREE.Vector3(isPositive ? 1 : -1, 0, 0);
                localCenter = new THREE.Vector3(
                    isPositive ? bbox.max.x : bbox.min.x,
                    (bbox.max.y + bbox.min.y) / 2,
                    (bbox.max.z + bbox.min.z) / 2
                );
            } else if (faceType === 'y') {
                // Y face (top/bottom)
                width = size.x;
                height = size.z;
                localNormal = new THREE.Vector3(0, isPositive ? 1 : -1, 0);
                localCenter = new THREE.Vector3(
                    (bbox.max.x + bbox.min.x) / 2,
                    isPositive ? bbox.max.y : bbox.min.y,
                    (bbox.max.z + bbox.min.z) / 2
                );
            } else {
                // Z face (front/back)
                width = size.x;
                height = size.y;
                localNormal = new THREE.Vector3(0, 0, isPositive ? 1 : -1);
                localCenter = new THREE.Vector3(
                    (bbox.max.x + bbox.min.x) / 2,
                    (bbox.max.y + bbox.min.y) / 2,
                    isPositive ? bbox.max.z : bbox.min.z
                );
            }

            // Update rotation to match face orientation
            faceHighlightMesh.rotation.set(0, 0, 0); // Reset rotation first
            if (faceType === 'x') {
                faceHighlightMesh.rotation.y = isPositive ? Math.PI/2 : -Math.PI/2;
            } else if (faceType === 'y') {
                faceHighlightMesh.rotation.x = isPositive ? -Math.PI/2 : Math.PI/2;
            } else {
                // Z face - default orientation
                if (!isPositive) {
                    faceHighlightMesh.rotation.y = Math.PI; // Flip for negative Z
                }
            }

            // Update scale to match new face dimensions
            faceHighlightMesh.scale.set(width, height, 1);

            // Update position to new face center
            faceHighlightMesh.position.copy(localCenter);

            // Add small offset to prevent z-fighting
            const offset = 0.001;
            faceHighlightMesh.position.add(localNormal.clone().multiplyScalar(offset));

        } catch (error) {
            console.warn('Failed to update face highlight after geometry change:', error);
        }
    }

    /**
     * Position face highlight for specific hit (called once per hover session)
     * @param {THREE.Mesh} faceHighlightMesh - The face highlight mesh
     * @param {Object} hit - Raycast hit data
     */
    positionFaceHighlightForHit(faceHighlightMesh, hit) {
        if (!faceHighlightMesh || !hit || !hit.face || !hit.object) {
            return;
        }

        try {
            // Resolve the main object geometry
            const mainObject = this.resolveMainObjectFromHit(hit);
            if (!mainObject || !mainObject.geometry) {
                return;
            }

            // CRITICAL FIX: For containers, use interactive mesh for bounding box calculations
            // Interactive mesh has BoxGeometry with proper face dimensions
            // Main mesh (EdgesGeometry) only has edge lines, resulting in tiny bounding box
            let geometryForBounds = mainObject.geometry;
            if (mainObject.userData?.isContainer && mainObject.userData?.supportMeshes?.interactiveMesh) {
                geometryForBounds = mainObject.userData.supportMeshes.interactiveMesh.geometry;
            }

            // Work in local space since face highlight is a child
            geometryForBounds.computeBoundingBox();
            const bbox = geometryForBounds.boundingBox;
            const size = bbox.getSize(new THREE.Vector3());

            // Get face normal in local space
            const face = hit.face;
            const localNormal = face.normal.clone().normalize();

            // Determine which face we hit and calculate dimensions
            const absNormal = {
                x: Math.abs(localNormal.x),
                y: Math.abs(localNormal.y),
                z: Math.abs(localNormal.z)
            };

            let width, height;
            let localCenter = new THREE.Vector3();

            if (absNormal.x > absNormal.y && absNormal.x > absNormal.z) {
                // X face (left/right)
                width = size.z;
                height = size.y;
                localCenter.set(
                    localNormal.x > 0 ? bbox.max.x : bbox.min.x,
                    (bbox.max.y + bbox.min.y) / 2,
                    (bbox.max.z + bbox.min.z) / 2
                );
            } else if (absNormal.y > absNormal.x && absNormal.y > absNormal.z) {
                // Y face (top/bottom)
                width = size.x;
                height = size.z;
                localCenter.set(
                    (bbox.max.x + bbox.min.x) / 2,
                    localNormal.y > 0 ? bbox.max.y : bbox.min.y,
                    (bbox.max.z + bbox.min.z) / 2
                );
            } else {
                // Z face (front/back)
                width = size.x;
                height = size.y;
                localCenter.set(
                    (bbox.max.x + bbox.min.x) / 2,
                    (bbox.max.y + bbox.min.y) / 2,
                    localNormal.z > 0 ? bbox.max.z : bbox.min.z
                );
            }

            // Scale the face highlight to match the face size
            faceHighlightMesh.scale.set(width, height, 1);

            // Position the face highlight at the face center in local space
            faceHighlightMesh.position.copy(localCenter);

            // Set rotation directly based on face normal
            faceHighlightMesh.rotation.set(0, 0, 0); // Reset rotation first

            if (absNormal.x > absNormal.y && absNormal.x > absNormal.z) {
                // X face - rotate to face along X axis
                faceHighlightMesh.rotation.y = localNormal.x > 0 ? Math.PI/2 : -Math.PI/2;
            } else if (absNormal.y > absNormal.x && absNormal.y > absNormal.z) {
                // Y face - rotate to face along Y axis
                faceHighlightMesh.rotation.x = localNormal.y > 0 ? -Math.PI/2 : Math.PI/2;
            } else {
                // Z face - default orientation (no rotation needed for Z-facing plane)
                if (localNormal.z < 0) {
                    faceHighlightMesh.rotation.y = Math.PI; // Flip for negative Z
                }
            }

            // Small offset to prevent z-fighting
            const offset = 0.001;
            faceHighlightMesh.position.add(localNormal.clone().multiplyScalar(offset));

            // Store face information for future geometry updates
            let faceType, isPositive;
            if (absNormal.x > absNormal.y && absNormal.x > absNormal.z) {
                faceType = 'x';
                isPositive = localNormal.x > 0;
            } else if (absNormal.y > absNormal.x && absNormal.y > absNormal.z) {
                faceType = 'y';
                isPositive = localNormal.y > 0;
            } else {
                faceType = 'z';
                isPositive = localNormal.z > 0;
            }

            faceHighlightMesh.userData.faceInfo = { faceType, isPositive };

        } catch (error) {
            console.warn('Failed to position face highlight for hit:', error);
        }
    }

    /**
     * Position face highlight for specific axis (for button hovers)
     * Determines camera-facing face on the specified axis and positions highlight
     * @param {THREE.Mesh} faceHighlightMesh - The face highlight mesh
     * @param {THREE.Mesh} objectMesh - The object to highlight a face on
     * @param {string} axis - Axis to highlight ('x', 'y', or 'z')
     * @param {boolean} cameraFacingOnly - If true, show only camera-facing face (default: true)
     */
    positionFaceHighlightForAxis(faceHighlightMesh, objectMesh, axis, cameraFacingOnly = true) {
        if (!faceHighlightMesh || !objectMesh || !axis) {
            return;
        }

        // Get camera to determine which face is camera-facing
        const camera = window.modlerComponents?.sceneFoundation?.camera;
        if (!camera) {
            console.warn('SupportMeshFactory: Camera not available for axis face highlighting');
            return;
        }

        // Determine face normal based on axis and camera position
        let faceNormal;

        if (cameraFacingOnly) {
            // Get camera direction in world space
            const cameraPos = new THREE.Vector3();
            camera.getWorldPosition(cameraPos);

            const objectPos = new THREE.Vector3();
            objectMesh.getWorldPosition(objectPos);

            const cameraToObject = new THREE.Vector3().subVectors(cameraPos, objectPos);

            // Determine which face on the axis is camera-facing
            switch (axis) {
                case 'x':
                    faceNormal = cameraToObject.x > 0 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(-1, 0, 0);
                    break;
                case 'y':
                    faceNormal = cameraToObject.y > 0 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, -1, 0);
                    break;
                case 'z':
                    faceNormal = cameraToObject.z > 0 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 0, -1);
                    break;
                default:
                    console.warn('SupportMeshFactory: Invalid axis for face highlighting:', axis);
                    return;
            }
        } else {
            // Show positive side of axis regardless of camera
            switch (axis) {
                case 'x':
                    faceNormal = new THREE.Vector3(1, 0, 0);
                    break;
                case 'y':
                    faceNormal = new THREE.Vector3(0, 1, 0);
                    break;
                case 'z':
                    faceNormal = new THREE.Vector3(0, 0, 1);
                    break;
                default:
                    console.warn('SupportMeshFactory: Invalid axis for face highlighting:', axis);
                    return;
            }
        }

        // Create synthetic hit object for positioning
        const syntheticHit = {
            object: objectMesh,
            face: { normal: faceNormal }
        };

        // Use existing positionFaceHighlightForHit logic
        this.positionFaceHighlightForHit(faceHighlightMesh, syntheticHit);
    }

    // ====== VISIBILITY API ======
    // Single gateway for all support mesh visibility changes.
    // Tools, visualizers, and commands should call these methods instead of setting .visible directly.

    /**
     * Show/hide support mesh by type
     */
    setSupportMeshVisibility(mainMesh, meshType, visible) {
        const supportMeshes = mainMesh?.userData?.supportMeshes;
        if (!supportMeshes) return;

        const mesh = supportMeshes[meshType];
        if (mesh) {
            mesh.visible = visible;
        }
    }

    // -- Selection Wireframe (regular objects) --
    showSelectionWireframe(mainMesh) { this.setSupportMeshVisibility(mainMesh, 'selectionWireframe', true); }
    hideSelectionWireframe(mainMesh) { this.setSupportMeshVisibility(mainMesh, 'selectionWireframe', false); }

    // -- CAD Wireframe (always-visible thin edges) --
    showCadWireframe(mainMesh) { this.setSupportMeshVisibility(mainMesh, 'cadWireframe', true); }
    hideCadWireframe(mainMesh) { this.setSupportMeshVisibility(mainMesh, 'cadWireframe', false); }

    // -- Container Wireframe (maps to cadWireframe key for containers) --
    showContainerWireframe(mainMesh) { this.setSupportMeshVisibility(mainMesh, 'cadWireframe', true); }
    hideContainerWireframe(mainMesh) { this.setSupportMeshVisibility(mainMesh, 'cadWireframe', false); }

    // -- Face Highlight --
    showFaceHighlight(mainMesh) { this.setSupportMeshVisibility(mainMesh, 'faceHighlight', true); }
    hideFaceHighlight(mainMesh) { this.setSupportMeshVisibility(mainMesh, 'faceHighlight', false); }

    // -- Interactive Mesh (container raycasting) --
    showInteractiveMesh(mainMesh) { this.setSupportMeshVisibility(mainMesh, 'interactiveMesh', true); }
    hideInteractiveMesh(mainMesh) { this.setSupportMeshVisibility(mainMesh, 'interactiveMesh', false); }

    /**
     * Set container wireframe opacity (for context state)
     * Stores original opacity for restoration and ensures wireframe is visible
     */
    setContainerWireframeOpacity(mainMesh, opacity) {
        const supportMeshes = mainMesh?.userData?.supportMeshes;
        if (!supportMeshes?.cadWireframe?.material) return;

        const wireframe = supportMeshes.cadWireframe;
        // Store original opacity on first call for later restoration
        if (wireframe.userData.originalOpacity === undefined) {
            wireframe.userData.originalOpacity = wireframe.material.opacity;
        }
        wireframe.material.opacity = opacity;
        wireframe.material.transparent = true;
        wireframe.material.needsUpdate = true;
        wireframe.visible = true;
    }

    /**
     * Restore container wireframe to full opacity
     */
    restoreContainerWireframeOpacity(mainMesh) {
        const supportMeshes = mainMesh?.userData?.supportMeshes;
        if (!supportMeshes?.cadWireframe?.material) return;

        const wireframe = supportMeshes.cadWireframe;
        if (wireframe.userData.originalOpacity !== undefined) {
            wireframe.material.opacity = wireframe.userData.originalOpacity;
            wireframe.material.needsUpdate = true;
        }
        wireframe.userData.wireframeState = 'selected';
    }

    /**
     * Swap face highlight to disabled (grey) or restore original material
     * @param {THREE.Mesh} mainMesh - The main object mesh
     * @param {boolean} disabled - True to show grey disabled state, false to restore
     */
    setFaceHighlightDisabled(mainMesh, disabled) {
        const supportMeshes = mainMesh?.userData?.supportMeshes;
        if (!supportMeshes?.faceHighlight) return;

        const faceHighlight = supportMeshes.faceHighlight;

        if (disabled) {
            if (this.materials.faceHighlightDisabled &&
                faceHighlight.material !== this.materials.faceHighlightDisabled) {
                // Store original material for restoration
                faceHighlight.userData.originalMaterial = faceHighlight.material;
                faceHighlight.material = this.materials.faceHighlightDisabled;
            }
        } else {
            // Restore original material if previously swapped
            if (faceHighlight.userData.originalMaterial) {
                faceHighlight.material = faceHighlight.userData.originalMaterial;
                delete faceHighlight.userData.originalMaterial;
            }
        }
    }

    /**
     * Clean up all support meshes
     */
    cleanupSupportMeshes(mainMesh) {
        const supportMeshes = mainMesh.userData.supportMeshes;
        if (!supportMeshes) return;

        Object.values(supportMeshes).forEach(mesh => {
            if (mesh) {
                mainMesh.remove(mesh);
                // Return geometry to pool instead of disposing
                if (mesh.geometry) {
                    this.geometryFactory.returnGeometry(mesh.geometry, 'edge');
                }
                // Return material to pool if it's not shared
                if (mesh.material &&
                    mesh.material !== this.materials.faceHighlight &&
                    mesh.material !== this.materials.faceHighlightContainer) {
                    this.materialManager.disposeMaterial(mesh.material);
                }
            }
        });

        delete mainMesh.userData.supportMeshes;
    }
}

// Export for use in application
window.SupportMeshFactory = SupportMeshFactory;