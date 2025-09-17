// Modler V2 - Layout Tool
// Auto layout tool for creating and managing container layouts
// Refactored: Core tool logic with utility class coordination
// Target: ~200 lines - focused tool behavior

class LayoutTool {
    /**
     * Layout tool for managing 3D auto layout containers
     * @param {SelectionController} selectionController - Reference to selection controller
     * @param {VisualEffects} visualEffects - Reference to visual effects
     */
    constructor(selectionController, visualEffects) {
        this.selectionController = selectionController;
        this.visualEffects = visualEffects;
        // Use global ContainerManager instead of creating new instance
        this.containerManager = window.modlerComponents?.containerManager;

        // Use shared selection behavior for consistency
        this.selectionBehavior = new BaseSelectionBehavior(selectionController);

        this.name = 'layout';

        // Tool state
        this.isActive = false;
        this.activeContainer = null;
        this.layoutMode = 'create'; // 'create', 'configure', 'edit'
        this.hoveredObject = null;

        // Layout guides state (merged from LayoutGuides class)
        this.scene = visualEffects.scene;
        this.layoutGuides = null;

    }
    
    /**
     * Activate the layout tool
     */
    activate() {
        this.isActive = true;
        
        // Clear any existing highlights
        this.visualEffects.clearHighlight();
        
        // Show layout-specific UI feedback
        this.showLayoutUI();
    }
    
    /**
     * Deactivate the layout tool
     */
    deactivate() {
        this.isActive = false;
        this.activeContainer = null;
        this.layoutMode = 'create';

        // Clear layout guides
        this.clearLayoutGuides();

    }
    
    /**
     * Handle object hover in layout tool - show container/object highlighting
     * @param {Object} hit - Raycast hit result
     */
    onHover(hit) {
        if (hit && hit.object) {
            // Highlight containers and objects to show they can be interacted with
            const objectData = window.modlerComponents?.sceneController?.getObjectByMesh(hit.object);
            
            if (objectData && objectData.selectable) {
                // Layout tool doesn't show face highlights - focuses on object-level operations
                this.hoveredObject = hit.object;
                return;
            }
        }
        
        // Clear highlight if not hovering over selectable object
        if (this.hoveredObject) {
            this.visualEffects.clearHighlight();
            this.hoveredObject = null;
        }
    }
    
    /**
     * Handle object click in layout tool
     * @param {Object} hit - Raycast hit result
     * @param {Event} event - Mouse event
     */
    onClick(hit, event) {
        if (!this.isActive) return;
        
        const sceneController = window.modlerComponents?.sceneController;
        if (!sceneController) return;
        
        if (hit && hit.object) {
            // First handle universal selection behavior
            this.selectionBehavior.handleObjectClick(hit.object, event);
            
            // Tool-specific behavior for layout operations
            const objectData = sceneController.getObjectByMesh(hit.object);
            if (objectData) {
                const isMultiSelect = event.ctrlKey || event.metaKey;
                
                if (isMultiSelect && objectData.isContainer) {
                    // Multi-select on container: Toggle container state
                    this.toggleContainer(objectData);
                } else if (objectData.isContainer && !isMultiSelect) {
                    // Single-click on container: Configure it
                    this.activeContainer = objectData;
                    this.layoutMode = 'configure';
                    this.showLayoutProperties(objectData);
                }
                // Single clicks on non-container objects should NOT auto-add to containers
                // Use multi-select + Cmd+F or drag-and-drop in object list instead
            }
        } else {
            // Click on empty space
            this.selectionBehavior.handleEmptySpaceClick(event);
            
            // Tool-specific: Clear active container on empty space click
            if (!event.ctrlKey && !event.metaKey) {
                this.activeContainer = null;
                this.layoutMode = 'create';
                this.clearLayoutGuides();
            }
        }
    }
    
    /**
     * Handle double-click events - delegate to shared behavior
     */
    onDoubleClick(hit, event) {
        // Delegate to shared selection behavior
        this.selectionBehavior.handleDoubleClick(hit, event);
    }

    /**
     * Handle object movement in layout mode - update containers when objects move
     * @param {THREE.Object3D} object - Object that was moved
     */
    onObjectMove(object) {
        if (!this.isActive || !object) return;


        // Update parent container when objects move in layout mode
        if (window.MovementUtils) {
            window.MovementUtils.updateParentContainer(
                object,
                true, // Real-time update for layout mode
                null, // No throttling in layout mode
                null  // No specific container size
            );
        }

        // If we have an active container, update its layout display
        if (this.activeContainer) {
            this.updateLayoutDisplay();
        }

        // Update interactive mesh positions for containers
        const sceneController = window.modlerComponents?.sceneController;
        const unifiedContainerManager = window.modlerComponents?.unifiedContainerManager;

        if (sceneController && unifiedContainerManager && object.userData?.id) {
            const objectData = sceneController.getObject(object.userData.id);
            if (objectData && objectData.isContainer) {
                unifiedContainerManager.syncInteractiveMeshPosition(objectData.id);
            }
        }
    }
    
