// Modler V2 - Box Creation Tool
// Refactored for maintainability - uses centralized systems

const BoxCreationState = {
    IDLE: 'idle',
    SETTING_CORNER_1: 'setting_corner_1',
    SETTING_HEIGHT: 'setting_height'
};

class BoxCreationTool {
    constructor(selectionController, visualEffects) {
        this.selectionController = selectionController;
        this.visualEffects = visualEffects;

        // New unified systems
        this.geometryFactory = new GeometryFactory();
        this.materialManager = new MaterialManager();
        this.resourcePool = new VisualizationResourcePool();

        // Core state
        this.state = BoxCreationState.IDLE;
        this.startPosition = null;
        this.currentPosition = null;
        this.currentHeight = 1.0;

        // Single preview mesh (removed wireframe redundancy)
        this.previewBox = null;
        // Invisible creation object for properties panel
        this.creationObject = null;
    }

    activate() {
        this.state = BoxCreationState.IDLE;
        this.setupFieldNavigation();
    }

    deactivate() {
        this.cleanup();
        this.cleanupFieldNavigation();
    }

    onClick(hit, event) {
        switch (this.state) {
            case BoxCreationState.IDLE:
                this.startCreation(hit);
                break;
            case BoxCreationState.SETTING_CORNER_1:
                this.setSecondCorner(hit);
                break;
            case BoxCreationState.SETTING_HEIGHT:
                this.finalizeBox();
                break;
        }
    }

    onHover(hit) {
        if (this.state === BoxCreationState.SETTING_CORNER_1 && this.startPosition) {
            const groundHit = this.getGroundPlaneIntersection();
            if (groundHit) {
                this.currentPosition = groundHit.point;
                this.updatePreview();
            }
        }
    }

    onMouseMove(hit, event) {
        if (this.state === BoxCreationState.SETTING_HEIGHT && event) {
            // Request snap detection for height adjustment phase with vertical travel axis
            const snapController = window.modlerComponents?.snapController;
            if (snapController) {
                // Pass vertical axis (Y) as travel direction to filter for horizontal edges only
                const verticalAxis = new THREE.Vector3(0, 1, 0);
                snapController.updateSnapDetection('box-creation', [], verticalAxis);
            }
            this.updateHeightFromMouse(event);
        }
    }

    onKeyDown(event) {
        if (event.key === 'Escape') {
            this.cancelCreation();
            return true;
        }

        // Let HTML field navigation handle Tab completely
        // Only handle Tab when no dimension field is focused (to start navigation)
        if (event.key === 'Tab') {
            const activeElement = document.activeElement;
            const isDimensionField = activeElement && ['dim-x', 'dim-z', 'dim-y'].includes(activeElement.id);

            if (!isDimensionField) {
                // Focus the appropriate starting field
                if (this.state === BoxCreationState.SETTING_CORNER_1) {
                    const widthField = document.getElementById('dim-x');
                    if (widthField) {
                        event.preventDefault();
                        widthField.focus();
                        widthField.select();
                        return true;
                    }
                } else if (this.state === BoxCreationState.SETTING_HEIGHT) {
                    const heightField = document.getElementById('dim-y');
                    if (heightField) {
                        event.preventDefault();
                        heightField.focus();
                        heightField.select();
                        return true;
                    }
                }
            }
        }

        return false;
    }

    /**
     * Setup field navigation workflow for box creation
     */
    setupFieldNavigation() {
        const fieldNavigationManager = window.modlerComponents?.fieldNavigationManager;
        if (!fieldNavigationManager) {
            return;
        }

        fieldNavigationManager.registerNavigationWorkflow('box-creation', {
            fieldOrder: ['dim-x', 'dim-z', 'dim-y'], // W → D → H
            onFieldFocus: (fieldId, index) => {
                // Handle transitions when focusing height field (index 2)
                if (fieldId === 'dim-y' && index === 2) {
                    this.transitionToHeightMode();
                }
            },
            onFieldApply: (fieldId, value) => {
                // Apply dimension values from input fields
                this.applyDimensionFromInput(fieldId, value);
            },
            onWorkflowComplete: () => {
                // Complete box creation when workflow finishes
                if (this.state === BoxCreationState.SETTING_HEIGHT) {
                    this.finalizeBox();
                }
            }
        });
    }

    /**
     * Clean up field navigation workflow
     */
    cleanupFieldNavigation() {
        const fieldNavigationManager = window.modlerComponents?.fieldNavigationManager;
        if (!fieldNavigationManager) return;

        fieldNavigationManager.unregisterNavigationWorkflow('box-creation');
    }

