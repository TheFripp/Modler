/**
 * Modler V2 - System Integration
 * Streamlined initialization and component coordination
 */

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
    modlerV2Components.fieldNavigationManager = new FieldNavigationManager();

    // Initialize selection system components
    modlerV2Components.selectionVisualizer = new SelectionVisualizer();
    modlerV2Components.containerInteractionManager = new ContainerInteractionManager();
    modlerV2Components.selectionController = new SelectionController();

    // Connect selection components
    modlerV2Components.selectionController.initialize(
        modlerV2Components.selectionVisualizer,
        modlerV2Components.containerInteractionManager
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


    // Initialize PropertyUpdateHandler for property-panel driven layout system
    modlerV2Components.propertyUpdateHandler = new PropertyUpdateHandler();

    // Initialize components that depend on ConfigurationManager
    if (modlerV2Components.selectionVisualizer) {
        modlerV2Components.selectionVisualizer.initializeWithConfigurationManager();
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
    
    // Connect snap system to animation loop
    const { sceneFoundation, snapController, snapVisualizer, toolController, selectionController } = modlerV2Components;
    
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

    const floorPlane = new THREE.Mesh(
        new THREE.PlaneGeometry(20, 20),
        new THREE.MeshBasicMaterial({
            transparent: true,
            opacity: 0.0,
            side: THREE.DoubleSide
        })
    );
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
    const material = new THREE.MeshLambertMaterial({ color: 0x999999 });
    const sc = modlerV2Components.sceneController;
    
    const objects = [
        [new THREE.BoxGeometry(2, 2, 2), 'Test Cube', new THREE.Vector3(0, 1, 0)],
        [new THREE.BoxGeometry(1.5, 1.5, 1.5), 'Small Cube', new THREE.Vector3(3, 0.75, 2)],
        [new THREE.CylinderGeometry(1, 1, 2, 8), 'Test Cylinder', new THREE.Vector3(-3, 1, -2)]
    ];
    
    objects.forEach(([geometry, name, position]) => {
        sc.addObject(geometry, material, { name, type: 'test', position });
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