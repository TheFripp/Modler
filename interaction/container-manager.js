// Modler V2 - Unified Container Manager
// Simplified container system with direct wireframe interaction
// Eliminates collision meshes, dynamic reparenting, and multiple overlapping managers

class UnifiedContainerManager {
    constructor() {
        // Track container states and wireframe visibility
        this.containerStates = new Map(); // containerId -> {wireframeVisible, isSelected}

        // Track padding visualizations
        this.paddingBoxes = new Map(); // containerId -> paddingMesh

        // Debounce rapid visibility changes
        this.debounceDelay = 100;
        this.pendingOperations = new Map();

    }

    /**
     * Register a new container with unified management
     * @param {Object} containerData - Container object data from SceneController
     * @returns {boolean} Success status
     */
    registerContainer(containerData) {
        if (!containerData || !containerData.mesh) {
            console.warn('UnifiedContainerManager: Invalid container data provided');
            return false;
        }

        const containerId = containerData.id;

        // Initialize container state tracking
        this.containerStates.set(containerId, {
            wireframeVisible: false,
            isSelected: false
        });

        // Ensure container wireframe has proper interactive mesh for face detection
        this.setupContainerInteraction(containerData);

        // Create padding visualization (initially hidden)
        this.createPaddingVisualization(containerData);

        // Register with MeshSynchronizer for coordinated updates
        this.registerMeshSynchronization(containerData);

        // Sync interactive mesh position after container setup
        setTimeout(() => {
            const syncResult = this.syncInteractiveMeshPosition(containerId);
        }, 100);

        return true;
    }

    /**
     * Setup container interaction using wireframe faces instead of collision meshes
     * @param {Object} containerData - Container object data
     */
    setupContainerInteraction(containerData) {
        const containerMesh = containerData.mesh;

        // Find existing interactive mesh (created by LayoutGeometry and added to scene)
        const scene = window.modlerComponents?.sceneFoundation?.scene;
        let interactiveMesh = null;

        if (scene) {
            // Look for interactive mesh in scene that references this container
            scene.traverse((child) => {
                if (child.userData?.isContainerInteractive &&
                    child.userData?.containerMesh === containerMesh) {
                    interactiveMesh = child;
                }
            });
        }

        // Create interactive mesh if needed
        if (!interactiveMesh) {
            interactiveMesh = this.createInteractiveMeshForContainer(containerData);
        }

        if (interactiveMesh) {
            // Ensure interactive mesh has proper properties for face detection
            interactiveMesh.userData.isContainerInteractive = true;
            interactiveMesh.userData.containerType = 'interactive';
            interactiveMesh.userData.parentContainer = containerData.id;

            // Ensure proper material properties for raycasting
            if (interactiveMesh.material) {
                interactiveMesh.material.transparent = true;
                interactiveMesh.material.opacity = 0.0; // Invisible but raycastable
                interactiveMesh.material.visible = true;
                interactiveMesh.material.side = THREE.DoubleSide;
                interactiveMesh.material.depthTest = false;
            }

            // High render order for raycasting priority
            interactiveMesh.renderOrder = 1000;
            interactiveMesh.visible = true;

            // Force geometry updates for proper raycasting
            interactiveMesh.geometry.computeBoundingBox();
            interactiveMesh.geometry.computeBoundingSphere();
            interactiveMesh.updateMatrixWorld(true);

        } else {
            console.error('UnifiedContainerManager: Failed to create interactive mesh for container', containerData.name);
        }
    }

