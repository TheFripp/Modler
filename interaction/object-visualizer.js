// Modler V2 - Object Visualization Base Class
// Handles shared visualization behaviors for all objects (regular objects and containers)
// Provides foundation for edge highlights, material updates, transform sync, and face highlighting

class ObjectVisualizer {
    constructor() {
        // Visual state tracking
        this.objectStates = new Map(); // object -> current state
        this.edgeHighlights = new Map(); // object -> edge mesh
        this.faceHighlights = new Map(); // object -> face highlight meshes

        // Base materials
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
        const configManager = this.getConfigManager();

        // Base edge material for regular objects (orange)
        const selectionConfig = configManager ?
            configManager.get('visual.selection') :
            { color: '#ff6600', lineWidth: 2, opacity: 0.8, renderOrder: 999 };

        const colorHex = parseInt(selectionConfig.color.replace('#', ''), 16);

        this.edgeMaterial = new THREE.LineBasicMaterial({
            color: colorHex,
            transparent: true,
            opacity: selectionConfig.opacity,
            linewidth: selectionConfig.lineWidth
        });
        this.edgeMaterial.lineWidth = selectionConfig.lineWidth;
        this.edgeMaterial.renderOrder = selectionConfig.renderOrder || 999;

        // Face highlight material for tool interactions - use selection color instead of hardcoded green
        this.faceHighlightMaterial = new THREE.MeshBasicMaterial({
            color: colorHex, // Use same color as selection edges
            transparent: true,
            opacity: 0.1, // Lower opacity to match support mesh factory face highlights
            side: THREE.DoubleSide
        });
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
        const configManager = this.getConfigManager();
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
    }

