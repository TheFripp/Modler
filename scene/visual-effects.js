// Modler V2 - Scene Layer  
// Visual Effects - Face highlighting with minimal abstraction

class VisualEffects {
    constructor(scene) {
        this.scene = scene;
        
        // Highlight state
        this.highlightMaterial = null;
        this.currentHighlight = null;
        this.highlightMesh = null;
        
        // Animation state
        this.animationId = null;
        this.fadeDirection = 1;
        this.fadeOpacity = 0;
        
        this.setupHighlightMaterial();
        // VisualEffects initialized
    }
    
    setupHighlightMaterial() {
        // Create highlight material with high visibility for debugging
        this.highlightMaterial = new THREE.MeshBasicMaterial({
            color: 0x00ffff, // Bright cyan
            transparent: true,
            opacity: 0.6, // Increased opacity for better visibility
            side: THREE.DoubleSide, // Render both sides
            depthTest: false,
            depthWrite: false
        });
        
        // Ensure highlights render on top
        this.highlightMaterial.renderOrder = 1000;
        
        // Highlight material created
    }
    
    // Show face highlight on a specific face
    showFaceHighlight(hit) {
        console.log('🔥 FACE HIGHLIGHT: showFaceHighlight called', {
            hasHit: !!hit,
            hasObject: !!hit?.object,
            hasFace: !!hit?.face,
            objectName: hit?.object?.name || 'unnamed',
            isContainerCollision: hit?.object?.userData?.isContainerCollision
        });

        if (!hit || !hit.object || !hit.face) {
            console.warn('VisualEffects.showFaceHighlight: invalid hit data', hit);
            return false;
        }
        
        // Prevent duplicate highlights on same face
        if (this.currentHighlight &&
            this.currentHighlight.object === hit.object) {

            // For box geometries, check if we're highlighting the same logical face
            // by comparing face normals instead of face indices
            if (hit.object.geometry.type === 'BoxGeometry' || this.isBoxLikeGeometry(hit.object.geometry)) {
                const currentNormal = this.currentHighlight.faceNormal;
                const newNormal = hit.face.normal.clone().normalize();

                // If normals are very similar (same face), don't re-highlight
                if (currentNormal && currentNormal.distanceTo(newNormal) < 0.1) {
                    return true; // Already highlighting this logical face
                }
            } else {
                // For other geometries, use exact face index matching
                if (this.currentHighlight.faceIndex === hit.faceIndex) {
                    return true; // Already highlighting this face
                }
            }
        }
        
        // Clear existing highlight
        this.clearHighlight();
        
        // Get simple face geometry
        const faceGeometry = this.createSimpleFaceGeometry(hit);
        if (!faceGeometry) {
            console.warn('VisualEffects.showFaceHighlight: could not create face geometry for face', hit.faceIndex);
            return false;
        }
        
        // Create highlight mesh
        this.highlightMesh = new THREE.Mesh(faceGeometry, this.highlightMaterial);

        // CONTAINER FIX: Handle collision mesh positioning properly
        const isContainerCollision = hit.object.userData.isContainerCollision;
        if (isContainerCollision && hit.object.parent) {
            // For container collision meshes, use the parent container's transform
            // since collision mesh is at (0,0,0) relative to its parent
            this.highlightMesh.position.copy(hit.object.parent.position);
            this.highlightMesh.rotation.copy(hit.object.parent.rotation);
            this.highlightMesh.scale.copy(hit.object.parent.scale);
        } else {
            // For regular objects, use the object's transform directly
            this.highlightMesh.position.copy(hit.object.position);
            this.highlightMesh.rotation.copy(hit.object.rotation);
            this.highlightMesh.scale.copy(hit.object.scale);
        }

        // Apply small offset to prevent z-fighting
        this.highlightMesh.position.add(
            hit.face.normal.clone().multiplyScalar(0.001)
        );
        
        // Make highlight non-interactive
        this.highlightMesh.raycast = () => {};
        
        // Add to scene
        this.scene.add(this.highlightMesh);
        
        // Register with MeshSynchronizer for automatic position sync
        const meshSynchronizer = window.modlerComponents?.meshSynchronizer;
        if (meshSynchronizer) {
            // CONTAINER FIX: Register with the correct target object
            const targetObject = isContainerCollision && hit.object.parent ? hit.object.parent : hit.object;
            meshSynchronizer.registerRelatedMesh(targetObject, this.highlightMesh, 'highlight', {
                enabled: true,
                description: 'Face highlight',
                faceNormalOffset: hit.face.normal.clone().multiplyScalar(0.001)
            });
        }
        
        // Store current highlight info
        this.currentHighlight = {
            object: hit.object,
            faceIndex: hit.faceIndex,
            mesh: this.highlightMesh,
            faceNormal: hit.face.normal.clone()
        };
        
        // Start fade in animation
        this.startFadeAnimation(true);
        
        return true;
    }
    
