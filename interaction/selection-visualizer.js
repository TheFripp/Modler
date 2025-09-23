// Modler V2 - Selection Visual Effects
// Handles all selection visual feedback - edge highlights, materials, configuration
// Target: ~200 lines - extracted from SelectionController

class SelectionVisualizer {
    constructor() {
        // Visual state
        this.edgeHighlights = new Map(); // object -> edge mesh

        // Materials
        this.edgeMaterial = null;
        this.containerEdgeMaterial = null;

        this.createEdgeMaterials();

    }

    /**
     * Initialize with ConfigurationManager (called after ConfigurationManager is ready)
     */
    initializeWithConfigurationManager() {
        this.registerConfigurationCallbacks();
    }

    /**
     * Create multiple overlapping lines for visible line width effect
     */
    createThickLineGroup(edgeGeometry, lineWidth, material) {
        const group = new THREE.Group();

        // Create multiple offset lines for thickness effect
        const offsets = this.generateLineOffsets(lineWidth);

        offsets.forEach(offset => {
            const offsetGeometry = this.offsetEdgeGeometry(edgeGeometry, offset);
            const lineMesh = new THREE.LineSegments(offsetGeometry, material);
            group.add(lineMesh);
        });

        return group;
    }

    /**
     * Generate offset patterns for line thickness
     */
    generateLineOffsets(lineWidth) {
        const offsets = [{ x: 0, y: 0, z: 0 }]; // Center line

        if (lineWidth > 1) {
            const step = 0.002; // Increased offset step for more visible thickness
            const maxOffset = (lineWidth - 1) * step;

            // Add offset lines in a cross pattern
            for (let i = 1; i <= lineWidth - 1; i++) {
                const offset = i * step;
                offsets.push(
                    { x: offset, y: 0, z: 0 },
                    { x: -offset, y: 0, z: 0 },
                    { x: 0, y: offset, z: 0 },
                    { x: 0, y: -offset, z: 0 }
                );
            }
        }

        return offsets;
    }

    /**
     * Create offset copy of edge geometry
     */
    offsetEdgeGeometry(edgeGeometry, offset) {
        const geometry = edgeGeometry.clone();
        const positions = geometry.getAttribute('position');
        const array = positions.array;

        for (let i = 0; i < array.length; i += 3) {
            array[i] += offset.x;
            array[i + 1] += offset.y;
            array[i + 2] += offset.z;
        }

        positions.needsUpdate = true;
        return geometry;
    }

    /**
     * Create edge materials with configuration values
     */
    createEdgeMaterials() {
        // Access ConfigurationManager directly from modlerV2Components since window.modlerComponents
        // might not be set yet during initialization
        const configManager = (typeof modlerV2Components !== 'undefined') ?
            modlerV2Components.configurationManager :
            window.modlerComponents?.configurationManager;
        const selectionConfig = configManager ?
            configManager.get('visual.selection') :
            { color: '#ff6600', lineWidth: 2, opacity: 0.8, renderOrder: 999 };


        // Convert hex color to Three.js color
        const colorHex = parseInt(selectionConfig.color.replace('#', ''), 16);

        this.edgeMaterial = new THREE.LineBasicMaterial({
            color: colorHex,
            transparent: true,
            opacity: selectionConfig.opacity,
            linewidth: selectionConfig.lineWidth // Store for reference even if not used
        });

        // Store line width separately for multiple line rendering
        this.edgeMaterial.lineWidth = selectionConfig.lineWidth;

        // Ensure selection wireframes render on top
        this.edgeMaterial.renderOrder = selectionConfig.renderOrder || 999;


        // Create faded container material for step-in context using container color
        const containerConfig = configManager ?
            configManager.get('visual.containers') :
            { wireframeColor: '#00ff00', lineWidth: 1, opacity: 0.8, renderOrder: 998 };

        const containerColorHex = parseInt(containerConfig.wireframeColor.replace('#', ''), 16);

        this.containerEdgeMaterial = new THREE.LineBasicMaterial({
            color: containerColorHex,
            transparent: true,
            opacity: containerConfig.opacity * 0.25, // 25% opacity for container context
            linewidth: containerConfig.lineWidth // Store for reference even if not used
        });

        // Store line width separately for multiple line rendering
        this.containerEdgeMaterial.lineWidth = containerConfig.lineWidth;
        this.containerEdgeMaterial.renderOrder = containerConfig.renderOrder || 998;
    }

