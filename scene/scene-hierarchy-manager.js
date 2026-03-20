import * as THREE from 'three';
/**
 * SceneHierarchyManager - Parent-Child Relationship Management
 *
 * Extracted from SceneController (Phase 5.1 refactoring)
 *
 * Responsibilities:
 * - Parent-child relationship management (setParentContainer)
 * - Child object retrieval with ordering (getChildObjects)
 * - Circular reference detection (wouldCreateCircularReference)
 * - Hierarchy traversal (isDescendantContainer, getNestedContainers)
 * - Nesting depth calculation (getContainerNestingDepth)
 * - Root and container childrenOrder management
 *
 * Dependencies:
 * - THREE.js for mesh hierarchy manipulation
 * - ObjectStateManager for depth cache clearing
 * - ObjectEventBus for hierarchy change notifications
 * - SceneController scene reference for Three.js scene.add()
 *
 * Version: 1.0.0
 * Part of: Phase 5 - SceneController Split
 */

class SceneHierarchyManager {
    constructor() {
        // State
        this.objects = null; // Map reference from SceneController
        this.scene = null; // THREE.Scene reference
        this.rootChildrenOrder = []; // Root-level object ordering

        // Component references
        this.objectStateManager = null;
    }

    /**
     * Initialize with dependencies
     */
    initialize(objectsMap, scene, rootChildrenOrder) {
        this.objects = objectsMap;
        this.scene = scene;
        this.rootChildrenOrder = rootChildrenOrder;

        return true;
    }

    /**
     * Set component references (lazy initialization)
     */
    setObjectStateManager(osm) {
        this.objectStateManager = osm;
    }

    /**
     * Get child objects of a container in proper order
     * @param {string} containerId - Parent container ID
     * @returns {Array<Object>} Array of child objects in order
     */
    getChildObjects(containerId) {
        const container = this.objects.get(containerId);

        // If container has explicit child order, use it
        if (container && container.childrenOrder && Array.isArray(container.childrenOrder)) {
            // Map IDs to actual objects, filtering out any invalid IDs
            const orderedChildren = [];
            for (const childId of container.childrenOrder) {
                const child = this.objects.get(childId);
                if (child && child.parentContainer === containerId) {
                    orderedChildren.push(child);
                }
            }

            return orderedChildren;
        }

        // Fallback: return children in iteration order
        const children = [];
        for (const obj of this.objects.values()) {
            if (obj.parentContainer === containerId) {
                children.push(obj);
            }
        }
        return children;
    }

