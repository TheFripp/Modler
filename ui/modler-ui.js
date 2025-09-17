// Modler V2 UI - Direct Implementation  
// Global UI state
let uiComponents = null;
let selectedObjects = new Set();
let currentTool = 'select';
function initializeModlerUI(modlerComponents) {
    try {
        console.log('Initializing ModlerUI...', modlerComponents ? 'with components' : 'layout only');
        
        createUILayout();
        createToolbar();
        createSidebars();
        
        if (modlerComponents) {
            uiComponents = modlerComponents;
            connectToV2Systems();
            console.log('Connected to V2 systems');
        }
        
        console.log('ModlerUI initialized successfully');
        
        return {
            updateSelection: () => updatePropertiesPanel(),
            updateHierarchy: () => updateHierarchyTree()
        };
    } catch (error) {
        console.error('Error initializing ModlerUI:', error);
        throw error;
    }
}

function createUILayout() {
    document.body.innerHTML = `
        <div class="modler-app">
            <div class="modler-toolbar" id="toolbar"></div>
            <div class="modler-content">
                <div class="modler-sidebar-left" id="sidebar-left">
                    <div class="panel-header">Scene</div>
                    <div class="panel-content" id="hierarchy"></div>
                </div>
                <div class="modler-viewport">
                    <canvas id="canvas"></canvas>
                </div>
                <div class="modler-sidebar-right" id="sidebar-right">
                    <div class="accordion" id="accordion"></div>
                </div>
            </div>
        </div>
    `;
}

function createToolbar() {
    const toolbar = document.getElementById('toolbar');
    toolbar.innerHTML = `
        <div class="toolbar-section">
            <button class="toolbar-button icon-select active" id="tool-select" onclick="switchTool('select')" title="Select (1)"></button>
            <button class="toolbar-button icon-move" id="tool-move" onclick="switchTool('move')" title="Move (2)"></button>
        </div>
        <div class="toolbar-divider"></div>
        <div class="toolbar-section">
            <button class="toolbar-button icon-cube" onclick="createObject('cube')" title="Add Cube"></button>
            <button class="toolbar-button icon-sphere" onclick="createObject('sphere')" title="Add Sphere"></button>
            <button class="toolbar-button icon-plane" onclick="createObject('plane')" title="Add Plane"></button>
        </div>
        <div class="toolbar-divider"></div>
        <div class="toolbar-section">
            <button class="toolbar-button icon-delete" onclick="deleteSelected()" title="Delete (Del)"></button>
        </div>
    `;
    
    // Keyboard shortcuts are handled by InputController in the main system
    // No need for duplicate event listeners here
}

function createSidebars() {
    const accordion = document.getElementById('accordion');
    accordion.innerHTML = `
        <div class="accordion-item expanded">
            <button class="accordion-header" onclick="toggleAccordion(this)">
                Properties <span class="accordion-icon">▼</span>
            </button>
            <div class="accordion-content">
                <div class="accordion-body">
                    <div class="form-group">
                        <label class="form-label">Position</label>
                        <div class="xyz-inputs">
                            <div class="xyz-input"><label class="xyz-label">X</label><input type="number" id="pos-x" step="0.1" value="0" onchange="updateProperty('position', 'x', this.value)"></div>
                            <div class="xyz-input"><label class="xyz-label">Y</label><input type="number" id="pos-y" step="0.1" value="0" onchange="updateProperty('position', 'y', this.value)"></div>
                            <div class="xyz-input"><label class="xyz-label">Z</label><input type="number" id="pos-z" step="0.1" value="0" onchange="updateProperty('position', 'z', this.value)"></div>
                        </div>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Rotation</label>
                        <div class="xyz-inputs">
                            <div class="xyz-input"><label class="xyz-label">X</label><input type="number" id="rot-x" step="1" value="0" onchange="updateProperty('rotation', 'x', this.value)"></div>
                            <div class="xyz-input"><label class="xyz-label">Y</label><input type="number" id="rot-y" step="1" value="0" onchange="updateProperty('rotation', 'y', this.value)"></div>
                            <div class="xyz-input"><label class="xyz-label">Z</label><input type="number" id="rot-z" step="1" value="0" onchange="updateProperty('rotation', 'z', this.value)"></div>
                        </div>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Scale</label>
                        <div class="xyz-inputs">
                            <div class="xyz-input"><label class="xyz-label">X</label><input type="number" id="scale-x" step="0.1" value="1" onchange="updateProperty('scale', 'x', this.value)"></div>
                            <div class="xyz-input"><label class="xyz-label">Y</label><input type="number" id="scale-y" step="0.1" value="1" onchange="updateProperty('scale', 'y', this.value)"></div>
                            <div class="xyz-input"><label class="xyz-label">Z</label><input type="number" id="scale-z" step="0.1" value="1" onchange="updateProperty('scale', 'z', this.value)"></div>
                        </div>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Dimensions</label>
                        <div class="xyz-inputs">
                            <div class="xyz-input"><label class="xyz-label">W</label><input type="number" id="dim-x" step="0.1" value="0" readonly></div>
                            <div class="xyz-input"><label class="xyz-label">H</label><input type="number" id="dim-y" step="0.1" value="0" readonly></div>
                            <div class="xyz-input"><label class="xyz-label">D</label><input type="number" id="dim-z" step="0.1" value="0" readonly></div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        <div class="accordion-item">
            <button class="accordion-header" onclick="toggleAccordion(this)">
                Scene <span class="accordion-icon">▶</span>
            </button>
            <div class="accordion-content">
                <div class="accordion-body">
                    <div class="form-group">
                        <label class="form-label">Background</label>
                        <input type="color" class="form-input" value="#1e1e1e">
                    </div>
                </div>
            </div>
        </div>
    `;
}

