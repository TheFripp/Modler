// Property panel management
class PropertyPanel {
    constructor() {
        this.setupEventListeners();
    }

    setupEventListeners() {
        document.addEventListener('DOMContentLoaded', () => {
            this.bindPropertyInputs();
        });
    }

    bindPropertyInputs() {
        // Position inputs with real-time updates
        ['x', 'y', 'z'].forEach(axis => {
            const input = document.getElementById(`pos-${axis}`);
            if (input) {
                input.addEventListener('input', (e) => {
                    this.handlePropertyRealTimeUpdate('position', axis, parseFloat(e.target.value));
                });
            }
        });

        // Rotation inputs with real-time updates
        ['x', 'y', 'z'].forEach(axis => {
            const input = document.getElementById(`rot-${axis}`);
            if (input) {
                input.addEventListener('input', (e) => {
                    this.handlePropertyRealTimeUpdate('rotation', axis, parseFloat(e.target.value));
                });
            }
        });

        // Dimension inputs with real-time updates
        ['x', 'y', 'z'].forEach(axis => {
            const input = document.getElementById(`dim-${axis}`);
            if (input) {
                input.addEventListener('input', (e) => {
                    this.handlePropertyRealTimeUpdate('dimension', axis, parseFloat(e.target.value));
                });
            }
        });

        // Material property inputs
        const colorInput = document.getElementById('material-color');
        if (colorInput) {
            colorInput.addEventListener('change', (e) => {
                this.updateObjectMaterial('color', e.target.value);
            });
        }

        const opacityInput = document.getElementById('material-opacity');
        if (opacityInput) {
            opacityInput.addEventListener('input', (e) => {
                this.updateObjectMaterial('opacity', parseFloat(e.target.value));
            });
        }

        // Layout axis buttons
        ['x', 'y', 'z'].forEach(axis => {
            const buttonId = axis === 'x' ? 'axis-w' : (axis === 'y' ? 'axis-h' : 'axis-d');
            const button = document.getElementById(buttonId);
            if (button) {
                button.addEventListener('click', () => {
                    this.selectLayoutAxis(axis, button);
                });
            }
        });

        // Sizing mode buttons
        const hugButton = document.getElementById('sizing-hug');
        const fixedButton = document.getElementById('sizing-fixed');

        if (hugButton) {
            hugButton.addEventListener('click', () => {
                this.updateContainerSizingMode('hug');
            });
        }

        if (fixedButton) {
            fixedButton.addEventListener('click', () => {
                this.updateContainerSizingMode('fixed');
            });
        }

        // Fill dimension buttons
        ['x', 'y', 'z'].forEach(axis => {
            const button = document.getElementById(`fill-${axis}`);
            if (button) {
                button.addEventListener('click', () => {
                    this.toggleFillDimension(axis, button);
                });
                button.addEventListener('mouseenter', () => {
                    this.showFillAxisPreview(axis);
                });
                button.addEventListener('mouseleave', () => {
                    this.clearFillAxisPreview();
                });
            }
        });

        // Gap inputs
        const gapInput = document.getElementById('layout-gap');
        if (gapInput) {
            gapInput.addEventListener('input', (e) => {
                this.updateLayoutProperty('gap', parseFloat(e.target.value));
            });
        }

        // Padding inputs
        ['top', 'right', 'bottom', 'left'].forEach(side => {
            const input = document.getElementById(`padding-${side}`);
            if (input) {
                input.addEventListener('input', (e) => {
                    this.updatePaddingProperty(side, parseFloat(e.target.value));
                });
            }
        });
    }

    // Handle real-time property updates as user types or changes values
    handlePropertyRealTimeUpdate(propertyType, axis, value) {
        // Use throttling to prevent excessive updates while user is typing
        const throttleKey = `${propertyType}_${axis}`;
        const now = Date.now();

        // Initialize throttle state if needed
        if (!window.propertyUpdateThrottle) {
            window.propertyUpdateThrottle = {};
        }

        // Throttle to 100ms intervals
        if (window.propertyUpdateThrottle[throttleKey] &&
            now - window.propertyUpdateThrottle[throttleKey] < 100) {
            return;
        }

        window.propertyUpdateThrottle[throttleKey] = now;

        // Apply the property change immediately
        if (propertyType === 'position' || propertyType === 'rotation') {
            this.updateObjectProperty(propertyType, axis, value);
        } else if (propertyType === 'dimension') {
            this.updateObjectDimension(axis, value);
        } else if (propertyType === 'layout') {
            this.updateLayoutProperty(axis, parseFloat(value));
        } else if (propertyType === 'padding') {
            this.updatePaddingProperty(axis, parseFloat(value));
        } else if (propertyType === 'material') {
            this.updateObjectMaterial(axis, value);
        }
    }