    /**
     * Set parent container for an object
     * @param {number} objectId - Object ID
     * @param {number} parentId - Parent container ID (null to remove from container)
     * @param {Object} callbacks - Callbacks for layout updates { updateLayout, updateHugContainerSize, resizeToLayoutBounds }
     * @param {boolean} shouldUpdateLayout - Whether to trigger layout updates (default: true)
     * @returns {boolean} True if parent was successfully set
     */
    setParentContainer(objectId, parentId, callbacks = {}, shouldUpdateLayout = true) {
        const obj = this.objects.get(objectId);
        if (!obj) return false;

        if (parentId && !this.objects.get(parentId)?.isContainer) {
            return false;
        }

        // Enforce max nesting depth
        if (parentId && obj.isContainer) {
            const MAX_NESTING = window.ObjectDataFormat?.MAX_NESTING_DEPTH ?? 2;
            const parentDepth = this.getContainerNestingDepth(parentId);
            if (parentDepth >= MAX_NESTING) {
                console.warn(`SceneHierarchyManager: Cannot nest container at depth ${parentDepth + 1}, max is ${MAX_NESTING}`);
                return false;
            }
        }

        const mesh = obj.mesh;
        if (!mesh) return false;

        // Track old parent for childrenOrder updates
        const oldParentId = obj.parentContainer;

        // Handle Three.js hierarchy changes
        if (parentId) {
            // Moving to a container
            const parentContainer = this.objects.get(parentId);
            if (parentContainer && parentContainer.mesh) {
                // CRITICAL FIX: Only handle hierarchy if object is not already a child
                // This prevents interference with ContainerManager's position calculations
                if (mesh.parent !== parentContainer.mesh) {
                    // Store current local position (might already be set correctly)
                    const currentLocalPosition = mesh.position.clone();

                    // Check if mesh is currently at scene root (fresh creation)
                    const isAtSceneRoot = mesh.parent === this.scene;

                    // Remove from current parent
                    if (mesh.parent) {
                        mesh.parent.remove(mesh);
                    }

                    // Add to container
                    parentContainer.mesh.add(mesh);

                    // Only convert coordinates if object was NOT fresh from creation
                    // Fresh objects have position already set as local in configureMesh()
                    if (!isAtSceneRoot) {
                        // Object is being moved between parents - need coordinate conversion
                        const worldPosition = currentLocalPosition; // Was world position at scene root
                        const containerWorldMatrix = parentContainer.mesh.matrixWorld;
                        const containerWorldMatrixInverse = new THREE.Matrix4().copy(containerWorldMatrix).invert();
                        const localPosition = worldPosition.applyMatrix4(containerWorldMatrixInverse);
                        mesh.position.copy(localPosition);
                    }
                    // else: mesh.position is already correct (was set as local in configureMesh)
                }
                // If already a child, skip hierarchy changes (ContainerManager handled it)

                // Initialize or update childrenOrder array
                if (!parentContainer.childrenOrder || !Array.isArray(parentContainer.childrenOrder)) {
                    // Initialize from current children
                    const currentChildren = this.getChildObjects(parentId);
                    parentContainer.childrenOrder = currentChildren.map(child => child.id);
                }

                // Add this object to childrenOrder if not already present
                if (!parentContainer.childrenOrder.includes(objectId)) {
                    parentContainer.childrenOrder.push(objectId);
                }
            }
        } else {
            // Moving to root (removing from container)
            if (mesh.parent && mesh.parent !== this.scene) {
                // Store world position before changing parent
                const worldPosition = mesh.getWorldPosition(new THREE.Vector3());

                // Remove from container
                mesh.parent.remove(mesh);

                // Add to scene at world position
                this.scene.add(mesh);
                mesh.position.copy(worldPosition);
            }

            // Add to rootChildrenOrder if not already present
            if (!this.rootChildrenOrder.includes(objectId)) {
                this.rootChildrenOrder.push(objectId);
            }
        }

        // Remove from old parent's childrenOrder if it exists
        if (oldParentId && oldParentId !== parentId) {
            const oldParent = this.objects.get(oldParentId);
            if (oldParent && oldParent.childrenOrder && Array.isArray(oldParent.childrenOrder)) {
                const index = oldParent.childrenOrder.indexOf(objectId);
                if (index !== -1) {
                    oldParent.childrenOrder.splice(index, 1);
                }
            }
        } else if (!oldParentId && parentId) {
            // Moving from root to a container - remove from rootChildrenOrder
            const index = this.rootChildrenOrder.indexOf(objectId);
            if (index !== -1) {
                this.rootChildrenOrder.splice(index, 1);
            }
        }

        // Update metadata
        obj.parentContainer = parentId;

        // PERFORMANCE: Clear depth cache since hierarchy changed
        if (this.objectStateManager?.clearDepthCache) {
            this.objectStateManager.clearDepthCache();
        }

        // UNIFIED ARCHITECTURE: Emit ObjectEventBus event
        if (window.objectEventBus) {
            window.objectEventBus.emit(
                window.objectEventBus.EVENT_TYPES?.HIERARCHY || 'object:hierarchy',
                objectId,
                {
                    type: 'parent-changed',
                    parentId: parentId,
                    previousParentId: oldParentId,
                    childId: String(objectId)
                },
                { immediate: true, source: 'SceneHierarchyManager.setParentContainer' }
            );
        }

        // Update matrix world to ensure visual updates
        mesh.updateMatrixWorld(true);

        // Trigger layout updates if requested and callbacks provided
        if (shouldUpdateLayout && callbacks.updateLayout && callbacks.updateHugContainerSize) {
            if (parentId) {
                this._triggerContainerLayoutUpdate(parentId, callbacks);
            }
            if (oldParentId && oldParentId !== parentId) {
                this._triggerContainerLayoutUpdate(oldParentId, callbacks);
            }
        }

        return true;
    }

    /**
     * Check if making containerB a child of containerA would create a circular reference
     * @param {string} containerAId - Potential parent container
     * @param {string} containerBId - Potential child container
     * @returns {boolean} true if circular reference would be created
     */
    wouldCreateCircularReference(containerAId, containerBId) {
        // Can't contain itself
        if (containerAId === containerBId) {
            return true;
        }

        // Check if containerB is already descendant of containerA
        return this.isDescendantContainer(containerBId, containerAId);
    }