function connectToV2Systems() {
    try {
        // Sync tool state
        if (uiComponents && uiComponents.toolController) {
            currentTool = uiComponents.toolController.getActiveToolName() || 'select';
            updateToolButtons();
            console.log('Tool controller connected, active tool:', currentTool);
        }
        
        // Setup selection sync with object reference tracking
        let lastPropertiesUpdate = 0;
        const forceUpdateInterval = 1000; // Force update every 1 second

        function setsEqual(set1, set2) {
            if (set1.size !== set2.size) return false;
            for (let item of set1) {
                if (!set2.has(item)) return false;
            }
            return true;
        }

        setInterval(() => {
            try {
                if (uiComponents && uiComponents.selectionController) {
                    const current = uiComponents.selectionController.getSelectedObjects();
                    const currentSet = new Set(current);
                    const now = Date.now();

                    // Update if selection changed OR if enough time has passed (for object state changes)
                    const selectionChanged = !setsEqual(currentSet, selectedObjects);
                    const shouldForceUpdate = (now - lastPropertiesUpdate) > forceUpdateInterval;

                    if (selectionChanged || shouldForceUpdate) {
                        selectedObjects = currentSet;
                        updatePropertiesPanel();
                        updateHierarchyTree();
                        lastPropertiesUpdate = now;
                    }
                }
            } catch (error) {
                console.warn('Error in selection sync:', error);
            }
        }, 100);
        
        console.log('V2 systems connected successfully');
    } catch (error) {
        console.error('Error connecting to V2 systems:', error);
    }
}

function switchTool(toolName) {
    if (uiComponents?.toolController) {
        uiComponents.toolController.switchToTool(toolName);
        currentTool = toolName;
        updateToolButtons();
    }
}

function updateToolButtons() {
    document.querySelectorAll('.toolbar-button').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.getElementById(`tool-${currentTool}`);
    if (activeBtn) activeBtn.classList.add('active');
}

function createObject(type) {
    if (!uiComponents?.sceneController) return;
    
    let geometry, material;
    switch (type) {
        case 'cube':
            geometry = new THREE.BoxGeometry(2, 2, 2);
            material = new THREE.MeshLambertMaterial({ color: 0x888888 });
            break;
        case 'sphere':
            geometry = new THREE.SphereGeometry(1, 16, 16);
            material = new THREE.MeshLambertMaterial({ color: 0x888888 });
            break;
        case 'plane':
            geometry = new THREE.PlaneGeometry(2, 2);
            material = new THREE.MeshLambertMaterial({ color: 0x888888 });
            break;
    }
    
    if (geometry && material) {
        const obj = uiComponents.sceneController.addObject(geometry, material, {
            name: `${type}_${Date.now()}`,
            type: type,
            position: new THREE.Vector3(0, 0, 0)
        });
        
        // Select new object
        if (uiComponents.selectionController) {
            uiComponents.selectionController.clearSelection();
            uiComponents.selectionController.select(obj.mesh);
        }
        
        updateHierarchyTree();
    }
}

