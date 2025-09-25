// Modler V2 - Scene Layer
// Visual Effects - Face highlighting with minimal abstraction

class VisualEffects {
    constructor(scene) {
        this.scene = scene;

        // Essential state
        this.highlightMaterial = null;
        this.currentHighlight = null;
        this.highlightMesh = null;
        this.rectanglePreview = null;

        this.setupHighlightMaterial();
        this.registerWithConfigurationManager();
    }

    // ===== MATERIAL SETUP =====

    setupHighlightMaterial() {
        const configManager = window.modlerComponents?.configurationManager;
        const selectionColor = configManager?.get('visual.selection.color') || '#ff6600';
        const faceOpacity = configManager?.get('visual.effects.materials.face.opacity') || 0.6;
        const renderOrder = configManager?.get('visual.effects.materials.face.renderOrder') || 1000;

        const colorHex = parseInt(selectionColor.replace('#', ''), 16);

        this.highlightMaterial = new THREE.MeshBasicMaterial({
            color: colorHex,
            transparent: true,
            opacity: faceOpacity,
            side: THREE.DoubleSide,
            depthTest: false,
            depthWrite: false
        });

        this.highlightMaterial.renderOrder = renderOrder;
    }

    createContextualHighlightMaterial(targetObject) {
        const configManager = window.modlerComponents?.configurationManager;

        let highlightColor;
        if (this.isContainer(targetObject)) {
            highlightColor = configManager?.get('visual.containers.wireframeColor') || '#00ff00';
        } else {
            highlightColor = configManager?.get('visual.selection.color') || '#ff6600';
        }

        const faceOpacity = configManager?.get('visual.effects.materials.face.opacity') || 0.6;
        const renderOrder = configManager?.get('visual.effects.materials.face.renderOrder') || 1000;
        const colorHex = parseInt(highlightColor.replace('#', ''), 16);

        if (this.highlightMaterial) {
            this.highlightMaterial.dispose();
        }

        this.highlightMaterial = new THREE.MeshBasicMaterial({
            color: colorHex,
            transparent: true,
            opacity: faceOpacity,
            side: THREE.DoubleSide,
            depthTest: false,
            depthWrite: false
        });

        this.highlightMaterial.renderOrder = renderOrder;
    }

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
        if (this.highlightMaterial) {
            const configManager = window.modlerComponents?.configurationManager;
            const selectionColor = configManager?.get('visual.selection.color') || '#ff6600';
            const faceOpacity = configManager?.get('visual.effects.materials.face.opacity') || 0.6;
            const renderOrder = configManager?.get('visual.effects.materials.face.renderOrder') || 1000;

            const colorHex = parseInt(selectionColor.replace('#', ''), 16);
            this.highlightMaterial.color.setHex(colorHex);
            this.highlightMaterial.opacity = faceOpacity;
            this.highlightMaterial.renderOrder = renderOrder;
            this.highlightMaterial.needsUpdate = true;
        }

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
            // Fallback: create legacy highlight
            console.warn('Object missing support meshes, creating legacy face highlight:', targetObject.name);

            this.createContextualHighlightMaterial(hit.object);
            const faceGeometry = this.createFaceGeometry(hit);
            if (!faceGeometry) return false;

            this.highlightMesh = new THREE.Mesh(faceGeometry, this.highlightMaterial);
            const normalOffset = hit.face.normal.clone().multiplyScalar(0.001);
            this.highlightMesh.position.copy(normalOffset);
            this.highlightMesh.raycast = () => {};

            if (targetObject) {
                targetObject.add(this.highlightMesh);
            } else {
                this.scene.add(this.highlightMesh);
            }
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

        const colorHex = parseInt(axisColor.replace('#', ''), 16);

