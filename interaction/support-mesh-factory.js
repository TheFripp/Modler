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
            depthTest: true, // Enable depth test for proper rendering
            colorWrite: false, // Don't write to color buffer - purely for raycasting
            color: 0x000000 // Doesn't matter since colorWrite is false
        });
    }

    /**
     * Create all support meshes for any object (unified for regular objects and containers)
     */
    createObjectSupportMeshes(mainMesh) {

        // Check if this is a container
        const isContainer = mainMesh.userData.isContainer;

        // NEW ARCHITECTURE: Containers already have wireframe children from LayoutGeometry
        // Skip support mesh creation for containers to prevent conflicts
        if (isContainer) {

            // CLEANUP: Remove any legacy support meshes from existing containers
            if (mainMesh.userData.supportMeshes) {
                this.cleanupSupportMeshes(mainMesh.userData.supportMeshes, mainMesh);
            }

            // Create minimal support meshes - faceHighlight and interactiveMesh for containers
            const supportMeshes = {
                faceHighlight: this.createFaceHighlight(mainMesh), // Use existing method with orange selection color
                interactiveMesh: this.createContainerInteractiveMesh(mainMesh) // Needed for proper raycasting in tools
            };

            // Add face highlight and interactive mesh as children
            if (supportMeshes.faceHighlight) {
                mainMesh.add(supportMeshes.faceHighlight);
                supportMeshes.faceHighlight.visible = false; // Hidden by default
            }
            if (supportMeshes.interactiveMesh) {
                mainMesh.add(supportMeshes.interactiveMesh);
                supportMeshes.interactiveMesh.visible = false; // Hidden by default, used for raycasting
            }

            // Store support meshes with face highlight and interactive mesh
            mainMesh.userData.supportMeshes = supportMeshes;


            return supportMeshes;
        }

        // Regular objects: Create support meshes as normal
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
            supportMeshes.interactiveMesh.visible = false; // Hidden by default, shown only during tool operations

            // POTENTIAL FIX: Force matrix update to ensure proper transform inheritance
            mainMesh.updateMatrixWorld(true);
            supportMeshes.interactiveMesh.updateMatrixWorld(true);

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
        if (!mainMesh.geometry || mainMesh.type === 'Group') {
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
     * Create face highlight mesh - ARCHITECTURE: position once per hover, no repositioning during geometry changes
     */
    createFaceHighlight(mainMesh) {
        // Create generic plane geometry that can be positioned and scaled
        const faceGeometry = new THREE.PlaneGeometry(1, 1);

        const faceHighlight = new THREE.Mesh(faceGeometry, this.materials.faceHighlight);
        faceHighlight.position.set(0, 0, 0); // Initial position - will be set when first shown
        faceHighlight.raycast = () => {}; // Non-raycastable
        faceHighlight.userData.supportMeshType = 'faceHighlight';
        faceHighlight.visible = false; // Hidden by default

        return faceHighlight;
    }

    /**
     * Create interactive mesh for containers (NEW UNIFIED ARCHITECTURE)
     */
    createInteractiveMesh(mainMesh) {
        if (!mainMesh.geometry) return null;


        // Create interactive mesh from solid geometry (already available from main mesh)
        const interactiveMesh = new THREE.Mesh(
            mainMesh.geometry.clone(),
            this.materials.containerInteractive
        );

        interactiveMesh.position.set(0, 0, 0); // Child position relative to parent
        interactiveMesh.renderOrder = 1000; // High render order for raycasting priority
        interactiveMesh.visible = false; // Hidden by default
        interactiveMesh.userData.isContainerInteractive = true;
        interactiveMesh.userData.isContainerCollision = true;
        interactiveMesh.userData.containerMesh = mainMesh; // Reference to parent
        interactiveMesh.userData.supportMeshType = 'interactiveMesh';


        return interactiveMesh;
    }

    /**
     * Create container interactive mesh for tool interaction (OLD COMPLEX VERSION)
     */
    createContainerInteractiveMesh(mainMesh) {
        if (!mainMesh.geometry) return null;

        // IMPORTANT: Create solid BoxGeometry for reliable raycasting
        // The main mesh uses EdgesGeometry (wireframe) which is not suitable for raycasting
        // We need to reconstruct the original box dimensions for solid geometry

        // Try to get original container dimensions from scene controller data
        const sceneController = window.modlerComponents?.sceneController;
        let size;

        if (sceneController) {
            const objectData = sceneController.getObjectByMesh(mainMesh);
            if (objectData && objectData.originalBounds) {
                // Use original container creation bounds
                size = objectData.originalBounds.size.clone();
            }
        }

        let fallbackBounds = null;
        if (!size) {
            // Fallback: Extract from wireframe mesh bounds (less reliable)
            fallbackBounds = new THREE.Box3().setFromObject(mainMesh);
            size = fallbackBounds.getSize(new THREE.Vector3());
        }

        // Create solid box geometry with the extracted dimensions
        const faceGeometry = new THREE.BoxGeometry(size.x, size.y, size.z);

        // Verify BoxGeometry centering
        faceGeometry.computeBoundingBox();
        const geometryCenter = faceGeometry.boundingBox.getCenter(new THREE.Vector3());

        const interactiveMesh = new THREE.Mesh(faceGeometry, this.materials.containerInteractive);


        interactiveMesh.position.set(0, 0, 0);
        interactiveMesh.renderOrder = 1000; // High render order for raycasting priority
        interactiveMesh.visible = false; // Hidden by default - only visible when needed for interaction
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
     * @param {THREE.Mesh} mainMesh - The main object mesh
     * @param {boolean} updateFaceHighlight - Whether to update face highlight position (default: true)
     */
    updateSupportMeshGeometries(mainMesh, updateFaceHighlight = true) {
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

        supportMeshes.faceHighlight.geometry.dispose();
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
            // Regular objects
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

            // Work in local space since face highlight is a child
            mainObject.geometry.computeBoundingBox();
            const bbox = mainObject.geometry.boundingBox;
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