    /**
     * Toggle container state for an object
     * @param {Object} objectData - Object data from SceneController
     */
    toggleContainer(objectData) {
        this.containerManager.toggleContainerState(objectData);
        this.updateLayoutDisplay();
    }
    
    /**
     * Select a container (safe selection without auto-enabling layout)
     * @param {Object} containerData - Container object data
     * @param {THREE.Object3D} meshObject - Container mesh object
     */
    selectContainer(containerData, meshObject) {
        // Clear previous selection and select this container
        this.selectionController.clearSelection();
        this.selectionController.select(meshObject);
        
        // Set as active container but don't enable layout automatically
        this.activeContainer = containerData;
        this.layoutMode = 'configure';
        
        // Update UI panels
        if (window.updatePropertyPanelFromObject) {
            window.updatePropertyPanelFromObject(meshObject);
        }
        
        // Show layout guides if layout is already enabled
        if (containerData.autoLayout && containerData.autoLayout.enabled) {
            this.updateLayoutDisplay();
        }
    }
    
    /**
     * Configure auto layout for a container (legacy method - now safer)
     * @param {Object} containerData - Container object data
     */
    configureContainer(containerData) {
        const sceneController = window.modlerComponents?.sceneController;
        if (!sceneController || !containerData.isContainer) return;
        
        this.activeContainer = containerData;
        this.layoutMode = 'configure';
        
        // Don't automatically enable layout - let user do it via property panel
        // Only show properties and guides if layout is already enabled
        if (containerData.autoLayout && containerData.autoLayout.enabled) {
            this.showLayoutProperties(containerData);
            this.updateLayoutDisplay();
        }
        
    }
    
    
    /**
     * Create new empty container at click position
     * @param {Object} hit - Raycast hit result (may be null for empty space)
     */
    createContainer(hit) {
        const position = hit ? hit.point : new THREE.Vector3(0, 0, 0);
        const containerObject = this.containerManager.createEmptyContainer(position);
        
        if (containerObject) {
            this.configureContainer(containerObject);
        }
    }
    
    /**
     * Create container with an existing object
     * @param {Object} objectData - Object to make into container content
     */
    createContainerWithObject(objectData) {
        // For now, just make the object itself a container
        // In the future, this could create a wrapper container
        this.toggleContainer(objectData);
    }
    
    /**
     * Show layout properties panel for container
     * @param {Object} containerData - Container object data
     */
    showLayoutProperties(containerData) {
        const info = document.querySelector('#info');
        if (info && containerData.autoLayout) {
            const sceneController = window.modlerComponents?.sceneController;
            const childCount = sceneController ? sceneController.getChildObjects(containerData.id).length : 0;
            info.innerHTML = `
                <strong>Layout: ${containerData.name}</strong><br>
                Direction: ${containerData.autoLayout.direction} | Gap: ${containerData.autoLayout.gap} | Children: ${childCount}<br>
                Controls: Click objects to add | Ctrl+Click to toggle | Keys 1-3 for direction
            `;
        }
    }
    
    /**
     * Update layout display and guides
     */
    updateLayoutDisplay() {
        if (this.activeContainer) {
            this.showLayoutGuides(this.activeContainer);
        }
    }
    
    /**
     * Show layout-specific UI feedback
     */
    showLayoutUI() {
        const info = document.querySelector('#info');
        if (info) {
            info.style.backgroundColor = 'rgba(0,150,255,0.3)';
            info.innerHTML = `<strong>🏗️ LAYOUT TOOL</strong><br>Click objects/containers | Ctrl+Click toggle | Empty space = new container`;
        }
    }
    
    /**
     * Handle keyboard shortcuts for layout tool
     * @param {KeyboardEvent} event - Keyboard event
     */
    onKeyDown(event) {
        // Simplified keyboard handling for basic layout directions only
        if (!this.isActive || !this.activeContainer) return;
        
        const sceneController = window.modlerComponents?.sceneController;
        if (!sceneController || !this.activeContainer.autoLayout) return;
        
        let direction = null;
        switch (event.code) {
            case 'Digit1': direction = 'x'; break;
            case 'Digit2': direction = 'y'; break;
            case 'Digit3': direction = 'z'; break;
        }
        
        if (direction) {
            this.activeContainer.autoLayout.direction = direction;
            sceneController.updateLayout(this.activeContainer.id);
            this.showLayoutProperties(this.activeContainer);
        }
    }
    
