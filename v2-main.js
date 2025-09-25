/**
 * Modler V2 - System Integration
 * Streamlined initialization and component coordination
 */

// PropertyManager class (embedded to ensure loading)
class PropertyManager {
    constructor() {
        this.initialized = false;

        // Component references
        this.sceneController = null;
        this.selectionController = null;
        this.meshSynchronizer = null;
        this.layoutEngine = null;
        this.historyManager = null;

        // Property update throttling
        this.updateThrottles = new Map();
        this.throttleDelay = 100; // ms
    }

    /**
     * Initialize with required components
     */
    initialize() {
        this.sceneController = window.modlerComponents?.sceneController;
        this.selectionController = window.modlerComponents?.selectionController;
        this.meshSynchronizer = window.modlerComponents?.meshSynchronizer;
        this.layoutEngine = window.LayoutEngine || null;
        this.historyManager = window.modlerComponents?.historyManager;

        this.initialized = true;
        console.log('✅ PropertyManager initialized');
    }

    /**
     * Check if object has fill enabled for specific axis
     * @param {string} objectId - Object ID
     * @param {string} axis - 'x', 'y', or 'z'
     * @returns {boolean} True if fill is enabled
     */
    isAxisFilled(objectId, axis) {
        if (!this.sceneController) return false;

        const objectData = this.sceneController.getObject(objectId);
        if (!objectData || !objectData.layoutProperties) return false;

        const sizeProperty = `size${axis.toUpperCase()}`;
        return objectData.layoutProperties[sizeProperty] === 'fill';
    }

    /**
     * Check if object is in a layout-enabled container
     * @param {string} objectId - Object ID
     * @returns {boolean} True if in layout container
     */
    isInLayoutContainer(objectId) {
        if (!this.sceneController) return false;

        const objectData = this.sceneController.getObject(objectId);
        if (!objectData || !objectData.parentContainer) return false;

        const container = this.sceneController.getObject(objectData.parentContainer);
        return container && container.autoLayout && container.autoLayout.enabled;
    }

    /**
     * Toggle fill property for an axis
     * @param {string} axis - 'x', 'y', or 'z'
     */
    toggleFillProperty(axis) {
        if (!this.initialized) return;

        const selectedObjects = this.selectionController?.getSelectedObjects();
        if (!selectedObjects || selectedObjects.length === 0) return;

        const mesh = selectedObjects[0]; // Handle first selected object
        if (!mesh.userData?.id) return;

        const objectData = this.sceneController?.getObject(mesh.userData.id);
        if (!objectData) return;

        // Check if object is in a layout container
        if (!objectData.parentContainer) {
            console.warn('PropertyManager: Object is not in a container, cannot toggle fill');
            return;
        }

        const container = this.sceneController.getObject(objectData.parentContainer);
        if (!container || !container.autoLayout || !container.autoLayout.enabled) {
            console.warn('PropertyManager: Parent container does not have layout enabled');
            return;
        }

        // Initialize layoutProperties if needed
        if (!objectData.layoutProperties) {
            objectData.layoutProperties = {
                sizeX: 'fixed',
                sizeY: 'fixed',
                sizeZ: 'fixed'
            };
        }

        // Toggle fill state for the axis
        const sizeProperty = `size${axis.toUpperCase()}`;
        const currentState = objectData.layoutProperties[sizeProperty];
        const newState = currentState === 'fill' ? 'fixed' : 'fill';

        objectData.layoutProperties[sizeProperty] = newState;

        console.log(`PropertyManager: Toggled ${axis}-axis fill to ${newState} for object ${objectData.name}`);

        // Apply layout update
        if (this.sceneController) {
            this.sceneController.updateLayout(container.id);
        }

        // Update property panel display
        if (window.updatePropertyPanelFromObject) {
            window.updatePropertyPanelFromObject(mesh);
        }

        // Sync related meshes
        if (this.meshSynchronizer) {
            this.meshSynchronizer.syncRelatedMeshes(mesh);
        }

        // Notify SceneController
        this.sceneController.notifyObjectModified(objectData.id);

        // Trigger property panel refresh for all affected objects
        this.refreshLayoutPropertyPanels(container);
    }

