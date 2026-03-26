import * as THREE from 'three';

/**
 * MeasurementVisuals - Rendering logic for MeasurementTool
 *
 * Extracted from MeasurementTool to separate measurement calculation from visual rendering.
 * Handles: visual creation (edge/face-normal), 3D labels, dashed lines, connectors, cleanup.
 */

class MeasurementVisuals {
    constructor(tool) {
        this.tool = tool;

        // Visual state
        this.measurementVisuals = null;
        this.currentMeasurement = null;
        this.currentLabelSprite = null;
    }

    get camera() { return this.tool.camera; }
    get scene() { return this.tool.scene; }
    get renderer() { return this.tool.renderer; }
    get lineColor() { return this.tool.lineColor; }
    get labelColor() { return this.tool.labelColor; }
    get dashSize() { return this.tool.dashSize; }
    get gapSize() { return this.tool.gapSize; }

    /**
     * Calculate screen-space perpendicular offset vector for parallel line spacing
     */
    getScreenSpacePerpendicularOffset(position, lineStart, lineEnd, pixelOffset) {
        if (!this.camera || !this.renderer) {
            return this.camera.up.clone().multiplyScalar(0.01);
        }

        const canvas = this.renderer.domElement;

        // Project line endpoints to screen space
        const screenStart = lineStart.clone().project(this.camera);
        const screenEnd = lineEnd.clone().project(this.camera);

        // Convert to pixel coordinates
        const startPixel = new THREE.Vector2(
            (screenStart.x + 1) * canvas.width / 2,
            (-screenStart.y + 1) * canvas.height / 2
        );
        const endPixel = new THREE.Vector2(
            (screenEnd.x + 1) * canvas.width / 2,
            (-screenEnd.y + 1) * canvas.height / 2
        );

        // Calculate perpendicular direction in screen space
        const screenDir = endPixel.clone().sub(startPixel);
        const screenPerp = new THREE.Vector2(-screenDir.y, screenDir.x).normalize();

        // Scale by pixel offset
        const offsetPixel = screenPerp.multiplyScalar(pixelOffset);

        // Convert midpoint + offset back to world space
        const midScreen = screenStart.clone().add(screenEnd).multiplyScalar(0.5);
        const offsetScreen = midScreen.clone();
        offsetScreen.x += (offsetPixel.x / canvas.width) * 2;
        offsetScreen.y -= (offsetPixel.y / canvas.height) * 2;

        // Unproject both to get world-space difference
        const midWorld = midScreen.clone().unproject(this.camera);
        const offsetWorld = offsetScreen.clone().unproject(this.camera);

        return offsetWorld.sub(midWorld);
    }

    /**
     * Add thick lines (multiple parallel lines for visual weight)
     */
    _addThickLines(group, point1, point2, material, refMidPoint, refStart, refEnd, isDashed = false) {
        const numLines = 3;
        for (let i = 0; i < numLines; i++) {
            const pixelOffset = (i - (numLines - 1) / 2) * 1;
            const offsetVec = this.getScreenSpacePerpendicularOffset(refMidPoint, refStart, refEnd, pixelOffset);

            const p1 = point1.clone().add(offsetVec);
            const p2 = point2.clone().add(offsetVec);

            const geometry = new THREE.BufferGeometry().setFromPoints([p1, p2]);
            const lineMaterial = isDashed ? new THREE.LineDashedMaterial({
                color: this.lineColor,
                dashSize: this.dashSize,
                gapSize: this.gapSize,
                linewidth: 1,
                depthTest: false,
                transparent: true,
                opacity: 0.9
            }) : material;

            const line = new THREE.Line(geometry, lineMaterial);
            if (isDashed) line.computeLineDistances();
            line.renderOrder = 999;
            group.add(line);
        }
    }

    /**
     * Get a perpendicular vector (for end caps)
     */
    getPerpendicularVector(direction) {
        let perpendicular;

        if (Math.abs(direction.y) < 0.9) {
            perpendicular = new THREE.Vector3(0, 1, 0);
        } else {
            perpendicular = new THREE.Vector3(1, 0, 0);
        }

        return perpendicular.cross(direction).normalize();
    }

