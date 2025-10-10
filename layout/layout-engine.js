// Modler V2 - Layout Engine
// Pure layout calculation functions for 3D auto layout system
// Follows V2 architecture: calculations separate from Three.js manipulation

class LayoutEngine {
    /**
     * Calculate layout positions and sizes for objects in a container
     * @param {Array} objects - Array of object data from SceneController
     * @param {Object} layoutConfig - Layout configuration from container
     * @param {THREE.Vector3} containerSize - Optional container size for fill calculations
     * @param {THREE.Vector3} layoutAnchor - Optional anchor point to center layout around (default: origin)
     * @param {Object} pushContext - Optional push context with {axis, anchorMode} for anchor-aware positioning
     * @returns {Object} Object with {positions: Array, sizes: Array}
     */
    static calculateLayout(objects, layoutConfig, containerSize = null, layoutAnchor = null, pushContext = null) {
        if (!objects || objects.length === 0) return { positions: [], sizes: [] };


        const { direction, gap = 0, padding = {} } = layoutConfig;

        // Extract container size for the layout axis
        let axisSize = null;
        if (containerSize) {
            switch (direction) {
                case 'x': axisSize = containerSize.x; break;
                case 'y': axisSize = containerSize.y; break;
                case 'z': axisSize = containerSize.z; break;
            }
        }

        switch (direction) {
            case 'x':
                return this.calculateLinearLayout(objects, 'x', gap, padding, axisSize, containerSize, layoutAnchor, layoutConfig, pushContext);
            case 'y':
                return this.calculateLinearLayout(objects, 'y', gap, padding, axisSize, containerSize, layoutAnchor, layoutConfig, pushContext);
            case 'z':
                return this.calculateLinearLayout(objects, 'z', gap, padding, axisSize, containerSize, layoutAnchor, layoutConfig, pushContext);
            case 'xy':
                return this.calculateGridLayout(objects, 'xy', gap, padding, layoutConfig, layoutAnchor);
            case 'xyz':
                return this.calculateGridLayout(objects, 'xyz', gap, padding, layoutConfig, layoutAnchor);
            default:
                console.warn(`LayoutEngine: Unknown layout direction '${direction}'`);
                return {
                    positions: objects.map(() => new THREE.Vector3(0, 0, 0)),
                    sizes: objects.map(obj => this.getObjectSize(obj))
                };
        }
    }
    
