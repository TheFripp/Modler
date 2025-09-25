// Modler V2 - Scene Layer
// Visual Effects - Face highlighting with minimal abstraction

class VisualEffects {
    constructor(scene) {
        this.scene = scene;

        // Essential state - support mesh system handles materials
        this.currentHighlight = null;
        this.highlightMesh = null;
        this.rectanglePreview = null;

        // New unified systems
        this.geometryFactory = new GeometryFactory();
        this.materialManager = new MaterialManager();

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
            const supportMeshFactory = window.SupportMeshFactory ? new SupportMeshFactory() : null;
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

        const axisMaterial = this.materialManager.createAxisHighlightMaterial({
            color: axisColor,
            opacity: axisOpacity
        });

        this.highlightMesh = new THREE.Mesh(faceGeometry, axisMaterial);
        this.highlightMesh.position.copy(selectedObject.position);
        this.highlightMesh.rotation.copy(selectedObject.rotation);
        this.highlightMesh.scale.copy(selectedObject.scale);

        const scene = window.modlerComponents?.scene;
        if (scene) {
            scene.add(this.highlightMesh);
        }

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

            // Clean up legacy highlight if not pre-created
            if (!isPreCreatedMesh) {
                if (this.highlightMesh.parent) {
                    this.highlightMesh.parent.remove(this.highlightMesh);
                }
                if (this.highlightMesh.geometry) {
                    this.highlightMesh.geometry.dispose();
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

        this.clearRectanglePreview();

        const width = Math.abs(currentPos.x - startPos.x);
        const depth = Math.abs(currentPos.z - startPos.z);
        const minSize = 0.01;

        if (width < minSize || depth < minSize) return;

        const geometry = new THREE.PlaneGeometry(width, depth);
        const edges = new THREE.EdgesGeometry(geometry);

        const configManager = window.modlerComponents?.configurationManager;
        const configColor = configManager?.get('visual.boxCreation.color') || '#00ff00';
        const color = parseInt(configColor.replace('#', ''), 16);

        const lineWidth = configManager?.get('visual.effects.wireframe.lineWidth') || 1;

        const material = this.materialManager.createPreviewWireframeMaterial({
            color: color,
            linewidth: lineWidth
        });

        this.rectanglePreview = new THREE.LineSegments(edges, material);

        const centerX = (startPos.x + currentPos.x) / 2;
        const centerZ = (startPos.z + currentPos.z) / 2;
        this.rectanglePreview.position.set(centerX, 0.001, centerZ);
        this.rectanglePreview.rotation.x = -Math.PI / 2;

        this.scene.add(this.rectanglePreview);
    }

    clearRectanglePreview() {
        if (this.rectanglePreview) {
            if (this.rectanglePreview.parent) {
                this.rectanglePreview.parent.remove(this.rectanglePreview);
            }
            if (this.rectanglePreview.geometry) {
                this.rectanglePreview.geometry.dispose();
            }
            if (this.rectanglePreview.material) {
                this.rectanglePreview.material.dispose();
            }
            this.rectanglePreview = null;
        }
    }

    // ===== BOX CREATION HELPERS =====

    createPreviewBox(width, height, depth, position, color = 0x00ff00, opacity = 0.8) {
        const configManager = window.modlerComponents?.configurationManager;
        const lineWidth = configManager?.get('visual.effects.wireframe.lineWidth') || 1;

        const geometry = new THREE.BoxGeometry(width, height, depth);
        const edges = new THREE.EdgesGeometry(geometry);
        const material = this.materialManager.createPreviewWireframeMaterial({
            color: color,
            linewidth: lineWidth,
            opacity: opacity
        });

        const edgesMesh = new THREE.LineSegments(edges, material);
        edgesMesh.position.copy(position);

        geometry.dispose();
        return edgesMesh;
    }

    createLayoutAwareWireframe(width, height, depth, position, color = 0x00ff00, opacity = 0.8, layoutDirection = null) {
        const configManager = window.modlerComponents?.configurationManager;
        const lineWidth = configManager?.get('visual.effects.wireframe.lineWidth') || 1;

        const group = new THREE.Group();
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
            const lineSegments = new THREE.LineSegments(geometry, material);

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

        // Hide any existing padding visualization
        this.hidePaddingVisualization(mesh);

        // Get object bounds
        mesh.geometry.computeBoundingBox();
        const bbox = mesh.geometry.boundingBox;
        if (!bbox) return;

        // Create padding wireframes for each side
        const paddingGroup = new THREE.Group();
        paddingGroup.name = 'paddingVisualization';

        const size = bbox.getSize(new THREE.Vector3());
        const center = bbox.getCenter(new THREE.Vector3());

        // Create individual padding boxes for each side
        if (padding.top > 0) {
            const topBox = this.createPaddingBox(
                size.x, padding.top, size.z,
                new THREE.Vector3(center.x, bbox.max.y + padding.top/2, center.z),
                0xff9900, 0.3
            );
            paddingGroup.add(topBox);
        }

        if (padding.bottom > 0) {
            const bottomBox = this.createPaddingBox(
                size.x, padding.bottom, size.z,
                new THREE.Vector3(center.x, bbox.min.y - padding.bottom/2, center.z),
                0xff9900, 0.3
            );
            paddingGroup.add(bottomBox);
        }

        if (padding.left > 0) {
            const leftBox = this.createPaddingBox(
                padding.left, size.y, size.z,
                new THREE.Vector3(bbox.min.x - padding.left/2, center.y, center.z),
                0xff9900, 0.3
            );
            paddingGroup.add(leftBox);
        }

        if (padding.right > 0) {
            const rightBox = this.createPaddingBox(
                padding.right, size.y, size.z,
                new THREE.Vector3(bbox.max.x + padding.right/2, center.y, center.z),
                0xff9900, 0.3
            );
            paddingGroup.add(rightBox);
        }

        if (padding.front > 0) {
            const frontBox = this.createPaddingBox(
                size.x, size.y, padding.front,
                new THREE.Vector3(center.x, center.y, bbox.max.z + padding.front/2),
                0xff9900, 0.3
            );
            paddingGroup.add(frontBox);
        }

        if (padding.back > 0) {
            const backBox = this.createPaddingBox(
                size.x, size.y, padding.back,
                new THREE.Vector3(center.x, center.y, bbox.min.z - padding.back/2),
                0xff9900, 0.3
            );
            paddingGroup.add(backBox);
        }

        // Add to mesh
        mesh.add(paddingGroup);
    }

    hidePaddingVisualization(mesh) {
        if (!mesh) return;

        // Find and remove existing padding visualization
        const existingPadding = mesh.getObjectByName('paddingVisualization');
        if (existingPadding) {
            // Clean up all geometries and materials
            existingPadding.traverse((child) => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) {
                    if (Array.isArray(child.material)) {
                        child.material.forEach(mat => mat.dispose());
                    } else {
                        child.material.dispose();
                    }
                }
            });
            mesh.remove(existingPadding);
        }
    }

    createPaddingBox(width, height, depth, position, color, opacity) {
        const geometry = new THREE.BoxGeometry(width, height, depth);
        const material = this.materialManager.createPaddingVisualizationMaterial({
            color: color,
            opacity: opacity
        });

        const box = new THREE.Mesh(geometry, material);
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