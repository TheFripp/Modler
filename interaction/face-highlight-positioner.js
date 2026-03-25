import * as THREE from 'three';

/**
 * FaceHighlightPositioner - Face highlight positioning and geometry update logic
 *
 * Extracted from SupportMeshFactory to separate face highlight positioning
 * from support mesh creation/visibility management.
 */

class FaceHighlightPositioner {
    constructor(geometryFactory) {
        this.geometryFactory = geometryFactory;
    }

    /**
     * Update face highlight geometry for specific face
     */
    updateFaceHighlightGeometry(mainMesh, face) {
        const supportMeshes = mainMesh.userData.supportMeshes;
        if (!supportMeshes?.faceHighlight || !face || !mainMesh.geometry) return;

        const positionAttribute = mainMesh.geometry.getAttribute('position');
        if (!positionAttribute) return;

        const va = new THREE.Vector3().fromBufferAttribute(positionAttribute, face.a);
        const vb = new THREE.Vector3().fromBufferAttribute(positionAttribute, face.b);
        const vc = new THREE.Vector3().fromBufferAttribute(positionAttribute, face.c);

        const vertices = new Float32Array([
            va.x, va.y, va.z,
            vb.x, vb.y, vb.z,
            vc.x, vc.y, vc.z
        ]);

        // Return old geometry to pool instead of disposing
        this.geometryFactory.returnGeometry(supportMeshes.faceHighlight.geometry, 'face');
        const faceGeometry = new THREE.BufferGeometry();
        faceGeometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
        supportMeshes.faceHighlight.geometry = faceGeometry;
    }

    /**
     * Resolve the main object from a hit that might be on a collision/interactive mesh
     */
    resolveMainObjectFromHit(hit) {
        if (!hit || !hit.object) return null;

        const isContainerInteractive = hit.object.userData.isContainerInteractive;
        const isContainerCollision = hit.object.userData.isContainerCollision;

        if (isContainerInteractive && hit.object.userData.containerMesh) {
            return hit.object.userData.containerMesh;
        } else if (isContainerCollision && hit.object.parent) {
            return hit.object.parent;
        } else if (isContainerInteractive) {
            const sceneController = window.modlerComponents?.sceneController;
            const containerId = hit.object.userData.parentContainer;

            if (sceneController && containerId) {
                const containerData = sceneController.getObject(containerId);
                return containerData?.mesh || hit.object;
            } else {
                return hit.object.parent || hit.object;
            }
        } else {
            let current = hit.object;
            while (current) {
                if (current.userData && current.userData.id !== undefined) {
                    return current;
                }
                current = current.parent;
            }
            return hit.object;
        }
    }

    /**
     * Update face highlight position after geometry changes (smart tracking)
     */
    updateFaceHighlightAfterGeometryChange(mainMesh, faceHighlightMesh) {
        if (!mainMesh || !faceHighlightMesh || !mainMesh.geometry) return;

        try {
            const storedFaceInfo = faceHighlightMesh.userData.faceInfo;
            if (!storedFaceInfo) {
                faceHighlightMesh.visible = false;
                return;
            }

            mainMesh.geometry.computeBoundingBox();
            const bbox = mainMesh.geometry.boundingBox;
            const size = bbox.getSize(new THREE.Vector3());

            const { faceType, isPositive } = storedFaceInfo;
            let width, height, localCenter, localNormal;

            if (faceType === 'x') {
                width = size.z;
                height = size.y;
                localNormal = new THREE.Vector3(isPositive ? 1 : -1, 0, 0);
                localCenter = new THREE.Vector3(
                    isPositive ? bbox.max.x : bbox.min.x,
                    (bbox.max.y + bbox.min.y) / 2,
                    (bbox.max.z + bbox.min.z) / 2
                );
            } else if (faceType === 'y') {
                width = size.x;
                height = size.z;
                localNormal = new THREE.Vector3(0, isPositive ? 1 : -1, 0);
                localCenter = new THREE.Vector3(
                    (bbox.max.x + bbox.min.x) / 2,
                    isPositive ? bbox.max.y : bbox.min.y,
                    (bbox.max.z + bbox.min.z) / 2
                );
            } else {
                width = size.x;
                height = size.y;
                localNormal = new THREE.Vector3(0, 0, isPositive ? 1 : -1);
                localCenter = new THREE.Vector3(
                    (bbox.max.x + bbox.min.x) / 2,
                    (bbox.max.y + bbox.min.y) / 2,
                    isPositive ? bbox.max.z : bbox.min.z
                );
            }

            faceHighlightMesh.rotation.set(0, 0, 0);
            if (faceType === 'x') {
                faceHighlightMesh.rotation.y = isPositive ? Math.PI/2 : -Math.PI/2;
            } else if (faceType === 'y') {
                faceHighlightMesh.rotation.x = isPositive ? -Math.PI/2 : Math.PI/2;
            } else {
                if (!isPositive) {
                    faceHighlightMesh.rotation.y = Math.PI;
                }
            }

            faceHighlightMesh.scale.set(width, height, 1);
            faceHighlightMesh.position.copy(localCenter);

            const offset = 0.001;
            faceHighlightMesh.position.add(localNormal.clone().multiplyScalar(offset));

        } catch (error) {
            console.warn('Failed to update face highlight after geometry change:', error);
        }
    }

