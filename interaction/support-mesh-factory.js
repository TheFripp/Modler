// Modler V2 - Support Mesh Factory
// Creates all support meshes (selection wireframe, face highlights, interaction mesh) as children
// Implements "create once, show/hide only" architecture

class SupportMeshFactory {
    constructor() {
        // Material cache for reuse
        this.materials = {
            selectionWireframe: null,
            faceHighlight: null,
            containerWireframe: null,
            containerInteractive: null
        };

        this.createBaseMaterials();
    }

    /**
     * Create base materials used by support meshes
     */
    createBaseMaterials() {
        const configManager = window.modlerComponents?.configurationManager;

        // Selection wireframe material
        const selectionConfig = configManager ?
            configManager.get('visual.selection') :
            { color: '#ff6600', lineWidth: 2, opacity: 0.8, renderOrder: 999 };

        const selectionColorHex = parseInt(selectionConfig.color.replace('#', ''), 16);
        this.materials.selectionWireframe = new THREE.LineBasicMaterial({
            color: selectionColorHex,
            transparent: true,
            opacity: selectionConfig.opacity,
            linewidth: selectionConfig.lineWidth
        });
        this.materials.selectionWireframe.lineWidth = selectionConfig.lineWidth;
        this.materials.selectionWireframe.renderOrder = selectionConfig.renderOrder || 999;

        // Face highlight material - uses selection color with 10% opacity
        const faceHighlightColorHex = parseInt(selectionConfig.color.replace('#', ''), 16);
        this.materials.faceHighlight = new THREE.MeshBasicMaterial({
            color: faceHighlightColorHex,
            transparent: true,
            opacity: 0.1, // 10% opacity
            side: THREE.DoubleSide
        });

        // Container wireframe material
        const containerConfig = configManager ?
            configManager.get('visual.containers') :
            { wireframeColor: '#00ff00', lineWidth: 1, opacity: 0.8, renderOrder: 998 };

        const containerColorHex = parseInt(containerConfig.wireframeColor.replace('#', ''), 16);
        this.materials.containerWireframe = new THREE.LineBasicMaterial({
            color: containerColorHex,
            transparent: true,
            opacity: containerConfig.opacity,
            linewidth: containerConfig.lineWidth
        });
        this.materials.containerWireframe.lineWidth = containerConfig.lineWidth;
        this.materials.containerWireframe.renderOrder = containerConfig.renderOrder || 998;

        // Container interactive material
        this.materials.containerInteractive = new THREE.MeshBasicMaterial({
            transparent: true,
            opacity: 0.0, // Invisible but raycastable
            side: THREE.DoubleSide,
            depthTest: false,
            color: 0xff0000
        });
    }

    /**
     * Create all support meshes for a regular object
     */
    createObjectSupportMeshes(mainMesh) {
        const supportMeshes = {
            selectionWireframe: this.createSelectionWireframe(mainMesh),
            faceHighlight: this.createFaceHighlight(mainMesh)
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

        // Store references for easy access
        mainMesh.userData.supportMeshes = supportMeshes;

        return supportMeshes;
    }

    /**
     * Create all support meshes for a container
     */
    createContainerSupportMeshes(mainMesh) {
        const supportMeshes = {
            selectionWireframe: this.createContainerWireframe(mainMesh),
            faceHighlight: this.createFaceHighlight(mainMesh),
            interactiveMesh: this.createContainerInteractiveMesh(mainMesh),
            contextHighlight: this.createContainerContextHighlight(mainMesh)
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
        if (supportMeshes.interactiveMesh) {
            mainMesh.add(supportMeshes.interactiveMesh);
            supportMeshes.interactiveMesh.visible = true; // Always visible for interaction
        }
        if (supportMeshes.contextHighlight) {
            mainMesh.add(supportMeshes.contextHighlight);
            supportMeshes.contextHighlight.visible = false;
        }

        // Store references for easy access
        mainMesh.userData.supportMeshes = supportMeshes;

        return supportMeshes;
    }

    /**
     * Create selection wireframe for regular objects
     */
    createSelectionWireframe(mainMesh) {
        if (!mainMesh.geometry) {
            console.warn('Cannot create selection wireframe: mesh has no geometry', mainMesh);
            return null;
        }

        const edgeGeometry = new THREE.EdgesGeometry(mainMesh.geometry);
        const wireframe = new THREE.LineSegments(edgeGeometry, this.materials.selectionWireframe);

        // Position at (0,0,0) relative to parent - inherits parent transform
        wireframe.position.set(0, 0.001, 0); // Small Y offset to prevent z-fighting
        wireframe.raycast = () => {}; // Non-raycastable
        wireframe.userData.supportMeshType = 'selectionWireframe';

        return wireframe;
    }

    /**
     * Create container wireframe
     */
    createContainerWireframe(mainMesh) {
        if (!mainMesh.geometry) return null;

        const edgeGeometry = new THREE.EdgesGeometry(mainMesh.geometry);
        const wireframe = new THREE.LineSegments(edgeGeometry, this.materials.containerWireframe);

        wireframe.position.set(0, 0.001, 0); // Small Y offset
        wireframe.raycast = () => {}; // Non-raycastable
        wireframe.userData.supportMeshType = 'containerWireframe';

        return wireframe;
    }

    /**
     * Create face highlight mesh (placeholder geometry, updated on hover)
     */
    createFaceHighlight(mainMesh) {
        // Create minimal triangle geometry as placeholder
        const faceGeometry = new THREE.BufferGeometry();
        const vertices = new Float32Array([0, 0, 0, 0, 0, 0, 0, 0, 0]); // Empty triangle
        faceGeometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));

        const faceHighlight = new THREE.Mesh(faceGeometry, this.materials.faceHighlight);
        faceHighlight.position.set(0, 0, 0);
        faceHighlight.raycast = () => {}; // Non-raycastable
        faceHighlight.userData.supportMeshType = 'faceHighlight';

        return faceHighlight;
    }

