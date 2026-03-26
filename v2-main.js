import * as THREE from 'three';
const logger = window.logger;
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
        // Expose components globally IMMEDIATELY so they're available even if initialization fails
        window.modlerComponents = modlerV2Components;

        // Check that required classes are loaded
        const requiredClasses = ['GeometryFactory', 'MaterialManager', 'SupportMeshFactory'];
        for (const className of requiredClasses) {
            if (typeof window[className] === 'undefined') {
                throw new Error(`Required class ${className} is not loaded. Check script loading order.`);
            }
        }

        // Initialize in dependency order
        initializeFoundation(canvas);
        initializeScene();
        initializeInteraction();
        initializeApplication();

        // Note: initializeContent() moved after connectComponents() to ensure
        // configuration is loaded before creating demo objects
        connectComponents();
        setupObjectSystemIntegration();
        initializeContent();

        // Validate component creation
        validateInitialization();

        // Emit success event for integration systems
        // Modler V2 initialization completed successfully
        window.dispatchEvent(new CustomEvent('modlerV2Ready', {
            detail: {
                success: true,
                components: Object.keys(modlerV2Components),
                timestamp: Date.now()
            }
        }));

        // Auto-load last scene (replaces demo objects if scene exists)
        await autoLoadLastScene();

        // MIGRATION: Update existing container interactive meshes to Layer 1
        // This fixes containers created before layer system was implemented
        migrateContainerInteractiveMeshesToLayer1();

        // MIGRATION: Apply raycast override to existing containers
        // This fixes container-first selection for containers created before raycast override was implemented
        if (window.LayoutGeometry && typeof window.LayoutGeometry.updateAllContainersWithRaycastOverride === 'function') {
            window.LayoutGeometry.updateAllContainersWithRaycastOverride();
        }

        // NOTE: Initial hierarchy sync now handled by panel-ready messages
        // Each UI panel sends ready message → handleUIPanelReady → sends hierarchy
        // This is more reliable than a timed emit and prevents Event Bus Violation warnings

        return true;

    } catch (error) {
        logger.error('V2 System initialization failed:', error.message);

        // Emit failure event for integration systems
        window.dispatchEvent(new CustomEvent('modlerV2Ready', {
            detail: {
                success: false,
                error: error.message,
                timestamp: Date.now()
            }
        }));

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

    // Hierarchy manager (Phase 5.1 Refactoring)
    modlerV2Components.sceneHierarchyManager = new SceneHierarchyManager();
    modlerV2Components.sceneHierarchyManager.initialize(
        modlerV2Components.sceneController.objects,
        modlerV2Components.sceneFoundation.scene,
        modlerV2Components.sceneController.rootChildrenOrder
    );

    // Layout manager (Phase 5.2 Refactoring)
    modlerV2Components.sceneLayoutManager = new SceneLayoutManager();
    modlerV2Components.sceneLayoutManager.initialize(
        modlerV2Components.sceneController
    );

    // Lifecycle manager (Phase 5.3 Refactoring)
    modlerV2Components.sceneLifecycleManager = new SceneLifecycleManager();
    modlerV2Components.sceneLifecycleManager.initialize(
        modlerV2Components.sceneFoundation.scene,
        modlerV2Components.sceneController.objects,
        modlerV2Components.sceneController.rootChildrenOrder,
        {
            nextId: 1,
            nextBoxNumber: 1,
            nextContainerNumber: 1
        }
    );

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

    modlerV2Components.toolGizmoManager = new ToolGizmoManager(
        modlerV2Components.sceneFoundation.scene,
        modlerV2Components.sceneFoundation.camera,
        modlerV2Components.materialManager
    );

    // Layout propagation manager (Phase 4 Refactoring)
    modlerV2Components.layoutPropagationManager = new LayoutPropagationManager();
    modlerV2Components.layoutPropagationManager.initialize(
        modlerV2Components.sceneController,
        modlerV2Components.objectStateManager
    );
}

/**
 * Initialize Interaction Layer components
 */
