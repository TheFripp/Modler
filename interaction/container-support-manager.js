// Modler V2 - Container Support Manager
// Unified coordination of all container-related meshes and visual feedback
// Provides padding visualization, enhanced face highlighting, and push tool integration

class ContainerSupportManager {
    constructor() {
        // Track padding visualization boxes
        this.paddingBoxes = new Map(); // containerId -> paddingMesh

    }

    /**
     * Register comprehensive container support structures
     * @param {Object} containerData - Container object data from SceneController
     * @param {Object} options - Configuration options
     * @returns {boolean} Success status
     */
    registerContainerSupport(containerData, options = {}) {
        if (!containerData || !containerData.mesh) {
            console.warn('ContainerSupportManager: Invalid container data provided');
            return false;
        }

        const containerMesh = containerData.mesh;
        const meshSynchronizer = window.modlerComponents?.meshSynchronizer;

        if (!meshSynchronizer) {
            console.warn('ContainerSupportManager: MeshSynchronizer not available');
            return false;
        }

        // Find existing collision mesh
        const collisionMesh = containerMesh.children.find(child =>
            child.userData.isContainerCollision
        );

        if (collisionMesh) {
            // Register collision mesh for comprehensive synchronization
            meshSynchronizer.registerRelatedMesh(containerMesh, collisionMesh, 'transform', {
                enabled: true,
                relativeToParent: true,
                offset: new THREE.Vector3(0, 0, 0),
                description: 'Container collision mesh'
            });

            // Ensure collision mesh has proper userData for face highlighting
            collisionMesh.userData.isContainerCollision = true;
            collisionMesh.userData.containerType = 'collision';
            collisionMesh.userData.parentContainer = containerData.id;

            // Force geometry and matrix updates for proper raycasting
            collisionMesh.geometry.computeBoundingBox();
            collisionMesh.geometry.computeBoundingSphere();
            collisionMesh.updateMatrixWorld(true);

            // Ensure collision mesh is visible and has proper opacity for raycasting
            collisionMesh.visible = true;
            if (collisionMesh.material) {
                collisionMesh.material.transparent = true;
                collisionMesh.material.opacity = 0.01; // Very low but not zero for raycasting
            }

        }

        // Create and register padding visualization
        this.createPaddingVisualization(containerData);

        return true;
    }

    /**
     * Create padding visualization box showing container content area
     * @param {Object} containerData - Container object data
     * @returns {THREE.Mesh|null} Created padding visualization mesh
     */
    createPaddingVisualization(containerData) {
        if (!containerData || !containerData.mesh) return null;

        // Remove existing padding visualization if it exists
        this.removePaddingVisualization(containerData.id);

        // Calculate padding dimensions
        const paddingSize = this.calculatePaddingSize(containerData);
        if (!paddingSize) return null;

        // Create padding box geometry
        const paddingGeometry = new THREE.BoxGeometry(
            paddingSize.width,
            paddingSize.height,
            paddingSize.depth
        );

        // Create wireframe material matching container color scheme
        const configManager = window.modlerComponents?.configurationManager;
        const containerConfig = configManager ?
            configManager.get('visual.containers') :
            { wireframeColor: '#00ff00', lineWidth: 1, opacity: 0.8 };

        const containerColorHex = parseInt(containerConfig.wireframeColor.replace('#', ''), 16);

        const paddingMaterial = new THREE.LineBasicMaterial({
            color: containerColorHex,
            linewidth: containerConfig.lineWidth,
            transparent: true,
            opacity: containerConfig.opacity * 0.6 // 60% of container opacity
        });

        // Create wireframe edges from geometry
        const edgeGeometry = new THREE.EdgesGeometry(paddingGeometry);
        const paddingMesh = new THREE.LineSegments(edgeGeometry, paddingMaterial);

        // Make it non-interactive
        paddingMesh.raycast = () => {}; // Disable raycasting
        paddingMesh.userData.isPaddingVisualization = true;
        paddingMesh.userData.containerId = containerData.id;

        // Position padding box at container center (accounting for padding offset)
        const paddingOffset = this.calculatePaddingOffset(containerData);
        paddingMesh.position.copy(paddingOffset);

        // Add to container mesh as child
        containerData.mesh.add(paddingMesh);

        // Register with MeshSynchronizer for automatic position/scale sync
        const meshSynchronizer = window.modlerComponents?.meshSynchronizer;
        if (meshSynchronizer) {
            meshSynchronizer.registerRelatedMesh(containerData.mesh, paddingMesh, 'transform', {
                enabled: true,
                relativeToParent: true,
                description: 'Container padding visualization'
            });
        }

        // Store reference for updates
        this.paddingBoxes.set(containerData.id, paddingMesh);

        // Initially hidden - only show when container is selected
        paddingMesh.visible = false;


        return paddingMesh;
    }