    /**
     * Refresh property panels for all objects in a container when layout changes
     * @param {Object} container - Container data
     */
    refreshLayoutPropertyPanels(container) {
        if (!container || !this.sceneController) return;

        const children = this.sceneController.getChildren(container.id);
        if (!children || children.length === 0) return;

        // Refresh property panel if any child is currently selected
        const selectedObjects = this.selectionController?.getSelectedObjects();
        if (!selectedObjects || selectedObjects.length === 0) return;

        const selectedIds = selectedObjects.map(mesh => mesh.userData?.id).filter(Boolean);
        const shouldRefresh = children.some(child => selectedIds.includes(child.id));

        if (shouldRefresh) {
            // Trigger property panel update
            setTimeout(() => {
                if (window.updatePropertyPanelFromObject) {
                    window.updatePropertyPanelFromObject(selectedObjects[0]);
                }
            }, 100); // Small delay to allow layout calculations to complete
        }
    }
}

// Make PropertyManager available globally
window.PropertyManager = PropertyManager;

// System components registry
let modlerV2Components = {};
    
/**
 * Initialize the entire V2 system
 */
async function initializeModlerV2(canvas) {
    try {
        console.log('Modler V2 initializing...');
        
        // Initialize in dependency order
        initializeFoundation(canvas);
        initializeScene();
        initializeInteraction();
        initializeApplication();
        initializeContent();
        connectComponents();
        
        // Expose components globally
        window.modlerComponents = modlerV2Components;
        setupObjectSystemIntegration();
        
        console.log('Modler V2 ready');
        return true;
        
    } catch (error) {
        console.error('V2 System initialization failed:', error.message);
        alert(`Modler V2 failed to start: ${error.message}\n\nCheck console for details.`);
        return false;
    }
}
    
/**
 * Initialize Foundation Layer components
 */
function initializeFoundation(canvas) {
    modlerV2Components.sceneFoundation = new SceneFoundation(canvas);
    
    // Consolidated input system - initialized after Scene components are ready
    // Replaces InputFoundation + InputHandler with unified InputController
}

/**
 * Initialize Scene Layer components
 */
function initializeScene() {
    modlerV2Components.sceneController = new SceneController(modlerV2Components.sceneFoundation.scene);
    modlerV2Components.visualEffects = new VisualEffects(modlerV2Components.sceneFoundation.scene);
    modlerV2Components.snapVisualizer = new SnapVisualizer(
        modlerV2Components.sceneFoundation.scene,
        modlerV2Components.sceneFoundation.camera,
        modlerV2Components.sceneFoundation.canvas
    );
}

/**
 * Initialize Interaction Layer components
 */
function initializeInteraction() {
    // CONTAINER CRUD MANAGER: Container creation, configuration, and lifecycle operations
    modlerV2Components.containerCrudManager = new ContainerCrudManager();
    modlerV2Components.meshSynchronizer = new MeshSynchronizer();
    modlerV2Components.transformationManager = new TransformationManager();
    modlerV2Components.fieldNavigationManager = new FieldNavigationManager();

    // Initialize unified visualization system components
    modlerV2Components.visualizationManager = new VisualizationManager();
    modlerV2Components.containerInteractionManager = new ContainerInteractionManager();
    modlerV2Components.selectionController = new SelectionController();

    // Connect selection components
    modlerV2Components.selectionController.initialize(
        modlerV2Components.visualizationManager
        // containerInteractionManager removed - NavigationController handles all container context
    );

    // Move gizmo removed - face-based movement system is cleaner and more intuitive
    modlerV2Components.cameraController = new CameraController(
        modlerV2Components.sceneFoundation.camera,
        modlerV2Components.sceneFoundation.canvas
    );
    // Initialize consolidated InputController (replaces InputFoundation + InputHandler)
    modlerV2Components.inputController = new InputController(
        modlerV2Components.sceneFoundation.canvas,
        modlerV2Components.sceneFoundation.camera,
        modlerV2Components.sceneFoundation.scene,
        modlerV2Components.sceneController,
        modlerV2Components.visualEffects,
        modlerV2Components.selectionController
    );
}

/**
 * Initialize Application Layer components
 */