    updateObjectProperty(propertyType, axis, value) {
        if (window.PropertyManager) {
            if (propertyType === 'position') {
                window.PropertyManager.updateObjectPosition(axis, value);
            } else if (propertyType === 'rotation') {
                window.PropertyManager.updateObjectRotation(axis, value);
            }
        }
    }

    updateObjectDimension(axis, value) {
        if (window.PropertyManager) {
            window.PropertyManager.updateObjectGeometryDimension(axis, value);
        }
    }

    updateObjectMaterial(propertyType, value) {
        if (window.PropertyManager) {
            window.PropertyManager.updateMaterialProperty(propertyType, value);

            // Handle special UI updates
            if (propertyType === 'opacity') {
                const display = document.getElementById('opacity-display');
                if (display) {
                    display.textContent = parseFloat(value).toFixed(1);
                }
            }
        }
    }

    updateLayoutProperty(propertyType, value) {
        const propertyUpdateHandler = window.modlerComponents?.propertyUpdateHandler;
        const selectionController = window.modlerComponents?.selectionController;
        const sceneController = window.modlerComponents?.sceneController;

        if (!propertyUpdateHandler || !selectionController || !sceneController) {
            console.warn('Required components not available for layout property update');
            return;
        }

        // Get the selected container
        const selectedObjects = selectionController.getSelectedObjects();
        if (selectedObjects.length === 0) {
            console.warn('No container selected for layout property update');
            return;
        }

        const selectedObject = selectedObjects[0];
        if (!selectedObject.userData || !selectedObject.userData.id) {
            console.warn('Selected object has no ID');
            return;
        }

        const objectData = sceneController.getObject(selectedObject.userData.id);
        if (!objectData || !objectData.isContainer) {
            console.warn('Selected object is not a container');
            return;
        }

        // Call the PropertyUpdateHandler with the container ID
        console.log('🔧 Updating layout property:', propertyType, '=', value, 'for container:', objectData.name);
        propertyUpdateHandler.handleContainerLayoutPropertyChange(objectData.id, propertyType, value);
    }

    updatePaddingProperty(side, value) {
        // Use the same logic as updateLayoutProperty but with padding.side as property
        this.updateLayoutProperty(`padding.${side}`, value);
    }

    // Layout axis button group management
    selectLayoutAxis(axis, buttonElement) {
        console.log('🔧 selectLayoutAxis called:', { axis, buttonActive: buttonElement.classList.contains('active') });

        // Check if this axis is already active (toggle off functionality)
        const isCurrentlyActive = buttonElement.classList.contains('active');

        if (isCurrentlyActive) {
            // Toggle OFF - disable layout
            console.log('🔧 Disabling layout for axis:', axis);
            this.updateLayoutAxisButtons(null); // Clear all active states
            this.updateLayoutProperty('direction', null);
            this.clearLayoutAxisGuides();
            this.hideLayoutSections();
            this.setDimensionInputsState(false); // Enable dimension inputs when layout disabled
        } else {
            // Toggle ON - enable layout
            console.log('🔧 Enabling layout for axis:', axis);
            this.updateLayoutAxisButtons(axis);
            this.updateLayoutProperty('direction', axis);
            this.showLayoutAxisGuides(axis);
            this.showLayoutSections();
            this.setDimensionInputsState(true); // Disable dimension inputs in layout mode
        }
    }

    updateLayoutAxisButtons(selectedAxis) {
        // Clear all active states
        document.querySelectorAll('.axis-button').forEach(btn => {
            btn.classList.remove('active');
        });

        // Set active state for selected axis
        const buttonMap = { 'x': 'axis-w', 'y': 'axis-h', 'z': 'axis-d' };
        const activeButtonId = buttonMap[selectedAxis];
        if (activeButtonId) {
            const activeButton = document.getElementById(activeButtonId);
            if (activeButton) {
                activeButton.classList.add('active');
            }
        }
    }