    /**
     * Register for configuration change callbacks
     */
    registerConfigurationCallbacks() {
        // Access ConfigurationManager directly from modlerV2Components since window.modlerComponents
        // isn't set until after initializeApplication() completes
        const configManager = (typeof modlerV2Components !== 'undefined') ?
            modlerV2Components.configurationManager :
            window.modlerComponents?.configurationManager;

        if (!configManager) {
            console.error('🔧 SelectionVisualizer: ConfigurationManager not available for subscription');
            return;
        }

        // Subscribe to selection configuration changes
        configManager.subscribe('visual.selection.color', (newValue) => {
            this.updateMaterialProperty('color', newValue);
        });

        configManager.subscribe('visual.selection.lineWidth', (newValue) => {
            this.updateMaterialProperty('linewidth', newValue);
        });

        configManager.subscribe('visual.selection.opacity', (newValue) => {
            this.updateMaterialProperty('opacity', newValue);
        });

        // Subscribe to container configuration changes
        configManager.subscribe('visual.containers.wireframeColor', (newValue) => {
            this.updateContainerMaterialProperty('color', newValue);
        });

        configManager.subscribe('visual.containers.lineWidth', (newValue) => {
            this.updateContainerMaterialProperty('linewidth', newValue);
        });

        configManager.subscribe('visual.containers.opacity', (newValue) => {
            this.updateContainerMaterialProperty('opacity', newValue);
        });

    }

    /**
     * Update material property and refresh all edge highlights
     */
    updateMaterialProperty(property, value) {

        if (!this.edgeMaterial) return;

        if (property === 'color') {
            const colorHex = parseInt(value.replace('#', ''), 16);
            this.edgeMaterial.color.setHex(colorHex);
        } else if (property === 'linewidth') {
            this.edgeMaterial.lineWidth = value;
            // Force refresh of all existing edge highlights to update line width
            this.refreshAllEdgeHighlights();
        } else {
            this.edgeMaterial[property] = value;
        }

        this.edgeMaterial.needsUpdate = true;

        // Force refresh of all existing edge highlights
        this.refreshAllEdgeHighlights();
    }

    /**
     * Update container material property
     */
    updateContainerMaterialProperty(property, value) {
        if (!this.containerEdgeMaterial) return;

        if (property === 'color') {
            const colorHex = parseInt(value.replace('#', ''), 16);
            this.containerEdgeMaterial.color.setHex(colorHex);
        } else if (property === 'opacity') {
            this.containerEdgeMaterial.opacity = value * 0.25; // Keep 25% opacity for container context
        } else if (property === 'linewidth') {
            this.containerEdgeMaterial.lineWidth = value;
            // Force refresh of container wireframes
            this.refreshContainerWireframes();
        } else {
            this.containerEdgeMaterial[property] = value;
        }

        this.containerEdgeMaterial.needsUpdate = true;

        // Force refresh of container wireframes if needed
        this.refreshContainerWireframes();
    }

    /**
     * Refresh all existing edge highlights with updated material properties
     */
    refreshAllEdgeHighlights() {

        // Recreate all edge highlights to apply new line width
        const objectsToRefresh = Array.from(this.edgeHighlights.keys());

        // Remove existing highlights
        objectsToRefresh.forEach(object => {
            this.removeEdgeHighlight(object);
        });

        // Recreate with new settings
        objectsToRefresh.forEach(object => {
            this.createEdgeHighlight(object);
        });
    }

    /**
     * Refresh container wireframes with updated material properties
     */
    refreshContainerWireframes() {
        // Container wireframes are handled by the UnifiedContainerManager
        // This is a placeholder for future container material refresh functionality
        const containerCrudManager = window.modlerComponents?.containerCrudManager;
        if (containerCrudManager && containerCrudManager.refreshMaterials) {
            containerCrudManager.refreshMaterials();
        }
    }

