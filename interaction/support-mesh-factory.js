import * as THREE from 'three';
import { LineSegments2 } from 'three/lines/LineSegments2';
import { LineSegmentsGeometry } from 'three/lines/LineSegmentsGeometry';
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

        // Delegated face highlight positioning logic
        this.faceHighlightPositioner = new FaceHighlightPositioner(this.geometryFactory);

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
     * Get nesting depth of an object in the container hierarchy.
     * Root-level objects = 0, children of root containers = 1, etc.
     */
    _getNestingDepth(mainMesh) {
        const sceneController = window.modlerComponents?.sceneController;
        if (!sceneController) return 0;
        const objectData = sceneController.getObjectByMesh(mainMesh);
        if (!objectData) return 0;
        let depth = 0;
        let current = objectData;
        while (current.parentContainer) {
            depth++;
            current = sceneController.getObject(current.parentContainer);
            if (!current) break;
        }
        return depth;
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
            cadWireframe: this.createContainerWireframe(mainMesh), // Thin wireframe for context/hover states
            containerSelectionWireframe: this.createContainerSelectionWireframe(mainMesh) // Fat wireframe for selection state
        } : {
            selectionWireframe: this.createSelectionWireframe(mainMesh),
            hoverWireframe: this.createHoverWireframe(mainMesh),
            faceHighlight: this.createFaceHighlight(mainMesh, false), // false = not container
            cadWireframe: this.createCadWireframe(mainMesh)
        };

        // Add as children of main mesh (only if they were created successfully)
        if (supportMeshes.selectionWireframe) {
            mainMesh.add(supportMeshes.selectionWireframe);
            supportMeshes.selectionWireframe.visible = false;
        }
        if (supportMeshes.hoverWireframe) {
            mainMesh.add(supportMeshes.hoverWireframe);
            supportMeshes.hoverWireframe.visible = false;
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
        if (supportMeshes.containerSelectionWireframe) {
            mainMesh.add(supportMeshes.containerSelectionWireframe);
            supportMeshes.containerSelectionWireframe.visible = false;
        }
        if (supportMeshes.interactiveMesh) {
            mainMesh.add(supportMeshes.interactiveMesh);
            supportMeshes.interactiveMesh.visible = true; // Must be visible for raycasting - material is already transparent
        }

        // Store references for easy access
        mainMesh.userData.supportMeshes = supportMeshes;

        // Hierarchy-based render order: parents render on top of children
        // Deeper objects get lower renderOrder so parent wireframes draw last (on top)
        const depth = this._getNestingDepth(mainMesh);
        if (depth > 0) {
            const depthOffset = depth * 10;
            const wireframeKeys = ['selectionWireframe', 'hoverWireframe', 'cadWireframe', 'containerSelectionWireframe'];
            for (const key of wireframeKeys) {
                if (supportMeshes[key]) {
                    supportMeshes[key].renderOrder -= depthOffset;
                }
            }
        }

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

        // Convert EdgesGeometry to LineSegmentsGeometry for fat line rendering
        const lineGeometry = new LineSegmentsGeometry().fromEdgesGeometry(edgeGeometry);

        // Get fat LineMaterial for screen-space pixel-width lines
        const material = this.materialManager.createSelectionLineMaterial();
        material.needsUpdate = true;

        // LineSegments2 renders thick lines as screen-space quads (not GL line primitives)
        const wireframe = new LineSegments2(lineGeometry, material);

        // Compute bounds on the line geometry to prevent frustum culling issues
        lineGeometry.computeBoundingSphere();
        lineGeometry.computeBoundingBox();

        // Dispose intermediate EdgesGeometry (data has been copied to LineSegmentsGeometry)
        edgeGeometry.dispose();

        wireframe.scale.set(1, 1, 1);
        wireframe.renderOrder = 9999;
        wireframe.raycast = () => {}; // Non-raycastable
        wireframe.userData.supportMeshType = 'selectionWireframe';
        wireframe.userData.isFatLine = true; // Mark for cleanup (not pooled)

        wireframe.matrixAutoUpdate = true;
        wireframe.frustumCulled = true;

        return wireframe;
    }

    /**
     * Create hover wireframe for regular objects (subtle wireframe on mouse hover)
     */
    createHoverWireframe(mainMesh) {
        if (!mainMesh.geometry || mainMesh.type === 'Group') {
            return null;
        }

        const edgeGeometry = this.geometryFactory.createEdgeGeometry(mainMesh.geometry);
        if (!edgeGeometry) {
            return null;
        }

        const material = this.materialManager.createHoverEdgeMaterial();
        material.needsUpdate = true;

        const wireframe = this.resourcePool.getLineMesh(edgeGeometry, material);

        edgeGeometry.computeBoundingSphere();
        edgeGeometry.computeBoundingBox();

        wireframe.scale.set(1, 1, 1);
        wireframe.renderOrder = 9998; // Below selection wireframe (9999), above CAD wireframe (998)
        wireframe.raycast = () => {};
        wireframe.userData.supportMeshType = 'hoverWireframe';

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
        // Yard objects get purple wireframe to distinguish them from regular objects
        const isYardObject = !!mainMesh.userData.yardItemId;
        const material = isYardObject
            ? this.materialManager.createYardCadEdgeMaterial()
            : this.materialManager.createCadEdgeMaterial();

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
        let isClonedMaterial = false;
        if (isNested) {
            // Clone the material and reduce opacity to 50%
            material = this.materials.containerWireframe.clone();
            material.opacity = this.materials.containerWireframe.opacity * 0.5;
            material.needsUpdate = true;
            isClonedMaterial = true;
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
        wireframe.userData.isClonedMaterial = isClonedMaterial; // Track for disposal

        // Material configured by MaterialManager with depthTest: true + LessEqualDepth
        // Shows wireframe on camera-visible faces only, hides back-face edges

        // Ensure proper rendering settings
        wireframe.matrixAutoUpdate = true;
        wireframe.frustumCulled = true;

        return wireframe;
    }

    /**
     * Create fat container selection wireframe (LineSegments2 for pixel-width lines)
     * Separate from cadWireframe — used only for container selection state
     */
    createContainerSelectionWireframe(mainMesh) {
        if (!mainMesh.geometry) return null;

        const edgeGeometry = this.geometryFactory.createEdgeGeometry(mainMesh.geometry);
        if (!edgeGeometry) return null;

        const lineGeometry = new LineSegmentsGeometry().fromEdgesGeometry(edgeGeometry);
        const material = this.materialManager.createContainerSelectionLineMaterial();
        material.needsUpdate = true;

        const wireframe = new LineSegments2(lineGeometry, material);

        lineGeometry.computeBoundingSphere();
        lineGeometry.computeBoundingBox();

        edgeGeometry.dispose();

        wireframe.scale.set(1, 1, 1);
        wireframe.renderOrder = 9999;
        wireframe.raycast = () => {};
        wireframe.userData.supportMeshType = 'containerSelectionWireframe';
        wireframe.userData.isFatLine = true;

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

        // RAYCASTING LAYERS: Set to Layer 1 ONLY for container interactive meshes
        // Layer 0 is for normal objects; interactive mesh must NOT be on Layer 0
        // or it blocks raycasts to children inside the container
        interactiveMesh.layers.set(1); // ONLY Layer 1 — removes default Layer 0

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
        // CRITICAL: computeBoundingSphere/computeBoundingBox must be called after geometry replacement
        // to prevent frustum culling artifacts from stale bounding data
        if (supportMeshes.selectionWireframe) {
            const newEdgeGeometry = this.geometryFactory.createEdgeGeometry(mainMesh.geometry);
            if (supportMeshes.selectionWireframe.userData?.isFatLine) {
                // LineSegments2: convert EdgesGeometry to LineSegmentsGeometry
                const newLineGeometry = new LineSegmentsGeometry().fromEdgesGeometry(newEdgeGeometry);
                supportMeshes.selectionWireframe.geometry.dispose();
                supportMeshes.selectionWireframe.geometry = newLineGeometry;
                newLineGeometry.computeBoundingSphere();
                newLineGeometry.computeBoundingBox();
                newEdgeGeometry.dispose();
            } else {
                this.geometryFactory.returnGeometry(supportMeshes.selectionWireframe.geometry, 'edge');
                supportMeshes.selectionWireframe.geometry = newEdgeGeometry;
                newEdgeGeometry.computeBoundingSphere();
                newEdgeGeometry.computeBoundingBox();
            }
        }

        if (supportMeshes.hoverWireframe) {
            const newEdgeGeometry = this.geometryFactory.createEdgeGeometry(mainMesh.geometry);
            this.geometryFactory.returnGeometry(supportMeshes.hoverWireframe.geometry, 'edge');
            supportMeshes.hoverWireframe.geometry = newEdgeGeometry;
            newEdgeGeometry.computeBoundingSphere();
            newEdgeGeometry.computeBoundingBox();
        }

        if (supportMeshes.containerWireframe) {
            const newEdgeGeometry = this.geometryFactory.createEdgeGeometry(mainMesh.geometry);
            this.geometryFactory.returnGeometry(supportMeshes.containerWireframe.geometry, 'edge');
            supportMeshes.containerWireframe.geometry = newEdgeGeometry;
            newEdgeGeometry.computeBoundingSphere();
            newEdgeGeometry.computeBoundingBox();
        }

        // Update CAD wireframes
        if (supportMeshes.cadWireframe) {
            const newEdgeGeometry = this.geometryFactory.createEdgeGeometry(mainMesh.geometry);
            this.geometryFactory.returnGeometry(supportMeshes.cadWireframe.geometry, 'edge');
            supportMeshes.cadWireframe.geometry = newEdgeGeometry;
            newEdgeGeometry.computeBoundingSphere();
            newEdgeGeometry.computeBoundingBox();
        }

        // Update container selection wireframe (fat LineSegments2)
        if (supportMeshes.containerSelectionWireframe) {
            const newEdgeGeometry = this.geometryFactory.createEdgeGeometry(mainMesh.geometry);
            const newLineGeometry = new LineSegmentsGeometry().fromEdgesGeometry(newEdgeGeometry);
            supportMeshes.containerSelectionWireframe.geometry.dispose();
            supportMeshes.containerSelectionWireframe.geometry = newLineGeometry;
            newLineGeometry.computeBoundingSphere();
            newLineGeometry.computeBoundingBox();
            newEdgeGeometry.dispose();
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
            this.faceHighlightPositioner.updateFaceHighlightAfterGeometryChange(mainMesh, supportMeshes.faceHighlight);
        }
    }

    // ====== FACE HIGHLIGHT POSITIONING — delegated to FaceHighlightPositioner ======

    updateFaceHighlightGeometry(mainMesh, face) {
        this.faceHighlightPositioner.updateFaceHighlightGeometry(mainMesh, face);
    }

    resolveMainObjectFromHit(hit) {
        return this.faceHighlightPositioner.resolveMainObjectFromHit(hit);
    }

    updateFaceHighlightAfterGeometryChange(mainMesh, faceHighlightMesh) {
        this.faceHighlightPositioner.updateFaceHighlightAfterGeometryChange(mainMesh, faceHighlightMesh);
    }

    positionFaceHighlightForHit(faceHighlightMesh, hit) {
        this.faceHighlightPositioner.positionFaceHighlightForHit(faceHighlightMesh, hit);
    }

    positionFaceHighlightForAxis(faceHighlightMesh, objectMesh, axis, cameraFacingOnly = true) {
        this.faceHighlightPositioner.positionFaceHighlightForAxis(faceHighlightMesh, objectMesh, axis, cameraFacingOnly);
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

    // -- Hover Wireframe (regular objects, subtle hover indicator) --
    showHoverWireframe(mainMesh) { this.setSupportMeshVisibility(mainMesh, 'hoverWireframe', true); }
    hideHoverWireframe(mainMesh) { this.setSupportMeshVisibility(mainMesh, 'hoverWireframe', false); }

    // -- Container Hover Wireframe (opacity-based, reuses cadWireframe) --
    showContainerHoverWireframe(mainMesh) {
        const supportMeshes = mainMesh?.userData?.supportMeshes;
        if (!supportMeshes?.cadWireframe?.material) return;
        const wireframe = supportMeshes.cadWireframe;
        if (wireframe.userData.originalOpacity === undefined) {
            wireframe.userData.originalOpacity = wireframe.material.opacity;
        }
        wireframe.material.opacity = wireframe.userData.originalOpacity * 0.5;
        wireframe.material.transparent = true;
        wireframe.material.needsUpdate = true;
        wireframe.visible = true;
    }
    hideContainerHoverWireframe(mainMesh) {
        const supportMeshes = mainMesh?.userData?.supportMeshes;
        if (!supportMeshes?.cadWireframe) return;
        const wireframe = supportMeshes.cadWireframe;
        // Only hide if not in a selected or context state
        if (wireframe.userData.wireframeState !== 'selected' && wireframe.userData.wireframeState !== 'context') {
            wireframe.visible = false;
        }
        // Restore opacity if it was changed for hover
        if (wireframe.userData.originalOpacity !== undefined) {
            wireframe.material.opacity = wireframe.userData.originalOpacity;
            wireframe.material.needsUpdate = true;
        }
    }

    // -- CAD Wireframe (always-visible thin edges) --
    showCadWireframe(mainMesh) { this.setSupportMeshVisibility(mainMesh, 'cadWireframe', true); }
    hideCadWireframe(mainMesh) { this.setSupportMeshVisibility(mainMesh, 'cadWireframe', false); }

    // -- Container Wireframe (maps to cadWireframe key for containers) --
    showContainerWireframe(mainMesh) { this.setSupportMeshVisibility(mainMesh, 'cadWireframe', true); }
    hideContainerWireframe(mainMesh) { this.setSupportMeshVisibility(mainMesh, 'cadWireframe', false); }

    // -- Container Selection Wireframe (fat LineSegments2 for selection state) --
    showContainerSelectionWireframe(mainMesh) { this.setSupportMeshVisibility(mainMesh, 'containerSelectionWireframe', true); }
    hideContainerSelectionWireframe(mainMesh) { this.setSupportMeshVisibility(mainMesh, 'containerSelectionWireframe', false); }

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

                if (mesh.userData?.isFatLine) {
                    // LineSegments2: dispose geometry directly (not pooled)
                    if (mesh.geometry) mesh.geometry.dispose();
                    if (mesh.material) this.materialManager.disposeMaterial(mesh.material);
                } else {
                    // Standard LineSegments: return geometry to pool
                    if (mesh.geometry) {
                        this.geometryFactory.returnGeometry(mesh.geometry, 'edge');
                    }
                    // Dispose cloned materials (nested container wireframes)
                    if (mesh.userData?.isClonedMaterial && mesh.material) {
                        mesh.material.dispose();
                    }
                    // Return non-shared, non-cloned materials to pool
                    else if (mesh.material &&
                        mesh.material !== this.materials.faceHighlight &&
                        mesh.material !== this.materials.faceHighlightContainer) {
                        this.materialManager.disposeMaterial(mesh.material);
                    }
                }
            }
        });

        delete mainMesh.userData.supportMeshes;
    }
}

// Export for use in application
window.SupportMeshFactory = SupportMeshFactory;