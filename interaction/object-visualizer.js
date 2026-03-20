// Modler V2 - Object Visualization Base Class
// Handles shared visualization behaviors for all objects (regular objects and containers)
// Provides foundation for edge highlights, material updates, transform sync, and face highlighting

class ObjectVisualizer {
    constructor() {
        // Visual state tracking
        this.objectStates = new Map(); // object -> current state
        this.edgeHighlights = new Map(); // object -> edge mesh
        // faceHighlights removed - now using pre-created support meshes

        // New unified systems
        this.geometryFactory = new GeometryFactory();
        // Use global MaterialManager instance for proper config callback tracking
        this.materialManager = window.modlerComponents?.materialManager || new MaterialManager();
        this.resourcePool = new VisualizationResourcePool();

        // Base materials - now managed by MaterialManager
        this.edgeMaterial = null;
        this.faceHighlightMaterial = null;

        // Possible states for all objects
        this.validStates = ['normal', 'selected', 'hovered', 'multi-selected'];

        this.createBaseMaterials();
    }

    /**
     * Initialize with ConfigurationManager
     */
    initializeWithConfigurationManager() {
        this.registerConfigurationCallbacks();
    }

    /**
     * Create base materials used by all objects
     */
    createBaseMaterials() {
        // Use MaterialManager for centralized material creation
        this.edgeMaterial = this.materialManager.createSelectionEdgeMaterial();
        this.faceHighlightMaterial = this.materialManager.createFaceHighlightMaterial();
    }

    /**
     * Get SupportMeshFactory (centralized visibility gateway)
     */
    getSupportMeshFactory() {
        return window.modlerComponents?.supportMeshFactory;
    }

    /**
     * Get configuration manager (centralized access)
     */
    getConfigManager() {
        return (typeof modlerV2Components !== 'undefined') ?
            modlerV2Components.configurationManager :
            window.modlerComponents?.configurationManager;
    }

    /**
     * Register for configuration change callbacks
     */
    registerConfigurationCallbacks() {
        // MaterialManager handles material updates automatically via its own callbacks
        // But we need to recreate thick line groups when lineWidth changes
        const configManager = this.getConfigManager();
        if (configManager) {
            // When lineWidth changes, recreate all thick line groups with new width
            configManager.subscribe('visual.selection.lineWidth', (newValue) => {
                this.refreshAllHighlights();
            });
        }
    }

    /**
     * Set object state (main API method)
     */
    setState(object, state) {
        if (!object || !this.validStates.includes(state)) {
            console.warn('ObjectVisualizer: Invalid state or object', { object: object?.name, state });
            return false;
        }

        const currentState = this.objectStates.get(object) || 'normal';

        // No change needed
        if (currentState === state) return true;

        // Update state tracking
        this.objectStates.set(object, state);

        // Apply visual changes based on state
        this.applyStateVisuals(object, state, currentState);

        return true;
    }

    /**
     * Apply visual changes for state transition
     */
    applyStateVisuals(object, newState, oldState) {
        // Remove old state visuals
        this.clearStateVisuals(object, oldState);

        // Apply new state visuals
        switch (newState) {
            case 'selected':
            case 'multi-selected':
                this.createEdgeHighlight(object);
                break;
            case 'hovered':
                this.createHoverEffect(object);
                break;
            case 'normal':
                // Nothing to add for normal state
                break;
        }

        // REMOVED: notifyContainerVisualizerOfStateChange() call
        // Dimming is now handled exclusively by NavigationController → ContainerVisualizer
    }

    /**
     * Clear visuals for a specific state
     */
    clearStateVisuals(object, state) {
        switch (state) {
            case 'selected':
            case 'multi-selected':
                this.removeEdgeHighlight(object);
                break;
            case 'hovered':
                this.removeHoverEffect(object);
                break;
        }

        // REMOVED: notifyContainerVisualizerOfStateChange() call
        // Dimming is now handled exclusively by NavigationController → ContainerVisualizer
    }