    /**
     * Transition to height extraction mode
     */
    transitionToHeightMode() {
        if (this.state === BoxCreationState.SETTING_CORNER_1) {
            // Ensure we have a current position before switching to height mode
            if (!this.currentPosition) {
                this.currentPosition = this.startPosition.clone();
                this.currentPosition.x += 1.0; // Default width
                this.currentPosition.z += 1.0; // Default depth
            }

            this.state = BoxCreationState.SETTING_HEIGHT;
            this.initializeHeightFromCurrentMouse();
            this.createPreview(); // Show 3D preview
        }
    }

    // Core creation flow
    startCreation(hit) {
        // Clear any existing selection when starting box creation
        this.selectionController.clearSelection('normal');

        // Use mathematical plane intersection for precise, continuous positioning
        const groundHit = this.getGroundPlaneIntersection();
        if (!groundHit) return;

        this.startPosition = groundHit.point.clone();
        this.state = BoxCreationState.SETTING_CORNER_1;

        // Create invisible box object for properties panel
        this.createInvisibleBoxForProperties();

    }

    setSecondCorner(hit) {
        if (!this.startPosition) return;

        // Set current position from hit if not already set (e.g., click without hover)
        if (!this.currentPosition) {
            // Use mathematical plane intersection for consistent rectangle creation
            const groundHit = this.getGroundPlaneIntersection();
            if (!groundHit || !groundHit.point) {
                    return;
            }
            this.currentPosition = groundHit.point.clone();
        }

        // Ensure currentPosition is valid before proceeding
        if (!this.currentPosition || typeof this.currentPosition.x !== 'number') {
            return;
        }

        this.state = BoxCreationState.SETTING_HEIGHT;

        // Initialize height based on current mouse position to prevent offset
        this.initializeHeightFromCurrentMouse();

        this.createPreview();

    }

    finalizeBox() {
        if (!this.startPosition || !this.currentPosition) return;

        // Calculate dimensions
        const width = Math.abs(this.currentPosition.x - this.startPosition.x);
        const depth = Math.abs(this.currentPosition.z - this.startPosition.z);
        const height = this.currentHeight;

        // Calculate center position
        const centerX = (this.startPosition.x + this.currentPosition.x) / 2;
        const centerZ = (this.startPosition.z + this.currentPosition.z) / 2;
        const centerY = height / 2;

        // Replace invisible creation object with final box
        const sceneController = window.modlerComponents?.sceneController;
        if (sceneController) {
            // Remove the invisible creation object first
            if (this.creationObject) {
                sceneController.removeObject(this.creationObject.userData.id);
                this.creationObject = null;
            }

            const geometry = this.geometryFactory.createBoxGeometry(width, height, depth);
            const material = this.materialManager.createMeshLambertMaterial({ color: 0x888888 });

            const boxData = sceneController.addObject(geometry, material, {
                name: sceneController.generateObjectName('box'),
                type: 'cube', // Consistent with centralized system
                position: new THREE.Vector3(centerX, centerY, centerZ)
            });

            if (boxData && boxData.mesh) {
                this.selectionController.clearSelection('normal');
                this.selectionController.select(boxData.mesh);
            }
        }

        this.cleanup();
        this.state = BoxCreationState.IDLE;

        // Properties panel will be updated automatically when the new box is selected
        // Reset the panel title back to normal
        const panelTitle = document.querySelector('.properties-panel h3');
        if (panelTitle) {
            panelTitle.textContent = 'Properties';
        }

    }

    cancelCreation() {
        this.cleanup();
        this.state = BoxCreationState.IDLE;
    }