    /**
     * Calculate linear layout along a single axis with fill-aware sizing
     * @param {Array} objects - Array of object data
     * @param {string} axis - Layout axis ('x', 'y', 'z')
     * @param {number} gap - Gap between objects
     * @param {Object} padding - Padding configuration
     * @param {number} axisSize - Available container size along the axis (optional)
     * @param {THREE.Vector3} fullContainerSize - Full container size for fill calculations (optional)
     * @param {THREE.Vector3} layoutAnchor - Optional anchor point to center layout around (default: origin)
     * @param {Object} layoutConfig - Layout configuration
     * @param {Object} pushContext - Optional push context with {axis, anchorMode} for anchor-aware positioning
     * @returns {Array} Array of positions
     */
    static calculateLinearLayout(objects, axis, gap, padding, axisSize = null, fullContainerSize = null, layoutAnchor = null, layoutConfig = null, pushContext = null) {
        const positions = [];
        const paddingOffset = this.getPaddingOffset(axis, padding);

        // Check if layout should be reversed
        const isReversed = layoutConfig?.reversed ?? false;
        const workingObjects = isReversed ? [...objects].reverse() : objects;

        // Two-pass calculation for fill objects
        const { fixedObjects, fillObjects, totalFixedSize, fillCount } = this.categorizeObjects(workingObjects, axis);

        // CRITICAL: Determine gap strategy FIRST (before sizing fill objects)
        const isPushing = pushContext && pushContext.axis === axis;
        let dynamicGap = gap;
        let availableSpace = axisSize;

        if (axisSize && workingObjects.length > 1 && isPushing && fillCount === 0) {
            // PUSHING with NO FILL: Use space-between distribution
            // First object at start edge, last object at end edge, gaps adjust

            const paddingTotal = this.getTotalPadding(axis, padding);
            const availableForGaps = axisSize - totalFixedSize - paddingTotal;
            dynamicGap = Math.max(0, availableForGaps / (workingObjects.length - 1));

        } else if (axisSize && fillCount > 0) {
            // WITH FILL OBJECTS: Use fixed gap, fill objects take remaining space
            const totalGaps = (workingObjects.length - 1) * gap;
            const paddingTotal = this.getTotalPadding(axis, padding);
            availableSpace = Math.max(0, axisSize - totalFixedSize - totalGaps - paddingTotal);
        }
        // NOT PUSHING and NO FILL: Use fixed gap

        // Calculate sizes for all objects using determined gap and availableSpace
        const objectSizes = workingObjects.map(obj => {
            const baseSize = this.getObjectSize(obj);
            return this.applySizingBehavior(obj, baseSize, axis, availableSpace, fillCount, fullContainerSize, padding);
        });

        // Position objects (start from first object's half-size)
        let currentPosition = 0;

        workingObjects.forEach((obj, index) => {
            const position = new THREE.Vector3(0, 0, 0);
            const size = objectSizes[index];

            // Position object center at current location plus half size
            if (axis === 'x') {
                position.x = currentPosition + size.x / 2;
                currentPosition += size.x + dynamicGap;
            } else if (axis === 'y') {
                position.y = currentPosition + size.y / 2;
                currentPosition += size.y + dynamicGap;
            } else if (axis === 'z') {
                position.z = currentPosition + size.z / 2;
                currentPosition += size.z + dynamicGap;
            }

            positions.push(position);
        });

        // Align layout based on push context (anchor mode) or center normally
        const alignedPositions = this.alignLayoutPositions(positions, objectSizes, axis, layoutAnchor, pushContext, fullContainerSize, padding, layoutConfig);

        // Note: Padding does NOT offset object positions - it only affects container size
        // Objects stay centered, container expands around them with padding space
        let finalPositions = alignedPositions;
        let finalSizes = objectSizes;

        // If reversed, map positions back to original object order
        if (isReversed) {
            finalPositions = [];
            finalSizes = [];
            for (let i = 0; i < objects.length; i++) {
                const reversedIndex = objects.length - 1 - i;
                finalPositions[i] = alignedPositions[reversedIndex];
                finalSizes[i] = objectSizes[reversedIndex];
            }
        }

        // Calculate bounds for the final layout (pass layoutConfig to include padding in size)
        const layoutBounds = this.calculateLayoutBounds(objects, finalPositions, layoutConfig, fullContainerSize);

        return {
            positions: finalPositions,
            sizes: finalSizes,
            bounds: layoutBounds,
            calculatedGap: dynamicGap // Return dynamic gap for property panel updates
        };
    }
    
    /**
     * Calculate grid layout for 2D or 3D arrangements
     * @param {Array} objects - Array of object data
     * @param {string} mode - Grid mode ('xy', 'xyz')
     * @param {number} gap - Gap between objects
     * @param {Object} padding - Padding configuration
     * @param {Object} layoutConfig - Full layout configuration
     * @param {THREE.Vector3} layoutAnchor - Optional anchor point to center layout around (default: origin)
     * @returns {Array} Array of positions
     */
    static calculateGridLayout(objects, mode, gap, padding, layoutConfig, layoutAnchor = null) {
        const positions = [];
        const objectSizes = [];

        if (mode === 'xy') {
            // 2D Grid Layout
            const columns = layoutConfig.columns || Math.ceil(Math.sqrt(objects.length));
            const rows = Math.ceil(objects.length / columns);

            objects.forEach((obj, index) => {
                const col = index % columns;
                const row = Math.floor(index / columns);

                const size = this.getObjectSize(obj);
                objectSizes.push(size);

                const position = new THREE.Vector3(
                    col * (size.x + gap) - (columns - 1) * (size.x + gap) / 2,
                    -row * (size.y + gap) + (rows - 1) * (size.y + gap) / 2,
                    0
                );

                positions.push(position);
            });

        } else if (mode === 'xyz') {
            // 3D Grid Layout
            const columns = layoutConfig.columns || Math.ceil(Math.cbrt(objects.length));
            const rows = layoutConfig.rows || columns;
            const layers = Math.ceil(objects.length / (columns * rows));

            objects.forEach((obj, index) => {
                const col = index % columns;
                const row = Math.floor(index / columns) % rows;
                const layer = Math.floor(index / (columns * rows));

                const size = this.getObjectSize(obj);
                objectSizes.push(size);

                const position = new THREE.Vector3(
                    col * (size.x + gap) - (columns - 1) * (size.x + gap) / 2,
                    -row * (size.y + gap) + (rows - 1) * (size.y + gap) / 2,
                    layer * (size.z + gap) - (layers - 1) * (size.z + gap) / 2
                );

                positions.push(position);
            });
        }

        // Apply padding and center around layout anchor for grid layouts
        const paddedPositions = this.applyPadding(positions, padding);

        // For grid layouts, we need to center the entire grid around the layout anchor
        let finalPositions;
        if (layoutAnchor) {
            finalPositions = paddedPositions.map(pos => {
                return new THREE.Vector3(
                    pos.x + layoutAnchor.x,
                    pos.y + layoutAnchor.y,
                    pos.z + layoutAnchor.z
                );
            });
        } else {
            finalPositions = paddedPositions;
        }

        // Calculate bounds for the final layout
        const layoutBounds = this.calculateLayoutBounds(objects, finalPositions);

        return {
            positions: finalPositions,
            sizes: objectSizes,
            bounds: layoutBounds
        };
    }
    
