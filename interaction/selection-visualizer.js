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

        console.log('SelectionVisualizer initialized - handles all selection visual feedback');
    }

    /**
     * Initialize with ConfigurationManager (called after ConfigurationManager is ready)
     */
    initializeWithConfigurationManager() {
        this.registerConfigurationCallbacks();
        console.log('SelectionVisualizer connected to ConfigurationManager');
    }

    /**
     * Create edge materials with configuration values
     */
    createEdgeMaterials() {
        const configManager = window.modlerComponents?.configurationManager;
        const selectionConfig = configManager ?
            configManager.get('visual.selection') :
            { color: '#ff6600', lineWidth: 2, opacity: 0.8, renderOrder: 999 };

        // Convert hex color to Three.js color
        const colorHex = parseInt(selectionConfig.color.replace('#', ''), 16);

        this.edgeMaterial = new THREE.LineBasicMaterial({
            color: colorHex,
            linewidth: selectionConfig.lineWidth,
            transparent: true,
            opacity: selectionConfig.opacity
        });

        // Ensure selection wireframes render on top
        this.edgeMaterial.renderOrder = selectionConfig.renderOrder || 999;

        // Create faded container material for step-in context using container color
        const containerConfig = configManager ?
            configManager.get('visual.containers') :
            { wireframeColor: '#00ff00', lineWidth: 1, opacity: 0.8, renderOrder: 998 };

        const containerColorHex = parseInt(containerConfig.wireframeColor.replace('#', ''), 16);

        this.containerEdgeMaterial = new THREE.LineBasicMaterial({
            color: containerColorHex,
            linewidth: containerConfig.lineWidth,
            transparent: true,
            opacity: containerConfig.opacity * 0.25 // 25% opacity for container context
        });
        this.containerEdgeMaterial.renderOrder = containerConfig.renderOrder || 998;
    }

    /**
     * Register for configuration change callbacks
     */
    registerConfigurationCallbacks() {
        const configManager = window.modlerComponents?.configurationManager;
        if (!configManager) return;

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
        } else {
            this.edgeMaterial[property] = value;
        }

        this.edgeMaterial.needsUpdate = true;
        console.log(`Selection material ${property} updated to:`, value);
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
        } else {
            this.containerEdgeMaterial[property] = value;
        }

        this.containerEdgeMaterial.needsUpdate = true;
        console.log(`Container material ${property} updated to:`, value);
    }

    /**
     * Create edge highlight for selected object
     */
    createEdgeHighlight(object) {
        console.log('🔶 CREATE EDGE HIGHLIGHT called for:', object.name || 'unnamed', {
            hasExisting: this.edgeHighlights.has(object),
            hasGeometry: !!object.geometry,
            hideFromSelection: object.userData?.hideFromSelection
        });

        // Don't create duplicate highlights
        if (this.edgeHighlights.has(object)) {
            console.log('⏭️ SKIPPED: Edge highlight already exists');
            return;
        }

        // Only highlight objects with geometry
        if (!object.geometry) {
            console.log('⏭️ SKIPPED: No geometry');
            return;
        }

        // Skip highlighting for objects marked as hidden from selection (e.g., box creation objects)
        if (object.userData && object.userData.hideFromSelection) {
            console.log('⏭️ SKIPPED: hideFromSelection flag');
            return;
        }

        // Skip edge highlights for containers - they use their own green wireframes
        const sceneController = window.modlerComponents?.sceneController;
        if (sceneController) {
            const objectData = sceneController.getObjectByMesh(object);
            if (objectData && objectData.isContainer) {
                console.log('⏭️ SKIPPED: Container uses own green wireframes, not edge highlights');
                return; // Don't create orange edge highlights for containers
            }
        }

        try {
            // Force geometry bounds recalculation to reflect any push operations
            if (object.geometry) {
                object.geometry.computeBoundingBox();
            }

            // Always use EdgesGeometry for consistency with updateWireframeGeometry
            // This ensures initial creation matches the update mechanism
            const edgeGeometry = new THREE.EdgesGeometry(object.geometry);
            const edgeMesh = new THREE.LineSegments(edgeGeometry, this.edgeMaterial);

            // Make edge highlights non-raycastable to prevent interference with selection
            edgeMesh.raycast = () => {}; // Disable raycasting for edge highlights

            // Copy transform from original object
            edgeMesh.position.copy(object.position);
            edgeMesh.rotation.copy(object.rotation);
            edgeMesh.scale.copy(object.scale);

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
        console.log('🗑️ REMOVE EDGE HIGHLIGHT called for:', object.name || 'unnamed', {
            hasEdgeMesh: this.edgeHighlights.has(object),
            totalHighlights: this.edgeHighlights.size
        });

        const edgeMesh = this.edgeHighlights.get(object);
        if (edgeMesh) {
            console.log('✅ REMOVING edge highlight mesh:', {
                edgeMeshName: edgeMesh.name,
                edgeMeshVisible: edgeMesh.visible
            });
            // Unregister from MeshSynchronizer first
            const meshSynchronizer = window.modlerComponents?.meshSynchronizer;
            if (meshSynchronizer) {
                meshSynchronizer.unregisterRelatedMesh(object, edgeMesh, 'selection');
            }

            // Remove from scene
            if (edgeMesh.parent) {
                edgeMesh.parent.remove(edgeMesh);
            }

            // Clean up geometry
            if (edgeMesh.geometry) {
                edgeMesh.geometry.dispose();
            }

            // Remove from tracking
            this.edgeHighlights.delete(object);
        } else {
            console.log('ℹ️ NO EDGE HIGHLIGHT to remove (expected for containers)');
        }
    }

    /**
     * Show container wireframe if object is a container
     */
    showContainerWireframe(object) {
        if (!object) return;

        // Check if this is a container through SceneController
        const sceneController = window.modlerComponents?.sceneController;
        const containerManager = window.modlerComponents?.unifiedContainerManager;

        if (sceneController && containerManager) {
            const objectData = sceneController.getObjectByMesh(object);
            if (objectData && objectData.isContainer) {
                console.log('🔍 ATTEMPTING TO SHOW CONTAINER:', {
                    containerName: objectData.name,
                    meshVisibleBefore: object.visible,
                    containerId: objectData.id
                });

                // Use unified ContainerManager for proper visibility handling
                const showResult = containerManager.showContainer(objectData.id);

                console.log('🔍 CONTAINER SHOW RESULT:', {
                    containerName: objectData.name,
                    showResult,
                    meshVisibleAfter: object.visible,
                    containerState: containerManager.containerStates?.get(objectData.id)
                });

                // Only update UI state if the show operation actually succeeded
                if (showResult !== false) {
                    // Set material opacity for visual feedback
                    if (object.material) {
                        object.material.opacity = 0.8;
                    }
                }
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
        const containerManager = window.modlerComponents?.unifiedContainerManager;

        if (sceneController && containerManager) {
            const objectData = sceneController.getObjectByMesh(object);
            if (objectData && objectData.isContainer) {
                // Use unified ContainerManager for proper visibility handling
                const hideResult = containerManager.hideContainer(objectData.id);
            }
        }
    }

    /**
     * Update visual feedback for an object
     */
    updateObjectVisual(object, isSelected) {
        console.log('🎨 UPDATE OBJECT VISUAL:', {
            objectName: object.name || 'unnamed',
            isSelected,
            isContainer: object.userData?.isContainer || 'unknown'
        });

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
        const containerManager = window.modlerComponents?.unifiedContainerManager;

        if (sceneController && containerManager) {
            const objectData = sceneController.getObjectByMesh(object);
            if (objectData && objectData.isContainer) {
                // Show padding visualization if container has layout enabled OR non-zero padding values
                if ((objectData.autoLayout && objectData.autoLayout.enabled) ||
                    this.hasNonZeroPadding(objectData)) {
                    containerManager.showPaddingVisualization(objectData.id);
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
        const containerManager = window.modlerComponents?.unifiedContainerManager;

        if (sceneController && containerManager) {
            const objectData = sceneController.getObjectByMesh(object);
            if (objectData && objectData.isContainer) {
                containerManager.hidePaddingVisualization(objectData.id);
            }
        }
    }

    /**
     * Clean up all visual effects
     */
    destroy() {
        // Clean up all edge highlights
        for (const [object, edgeMesh] of this.edgeHighlights) {
            if (edgeMesh.parent) {
                edgeMesh.parent.remove(edgeMesh);
            }
            if (edgeMesh.geometry) {
                edgeMesh.geometry.dispose();
            }
        }
        this.edgeHighlights.clear();

        console.log('SelectionVisualizer destroyed');
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
     * Update wireframe geometry when main object geometry changes
     * Used as geometryUpdater callback for MeshSynchronizer
     */
    updateWireframeGeometry(mainMesh, relatedMesh) {
        try {
            if (!mainMesh || !mainMesh.geometry || !relatedMesh) {
                return false;
            }

            // Create new EdgesGeometry from updated main mesh geometry
            const newEdgesGeometry = new THREE.EdgesGeometry(mainMesh.geometry);

            // Dispose old geometry
            if (relatedMesh.geometry) {
                relatedMesh.geometry.dispose();
            }

            // Apply new geometry
            relatedMesh.geometry = newEdgesGeometry;

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