    /**
     * Create interactive mesh for container
     */
    createInteractiveMeshForContainer(containerData) {
        const containerMesh = containerData.mesh;

        // Get container geometry from wireframe
        let containerGeometry;

        // First try to get parameters from container geometry
        if (containerMesh.geometry && containerMesh.geometry.parameters) {
            const params = containerMesh.geometry.parameters;
            if (params.width !== undefined) {
                containerGeometry = new THREE.BoxGeometry(params.width, params.height, params.depth);
            }
        }

        // If no parameters, calculate from bounding box
        if (!containerGeometry) {
            containerMesh.geometry.computeBoundingBox();
            const bbox = containerMesh.geometry.boundingBox;

            if (bbox) {
                const size = bbox.getSize(new THREE.Vector3());
                containerGeometry = new THREE.BoxGeometry(size.x, size.y, size.z);
            } else {
                // Last resort: use default size
                console.warn('Could not determine container dimensions, using default size');
                containerGeometry = new THREE.BoxGeometry(2, 2, 2);
            }
        }

        // Create interactive face geometry - LARGER than container to extend beyond child objects
        const faceGeometry = new THREE.BoxGeometry(
            containerGeometry.parameters.width * 1.1,  // 10% larger to extend beyond child objects
            containerGeometry.parameters.height * 1.1,
            containerGeometry.parameters.depth * 1.1
        );

        // Create invisible material for selection
        const interactiveMaterial = new THREE.MeshBasicMaterial({
            transparent: true,
            opacity: 0.0,
            visible: true,
            side: THREE.DoubleSide,
            depthTest: false,
            wireframe: false
        });

        // Create interactive mesh
        const interactiveMesh = new THREE.Mesh(faceGeometry, interactiveMaterial);
        interactiveMesh.visible = true;
        interactiveMesh.renderOrder = 1000;
        interactiveMesh.userData.isContainerInteractive = true;
        interactiveMesh.userData.containerType = 'interactive';
        interactiveMesh.userData.parentContainer = containerData.id;

        // Add to scene for independent visibility
        const scene = window.modlerComponents?.sceneFoundation?.scene;
        if (scene) {
            scene.add(interactiveMesh);

            // Update matrices before positioning
            containerMesh.updateMatrixWorld(true);

            // Position at container world position
            const containerWorldPosition = containerMesh.getWorldPosition(new THREE.Vector3());
            interactiveMesh.position.copy(containerWorldPosition);

            // Store reference to container for position syncing
            interactiveMesh.userData.containerMesh = containerMesh;
        } else {
            console.warn('Scene not available during migration, adding as container child');
            containerMesh.add(interactiveMesh);
            interactiveMesh.position.set(0, 0, 0);
        }

        // Update matrices for proper raycasting
        interactiveMesh.updateMatrixWorld(true);


        return interactiveMesh;
    }

    /**
     * Preserve and restore world transform when changing parent
     */
    preserveWorldTransform(object, newParent) {
        const worldPosition = new THREE.Vector3();
        const worldQuaternion = new THREE.Quaternion();
        const worldScale = new THREE.Vector3();

        object.getWorldPosition(worldPosition);
        object.getWorldQuaternion(worldQuaternion);
        object.getWorldScale(worldScale);

        newParent.add(object);

        if (newParent.type !== 'Scene') {
            newParent.worldToLocal(worldPosition);
        }

        object.position.copy(worldPosition);
        object.quaternion.copy(worldQuaternion);
        object.scale.copy(worldScale);
    }