    // Create face geometry - whole face for box geometries, triangle for others
    createSimpleFaceGeometry(hit) {
        const object = hit.object;
        const face = hit.face;
        
        if (!object.geometry || !face) {
            return null;
        }
        
        try {
            // For box geometries, highlight the complete rectangular face
            if (object.geometry.type === 'BoxGeometry' || this.isBoxLikeGeometry(object.geometry)) {
                return this.createBoxFaceGeometry(hit);
            }
            
            // For other geometries, highlight the triangle face
            const faceGeometry = new THREE.BufferGeometry();
            const positions = [];
            
            // Get vertices of the face using Three.js built-in methods
            const positionAttribute = object.geometry.getAttribute('position');
            
            if (!positionAttribute) {
                console.error('createSimpleFaceGeometry: No position attribute found');
                return null;
            }
            
            // Triangle face vertices (a, b, c)
            const va = new THREE.Vector3().fromBufferAttribute(positionAttribute, face.a);
            const vb = new THREE.Vector3().fromBufferAttribute(positionAttribute, face.b);  
            const vc = new THREE.Vector3().fromBufferAttribute(positionAttribute, face.c);
            
            positions.push(va.x, va.y, va.z);
            positions.push(vb.x, vb.y, vb.z);
            positions.push(vc.x, vc.y, vc.z);
            
            faceGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
            return faceGeometry;
            
        } catch (error) {
            console.error('Error creating face geometry:', error);
            return null;
        }
    }

    /**
     * Check if geometry is box-like (has rectangular faces even if type is not BoxGeometry)
     */
    isBoxLikeGeometry(geometry) {
        if (!geometry || !geometry.getAttribute('position')) return false;

        const positions = geometry.getAttribute('position');
        const vertexCount = positions.count;

        // Box geometries typically have 24 vertices (6 faces × 4 vertices each)
        // But modified boxes might have different counts, so check for characteristic properties
        if (vertexCount === 24 || vertexCount === 8) {
            // Check if geometry has a bounding box that suggests rectangular faces
            geometry.computeBoundingBox();
            const bbox = geometry.boundingBox;

            if (bbox) {
                // Simple heuristic: if it has distinct min/max values for all 3 axes, it's likely box-like
                const hasDistinctX = Math.abs(bbox.max.x - bbox.min.x) > 0.001;
                const hasDistinctY = Math.abs(bbox.max.y - bbox.min.y) > 0.001;
                const hasDistinctZ = Math.abs(bbox.max.z - bbox.min.z) > 0.001;

                return hasDistinctX && hasDistinctY && hasDistinctZ;
            }
        }

        return false;
    }

