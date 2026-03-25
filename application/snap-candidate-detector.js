import * as THREE from 'three';

/**
 * SnapCandidateDetector - Edge/corner candidate generation and filtering
 *
 * Extracted from SnapController to separate candidate detection (geometry queries,
 * visibility filtering, coordinate conversion) from snap state management
 * (enable/disable, current point, notifications).
 *
 * Performance-sensitive — called every mouse move when snapping is enabled.
 */

class SnapCandidateDetector {
    constructor(snapController) {
        this.sc = snapController;
    }

    get camera() { return this.sc.camera; }
    get inputController() { return this.sc.inputController; }

    // ===== OBJECT FILTERING =====

    getObjectsForSnapping(selectedObjects) {
        const objectsToCheck = [];
        const sceneController = window.modlerComponents?.sceneController;
        if (!sceneController) return objectsToCheck;

        // Collect IDs of any containers being dragged, so we can exclude their children
        const draggedContainerIds = new Set();
        for (const mesh of selectedObjects) {
            const objData = sceneController.getObjectByMesh(mesh);
            if (objData?.isContainer) {
                draggedContainerIds.add(objData.id);
            }
        }

        // Whitelist approach: only include registered CAD objects
        for (const [id, objectData] of sceneController.objects) {
            const mesh = objectData.mesh;
            if (!mesh || !mesh.visible) continue;

            if (objectData.type === 'grid' || objectData.category === 'system') continue;
            if (selectedObjects.includes(mesh)) continue;
            if (objectData.isContainer) continue;

            // Skip children of any container being dragged (they move with it)
            if (draggedContainerIds.size > 0 && objectData.parentContainer) {
                let isChildOfDragged = false;
                for (const cid of draggedContainerIds) {
                    if (this.isObjectInContainer(objectData, cid, sceneController)) {
                        isChildOfDragged = true;
                        break;
                    }
                }
                if (isChildOfDragged) continue;
            }

            if (mesh.isMesh && mesh.geometry) {
                objectsToCheck.push(mesh);
            }
        }

        return objectsToCheck;
    }

    isObjectInContainer(objectData, containerId, sceneController) {
        if (!objectData || !containerId) return false;

        let currentParentId = objectData.parentContainer;
        while (currentParentId) {
            if (currentParentId === containerId) return true;
            const parentData = sceneController.getObject(currentParentId);
            currentParentId = parentData?.parentContainer;
        }
        return false;
    }

    isFloorObject(object) {
        if (!object) return false;
        if (object.isGridHelper) return true;

        const objName = object.name ? object.name.toLowerCase() : '';
        if (objName.includes('floor') || objName.includes('grid')) return true;

        const sceneController = window.modlerComponents?.sceneController;
        if (sceneController) {
            const objectData = sceneController.getObjectByMesh(object);
            if (objectData && (objectData.type === 'grid' || objectData.category === 'system')) {
                return true;
            }
        }
        return false;
    }

    // ===== VISIBILITY CHECKS =====

    edgeHasVisibleFace(object, edgeStart, edgeEnd, camera) {
        try {
            const geometry = object.geometry;
            if (!geometry || !geometry.index) return true;

            const positions = geometry.getAttribute('position');
            const indices = geometry.index.array;
            const tolerance = 0.001;
            const adjacentFaces = [];

            for (let i = 0; i < indices.length; i += 3) {
                const faceVertices = [
                    new THREE.Vector3().fromBufferAttribute(positions, indices[i]),
                    new THREE.Vector3().fromBufferAttribute(positions, indices[i + 1]),
                    new THREE.Vector3().fromBufferAttribute(positions, indices[i + 2])
                ];

                let edgeStartFound = false;
                let edgeEndFound = false;

                for (const vertex of faceVertices) {
                    if (vertex.distanceTo(edgeStart) < tolerance) edgeStartFound = true;
                    if (vertex.distanceTo(edgeEnd) < tolerance) edgeEndFound = true;
                }

                if (edgeStartFound && edgeEndFound) {
                    const v1 = faceVertices[1].clone().sub(faceVertices[0]);
                    const v2 = faceVertices[2].clone().sub(faceVertices[0]);
                    const faceNormal = v1.cross(v2).normalize();

                    faceNormal.transformDirection(object.matrixWorld);
                    const faceCenter = faceVertices[0].clone()
                        .add(faceVertices[1])
                        .add(faceVertices[2])
                        .multiplyScalar(1/3)
                        .applyMatrix4(object.matrixWorld);

                    adjacentFaces.push({ normal: faceNormal, center: faceCenter });
                }
            }

            for (const face of adjacentFaces) {
                const cameraDirection = camera.position.clone().sub(face.center).normalize();
                const dotProduct = face.normal.dot(cameraDirection);
                if (dotProduct > 0.1) return true;
            }

            return adjacentFaces.length === 0;
        } catch (error) {
            return true;
        }
    }