    // Preview management (simplified)
    createPreview() {
        // Enhanced error checking
        if (!this.startPosition || !this.currentPosition) {
            return;
        }

        // Validate position properties
        if (typeof this.currentPosition.x !== 'number' || typeof this.startPosition.x !== 'number') {
            return;
        }

        this.cleanupVisuals(); // Remove existing preview (preserve positions)

        const width = Math.abs(this.currentPosition.x - this.startPosition.x);
        const depth = Math.abs(this.currentPosition.z - this.startPosition.z);
        const height = this.currentHeight;

        // Prevent zero-size geometry
        const minSize = 0.01;
        const actualWidth = Math.max(width, minSize);
        const actualDepth = Math.max(depth, minSize);
        const actualHeight = Math.max(height, minSize);

        // Create proper face-edge wireframe like selection boxes and containers
        let boxGeometry, edgeGeometry, material;
        try {
            boxGeometry = this.geometryFactory.createBoxGeometry(actualWidth, actualHeight, actualDepth);
            edgeGeometry = this.geometryFactory.createEdgeGeometryFromSource(boxGeometry);
            // Get configurable color from configuration manager
            const configManager = window.modlerComponents?.configurationManager;
            const configColor = configManager?.get('visual.boxCreation.color') || '#00ff00';

            // Use MaterialManager for consistent wireframe material
            material = this.materialManager.createPreviewWireframeMaterial({
                color: configColor,
                opacity: 0.8
            });

            this.previewBox = new THREE.LineSegments(edgeGeometry, material);

            // Return the box geometry to pool as we only need the edges
            this.geometryFactory.returnGeometry(boxGeometry, 'box');
        } catch (error) {
            if (boxGeometry) this.geometryFactory.returnGeometry(boxGeometry, 'box');
            if (edgeGeometry) this.geometryFactory.returnGeometry(edgeGeometry, 'edge');
            if (material) this.materialManager.returnMaterial(material);
            return;
        }

        // Position preview
        const centerX = (this.startPosition.x + this.currentPosition.x) / 2;
        const centerZ = (this.startPosition.z + this.currentPosition.z) / 2;
        // Offset Y slightly above ground to prevent z-fighting with floor grid
        const centerY = actualHeight / 2 + 0.001; // Small offset to prevent flickering
        this.previewBox.position.set(centerX, centerY, centerZ);

        // Add to scene
        const scene = window.modlerComponents?.sceneFoundation?.scene;
        if (scene) {
            scene.add(this.previewBox);
        }
    }

    updatePreview() {
        if (this.state === BoxCreationState.SETTING_CORNER_1) {
            // Show rectangle outline during corner setting
            if (this.startPosition && this.currentPosition &&
                typeof this.startPosition.x === 'number' && typeof this.currentPosition.x === 'number') {
                this.visualEffects.showRectanglePreview(this.startPosition, this.currentPosition);

                // Update invisible box dimensions for property panel
                this.updateInvisibleBoxDimensions();
            }
        } else if (this.state === BoxCreationState.SETTING_HEIGHT) {
            this.createPreview();
        }
    }

    updateHeightFromMouse(event) {
        // Check for snap point first for precise height matching
        const snapController = window.modlerComponents?.snapController;
        let targetHeight = null;

        if (snapController && snapController.getEnabled()) {
            const currentSnapPoint = snapController.getCurrentSnapPoint();
            if (currentSnapPoint && currentSnapPoint.worldPos) {
                // Use snap point Y coordinate as target height
                targetHeight = Math.max(0.01, currentSnapPoint.worldPos.y);
            }
        }

        // Fall back to vertical-only mouse movement calculation if no snap point
        if (targetHeight === null) {
            targetHeight = this.calculateHeightFromVerticalMovement();
        }

        this.currentHeight = targetHeight;

        // Update invisible box dimensions for property panel
        this.updateInvisibleBoxDimensions();

        // During height adjustment, only update existing preview instead of recreating
        this.updateExistingPreview();
    }

    // Simple vertical-only mouse movement for height calculation
    calculateHeightFromVerticalMovement() {
        const inputController = window.modlerComponents?.inputController;
        if (!inputController || this.heightDragStartY === undefined) {
            return this.currentHeight || 1.0; // Keep current height if no tracking
        }

        // Calculate vertical mouse movement delta (only Y axis)
        const currentMouseY = inputController.mouse.y;
        const deltaY = currentMouseY - this.heightDragStartY;

        // Convert vertical movement to height change with sensitivity
        const sensitivity = 5.0; // Adjust this value to control height sensitivity
        const heightChange = deltaY * sensitivity;

        // Start from minimal base height and add movement
        const baseHeight = 0.01;
        const newHeight = baseHeight + heightChange;

        return Math.max(0.01, newHeight);
    }

    // Initialize height based on current mouse position when entering height adjustment mode
    initializeHeightFromCurrentMouse() {
        // Start with minimal height to prevent initial jump
        this.currentHeight = 0.01;

        // Store initial mouse Y position for delta tracking
        const inputController = window.modlerComponents?.inputController;
        if (inputController) {
            this.heightDragStartY = inputController.mouse.y;
        }
    }