    showLayoutSections() {
        const gapSection = document.getElementById('layout-gap-section');
        const paddingSection = document.getElementById('layout-padding-section');
        if (gapSection) gapSection.style.display = 'block';
        if (paddingSection) paddingSection.style.display = 'block';
    }

    hideLayoutSections() {
        const gapSection = document.getElementById('layout-gap-section');
        const paddingSection = document.getElementById('layout-padding-section');
        if (gapSection) gapSection.style.display = 'none';
        if (paddingSection) paddingSection.style.display = 'none';
    }

    setDimensionInputsState(disabled) {
        const dimensionInputs = ['dim-x', 'dim-y', 'dim-z'];
        dimensionInputs.forEach(inputId => {
            const input = document.getElementById(inputId);
            if (input) {
                input.disabled = disabled;
                // Add visual feedback
                if (disabled) {
                    input.style.opacity = '0.5';
                    input.style.cursor = 'not-allowed';
                } else {
                    input.style.opacity = '1';
                    input.style.cursor = '';
                }
            }
        });
    }

    showLayoutAxisGuides(axis) {
        const selectedObjects = window.modlerComponents?.selectionController?.getSelectedObjects();
        const visualEffects = window.modlerComponents?.visualEffects;
        const sceneController = window.modlerComponents?.sceneController;

        if (!selectedObjects || selectedObjects.length === 0 || !visualEffects || !sceneController) {
            return;
        }

        // Only show guides if the selected object is a container
        const selectedObject = selectedObjects[0];
        if (selectedObject && selectedObject.userData && selectedObject.userData.id) {
            const objectData = sceneController.getObject(selectedObject.userData.id);

            // Only show layout axis guides for containers
            if (objectData && objectData.isContainer) {
                visualEffects.showLayoutAxisGuides(selectedObject, axis);
            } else {
                // Clear guides if selected object is not a container
                visualEffects.clearLayoutAxisGuides();
            }
        }
    }

    clearLayoutAxisGuides() {
        const visualEffects = window.modlerComponents?.visualEffects;
        if (visualEffects) {
            visualEffects.clearLayoutAxisGuides();
        }
    }

    // Fill dimension functionality
    toggleFillDimension(axis, buttonElement) {
        if (window.PropertyManager) {
            window.PropertyManager.toggleFillProperty(axis);
        }
    }

    showFillAxisPreview(axis) {
        // Show face highlighting for the specified axis
        const visualEffects = window.modlerComponents?.visualEffects;
        if (visualEffects) {
            visualEffects.showAxisFaceHighlight(axis);
        }
    }

    clearFillAxisPreview() {
        // Clear the axis face highlighting
        const visualEffects = window.modlerComponents?.visualEffects;
        if (visualEffects) {
            visualEffects.clearHighlight();
        }
    }

    updateFillButtonState(axis, isActive) {
        const button = document.getElementById(`fill-${axis}`);
        if (button) {
            if (isActive) {
                button.classList.add('active');
            } else {
                button.classList.remove('active');
            }
        }
    }

    updateDimensionInputState(axis, isDisabled) {
        const input = document.getElementById(`dim-${axis}`);
        if (input) {
            if (isDisabled) {
                input.classList.add('dimension-input-disabled');
            } else {
                input.classList.remove('dimension-input-disabled');
            }
        }
    }

    updateFillButtonsVisibility(object) {
        const sceneController = window.modlerComponents?.sceneController;

        // Hide all fill buttons by default
        ['x', 'y', 'z'].forEach(axis => {
            const button = document.getElementById(`fill-${axis}`);
            if (button) {
                button.style.display = 'none';
            }
        });

        if (sceneController && object.userData && object.userData.id) {
            const objectData = sceneController.getObject(object.userData.id);

            // Show fill buttons only if object is in a layout-enabled container
            if (objectData && objectData.parentContainer) {
                const container = sceneController.getObject(objectData.parentContainer);

                // Check if container has autoLayout enabled
                if (container && container.autoLayout && container.autoLayout.enabled && container.autoLayout.direction) {
                    // Show fill buttons and update their states
                    ['x', 'y', 'z'].forEach(axis => {
                        const button = document.getElementById(`fill-${axis}`);
                        if (button) {
                            button.style.display = 'block';

                            // Update button state based on object's fill settings
                            const fillProperty = `size${axis.toUpperCase()}`;
                            const fillState = objectData.layoutProperties &&
                                            objectData.layoutProperties[fillProperty] === 'fill';

                            this.updateFillButtonState(axis, fillState);
                            this.updateDimensionInputState(axis, fillState);
                        }
                    });
                }
            }
        }
    }