        const axisMaterial = new THREE.MeshBasicMaterial({
            color: colorHex,
            opacity: axisOpacity,
            transparent: true,
            side: THREE.DoubleSide,
            depthTest: false,
            depthWrite: false
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

    createFaceGeometry(hit) {
        if (!hit?.object?.geometry || !hit?.face) return null;

        const object = hit.object;
        const geometry = object.geometry;

        try {
            if (geometry.type === 'BoxGeometry' || this.isBoxLikeGeometry(geometry)) {
                return this.createRectangularFaceGeometry(hit);
            } else {
                return this.createTriangleFaceGeometry(hit);
            }
        } catch (error) {
            console.error('createFaceGeometry error:', error);
            return null;
        }
    }

    createTriangleFaceGeometry(hit) {
        const positionAttribute = hit.object.geometry.getAttribute('position');
        if (!positionAttribute) return null;

        const va = new THREE.Vector3().fromBufferAttribute(positionAttribute, hit.face.a);
        const vb = new THREE.Vector3().fromBufferAttribute(positionAttribute, hit.face.b);
        const vc = new THREE.Vector3().fromBufferAttribute(positionAttribute, hit.face.c);

        const positions = [va.x, va.y, va.z, vb.x, vb.y, vb.z, vc.x, vc.y, vc.z];
        const faceGeometry = new THREE.BufferGeometry();
        faceGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        return faceGeometry;
    }

    createRectangularFaceGeometry(hit) {
        const object = hit.object;
        const face = hit.face;
        const normal = face.normal.clone().normalize();

        object.geometry.computeBoundingBox();
        const box = object.geometry.boundingBox;
        if (!box) return null;

        // Determine which face to highlight based on normal
        const absNormal = new THREE.Vector3(Math.abs(normal.x), Math.abs(normal.y), Math.abs(normal.z));
        let axis, side;

        if (absNormal.x > 0.9) {
            axis = 'x';
            side = normal.x > 0 ? 'max' : 'min';
        } else if (absNormal.y > 0.9) {
            axis = 'y';
            side = normal.y > 0 ? 'max' : 'min';
        } else if (absNormal.z > 0.9) {
            axis = 'z';
            side = normal.z > 0 ? 'max' : 'min';
        } else {
            return this.createTriangleFaceGeometry(hit);
        }

        const vertices = this.generateRectangularFaceVertices(box, axis, side);
        const faceGeometry = new THREE.BufferGeometry();
        faceGeometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        return faceGeometry;
    }

    createAxisFacesGeometry(object, axis) {
        if (!object.geometry) return null;

        object.geometry.computeBoundingBox();
        const box = object.geometry.boundingBox;
        if (!box) return null;

        const minVertices = this.generateRectangularFaceVertices(box, axis, 'min');
        const maxVertices = this.generateRectangularFaceVertices(box, axis, 'max');
        const allVertices = [...minVertices, ...maxVertices];

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(allVertices), 3));
        return geometry;
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

        const material = new THREE.LineBasicMaterial({
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
        const material = new THREE.LineBasicMaterial({
            color: color,
            transparent: true,
            opacity: opacity,
            linewidth: lineWidth
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

        const fullOpacityMaterial = new THREE.LineBasicMaterial({
            color: color,
            transparent: true,
            opacity: opacity,
            linewidth: lineWidth
        });

        const reducedOpacityMaterial = new THREE.LineBasicMaterial({
            color: color,
            transparent: true,
            opacity: opacity * 0.5,
            linewidth: lineWidth
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
        const material = new THREE.MeshBasicMaterial({
            color: color,
            transparent: true,
            opacity: opacity,
            wireframe: true
        });

        const box = new THREE.Mesh(geometry, material);
        box.position.copy(position);
        return box;
    }

    // ===== CLEANUP =====

    destroy() {
        this.clearHighlight();

        if (this.highlightMaterial) {
            this.highlightMaterial.dispose();
            this.highlightMaterial = null;
        }
    }
}

// Export for use in main application
window.VisualEffects = VisualEffects;