    /**
     * Show container wireframe and mark as selected
     * @param {number} containerId - Container ID
     * @param {boolean} bypassDebounce - Skip debounce for layout-triggered visibility
     * @returns {boolean} Success status
     */
    showContainer(containerId, bypassDebounce = false) {
        const state = this.containerStates.get(containerId);
        if (!state) {
            console.log('🔍 SHOW CONTAINER FAILED: No state found for', containerId);
            return false;
        }

        // Debounce rapid operations (unless bypassed for layout updates)
        if (!bypassDebounce && !this.shouldAllowOperation(containerId, 'show')) {
            console.log('🔍 SHOW CONTAINER DEBOUNCED for', containerId);
            return false;
        }

        const sceneController = window.modlerComponents?.sceneController;
        const containerData = sceneController?.getObject(containerId);
        if (!containerData?.mesh) {
            console.log('🔍 SHOW CONTAINER FAILED: No mesh found for', containerId);
            return false;
        }

        const containerMesh = containerData.mesh;

        console.log('🔍 SHOW CONTAINER STARTING:', {
            containerId,
            containerName: containerData.name,
            meshVisibleBefore: containerMesh.visible,
            stateWireframeVisible: state.wireframeVisible
        });

        // Show container wireframe components
        containerMesh.visible = true; // Ensure parent container is visible
        delete containerMesh.raycast; // Enable raycasting

        // Show wireframe components specifically
        containerMesh.traverse((child) => {
            const isContainerWireframe = (child === containerMesh ||
                                        (child.type === 'LineSegments' && child.name === containerData.name));

            if (isContainerWireframe) {
                child.visible = true;
                delete child.raycast; // Enable raycasting
            }

            // RESTORE CHILD OBJECTS: Move back from scene to container hierarchy
            const childObjectData = sceneController.getObjectByMesh(child);
            if (childObjectData && !child.userData.isPaddingVisualization) {
                child.visible = true;

                // If child was moved to scene during hide, restore it to container
                if (child.userData.originalParent === containerMesh && child.parent !== containerMesh) {
                    this.preserveWorldTransform(child, containerMesh);
                    delete child.userData.originalParent;
                }
            }
        });

        // Restore scene children that belong to container
        const scene = window.modlerComponents?.sceneFoundation?.scene;
        if (scene) {
            const sceneChildren = scene.children.slice(); // Copy array to avoid modification during iteration
            sceneChildren.forEach(child => {
                // Check if this scene child was originally a child of this container
                if (child.userData.originalParent === containerMesh) {
                    this.preserveWorldTransform(child, containerMesh);
                    child.visible = true;
                    delete child.userData.originalParent;
                }
            });
        }

        // Re-enable interactive mesh for face highlighting
        if (scene) {
            scene.traverse((child) => {
                if (child.userData?.isContainerInteractive &&
                    child.userData?.parentContainer === containerId) {
                    child.visible = true;
                    delete child.raycast; // Restore raycasting by removing override
                }
            });
        }

        // Show padding visualization if container has layout
        if (containerData.autoLayout?.enabled) {
            this.showPaddingVisualization(containerId);
        }

        // Update state
        state.wireframeVisible = true;
        state.isSelected = true;

        console.log('🔍 SHOW CONTAINER COMPLETE:', {
            containerId,
            containerName: containerData.name,
            meshVisibleAfter: containerMesh.visible,
            stateWireframeVisible: state.wireframeVisible,
            success: true
        });

        return true;
    }