    /**
     * Get object size from geometry or fixed size properties
     * @param {Object} obj - Object data from SceneController
     * @returns {THREE.Vector3} Object size
     */
    static getObjectSize(obj) {
        // Try to get size from fixed size property first
        if (obj.layoutProperties && obj.layoutProperties.fixedSize) {
            const fixed = obj.layoutProperties.fixedSize;
            return new THREE.Vector3(
                typeof fixed === 'number' ? fixed : fixed.x || 1,
                typeof fixed === 'number' ? fixed : fixed.y || 1,
                typeof fixed === 'number' ? fixed : fixed.z || 1
            );
        }
        
        // Calculate from geometry bounding box
        if (obj.mesh && obj.mesh.geometry) {
            obj.mesh.geometry.computeBoundingBox();
            const box = obj.mesh.geometry.boundingBox;

            if (box) {
                const size = new THREE.Vector3(
                    box.max.x - box.min.x,
                    box.max.y - box.min.y,
                    box.max.z - box.min.z
                );
                return size;
            }
        }
        
        // Default size fallback
        return new THREE.Vector3(1, 1, 1);
    }
    
    /**
     * Apply sizing behavior (Fixed/Fill/Hug) to object with proper fill calculation
     * @param {Object} obj - Object data
     * @param {THREE.Vector3} baseSize - Base object size
     * @param {string} layoutAxis - Primary layout axis
     * @param {number} availableSpace - Available space for fill objects on layout axis
     * @param {number} fillCount - Number of objects with fill behavior on layout axis
     * @param {THREE.Vector3} containerSize - Container size for calculating fill on any axis
     * @param {Object} padding - Padding configuration
     * @returns {THREE.Vector3} Adjusted size
     */
    static applySizingBehavior(obj, baseSize, layoutAxis, availableSpace = null, fillCount = 0, containerSize = null, padding = {}) {
        if (!obj.layoutProperties) {
            return baseSize;
        }

        const { sizeX, sizeY, sizeZ } = obj.layoutProperties;
        const adjustedSize = baseSize.clone();

        // Calculate fill size per object for layout axis
        const fillSizePerObject = (availableSpace && fillCount > 0) ? availableSpace / fillCount : baseSize[layoutAxis];

        // Apply X-axis sizing behavior
        if (sizeX === 'fill') {
            if (layoutAxis === 'x' && availableSpace !== null) {
                // Use layout axis fill calculation
                adjustedSize.x = Math.max(fillSizePerObject, 0.1);
            } else if (containerSize) {
                // Fill based on container size minus padding (inset on both sides)
                const paddingWidth = (padding.width || 0);
                const availableX = containerSize.x - (paddingWidth * 2);
                adjustedSize.x = Math.max(availableX, 0.1);
            } else {
                adjustedSize.x = baseSize.x;
            }
        } else if (sizeX === 'hug') {
            adjustedSize.x = baseSize.x; // Natural size
        }
        // 'fixed' uses current size

        // Apply Y-axis sizing behavior
        if (sizeY === 'fill') {
            if (layoutAxis === 'y' && availableSpace !== null) {
                // Use layout axis fill calculation
                adjustedSize.y = Math.max(fillSizePerObject, 0.1);
            } else if (containerSize) {
                // Fill based on container size minus padding (inset on both sides)
                const paddingHeight = (padding.height || 0);
                const availableY = containerSize.y - (paddingHeight * 2);
                adjustedSize.y = Math.max(availableY, 0.1);
            } else {
                adjustedSize.y = baseSize.y;
            }
        } else if (sizeY === 'hug') {
            adjustedSize.y = baseSize.y;
        }

        // Apply Z-axis sizing behavior
        if (sizeZ === 'fill') {
            if (layoutAxis === 'z' && availableSpace !== null) {
                // Use layout axis fill calculation
                adjustedSize.z = Math.max(fillSizePerObject, 0.1);
            } else if (containerSize) {
                // Fill based on container size minus padding (inset on both sides)
                const paddingDepth = (padding.depth || 0);
                const availableZ = containerSize.z - (paddingDepth * 2);
                adjustedSize.z = Math.max(availableZ, 0.1);
            } else {
                adjustedSize.z = baseSize.z;
            }
        } else if (sizeZ === 'hug') {
            adjustedSize.z = baseSize.z;
        }


        return adjustedSize;
    }
    