    /**
     * Check if a point's perpendicular position is within object bounds
     */
    isPointWithinObjectBounds(point, box, excludeAxis) {
        const axes = ['x', 'y', 'z'].filter(a => a !== excludeAxis);
        const tolerance = 0.001;

        for (let a of axes) {
            if (point[a] < box.min[a] - tolerance || point[a] > box.max[a] + tolerance) {
                return false;
            }
        }
        return true;
    }

    /**
     * Create visual for edge measurement
     */
    createEdgeMeasurementVisual(start, end, length, direction, currentFace, currentObject) {
        this.clearMeasurement();

        const group = new THREE.Group();

        // DEVELOPMENT_VALIDATOR_IGNORE: Measurement visuals are temporary and not pooled
        // Create dashed line with offset in the normal direction of the face
        let offsetStart = start.clone();
        let offsetEnd = end.clone();

        // Calculate offset direction perpendicular to edge in the face plane
        let normalDirection;
        let isBottomFace = false;

        if (currentFace && currentFace.normal) {
            const faceNormal = currentFace.normal.clone().normalize();

            // Check if this is a bottom face (normal pointing downward)
            isBottomFace = faceNormal.y < -0.7;

            if (isBottomFace) {
                // For bottom faces, position measurement on floor plane below object
                if (currentObject) {
                    const bbox = new THREE.Box3().setFromObject(currentObject);
                    const floorY = bbox.min.y - 0.15;

                    offsetStart.y = floorY;
                    offsetEnd.y = floorY;
                }
            } else {
                // Normal offset behavior for non-bottom faces
                const edgeDirection = end.clone().sub(start).normalize();
                normalDirection = edgeDirection.clone().cross(faceNormal).normalize();

                // Ensure offset points toward camera so measurement is always visible
                const edgeMid = start.clone().add(end).multiplyScalar(0.5);
                const toCamera = this.camera.position.clone().sub(edgeMid);
                if (normalDirection.dot(toCamera) < 0) {
                    normalDirection.negate();
                }

                const offsetAmount = 0.15;
                const offset = normalDirection.multiplyScalar(offsetAmount);
                offsetStart.add(offset);
                offsetEnd.add(offset);
            }
        } else {
            // Fallback: offset toward camera so measurement is visible
            const edgeMid = start.clone().add(end).multiplyScalar(0.5);
            const toCamera = this.camera.position.clone().sub(edgeMid);
            const edgeDir = direction.clone().normalize();
            toCamera.sub(edgeDir.multiplyScalar(toCamera.dot(edgeDir)));
            normalDirection = toCamera.normalize();

            const offsetAmount = 0.15;
            const offset = normalDirection.clone().multiplyScalar(offsetAmount);
            offsetStart.add(offset);
            offsetEnd.add(offset);
        }

        // DEVELOPMENT_VALIDATOR_IGNORE_START: Measurement visuals are temporary overlays, not pooled resources
        const connectorMaterial = new THREE.LineBasicMaterial({
            color: this.lineColor, linewidth: 1, depthTest: false, transparent: true, opacity: 0.7
        });
        const capMaterial = new THREE.LineBasicMaterial({
            color: this.lineColor, linewidth: 1, depthTest: false, transparent: true, opacity: 0.9
        });

        const midPoint = offsetStart.clone().add(offsetEnd).multiplyScalar(0.5);

        // Connector lines from edge to measurement line
        const startConnectorGeometry = new THREE.BufferGeometry().setFromPoints([start, offsetStart]);
        const startConnector = new THREE.Line(startConnectorGeometry, connectorMaterial);
        startConnector.renderOrder = 999;
        group.add(startConnector);

        const endConnectorGeometry = new THREE.BufferGeometry().setFromPoints([end, offsetEnd]);
        const endConnector = new THREE.Line(endConnectorGeometry, connectorMaterial);
        endConnector.renderOrder = 999;
        group.add(endConnector);

        // Main dashed measurement line
        this._addThickLines(group, offsetStart, offsetEnd, null, midPoint, offsetStart, offsetEnd, true);

        // End caps (small perpendicular lines)
        const capSize = 0.1;
        const capPerpendicular = this.getPerpendicularVector(direction);
        const startCap1 = offsetStart.clone().add(capPerpendicular.clone().multiplyScalar(capSize));
        const startCap2 = offsetStart.clone().add(capPerpendicular.clone().multiplyScalar(-capSize));
        const endCap1 = offsetEnd.clone().add(capPerpendicular.clone().multiplyScalar(capSize));
        const endCap2 = offsetEnd.clone().add(capPerpendicular.clone().multiplyScalar(-capSize));

        this._addThickLines(group, startCap1, startCap2, capMaterial, midPoint, offsetStart, offsetEnd);
        this._addThickLines(group, endCap1, endCap2, capMaterial, midPoint, offsetStart, offsetEnd);
        // DEVELOPMENT_VALIDATOR_IGNORE_END

        // Add 3D text label at the offset line's midpoint
        const edgeLabelPos = offsetStart.clone().add(offsetEnd).multiplyScalar(0.5);
        const label = this.create3DLabel(this.formatMeasurementWithUnit(length), edgeLabelPos);
        this.currentLabelSprite = label;
        group.add(label);

        // Add to scene
        this.scene.add(group);
        this.measurementVisuals = group;

        this.currentMeasurement = { start, end, length, type: 'edge' };
    }