    /**
     * Update material property and refresh highlights
     */
    updateMaterialProperty(property, value) {
        if (!this.edgeMaterial) return;

        if (property === 'color') {
            const colorHex = parseInt(value.replace('#', ''), 16);
            this.edgeMaterial.color.setHex(colorHex);
        } else if (property === 'linewidth') {
            this.edgeMaterial.lineWidth = value;
        } else {
            this.edgeMaterial[property] = value;
        }

        this.edgeMaterial.needsUpdate = true;
        this.refreshAllHighlights();
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
            // CREATE ONCE ARCHITECTURE: Use pre-created support mesh instead of creating new one
            const supportMeshes = object.userData.supportMeshes;
            if (supportMeshes && supportMeshes.selectionWireframe) {
                // Show the pre-created wireframe
                supportMeshes.selectionWireframe.visible = true;

                // Store reference for tracking
                this.edgeHighlights.set(object, supportMeshes.selectionWireframe);

                return;
            }

            // FALLBACK: Create legacy wireframe if no support meshes exist (backward compatibility)
            console.warn('Object missing support meshes, creating legacy wireframe:', object.name);

            // Force geometry bounds recalculation
            if (object.geometry) {
                object.geometry.computeBoundingBox();
            }

            // Create edge geometry and thick line group
            const edgeGeometry = new THREE.EdgesGeometry(object.geometry);
            const edgeMesh = this.createThickLineGroup(edgeGeometry, this.edgeMaterial.lineWidth || 2, this.edgeMaterial);

            // Clean up temporary geometry
            edgeGeometry.dispose();

            // Make non-raycastable
            edgeMesh.raycast = () => {};

            // Copy transform from original object
            edgeMesh.position.copy(object.position);
            edgeMesh.rotation.copy(object.rotation);
            edgeMesh.scale.copy(object.scale);

            // Add small Y-offset to prevent z-fighting with floor grid
            edgeMesh.position.y += 0.001;

            // Add to scene
            if (object.parent) {
                object.parent.add(edgeMesh);
            }

            // Store reference
            this.edgeHighlights.set(object, edgeMesh);

            // Register with MeshSynchronizer
            this.registerForMeshSync(object, edgeMesh);

        } catch (error) {
            console.warn('Failed to create edge highlight for object:', object.name, error);
        }
    }

    /**
     * Remove edge highlight for object - uses pre-created support meshes (CREATE ONCE architecture)
     */
    removeEdgeHighlight(object) {
        const edgeMesh = this.edgeHighlights.get(object);
        if (edgeMesh) {
            // CREATE ONCE ARCHITECTURE: Check if this is a pre-created support mesh
            const supportMeshes = object.userData.supportMeshes;
            if (supportMeshes && supportMeshes.selectionWireframe === edgeMesh) {
                // Hide the pre-created wireframe instead of destroying it
                supportMeshes.selectionWireframe.visible = false;

                // Remove from tracking
                this.edgeHighlights.delete(object);

                return;
            }

            // FALLBACK: Clean up legacy wireframe (backward compatibility)
            console.warn('Cleaning up legacy wireframe for object:', object.name);

            // Unregister from MeshSynchronizer
            this.unregisterFromMeshSync(object, edgeMesh);

            // Remove from scene
            if (edgeMesh.parent) {
                edgeMesh.parent.remove(edgeMesh);
            }

            // Clean up geometry
            this.cleanupHighlightMesh(edgeMesh);

            // Remove from tracking
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
     */
    showFaceHighlight(object, face, color = null) {
        if (!object || !face) return;

        const key = `${object.id}_face_${face.a}_${face.b}_${face.c}`;

        // Don't create duplicate highlights
        if (this.faceHighlights.has(key)) return;

        try {
            // Use Visual Effects system to create proper face geometry (maintains visual consistency)
            const visualEffects = window.modlerComponents?.visualEffects;
            if (!visualEffects) {
                console.warn('ObjectVisualizer: Visual Effects system not available for face geometry creation');
                return;
            }

            // Create hit object for Visual Effects system
            const hit = { object, face };
            const faceGeometry = visualEffects.createFaceGeometry(hit, 'auto');

            if (!faceGeometry) {
                console.warn('ObjectVisualizer: Failed to create face geometry');
                return;
            }

            // Create highlight mesh with consistent visual style
            const material = this.faceHighlightMaterial.clone();
            if (color !== null) {
                material.color.setHex(color);
            }
            // If color is null, use the material's default color (selection color)

            const faceMesh = new THREE.Mesh(faceGeometry, material);
            faceMesh.raycast = () => {}; // Non-raycastable

            // INSEPARABLE ARCHITECTURE: Make face highlight a direct child of the object
            // This guarantees face highlights always move with object, regardless of hierarchy
            object.add(faceMesh);

            // Store reference
            this.faceHighlights.set(key, faceMesh);

        } catch (error) {
            console.warn('Failed to create face highlight:', error);
        }
    }

    /**
     * Hide face highlight
     */
    hideFaceHighlight(object, face) {
        if (!object || !face) return;

        const key = `${object.id}_face_${face.a}_${face.b}_${face.c}`;
        const faceMesh = this.faceHighlights.get(key);

        if (faceMesh) {
            // INSEPARABLE ARCHITECTURE: Face mesh parent is now the object itself
            if (faceMesh.parent) {
                faceMesh.parent.remove(faceMesh);
            }

            if (faceMesh.geometry) {
                faceMesh.geometry.dispose();
            }

            if (faceMesh.material) {
                faceMesh.material.dispose();
            }

            this.faceHighlights.delete(key);
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
     * Register object with MeshSynchronizer for automatic updates
     */
    registerForMeshSync(object, edgeMesh) {
        const meshSynchronizer = window.modlerComponents?.meshSynchronizer;
        if (meshSynchronizer) {
            meshSynchronizer.registerRelatedMesh(object, edgeMesh, 'selection', {
                enabled: true,
                description: 'Selection wireframe',
                geometryUpdater: (mainMesh, relatedMesh) => {
                    return this.updateWireframeGeometry(mainMesh, relatedMesh);
                }
            });
        }
    }

    /**
     * Unregister from MeshSynchronizer
     */
    unregisterFromMeshSync(object, edgeMesh) {
        const meshSynchronizer = window.modlerComponents?.meshSynchronizer;
        if (meshSynchronizer) {
            meshSynchronizer.unregisterRelatedMesh(object, edgeMesh, 'selection');
        }
    }

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

        // Clean up face highlights for this object
        const keysToRemove = [];
        for (const [key, mesh] of this.faceHighlights) {
            if (key.startsWith(`${object.id}_face_`)) {
                if (mesh.parent) mesh.parent.remove(mesh);
                this.cleanupHighlightMesh(mesh);
                keysToRemove.push(key);
            }
        }
        keysToRemove.forEach(key => this.faceHighlights.delete(key));

        this.objectStates.delete(object);
    }

    /**
     * Destroy visualizer and clean up all resources
     */
    destroy() {
        // Clean up all highlights
        for (const [object, edgeMesh] of this.edgeHighlights) {
            this.unregisterFromMeshSync(object, edgeMesh);
            if (edgeMesh.parent) {
                edgeMesh.parent.remove(edgeMesh);
            }
            this.cleanupHighlightMesh(edgeMesh);
        }
        this.edgeHighlights.clear();

        // Clean up face highlights - INSEPARABLE ARCHITECTURE: parent is the object itself
        for (const [key, faceMesh] of this.faceHighlights) {
            if (faceMesh.parent) {
                faceMesh.parent.remove(faceMesh);
            }
            this.cleanupHighlightMesh(faceMesh);
        }
        this.faceHighlights.clear();

        this.objectStates.clear();
    }
}

// Export for use in application
window.ObjectVisualizer = ObjectVisualizer;