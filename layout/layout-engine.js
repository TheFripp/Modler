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
     * @returns {Object} Object with {positions: Array, sizes: Array}
     */
    static calculateLayout(objects, layoutConfig, containerSize = null, layoutAnchor = null) {
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
                return this.calculateLinearLayout(objects, 'x', gap, padding, axisSize, containerSize, layoutAnchor);
            case 'y':
                return this.calculateLinearLayout(objects, 'y', gap, padding, axisSize, containerSize, layoutAnchor);
            case 'z':
                return this.calculateLinearLayout(objects, 'z', gap, padding, axisSize, containerSize, layoutAnchor);
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
     * @returns {Array} Array of positions
     */
    static calculateLinearLayout(objects, axis, gap, padding, axisSize = null, fullContainerSize = null, layoutAnchor = null) {
        const positions = [];
        const paddingOffset = this.getPaddingOffset(axis, padding);

        // Two-pass calculation for fill objects
        const { fixedObjects, fillObjects, totalFixedSize, fillCount } = this.categorizeObjects(objects, axis);

        // Calculate available space for fill objects
        let availableSpace = axisSize;
        if (availableSpace && fillCount > 0) {
            const totalGaps = (objects.length - 1) * gap;
            const paddingTotal = this.getTotalPadding(axis, padding);
            availableSpace = Math.max(0, availableSpace - totalFixedSize - totalGaps - paddingTotal);
        }

        // Calculate sizes for all objects
        const objectSizes = objects.map(obj => {
            const baseSize = this.getObjectSize(obj);
            return this.applySizingBehavior(obj, baseSize, axis, availableSpace, fillCount, fullContainerSize, padding);
        });

        // Position objects (start from first object's half-size)
        let currentPosition = 0;

        objects.forEach((obj, index) => {
            const position = new THREE.Vector3(0, 0, 0);
            const size = objectSizes[index];

            // Position object center at current location plus half size
            if (axis === 'x') {
                position.x = currentPosition + size.x / 2;
                currentPosition += size.x + gap;
            } else if (axis === 'y') {
                position.y = currentPosition + size.y / 2;
                currentPosition += size.y + gap;
            } else if (axis === 'z') {
                position.z = currentPosition + size.z / 2;
                currentPosition += size.z + gap;
            }

            positions.push(position);
        });

        // Center the entire layout around the layout anchor (or origin if no anchor)
        const centeredPositions = this.centerLayoutPositions(positions, objectSizes, axis, layoutAnchor);

        // Apply padding after centering
        const finalPositions = this.applyPaddingToAxis(centeredPositions, axis, paddingOffset);

        // Calculate bounds for the final layout
        const layoutBounds = this.calculateLayoutBounds(objects, finalPositions, null, fullContainerSize);

        return {
            positions: finalPositions,
            sizes: objectSizes,
            bounds: layoutBounds
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
            console.log('🔍 SIZE DEBUG - No layout properties:', { objName: obj.name, baseSize: { x: baseSize.x, y: baseSize.y, z: baseSize.z } });
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
                // Fill based on container size minus padding for any axis
                const paddingLeft = (padding.left || 0);
                const paddingRight = (padding.right || 0);
                const availableX = containerSize.x - paddingLeft - paddingRight;
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
                // Fill based on container size minus padding for any axis
                const paddingTop = (padding.top || 0);
                const paddingBottom = (padding.bottom || 0);
                const availableY = containerSize.y - paddingTop - paddingBottom;
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
                // Fill based on container size minus padding for any axis
                const paddingFront = (padding.front || 0);
                const paddingBack = (padding.back || 0);
                const availableZ = containerSize.z - paddingFront - paddingBack;
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
     * @param {Object} padding - Padding configuration
     * @returns {number} Total padding (start + end)
     */
    static getTotalPadding(axis, padding) {
        const defaultPadding = { top: 0, bottom: 0, left: 0, right: 0, front: 0, back: 0 };
        const p = { ...defaultPadding, ...padding };

        switch (axis) {
            case 'x': return p.left + p.right;
            case 'y': return p.top + p.bottom;
            case 'z': return p.front + p.back;
            default: return 0;
        }
    }

    /**
     * Get padding offset for layout axis
     * @param {string} axis - Layout axis
     * @param {Object} padding - Padding configuration
     * @returns {number} Padding offset for starting position
     */
    static getPaddingOffset(axis, padding) {
        const defaultPadding = { top: 0, bottom: 0, left: 0, right: 0, front: 0, back: 0 };
        const p = { ...defaultPadding, ...padding };

        switch (axis) {
            case 'x': return p.left;
            case 'y': return p.bottom;
            case 'z': return p.back;
            default: return 0;
        }
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
     * @param {Object} padding - Padding configuration
     * @returns {Array} Positions with padding applied
     */
    static applyPadding(positions, padding) {
        const defaultPadding = { top: 0, bottom: 0, left: 0, right: 0, front: 0, back: 0 };
        const p = { ...defaultPadding, ...padding };

        return positions.map(pos => new THREE.Vector3(
            pos.x + (p.right - p.left) / 2,
            pos.y + (p.top - p.bottom) / 2,
            pos.z + (p.front - p.back) / 2
        ));
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

        const min = new THREE.Vector3(minX, minY, minZ);
        const max = new THREE.Vector3(maxX, maxY, maxZ);
        const size = new THREE.Vector3(maxX - minX, maxY - minY, maxZ - minZ);

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
}

// Export for use in SceneController
window.LayoutEngine = LayoutEngine;