    /**
     * Check if a container is a descendant of another container
     * @param {string} potentialDescendantId - Container that might be a descendant
     * @param {string} ancestorId - Container that might be an ancestor
     * @returns {boolean} true if descendant relationship exists
     */
    isDescendantContainer(potentialDescendantId, ancestorId) {
        const descendant = this.objects.get(potentialDescendantId);
        if (!descendant || !descendant.isContainer) {
            return false;
        }

        // Walk up the parent chain
        let currentId = potentialDescendantId;
        const visited = new Set(); // Prevent infinite loops in corrupted data

        while (currentId) {
            // Prevent infinite loops
            if (visited.has(currentId)) {
                // Circular reference detected - treat as circular to prevent further nesting
                return true;
            }
            visited.add(currentId);

            const current = this.objects.get(currentId);
            if (!current) break;

            // Check if current container's parent is our target ancestor
            if (current.parentContainer === ancestorId) {
                return true; // Found ancestor relationship
            }

            // Move up to parent
            currentId = current.parentContainer;
        }

        return false;
    }

    /**
     * Get the nesting depth of a container (how many levels deep it is)
     * @param {string} containerId - ID of container to check
     * @returns {number} nesting depth (0 = root level, -1 = error/circular)
     */
    getContainerNestingDepth(containerId) {
        const container = this.objects.get(containerId);
        if (!container || !container.isContainer) {
            return 0;
        }

        let depth = 0;
        let currentId = container.parentContainer;
        const visited = new Set();

        while (currentId) {
            if (visited.has(currentId)) {
                // Circular reference in nesting depth calculation
                return -1; // Error state
            }
            visited.add(currentId);

            const parent = this.objects.get(currentId);
            if (!parent || !parent.isContainer) break;

            depth++;
            currentId = parent.parentContainer;
        }

        return depth;
    }

    /**
     * Get all nested containers within a parent container (recursive)
     * @param {string} parentContainerId - Parent container ID
     * @returns {Array<Object>} Array of nested container objects
     */
    getNestedContainers(parentContainerId) {
        const children = this.getChildObjects(parentContainerId);
        const nestedContainers = [];

        children.forEach(child => {
            if (child.isContainer) {
                nestedContainers.push(child);
                // Recursively get nested containers within this child container
                const deeplyNested = this.getNestedContainers(child.id);
                nestedContainers.push(...deeplyNested);
            }
        });

        return nestedContainers;
    }

    /**
     * Add object to root ordering (called when object is created without parent)
     */
    addToRootOrder(objectId) {
        if (!this.rootChildrenOrder.includes(objectId)) {
            this.rootChildrenOrder.push(objectId);
        }
    }

    /**
     * Remove object from root ordering (called when object is deleted or moved to container)
     */
    removeFromRootOrder(objectId) {
        const index = this.rootChildrenOrder.indexOf(objectId);
        if (index !== -1) {
            this.rootChildrenOrder.splice(index, 1);
        }
    }

    /**
     * Remove object from parent's childrenOrder (called on object deletion)
     */
    removeFromParentOrder(objectId, parentId) {
        if (!parentId) {
            this.removeFromRootOrder(objectId);
            return;
        }

        const parent = this.objects.get(parentId);
        if (parent && parent.childrenOrder && Array.isArray(parent.childrenOrder)) {
            const index = parent.childrenOrder.indexOf(objectId);
            if (index !== -1) {
                parent.childrenOrder.splice(index, 1);
            }
        }
    }
    /**
     * Trigger layout update on a container based on its mode (hug or layout)
     */
    _triggerContainerLayoutUpdate(containerId, callbacks) {
        const container = this.objects.get(containerId);
        if (!container) return;

        if (container.containerMode === 'hug' || container.isHug) {
            callbacks.updateHugContainerSize(containerId);
        } else if (container.containerMode === 'layout' || (container.autoLayout?.enabled)) {
            // SINGLE FUNNEL: updateLayout() handles resize internally (SceneLayoutManager line 335)
            callbacks.updateLayout(containerId);
        }
    }
}

// Export
window.SceneHierarchyManager = SceneHierarchyManager;