    // ===== CANDIDATE GENERATION =====

    getVisibleObjectCorners(object) {
        if (!object.geometry) return [];

        const geometry = object.geometry;
        geometry.computeBoundingBox();
        const box = geometry.boundingBox;
        if (!box) return [];

        const objectCenter = object.getWorldPosition(new THREE.Vector3());
        const cameraDir = objectCenter.clone().sub(this.camera.position).normalize();
        const invMatrix = new THREE.Matrix4().copy(object.matrixWorld).invert();
        const localCameraDir = cameraDir.transformDirection(invMatrix);

        const vf = {
            pX: localCameraDir.x < 0, nX: localCameraDir.x > 0,
            pY: localCameraDir.y < 0, nY: localCameraDir.y > 0,
            pZ: localCameraDir.z < 0, nZ: localCameraDir.z > 0
        };

        const cornerVisible = [
            vf.nX || vf.nY || vf.nZ,
            vf.pX || vf.nY || vf.nZ,
            vf.nX || vf.pY || vf.nZ,
            vf.pX || vf.pY || vf.nZ,
            vf.nX || vf.nY || vf.pZ,
            vf.pX || vf.nY || vf.pZ,
            vf.nX || vf.pY || vf.pZ,
            vf.pX || vf.pY || vf.pZ
        ];

        const boxCorners = [
            new THREE.Vector3(box.min.x, box.min.y, box.min.z),
            new THREE.Vector3(box.max.x, box.min.y, box.min.z),
            new THREE.Vector3(box.min.x, box.max.y, box.min.z),
            new THREE.Vector3(box.max.x, box.max.y, box.min.z),
            new THREE.Vector3(box.min.x, box.min.y, box.max.z),
            new THREE.Vector3(box.max.x, box.min.y, box.max.z),
            new THREE.Vector3(box.min.x, box.max.y, box.max.z),
            new THREE.Vector3(box.max.x, box.max.y, box.max.z)
        ];

        const results = [];

        for (let i = 0; i < 8; i++) {
            if (!cornerVisible[i]) continue;
            const worldPos = boxCorners[i].clone().applyMatrix4(object.matrixWorld);
            const screenPos = this.worldToPixel(worldPos);
            results.push({ worldPos, screenPos, index: i });
        }

        // Edge midpoints (visible if either adjacent face is visible)
        const edges = [
            [0,1,'nY','nZ'], [0,4,'nY','nX'], [1,5,'nY','pX'], [4,5,'nY','pZ'],
            [2,3,'pY','nZ'], [2,6,'pY','nX'], [3,7,'pY','pX'], [6,7,'pY','pZ'],
            [0,2,'nX','nZ'], [1,3,'pX','nZ'], [4,6,'nX','pZ'], [5,7,'pX','pZ']
        ];
        for (const [a, b, f1, f2] of edges) {
            if (vf[f1] || vf[f2]) {
                const midLocal = boxCorners[a].clone().add(boxCorners[b]).multiplyScalar(0.5);
                const worldPos = midLocal.applyMatrix4(object.matrixWorld);
                const screenPos = this.worldToPixel(worldPos);
                results.push({ worldPos, screenPos, index: `mid_${a}_${b}` });
            }
        }

        return results;
    }

    getVisibleObjectEdges(object, travelAxis = null) {
        if (!object.geometry) return [];

        if (this.isBoxLikeGeometry(object.geometry)) {
            return this.getBoundingBoxEdges(object, travelAxis);
        }
        return this.getTriangulatedEdges(object, travelAxis);
    }

    isBoxLikeGeometry(geometry) {
        if (!geometry || !geometry.index) return false;
        const vertexCount = geometry.getAttribute('position')?.count || 0;
        const triangleCount = geometry.index.array.length / 3;
        return vertexCount <= 24 && triangleCount <= 36;
    }

    getTriangulatedEdges(object, travelAxis = null) {
        const edges = [];

        try {
            const edgesGeometry = new THREE.EdgesGeometry(object.geometry, 15);
            const positionAttribute = edgesGeometry.getAttribute('position');

            for (let i = 0; i < positionAttribute.count; i += 2) {
                const start = new THREE.Vector3().fromBufferAttribute(positionAttribute, i);
                const end = new THREE.Vector3().fromBufferAttribute(positionAttribute, i + 1);

                const worldStart = start.clone().applyMatrix4(object.matrixWorld);
                const worldEnd = end.clone().applyMatrix4(object.matrixWorld);

                if (worldStart.distanceTo(worldEnd) < 0.01) continue;

                const hasVisibleFace = this.edgeHasVisibleFace(object, start, end, this.camera);
                if (!hasVisibleFace) continue;

                if (travelAxis) {
                    const edgeDirection = worldEnd.clone().sub(worldStart).normalize();
                    if (Math.abs(edgeDirection.dot(travelAxis)) >= 0.3) continue;
                }

                edges.push({ start: worldStart, end: worldEnd });
            }

            edgesGeometry.dispose();
        } catch (error) {
            console.error('Error processing geometry edges:', error);
            return this.getBoundingBoxEdges(object, travelAxis);
        }

        return edges;
    }