function initializeInteraction() {
    // UNIFIED STATE MANAGEMENT: Single source of truth for all object state
    modlerV2Components.objectStateManager = new ObjectStateManager();

    // CONTAINER CRUD MANAGER: Container creation, configuration, and lifecycle operations
    modlerV2Components.containerCrudManager = new ContainerCrudManager();
    modlerV2Components.transformationManager = new TransformationManager();

    // Wire up component references (Phase 4 & 5 Refactoring)
    if (modlerV2Components.layoutPropagationManager) {
        modlerV2Components.layoutPropagationManager.containerCrudManager = modlerV2Components.containerCrudManager;
    }
    if (modlerV2Components.sceneHierarchyManager) {
        modlerV2Components.sceneHierarchyManager.setObjectStateManager(modlerV2Components.objectStateManager);
    }

    // Initialize unified visualization system components
    modlerV2Components.visualizationManager = new VisualizationManager();
    modlerV2Components.selectionController = new SelectionController();

    modlerV2Components.selectionController.initialize(
        modlerV2Components.visualizationManager
    );

    // Move gizmo removed - face-based movement system is cleaner and more intuitive
    modlerV2Components.cameraController = new CameraController(
        modlerV2Components.sceneFoundation.camera,
        modlerV2Components.sceneFoundation.canvas
    );

    // Initialize axis gizmo for orientation display
    const gizmoContainer = document.getElementById('axis-gizmo-container');
    if (gizmoContainer && window.AxisGizmo) {
        modlerV2Components.axisGizmo = new AxisGizmo(gizmoContainer);
    }
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

    // Initialize ObjectSerializer for consistent object serialization
    modlerV2Components.objectSerializer = new ObjectSerializer();

    // Initialize Yard (material library)
    modlerV2Components.yardManager = new YardManager();

    // Initialize context menu (right-click on 3D objects)
    if (window.ContextMenu) {
        modlerV2Components.contextMenu = new ContextMenu();
    }

    // Initialize File System for scene save/load
    modlerV2Components.fileManager = new FileManager();
    modlerV2Components.fileManager.startAutoSave(); // Start 30-second auto-save

    // Initialize Export/Import Manager for file sharing
    modlerV2Components.exportImportManager = new ExportImportManager();

    // FileManagerHandler initialized in main-integration.js (follows SettingsHandler pattern)

    // Initialize components that depend on ConfigurationManager
    if (modlerV2Components.visualizationManager) {
        modlerV2Components.visualizationManager.initializeWithConfigurationManager();
    }

    // Update existing material instances with correct config values
    // Don't recreate materials - that would break references from existing objects
    if (modlerV2Components.supportMeshFactory && modlerV2Components.materialManager) {
        const configManager = modlerV2Components.configurationManager;
        const materialManager = modlerV2Components.materialManager;

        // Update existing material values to match loaded config
        const faceColor = configManager.get('visual.selection.color');
        const faceOpacity = configManager.get('visual.selection.faceHighlightOpacity');
        const containerColor = configManager.get('visual.containers.wireframeColor');
        const containerOpacity = configManager.get('visual.containers.faceHighlightOpacity');

        // Update the existing material instances (don't recreate - that breaks references!)
        materialManager.updateMaterialsOfType(materialManager.materialTypes.FACE_HIGHLIGHT, 'color', faceColor);
        materialManager.updateMaterialsOfType(materialManager.materialTypes.FACE_HIGHLIGHT, 'opacity', faceOpacity);

        materialManager.updateMaterialsOfType(materialManager.materialTypes.FACE_HIGHLIGHT_CONTAINER, 'color', containerColor);
        materialManager.updateMaterialsOfType(materialManager.materialTypes.FACE_HIGHLIGHT_CONTAINER, 'opacity', containerOpacity);

        materialManager.updateMaterialsOfType(materialManager.materialTypes.FACE_HIGHLIGHT_DISABLED, 'opacity', faceOpacity);

        // Install development validator to monitor unauthorized material modifications
        if (window.MaterialGuard) {
            MaterialGuard.installDevelopmentValidator(materialManager.activeMaterials);
        }
    }

    modlerV2Components.snapController = new SnapController(
        modlerV2Components.sceneFoundation.scene,
        modlerV2Components.sceneFoundation.camera,
        modlerV2Components.inputController
    );

    // Initialize MeasurementTool for Option+hover measurements
    modlerV2Components.measurementTool = new MeasurementTool();
    modlerV2Components.measurementTool.initialize(
        modlerV2Components.sceneController,
        modlerV2Components.sceneFoundation.camera,
        modlerV2Components.sceneFoundation.scene,
        modlerV2Components.sceneFoundation.renderer
    );

    // Subscribe to measurement color changes
    if (modlerV2Components.configurationManager) {
        modlerV2Components.configurationManager.subscribe('visual.measurement.color', (newColor) => {
            if (modlerV2Components.measurementTool) {
                modlerV2Components.measurementTool.updateColor(newColor);
            }
        });

        // Subscribe to gizmo size changes
        if (modlerV2Components.toolGizmoManager) {
            modlerV2Components.configurationManager.subscribe('visual.gizmo.size', (newValue) => {
                modlerV2Components.toolGizmoManager._sizeMultiplier = newValue || 1.0;
            });
        }
    }

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
        ['rotate', RotationTool],
        ['box-creation', BoxCreationTool],
        ['tile', TileTool]
    ];
    tools.forEach(([name, tool]) => modlerV2Components.toolController.registerTool(name, tool));
    modlerV2Components.toolController.switchToTool('select');

    registerSnapBehaviors();

    // Initialize ObjectStateManager with all systems ready
    modlerV2Components.objectStateManager.initialize({
        sceneController: modlerV2Components.sceneController
    });

    // Initialize KeyboardRouter for centralized keyboard input handling
    // Must be initialized AFTER all other components to ensure they're available
    modlerV2Components.keyboardRouter = window.keyboardRouter;
    modlerV2Components.keyboardRouter.initialize(modlerV2Components);

    // Add axis gizmo update to render loop
    if (modlerV2Components.axisGizmo) {
        modlerV2Components.sceneFoundation.addAnimationCallback(() => {
            modlerV2Components.axisGizmo.updateOrientation(modlerV2Components.sceneFoundation.camera);
        });
    }
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

