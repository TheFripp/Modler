// Modler V2 - Scene Layer
// Visual Effects - Face highlighting with minimal abstraction

class VisualEffects {
    constructor(scene, geometryFactory = null, materialManager = null) {
        this.scene = scene;

        // Essential state - support mesh system handles materials
        this.currentHighlight = null;
        this.highlightMesh = null;
        this.rectanglePreview = null;
        this.axisHighlightMesh = null; // Reusable axis highlight mesh (create once)

        // Use injected factories (Phase 1 - Factory Consolidation)
        // Fallback to new instances for backward compatibility during transition
        this.geometryFactory = geometryFactory || new GeometryFactory();
        this.materialManager = materialManager || new MaterialManager();
        this.resourcePool = new VisualizationResourcePool();

        // Material setup handled by support mesh system
        this.registerWithConfigurationManager();
    }

    // ===== MATERIAL SETUP =====
    // Support mesh system handles all material creation and management

    isContainer(object) {
        const sceneController = window.modlerComponents?.sceneController;
        if (sceneController) {
            const objectData = sceneController.getObjectByMesh(object);
            return objectData && objectData.isContainer;
        }
        return false;
    }

    // ===== CONFIGURATION MANAGEMENT =====

    registerWithConfigurationManager() {
        if (window.modlerComponents?.configurationManager) {
            window.modlerComponents.visualEffects = this;
        } else {
            const checkConfigManager = () => {
                if (window.modlerComponents?.configurationManager) {
                    window.modlerComponents.visualEffects = this;
                } else {
                    setTimeout(checkConfigManager, 100);
                }
            };
            checkConfigManager();
        }
    }

    onConfigChanged() {
        // Configuration changes handled by support mesh system and MaterialManager
        // Re-create current highlight to pick up new configuration
        if (this.currentHighlight && this.highlightMesh) {
            const hit = {
                object: this.currentHighlight.object,
                face: { normal: this.currentHighlight.faceNormal },
                faceIndex: this.currentHighlight.faceIndex
            };

            this.clearHighlight();
            this.showFaceHighlight(hit);
        }
    }

    updateConfiguration(newConfig) {
        if (newConfig) {
            this.onConfigChanged();
        }
    }

    // ===== CONTAINER TARGET HANDLING =====

    getContainerTarget(hitObject) {
        if (!hitObject) return null;

        const isContainerInteractive = hitObject.userData?.isContainerInteractive;
        const isContainerCollision = hitObject.userData?.isContainerCollision;

        if (isContainerInteractive && hitObject.userData.containerMesh) {
            return hitObject.userData.containerMesh;
        } else if (isContainerCollision && hitObject.parent) {
            return hitObject.parent;
        } else {
            return hitObject;
        }
    }

    // ===== FACE HIGHLIGHTING =====

    showFaceHighlight(hit) {
        if (!hit?.object?.geometry || !hit?.face) {
            return false;
        }

        // Check for duplicate highlights
        if (this.currentHighlight && this.currentHighlight.object === hit.object) {
            if (hit.object.geometry.type === 'BoxGeometry') {
                const currentNormal = this.currentHighlight.faceNormal;
                const newNormal = hit.face.normal.clone().normalize();
                if (currentNormal && currentNormal.distanceTo(newNormal) < 0.1) {
                    return true; // Already highlighting this face
                }
            } else if (this.currentHighlight.faceIndex === hit.faceIndex) {
                return true;
            }
        }

        this.clearHighlight();

        // CREATE ONCE ARCHITECTURE: Use pre-created support meshes if available
        const targetObject = this.getContainerTarget(hit.object);
        if (!targetObject) return false;

        const supportMeshes = targetObject.userData?.supportMeshes;
        if (supportMeshes?.faceHighlight) {
            const supportMeshFactory = window.modlerComponents?.supportMeshFactory;
            if (supportMeshFactory) {
                supportMeshFactory.positionFaceHighlightForHit(supportMeshes.faceHighlight, hit);
            }
            supportMeshes.faceHighlight.visible = true;
            this.highlightMesh = supportMeshes.faceHighlight;
        } else {
            // ARCHITECTURE: Support mesh system required - no legacy fallback
            console.warn('Object missing support meshes - cannot show face highlight:', targetObject.name);
            return false;
        }

        this.currentHighlight = {
            object: hit.object,
            faceIndex: hit.faceIndex,
            mesh: this.highlightMesh,
            faceNormal: hit.face.normal.clone()
        };

        return true;
    }