    /**
     * Position face highlight for specific hit (called once per hover session)
     */
    positionFaceHighlightForHit(faceHighlightMesh, hit) {
        if (!faceHighlightMesh || !hit || !hit.face || !hit.object) {
            return;
        }

        try {
            const mainObject = this.resolveMainObjectFromHit(hit);
            if (!mainObject || !mainObject.geometry) {
                return;
            }

            // For containers, use interactive mesh for bounding box calculations
            let geometryForBounds = mainObject.geometry;
            if (mainObject.userData?.isContainer && mainObject.userData?.supportMeshes?.interactiveMesh) {
                geometryForBounds = mainObject.userData.supportMeshes.interactiveMesh.geometry;
            }

            geometryForBounds.computeBoundingBox();
            const bbox = geometryForBounds.boundingBox;
            const size = bbox.getSize(new THREE.Vector3());

            const face = hit.face;
            const localNormal = face.normal.clone().normalize();

            const absNormal = {
                x: Math.abs(localNormal.x),
                y: Math.abs(localNormal.y),
                z: Math.abs(localNormal.z)
            };

            let width, height;
            let localCenter = new THREE.Vector3();

            if (absNormal.x > absNormal.y && absNormal.x > absNormal.z) {
                width = size.z;
                height = size.y;
                localCenter.set(
                    localNormal.x > 0 ? bbox.max.x : bbox.min.x,
                    (bbox.max.y + bbox.min.y) / 2,
                    (bbox.max.z + bbox.min.z) / 2
                );
            } else if (absNormal.y > absNormal.x && absNormal.y > absNormal.z) {
                width = size.x;
                height = size.z;
                localCenter.set(
                    (bbox.max.x + bbox.min.x) / 2,
                    localNormal.y > 0 ? bbox.max.y : bbox.min.y,
                    (bbox.max.z + bbox.min.z) / 2
                );
            } else {
                width = size.x;
                height = size.y;
                localCenter.set(
                    (bbox.max.x + bbox.min.x) / 2,
                    (bbox.max.y + bbox.min.y) / 2,
                    localNormal.z > 0 ? bbox.max.z : bbox.min.z
                );
            }

            faceHighlightMesh.scale.set(width, height, 1);
            faceHighlightMesh.position.copy(localCenter);

            faceHighlightMesh.rotation.set(0, 0, 0);
            if (absNormal.x > absNormal.y && absNormal.x > absNormal.z) {
                faceHighlightMesh.rotation.y = localNormal.x > 0 ? Math.PI/2 : -Math.PI/2;
            } else if (absNormal.y > absNormal.x && absNormal.y > absNormal.z) {
                faceHighlightMesh.rotation.x = localNormal.y > 0 ? -Math.PI/2 : Math.PI/2;
            } else {
                if (localNormal.z < 0) {
                    faceHighlightMesh.rotation.y = Math.PI;
                }
            }

            const offset = 0.001;
            faceHighlightMesh.position.add(localNormal.clone().multiplyScalar(offset));

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
     */
    positionFaceHighlightForAxis(faceHighlightMesh, objectMesh, axis, cameraFacingOnly = true) {
        if (!faceHighlightMesh || !objectMesh || !axis) {
            return;
        }

        const camera = window.modlerComponents?.sceneFoundation?.camera;
        if (!camera) {
            console.warn('FaceHighlightPositioner: Camera not available for axis face highlighting');
            return;
        }

        let faceNormal;

        if (cameraFacingOnly) {
            const cameraPos = new THREE.Vector3();
            camera.getWorldPosition(cameraPos);

            const objectPos = new THREE.Vector3();
            objectMesh.getWorldPosition(objectPos);

            const cameraToObject = new THREE.Vector3().subVectors(cameraPos, objectPos);

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
                    return;
            }
        } else {
            switch (axis) {
                case 'x': faceNormal = new THREE.Vector3(1, 0, 0); break;
                case 'y': faceNormal = new THREE.Vector3(0, 1, 0); break;
                case 'z': faceNormal = new THREE.Vector3(0, 0, 1); break;
                default: return;
            }
        }

        const syntheticHit = {
            object: objectMesh,
            face: { normal: faceNormal }
        };

        this.positionFaceHighlightForHit(faceHighlightMesh, syntheticHit);
    }
}

window.FaceHighlightPositioner = FaceHighlightPositioner;