    /**
     * Categorize objects into fixed and fill groups for layout calculation
     * @param {Array} objects - Array of object data
     * @param {string} axis - Layout axis
     * @returns {Object} Object categorization data
     */
    static categorizeObjects(objects, axis) {
        const fixedObjects = [];
        const fillObjects = [];
        let totalFixedSize = 0;

        objects.forEach(obj => {
            const baseSize = this.getObjectSize(obj);
            const hasFill = this.objectHasFillBehavior(obj, axis);

            if (hasFill) {
                fillObjects.push(obj);
            } else {
                fixedObjects.push(obj);
                totalFixedSize += baseSize[axis];
            }
        });

        return {
            fixedObjects,
            fillObjects,
            totalFixedSize,
            fillCount: fillObjects.length
        };
    }

    /**
     * Check if object has fill behavior for the given axis
     * @param {Object} obj - Object data
     * @param {string} axis - Layout axis
     * @returns {boolean} True if object has fill behavior
     */
    static objectHasFillBehavior(obj, axis) {
        if (!obj.layoutProperties) return false;

        const sizeProperty = axis === 'x' ? 'sizeX' : axis === 'y' ? 'sizeY' : 'sizeZ';
        return obj.layoutProperties[sizeProperty] === 'fill';
    }

    /**
     * Get total padding along an axis
     * @param {string} axis - Layout axis
     * @param {Object} padding - Padding configuration {width, height, depth}
     * @returns {number} Total padding (both sides of axis)
     */
    static getTotalPadding(axis, padding) {
        const defaultPadding = { width: 0, height: 0, depth: 0 };
        const p = { ...defaultPadding, ...padding };

        switch (axis) {
            case 'x': return p.width * 2;  // padding affects both -X and +X sides
            case 'y': return p.height * 2; // padding affects both -Y and +Y sides
            case 'z': return p.depth * 2;  // padding affects both -Z and +Z sides
            default: return 0;
        }
    }

    /**
     * Get padding offset for layout axis
     * @param {string} axis - Layout axis
     * @param {Object} padding - Padding configuration {width, height, depth}
     * @returns {number} Padding offset for starting position (single-sided value)
     */
    static getPaddingOffset(axis, padding) {
        const defaultPadding = { width: 0, height: 0, depth: 0 };
        const p = { ...defaultPadding, ...padding };

        // Since padding is inset and affects both sides equally, offset is just the single padding value
        switch (axis) {
            case 'x': return p.width;
            case 'y': return p.height;
            case 'z': return p.depth;
            default: return 0;
        }
    }
    