    getBoundingBoxEdges(object, travelAxis = null) {
        const edges = [];
        const geometry = object.geometry;

        geometry.computeBoundingBox();
        const box = geometry.boundingBox;
        if (!box) return edges;

        const objectCenter = object.getWorldPosition(new THREE.Vector3());
        const cameraDir = objectCenter.clone().sub(this.camera.position).normalize();
        const invMatrix = new THREE.Matrix4().copy(object.matrixWorld).invert();
        const localCameraDir = cameraDir.transformDirection(invMatrix);

        const vf = {
            pX: localCameraDir.x < 0, nX: localCameraDir.x > 0,
            pY: localCameraDir.y < 0, nY: localCameraDir.y > 0,
            pZ: localCameraDir.z < 0, nZ: localCameraDir.z > 0
        };

        const c = [
            new THREE.Vector3(box.min.x, box.min.y, box.min.z),
            new THREE.Vector3(box.max.x, box.min.y, box.min.z),
            new THREE.Vector3(box.min.x, box.max.y, box.min.z),
            new THREE.Vector3(box.max.x, box.max.y, box.min.z),
            new THREE.Vector3(box.min.x, box.min.y, box.max.z),
            new THREE.Vector3(box.max.x, box.min.y, box.max.z),
            new THREE.Vector3(box.min.x, box.max.y, box.max.z),
            new THREE.Vector3(box.max.x, box.max.y, box.max.z)
        ];

        const edgeDefs = [
            [0,1,'nY','nZ'], [1,5,'nY','pX'], [5,4,'nY','pZ'], [4,0,'nY','nX'],
            [2,3,'pY','nZ'], [3,7,'pY','pX'], [7,6,'pY','pZ'], [6,2,'pY','nX'],
            [0,2,'nX','nZ'], [1,3,'pX','nZ'], [5,7,'pX','pZ'], [4,6,'nX','pZ']
        ];

        for (const [a, b, f1, f2] of edgeDefs) {
            if (!vf[f1] && !vf[f2]) continue;

            const worldStart = c[a].clone().applyMatrix4(object.matrixWorld);
            const worldEnd = c[b].clone().applyMatrix4(object.matrixWorld);

            if (travelAxis) {
                const edgeDirection = worldEnd.clone().sub(worldStart).normalize();
                if (Math.abs(edgeDirection.dot(travelAxis)) >= 0.3) continue;
            }

            edges.push({ start: worldStart, end: worldEnd });
        }

        return edges;
    }

    getFaceSnapPoint(object, mouseNDC) {
        this.inputController.raycaster.setFromCamera(mouseNDC, this.camera);
        const intersects = this.inputController.raycaster.intersectObject(object, false);

        if (intersects.length > 0) {
            const hit = intersects[0];
            const worldPos = hit.point;
            const screenPos = this.worldToPixel(worldPos);
            return { worldPos, screenPos, face: hit.face };
        }
        return null;
    }

    // ===== COORDINATE CONVERSION & DISTANCE =====

    worldToPixel(worldPos) {
        const canvas = this.inputController.canvas;
        const vector = worldPos.clone().project(this.camera);
        return {
            x: (vector.x + 1) * canvas.clientWidth / 2,
            y: (-vector.y + 1) * canvas.clientHeight / 2
        };
    }

    ndcToPixel(ndc) {
        const canvas = this.inputController.canvas;
        return {
            x: (ndc.x + 1) * canvas.clientWidth / 2,
            y: (-ndc.y + 1) * canvas.clientHeight / 2
        };
    }

    getScreenDistance(pos1, pos2) {
        const dx = pos1.x - pos2.x;
        const dy = pos1.y - pos2.y;
        return Math.sqrt(dx * dx + dy * dy);
    }

    getDistanceToLineSegment(point, lineStart, lineEnd) {
        const { distance } = this.getDistanceAndParamToLineSegment(point, lineStart, lineEnd);
        return distance;
    }

    getDistanceAndParamToLineSegment(point, lineStart, lineEnd) {
        const C = lineEnd.x - lineStart.x;
        const D = lineEnd.y - lineStart.y;
        const lenSq = C * C + D * D;

        if (lenSq < 0.01) {
            return { distance: this.getScreenDistance(point, lineStart), t: 0 };
        }

        const A = point.x - lineStart.x;
        const B = point.y - lineStart.y;
        const t = Math.max(0, Math.min(1, (A * C + B * D) / lenSq));

        const closestPoint = {
            x: lineStart.x + t * C,
            y: lineStart.y + t * D
        };

        const distance = this.getScreenDistance(point, closestPoint);
        return { distance, t };
    }
}

window.SnapCandidateDetector = SnapCandidateDetector;