    /**
     * Create complete rectangular face geometry for box geometries
     * Uses Three.js built-in face detection to highlight entire face
     */
    createBoxFaceGeometry(hit) {
        const object = hit.object;
        const face = hit.face;
        const positionAttribute = object.geometry.getAttribute('position');
        
        if (!positionAttribute) return null;
        
        // Get face normal to determine which box face this triangle belongs to
        const normal = face.normal.clone().normalize();
        
        // Get bounding box to determine face dimensions
        object.geometry.computeBoundingBox();
        const box = object.geometry.boundingBox;
        if (!box) return null;
        
        let faceVertices = [];
        
        // Determine which complete face to highlight based on normal direction
        const absNormal = new THREE.Vector3(Math.abs(normal.x), Math.abs(normal.y), Math.abs(normal.z));
        
        if (absNormal.x > 0.9) {
            // X face (left or right side)
            const x = normal.x > 0 ? box.max.x : box.min.x;
            faceVertices = [
                // Two triangles forming the complete rectangular face
                x, box.min.y, box.min.z,  // Triangle 1
                x, box.max.y, box.min.z,
                x, box.max.y, box.max.z,
                
                x, box.min.y, box.min.z,  // Triangle 2 
                x, box.max.y, box.max.z,
                x, box.min.y, box.max.z
            ];
        } else if (absNormal.y > 0.9) {
            // Y face (top or bottom)
            const y = normal.y > 0 ? box.max.y : box.min.y;
            faceVertices = [
                // Two triangles forming the complete rectangular face
                box.min.x, y, box.min.z,  // Triangle 1
                box.max.x, y, box.min.z,
                box.max.x, y, box.max.z,
                
                box.min.x, y, box.min.z,  // Triangle 2
                box.max.x, y, box.max.z,
                box.min.x, y, box.max.z
            ];
        } else if (absNormal.z > 0.9) {
            // Z face (front or back)
            const z = normal.z > 0 ? box.max.z : box.min.z;
            faceVertices = [
                // Two triangles forming the complete rectangular face
                box.min.x, box.min.y, z,  // Triangle 1
                box.max.x, box.min.y, z,
                box.max.x, box.max.y, z,
                
                box.min.x, box.min.y, z,  // Triangle 2
                box.max.x, box.max.y, z,
                box.min.x, box.max.y, z
            ];
        } else {
            // Fallback to triangle if face detection fails
            const va = new THREE.Vector3().fromBufferAttribute(positionAttribute, face.a);
            const vb = new THREE.Vector3().fromBufferAttribute(positionAttribute, face.b);
            const vc = new THREE.Vector3().fromBufferAttribute(positionAttribute, face.c);
            faceVertices = [va.x, va.y, va.z, vb.x, vb.y, vb.z, vc.x, vc.y, vc.z];
        }
        
        // Create geometry for the complete face
        const faceGeometry = new THREE.BufferGeometry();
        faceGeometry.setAttribute('position', new THREE.Float32BufferAttribute(faceVertices, 3));
        return faceGeometry;
    }
    
    
    // Clear current highlight with robust cleanup
    // Show object highlight (for entire object selection)
    showObjectHighlight(hit) {
        // Reduced logging for better console readability
        console.log('VisualEffects: Showing object highlight for', hit?.object?.name || 'unnamed');
        
        if (!hit || !hit.object) {
            console.warn('VisualEffects.showObjectHighlight: invalid hit data', hit);
            return;
        }
        
        this.clearHighlight();
        
        try {
            // Create highlight geometry from the entire object geometry
            const object = hit.object;
            const geometry = object.geometry;
            
            if (!geometry) {
                console.warn('VisualEffects.showObjectHighlight: object has no geometry');
                return;
            }
            
            // Create clean edge highlight of the entire object
            const edgeGeometry = new THREE.EdgesGeometry(geometry);
            const edgeMaterial = new THREE.LineBasicMaterial({ 
                color: 0xff6600, // Orange color for object selection
                linewidth: 2,
                transparent: true,
                opacity: 0.9,
                depthTest: false
            });
            
            const edgeMesh = new THREE.LineSegments(edgeGeometry, edgeMaterial);
            
            // Copy transform from original object
            edgeMesh.position.copy(object.position);
            edgeMesh.rotation.copy(object.rotation);  
            edgeMesh.scale.copy(object.scale);
            
            // Add to same parent as original object
            if (object.parent) {
                object.parent.add(edgeMesh);
            } else {
                this.scene.add(edgeMesh);
            }
            
            this.currentHighlight = { object, hit };
            this.highlightMesh = edgeMesh;
            
        } catch (error) {
            console.error('VisualEffects.showObjectHighlight error:', error);
        }
    }
    
    clearHighlight() {
        if (this.highlightMesh) {
            // Unregister from MeshSynchronizer first
            const meshSynchronizer = window.modlerComponents?.meshSynchronizer;
            if (meshSynchronizer && this.currentHighlight) {
                // CONTAINER FIX: Unregister from the correct target object
                const isContainerCollision = this.currentHighlight.object?.userData?.isContainerCollision;
                const targetObject = isContainerCollision && this.currentHighlight.object.parent
                    ? this.currentHighlight.object.parent
                    : this.currentHighlight.object;
                meshSynchronizer.unregisterRelatedMesh(targetObject, this.highlightMesh, 'highlight');
            }
            
            // Remove from scene first
            if (this.highlightMesh.parent) {
                this.highlightMesh.parent.remove(this.highlightMesh);
            }
            
            // Clean up geometry
            if (this.highlightMesh.geometry) {
                this.highlightMesh.geometry.dispose();
            }
            
            // Clean up material (if it's not the shared one)
            if (this.highlightMesh.material && this.highlightMesh.material !== this.highlightMaterial) {
                this.highlightMesh.material.dispose();
            }
            
            this.highlightMesh = null;
        }
        
        // Clear highlight state
        this.currentHighlight = null;
        this.stopFadeAnimation();

        // Clear rectangle preview if it exists
        this.clearRectanglePreview();
    }