    /**
     * Create visual for face normal measurement
     */
    createFaceNormalMeasurementVisual(startPoint, endPoint, distance, needsStartConnector, needsEndConnector, selectedObject, hoveredObject) {
        this.clearMeasurement();

        const group = new THREE.Group();

        const measurementDirection = endPoint.clone().sub(startPoint).normalize();
        const midPoint = startPoint.clone().add(endPoint).multiplyScalar(0.5);

        let perpendicular = measurementDirection.clone().cross(this.camera.up).normalize();

        if (perpendicular.length() < 0.1) {
            perpendicular = measurementDirection.clone().cross(new THREE.Vector3(1, 0, 0)).normalize();
            if (perpendicular.length() < 0.1) {
                perpendicular = new THREE.Vector3(0, 0, 1);
            }
        }

        // Make sure perpendicular points toward camera
        const toCamera = this.camera.position.clone().sub(midPoint);
        if (perpendicular.dot(toCamera) < 0) {
            perpendicular.negate();
        }

        const offsetAmount = 0.15;
        const offsetStart = startPoint.clone().add(perpendicular.clone().multiplyScalar(offsetAmount));
        const offsetEnd = endPoint.clone().add(perpendicular.clone().multiplyScalar(offsetAmount));

        const axis = Math.abs(endPoint.x - startPoint.x) > 0.001 ? 'x'
                   : Math.abs(endPoint.y - startPoint.y) > 0.001 ? 'y' : 'z';

        const selectedBox = new THREE.Box3().setFromObject(selectedObject);
        const hoveredBox = new THREE.Box3().setFromObject(hoveredObject);

        const actualNeedsStartConnector = !this.isPointWithinObjectBounds(offsetStart, selectedBox, axis);
        const actualNeedsEndConnector = !this.isPointWithinObjectBounds(offsetEnd, hoveredBox, axis);

        const extensionLength = 0.3;

        // DEVELOPMENT_VALIDATOR_IGNORE_START: Measurement visuals are temporary overlays, not pooled resources
        const lineMidPoint = offsetStart.clone().add(offsetEnd).multiplyScalar(0.5);
        const extensionMaterial = new THREE.LineBasicMaterial({
            color: this.lineColor, linewidth: 1, depthTest: false, transparent: true, opacity: 0.5
        });
        const bracketMaterial = new THREE.LineBasicMaterial({
            color: this.lineColor, linewidth: 1, depthTest: false, transparent: true, opacity: 0.9
        });

        if (actualNeedsStartConnector) {
            this._addThickLines(group, startPoint, offsetStart, extensionMaterial, lineMidPoint, offsetStart, offsetEnd);
        }

        this._addThickLines(group, offsetStart, offsetEnd, null, lineMidPoint, offsetStart, offsetEnd, true);

        if (actualNeedsEndConnector) {
            this._addThickLines(group, offsetEnd, endPoint, extensionMaterial, lineMidPoint, offsetStart, offsetEnd);
        }

        const bracketDir = perpendicular.clone();
        if (actualNeedsStartConnector) {
            const bracketStart1 = offsetStart.clone().sub(bracketDir.clone().multiplyScalar(extensionLength / 2));
            const bracketStart2 = offsetStart.clone().add(bracketDir.clone().multiplyScalar(extensionLength / 2));
            this._addThickLines(group, bracketStart1, bracketStart2, bracketMaterial, lineMidPoint, offsetStart, offsetEnd);
        }
        if (actualNeedsEndConnector) {
            const bracketEnd1 = offsetEnd.clone().sub(bracketDir.clone().multiplyScalar(extensionLength / 2));
            const bracketEnd2 = offsetEnd.clone().add(bracketDir.clone().multiplyScalar(extensionLength / 2));
            this._addThickLines(group, bracketEnd1, bracketEnd2, bracketMaterial, lineMidPoint, offsetStart, offsetEnd);
        }
        // DEVELOPMENT_VALIDATOR_IGNORE_END

        const labelPosition = offsetStart.clone().add(offsetEnd).multiplyScalar(0.5);
        const label = this.create3DLabel(this.formatMeasurementWithUnit(distance), labelPosition);
        this.currentLabelSprite = label;
        group.add(label);

        this.scene.add(group);
        this.measurementVisuals = group;

        this.currentMeasurement = { startPoint, endPoint, distance, type: 'distance' };
    }