    updateDimensionInputsForContainerMode(object) {
        // Default: enable dimension inputs for regular objects
        let shouldDisableInputs = false;

        // Check if this is a container and get its sizing mode
        const sceneController = window.modlerComponents?.sceneController;
        if (sceneController && object.userData && object.userData.id) {
            const objectData = sceneController.getObject(object.userData.id);

            if (objectData && objectData.isContainer) {
                // Disable dimension inputs if container is in 'hug' mode (default)
                // Enable dimension inputs if container is in 'fixed' mode (set by push tool)
                shouldDisableInputs = (objectData.sizingMode === 'hug' || !objectData.sizingMode);
            }
        }

        // Apply the dimension input state
        this.setDimensionInputsState(shouldDisableInputs);
    }

    updateFromObject(object) {
        // Update property panel with object data
        if (window.updatePropertyPanelFromObject) {
            window.updatePropertyPanelFromObject(object);
        }
    }

    clear() {
        // Reset transform inputs
        document.getElementById('pos-x').value = '0.00';
        document.getElementById('pos-y').value = '0.00';
        document.getElementById('pos-z').value = '0.00';
        document.getElementById('rot-x').value = '0';
        document.getElementById('rot-y').value = '0';
        document.getElementById('rot-z').value = '0';

        // Reset material inputs
        document.getElementById('material-color').value = '#ff0000';
        document.getElementById('material-opacity').value = '1';
        document.getElementById('opacity-display').textContent = '1.0';
    }

    // Focus dimension field based on push tool's active axis
    focusDimensionFieldForPushAxis(pushAxis) {
        let fieldId;
        if (pushAxis === 'x') {
            fieldId = 'dim-x';
        } else if (pushAxis === 'y') {
            fieldId = 'dim-y';
        } else if (pushAxis === 'z') {
            fieldId = 'dim-z';
        } else {
            return; // Unknown axis
        }

        const field = document.getElementById(fieldId);
        if (field) {
            field.focus();
            field.select(); // Select all text for easy editing
        }
    }

    updateContainerSizingMode(mode) {
        console.log('🔧 updateContainerSizingMode called:', mode);

        const selectedObjects = window.modlerComponents?.selectionController?.getSelectedObjects();
        const sceneController = window.modlerComponents?.sceneController;

        if (!selectedObjects || selectedObjects.length === 0 || !sceneController) {
            console.warn('Required components not available for sizing mode update');
            return;
        }

        const selectedObject = selectedObjects[0];
        if (selectedObject.userData && selectedObject.userData.id) {
            const objectData = sceneController.getObject(selectedObject.userData.id);
            if (objectData && objectData.isContainer) {
                console.log('🔧 Updating container sizing mode:', objectData.name, 'to', mode);

                // Update the container's sizing mode
                objectData.sizingMode = mode;

                // Update button states
                updateSizingModeButtons(mode);

                // Update dimension input state based on sizing mode
                this.setDimensionInputsState(mode === 'hug');

                // Trigger container layout update if needed
                if (window.modlerComponents?.containerManager) {
                    window.modlerComponents.containerManager.updateContainer(objectData);
                }

                // If switching to fixed mode and layout was active, ensure layout still works
                if (mode === 'fixed' && objectData.autoLayout && objectData.autoLayout.enabled) {
                    console.log('🔧 Container switched to fixed mode, ensuring layout is maintained');
                    const propertyUpdateHandler = window.modlerComponents?.propertyUpdateHandler;
                    if (propertyUpdateHandler) {
                        propertyUpdateHandler.handleContainerLayoutPropertyChange(
                            objectData.id,
                            'direction',
                            objectData.autoLayout.direction
                        );
                    }
                }
            }
        }
    }
}

// Initialize property panel
window.propertyPanel = new PropertyPanel();

// Global functions for backward compatibility
window.handlePropertyRealTimeUpdate = function(propertyType, axis, value) {
    if (window.propertyPanel) {
        window.propertyPanel.handlePropertyRealTimeUpdate(propertyType, axis, value);
    }
};

window.focusDimensionFieldForPushAxis = function(pushAxis) {
    if (window.propertyPanel) {
        window.propertyPanel.focusDimensionFieldForPushAxis(pushAxis);
    }
};