    // Efficient preview update for height adjustment (recreates geometry properly)
    updateExistingPreview() {
        if (!this.previewBox || this.state !== BoxCreationState.SETTING_HEIGHT) {
            // Fall back to full recreation if no preview exists
            this.updatePreview();
            return;
        }

        // Recreate geometry properly to avoid wireframe distortion from scaling
        const width = Math.abs(this.currentPosition.x - this.startPosition.x);
        const depth = Math.abs(this.currentPosition.z - this.startPosition.z);
        const height = this.currentHeight;

        // Prevent zero-size geometry
        const minSize = 0.01;
        const actualWidth = Math.max(width, minSize);
        const actualDepth = Math.max(depth, minSize);
        const actualHeight = Math.max(height, minSize);

        // Return old geometry to pool
        if (this.previewBox.geometry) {
            this.geometryFactory.returnGeometry(this.previewBox.geometry, 'edge');
        }

        // Create new face-edge geometry with correct dimensions
        const boxGeometry = this.geometryFactory.createBoxGeometry(actualWidth, actualHeight, actualDepth);
        this.previewBox.geometry = this.geometryFactory.createEdgeGeometryFromSource(boxGeometry);

        // Return the temporary box geometry to pool
        this.geometryFactory.returnGeometry(boxGeometry, 'box');

        // Update position to account for new height
        const centerY = actualHeight / 2 + 0.001;
        this.previewBox.position.y = centerY;

        // Reset scale to 1,1,1 since geometry is now correct size
        this.previewBox.scale.set(1, 1, 1);
    }

    // Mathematical ground plane intersection (avoids grid snapping)
    getGroundPlaneIntersection() {
        const inputController = window.modlerComponents?.inputController;
        if (!inputController) return null;

        // Create raycaster from current mouse position
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(inputController.mouse, inputController.camera);

        // Define ground plane at Y = 0
        const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

        // Calculate intersection point mathematically
        const intersectionPoint = new THREE.Vector3();
        const didIntersect = raycaster.ray.intersectPlane(groundPlane, intersectionPoint);

        if (didIntersect) {
            return {
                point: intersectionPoint,
                distance: raycaster.ray.origin.distanceTo(intersectionPoint)
            };
        }

        return null;
    }


    // Clean up only visual elements (preserve positions during active creation)
    cleanupVisuals() {
        const scene = window.modlerComponents?.sceneFoundation?.scene;
        if (this.previewBox && scene) {
            // Remove from scene first
            scene.remove(this.previewBox);

            // Return geometry and material to pools safely
            try {
                if (this.previewBox.geometry) {
                    this.geometryFactory.returnGeometry(this.previewBox.geometry, 'edge');
                }
                if (this.previewBox.material) {
                    this.materialManager.returnMaterial(this.previewBox.material);
                }
            } catch (error) {
            }

            this.previewBox = null;
        }

        this.visualEffects.clearHighlight();
        this.visualEffects.clearRectanglePreview();
    }

    // Full cleanup including state reset (only when ending creation)
    cleanup() {
        this.cleanupVisuals();

        // Disable dimension field interaction
        this.disableDimensionFieldInteraction();

        // Remove invisible creation object if it exists
        if (this.creationObject) {
            const sceneController = window.modlerComponents?.sceneController;
            if (sceneController) {
                sceneController.removeObject(this.creationObject.userData.id);
            }
            this.creationObject = null;
        }

        this.startPosition = null;
        this.currentPosition = null;
        this.heightDragStartY = undefined; // Reset height tracking
    }

    hasActiveHighlight() {
        return this.state !== BoxCreationState.IDLE;
    }

    // Create invisible box object for properties panel
    createInvisibleBoxForProperties() {
        const sceneController = window.modlerComponents?.sceneController;
        if (!sceneController) return;

        // Create minimal geometry and invisible material
        const geometry = this.geometryFactory.createBoxGeometry(0.01, 0.01, 0.01);
        const material = this.materialManager.createMeshLambertMaterial({
            color: 0x888888,
            transparent: true,
            opacity: 0.0
        });

        // Add to scene controller but make it invisible
        const boxData = sceneController.addObject(geometry, material, {
            name: 'Creating Box...',
            type: 'cube',
            position: this.startPosition.clone(),
            category: 'temp',
            selectable: true
        });

        if (boxData && boxData.mesh) {
            this.creationObject = boxData.mesh;

            // Make object invisible to selection highlighting but keep it selectable for properties
            this.creationObject.userData.hideFromSelection = true;

            // Select the invisible object to show properties panel
            this.selectionController.clearSelection('normal');
            this.selectionController.select(this.creationObject);

            // Make dimension fields interactive during creation
            this.enableDimensionFieldInteraction();
        }
    }