function initializeApplication() {
    modlerV2Components.configurationManager = new ConfigurationManager();

    // Initialize HistoryManager for undo/redo functionality
    modlerV2Components.historyManager = new HistoryManager();

    // Initialize NavigationController for centralized hierarchy navigation
    modlerV2Components.navigationController = new NavigationController();

    // Initialize PropertyUpdateHandler for property-panel driven layout system
    modlerV2Components.propertyUpdateHandler = new PropertyUpdateHandler();

    // Initialize PropertyManager for object property updates and fill functionality
    modlerV2Components.propertyManager = new PropertyManager();

    // Initialize components that depend on ConfigurationManager
    if (modlerV2Components.visualizationManager) {
        modlerV2Components.visualizationManager.initializeWithConfigurationManager();
    }

    modlerV2Components.snapController = new SnapController(
        modlerV2Components.sceneFoundation.scene,
        modlerV2Components.sceneFoundation.camera,
        modlerV2Components.inputController
    );

    // Move gizmo snap registration removed - face-based movement doesn't need grid snapping

    // Register SnapVisualizer with SnapController for centralized visual control
    if (modlerV2Components.snapVisualizer && modlerV2Components.snapController) {
        modlerV2Components.snapController.registerSnapSystem('snapVisualizer', modlerV2Components.snapVisualizer);
    }
    modlerV2Components.toolController = new ToolController(
        modlerV2Components.inputController,
        modlerV2Components.selectionController,
        modlerV2Components.visualEffects
    );
    
    // Register and activate tools
    const tools = [
        ['select', SelectTool],
        ['move', MoveTool],
        ['push', PushTool],
        ['box-creation', BoxCreationTool]
        // REMOVED: LayoutTool - Layout functionality moved to property-panel driven approach
    ];
    tools.forEach(([name, tool]) => modlerV2Components.toolController.registerTool(name, tool));
    modlerV2Components.toolController.switchToTool('select');
    
    registerSnapBehaviors();
}

/**
 * Initialize scene content
 */
function initializeContent() {
    createFloorGrid();
    createDemoObjects();
}

/**
 * Register snap behaviors for all tools
 */
function registerSnapBehaviors() {
    const sc = modlerV2Components.snapController;
    
    const snapBehaviors = {
        'move': {
            showSnapPoints: (sel) => modlerV2Components.toolController?.isDragging() && sel.length > 0,
            snapPointTypes: ['corner', 'edge', 'face'],
            snapOnHover: false,
            attachmentMode: 'constrained'
        },
        'push': {
            showSnapPoints: (sel) => modlerV2Components.toolController?.isPushing() && sel.length > 0,
            snapPointTypes: ['corner', 'edge'],
            snapOnHover: false,
            attachmentMode: 'constrained'
        },
        'box-creation': {
            showSnapPoints: (selectedObjects) => {
                // Enable snapping during height adjustment phase
                const boxTool = window.modlerComponents?.toolController?.activeTool;
                return boxTool && boxTool.state === 'setting_height'; // BoxCreationState.SETTING_HEIGHT
            },
            snapPointTypes: ['corner', 'edge', 'face'],
            snapOnHover: true,
            attachmentMode: 'free'
        },
        'select': {
            showSnapPoints: () => false,
            snapPointTypes: [],
            snapOnHover: false,
            attachmentMode: 'free'
        },
        'layout': {
            showSnapPoints: () => false,
            snapPointTypes: [],
            snapOnHover: false,
            attachmentMode: 'free'
        }
    };
    
    Object.entries(snapBehaviors).forEach(([tool, behavior]) => {
        sc.registerToolSnapBehavior(tool, behavior);
    });
}

/**
 * Connect components with circular dependencies
 */
function connectComponents() {
    // Move gizmo connection removed - face-based movement handles all object manipulation

    // Initialize HistoryManager
    const { historyManager } = modlerV2Components;
    if (historyManager) {
        historyManager.initialize();
        console.log('✅ HistoryManager initialized and connected');
    }

    // Initialize PropertyManager
    const { propertyManager } = modlerV2Components;
    if (propertyManager) {
        propertyManager.initialize();
        console.log('✅ PropertyManager initialized and connected');
    }

    // Initialize NavigationController with required components
    const { navigationController, selectionController, visualizationManager, containerVisualizer } = modlerV2Components;
    if (navigationController && selectionController && visualizationManager) {
        // Note: containerVisualizer is part of visualizationManager
        const containerViz = visualizationManager.containerVisualizer;
        if (containerViz) {
            navigationController.initialize(selectionController, visualizationManager, containerViz);
            console.log('✅ NavigationController initialized and connected');
        }
    }

    // Connect snap system to animation loop
    const { sceneFoundation, snapController, snapVisualizer, toolController } = modlerV2Components;

    if (sceneFoundation && snapController && snapVisualizer && toolController && selectionController) {
        sceneFoundation.addAnimationCallback(() => {
            const activeToolName = toolController.getActiveToolName();
            const selectedObjects = selectionController.getSelectedObjects();
            snapController.updateSnapDetection(activeToolName, selectedObjects);
            snapVisualizer.updateIndicators();
        });
    }
}