function deleteSelected() {
    if (selectedObjects.size === 0) return;
    
    selectedObjects.forEach(obj => {
        if (uiComponents?.sceneController) {
            uiComponents.sceneController.removeObject(obj);
        }
    });
    
    if (uiComponents?.selectionController) {
        uiComponents.selectionController.clearSelection();
    }
    
    updateHierarchyTree();
}

function toggleAccordion(header) {
    const item = header.parentElement;
    const icon = header.querySelector('.accordion-icon');
    
    item.classList.toggle('expanded');
    icon.textContent = item.classList.contains('expanded') ? '▼' : '▶';
}

function updateProperty(type, axis, value) {
    selectedObjects.forEach(obj => {
        if (obj[type]) {
            obj[type][axis] = parseFloat(value);

            // Update related meshes (selection boxes, wireframes) after property change
            const meshSynchronizer = window.modlerComponents?.meshSynchronizer;
            if (meshSynchronizer) {
                // Use 'geometry' change type for scale changes since they affect object bounds
                const changeType = type === 'scale' ? 'geometry' : 'transform';
                meshSynchronizer.syncAllRelatedMeshes(obj, changeType);
            }

            // Also trigger selection visualizer update
            const selectionController = window.modlerComponents?.selectionController;
            if (selectionController && selectionController.isSelected(obj)) {
                if (selectionController.selectionVisualizer) {
                    selectionController.selectionVisualizer.updateObjectVisual(obj, true);
                }
            }
        }
    });
}

function updatePropertiesPanel() {
    console.log(`📊 updatePropertiesPanel called, selectedObjects.size: ${selectedObjects.size}`);

    if (selectedObjects.size === 0) {
        console.log(`📊 Clearing properties panel (no selection)`);
        ['pos', 'rot', 'scale'].forEach(type => {
            ['x', 'y', 'z'].forEach(axis => {
                const input = document.getElementById(`${type}-${axis}`);
                if (input) input.value = type === 'scale' ? '1' : '0';
            });
        });
        // Clear dimensions
        ['x', 'y', 'z'].forEach(axis => {
            const input = document.getElementById(`dim-${axis}`);
            if (input) input.value = '0';
        });
        return;
    }

    const first = Array.from(selectedObjects)[0];
    if (first) {
        console.log(`📊 Updating properties for object: ${first.name || 'unnamed'}`);

        if (first.geometry && first.geometry.boundingBox) {
            const bbox = first.geometry.boundingBox;
            const dims = {
                x: Math.abs(bbox.max.x - bbox.min.x) * Math.abs(first.scale.x),
                y: Math.abs(bbox.max.y - bbox.min.y) * Math.abs(first.scale.y),
                z: Math.abs(bbox.max.z - bbox.min.z) * Math.abs(first.scale.z)
            };
            console.log(`📏 Current dimensions: W:${dims.x.toFixed(2)} H:${dims.y.toFixed(2)} D:${dims.z.toFixed(2)}`);
        }
        ['position', 'rotation', 'scale'].forEach((type, i) => {
            const prefix = ['pos', 'rot', 'scale'][i];
            if (first[type]) {
                ['x', 'y', 'z'].forEach(axis => {
                    const input = document.getElementById(`${prefix}-${axis}`);
                    if (input) input.value = first[type][axis].toFixed(2);
                });
            }
        });

        // Calculate and display actual geometry dimensions
        if (first.geometry) {
            // Force recomputation of bounding box to ensure we have latest data
            first.geometry.computeBoundingBox();
            const bbox = first.geometry.boundingBox;

            if (bbox && bbox.min && bbox.max) {
                // Validate bounding box data
                const isValidBBox = (
                    isFinite(bbox.min.x) && isFinite(bbox.min.y) && isFinite(bbox.min.z) &&
                    isFinite(bbox.max.x) && isFinite(bbox.max.y) && isFinite(bbox.max.z)
                );

                if (isValidBBox) {
                    const dimensions = {
                        x: Math.abs(bbox.max.x - bbox.min.x) * Math.abs(first.scale.x),
                        y: Math.abs(bbox.max.y - bbox.min.y) * Math.abs(first.scale.y),
                        z: Math.abs(bbox.max.z - bbox.min.z) * Math.abs(first.scale.z)
                    };

                    ['x', 'y', 'z'].forEach(axis => {
                        const input = document.getElementById(`dim-${axis}`);
                        if (input) {
                            const value = isFinite(dimensions[axis]) ? dimensions[axis].toFixed(2) : '0.00';
                            input.value = value;
                        }
                    });
                } else {
                    // Invalid bounding box, clear dimensions
                    ['x', 'y', 'z'].forEach(axis => {
                        const input = document.getElementById(`dim-${axis}`);
                        if (input) input.value = '0.00';
                    });
                }
            }
        }
    }
}