    // Update invisible box dimensions during creation
    updateInvisibleBoxDimensions() {
        if (!this.creationObject || !this.startPosition || !this.currentPosition) return;

        const width = Math.abs(this.currentPosition.x - this.startPosition.x);
        const depth = Math.abs(this.currentPosition.z - this.startPosition.z);
        const height = this.currentHeight || 0.01;

        // Update the geometry
        const newGeometry = this.geometryFactory.createBoxGeometry(
            Math.max(width, 0.01),
            Math.max(height, 0.01),
            Math.max(depth, 0.01)
        );

        // Return old geometry to pool
        if (this.creationObject.geometry) {
            this.geometryFactory.returnGeometry(this.creationObject.geometry, 'box');
        }

        this.creationObject.geometry = newGeometry;

        // Update position
        const centerX = (this.startPosition.x + this.currentPosition.x) / 2;
        const centerZ = (this.startPosition.z + this.currentPosition.z) / 2;
        const centerY = height / 2;
        this.creationObject.position.set(centerX, centerY, centerZ);

        // Update SceneController object data with new dimensions
        const sceneController = window.modlerComponents?.sceneController;
        if (sceneController && this.creationObject.userData && this.creationObject.userData.id) {
            const objectData = sceneController.getObject(this.creationObject.userData.id);
            if (objectData) {
                // Update the object data dimensions and position
                objectData.position = this.creationObject.position.clone();
                objectData.width = Math.max(width, 0.01);
                objectData.height = Math.max(height, 0.01);
                objectData.depth = Math.max(depth, 0.01);
            }
        }

        // Update property panel dimensions in real-time
        if (window.updatePropertyPanelDimensions) {
            window.updatePropertyPanelDimensions(width, height, depth);
        }

        // Use centralized property panel update system
        if (window.updateSelectedObjectInfo) {
            window.updateSelectedObjectInfo(this.creationObject);
        }
    }

    /** Enable dimension field interaction during box creation */
    enableDimensionFieldInteraction() {
        const dimFields = ['dim-x', 'dim-y', 'dim-z'];
        dimFields.forEach(fieldId => {
            const field = document.getElementById(fieldId);
            if (field) {
                field.removeAttribute('readonly');
                // Use simple HTML attribute approach (same as position/rotation fields)
                field.setAttribute('onchange', `applyDimensionFromInput('${fieldId}', this.value)`);
                field.setAttribute('onkeydown', `handlePropertyInputKeydown(event, 'dimension', '${fieldId}', this)`);
            }
        });
    }

    /** Disable dimension field interaction and restore readonly */
    disableDimensionFieldInteraction() {
        const dimFields = ['dim-x', 'dim-y', 'dim-z'];
        dimFields.forEach(fieldId => {
            const field = document.getElementById(fieldId);
            if (field) {
                field.setAttribute('readonly', 'readonly');
                field.removeAttribute('onchange');
                field.removeAttribute('onkeydown');
            }
        });
    }

    /**
     * Apply dimension from input field while maintaining center position
     * @param {string} fieldId - The field ID ('dim-x', 'dim-z', 'dim-y')
     * @param {string|number} value - The new dimension value
     */
    applyDimensionFromInput(fieldId, value) {
        if (!this.creationObject || !this.startPosition) return;

        const numValue = Math.max(parseFloat(value) || 0.01, 0.01);

        // Calculate current center position for the box
        const currentCenterX = this.currentPosition ? (this.startPosition.x + this.currentPosition.x) / 2 : this.startPosition.x;
        const currentCenterZ = this.currentPosition ? (this.startPosition.z + this.currentPosition.z) / 2 : this.startPosition.z;

        // Update internal dimensions based on field without moving the center
        if (fieldId === 'dim-x') {
            // Width - maintain center, update corner positions
            const halfWidth = numValue / 2;
            this.currentPosition = this.currentPosition || this.startPosition.clone();
            this.startPosition.x = currentCenterX - halfWidth;
            this.currentPosition.x = currentCenterX + halfWidth;
        } else if (fieldId === 'dim-z') {
            // Depth - maintain center, update corner positions
            const halfDepth = numValue / 2;
            this.currentPosition = this.currentPosition || this.startPosition.clone();
            this.startPosition.z = currentCenterZ - halfDepth;
            this.currentPosition.z = currentCenterZ + halfDepth;
        } else if (fieldId === 'dim-y') {
            // Height - update currentHeight
            this.currentHeight = numValue;
            // If we're setting height via input, switch to height mode
            if (this.state === BoxCreationState.SETTING_CORNER_1 && this.currentPosition) {
                this.state = BoxCreationState.SETTING_HEIGHT;
                this.initializeHeightFromCurrentMouse();
            }
        }

        // Update the invisible object and visual preview
        this.updateInvisibleBoxDimensions();
        this.updateExistingPreview();
    }
}

// Export for use in main application
window.BoxCreationTool = BoxCreationTool;