// Initialize NavigationController with required components
    const { navigationController, selectionController, visualizationManager, containerVisualizer } = modlerV2Components;
    if (navigationController && selectionController && visualizationManager) {
        // Note: containerVisualizer is part of visualizationManager
        const containerViz = visualizationManager.containerVisualizer;
        if (containerViz) {
            navigationController.initialize(selectionController, visualizationManager, containerViz);
        }
    }

    // Initialize tile instance manager
    if (window.tileInstanceManager) {
        window.tileInstanceManager.initialize();
        modlerV2Components.tileInstanceManager = window.tileInstanceManager;
    }

    // Connect snap system to animation loop
    const { sceneFoundation, snapController, snapVisualizer, toolController } = modlerV2Components;

    if (sceneFoundation && snapController && snapVisualizer && toolController && selectionController) {
        sceneFoundation.addAnimationCallback(() => {
            // Skip snap detection when snapping is disabled — avoids unnecessary raycasts
            if (!snapController.isEnabled) return;
            const activeToolName = toolController.getActiveToolName();
            const selectedObjects = selectionController.getSelectedObjects();
            snapController.updateSnapDetection(activeToolName, selectedObjects);
            snapVisualizer.updateIndicators();
        });
    }
}

/**
 * Setup object system integration between SceneController and UI
 * UNIFIED SYSTEM: Bridge SceneController events to ObjectEventBus for consistent notification
 */
function setupObjectSystemIntegration() {
    const { sceneController, objectStateManager } = modlerV2Components;

    // NOTE: SceneController LIFECYCLE events (objectAdded/objectRemoved) are now handled by PropertyPanelSync
    // This eliminates redundant event listeners and ensures single source of truth for UI updates
    // Legacy window.populateObjectList() was never defined - removed dead code
}

/**
 * Validate that all critical components were created successfully
 */
