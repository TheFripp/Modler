import * as THREE from 'three';
// Modler V2 - Layout Engine
// Pure layout calculation functions for 3D auto layout system
// Follows V2 architecture: calculations separate from Three.js manipulation

/**
 * PADDING SEMANTICS
 * =================
 * Stored as {width, height, depth} — symmetric per axis.
 * Each value = inset on ONE side; total inset per axis = value × 2.
 *
 * Axis mapping: width → X, height → Y, depth → Z
 *
 * Effect by operation:
 *   Fill sizing          — Subtracts from available space (availableX = containerX - padding×2)
 *   Object positioning   — Does NOT offset positions; objects stay centered
 *   Perpendicular align  — Insets alignment boundaries (containerMin + padding, containerMax - padding)
 *   Push space-between   — Offsets starting position (first object at containerMin + padding)
 *   Bounds calculation   — Adds to container size (boundsSize + padding×2)
 *   Fill distribution    — Reduces layout-axis space (containerAxis - fixedSize - gaps - padding×2)
 *
 * Invariant: padding is always symmetric (no per-side distinction).
 */
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
        const axisSize = containerSize && ['x', 'y', 'z'].includes(direction) ? containerSize[direction] : null;

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
     *
     * START/END CONVENTION:
     *   Objects are positioned sequentially from start (lowest coordinate) to end (highest coordinate).
     *   First child in array = start position, last child = end position.
     *     X axis: start = left (-x),   end = right (+x)
     *     Y axis: start = bottom (-y), end = top (+y)
     *     Z axis: start = back (-z),   end = front (+z)
     *   When reversed=true, the first child in the array maps to the end position instead.
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
            position[axis] = currentPosition + size[axis] / 2;
            currentPosition += size[axis] + dynamicGap;

            positions.push(position);
        });

        // Align layout based on push context (anchor mode) or center normally
        const alignedPositions = this.alignLayoutPositions(positions, objectSizes, axis, layoutAnchor, pushContext, fullContainerSize, padding, layoutConfig, fillCount);

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

        // Calculate bounds for the final layout (pass pre-computed sizes to avoid re-derivation)
        const layoutBounds = this.calculateLayoutBounds(objects, finalPositions, layoutConfig, fullContainerSize, finalSizes);

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

        // Center the entire grid around the layout anchor
        // Note: Grid padding only affects container sizing, not object positions (symmetric)
        let finalPositions;
        if (layoutAnchor) {
            finalPositions = positions.map(pos => {
                return new THREE.Vector3(
                    pos.x + layoutAnchor.x,
                    pos.y + layoutAnchor.y,
                    pos.z + layoutAnchor.z
                );
            });
        } else {
            finalPositions = positions;
        }

        // Calculate bounds for the final layout (pass pre-computed sizes to avoid re-derivation)
        const layoutBounds = this.calculateLayoutBounds(objects, finalPositions, null, null, objectSizes);

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
        // Get geometry size first (most reliable)
        let geometrySize = null;
        if (obj.mesh && obj.mesh.geometry) {
            obj.mesh.geometry.computeBoundingBox();
            const box = obj.mesh.geometry.boundingBox;

            if (box) {
                geometrySize = new THREE.Vector3(
                    box.max.x - box.min.x,
                    box.max.y - box.min.y,
                    box.max.z - box.min.z
                );
            }
        }

        // Use geometry size as fallback, or default to 1
        const fallback = geometrySize || new THREE.Vector3(1, 1, 1);

        // Override with fixedSize values where they exist (not null)
        if (obj.layoutProperties && obj.layoutProperties.fixedSize) {
            const fixed = obj.layoutProperties.fixedSize;
            return new THREE.Vector3(
                (typeof fixed === 'number' ? fixed : (fixed.x ?? fallback.x)),
                (typeof fixed === 'number' ? fixed : (fixed.y ?? fallback.y)),
                (typeof fixed === 'number' ? fixed : (fixed.z ?? fallback.z))
            );
        }

        return fallback;
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

        const adjustedSize = baseSize.clone();
        const fillSizePerObject = (availableSpace && fillCount > 0) ? availableSpace / fillCount : baseSize[layoutAxis];
        const AXIS_TO_PADDING = { x: 'width', y: 'height', z: 'depth' };

        ['x', 'y', 'z'].forEach(axis => {
            const sizeProp = `size${axis.toUpperCase()}`;
            const sizeMode = obj.layoutProperties[sizeProp];

            if (sizeMode === 'fill') {
                if (layoutAxis === axis && availableSpace !== null) {
                    adjustedSize[axis] = Math.max(fillSizePerObject, 0.1);
                } else if (containerSize) {
                    const paddingVal = padding[AXIS_TO_PADDING[axis]] || 0;
                    adjustedSize[axis] = Math.max(containerSize[axis] - paddingVal * 2, 0.1);
                }
                // else: keep baseSize (no container size available)
            }
            // 'hug' and 'fixed' keep baseSize — no action needed
        });

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
     * Check if object has fill behavior for the given axis.
     * Reads layoutProperties directly from the data object (pure calculation engine pattern).
     * For ID-based checks, use ObjectStateManager.hasFillEnabled(id, axis) instead.
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
     * Calculate the minimum container size needed to fit all children on a given axis.
     * Used by push tool to prevent shrinking containers smaller than their contents.
     * Fill objects contribute only their minimum size (0.1), since they resize to fit.
     *
     * @param {Array} children - Array of child object data (with dimensions, layoutProperties)
     * @param {string} axis - The axis being pushed ('x', 'y', 'z')
     * @param {Object} layoutConfig - Container's autoLayout config (direction, gap, padding)
     * @returns {number} Minimum container size on the given axis
     */
    static calculateMinimumContainerSize(children, axis, layoutConfig) {
        if (!layoutConfig || !children || children.length === 0) return 0;

        const direction = layoutConfig.direction;
        const MIN_FILL_SIZE = 0.1;

        // Categorize children by fill status on the push axis
        const fillProp = `size${axis.toUpperCase()}`;
        const fillChildren = [];
        const nonFillChildren = [];
        children.forEach(child => {
            if (this.objectHasFillBehavior(child, axis)) {
                fillChildren.push(child);
            } else {
                nonFillChildren.push(child);
            }
        });

        // In space-between mode (no fill objects), gaps are flexible (can be zero)
        const gap = fillChildren.length > 0 ? (layoutConfig.gap || 0) : 0;
        const totalPadding = this.getTotalPadding(axis, layoutConfig.padding || {});
        let minSize = totalPadding;

        if (direction === axis) {
            // Push axis matches layout direction: sum sizes along the axis
            nonFillChildren.forEach(child => {
                const size = this.getObjectSize(child);
                minSize += size[axis];
            });
            minSize += fillChildren.length * MIN_FILL_SIZE;
            if (children.length > 1) {
                minSize += gap * (children.length - 1);
            }
        } else {
            // Push axis perpendicular to layout direction: max child size on axis
            let maxChildSize = 0;
            nonFillChildren.forEach(child => {
                const size = this.getObjectSize(child);
                maxChildSize = Math.max(maxChildSize, size[axis]);
            });
            fillChildren.forEach(child => {
                if (this.objectHasFillBehavior(child, axis)) {
                    maxChildSize = Math.max(maxChildSize, MIN_FILL_SIZE);
                } else {
                    const size = this.getObjectSize(child);
                    maxChildSize = Math.max(maxChildSize, size[axis]);
                }
            });
            minSize += maxChildSize;
        }

        return minSize;
    }

    /**
     * Get total padding along an axis
     * @param {string} axis - Layout axis
     * @param {Object} padding - Padding configuration {width, height, depth}
     * @returns {number} Total padding (both sides of axis)
     */
    static getTotalPadding(axis, padding) {
        return this.getPaddingOffset(axis, padding) * 2;
    }

    /**
     * Get padding offset for layout axis (single-sided value)
     * @param {string} axis - Layout axis
     * @param {Object} padding - Padding configuration {width, height, depth}
     * @returns {number} Padding offset for one side
     */
    static getPaddingOffset(axis, padding) {
        const AXIS_TO_PADDING = { x: 'width', y: 'height', z: 'depth' };
        return (padding && padding[AXIS_TO_PADDING[axis]]) || 0;
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
     * @param {number} fillCount - Number of fill objects on layout axis (for space-between detection)
     * @returns {Array} Aligned positions
     */
    static alignLayoutPositions(positions, sizes, axis, layoutAnchor = null, pushContext = null, containerSize = null, padding = null, layoutConfig = null, fillCount = 0) {
        if (positions.length === 0 || sizes.length === 0) return positions;

        // Calculate actual layout bounds on the layout axis
        let min = Infinity, max = -Infinity;
        positions.forEach((pos, index) => {
            const size = sizes[index];
            if (!size) return;
            min = Math.min(min, pos[axis] - size[axis] / 2);
            max = Math.max(max, pos[axis] + size[axis] / 2);
        });

        // Determine target position for layout axis
        let targetPosition = 0;

        // When using space-between (pushing with no fill objects):
        // Anchor first object to container start edge (min)
        const isPushing = pushContext && pushContext.axis === axis;
        const usingSpaceBetween = containerSize && isPushing && fillCount === 0;

        if (usingSpaceBetween) {
            // Space-between: align first object to min edge (accounting for padding)
            const containerMin = -containerSize[axis] / 2;
            const paddingOffset = padding ? this.getPaddingOffset(axis, padding) : 0;
            targetPosition = (containerMin + paddingOffset) - min;
        } else {
            // Normal centering (or use layoutAnchor if provided)
            const boundsCenter = (min + max) / 2;
            const targetCenter = layoutAnchor ? layoutAnchor[axis] : 0;
            targetPosition = targetCenter - boundsCenter;
        }

        // Apply offset to all positions (layout axis)
        const axisAlignedPositions = positions.map(pos => {
            const alignedPos = pos.clone();
            alignedPos[axis] += targetPosition;
            return alignedPos;
        });

        // Apply perpendicular alignment (if containerSize and alignment config exist)
        if (containerSize && layoutConfig?.alignment) {
            return this.applyPerpendicularAlignment(axisAlignedPositions, sizes, axis, containerSize, layoutConfig.alignment, padding, pushContext);
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
     * @param {Object} pushContext - Optional push context for push operations
     * @returns {Array} Aligned positions
     */
    static applyPerpendicularAlignment(positions, sizes, layoutAxis, containerSize, alignment, padding, pushContext = null) {
        // Apply alignment on all axes perpendicular to layout direction
        // This ensures children maintain position relative to their aligned edge
        // even during push operations (as container size changes)

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
     * Calculate container bounds needed for all child objects
     * @param {Array} objects - Array of object data
     * @param {Array} positions - Array of calculated positions
     * @param {Object} layoutConfig - Layout configuration for sizing context
     * @param {THREE.Vector3} containerSize - Current container size for fill calculations
     * @param {Array} precomputedSizes - Pre-computed sizes from layout calculation (avoids re-derivation)
     * @returns {Object} Bounds information {min: Vector3, max: Vector3, size: Vector3}
     */
    static calculateLayoutBounds(objects, positions, layoutConfig = null, containerSize = null, precomputedSizes = null) {
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

            // Use pre-computed sizes when available (eliminates redundant re-derivation)
            let size;
            if (precomputedSizes && precomputedSizes[index]) {
                size = precomputedSizes[index];
            } else {
                size = this.getObjectSize(obj);

                // Fallback: apply sizing behavior if layout configuration provided but no pre-computed sizes
                if (layoutConfig && containerSize) {
                    const { direction, gap = 0, padding = {} } = layoutConfig;
                    const { fillCount, totalFixedSize } = this.categorizeObjects(objects, direction);

                    let availableSpace = null;
                    if (fillCount > 0) {
                        const totalGaps = (objects.length - 1) * gap;
                        const paddingTotal = this.getTotalPadding(direction, padding);
                        availableSpace = Math.max(0, containerSize[direction] - totalFixedSize - totalGaps - paddingTotal);
                    }

                    size = this.applySizingBehavior(obj, size, direction, availableSpace, fillCount, containerSize, padding);
                }
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

    // ====== HUG BOUNDS CALCULATION ======

    /**
     * Calculate bounds for hug-mode containers (fit container tightly around children).
     * Replaces ad-hoc bounds calculation that was previously in ContainerCrudManager.
     *
     * @param {Array} childMeshes - Array of child THREE.js mesh objects (use getChildMeshesForBounds)
     * @param {Object} padding - Padding configuration {width, height, depth}
     * @returns {Object} Bounds object {min: Vector3, max: Vector3, size: Vector3, center: Vector3}
     */
    static calculateHugBounds(childMeshes, padding = {}) {
        if (!childMeshes || childMeshes.length === 0) {
            return this._getEmptyBounds();
        }

        // Calculate local-space bounds (children positioned in container space)
        const bounds = this._calculateSelectionBounds(childMeshes, false, true);

        // Add padding to bounds size (symmetric per axis, same as layout bounds padding)
        const AXIS_TO_PADDING = { x: 'width', y: 'height', z: 'depth' };
        ['x', 'y', 'z'].forEach(axis => {
            const paddingVal = (padding[AXIS_TO_PADDING[axis]] || 0) * 2;
            bounds.size[axis] += paddingVal;
        });

        return bounds;
    }

    // ====== CONVERGENT LAYOUT CALCULATION ======

    /**
     * Calculate layout with container resize convergence (eliminates the re-pass pattern).
     *
     * The problem: space-between gap depends on container size, but container size depends
     * on layout bounds. This method internalizes the two-pass calculation:
     *   Pass 1: Calculate layout with current container size
     *   Pass 2: If container would resize, recalculate with new container size
     *
     * @param {Array} objects - Array of child object data
     * @param {Object} layoutConfig - Container's autoLayout config
     * @param {THREE.Vector3} containerSize - Current container size
     * @param {Object} fillAxes - Per-axis fill detection {x: bool, y: bool, z: bool}
     * @param {Object} pushContext - Optional push context {axis, anchorMode}
     * @returns {Object} Converged result:
     *   {positions, sizes, bounds, calculatedGap, targetContainerSize, containerResized}
     */
    static calculateLayoutWithConvergence(objects, layoutConfig, containerSize, fillAxes = {}, pushContext = null) {
        if (!objects || objects.length === 0) {
            return {
                positions: [], sizes: [], bounds: null,
                calculatedGap: undefined, targetContainerSize: containerSize, containerResized: false
            };
        }

        // Pass 1: Calculate layout with current container size
        const pass1 = this.calculateLayout(objects, layoutConfig, containerSize, null, pushContext);

        // Determine effective container size: keep current on fill axes, use bounds on others
        const bounds = pass1.bounds;
        if (!bounds || !bounds.size) {
            return {
                ...pass1,
                targetContainerSize: containerSize,
                containerResized: false
            };
        }

        const effectiveSize = new THREE.Vector3(
            fillAxes.x ? containerSize.x : bounds.size.x,
            fillAxes.y ? containerSize.y : bounds.size.y,
            fillAxes.z ? containerSize.z : bounds.size.z
        );

        // Check if container size actually changed
        const sizeChanged = Math.abs(effectiveSize.x - containerSize.x) > 0.001 ||
                            Math.abs(effectiveSize.y - containerSize.y) > 0.001 ||
                            Math.abs(effectiveSize.z - containerSize.z) > 0.001;

        if (!sizeChanged) {
            return {
                ...pass1,
                targetContainerSize: containerSize,
                containerResized: false
            };
        }

        // Pass 2: Recalculate with the effective (post-resize) container size
        const pass2 = this.calculateLayout(objects, layoutConfig, effectiveSize, null, pushContext);

        return {
            ...pass2,
            targetContainerSize: effectiveSize,
            containerResized: true
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
        const { type = 'layout', useWorldSpace = false, useLocalTransform = false } = options;

        if (!items || items.length === 0) {
            return this._getEmptyBounds();
        }

        // Detect if items are mesh objects (have .geometry property)
        const isMeshArray = items.length > 0 && items[0] && items[0].geometry !== undefined;

        if (isMeshArray) {
            // Items are mesh objects, use selection bounds calculation
            return this._calculateSelectionBounds(items, useWorldSpace, useLocalTransform);
        } else if (type === 'selection') {
            return this._calculateSelectionBounds(items, useWorldSpace, useLocalTransform);
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
    static _calculateSelectionBounds(meshObjects, useWorldSpace = true, useLocalTransform = false) {
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
                const box = obj.geometry.boundingBox; // Already computed in filter above

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
                        if (useLocalTransform) {
                            obj.updateMatrix();
                            corner.applyMatrix4(obj.matrix);
                        } else if (useWorldSpace && obj.matrixWorld) {
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