    /**
     * Hide container wireframe and mark as deselected
     * @param {number} containerId - Container ID
     * @returns {boolean} Success status
     */
    hideContainer(containerId) {

        const state = this.containerStates.get(containerId);
        if (!state) {
            console.warn(`❌ HIDE FAILED: Container ${containerId} not found in containerStates`, {
                availableContainers: Array.from(this.containerStates.keys())
            });
            return false;
        }

        // Debounce rapid operations
        if (!this.shouldAllowOperation(containerId, 'hide')) {
            console.warn(`❌ HIDE FAILED: Operation debounced for container ${containerId}`);
            return false;
        }

        const sceneController = window.modlerComponents?.sceneController;
        const containerData = sceneController?.getObject(containerId);
        if (!containerData?.mesh) {
            console.warn(`❌ HIDE FAILED: No container data or mesh found`, {
                hasSceneController: !!sceneController,
                hasContainerData: !!containerData,
                hasMesh: !!containerData?.mesh
            });
            return false;
        }


        const containerMesh = containerData.mesh;

        // Hide wireframe while keeping child objects visible
        const childObjects = [];

        containerMesh.traverse((child) => {
            // Identify actual child objects (not container-related meshes)
            const childObjectData = sceneController.getObjectByMesh(child);


            // Exclude container wireframe itself
            const isContainerWireframe = (child === containerMesh ||
                                        (child.type === 'LineSegments' && child.name === containerData.name));

            if (childObjectData &&
                !child.userData.isContainerInteractive &&
                !child.userData.isPaddingVisualization &&
                !isContainerWireframe) {
                childObjects.push(child);
            } else {
            }
        });

        // Hide only wireframe components

        // Find and hide only wireframe components
        let wireframeHidden = false;
        containerMesh.traverse((child) => {
            const isContainerWireframe = (child === containerMesh ||
                                        (child.type === 'LineSegments' && child.name === containerData.name));

            if (isContainerWireframe) {
                child.visible = false;
                child.raycast = () => {}; // Disable raycasting
                wireframeHidden = true;
            }
        });

        // Move child objects to scene level during hide
        const scene = window.modlerComponents?.sceneFoundation?.scene;


        childObjects.forEach(childMesh => {
            if (scene && childMesh.parent !== scene) {
                childMesh.userData.originalParent = childMesh.parent;
                this.preserveWorldTransform(childMesh, scene);
                childMesh.visible = true;
            }
        });

        // Don't hide the container mesh itself - just its wireframe components
        // This keeps child objects visible since their parent remains visible
        if (!wireframeHidden) {
            // Fallback: if no wireframe components found, hide the entire mesh
            containerMesh.visible = false;
            containerMesh.raycast = () => {}; // Disable raycasting

            // Re-show child objects explicitly to keep them visible

            childObjects.forEach(childMesh => {
                childMesh.visible = true;
            });
        }

        // Disable interactive mesh when hidden
        if (scene) {
            scene.traverse((child) => {
                if (child.userData?.isContainerInteractive &&
                    child.userData?.parentContainer === containerId) {
                    child.visible = false;
                    child.raycast = () => {}; // Disable raycasting
                }
            });
        }

        // Hide padding visualization
        this.hidePaddingVisualization(containerId);

        // Update state
        state.wireframeVisible = false;
        state.isSelected = false;

        return true;
    }

    /**
     * Create padding visualization wireframe
     * @param {Object} containerData - Container object data
     * @returns {THREE.Mesh|null} Created padding mesh
     */
    createPaddingVisualization(containerData) {
        if (!containerData || !containerData.mesh) return null;

        // Remove existing padding visualization
        this.removePaddingVisualization(containerData.id);

        // Only create for containers with layout enabled OR padding values set
        if (!containerData.autoLayout?.enabled && !this.hasNonZeroPadding(containerData)) {
            return null;
        }

        const paddingSize = this.calculatePaddingSize(containerData);
        if (!paddingSize) return null;

        // Create wireframe geometry
        const paddingGeometry = new THREE.BoxGeometry(
            paddingSize.width,
            paddingSize.height,
            paddingSize.depth
        );

        // Get container color configuration
        const configManager = window.modlerComponents?.configurationManager;
        const containerConfig = configManager ?
            configManager.get('visual.containers') :
            { wireframeColor: '#00ff00', lineWidth: 1, opacity: 0.8 };

        const colorHex = parseInt(containerConfig.wireframeColor.replace('#', ''), 16);

        // Create wireframe material
        const paddingMaterial = new THREE.LineBasicMaterial({
            color: colorHex,
            linewidth: containerConfig.lineWidth || 1,
            transparent: true,
            opacity: (containerConfig.opacity || 0.8) * 0.6 // 60% of container opacity
        });

        // Create wireframe mesh
        const edgeGeometry = new THREE.EdgesGeometry(paddingGeometry);
        const paddingMesh = new THREE.LineSegments(edgeGeometry, paddingMaterial);

        // Make non-interactive
        paddingMesh.raycast = () => {};
        paddingMesh.userData.isPaddingVisualization = true;
        paddingMesh.userData.containerId = containerData.id;

        // Position at content center
        const paddingOffset = this.calculatePaddingOffset(containerData);
        paddingMesh.position.copy(paddingOffset);

        // Add to container as child
        containerData.mesh.add(paddingMesh);

        // Store reference
        this.paddingBoxes.set(containerData.id, paddingMesh);

        // Initially hidden - only show when container is selected
        paddingMesh.visible = false;

        return paddingMesh;
    }