function validateInitialization() {
    const requiredComponents = [
        'sceneFoundation',
        'sceneController',
        'objectStateManager',
        'selectionController',
        'inputController',
        'toolController'
    ];

    const missing = [];
    const created = [];

    for (const componentName of requiredComponents) {
        if (modlerV2Components[componentName]) {
            created.push(componentName);
        } else {
            missing.push(componentName);
        }
    }

    // Components created successfully

    if (missing.length > 0) {
        console.error(`❌ Missing components: ${missing.length} - [${missing.join(', ')}]`);
        throw new Error(`Critical components missing: ${missing.join(', ')}`);
    }

    // Verify window.modlerComponents is properly exposed
    if (!window.modlerComponents || Object.keys(window.modlerComponents).length === 0) {
        throw new Error('window.modlerComponents not properly exposed');
    }

    // Initialization validation successful - components ready
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
        opacity: 0.8,
        depthWrite: false  // Prevent z-fighting with wireframes at ground level
    });

    // Create the grid mesh
    const grid = new THREE.LineSegments(geometry, material);

    // Lower grid more to prevent z-fighting with objects at y=0
    grid.position.y = -0.1;

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

    // PERFORMANCE: Reuse centralized factory instances instead of creating new ones
    const geometryFactory = modlerV2Components.geometryFactory;
    const materialManager = modlerV2Components.materialManager;

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
            depthWrite: false, // Invisible plane must not block wireframes below the grid
            side: THREE.DoubleSide
        });
    } else {
        planeMaterial = new THREE.MeshBasicMaterial({
            transparent: true,
            opacity: 0.0,
            depthWrite: false,
            side: THREE.DoubleSide
        });
    }

    const floorPlane = new THREE.Mesh(planeGeometry, planeMaterial);
    floorPlane.rotation.x = -Math.PI / 2;
    floorPlane.position.y = -1.0;
    floorPlane.name = 'Floor Plane';
    floorPlane.raycast = () => {}; // Make floor plane non-raycastable (prevent click stealing)

    // Make grid helper and all its children non-raycastable recursively
    gridHelper.raycast = () => {};
    gridHelper.traverse(child => {
        child.raycast = () => {};
    });

    const floorGroup = new THREE.Group();
    floorGroup.add(gridHelper);
    floorGroup.add(floorPlane);

    // Make the group itself non-raycastable too
    floorGroup.raycast = () => {};
    
    modlerV2Components.sceneController.addObject(floorGroup, null, {
        name: 'Floor Grid',
        type: 'grid',
        category: 'system',
        selectable: false
    });
}

/**
 * Create demo objects for testing
 * UNIFIED SYSTEM: Uses ObjectStateManager to ensure proper notification pipeline
 */