    /**
     * Show rectangle preview during box creation
     */
    showRectanglePreview(startPos, currentPos) {
        if (!startPos || !currentPos) return;

        this.clearRectanglePreview();

        const width = Math.abs(currentPos.x - startPos.x);
        const depth = Math.abs(currentPos.z - startPos.z);

        if (width < 0.01 || depth < 0.01) return; // Too small

        // Create rectangle outline
        const geometry = new THREE.PlaneGeometry(width, depth);
        const edges = new THREE.EdgesGeometry(geometry);
        // Get configurable color from configuration manager
        const configManager = window.modlerComponents?.configurationManager;
        const configColor = configManager?.get('visual.boxCreation.color') || '#00ff00';
        const color = parseInt(configColor.replace('#', ''), 16);

        const material = new THREE.LineBasicMaterial({
            color: color,
            linewidth: 2
        });

        this.rectanglePreview = new THREE.LineSegments(edges, material);

        // Position slightly above ground level to prevent z-fighting with floor grid
        const centerX = (startPos.x + currentPos.x) / 2;
        const centerZ = (startPos.z + currentPos.z) / 2;
        this.rectanglePreview.position.set(centerX, 0.001, centerZ);
        this.rectanglePreview.rotation.x = -Math.PI / 2; // Lay flat on ground

        this.scene.add(this.rectanglePreview);
    }

    /**
     * Clear rectangle preview
     */
    clearRectanglePreview() {
        if (this.rectanglePreview) {
            this.scene.remove(this.rectanglePreview);
            if (this.rectanglePreview.geometry) {
                this.rectanglePreview.geometry.dispose();
            }
            if (this.rectanglePreview.material) {
                this.rectanglePreview.material.dispose();
            }
            this.rectanglePreview = null;
        }
    }


    // Check if currently highlighting a specific object/face
    isHighlighting(object = null, faceIndex = null) {
        if (!this.currentHighlight) return false;
        
        if (object && this.currentHighlight.object !== object) return false;
        if (faceIndex !== null && this.currentHighlight.faceIndex !== faceIndex) return false;
        
        return true;
    }
    
    // Start fade animation
    startFadeAnimation(fadeIn = true) {
        this.stopFadeAnimation();
        
        this.fadeDirection = fadeIn ? 1 : -1;
        this.fadeOpacity = fadeIn ? 0 : 0.1;
        
        this.animationId = requestAnimationFrame(this.updateFadeAnimation.bind(this));
    }
    
    // Update fade animation
    updateFadeAnimation() {
        if (!this.highlightMesh) {
            this.stopFadeAnimation();
            return;
        }
        
        // Update opacity
        this.fadeOpacity += this.fadeDirection * 0.03;
        
        // Clamp opacity
        if (this.fadeDirection > 0) {
            this.fadeOpacity = Math.min(0.1, this.fadeOpacity);
            if (this.fadeOpacity >= 0.1) {
                this.stopFadeAnimation();
                return;
            }
        } else {
            this.fadeOpacity = Math.max(0, this.fadeOpacity);
            if (this.fadeOpacity <= 0) {
                this.clearHighlight();
                return;
            }
        }
        
        // Apply opacity to material
        this.highlightMaterial.opacity = this.fadeOpacity;
        
        // Continue animation
        this.animationId = requestAnimationFrame(this.updateFadeAnimation.bind(this));
    }
    