    /**
     * Create container interactive mesh for tool interaction
     */
    createContainerInteractiveMesh(mainMesh) {
        if (!mainMesh.geometry) return null;

        // Create face geometry for interaction
        const faceGeometry = mainMesh.geometry.clone();
        const interactiveMesh = new THREE.Mesh(faceGeometry, this.materials.containerInteractive);

        interactiveMesh.position.set(0, 0, 0);
        interactiveMesh.renderOrder = 1000; // High render order for raycasting priority
        interactiveMesh.userData.isContainerInteractive = true;
        interactiveMesh.userData.isContainerCollision = true;
        interactiveMesh.userData.containerMesh = mainMesh; // Direct reference to parent
        interactiveMesh.userData.supportMeshType = 'interactiveMesh';

        return interactiveMesh;
    }

    /**
     * Create container context highlight (faded wireframe for step-in state)
     */
    createContainerContextHighlight(mainMesh) {
        if (!mainMesh.geometry) return null;

        // Create faded version of container wireframe
        const contextMaterial = this.materials.containerWireframe.clone();
        contextMaterial.opacity = contextMaterial.opacity * 0.25; // 25% opacity for context

        const edgeGeometry = new THREE.EdgesGeometry(mainMesh.geometry);
        const contextHighlight = new THREE.LineSegments(edgeGeometry, contextMaterial);

        contextHighlight.position.set(0, 0.001, 0);
        contextHighlight.raycast = () => {}; // Non-raycastable
        contextHighlight.userData.supportMeshType = 'contextHighlight';

        return contextHighlight;
    }

    /**
     * Update support mesh geometries when main object geometry changes
     */
    updateSupportMeshGeometries(mainMesh) {
        const supportMeshes = mainMesh.userData.supportMeshes;
        if (!supportMeshes || !mainMesh.geometry) return;

        // Update wireframes
        if (supportMeshes.selectionWireframe) {
            const newEdgeGeometry = new THREE.EdgesGeometry(mainMesh.geometry);
            supportMeshes.selectionWireframe.geometry.dispose();
            supportMeshes.selectionWireframe.geometry = newEdgeGeometry;
        }

        if (supportMeshes.containerWireframe) {
            const newEdgeGeometry = new THREE.EdgesGeometry(mainMesh.geometry);
            supportMeshes.containerWireframe.geometry.dispose();
            supportMeshes.containerWireframe.geometry = newEdgeGeometry;
        }

        if (supportMeshes.contextHighlight) {
            const newEdgeGeometry = new THREE.EdgesGeometry(mainMesh.geometry);
            supportMeshes.contextHighlight.geometry.dispose();
            supportMeshes.contextHighlight.geometry = newEdgeGeometry;
        }

        // Update interactive mesh for containers
        if (supportMeshes.interactiveMesh) {
            const newFaceGeometry = mainMesh.geometry.clone();
            supportMeshes.interactiveMesh.geometry.dispose();
            supportMeshes.interactiveMesh.geometry = newFaceGeometry;
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

        supportMeshes.faceHighlight.geometry.dispose();
        const faceGeometry = new THREE.BufferGeometry();
        faceGeometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
        supportMeshes.faceHighlight.geometry = faceGeometry;
    }

    /**
     * Show/hide support mesh by type
     */
    setSupportMeshVisibility(mainMesh, meshType, visible) {
        const supportMeshes = mainMesh.userData.supportMeshes;
        if (!supportMeshes) return;

        const mesh = supportMeshes[meshType];
        if (mesh) {
            mesh.visible = visible;
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
                if (mesh.geometry) mesh.geometry.dispose();
                if (mesh.material && mesh.material !== this.materials.faceHighlight) {
                    mesh.material.dispose();
                }
            }
        });

        delete mainMesh.userData.supportMeshes;
    }
}

// Export for use in application
window.SupportMeshFactory = SupportMeshFactory;