    /**
     * Create auto layout container from selected objects
     * @param {Array} selectedObjects - Array of selected mesh objects
     * @returns {boolean} True if container was successfully created
     */
    createContainerFromSelection(selectedObjects) {
        if (!selectedObjects || selectedObjects.length === 0) {
            return false;
        }
        
        const containerObject = this.containerManager.createContainerFromSelection(selectedObjects);
        
        if (containerObject) {
            // Set this as the active container but don't auto-activate tool
            this.activeContainer = containerObject;
            this.layoutMode = 'configure';
            
            // REMOVED: this.activate() - user controls tool activation
            // Container creation should not force tool switching
            
            // Show layout properties but don't enable auto layout yet
            this.showLayoutProperties(containerObject);
            
            return true;
        }
        
        return false;
    }
    
    /**
     * Resize a container to fit its children - exposed method for external access
     * @param {Object} containerData - Container object data
     * @returns {boolean} Success status
     */
    resizeContainerToFitChildren(containerData) {
        return this.containerManager.resizeContainerToFitChildren(containerData);
    }
    
    /**
     * Check if tool has an active highlight (for camera/tool coordination)
     */
    hasActiveHighlight() {
        return this.hoveredObject !== null;
    }
    
    /**
     * Tool deactivation cleanup
     */
    onToolDeactivate() {
        if (this.hoveredObject) {
            this.visualEffects.clearHighlight();
            this.hoveredObject = null;
        }
    }

    // ====== MERGED LAYOUT GUIDES FUNCTIONALITY ======
    // Merged from LayoutGuides class to eliminate coupling

    /**
     * Show layout guides and boundaries for a container
     * @param {Object} containerData - Container object data from SceneController
     */
    showLayoutGuides(containerData) {
        if (!containerData || !containerData.isContainer || !containerData.autoLayout) {
            return;
        }

        // Clear existing guides first
        this.clearLayoutGuides();

        const sceneController = window.modlerComponents?.sceneController;
        if (!sceneController) return;

        // Get child objects for layout calculation
        const children = sceneController.getChildObjects(containerData.id);
        if (children.length === 0) return;

        // Create layout guides group
        this.layoutGuides = new THREE.Group();
        this.layoutGuides.name = 'LayoutGuides';

        // Show container boundary
        this.showContainerBoundary(containerData, children);

        // Show gap indicators
        this.showGapIndicators(containerData, children);

        // Show padding indicators
        this.showPaddingIndicators(containerData);

        // Add to scene
        this.scene.add(this.layoutGuides);

    }

    /**
     * Show container boundary box
     * @param {Object} containerData - Container object data
     * @param {Array} children - Child objects
     */
    showContainerBoundary(containerData, children) {
        if (!containerData.autoLayout || children.length === 0) return;

        // Calculate layout bounds
        const positions = window.LayoutEngine.calculateLayout(children, containerData.autoLayout);
        const bounds = window.LayoutEngine.calculateLayoutBounds(children, positions);

        // Create boundary box wireframe
        const boundaryGeometry = new THREE.BoxGeometry(bounds.size.x, bounds.size.y, bounds.size.z);
        const boundaryMaterial = new THREE.LineBasicMaterial({
            color: 0x00ff00,
            linewidth: 2,
            transparent: true,
            opacity: 0.6
        });

        // Create wireframe
        const wireframe = new THREE.WireframeGeometry(boundaryGeometry);
        const boundaryLines = new THREE.LineSegments(wireframe, boundaryMaterial);

        // Position at container center + layout center
        const layoutCenter = new THREE.Vector3(
            (bounds.min.x + bounds.max.x) / 2,
            (bounds.min.y + bounds.max.y) / 2,
            (bounds.min.z + bounds.max.z) / 2
        );
        boundaryLines.position.copy(containerData.mesh.position).add(layoutCenter);

        this.layoutGuides.add(boundaryLines);
    }