window.selectLayoutAxis = function(axis, buttonElement) {
    if (window.propertyPanel) {
        window.propertyPanel.selectLayoutAxis(axis, buttonElement);
    }
};

window.toggleFillDimension = function(axis, buttonElement) {
    if (window.propertyPanel) {
        window.propertyPanel.toggleFillDimension(axis, buttonElement);
    }
};

window.showFillAxisPreview = function(axis) {
    if (window.propertyPanel) {
        window.propertyPanel.showFillAxisPreview(axis);
    }
};

window.clearFillAxisPreview = function() {
    if (window.propertyPanel) {
        window.propertyPanel.clearFillAxisPreview();
    }
};

window.clearPropertyPanel = function() {
    if (window.propertyPanel) {
        window.propertyPanel.clear();
    }
};

window.updateLayoutProperty = function(propertyType, value) {
    if (window.propertyPanel) {
        window.propertyPanel.updateLayoutProperty(propertyType, value);
    }
};

window.updatePaddingProperty = function(side, value) {
    if (window.propertyPanel) {
        window.propertyPanel.updatePaddingProperty(side, value);
    }
};

// Global function to update property panel from object (required by selection controller)
window.updatePropertyPanelFromObject = function(object) {
    const rightPanel = document.querySelector('.right-panel');

    // Always show right panel, but hide content when no object selected
    if (rightPanel) {
        rightPanel.classList.remove('hidden');
    }

    if (!object) {
        // Hide accordion content when no object is selected
        hideAccordionContent();
        updateSelectedObjectInfo(null);
        hideAllContainerSections();
        hideMaterialSection();
        return;
    }

    // Show accordion content when object is selected
    showAccordionContent();

    // Update selected object info at the top
    updateSelectedObjectInfo(object);

    // Check if this is a container and update container-specific UI
    updateContainerSpecificUI(object);

    // Update material section visibility
    updateMaterialSectionVisibility(object);

    // Update position inputs
    const posX = document.getElementById('pos-x');
    const posY = document.getElementById('pos-y');
    const posZ = document.getElementById('pos-z');

    if (posX) posX.value = object.position.x.toFixed(2);
    if (posY) posY.value = object.position.y.toFixed(2);
    if (posZ) posZ.value = object.position.z.toFixed(2);

    // Update rotation inputs (convert radians to degrees)
    const rotX = document.getElementById('rot-x');
    const rotY = document.getElementById('rot-y');
    const rotZ = document.getElementById('rot-z');

    if (rotX) rotX.value = Math.round((object.rotation.x * 180) / Math.PI);
    if (rotY) rotY.value = Math.round((object.rotation.y * 180) / Math.PI);
    if (rotZ) rotZ.value = Math.round((object.rotation.z * 180) / Math.PI);

    // Calculate and update actual geometry dimensions
    if (object.geometry) {
        // Force recomputation of bounding box
        object.geometry.computeBoundingBox();
        const bbox = object.geometry.boundingBox;

        if (bbox && bbox.min && bbox.max) {
            const dimensions = {
                x: Math.abs(bbox.max.x - bbox.min.x),
                y: Math.abs(bbox.max.y - bbox.min.y),
                z: Math.abs(bbox.max.z - bbox.min.z)
            };

            ['x', 'y', 'z'].forEach(axis => {
                const input = document.getElementById(`dim-${axis}`);
                if (input) {
                    input.value = isFinite(dimensions[axis]) ? dimensions[axis].toFixed(2) : '0.00';
                }
            });
        } else {
            // Clear dimensions if no valid bounding box
            ['x', 'y', 'z'].forEach(axis => {
                const input = document.getElementById(`dim-${axis}`);
                if (input) input.value = '0.00';
            });
        }
    }

    // Update material inputs (only for non-containers)
    const sceneController = window.modlerComponents?.sceneController;
    const isContainer = sceneController && object.userData && object.userData.id &&
                       sceneController.getObjectByMesh(object)?.isContainer;

    if (!isContainer && object.material) {
        const colorInput = document.getElementById('material-color');
        const opacityInput = document.getElementById('material-opacity');
        const opacityDisplay = document.getElementById('opacity-display');

        if (colorInput) {
            // Get original color (not selection color)
            const colorHex = object.material.userData.originalColor !== undefined
                ? object.material.userData.originalColor
                : object.material.color.getHex();
            colorInput.value = '#' + colorHex.toString(16).padStart(6, '0');
        }

        if (opacityInput && opacityDisplay) {
            // Update opacity
            const opacity = object.material.opacity || 1;
            opacityInput.value = opacity;
            opacityDisplay.textContent = opacity.toFixed(1);
        }
    }
};