    showAxisFaceHighlight(axis) {
        const selectionController = window.modlerComponents?.selectionController;
        if (!selectionController) return false;

        const selectedObjects = selectionController.getSelectedObjects();
        if (selectedObjects.length === 0) return false;

        const selectedObject = selectedObjects[0];
        if (!selectedObject?.geometry) return false;

        this.clearHighlight();

        const faceGeometry = this.createAxisFacesGeometry(selectedObject, axis);
        if (!faceGeometry) return false;

        // Use configuration for axis highlighting
        const configManager = window.modlerComponents?.configurationManager;
        const axisColor = configManager?.get('visual.effects.axisHighlight.color') || '#00ff88';
        const axisOpacity = configManager?.get('visual.effects.axisHighlight.opacity') || 0.3;

        // ARCHITECTURE: Create axis highlight mesh once, reuse it
        if (!this.axisHighlightMesh) {
            const axisMaterial = this.materialManager.createAxisHighlightMaterial({
                color: axisColor,
                opacity: axisOpacity
            });
            this.axisHighlightMesh = this.resourcePool.getMeshHighlight(faceGeometry, axisMaterial);

            const scene = window.modlerComponents?.scene;
            if (scene) {
                scene.add(this.axisHighlightMesh);
            }
        } else {
            // Reuse existing mesh, update geometry
            if (this.axisHighlightMesh.geometry !== faceGeometry) {
                // Return old geometry to pool
                this.geometryFactory.returnGeometry(this.axisHighlightMesh.geometry, 'face');
                this.axisHighlightMesh.geometry = faceGeometry;
            }
        }

        // Update transform to match object
        this.axisHighlightMesh.position.copy(selectedObject.position);
        this.axisHighlightMesh.rotation.copy(selectedObject.rotation);
        this.axisHighlightMesh.scale.copy(selectedObject.scale);
        this.axisHighlightMesh.visible = true;

        this.highlightMesh = this.axisHighlightMesh;
        this.currentHighlight = {
            object: selectedObject,
            axis: axis,
            type: 'axis'
        };

        return true;
    }

    clearHighlight() {
        if (this.highlightMesh) {
            // Check if this is a pre-created support mesh
            let isPreCreatedMesh = false;
            if (this.currentHighlight) {
                const targetObject = this.getContainerTarget(this.currentHighlight.object);
                const supportMeshes = targetObject?.userData?.supportMeshes;
                if (supportMeshes?.faceHighlight === this.highlightMesh) {
                    supportMeshes.faceHighlight.visible = false;
                    isPreCreatedMesh = true;
                }
            }

            // Check if this is the reusable axis highlight mesh
            if (this.highlightMesh === this.axisHighlightMesh) {
                this.axisHighlightMesh.visible = false;
                isPreCreatedMesh = true; // Don't dispose, keep for reuse
            }

            // Clean up legacy highlight if not pre-created
            if (!isPreCreatedMesh) {
                // Return mesh to resource pool if pooled
                if (this.highlightMesh.userData?.pooled) {
                    this.resourcePool.returnMeshHighlight(this.highlightMesh);
                } else {
                    // Legacy cleanup for non-pooled meshes
                    if (this.highlightMesh.parent) {
                        this.highlightMesh.parent.remove(this.highlightMesh);
                    }
                    if (this.highlightMesh.geometry) {
                        this.geometryFactory.returnGeometry(this.highlightMesh.geometry, 'face');
                    }
                }
            }

            this.highlightMesh = null;
        }

        this.currentHighlight = null;
        this.clearRectanglePreview();
    }

    // ===== GEOMETRY CREATION =====

    createFaceGeometry(hit, type = 'auto') {
        if (!hit?.object?.geometry || !hit?.face) return null;

        try {
            // Delegate to GeometryFactory for centralized geometry creation with pooling
            return this.geometryFactory.createFaceGeometry(hit, type);
        } catch (error) {
            console.error('VisualEffects: createFaceGeometry error:', error);
            return null;
        }
    }

    createTriangleFaceGeometry(hit) {
        if (!hit?.object?.geometry || !hit?.face) return null;

        try {
            // Delegate to GeometryFactory for centralized geometry creation with pooling
            return this.geometryFactory.createTriangleFaceGeometry(hit);
        } catch (error) {
            console.error('VisualEffects: createTriangleFaceGeometry error:', error);
            return null;
        }
    }