    /**
     * Create edge highlight for selected object
     */
    createEdgeHighlight(object) {

        // Don't create duplicate highlights
        if (this.edgeHighlights.has(object)) {
            return;
        }

        // Only highlight objects with geometry
        if (!object.geometry) {
            return;
        }

        // Skip highlighting for objects marked as hidden from selection (e.g., box creation objects)
        if (object.userData && object.userData.hideFromSelection) {
            return;
        }

        // Skip edge highlights for containers - they use their own green wireframes
        const sceneController = window.modlerComponents?.sceneController;
        if (sceneController) {
            const objectData = sceneController.getObjectByMesh(object);
            if (objectData && objectData.isContainer) {
                return; // Don't create orange edge highlights for containers
            }
        }

        try {
            // Force geometry bounds recalculation to reflect any push operations
            if (object.geometry) {
                object.geometry.computeBoundingBox();
            }

            // Create multiple line effect for visible line width
            const edgeGeometry = new THREE.EdgesGeometry(object.geometry);
            const edgeMesh = this.createThickLineGroup(edgeGeometry, this.edgeMaterial.lineWidth || 2, this.edgeMaterial);

            // Clean up temporary geometry
            edgeGeometry.dispose();


            // Make edge highlights non-raycastable to prevent interference with selection
            edgeMesh.raycast = () => {}; // Disable raycasting for edge highlights

            // Copy transform from original object
            edgeMesh.position.copy(object.position);
            edgeMesh.rotation.copy(object.rotation);
            edgeMesh.scale.copy(object.scale);

            // Add small Y-offset to prevent z-fighting with floor grid when objects are at ground level
            edgeMesh.position.y += 0.001;

            // Add to scene - ensure wireframe is in same parent as object
            if (object.parent) {
                object.parent.add(edgeMesh);
            }

            // Store reference for cleanup
            this.edgeHighlights.set(object, edgeMesh);

            // Register with MeshSynchronizer for automatic position synchronization
            const meshSynchronizer = window.modlerComponents?.meshSynchronizer;
            if (meshSynchronizer) {
                meshSynchronizer.registerRelatedMesh(object, edgeMesh, 'selection', {
                    enabled: true,
                    description: 'Selection wireframe',
                    geometryUpdater: (mainMesh, relatedMesh) => {
                        // Update wireframe geometry when main object geometry changes
                        return this.updateWireframeGeometry(mainMesh, relatedMesh);
                    }
                });
            }

        } catch (error) {
            console.warn('Failed to create edge highlight for object:', object.name, error);
        }
    }

    /**
     * Remove edge highlight for object
     */
    removeEdgeHighlight(object) {

        const edgeMesh = this.edgeHighlights.get(object);
        if (edgeMesh) {
            // Unregister from MeshSynchronizer first
            const meshSynchronizer = window.modlerComponents?.meshSynchronizer;
            if (meshSynchronizer) {
                meshSynchronizer.unregisterRelatedMesh(object, edgeMesh, 'selection');
            }

            // Remove from scene
            if (edgeMesh.parent) {
                edgeMesh.parent.remove(edgeMesh);
            }

            // Clean up geometry - handle group-based highlights
            if (edgeMesh.isGroup) {
                while (edgeMesh.children.length > 0) {
                    const child = edgeMesh.children[0];
                    edgeMesh.remove(child);
                    if (child.geometry) child.geometry.dispose();
                }
            } else if (edgeMesh.geometry) {
                edgeMesh.geometry.dispose();
            }

            // Remove from tracking
            this.edgeHighlights.delete(object);
        } else {
        }
    }

    /**
     * Show container wireframe if object is a container
     */
    showContainerWireframe(object) {
        if (!object) return;

        // Check if this is a container through SceneController
        const sceneController = window.modlerComponents?.sceneController;
        const containerCrudManager = window.modlerComponents?.containerCrudManager;

        if (sceneController && containerCrudManager) {
            const objectData = sceneController.getObjectByMesh(object);
            if (objectData && objectData.isContainer) {

                // Use unified ContainerManager for proper visibility handling
                containerCrudManager.showContainer(objectData.id);
            }
        }
    }

    /**
     * Hide container wireframe if object is a container
     */
    hideContainerWireframe(object) {
        if (!object) return;

        // Check if this is a container through SceneController
        const sceneController = window.modlerComponents?.sceneController;
        const containerCrudManager = window.modlerComponents?.containerCrudManager;

        if (sceneController && containerCrudManager) {
            const objectData = sceneController.getObjectByMesh(object);
            if (objectData && objectData.isContainer) {
                // Use unified ContainerManager for proper visibility handling
                containerCrudManager.hideContainer(objectData.id);
            }
        }
    }