// Helper function to update selected object info
function updateSelectedObjectInfo(object) {
    const nameDisplay = document.getElementById('selected-object-name');
    const typeDisplay = document.getElementById('selected-object-type');

    if (!object) {
        if (nameDisplay) nameDisplay.textContent = 'No object selected';
        if (typeDisplay) typeDisplay.textContent = '';
        return;
    }

    // Get object name and type from SceneController metadata if available
    const sceneController = window.modlerComponents?.sceneController;
    let objectName = 'Unnamed Object';
    let objectType = 'Object';

    if (sceneController) {
        const objectData = sceneController.getObjectByMesh(object);
        if (objectData) {
            objectName = objectData.name || objectData.metadata?.name || 'Unnamed Object';
            objectType = objectData.type || objectData.metadata?.type || 'Object';

            // Special handling for containers
            if (objectData.isContainer) {
                objectType = 'Container (' + objectType + ')';
            }
        }
    }

    // Fallback to object.name if no SceneController data
    if (objectName === 'Unnamed Object' && object.name) {
        objectName = object.name;
    }

    // Determine type from geometry if no other info available
    if (objectType === 'Object' && object.geometry) {
        switch (object.geometry.type) {
            case 'BoxGeometry':
                objectType = 'Cube';
                break;
            case 'SphereGeometry':
                objectType = 'Sphere';
                break;
            case 'PlaneGeometry':
                objectType = 'Plane';
                break;
            case 'CylinderGeometry':
                objectType = 'Cylinder';
                break;
            default:
                objectType = object.geometry.type.replace('Geometry', '');
        }
    }

    // Update the display
    if (nameDisplay) nameDisplay.textContent = objectName;
    if (typeDisplay) typeDisplay.textContent = objectType;
}

// Helper function to clear property panel
function clearPropertyPanel() {
    // Reset transform inputs
    const inputs = [
        'pos-x', 'pos-y', 'pos-z',
        'rot-x', 'rot-y', 'rot-z',
        'dim-x', 'dim-y', 'dim-z'
    ];

    inputs.forEach(id => {
        const input = document.getElementById(id);
        if (input) {
            input.value = id.startsWith('rot') ? '0' : '0.00';
        }
    });

    // Reset material inputs
    const colorInput = document.getElementById('material-color');
    const opacityInput = document.getElementById('material-opacity');
    const opacityDisplay = document.getElementById('opacity-display');

    if (colorInput) colorInput.value = '#ff0000';
    if (opacityInput) opacityInput.value = '1';
    if (opacityDisplay) opacityDisplay.textContent = '1.0';
}

// Update container-specific UI sections
function updateContainerSpecificUI(object) {
    const sceneController = window.modlerComponents?.sceneController;

    // Hide all container sections by default
    hideAllContainerSections();

    if (!sceneController || !object || !object.userData || !object.userData.id) {
        return;
    }

    const objectData = sceneController.getObject(object.userData.id);

    if (objectData && objectData.isContainer) {
        // Show container sections
        showContainerSections(objectData);
        updateContainerControls(objectData);
    } else {
        // Check if object is child of a container (show fill controls)
        if (objectData && objectData.parentContainer) {
            const parentContainer = sceneController.getObject(objectData.parentContainer);
            if (parentContainer && parentContainer.autoLayout && parentContainer.autoLayout.enabled) {
                showFillControls(objectData);
            }
        }
    }
}

// Hide all container sections
function hideAllContainerSections() {
    const sections = [
        'container-layout-section',
        'container-fill-section',
        'container-sizing-section'
    ];

    sections.forEach(sectionId => {
        const section = document.getElementById(sectionId);
        if (section) {
            section.style.display = 'none';
        }
    });
}

// Show container sections for containers
function showContainerSections(containerData) {
    // Always show sizing mode for containers
    const sizingSection = document.getElementById('container-sizing-section');
    if (sizingSection) {
        sizingSection.style.display = 'block';
    }

    // Show layout section for containers
    const layoutSection = document.getElementById('container-layout-section');
    if (layoutSection) {
        layoutSection.style.display = 'block';
    }
}