    createRectangularFaceGeometry(hit) {
        if (!hit?.object?.geometry || !hit?.face) return null;

        try {
            // Delegate to GeometryFactory for centralized geometry creation with pooling
            return this.geometryFactory.createRectangularFaceGeometry(hit);
        } catch (error) {
            console.error('VisualEffects: createRectangularFaceGeometry error:', error);
            return null;
        }
    }

    createAxisFacesGeometry(object, axis) {
        if (!object?.geometry) return null;

        try {
            // Delegate to GeometryFactory for centralized geometry creation with pooling
            return this.geometryFactory.createAxisFacesGeometry(object, axis);
        } catch (error) {
            console.error('VisualEffects: createAxisFacesGeometry error:', error);
            return null;
        }
    }

    generateRectangularFaceVertices(bbox, axis, side) {
        const vertices = [];
        let coord, minVal1, maxVal1, minVal2, maxVal2;

        switch (axis) {
            case 'x':
                coord = side === 'max' ? bbox.max.x : bbox.min.x;
                minVal1 = bbox.min.y; maxVal1 = bbox.max.y;
                minVal2 = bbox.min.z; maxVal2 = bbox.max.z;
                break;
            case 'y':
                coord = side === 'max' ? bbox.max.y : bbox.min.y;
                minVal1 = bbox.min.x; maxVal1 = bbox.max.x;
                minVal2 = bbox.min.z; maxVal2 = bbox.max.z;
                break;
            case 'z':
                coord = side === 'max' ? bbox.max.z : bbox.min.z;
                minVal1 = bbox.min.x; maxVal1 = bbox.max.x;
                minVal2 = bbox.min.y; maxVal2 = bbox.max.y;
                break;
            default:
                return [];
        }

        // Generate two triangles for the rectangular face
        const v1 = this.createVertexForAxis(axis, coord, minVal1, minVal2);
        const v2 = this.createVertexForAxis(axis, coord, maxVal1, minVal2);
        const v3 = this.createVertexForAxis(axis, coord, maxVal1, maxVal2);
        const v4 = this.createVertexForAxis(axis, coord, minVal1, minVal2);
        const v5 = this.createVertexForAxis(axis, coord, maxVal1, maxVal2);
        const v6 = this.createVertexForAxis(axis, coord, minVal1, maxVal2);

        // Correct winding order based on side
        if ((axis === 'x' && side === 'min') || (axis === 'y' && side === 'max') || (axis === 'z' && side === 'min')) {
            vertices.push(...v1, ...v3, ...v2, ...v4, ...v6, ...v5);
        } else {
            vertices.push(...v1, ...v2, ...v3, ...v4, ...v5, ...v6);
        }

        return vertices;
    }

    createVertexForAxis(axis, coord, val1, val2) {
        switch (axis) {
            case 'x': return [coord, val1, val2];
            case 'y': return [val1, coord, val2];
            case 'z': return [val1, val2, coord];
            default: return [0, 0, 0];
        }
    }

    isBoxLikeGeometry(geometry) {
        if (!geometry?.getAttribute('position')) return false;

        const positions = geometry.getAttribute('position');
        const vertexCount = positions.count;

        if (vertexCount === 24 || vertexCount === 8) {
            geometry.computeBoundingBox();
            const bbox = geometry.boundingBox;
            if (bbox) {
                const threshold = 0.001;
                const hasDistinctX = Math.abs(bbox.max.x - bbox.min.x) > threshold;
                const hasDistinctY = Math.abs(bbox.max.y - bbox.min.y) > threshold;
                const hasDistinctZ = Math.abs(bbox.max.z - bbox.min.z) > threshold;
                return hasDistinctX && hasDistinctY && hasDistinctZ;
            }
        }

        return false;
    }

    // ===== PREVIEW FUNCTIONALITY =====