    // Stop fade animation
    stopFadeAnimation() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
    }
    
    // Hide highlight with fade out
    hideHighlight() {
        if (this.highlightMesh) {
            this.startFadeAnimation(false);
        }
    }
    
    // Get current highlight info
    getCurrentHighlight() {
        return this.currentHighlight;
    }
    
    // Memory cleanup
    /**
     * Create preview box with edge wireframe - centralized for consistency
     * @param {number} width - Box width
     * @param {number} height - Box height  
     * @param {number} depth - Box depth
     * @param {THREE.Vector3} position - Box position
     * @param {number} color - Hex color (default: 0x00ff00 green)
     * @param {number} opacity - Opacity (default: 0.8)
     * @returns {THREE.LineSegments} Edge wireframe mesh
     */
    createPreviewBox(width, height, depth, position, color = 0x00ff00, opacity = 0.8) {
        // Create box geometry
        const geometry = new THREE.BoxGeometry(width, height, depth);
        
        // Create edges for clean wireframe (no triangulation)
        const edges = new THREE.EdgesGeometry(geometry);
        const material = new THREE.LineBasicMaterial({ 
            color: color,
            transparent: true,
            opacity: opacity,
            linewidth: 1
        });
        
        const edgesMesh = new THREE.LineSegments(edges, material);
        edgesMesh.position.copy(position);
        
        // Clean up intermediate geometry
        geometry.dispose();
        
        return edgesMesh;
    }
    
    /**
     * Color constants for different tools - easy to maintain and consistent
     */
    static Colors = {
        BOX_CREATION: 0x00ff00,    // Green for box creation
        SELECTION: 0xff6600,       // Orange for selection
        MOVE_TOOL: 0x00ffff,      // Cyan for move tool
        LAYOUT_TOOL: 0xff00ff,     // Magenta for layout
        ERROR: 0xff0000,           // Red for errors
        DISABLED: 0x666666         // Gray for disabled states
    };

    destroy() {
        this.clearHighlight();
        
        if (this.highlightMaterial) {
            this.highlightMaterial.dispose();
            this.highlightMaterial = null;
        }
        
        this.stopFadeAnimation();
        console.log('VisualEffects destroyed');
    }

    /**
     * Show layout axis guides for a container
     * Creates dashed red lines between opposite face centers along the specified axis
     */
    showLayoutAxisGuides(container, axis) {
        // Clear any existing guides
        this.clearLayoutAxisGuides();

        if (!container || !container.geometry) return;

        // Calculate container bounds
        container.geometry.computeBoundingBox();
        const bbox = container.geometry.boundingBox;
        if (!bbox) return;

        // Get opposite face centers based on axis
        let startPoint, endPoint;
        switch (axis) {
            case 'x':
                startPoint = new THREE.Vector3(bbox.min.x, (bbox.min.y + bbox.max.y) / 2, (bbox.min.z + bbox.max.z) / 2);
                endPoint = new THREE.Vector3(bbox.max.x, (bbox.min.y + bbox.max.y) / 2, (bbox.min.z + bbox.max.z) / 2);
                break;
            case 'y':
                startPoint = new THREE.Vector3((bbox.min.x + bbox.max.x) / 2, bbox.min.y, (bbox.min.z + bbox.max.z) / 2);
                endPoint = new THREE.Vector3((bbox.min.x + bbox.max.x) / 2, bbox.max.y, (bbox.min.z + bbox.max.z) / 2);
                break;
            case 'z':
                startPoint = new THREE.Vector3((bbox.min.x + bbox.max.x) / 2, (bbox.min.y + bbox.max.y) / 2, bbox.min.z);
                endPoint = new THREE.Vector3((bbox.min.x + bbox.max.x) / 2, (bbox.min.y + bbox.max.y) / 2, bbox.max.z);
                break;
            default:
                return;
        }

        // Transform points to world space
        const containerWorldMatrix = container.matrixWorld;
        startPoint.applyMatrix4(containerWorldMatrix);
        endPoint.applyMatrix4(containerWorldMatrix);

        // Create dashed line geometry
        const points = [startPoint, endPoint];
        const geometry = new THREE.BufferGeometry().setFromPoints(points);

        // Create dashed red material
        const material = new THREE.LineDashedMaterial({
            color: 0xff0000,
            linewidth: 2,
            scale: 1,
            dashSize: 0.2,
            gapSize: 0.1,
            transparent: true,
            opacity: 0.8
        });

        // Create line mesh
        const line = new THREE.Line(geometry, material);
        line.computeLineDistances(); // Required for dashed lines
        line.renderOrder = 1001; // Render above other objects

        // Store reference for cleanup
        this.layoutAxisGuides = line;

        // Add to scene
        this.scene.add(line);

    }

    /**
     * Clear layout axis guides
     */
    clearLayoutAxisGuides() {
        if (this.layoutAxisGuides) {
            this.scene.remove(this.layoutAxisGuides);
            if (this.layoutAxisGuides.geometry) {
                this.layoutAxisGuides.geometry.dispose();
            }
            if (this.layoutAxisGuides.material) {
                this.layoutAxisGuides.material.dispose();
            }
            this.layoutAxisGuides = null;
        }
    }
}

// Export for use in main application
window.VisualEffects = VisualEffects;