/**
 * Setup object system integration between SceneController and UI
 */
function setupObjectSystemIntegration() {
    if (modlerV2Components.sceneController && window.populateObjectList) {
        modlerV2Components.sceneController.on('objectAdded', window.populateObjectList);
        modlerV2Components.sceneController.on('objectRemoved', window.populateObjectList);
        window.populateObjectList();
    }
}
    
/**
 * Create floor grid with invisible raycast plane
 */
function createFloorGrid() {
    const gridHelper = new THREE.GridHelper(20, 20, 0x444444, 0x222222);

    // Get grid renderOrder from configuration to ensure it renders behind wireframes
    const configManager = modlerV2Components?.configurationManager;
    const gridRenderOrder = configManager ?
        configManager.get('visual.grid.renderOrder', -100) : -100;

    // Set renderOrder to prevent z-fighting with wireframes
    gridHelper.renderOrder = gridRenderOrder;

    // Access centralized systems for floor plane creation
    const geometryFactory = window.GeometryFactory ? new GeometryFactory() : null;
    const materialManager = window.MaterialManager ? new MaterialManager() : null;

    // Floor plane creation using centralized systems where available
    let planeGeometry, planeMaterial;

    if (geometryFactory) {
        planeGeometry = geometryFactory.createPlaneGeometry(20, 20);
    } else {
        planeGeometry = new THREE.PlaneGeometry(20, 20);
    }

    // Keep manual creation due to unique transparency properties for invisible raycast plane
    planeMaterial = new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0.0,
        side: THREE.DoubleSide
    });

    const floorPlane = new THREE.Mesh(planeGeometry, planeMaterial);
    floorPlane.rotation.x = -Math.PI / 2;
    floorPlane.position.y = -1.0;
    floorPlane.name = 'Floor Plane';

    const floorGroup = new THREE.Group();
    floorGroup.add(gridHelper);
    floorGroup.add(floorPlane);
    
    modlerV2Components.sceneController.addObject(floorGroup, null, {
        name: 'Floor Grid',
        type: 'grid',
        category: 'system',
        selectable: false
    });
}

/**
 * Create demo objects for testing
 */
function createDemoObjects() {
    // Access centralized systems for geometry and material creation
    const geometryFactory = window.GeometryFactory ? new GeometryFactory() : null;
    const materialManager = window.MaterialManager ? new MaterialManager() : null;
    const sc = modlerV2Components.sceneController;

    // Create a simple demonstration scene with centralized systems
    let material, geometry;

    if (materialManager) {
        material = materialManager.createMeshLambertMaterial({ color: 0x888888 });
    } else {
        material = new THREE.MeshLambertMaterial({ color: 0x888888 });
    }

    // Create a single test cube using centralized systems where available
    if (geometryFactory) {
        geometry = geometryFactory.createBoxGeometry(2, 2, 2);
    } else {
        geometry = new THREE.BoxGeometry(2, 2, 2);
    }

    sc.addObject(geometry, material, {
        name: 'Demo Cube',
        type: 'cube',
        position: new THREE.Vector3(0, 1, 0)
    });

}

/**
 * Get system status for debugging
 */
function getModlerV2Status() {
    return {
        components: Object.keys(modlerV2Components),
        sceneStats: modlerV2Components.sceneController?.getStats()
    };
}

// Auto-initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('canvas');
    if (canvas) {
        initializeModlerV2(canvas).then(() => {
            console.log('✅ Modler V2 auto-initialization complete');
        }).catch(error => {
            console.error('❌ Modler V2 auto-initialization failed:', error);
        });
    } else {
        console.error('❌ Canvas element not found - Modler V2 initialization skipped');
    }
});