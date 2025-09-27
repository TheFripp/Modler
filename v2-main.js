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
        
        // Initialize in dependency order
        initializeFoundation(canvas);
        initializeScene();
        initializeInteraction();
        initializeApplication();

        // Expose components globally BEFORE creating content so SceneController can access them
        window.modlerComponents = modlerV2Components;

        initializeContent();
        connectComponents();
        setupObjectSystemIntegration();
        
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

    // Initialize centralized factory instances (Phase 1 - Factory Consolidation)
    // These will be injected into components instead of each creating their own
    modlerV2Components.geometryFactory = new GeometryFactory();
    modlerV2Components.materialManager = new MaterialManager();
    modlerV2Components.supportMeshFactory = new SupportMeshFactory(
        modlerV2Components.geometryFactory,
        modlerV2Components.materialManager
    );


    // Consolidated input system - initialized after Scene components are ready
    // Replaces InputFoundation + InputHandler with unified InputController
}

/**
 * Initialize Scene Layer components
 */
function initializeScene() {
    modlerV2Components.sceneController = new SceneController(modlerV2Components.sceneFoundation.scene);

    // Inject centralized factories (Phase 1 - Factory Consolidation)
    modlerV2Components.visualEffects = new VisualEffects(
        modlerV2Components.sceneFoundation.scene,
        modlerV2Components.geometryFactory,
        modlerV2Components.materialManager
    );

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
    }

    // Initialize PropertyManager
    const { propertyManager } = modlerV2Components;
    if (propertyManager) {
        propertyManager.initialize();
    }

    // Initialize NavigationController with required components
    const { navigationController, selectionController, visualizationManager, containerVisualizer } = modlerV2Components;
    if (navigationController && selectionController && visualizationManager) {
        // Note: containerVisualizer is part of visualizationManager
        const containerViz = visualizationManager.containerVisualizer;
        if (containerViz) {
            navigationController.initialize(selectionController, visualizationManager, containerViz);
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
 * Create hierarchical grid with center at (0,0) on major intersection
 * - Major grid: 10-unit squares with thick lines
 * - Mid grid: 5-unit half-divisions with medium lines
 * - Minor grid: 0.5-unit subdivisions with thin lines
 * @param {number} majorColor - Color of major grid lines (10-unit)
 * @param {number} minorColor - Color of minor grid lines (0.5-unit)
 * @returns {THREE.Group} Grid group with fade-out effect
 */
function createFadeOutGrid(majorColor, minorColor) {
    const group = new THREE.Group();
    const gridExtent = 25; // Grid extends from -25 to +25 in both directions

    const positions = [];
    const colors = [];

    const majorGridColor = new THREE.Color(majorColor);
    const midGridColor = new THREE.Color(majorColor).multiplyScalar(0.7); // 70% of major color
    const minorGridColor = new THREE.Color(minorColor);
    const backgroundColor = new THREE.Color(0x1a1a1a); // Scene background color

    // Generate all grid lines with 0.5 unit spacing (200 lines total: -25 to +25 in 0.5 increments)
    for (let i = -50; i <= 50; i++) {
        const position = i * 0.5; // Convert to world position (-25 to +25)

        // Calculate distance from center for fade-out effect
        const distanceFromCenter = Math.abs(position) / gridExtent;
        const fadeStrength = Math.max(0, 1 - Math.pow(distanceFromCenter * 1.1, 2));

        // Only add lines that have some visibility
        if (fadeStrength > 0.1) { // Increased threshold to reduce artifacts
            let baseLineColor;

            // Determine line type and color
            if (i % 20 === 0) {
                // Major grid lines (every 10 units: -20, -10, 0, +10, +20)
                baseLineColor = majorGridColor;
            } else if (i % 10 === 0) {
                // Mid grid lines (every 5 units: -15, -5, +5, +15)
                baseLineColor = midGridColor;
            } else {
                // Minor grid lines (every 0.5 units)
                baseLineColor = minorGridColor;
            }

            // Apply fade-out effect by interpolating toward background color
            const fadedColor = baseLineColor.clone().lerp(backgroundColor, 1 - fadeStrength);

            // Lines running front to back (Z direction)
            positions.push(position, 0, -gridExtent);
            positions.push(position, 0, gridExtent);
            colors.push(fadedColor.r, fadedColor.g, fadedColor.b);
            colors.push(fadedColor.r, fadedColor.g, fadedColor.b);

            // Lines running left to right (X direction)
            positions.push(-gridExtent, 0, position);
            positions.push(gridExtent, 0, position);
            colors.push(fadedColor.r, fadedColor.g, fadedColor.b);
            colors.push(fadedColor.r, fadedColor.g, fadedColor.b);
        }
    }

    // Create the line geometry
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

    // Create material with vertex colors
    const material = new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.8
    });

    // Create the grid mesh
    const grid = new THREE.LineSegments(geometry, material);

    group.add(grid);
    return group;
}

/**
 * Create floor grid with invisible raycast plane and fade-out effect
 */
function createFloorGrid() {
    // Create 5x5 grid with 10x10 subdivisions and fade-out effect
    const gridHelper = createFadeOutGrid(0x444444, 0x222222);

    // Get grid renderOrder from configuration to ensure it renders behind wireframes
    const configManager = modlerV2Components?.configurationManager;
    const gridRenderOrder = configManager ?
        configManager.get('visual.grid.renderOrder', -100) : -100;

    // Set renderOrder to prevent z-fighting with wireframes
    gridHelper.renderOrder = gridRenderOrder;

    // Access centralized systems for floor plane creation
    const geometryFactory = window.GeometryFactory ? new GeometryFactory() : null;
    const materialManager = window.MaterialManager ? new MaterialManager() : null;

    // Floor plane creation using centralized systems where available (50x50 to match grid)
    let planeGeometry, planeMaterial;

    if (geometryFactory) {
        planeGeometry = geometryFactory.createPlaneGeometry(50, 50);
    } else {
        planeGeometry = new THREE.PlaneGeometry(50, 50);
    }

    // Use MaterialManager for floor plane creation
    if (materialManager) {
        planeMaterial = materialManager.createMeshBasicMaterial({
            transparent: true,
            opacity: 0.0,
            side: THREE.DoubleSide
        });
    } else {
        planeMaterial = new THREE.MeshBasicMaterial({
            transparent: true,
            opacity: 0.0,
            side: THREE.DoubleSide
        });
    }

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
        }).catch(error => {
            console.error('❌ Modler V2 auto-initialization failed:', error);
        });
    } else {
        console.error('❌ Canvas element not found - Modler V2 initialization skipped');
    }
});