    showRectanglePreview(startPos, currentPos) {
        if (!startPos || !currentPos) return;

        const width = Math.abs(currentPos.x - startPos.x);
        const depth = Math.abs(currentPos.z - startPos.z);
        const minSize = 0.01;

        if (width < minSize || depth < minSize) {
            if (this.rectanglePreview) {
                this.rectanglePreview.visible = false;
            }
            return;
        }

        // ARCHITECTURE: Create preview mesh once, update geometry on changes
        if (!this.rectanglePreview) {
            const configManager = window.modlerComponents?.configurationManager;
            const configColor = configManager?.get('visual.boxCreation.color') || '#00ff00';
            const color = parseInt(configColor.replace('#', ''), 16);
            const lineWidth = configManager?.get('visual.effects.wireframe.lineWidth') || 1;

            const material = this.materialManager.createPreviewWireframeMaterial({
                color: color,
                linewidth: lineWidth
            });

            // Create with initial dimensions
            const geometry = new THREE.PlaneGeometry(width, depth);
            const edges = new THREE.EdgesGeometry(geometry);

            this.rectanglePreview = this.resourcePool.getLineMesh(edges, material);
            this.rectanglePreview.rotation.x = -Math.PI / 2;
            this.scene.add(this.rectanglePreview);

            this.geometryFactory.returnGeometry(geometry, 'plane');
        } else {
            // Update existing geometry
            const geometry = new THREE.PlaneGeometry(width, depth);
            const edges = new THREE.EdgesGeometry(geometry);

            // Return old geometry and update
            this.geometryFactory.returnGeometry(this.rectanglePreview.geometry, 'edge');
            this.rectanglePreview.geometry = edges;
            this.geometryFactory.returnGeometry(geometry, 'plane');
        }

        // Update position
        const centerX = (startPos.x + currentPos.x) / 2;
        const centerZ = (startPos.z + currentPos.z) / 2;
        this.rectanglePreview.position.set(centerX, 0.001, centerZ);
        this.rectanglePreview.visible = true;
    }

    clearRectanglePreview() {
        // ARCHITECTURE: Just hide the preview, keep for reuse
        if (this.rectanglePreview) {
            this.rectanglePreview.visible = false;
        }
    }

    // ===== BOX CREATION HELPERS =====

    createPreviewBox(width, height, depth, position, color = 0x00ff00, opacity = 0.8) {
        const configManager = window.modlerComponents?.configurationManager;
        const lineWidth = configManager?.get('visual.effects.wireframe.lineWidth') || 1;

        const geometry = this.geometryFactory.createBoxGeometry(width, height, depth);
        const edges = this.geometryFactory.createEdgeGeometryFromSource(geometry);
        const material = this.materialManager.createPreviewWireframeMaterial({
            color: color,
            linewidth: lineWidth,
            opacity: opacity
        });

        const edgesMesh = this.resourcePool.getLineMesh(edges, material);
        edgesMesh.position.copy(position);

        this.geometryFactory.returnGeometry(geometry, 'box');
        return edgesMesh;
    }