    /**
     * Align layout positions based on push context or center normally
     * @param {Array} positions - Array of position vectors
     * @param {Array} sizes - Array of size vectors corresponding to positions
     * @param {string} axis - Layout axis
     * @param {THREE.Vector3} layoutAnchor - Optional anchor point to center layout around (default: origin)
     * @param {Object} pushContext - Optional push context with {axis, anchorMode}
     * @param {THREE.Vector3} containerSize - Container size for anchor-based alignment
     * @param {Object} padding - Padding configuration
     * @param {Object} layoutConfig - Layout configuration (includes alignment)
     * @returns {Array} Aligned positions
     */
    static alignLayoutPositions(positions, sizes, axis, layoutAnchor = null, pushContext = null, containerSize = null, padding = null, layoutConfig = null) {
        if (positions.length === 0 || sizes.length === 0) return positions;

        // Calculate actual layout bounds
        let min = Infinity, max = -Infinity;
        positions.forEach((pos, index) => {
            const size = sizes[index];
            if (!size) return;

            let objMin, objMax;
            if (axis === 'x') {
                objMin = pos.x - size.x / 2;
                objMax = pos.x + size.x / 2;
            } else if (axis === 'y') {
                objMin = pos.y - size.y / 2;
                objMax = pos.y + size.y / 2;
            } else if (axis === 'z') {
                objMin = pos.z - size.z / 2;
                objMax = pos.z + size.z / 2;
            }

            min = Math.min(min, objMin);
            max = Math.max(max, objMax);
        });

        // Determine target alignment
        let targetPosition = 0;

        // When container size exists: align first object to min edge (left/top/front)
        // When no container size: center the layout (container will resize to hug)
        const isPushing = pushContext && pushContext.axis === axis;

        if (containerSize && isPushing) {
            // PUSHING: Align objects to container edges based on anchor mode
            const containerAxisSize = axis === 'x' ? containerSize.x : axis === 'y' ? containerSize.y : containerSize.z;
            const containerMin = -containerAxisSize / 2;
            const containerMax = containerAxisSize / 2;

            // Get padding offset for this axis
            const paddingOffset = padding ? this.getPaddingOffset(axis, padding) : 0;

            if (pushContext.anchorMode === 'max') {
                // PUSHING from min face: align last object to max edge
                targetPosition = (containerMax - paddingOffset) - max;
            } else {
                // DEFAULT or PUSHING from max face: align first object to min edge
                targetPosition = (containerMin + paddingOffset) - min;
            }

        } else {
            // NOT PUSHING or NO CONTAINER SIZE: Center the layout
            // This prevents container from "jumping" when layout direction changes
            const boundsCenter = (min + max) / 2;
            let targetCenter = 0;
            if (layoutAnchor) {
                if (axis === 'x') targetCenter = layoutAnchor.x;
                else if (axis === 'y') targetCenter = layoutAnchor.y;
                else if (axis === 'z') targetCenter = layoutAnchor.z;
            }
            targetPosition = targetCenter - boundsCenter;
        }

        // Apply offset to all positions (layout axis)
        const axisAlignedPositions = positions.map(pos => {
            const alignedPos = pos.clone();
            if (axis === 'x') alignedPos.x += targetPosition;
            else if (axis === 'y') alignedPos.y += targetPosition;
            else if (axis === 'z') alignedPos.z += targetPosition;
            return alignedPos;
        });

        // Apply perpendicular alignment (if containerSize and alignment config exist)
        if (containerSize && layoutConfig?.alignment) {
            return this.applyPerpendicularAlignment(axisAlignedPositions, sizes, axis, containerSize, layoutConfig.alignment, padding);
        }

        return axisAlignedPositions;
    }

    /**
     * Apply alignment on axes perpendicular to the layout direction
     * @param {Array} positions - Array of position vectors (already aligned on layout axis)
     * @param {Array} sizes - Array of size vectors
     * @param {string} layoutAxis - The layout axis ('x', 'y', 'z')
     * @param {THREE.Vector3} containerSize - Container size
     * @param {Object} alignment - Alignment config {x: 'left'|'center'|'right', y: 'bottom'|'center'|'top', z: 'back'|'center'|'front'}
     * @param {Object} padding - Padding configuration
     * @returns {Array} Aligned positions
     */
    static applyPerpendicularAlignment(positions, sizes, layoutAxis, containerSize, alignment, padding) {
        // Determine which axes are perpendicular to the layout axis
        const perpendicularAxes = [];
        if (layoutAxis !== 'x') perpendicularAxes.push('x');
        if (layoutAxis !== 'y') perpendicularAxes.push('y');
        if (layoutAxis !== 'z') perpendicularAxes.push('z');

        return positions.map((pos, index) => {
            const alignedPos = pos.clone();
            const size = sizes[index];

            // Apply alignment for each perpendicular axis
            perpendicularAxes.forEach(axis => {
                const alignmentValue = alignment[axis] || 'center';
                const containerAxisSize = containerSize[axis];
                const objectAxisSize = size[axis];
                const paddingOffset = padding ? this.getPaddingOffset(axis, padding) : 0;

                // Container bounds (accounting for padding)
                const containerMin = -containerAxisSize / 2 + paddingOffset;
                const containerMax = containerAxisSize / 2 - paddingOffset;
                const containerCenter = 0;

                let targetPosition;
                switch (alignmentValue) {
                    case 'left':
                    case 'bottom':
                    case 'back':
                        // Align to min edge
                        targetPosition = containerMin + objectAxisSize / 2;
                        break;
                    case 'right':
                    case 'top':
                    case 'front':
                        // Align to max edge
                        targetPosition = containerMax - objectAxisSize / 2;
                        break;
                    case 'center':
                    default:
                        // Center alignment
                        targetPosition = containerCenter;
                        break;
                }

                alignedPos[axis] = targetPosition;
            });

            return alignedPos;
        });
    }