    /**
     * Update visual feedback for an object
     */
    updateObjectVisual(object, isSelected) {
        if (isSelected) {
            this.createEdgeHighlight(object);
            this.showContainerWireframe(object);
            this.showContainerPaddingVisualization(object);
        } else {
            this.removeEdgeHighlight(object);
            this.hideContainerWireframe(object);
            this.hideContainerPaddingVisualization(object);
        }
    }

    /**
     * Show padding visualization for selected container (only if in layout mode)
     */
    showContainerPaddingVisualization(object) {
        if (!object) return;

        const sceneController = window.modlerComponents?.sceneController;
        const containerCrudManager = window.modlerComponents?.containerCrudManager;

        if (sceneController && containerCrudManager) {
            const objectData = sceneController.getObjectByMesh(object);
            if (objectData && objectData.isContainer) {
                // Show padding visualization only if container has layout enabled AND non-zero padding
                if (objectData.autoLayout && objectData.autoLayout.enabled &&
                    containerCrudManager.hasNonZeroPadding && containerCrudManager.hasNonZeroPadding(objectData)) {
                    containerCrudManager.showPaddingVisualization(objectData.id);
                }
            }
        }
    }

    /**
     * Hide padding visualization for deselected container
     */
    hideContainerPaddingVisualization(object) {
        if (!object) return;

        const sceneController = window.modlerComponents?.sceneController;
        const containerCrudManager = window.modlerComponents?.containerCrudManager;

        if (sceneController && containerCrudManager) {
            const objectData = sceneController.getObjectByMesh(object);
            if (objectData && objectData.isContainer) {
                // Always hide padding when container is deselected
                containerCrudManager.hidePaddingVisualization(objectData.id);
            }
        }
    }

    /**
     * Clean up all visual effects
     */
    destroy() {
        // Clean up all edge highlights
        for (const [, edgeMesh] of this.edgeHighlights) {
            if (edgeMesh.parent) {
                edgeMesh.parent.remove(edgeMesh);
            }

            // Handle group-based highlights
            if (edgeMesh.isGroup) {
                while (edgeMesh.children.length > 0) {
                    const child = edgeMesh.children[0];
                    edgeMesh.remove(child);
                    if (child.geometry) child.geometry.dispose();
                }
            } else if (edgeMesh.geometry) {
                edgeMesh.geometry.dispose();
            }
        }
        this.edgeHighlights.clear();

    }


    /**
     * Update wireframe geometry when main object geometry changes
     * Used as geometryUpdater callback for MeshSynchronizer
     */
    updateWireframeGeometry(mainMesh, relatedMesh) {
        try {
            if (!mainMesh || !mainMesh.geometry || !relatedMesh) {
                return false;
            }

            // For group-based approach, recreate the entire group
            if (relatedMesh.isGroup) {
                // Clear existing children
                while (relatedMesh.children.length > 0) {
                    const child = relatedMesh.children[0];
                    relatedMesh.remove(child);
                    if (child.geometry) child.geometry.dispose();
                }

                // Create new edge geometry and rebuild group
                const edgeGeometry = new THREE.EdgesGeometry(mainMesh.geometry);
                const lineWidth = relatedMesh.material?.lineWidth || this.edgeMaterial?.lineWidth || 2;

                const offsets = this.generateLineOffsets(lineWidth);
                offsets.forEach(offset => {
                    const offsetGeometry = this.offsetEdgeGeometry(edgeGeometry, offset);
                    const lineMesh = new THREE.LineSegments(offsetGeometry, this.edgeMaterial);
                    relatedMesh.add(lineMesh);
                });

                edgeGeometry.dispose();
            } else {
                // Fallback for non-group meshes
                return false;
            }

            // Sync transform as well (position, rotation, scale)
            relatedMesh.position.copy(mainMesh.position);
            relatedMesh.rotation.copy(mainMesh.rotation);
            relatedMesh.scale.copy(mainMesh.scale);

            return true;
        } catch (error) {
            console.warn('Failed to update wireframe geometry:', error);
            return false;
        }
    }
}

// Export for use in main application
window.SelectionVisualizer = SelectionVisualizer;