    createLayoutAwareWireframe(width, height, depth, position, color = 0x00ff00, opacity = 0.8, layoutDirection = null) {
        const configManager = window.modlerComponents?.configurationManager;
        const lineWidth = configManager?.get('visual.effects.wireframe.lineWidth') || 1;

        const group = this.resourcePool.getGroup();
        group.position.copy(position);

        const halfWidth = width / 2;
        const halfHeight = height / 2;
        const halfDepth = depth / 2;

        const vertices = [
            [-halfWidth, -halfHeight, halfDepth],   // 0
            [halfWidth, -halfHeight, halfDepth],    // 1
            [halfWidth, halfHeight, halfDepth],     // 2
            [-halfWidth, halfHeight, halfDepth],    // 3
            [-halfWidth, -halfHeight, -halfDepth],  // 4
            [halfWidth, -halfHeight, -halfDepth],   // 5
            [halfWidth, halfHeight, -halfDepth],    // 6
            [-halfWidth, halfHeight, -halfDepth]    // 7
        ];

        const edgesByDirection = {
            x: [[0, 1], [2, 3], [4, 5], [6, 7]],
            y: [[0, 3], [1, 2], [4, 7], [5, 6]],
            z: [[0, 4], [1, 5], [2, 6], [3, 7]]
        };

        const fullOpacityMaterial = this.materialManager.createPreviewWireframeMaterial({
            color: color,
            linewidth: lineWidth,
            opacity: opacity
        });
        const reducedOpacityMaterial = this.materialManager.createPreviewWireframeMaterial({
            color: color,
            linewidth: lineWidth,
            opacity: opacity * 0.5
        });

        Object.keys(edgesByDirection).forEach(direction => {
            const edges = edgesByDirection[direction];
            const positions = [];

            edges.forEach(([startIdx, endIdx]) => {
                const start = vertices[startIdx];
                const end = vertices[endIdx];
                positions.push(start[0], start[1], start[2]);
                positions.push(end[0], end[1], end[2]);
            });

            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));

            const material = (layoutDirection === direction) ? reducedOpacityMaterial : fullOpacityMaterial;
            const lineSegments = this.resourcePool.getLineMesh(geometry, material);

            lineSegments.userData.direction = direction;
            lineSegments.userData.isLayoutDirection = (layoutDirection === direction);

            group.add(lineSegments);
        });

        group.userData.layoutDirection = layoutDirection;
        group.userData.isLayoutAwareWireframe = true;

        return group;
    }

    // ===== PADDING VISUALIZATION =====

    showPaddingVisualization(mesh, padding) {
        if (!mesh || !padding) return;

        // Get container bounds
        mesh.geometry.computeBoundingBox();
        const bbox = mesh.geometry.boundingBox;
        if (!bbox) return;

        const containerSize = bbox.getSize(new THREE.Vector3());
        const containerCenter = bbox.getCenter(new THREE.Vector3());

        // Calculate inset box (padding creates space INSIDE the container)
        // padding.width affects both -X and +X sides equally
        // padding.height affects both -Y and +Y sides equally
        // padding.depth affects both -Z and +Z sides equally
        const paddedWidth = containerSize.x - (padding.width * 2);
        const paddedHeight = containerSize.y - (padding.height * 2);
        const paddedDepth = containerSize.z - (padding.depth * 2);

        // Only show if padding is positive and doesn't exceed container size
        if (paddedWidth <= 0 || paddedHeight <= 0 || paddedDepth <= 0) {
            this.hidePaddingVisualization(mesh);
            return;
        }

        // ARCHITECTURE: Create padding box once, reuse and update
        let paddingBox = mesh.getObjectByName('paddingVisualization');

        if (!paddingBox) {
            // First-time creation: single inset wireframe box
            paddingBox = this.createPaddingBox(1, 1, 1, new THREE.Vector3(), 0xff9900, 0.5);
            paddingBox.name = 'paddingVisualization';
            mesh.add(paddingBox);
        }

        // Update the inset box dimensions and position (centered in container)
        this.updatePaddingBox(paddingBox, paddedWidth, paddedHeight, paddedDepth, containerCenter);
        paddingBox.visible = true;
    }

    updatePaddingBox(box, width, height, depth, position) {
        if (!box) return;

        // Create new box geometry
        const boxGeometry = this.geometryFactory.createBoxGeometry(width, height, depth);

        // Create edges geometry (only face edges, not triangles)
        const edgesGeometry = new THREE.EdgesGeometry(boxGeometry);

        // Return box geometry to pool
        this.geometryFactory.returnGeometry(boxGeometry, 'box');

        // Dispose old geometry and update
        if (box.geometry) {
            box.geometry.dispose();
        }
        box.geometry = edgesGeometry;
        box.position.copy(position);
    }

    hidePaddingVisualization(mesh) {
        if (!mesh) return;

        // ARCHITECTURE: Just hide the padding group, keep for reuse
        const paddingGroup = mesh.getObjectByName('paddingVisualization');
        if (paddingGroup) {
            paddingGroup.visible = false;
        }
    }

    createPaddingBox(width, height, depth, position, color, opacity) {
        // Create box geometry
        const boxGeometry = this.geometryFactory.createBoxGeometry(width, height, depth);

        // Create edges geometry for wireframe (only outer edges, not triangles)
        const edgesGeometry = new THREE.EdgesGeometry(boxGeometry);

        // Return box geometry to pool since we only need edges
        this.geometryFactory.returnGeometry(boxGeometry, 'box');

        // Create line material for edges
        const material = new THREE.LineBasicMaterial({
            color: color,
            opacity: opacity,
            transparent: true,
            depthTest: true,
            depthWrite: false
        });

        // Create LineSegments (wireframe box with only face edges)
        const box = new THREE.LineSegments(edgesGeometry, material);
        box.position.copy(position);
        return box;
    }

    // ===== CLEANUP =====

    destroy() {
        this.clearHighlight();
        // Support mesh system handles material cleanup
    }
}

// Export for use in main application
window.VisualEffects = VisualEffects;