    /**
     * Center layout positions along the layout axis using actual bounds calculation
     * @param {Array} positions - Array of position vectors
     * @param {Array} sizes - Array of size vectors corresponding to positions
     * @param {string} axis - Layout axis
     * @param {THREE.Vector3} layoutAnchor - Optional anchor point to center layout around (default: origin)
     * @returns {Array} Centered positions
     */
    static centerLayoutPositions(positions, sizes, axis, layoutAnchor = null) {
        if (positions.length === 0 || sizes.length === 0) return positions;

        // Calculate actual layout bounds considering object sizes (not just positions)
        let min = Infinity, max = -Infinity;

        positions.forEach((pos, index) => {
            const size = sizes[index];
            if (!size) return;

            // Calculate the actual bounds of this object
            let objMin, objMax;
            if (axis === 'x') {
                objMin = pos.x - size.x / 2;
                objMax = pos.x + size.x / 2;
            } else if (axis === 'y') {
                objMin = pos.y - size.y / 2;
                objMax = pos.y + size.y / 2;
            } else if (axis === 'z') {
                objMin = pos.z - size.z / 2;
                objMax = pos.z + size.z / 2;
            }

            min = Math.min(min, objMin);
            max = Math.max(max, objMax);
        });

        // Calculate the center of the actual layout bounds
        const boundsCenter = (min + max) / 2;

        // Determine target center: use layoutAnchor if provided, otherwise origin
        let targetCenter = 0;
        if (layoutAnchor) {
            if (axis === 'x') targetCenter = layoutAnchor.x;
            else if (axis === 'y') targetCenter = layoutAnchor.y;
            else if (axis === 'z') targetCenter = layoutAnchor.z;
        }

        // Debug: Layout centering with bounds-based calculation

        // Calculate offset to center the layout bounds around the target center
        const offset = targetCenter - boundsCenter;
        return positions.map(pos => {
            const centeredPos = pos.clone();
            if (axis === 'x') centeredPos.x += offset;
            else if (axis === 'y') centeredPos.y += offset;
            else if (axis === 'z') centeredPos.z += offset;
            return centeredPos;
        });
    }
    
    /**
     * Apply padding offset to positions along a specific axis
     * @param {Array} positions - Array of position vectors
     * @param {string} axis - Layout axis ('x', 'y', 'z')
     * @param {number} paddingOffset - Padding offset for the axis
     * @returns {Array} Positions with padding offset applied
     */
    static applyPaddingToAxis(positions, axis, paddingOffset) {
        if (paddingOffset === 0) return positions;

        return positions.map(pos => {
            const paddedPos = pos.clone();
            if (axis === 'x') paddedPos.x += paddingOffset;
            else if (axis === 'y') paddedPos.y += paddingOffset;
            else if (axis === 'z') paddedPos.z += paddingOffset;
            return paddedPos;
        });
    }

    /**
     * Apply padding to grid positions
     * @param {Array} positions - Array of position vectors
     * @param {Object} padding - Padding configuration {width, height, depth}
     * @returns {Array} Positions with padding applied
     */
    static applyPadding(positions, padding) {
        const defaultPadding = { width: 0, height: 0, depth: 0 };
        const p = { ...defaultPadding, ...padding };

        // Since padding is symmetric on both sides, no offset needed for grid layouts
        // Grid layouts are already centered, padding only affects container sizing
        return positions;
    }
    
    /**
     * Calculate container bounds needed for all child objects
     * @param {Array} objects - Array of object data
     * @param {Array} positions - Array of calculated positions
     * @param {Object} layoutConfig - Layout configuration for sizing context
     * @param {THREE.Vector3} containerSize - Current container size for fill calculations
     * @returns {Object} Bounds information {min: Vector3, max: Vector3, size: Vector3}
     */
    static calculateLayoutBounds(objects, positions, layoutConfig = null, containerSize = null) {
        if (objects.length === 0 || positions.length === 0) {
            return {
                min: new THREE.Vector3(0, 0, 0),
                max: new THREE.Vector3(0, 0, 0),
                size: new THREE.Vector3(0, 0, 0)
            };
        }

        let minX = Infinity, minY = Infinity, minZ = Infinity;
        let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

        objects.forEach((obj, index) => {
            const pos = positions[index];
            let size = this.getObjectSize(obj);

            // Apply sizing behavior if layout configuration is provided
            if (layoutConfig && containerSize) {
                const { direction, gap = 0, padding = {} } = layoutConfig;
                const { fillCount } = this.categorizeObjects(objects, direction);

                let availableSpace = null;
                if (fillCount > 0) {
                    const { totalFixedSize } = this.categorizeObjects(objects, direction);
                    const totalGaps = (objects.length - 1) * gap;
                    const paddingTotal = this.getTotalPadding(direction, padding);
                    availableSpace = Math.max(0, containerSize[direction] - totalFixedSize - totalGaps - paddingTotal);
                }

                size = this.applySizingBehavior(obj, size, direction, availableSpace, fillCount, containerSize, padding);
            }

            minX = Math.min(minX, pos.x - size.x / 2);
            maxX = Math.max(maxX, pos.x + size.x / 2);
            minY = Math.min(minY, pos.y - size.y / 2);
            maxY = Math.max(maxY, pos.y + size.y / 2);
            minZ = Math.min(minZ, pos.z - size.z / 2);
            maxZ = Math.max(maxZ, pos.z + size.z / 2);
        });

        // Add padding to bounds if provided in layout config
        // Padding creates inset space, affecting both sides of each axis equally
        let paddingAdjustment = { x: 0, y: 0, z: 0 };
        if (layoutConfig && layoutConfig.padding) {
            const p = layoutConfig.padding;
            paddingAdjustment.x = (p.width || 0) * 2;  // width affects both sides
            paddingAdjustment.y = (p.height || 0) * 2; // height affects both sides
            paddingAdjustment.z = (p.depth || 0) * 2;  // depth affects both sides
        }

        const min = new THREE.Vector3(minX, minY, minZ);
        const max = new THREE.Vector3(maxX, maxY, maxZ);
        const size = new THREE.Vector3(
            (maxX - minX) + paddingAdjustment.x,
            (maxY - minY) + paddingAdjustment.y,
            (maxZ - minZ) + paddingAdjustment.z
        );

        return { min, max, size };
    }