    /**
     * Check if container has any non-zero padding values
     * @param {Object} containerData - Container object data
     * @returns {boolean} True if any padding value is greater than 0
     */
    hasNonZeroPadding(containerData) {
        if (!containerData.autoLayout?.padding) return false;

        const padding = containerData.autoLayout.padding;
        return padding.top > 0 || padding.bottom > 0 ||
               padding.left > 0 || padding.right > 0 ||
               padding.front > 0 || padding.back > 0;
    }

    /**
     * Calculate padding visualization size based on child objects
     * @param {Object} containerData - Container object data
     * @returns {Object|null} Size {width, height, depth} or null
     */
    calculatePaddingSize(containerData) {
        const sceneController = window.modlerComponents?.sceneController;
        if (!sceneController) return null;

        const children = sceneController.getChildObjects(containerData.id);
        if (!children || children.length === 0) {
            return { width: 0.5, height: 0.5, depth: 0.5 };
        }

        // Calculate bounding box of all child objects
        let minX = Infinity, maxX = -Infinity;
        let minY = Infinity, maxY = -Infinity;
        let minZ = Infinity, maxZ = -Infinity;

        children.forEach(child => {
            if (child.mesh && child.mesh.geometry) {
                child.mesh.geometry.computeBoundingBox();
                const box = child.mesh.geometry.boundingBox;
                if (box) {
                    // Get child position relative to container
                    const childWorldPos = child.mesh.getWorldPosition(new THREE.Vector3());
                    const containerWorldPos = containerData.mesh.getWorldPosition(new THREE.Vector3());
                    const localPos = childWorldPos.sub(containerWorldPos);

                    const size = box.getSize(new THREE.Vector3());

                    minX = Math.min(minX, localPos.x - size.x / 2);
                    maxX = Math.max(maxX, localPos.x + size.x / 2);
                    minY = Math.min(minY, localPos.y - size.y / 2);
                    maxY = Math.max(maxY, localPos.y + size.y / 2);
                    minZ = Math.min(minZ, localPos.z - size.z / 2);
                    maxZ = Math.max(maxZ, localPos.z + size.z / 2);
                }
            }
        });

        if (minX === Infinity) {
            return { width: 0.5, height: 0.5, depth: 0.5 };
        }

        return {
            width: Math.max(0.1, maxX - minX),
            height: Math.max(0.1, maxY - minY),
            depth: Math.max(0.1, maxZ - minZ)
        };
    }

    /**
     * Calculate padding offset position (center of child objects)
     * @param {Object} containerData - Container object data
     * @returns {THREE.Vector3} Offset position
     */
    calculatePaddingOffset(containerData) {
        const sceneController = window.modlerComponents?.sceneController;
        if (!sceneController) return new THREE.Vector3(0, 0, 0);

        const children = sceneController.getChildObjects(containerData.id);
        if (!children || children.length === 0) {
            return new THREE.Vector3(0, 0, 0);
        }

        // Calculate center of child objects
        let totalX = 0, totalY = 0, totalZ = 0;
        let validCount = 0;

        children.forEach(child => {
            if (child.mesh) {
                const childWorldPos = child.mesh.getWorldPosition(new THREE.Vector3());
                const containerWorldPos = containerData.mesh.getWorldPosition(new THREE.Vector3());
                const localPos = childWorldPos.sub(containerWorldPos);

                totalX += localPos.x;
                totalY += localPos.y;
                totalZ += localPos.z;
                validCount++;
            }
        });

        if (validCount === 0) {
            return new THREE.Vector3(0, 0, 0);
        }

        return new THREE.Vector3(
            totalX / validCount,
            totalY / validCount,
            totalZ / validCount
        );
    }

    /**
     * Show padding visualization for selected container
     * @param {number} containerId - Container ID
     * @returns {boolean} Success status
     */
    showPaddingVisualization(containerId) {
        const paddingMesh = this.paddingBoxes.get(containerId);
        if (paddingMesh) {
            paddingMesh.visible = true;
            return true;
        }
        return false;
    }