    /**
     * Create edge highlight for object - uses pre-created support meshes (CREATE ONCE architecture)
     */
    createEdgeHighlight(object) {
        // Don't create duplicate highlights
        if (this.edgeHighlights.has(object)) return;

        // Only highlight objects with geometry
        if (!object.geometry) return;

        // Skip objects marked as hidden from selection
        if (object.userData && object.userData.hideFromSelection) return;

        try {
            // Check if this is a container - delegate to ContainerVisualizer
            const sceneController = window.modlerComponents?.sceneController;
            if (sceneController) {
                const objectData = sceneController.getObjectByMesh(object);
                if (objectData && objectData.isContainer) {
                    // Containers are handled by ContainerVisualizer unified system
                    return;
                }
            }

            // CREATE ONCE ARCHITECTURE: Use pre-created support mesh for regular objects
            const supportMeshes = object.userData.supportMeshes;
            if (supportMeshes && supportMeshes.selectionWireframe) {
                // Show via centralized visibility API
                const factory = this.getSupportMeshFactory();
                if (factory) {
                    factory.showSelectionWireframe(object);
                } else {
                    supportMeshes.selectionWireframe.visible = true;
                }

                // Store reference for tracking
                this.edgeHighlights.set(object, supportMeshes.selectionWireframe);

                return;
            }

            // All objects should have support meshes from SupportMeshFactory at creation time
            console.warn('ObjectVisualizer: Object missing support meshes, cannot create edge highlight:', object.name);

        } catch (error) {
            console.warn('Failed to create edge highlight for object:', object.name, error);
        }
    }

    /**
     * Remove edge highlight for object - uses pre-created support meshes (CREATE ONCE architecture)
     */
    removeEdgeHighlight(object) {
        // Check if this is a container - delegate to ContainerVisualizer
        const sceneController = window.modlerComponents?.sceneController;
        if (sceneController) {
            const objectData = sceneController.getObjectByMesh(object);
            if (objectData && objectData.isContainer) {
                // Containers are handled by ContainerVisualizer unified system
                return;
            }
        }

        const edgeMesh = this.edgeHighlights.get(object);
        if (edgeMesh) {
            // CREATE ONCE ARCHITECTURE: Check if this is a pre-created support mesh
            const supportMeshes = object.userData.supportMeshes;
            if (supportMeshes && supportMeshes.selectionWireframe === edgeMesh) {
                // Hide via centralized visibility API
                const factory = this.getSupportMeshFactory();
                if (factory) {
                    factory.hideSelectionWireframe(object);
                } else {
                    supportMeshes.selectionWireframe.visible = false;
                }

                // Remove from tracking
                this.edgeHighlights.delete(object);

                return;
            }

            // Unexpected: edge mesh tracked but not matching support mesh
            console.warn('ObjectVisualizer: Tracked edge mesh does not match support mesh, cleaning up:', object.name);
            this.edgeHighlights.delete(object);
        }
    }

    /**
     * Create hover effect (can be overridden)
     */
    createHoverEffect(object) {
        // Default implementation - could be material highlight, glow, etc.
        // For now, just track the state
    }

    /**
     * Remove hover effect
     */
    removeHoverEffect(object) {
        // Default implementation
    }

    /**
     * Show face highlight for tools (push, move, etc.)
     * ARCHITECTURE: Uses pre-created support mesh (create once, show/hide pattern)
     */
    showFaceHighlight(object, face, color = null) {
        if (!object || !face) return;

        // ARCHITECTURE: Use pre-created support mesh
        const supportMeshes = object.userData?.supportMeshes;
        if (!supportMeshes?.faceHighlight) {
            console.warn('ObjectVisualizer: Object missing support meshes');
            return;
        }

        // Position the pre-created face highlight for this face
        const supportMeshFactory = window.modlerComponents?.supportMeshFactory;
        if (supportMeshFactory) {
            const hit = { object, face };
            supportMeshFactory.positionFaceHighlightForHit(supportMeshes.faceHighlight, hit);
        }

        // Update color only if explicitly provided
        // Material already has correct color and opacity from MaterialManager config
        if (supportMeshes.faceHighlight.material && color !== null) {
            supportMeshes.faceHighlight.material.color.setHex(color);
        }
        // Don't copy object's material color - it overwrites the configured color AND opacity
        // The pooled material from SupportMeshFactory already has the correct configured color

        // Show via centralized visibility API
        const factory = this.getSupportMeshFactory();
        if (factory) {
            factory.showFaceHighlight(object);
        } else {
            supportMeshes.faceHighlight.visible = true;
        }
    }

    /**
     * Hide face highlight
     * ARCHITECTURE: Hides pre-created support mesh (no disposal needed)
     */
    hideFaceHighlight(object, face) {
        if (!object || !face) return;

        // ARCHITECTURE: Simply hide via centralized visibility API
        const factory = this.getSupportMeshFactory();
        if (factory) {
            factory.hideFaceHighlight(object);
        } else {
            const supportMeshes = object.userData?.supportMeshes;
            if (supportMeshes?.faceHighlight) {
                supportMeshes.faceHighlight.visible = false;
            }
        }
    }

    /**
     * Update object transform (position, rotation, scale changes)
     */
    updateTransform(object) {
        // Update any associated highlights
        const edgeMesh = this.edgeHighlights.get(object);
        if (edgeMesh) {
            edgeMesh.position.copy(object.position);
            edgeMesh.rotation.copy(object.rotation);
            edgeMesh.scale.copy(object.scale);
            edgeMesh.position.y += 0.001; // Maintain Y-offset
        }
    }