    /**
     * Calculate fill object sizes based on available container space
     * @param {Array} objects - Array of object data
     * @param {Object} layoutConfig - Layout configuration
     * @param {THREE.Vector3} containerSize - Available container size
     * @returns {Array} Array of calculated object sizes with fill applied
     */
    static calculateFillObjectSizes(objects, layoutConfig, containerSize) {
        if (!objects || objects.length === 0) return [];

        const { direction, gap = 0, padding = {} } = layoutConfig;
        const { totalFixedSize, fillCount } = this.categorizeObjects(objects, direction);

        // Calculate available space for fill objects
        let availableSpace = containerSize[direction];
        if (fillCount > 0) {
            const totalGaps = (objects.length - 1) * gap;
            const paddingTotal = this.getTotalPadding(direction, padding);
            availableSpace = Math.max(0, availableSpace - totalFixedSize - totalGaps - paddingTotal);
        }

        // Calculate sizes for all objects
        return objects.map(obj => {
            const baseSize = this.getObjectSize(obj);
            return this.applySizingBehavior(obj, baseSize, direction, availableSpace, fillCount, containerSize, padding);
        });
    }
    
    /**
     * Get debug information for layout calculations
     * @param {Array} objects - Array of object data
     * @param {Object} layoutConfig - Layout configuration
     * @returns {Object} Debug information
     */
    static getLayoutDebugInfo(objects, layoutConfig) {
        const positions = this.calculateLayout(objects, layoutConfig);
        const bounds = this.calculateLayoutBounds(objects, positions);

        return {
            objectCount: objects.length,
            layoutConfig: { ...layoutConfig },
            calculatedPositions: positions.map(p => ({ x: p.x, y: p.y, z: p.z })),
            bounds: {
                min: { x: bounds.min.x, y: bounds.min.y, z: bounds.min.z },
                max: { x: bounds.max.x, y: bounds.max.y, z: bounds.max.z },
                size: { x: bounds.size.x, y: bounds.size.y, z: bounds.size.z }
            },
            calculationTime: performance.now() // For performance monitoring
        };
    }

    // ====== UNIFIED BOUNDS CALCULATION UTILITIES ======

    /**
     * Unified bounds calculation utility for both layout and selection bounds
     * @param {Array} items - Array of items (positions+sizes OR THREE.js meshes)
     * @param {Object} options - Options {type: 'layout'|'selection', useWorldSpace: boolean}
     * @returns {Object} Bounds object {min: Vector3, max: Vector3, size: Vector3, center: Vector3}
     */
    static calculateUnifiedBounds(items, options = {}) {
        const { type = 'layout', useWorldSpace = false } = options;

        if (!items || items.length === 0) {
            return this._getEmptyBounds();
        }

        // Detect if items are mesh objects (have .geometry property)
        const isMeshArray = items.length > 0 && items[0] && items[0].geometry !== undefined;

        if (isMeshArray) {
            // Items are mesh objects, use selection bounds calculation
            return this._calculateSelectionBounds(items, useWorldSpace);
        } else if (type === 'selection') {
            return this._calculateSelectionBounds(items, useWorldSpace);
        } else {
            // Items are position/size objects, use position bounds calculation
            return this._calculatePositionBounds(items);
        }
    }