    /**
     * Create 3D text label as sprite
     */
    create3DLabel(text, position) {
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        const font = '14px Arial, sans-serif';

        // Measure text to size canvas dynamically
        context.font = font;
        const textWidth = context.measureText(text).width;
        const padding = 12;
        canvas.width = Math.max(42, Math.ceil(textWidth + padding));
        canvas.height = 24;

        context.fillStyle = this.labelColor;
        context.beginPath();
        context.roundRect(0, 0, canvas.width, canvas.height, 3);
        context.fill();

        context.font = font;
        context.fillStyle = 'white';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(text, canvas.width / 2, canvas.height / 2);

        const texture = new THREE.CanvasTexture(canvas);
        const spriteMaterial = new THREE.SpriteMaterial({
            map: texture,
            sizeAttenuation: false,
            depthTest: false,
            transparent: true
        });
        const sprite = new THREE.Sprite(spriteMaterial);
        sprite.position.copy(position);
        const baseScaleX = 0.053;
        const scaleX = baseScaleX * (canvas.width / 42);
        sprite.scale.set(scaleX, 0.03, 1);
        sprite.renderOrder = 1000;

        return sprite;
    }

    /**
     * Format measurement value with unit suffix
     */
    formatMeasurementWithUnit(valueInMeters) {
        const unitConverter = window.modlerComponents?.unitConverter;

        if (!unitConverter) {
            return `${valueInMeters.toFixed(1)}m`;
        }

        const userUnit = unitConverter.userUnit;

        if (userUnit === 'ft' || userUnit === 'in') {
            const totalInches = valueInMeters * unitConverter.conversionFromMeters['in'];

            if (userUnit === 'ft') {
                const feet = Math.floor(totalInches / 12);
                const inches = Math.round(totalInches % 12);

                if (inches === 0) {
                    return `${feet}'`;
                } else {
                    return `${feet}' ${inches}"`;
                }
            } else {
                return `${Math.round(totalInches)}"`;
            }
        }

        const convertedValue = unitConverter.fromInternalUnits(valueInMeters);
        const precision = unitConverter.unitPrecision[userUnit] || 1;

        return `${convertedValue.toFixed(precision)}${userUnit}`;
    }

    /**
     * Clear current measurement visualization
     */
    clearMeasurement() {
        if (this.measurementVisuals) {
            this.scene.remove(this.measurementVisuals);

            this.measurementVisuals.traverse(child => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) {
                    if (child.material.map) child.material.map.dispose();
                    child.material.dispose();
                }
            });

            this.measurementVisuals = null;
        }

        this.currentMeasurement = null;
        this.currentLabelSprite = null;
    }

    /**
     * Check if mouse NDC coordinates are near the measurement label
     */
    isMouseNearLabel(mouse) {
        if (!this.currentLabelSprite || !this.camera || !this.renderer) return false;

        const projected = this.currentLabelSprite.position.clone().project(this.camera);

        const dx = Math.abs(mouse.x - projected.x);
        const dy = Math.abs(mouse.y - projected.y);
        return dx < 0.04 && dy < 0.025;
    }
}

window.MeasurementVisuals = MeasurementVisuals;