function updateHierarchyTree() {
    const container = document.getElementById('hierarchy');
    if (!container || !uiComponents?.sceneController) return;
    
    container.innerHTML = '<div class="tree-view" id="tree-view"></div>';
    const tree = document.getElementById('tree-view');
    
    const stats = uiComponents.sceneController.getStats();
    if (stats?.objects) {
        Object.values(stats.objects).forEach(obj => {
            const item = document.createElement('div');
            item.className = 'tree-item';
            if (selectedObjects.has(obj.mesh)) item.classList.add('selected');
            
            item.innerHTML = `<span class="tree-icon">◻</span><span>${obj.metadata.name || 'Unnamed'}</span>`;
            item.onclick = () => {
                if (uiComponents.selectionController) {
                    uiComponents.selectionController.clearSelection();
                    uiComponents.selectionController.select(obj.mesh);
                }
            };
            
            tree.appendChild(item);
        });
    }
}

// Export updatePropertiesPanel globally for tools to use
window.updatePropertiesPanel = updatePropertiesPanel;

// Export updatePropertyPanelFromObject for tools that want to update for specific objects
window.updatePropertyPanelFromObject = function(object) {
    if (object) {
        // Update the selectedObjects to match the provided object
        selectedObjects.clear();
        selectedObjects.add(object);
    } else {
        // Clear selection
        selectedObjects.clear();
    }
    // Trigger the panel update
    updatePropertiesPanel();
};

// Export updatePropertyPanelDisplay for tools that want to update display without affecting selection
window.updatePropertyPanelDisplay = function(object) {
    if (!object) {
        return;
    }

    // Update display directly without modifying selectedObjects
    ['position', 'rotation', 'scale'].forEach((type, i) => {
        const prefix = ['pos', 'rot', 'scale'][i];
        if (object[type]) {
            ['x', 'y', 'z'].forEach(axis => {
                const input = document.getElementById(`${prefix}-${axis}`);
                if (input) input.value = object[type][axis].toFixed(2);
            });
        }
    });

    // Calculate and display actual geometry dimensions
    if (object.geometry) {
        // Force recomputation of bounding box to ensure we have latest data
        object.geometry.computeBoundingBox();
        const bbox = object.geometry.boundingBox;

        if (bbox && bbox.min && bbox.max) {
            // Validate bounding box data
            const isValidBBox = (
                isFinite(bbox.min.x) && isFinite(bbox.min.y) && isFinite(bbox.min.z) &&
                isFinite(bbox.max.x) && isFinite(bbox.max.y) && isFinite(bbox.max.z)
            );

            if (isValidBBox) {
                const dimensions = {
                    x: Math.abs(bbox.max.x - bbox.min.x) * Math.abs(object.scale.x),
                    y: Math.abs(bbox.max.y - bbox.min.y) * Math.abs(object.scale.y),
                    z: Math.abs(bbox.max.z - bbox.min.z) * Math.abs(object.scale.z)
                };

                ['x', 'y', 'z'].forEach(axis => {
                    const input = document.getElementById(`dim-${axis}`);
                    if (input) {
                        const value = isFinite(dimensions[axis]) ? dimensions[axis].toFixed(2) : '0.00';
                        input.value = value;
                    }
                });
            } else {
                // Invalid bounding box, clear dimensions
                ['x', 'y', 'z'].forEach(axis => {
                    const input = document.getElementById(`dim-${axis}`);
                    if (input) input.value = '0.00';
                });
            }
        }
    }
};

// Object modification notification system
window.notifyObjectModified = function(object, modificationType = 'geometry') {
    // Force immediate properties panel update if this object is selected
    if (selectedObjects.has(object)) {
        updatePropertiesPanel();
    }

    // Mark object as recently modified for enhanced sync detection
    object.userData = object.userData || {};
    object.userData.lastModified = Date.now();
    object.userData.modificationType = modificationType;
};