    /**
     * Update object geometry (for push tool, dimension changes, etc.)
     */
    updateGeometry(object) {
        // Recreate edge highlight with new geometry
        if (this.edgeHighlights.has(object)) {
            this.removeEdgeHighlight(object);
            this.createEdgeHighlight(object);
        }
    }

    /**
     * Create thick line group for visible line width
     */
    createThickLineGroup(edgeGeometry, lineWidth, material) {
        const group = this.resourcePool.getGroup();

        // Create multiple offset lines for thickness effect
        const offsets = this.generateLineOffsets(lineWidth);

        offsets.forEach(offset => {
            const offsetGeometry = this.offsetEdgeGeometry(edgeGeometry, offset);
            const lineMesh = this.resourcePool.getLineMesh(offsetGeometry, material);
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
            const step = 0.002;
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
        if (!edgeGeometry) {
            console.warn('ObjectVisualizer: Cannot offset null edgeGeometry');
            return null;
        }

        const geometry = edgeGeometry.clone();
        if (!geometry) {
            console.warn('ObjectVisualizer: Failed to clone edgeGeometry');
            return null;
        }

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

    // MeshSynchronizer methods removed - support meshes are now self-contained children

    /**
     * Update wireframe geometry when main object changes
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

                // Create new edge geometry using GeometryFactory for pooling
                const edgeGeometry = this.geometryFactory.createEdgeGeometry(mainMesh);
                const lineWidth = relatedMesh.material?.lineWidth || this.edgeMaterial?.lineWidth || 2;

                const offsets = this.generateLineOffsets(lineWidth);
                offsets.forEach(offset => {
                    const offsetGeometry = this.offsetEdgeGeometry(edgeGeometry, offset);
                    const lineMesh = this.resourcePool.getLineMesh(offsetGeometry, this.edgeMaterial);
                    relatedMesh.add(lineMesh);
                });

                // Return geometry to pool for reuse
                this.geometryFactory.returnEdgeGeometry(edgeGeometry);
            }

            // Sync transform
            relatedMesh.position.copy(mainMesh.position);
            relatedMesh.rotation.copy(mainMesh.rotation);
            relatedMesh.scale.copy(mainMesh.scale);
            relatedMesh.position.y += 0.001; // Maintain Y-offset

            return true;
        } catch (error) {
            console.warn('Failed to update wireframe geometry:', error);
            return false;
        }
    }

    /**
     * Clean up highlight mesh (handles groups and individual meshes)
     */
    cleanupHighlightMesh(mesh) {
        if (mesh.isGroup) {
            while (mesh.children.length > 0) {
                const child = mesh.children[0];
                mesh.remove(child);
                if (child.geometry) child.geometry.dispose();
            }
        } else if (mesh.geometry) {
            mesh.geometry.dispose();
        }
    }

    /**
     * Refresh all highlights (called when materials change)
     */
    refreshAllHighlights() {
        // Recreate all edge highlights to apply new settings
        const objectsToRefresh = Array.from(this.edgeHighlights.keys());

        objectsToRefresh.forEach(object => {
            this.removeEdgeHighlight(object);
        });

        objectsToRefresh.forEach(object => {
            this.createEdgeHighlight(object);
        });
    }

    /**
     * Get current state of object
     */
    getState(object) {
        return this.objectStates.get(object) || 'normal';
    }

    /**
     * Check if object is in a specific state
     */
    isInState(object, state) {
        return this.getState(object) === state;
    }

    /**
     * Clean up all visuals for object
     */
    cleanup(object) {
        this.removeEdgeHighlight(object);
        this.removeHoverEffect(object);

        // ARCHITECTURE: Face highlights are now part of support meshes (object children)
        // They are automatically cleaned up when the object is removed
        // No manual cleanup needed here

        this.objectStates.delete(object);
    }

    /**
     * Destroy visualizer and clean up all resources
     */
    destroy() {
        // Hide all edge highlights via centralized API
        const factory = this.getSupportMeshFactory();
        for (const [object] of this.edgeHighlights) {
            if (factory) {
                factory.hideSelectionWireframe(object);
            }
        }
        this.edgeHighlights.clear();

        // ARCHITECTURE: Face highlights are now part of support meshes (object children)
        // They are automatically cleaned up when objects are removed
        // No manual cleanup needed here

        this.objectStates.clear();
    }

    // REMOVED: notifyContainerVisualizerOfStateChange() method
    // Dimming conflicts eliminated - NavigationController → ContainerVisualizer is the only pathway
}

// Export for use in application
window.ObjectVisualizer = ObjectVisualizer;