    /**
     * Calculate bounds for THREE.js mesh objects (replaces LayoutGeometry.calculateSelectionBounds)
     * @param {Array} meshObjects - Array of THREE.js mesh objects
     * @param {boolean} useWorldSpace - Whether to use world space transforms
     * @returns {Object} Bounds object
     */
    static _calculateSelectionBounds(meshObjects, useWorldSpace = true) {
        // Filter to only objects with valid geometry
        const validObjects = meshObjects.filter(obj => {
            if (!obj || !obj.geometry) return false;
            obj.geometry.computeBoundingBox();
            return obj.geometry.boundingBox !== null;
        });

        if (validObjects.length === 0) {
            return this._getEmptyBounds();
        }

        let minX = Infinity, minY = Infinity, minZ = Infinity;
        let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

        validObjects.forEach(obj => {
            if (obj.geometry) {
                obj.geometry.computeBoundingBox();
                const box = obj.geometry.boundingBox;

                if (box) {
                    // Transform bounding box points
                    const corners = [
                        new THREE.Vector3(box.min.x, box.min.y, box.min.z),
                        new THREE.Vector3(box.max.x, box.min.y, box.min.z),
                        new THREE.Vector3(box.min.x, box.max.y, box.min.z),
                        new THREE.Vector3(box.max.x, box.max.y, box.min.z),
                        new THREE.Vector3(box.min.x, box.min.y, box.max.z),
                        new THREE.Vector3(box.max.x, box.min.y, box.max.z),
                        new THREE.Vector3(box.min.x, box.max.y, box.max.z),
                        new THREE.Vector3(box.max.x, box.max.y, box.max.z)
                    ];

                    corners.forEach(corner => {
                        if (useWorldSpace && obj.matrixWorld) {
                            corner.applyMatrix4(obj.matrixWorld);
                        }

                        minX = Math.min(minX, corner.x);
                        minY = Math.min(minY, corner.y);
                        minZ = Math.min(minZ, corner.z);
                        maxX = Math.max(maxX, corner.x);
                        maxY = Math.max(maxY, corner.y);
                        maxZ = Math.max(maxZ, corner.z);
                    });
                }
            }
        });

        return this._createBoundsObject(minX, minY, minZ, maxX, maxY, maxZ);
    }

    /**
     * Calculate bounds for position+size pairs (layout bounds)
     * @param {Array} items - Array of {position: Vector3, size: Vector3} or positions array with corresponding sizes
     * @returns {Object} Bounds object
     */
    static _calculatePositionBounds(items) {
        if (items.length === 0) return this._getEmptyBounds();

        let minX = Infinity, minY = Infinity, minZ = Infinity;
        let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

        items.forEach(item => {
            let pos, size;

            if (item.position && item.size) {
                // Item has position and size properties
                pos = item.position;
                size = item.size;
            } else if (Array.isArray(item) && item.length >= 2) {
                // Array format: [position, size]
                pos = item[0];
                size = item[1];
            } else {
                // Assume item is position, size needs to be provided separately
                pos = item;
                size = new THREE.Vector3(1, 1, 1); // Default size
            }

            const halfSize = size.clone().multiplyScalar(0.5);

            minX = Math.min(minX, pos.x - halfSize.x);
            maxX = Math.max(maxX, pos.x + halfSize.x);
            minY = Math.min(minY, pos.y - halfSize.y);
            maxY = Math.max(maxY, pos.y + halfSize.y);
            minZ = Math.min(minZ, pos.z - halfSize.z);
            maxZ = Math.max(maxZ, pos.z + halfSize.z);
        });

        return this._createBoundsObject(minX, minY, minZ, maxX, maxY, maxZ);
    }

    /**
     * Create bounds object from min/max coordinates
     * @private
     */
    static _createBoundsObject(minX, minY, minZ, maxX, maxY, maxZ) {
        const min = new THREE.Vector3(minX, minY, minZ);
        const max = new THREE.Vector3(maxX, maxY, maxZ);
        const size = new THREE.Vector3(maxX - minX, maxY - minY, maxZ - minZ);
        const center = new THREE.Vector3(
            (minX + maxX) / 2,
            (minY + maxY) / 2,
            (minZ + maxZ) / 2
        );

        return { min, max, size, center };
    }

    /**
     * Get empty bounds object
     * @private
     */
    static _getEmptyBounds() {
        return {
            center: new THREE.Vector3(0, 0, 0),
            size: new THREE.Vector3(1, 1, 1),
            min: new THREE.Vector3(0, 0, 0),
            max: new THREE.Vector3(1, 1, 1)
        };
    }
}

// Export for use in SceneController
window.LayoutEngine = LayoutEngine;