function createDemoObjects() {
    // PERFORMANCE: Reuse centralized factory instances
    const geometryFactory = modlerV2Components.geometryFactory;
    const materialManager = modlerV2Components.materialManager;
    const objectStateManager = modlerV2Components.objectStateManager;
    const sc = modlerV2Components.sceneController;

    if (!objectStateManager) {
        console.error('ObjectStateManager not available for demo object creation');
        return;
    }

    // Create geometry and material
    let material, geometry;

    if (materialManager) {
        material = materialManager.createMeshLambertMaterial({ color: materialManager.colors.DEFAULT_OBJECT });
    } else {
        material = new THREE.MeshLambertMaterial({ color: 0x888888 });
    }

    if (geometryFactory) {
        geometry = geometryFactory.createBoxGeometry(2, 2, 2);
    } else {
        geometry = new THREE.BoxGeometry(2, 2, 2);
    }

    // Use SceneController.addObject for proper integration
    // This ensures selectable: true by default and triggers all necessary events
    const objectData = sc.addObject(geometry, material, {
        name: 'Demo Cube',
        type: 'box',
        position: new THREE.Vector3(0, 1, 0)
    });

    if (!objectData) {
        logger.error('❌ Failed to create Demo Cube');
    }

    // Add a second test cube
    const geometry2 = geometryFactory ? geometryFactory.createBoxGeometry(1, 1, 1) : new THREE.BoxGeometry(1, 1, 1);
    const material2 = materialManager ? materialManager.createMeshLambertMaterial({ color: 0xcccccc }) : new THREE.MeshLambertMaterial({ color: 0xcccccc });
    const objectData2 = sc.addObject(geometry2, material2, {
        name: 'Test Cube',
        type: 'box',
        position: new THREE.Vector3(2, 1, 0)
    });

    if (!objectData2) {
        logger.error('❌ Failed to create Test Cube');
    }
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

/**
 * Initialize Communication Bridge (Phase 3 Refactoring)
 * Sets up unified bidirectional communication between Main and UI
 */
// initializeCommunicationBridge removed - Phase 3 replaced by SimpleCommunication

/**
 * Auto-load the last opened scene if it exists
 * Called after FileManager initialization to restore user's last working state
 */
async function autoLoadLastScene() {
    const fileManager = modlerV2Components?.fileManager;
    if (!fileManager) {
        console.warn('autoLoadLastScene: FileManager not available');
        return;
    }

    try {
        // Get the last opened file ID
        const lastFileId = fileManager.getLastOpenedFileId();

        if (!lastFileId) {
            // No last file - check if any files exist
            const files = await fileManager.listFiles();
            if (files && files.length > 0) {
                // Load the most recently modified file
                const sortedFiles = [...files].sort((a, b) => b.modified - a.modified);
                await fileManager.loadScene(sortedFiles[0].id);
                console.log('autoLoadLastScene: Loaded most recent file');
            }
            return;
        }

        // Verify the file still exists
        const files = await fileManager.listFiles();
        const fileExists = files && files.some(f => f.id === lastFileId);

        if (fileExists) {
            // Load the last opened file
            await fileManager.loadScene(lastFileId);
            console.log('autoLoadLastScene: Loaded last opened file');
        } else {
            // Last file was deleted, load most recent
            if (files && files.length > 0) {
                const sortedFiles = [...files].sort((a, b) => b.modified - a.modified);
                await fileManager.loadScene(sortedFiles[0].id);
                console.log('autoLoadLastScene: Last file not found, loaded most recent file');
            }
        }
    } catch (error) {
        console.warn('autoLoadLastScene: Failed to auto-load scene:', error);
        // Continue with default scene if auto-load fails
    }
}

/**
 * MIGRATION: Ensure container interactive meshes are ONLY on Layer 1
 * Fixes containers that had interactive mesh on both Layer 0 and Layer 1,
 * which caused the mesh to block raycasts to children inside the container
 */
function migrateContainerInteractiveMeshesToLayer1() {
    const sceneController = modlerV2Components.sceneController;
    if (!sceneController) return;

    let migratedCount = 0;
    const allObjects = sceneController.getAllObjects();

    allObjects.forEach(objData => {
        if (objData.isContainer && objData.mesh) {
            const supportMeshes = objData.mesh.userData.supportMeshes;
            if (supportMeshes && supportMeshes.interactiveMesh) {
                // Ensure ONLY on Layer 1 (mask 2); fix for meshes on both Layer 0 and 1
                if (supportMeshes.interactiveMesh.layers.mask !== 2) {
                    supportMeshes.interactiveMesh.layers.set(1);
                    migratedCount++;
                }
            }
        }
    });

    if (migratedCount > 0) {
        console.log(`✅ Migrated ${migratedCount} container interactive meshes to Layer 1`);
    }
}

// Auto-initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('canvas');
    if (canvas) {
        // CRITICAL: Initialize SimpleCommunication BEFORE initializeModlerV2
        // This ensures SimpleCommunication is subscribed to events BEFORE they're emitted
        // (Communication Simplification 2025 - Replaced Phase 3)
        if (window.commandRouter && window.stateSerializer && window.simpleCommunication) {
            window.commandRouter.initialize();
            window.simpleCommunication.initialize();
            console.log('✅ SimpleCommunication initialized (ready to receive events)');
        }

        // Starting Modler V2 auto-initialization...
        initializeModlerV2(canvas).then((success) => {
            if (!success) {
                console.error('❌ Auto-initialization completed with errors');
            }
        }).catch(error => {
            console.error('❌ Modler V2 auto-initialization failed:', error);

            // Emit failure event for integration systems
            window.dispatchEvent(new CustomEvent('modlerV2Ready', {
                detail: {
                    success: false,
                    error: error.message || 'Auto-initialization exception',
                    timestamp: Date.now()
                }
            }));
        });
    } else {
        console.error('❌ Canvas element not found - Modler V2 initialization skipped');

        // Emit failure event for missing canvas
        window.dispatchEvent(new CustomEvent('modlerV2Ready', {
            detail: {
                success: false,
                error: 'Canvas element not found',
                timestamp: Date.now()
            }
        }));
    }
});