    /**
     * Show gap indicators between objects
     * @param {Object} containerData - Container object data
     * @param {Array} children - Child objects
     */
    showGapIndicators(containerData, children) {
        if (!containerData.autoLayout || children.length < 2) return;

        const { direction, gap } = containerData.autoLayout;
        const positions = window.LayoutEngine.calculateLayout(children, containerData.autoLayout);

        // Create gap indicators based on layout direction
        for (let i = 0; i < positions.length - 1; i++) {
            const pos1 = positions[i];
            const pos2 = positions[i + 1];

            // Calculate gap center position
            let gapCenter;
            if (direction === 'x') {
                gapCenter = new THREE.Vector3((pos1.x + pos2.x) / 2, pos1.y, pos1.z);
            } else if (direction === 'y') {
                gapCenter = new THREE.Vector3(pos1.x, (pos1.y + pos2.y) / 2, pos1.z);
            } else if (direction === 'z') {
                gapCenter = new THREE.Vector3(pos1.x, pos1.y, (pos1.z + pos2.z) / 2);
            } else {
                continue; // Skip grid layouts for now
            }

            // Create gap indicator line
            const gapIndicator = this.createGapLine(pos1, pos2, direction);
            gapIndicator.position.copy(containerData.mesh.position);
            this.layoutGuides.add(gapIndicator);

            // Create gap distance label
            const gapLabel = this.createGapLabel(gapCenter, gap);
            gapLabel.position.copy(containerData.mesh.position).add(gapCenter);
            this.layoutGuides.add(gapLabel);
        }
    }

    /**
     * Create a line indicating gap between objects
     * @param {THREE.Vector3} pos1 - First position
     * @param {THREE.Vector3} pos2 - Second position
     * @param {string} direction - Layout direction
     * @returns {THREE.Line} Gap indicator line
     */
    createGapLine(pos1, pos2, direction) {
        const geometry = new THREE.BufferGeometry();
        const points = [pos1.clone(), pos2.clone()];
        geometry.setFromPoints(points);

        const material = new THREE.LineBasicMaterial({
            color: 0xffaa00,
            linewidth: 1,
            transparent: true,
            opacity: 0.8
        });

        return new THREE.Line(geometry, material);
    }

    /**
     * Create gap distance label (simple sphere for now)
     * @param {THREE.Vector3} position - Label position
     * @param {number} gap - Gap distance
     * @returns {THREE.Mesh} Gap label indicator
     */
    createGapLabel(position, gap) {
        const geometry = new THREE.SphereGeometry(0.1);
        const material = new THREE.MeshBasicMaterial({
            color: 0xffaa00,
            transparent: true,
            opacity: 0.7
        });

        const label = new THREE.Mesh(geometry, material);
        label.userData.gapValue = gap;
        return label;
    }

    /**
     * Show padding indicators around container
     * @param {Object} containerData - Container object data
     */
    showPaddingIndicators(containerData) {
        if (!containerData.autoLayout || !containerData.autoLayout.padding) return;

        const padding = containerData.autoLayout.padding;
        const containerPos = containerData.mesh.position;

        // Create padding visualization (simple wireframe boxes for now)
        const paddingColors = {
            top: 0xff0000,
            bottom: 0xff4444,
            left: 0x00ff00,
            right: 0x44ff44,
            front: 0x0000ff,
            back: 0x4444ff
        };

        Object.entries(padding).forEach(([side, value]) => {
            if (value > 0) {
                const indicator = this.createPaddingIndicator(side, value, paddingColors[side]);
                indicator.position.copy(containerPos);
                this.layoutGuides.add(indicator);
            }
        });
    }

    /**
     * Create padding indicator for a specific side
     * @param {string} side - Padding side ('top', 'bottom', etc.)
     * @param {number} value - Padding value
     * @param {number} color - Indicator color
     * @returns {THREE.Mesh} Padding indicator
     */
    createPaddingIndicator(side, value, color) {
        const geometry = new THREE.BoxGeometry(0.2, 0.2, 0.2);
        const material = new THREE.MeshBasicMaterial({
            color: color,
            transparent: true,
            opacity: 0.5
        });

        const indicator = new THREE.Mesh(geometry, material);

        // Position based on padding side
        const offset = value + 0.5; // Add small offset for visibility
        switch (side) {
            case 'top': indicator.position.y = offset; break;
            case 'bottom': indicator.position.y = -offset; break;
            case 'left': indicator.position.x = -offset; break;
            case 'right': indicator.position.x = offset; break;
            case 'front': indicator.position.z = offset; break;
            case 'back': indicator.position.z = -offset; break;
        }

        indicator.userData.paddingSide = side;
        indicator.userData.paddingValue = value;

        return indicator;
    }

    /**
     * Clear all layout guides from scene
     */
    clearLayoutGuides() {
        if (this.layoutGuides) {
            this.scene.remove(this.layoutGuides);

            // Dispose of geometries and materials
            this.layoutGuides.traverse((child) => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) child.material.dispose();
            });

            this.layoutGuides = null;
        }
    }

    /**
     * Update layout guides for active container
     * @param {Object} containerData - Container object data
     */
    updateLayoutGuides(containerData) {
        // Simply refresh by clearing and reshowing
        this.clearLayoutGuides();
        this.showLayoutGuides(containerData);
    }
}

// Export for tool registration
window.LayoutTool = LayoutTool;