// Show fill controls for objects inside layout containers
function showFillControls(objectData) {
    const fillSection = document.getElementById('container-fill-section');
    if (fillSection) {
        fillSection.style.display = 'block';
    }
}

// Update container control states
function updateContainerControls(containerData) {
    // Update sizing mode buttons
    updateSizingModeButtons(containerData.sizingMode || 'hug');

    // Update layout controls if auto layout is enabled
    if (containerData.autoLayout && containerData.autoLayout.enabled) {
        updateLayoutControls(containerData.autoLayout);
    } else {
        clearLayoutControls();
    }
}

// Update sizing mode buttons
function updateSizingModeButtons(currentMode) {
    const hugButton = document.getElementById('sizing-hug');
    const fixedButton = document.getElementById('sizing-fixed');
    const description = document.getElementById('sizing-description');

    // Clear active states
    if (hugButton) hugButton.classList.remove('active');
    if (fixedButton) fixedButton.classList.remove('active');

    // Set active state and description
    if (currentMode === 'fixed') {
        if (fixedButton) fixedButton.classList.add('active');
        if (description) description.textContent = 'Container has fixed dimensions that can be manually adjusted';
    } else {
        if (hugButton) hugButton.classList.add('active');
        if (description) description.textContent = 'Container automatically resizes to fit its contents';
    }
}

// Update layout controls
function updateLayoutControls(autoLayout) {
    const direction = autoLayout.direction;

    // Update axis buttons
    updateLayoutAxisButtons(direction);

    // Show/update gap and padding sections
    if (direction) {
        const gapSection = document.getElementById('layout-gap-section');
        const paddingSection = document.getElementById('layout-padding-section');

        if (gapSection) gapSection.style.display = 'block';
        if (paddingSection) paddingSection.style.display = 'block';

        // Update gap value
        const gapInput = document.getElementById('layout-gap');
        if (gapInput && autoLayout.gap !== undefined) {
            gapInput.value = autoLayout.gap;
        }

        // Update padding values
        if (autoLayout.padding) {
            ['top', 'right', 'bottom', 'left'].forEach(side => {
                const input = document.getElementById(`padding-${side}`);
                if (input && autoLayout.padding[side] !== undefined) {
                    input.value = autoLayout.padding[side];
                }
            });
        }
    }
}

// Clear layout controls
function clearLayoutControls() {
    // Clear axis button active states
    document.querySelectorAll('.axis-button').forEach(btn => {
        btn.classList.remove('active');
    });

    // Hide gap and padding sections
    const gapSection = document.getElementById('layout-gap-section');
    const paddingSection = document.getElementById('layout-padding-section');

    if (gapSection) gapSection.style.display = 'none';
    if (paddingSection) paddingSection.style.display = 'none';
}

// Update layout axis buttons (from existing PropertyPanel class)
function updateLayoutAxisButtons(selectedAxis) {
    // Clear all active states
    document.querySelectorAll('.axis-button').forEach(btn => {
        btn.classList.remove('active');
    });

    // Set active state for selected axis
    const buttonMap = { 'x': 'axis-w', 'y': 'axis-h', 'z': 'axis-d' };
    const activeButtonId = buttonMap[selectedAxis];
    if (activeButtonId) {
        const activeButton = document.getElementById(activeButtonId);
        if (activeButton) {
            activeButton.classList.add('active');
        }
    }
}

// Hide accordion content when no object is selected
function hideAccordionContent() {
    const accordion = document.querySelector('.accordion');
    if (accordion) {
        accordion.style.display = 'none';
    }
}

// Show accordion content when object is selected
function showAccordionContent() {
    const accordion = document.querySelector('.accordion');
    if (accordion) {
        accordion.style.display = 'block';
    }
}

// Update material section visibility based on object type
function updateMaterialSectionVisibility(object) {
    const materialSection = document.getElementById('material-section');
    if (!materialSection) return;

    const sceneController = window.modlerComponents?.sceneController;

    // Hide material section for containers
    if (sceneController && object && object.userData && object.userData.id) {
        const objectData = sceneController.getObjectByMesh(object);
        if (objectData && objectData.isContainer) {
            materialSection.style.display = 'none';
            return;
        }
    }

    // Show material section for regular objects
    materialSection.style.display = 'block';
}

// Hide material section
function hideMaterialSection() {
    const materialSection = document.getElementById('material-section');
    if (materialSection) {
        materialSection.style.display = 'none';
    }
}