    /**
     * Calculate padding box size based on actual child object bounds plus padding
     * @param {Object} containerData - Container object data
     * @returns {Object|null} Padding size {width, height, depth} or null if invalid
     */
    calculatePaddingSize(containerData) {
        if (!containerData || !containerData.mesh) return null;

        // Get child objects inside the container
        const sceneController = window.modlerComponents?.sceneController;
        if (!sceneController) return null;

        const children = sceneController.getChildObjects(containerData.id);
        if (!children || children.length === 0) {
            // No children, use small default size
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
                    // Convert to world space and then to container local space
                    const worldPosition = child.mesh.getWorldPosition(new THREE.Vector3());
                    const containerWorldPosition = containerData.mesh.getWorldPosition(new THREE.Vector3());
                    const localPosition = worldPosition.sub(containerWorldPosition);

                    const size = box.getSize(new THREE.Vector3());

                    minX = Math.min(minX, localPosition.x - size.x / 2);
                    maxX = Math.max(maxX, localPosition.x + size.x / 2);
                    minY = Math.min(minY, localPosition.y - size.y / 2);
                    maxY = Math.max(maxY, localPosition.y + size.y / 2);
                    minZ = Math.min(minZ, localPosition.z - size.z / 2);
                    maxZ = Math.max(maxZ, localPosition.z + size.z / 2);
                }
            }
        });

        // If no valid bounds found, use default
        if (minX === Infinity) {
            return { width: 0.5, height: 0.5, depth: 0.5 };
        }

        // Calculate actual content size
        const contentWidth = maxX - minX;
        const contentHeight = maxY - minY;
        const contentDepth = maxZ - minZ;

        // Get padding configuration (default to 0)
        const padding = containerData.autoLayout?.padding || {};
        const paddingLeft = padding.left || 0;
        const paddingRight = padding.right || 0;
        const paddingTop = padding.top || 0;
        const paddingBottom = padding.bottom || 0;
        const paddingFront = padding.front || 0;
        const paddingBack = padding.back || 0;

        // Padding box should show the content area (what's inside the padding)
        const width = Math.max(0.1, contentWidth);
        const height = Math.max(0.1, contentHeight);
        const depth = Math.max(0.1, contentDepth);

        return { width, height, depth };
    }

    /**
     * Calculate padding box position offset within container
     * @param {Object} containerData - Container object data
     * @returns {THREE.Vector3} Padding offset position
     */
    calculatePaddingOffset(containerData) {
        // Get child objects to calculate their center
        const sceneController = window.modlerComponents?.sceneController;
        if (!sceneController) return new THREE.Vector3(0, 0, 0);

        const children = sceneController.getChildObjects(containerData.id);
        if (!children || children.length === 0) {
            return new THREE.Vector3(0, 0, 0);
        }

        // Calculate center of all child objects
        let totalX = 0, totalY = 0, totalZ = 0;
        let validCount = 0;

        children.forEach(child => {
            if (child.mesh) {
                const worldPosition = child.mesh.getWorldPosition(new THREE.Vector3());
                const containerWorldPosition = containerData.mesh.getWorldPosition(new THREE.Vector3());
                const localPosition = worldPosition.sub(containerWorldPosition);

                totalX += localPosition.x;
                totalY += localPosition.y;
                totalZ += localPosition.z;
                validCount++;
            }
        });

        if (validCount === 0) {
            return new THREE.Vector3(0, 0, 0);
        }

        // Return center position of child objects relative to container
        return new THREE.Vector3(
            totalX / validCount,
            totalY / validCount,
            totalZ / validCount
        );
    }

    /**
     * Update padding visualization when container properties change
     * @param {Object} containerData - Container object data
     * @returns {boolean} Success status
     */
    updatePaddingVisualization(containerData) {
        if (!containerData) return false;

        const existingPaddingMesh = this.paddingBoxes.get(containerData.id);
        if (!existingPaddingMesh) {
            // Create new padding visualization if it doesn't exist
            return this.createPaddingVisualization(containerData) !== null;
        }

        // Update existing padding visualization
        const paddingSize = this.calculatePaddingSize(containerData);
        const paddingOffset = this.calculatePaddingOffset(containerData);

        if (!paddingSize) return false;

        // Update geometry
        const newGeometry = new THREE.BoxGeometry(
            paddingSize.width,
            paddingSize.height,
            paddingSize.depth
        );

        // Dispose old geometry
        existingPaddingMesh.geometry.dispose();
        existingPaddingMesh.geometry = newGeometry;

        // Update position
        existingPaddingMesh.position.copy(paddingOffset);


        return true;
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
     * Hide padding visualization for deselected container
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
     * Remove padding visualization for container
     * @param {number} containerId - Container ID
     * @returns {boolean} Success status
     */
    removePaddingVisualization(containerId) {
        const paddingMesh = this.paddingBoxes.get(containerId);
        if (!paddingMesh) return false;

        // Unregister from MeshSynchronizer
        const meshSynchronizer = window.modlerComponents?.meshSynchronizer;
        if (meshSynchronizer) {
            // Find container mesh to unregister relationship
            const sceneController = window.modlerComponents?.sceneController;
            if (sceneController) {
                const containerData = sceneController.getObject(containerId);
                if (containerData && containerData.mesh) {
                    meshSynchronizer.unregisterRelatedMesh(containerData.mesh, paddingMesh, 'transform');
                }
            }
        }

        // Remove from scene
        if (paddingMesh.parent) {
            paddingMesh.parent.remove(paddingMesh);
        }

        // Dispose geometry and material
        if (paddingMesh.geometry) {
            paddingMesh.geometry.dispose();
        }
        if (paddingMesh.material) {
            paddingMesh.material.dispose();
        }

        // Dispose edge geometry if it exists
        const edgeGeometry = paddingMesh.geometry;
        if (edgeGeometry) {
            edgeGeometry.dispose();
        }

        // Remove from tracking
        this.paddingBoxes.delete(containerId);

        return true;
    }

    /**
     * Clean up all container support structures
     * @param {Object} containerData - Container object data
     * @returns {boolean} Success status
     */
    cleanupContainerSupport(containerData) {
        if (!containerData) return false;

        // Remove padding visualization
        this.removePaddingVisualization(containerData.id);

        // Unregister collision mesh from MeshSynchronizer
        const meshSynchronizer = window.modlerComponents?.meshSynchronizer;
        if (meshSynchronizer && containerData.mesh) {
            const collisionMesh = containerData.mesh.children.find(child =>
                child.userData.isContainerCollision
            );
            if (collisionMesh) {
                meshSynchronizer.unregisterRelatedMesh(containerData.mesh, collisionMesh, 'position');
            }
        }

        return true;
    }

    /**
     * Update padding visualization when child objects change
     * @param {number} containerId - Container ID
     * @returns {boolean} Success status
     */
    updatePaddingVisualizationForChildChanges(containerId) {
        const sceneController = window.modlerComponents?.sceneController;
        if (!sceneController) return false;

        const containerData = sceneController.getObject(containerId);
        if (!containerData) return false;

        return this.updatePaddingVisualization(containerData);
    }

    /**
     * Check if container has padding visualization
     * @param {number} containerId - Container ID
     * @returns {boolean} True if padding visualization exists
     */
    hasPaddingVisualization(containerId) {
        return this.paddingBoxes.has(containerId);
    }

    /**
     * Get padding visualization mesh for container
     * @param {number} containerId - Container ID
     * @returns {THREE.Mesh|null} Padding visualization mesh or null
     */
    getPaddingVisualization(containerId) {
        return this.paddingBoxes.get(containerId) || null;
    }

    /**
     * Clean up all resources
     */
    destroy() {
        // Clean up all padding visualizations
        for (const [containerId, paddingMesh] of this.paddingBoxes) {
            this.removePaddingVisualization(containerId);
        }
        this.paddingBoxes.clear();

    }
}

// Export for use in main application
window.ContainerSupportManager = ContainerSupportManager;