    /**
     * Hide padding visualization
     * @param {number} containerId - Container ID
     * @returns {boolean} Success status
     */
    hidePaddingVisualization(containerId) {
        const paddingMesh = this.paddingBoxes.get(containerId);
        if (paddingMesh) {
            paddingMesh.visible = false;
            return true;
        }
        return false;
    }

    /**
     * Update padding visualization when container changes
     * @param {number} containerId - Container ID
     * @returns {boolean} Success status
     */
    updatePaddingVisualization(containerId) {
        const sceneController = window.modlerComponents?.sceneController;
        if (!sceneController) return false;

        const containerData = sceneController.getObject(containerId);
        if (!containerData) return false;

        // Recreate padding visualization with updated dimensions
        return this.createPaddingVisualization(containerData) !== null;
    }

    /**
     * Remove padding visualization
     * @param {number} containerId - Container ID
     * @returns {boolean} Success status
     */
    removePaddingVisualization(containerId) {
        const paddingMesh = this.paddingBoxes.get(containerId);
        if (!paddingMesh) return false;

        // Remove from scene
        if (paddingMesh.parent) {
            paddingMesh.parent.remove(paddingMesh);
        }

        // Dispose resources
        if (paddingMesh.geometry) {
            paddingMesh.geometry.dispose();
        }
        if (paddingMesh.material) {
            paddingMesh.material.dispose();
        }

        // Remove from tracking
        this.paddingBoxes.delete(containerId);
        return true;
    }

    /**
     * Register mesh synchronization for container-related meshes
     * @param {Object} containerData - Container object data
     */
    registerMeshSynchronization(containerData) {
        const meshSynchronizer = window.modlerComponents?.meshSynchronizer;
        if (!meshSynchronizer) return;

        const containerMesh = containerData.mesh;

        // Register interactive mesh synchronization
        const interactiveMesh = containerMesh.children.find(child =>
            child.userData.isContainerInteractive
        );

        if (interactiveMesh) {
            meshSynchronizer.registerRelatedMesh(containerMesh, interactiveMesh, 'transform', {
                enabled: true,
                relativeToParent: true,
                offset: new THREE.Vector3(0, 0, 0),
                description: 'Container interactive faces'
            });
        }

        // Padding mesh will be registered when created
    }

    /**
     * Remove container and clean up all related resources
     * @param {number} containerId - Container ID
     * @returns {boolean} Success status
     */
    removeContainer(containerId) {
        // Remove padding visualization
        this.removePaddingVisualization(containerId);

        // Remove scene-level interactive mesh
        this.removeInteractiveMesh(containerId);

        // Clean up state tracking
        this.containerStates.delete(containerId);
        this.pendingOperations.delete(containerId);

        return true;
    }

    /**
     * Remove scene-level interactive mesh for container
     * @param {number} containerId - Container ID
     * @returns {boolean} Success status
     */
    removeInteractiveMesh(containerId) {
        const scene = window.modlerComponents?.sceneFoundation?.scene;
        if (!scene) return false;

        let interactiveMesh = null;
        scene.traverse((child) => {
            if (child.userData?.isContainerInteractive &&
                child.userData?.parentContainer === containerId) {
                interactiveMesh = child;
            }
        });

        if (interactiveMesh) {
            // Remove from scene
            scene.remove(interactiveMesh);

            // Dispose geometry and material
            if (interactiveMesh.geometry) {
                interactiveMesh.geometry.dispose();
            }
            if (interactiveMesh.material) {
                interactiveMesh.material.dispose();
            }

            return true;
        }

        return false;
    }

    /**
     * Check if operation should be allowed (debouncing)
     * @param {number} containerId - Container ID
     * @param {string} operation - Operation type ('show' or 'hide')
     * @returns {boolean} True if operation should proceed
     */
    shouldAllowOperation(containerId, operation) {
        const now = Date.now();
        const pending = this.pendingOperations.get(containerId);

        if (pending && (now - pending.timestamp) < this.debounceDelay) {
            // Only block same operation types
            if (pending.operation === operation) {
                return false;
            }
        }

        this.pendingOperations.set(containerId, {
            operation: operation,
            timestamp: now
        });

        return true;
    }

    /**
     * Check if container is currently selected
     * @param {number} containerId - Container ID
     * @returns {boolean} True if container is selected
     */
    isContainerSelected(containerId) {
        const state = this.containerStates.get(containerId);
        return state ? state.isSelected : false;
    }

    /**
     * Get container state
     * @param {number} containerId - Container ID
     * @returns {Object|null} Container state or null
     */
    getContainerState(containerId) {
        return this.containerStates.get(containerId) || null;
    }

    /**
     * Sync interactive mesh position with container position
     * @param {number} containerId - Container ID
     * @returns {boolean} Success status
     */
    syncInteractiveMeshPosition(containerId) {
        const sceneController = window.modlerComponents?.sceneController;
        if (!sceneController) return false;

        const containerData = sceneController.getObject(containerId);
        if (!containerData?.mesh) return false;

        // Find interactive mesh in scene
        const scene = window.modlerComponents?.sceneFoundation?.scene;
        if (!scene) return false;

        let interactiveMesh = null;
        scene.traverse((child) => {
            if (child.userData?.isContainerInteractive &&
                child.userData?.parentContainer === containerId) {
                interactiveMesh = child;
            }
        });

        if (interactiveMesh) {
            // Update matrices before positioning
            containerData.mesh.updateMatrixWorld(true);

            // Update interactive mesh position to match container world position
            const containerWorldPosition = containerData.mesh.getWorldPosition(new THREE.Vector3());
            const containerWorldRotation = containerData.mesh.getWorldQuaternion(new THREE.Quaternion());
            const containerWorldScale = containerData.mesh.getWorldScale(new THREE.Vector3());

            // Copy transform directly
            interactiveMesh.position.copy(containerWorldPosition);
            interactiveMesh.quaternion.copy(containerWorldRotation);

            // Use base scale with 1.1 multiplier
            const baseScale = 1.1; // 10% larger for extending beyond children
            interactiveMesh.scale.set(baseScale, baseScale, baseScale);

            // Update matrices after changes
            interactiveMesh.updateMatrixWorld(true);

            return true;
        }

        return false;
    }

    /**
     * Sync all interactive mesh positions
     * Called when multiple containers may have moved
     */
    syncAllInteractiveMeshPositions() {
        const sceneController = window.modlerComponents?.sceneController;
        if (!sceneController) return;

        const allObjects = sceneController.getAllObjects();
        let syncedCount = 0;

        allObjects.forEach(objectData => {
            if (objectData.isContainer && this.syncInteractiveMeshPosition(objectData.id)) {
                syncedCount++;
            }
        });

        if (syncedCount > 0) {
            }

        return syncedCount;
    }


    /**
     * Ensure all containers have interactive meshes
     */
    migrateAllContainers() {
        const sceneController = window.modlerComponents?.sceneController;
        if (!sceneController) return 0;

        const allObjects = sceneController.getAllObjects();
        let migratedCount = 0;

        allObjects.forEach(objectData => {
            if (objectData.isContainer && objectData.mesh) {
                const hasInteractiveMesh = objectData.mesh.children.some(child =>
                    child.userData?.isContainerInteractive
                );

                if (!hasInteractiveMesh) {
                    this.createInteractiveMeshForContainer(objectData);
                    migratedCount++;
                }
            }
        });

        if (migratedCount > 0) {
            setTimeout(() => this.syncAllInteractiveMeshPositions(), 200);
        }

        return migratedCount;
    }

    /**
     * Clean up all resources
     */
    destroy() {
        // Clean up all padding visualizations
        for (const [containerId] of this.paddingBoxes) {
            this.removePaddingVisualization(containerId);
        }

        // Clear all tracking
        this.containerStates.clear();
        this.paddingBoxes.clear();
        this.pendingOperations.clear();

    }
}

// Export for use in main application
window.UnifiedContainerManager = UnifiedContainerManager;

