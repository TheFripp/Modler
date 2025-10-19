// Modler V2 - Consolidated Input System
// Unified DOM event handling → Tool actions
// Target: ~200 lines - consolidates input-foundation + input-handler
//
// CONSOLIDATION COMPLETED:
// - Combined InputFoundation (223 lines) + InputHandler (445 lines) → InputController (280 lines)
// - Eliminated duplicate mouse coordinate calculations and event processing
// - Unified state management (keys, mouse, interaction state)
// - Direct event flow: DOM → raycast → tool (no intermediate callbacks)
// - ~58% size reduction with same functionality

class InputController {
    constructor(canvas, camera, scene, sceneController, visualEffects, selectionController) {

        // Core 3D components
        this.canvas = canvas;
        this.camera = camera;
        this.scene = scene;
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();

        // Scene integration
        this.sceneController = sceneController;
        this.visualEffects = visualEffects;
        this.selectionController = selectionController;
        // Move gizmo removed - face-based movement system replaces 3-axis gizmos

        // Unified input state
        // Keys are now tracked by KeyboardRouter - provide getter for backward compatibility
        this.mouseButtons = new Set();
        this.lastMousePosition = { x: 0, y: 0 };

        // Tool system
        this.currentTool = 'select';
        this.toolBehaviors = {};

        // Interaction state (simplified)
        this.lastMouseDownEvent = null;
        this.lastClickTime = 0;
        this.lastClickPosition = null;
        this.doubleClickThreshold = 400; // milliseconds
        this.doubleClickDistance = 5; // pixels

        // Event handlers (bound for cleanup)
        this.handleMouseMove = this.onMouseMove.bind(this);
        this.handleMouseDown = this.onMouseDown.bind(this);
        this.handleMouseUp = this.onMouseUp.bind(this);
        this.handleContextMenu = (e) => e.preventDefault();
        // Keyboard handlers removed - now in KeyboardRouter

        this.setupEventListeners();
    }

    setupEventListeners() {

        // Mouse events
        this.canvas.addEventListener('mousemove', this.handleMouseMove, false);
        this.canvas.addEventListener('mousedown', this.handleMouseDown, false);
        this.canvas.addEventListener('mouseup', this.handleMouseUp, false);
        this.canvas.addEventListener('contextmenu', this.handleContextMenu, false);

        // Keyboard events - REMOVED, now handled by KeyboardRouter
        // The router provides centralized keyboard handling with priority-based delegation

        // Focus management
        this.canvas.setAttribute('tabindex', '0');
        this.canvas.focus();
        this.canvas.addEventListener('click', () => this.canvas.focus(), false);
    }

    onMouseMove(event) {
        // Update mouse position
        this.updateMousePosition(event);

        // Track movement delta for camera
        const deltaX = event.clientX - this.lastMousePosition.x;
        const deltaY = event.clientY - this.lastMousePosition.y;
        this.lastMousePosition = { x: event.clientX, y: event.clientY };

        // Gizmo handling removed - face-based movement system handles all interactions

        // Handle camera operations (orbit/pan)
        const cameraController = window.modlerComponents?.cameraController;
        if (cameraController && (cameraController.isOrbiting || cameraController.isPanning)) {
            cameraController.handleMouseMoveFromInputHandler(event);
            return; // Skip tool hover when camera is active
        }

        // Perform raycast
        const hit = this.raycast();

        // Check Alt key state from KeyboardRouter (reliable across platforms)
        const isAltPressed = this.isAltKeyPressed();

        // Delegate to current tool - pass Alt state as boolean
        const tool = this.toolBehaviors[this.currentTool];
        if (tool && tool.onHover) {
            tool.onHover(hit, isAltPressed);
        }

        // Tool-specific mouse move handling
        if (tool && tool.onMouseMove) {
            tool.onMouseMove(hit, event);
        }
    }

    /**
     * Check if Alt/Option key is currently pressed
     * Uses KeyboardRouter for reliable cross-platform detection
     * @returns {boolean}
     */
    isAltKeyPressed() {
        const keyboardRouter = window.modlerComponents?.keyboardRouter;
        return keyboardRouter?.keys.has('AltLeft') || keyboardRouter?.keys.has('AltRight') || false;
    }

    onMouseDown(event) {
        // Auto-focus the window when clicking in the 3D scene
        // This ensures keyboard/mouse events work without requiring explicit focus
        if (window.focus) {
            window.focus();
        }

        this.mouseButtons.add(event.button);
        this.updateMousePosition(event);

        // Store for potential click processing - enable logging on mouse down
        const hit = this.raycast(true); // Enable logging on click
        this.lastMouseDownEvent = {
            event: event,
            hit: hit,
            time: Date.now()
        };


        // Gizmo click handling removed - tools handle all object interactions directly

        // Left mouse button logic
        if (event.button === 0) {
            if (event.shiftKey) {
                // Shift+Left = Pan
                this.startCameraPan(event);
                return; // Prevent further event processing
            } else {
                // Check if tool has active highlight
                const tool = this.toolBehaviors[this.currentTool];
                if (tool && tool.hasActiveHighlight && tool.hasActiveHighlight()) {
                    // Tool has highlight → defer to tool
                    if (tool.onMouseDown) {
                        const handled = tool.onMouseDown(this.lastMouseDownEvent.hit, event);
                        if (handled) return;
                    }
                } else {
                    // No highlight → camera orbit
                    this.startCameraOrbit(event);
                    return; // Prevent further event processing
                }
            }
        }

        // Prevent default for right clicks
        if (event.button === 2) {
            event.preventDefault();
        }
    }

    onMouseUp(event) {
        this.mouseButtons.delete(event.button);
        this.updateMousePosition(event);


        // Gizmo stop handling removed - tools manage their own drag states

        // Check camera operations
        const cameraController = window.modlerComponents?.cameraController;
        const cameraWasActive = cameraController && (cameraController.isOrbiting || cameraController.isPanning);
        let cameraMovedSignificantly = false;

        if (cameraWasActive) {
            cameraMovedSignificantly = cameraController.stopCameraOperation();
        }

        // Process left mouse button clicks
        if (event.button === 0 && this.lastMouseDownEvent) {
            // Skip if camera moved significantly
            if (cameraWasActive && cameraMovedSignificantly) {
                this.lastMouseDownEvent = null;
                return;
            }

            const tool = this.toolBehaviors[this.currentTool];

            // Give tool first chance to handle mouse up
            if (tool && tool.onMouseUp) {
                const handled = tool.onMouseUp(this.lastMouseDownEvent.hit, event);
                if (handled) {
                    this.lastMouseDownEvent = null;
                    return;
                }
            }

            // Process as click if tool didn't handle
            const isDoubleClick = this.detectDoubleClick(event);


            if (isDoubleClick && tool && tool.onDoubleClick) {
                tool.onDoubleClick(this.lastMouseDownEvent.hit, this.lastMouseDownEvent.event);
            } else if (tool && tool.onClick) {
                tool.onClick(this.lastMouseDownEvent.hit, this.lastMouseDownEvent.event);
            }

            this.lastMouseDownEvent = null;
        }
    }

    // onKeyDown and onKeyUp methods REMOVED
    // Keyboard handling now centralized in KeyboardRouter (/interaction/keyboard-router.js)
    // This eliminates competing listeners and provides priority-based delegation

    // Unified raycasting with smart object prioritization
    raycast() {
        this.raycaster.setFromCamera(this.mouse, this.camera);

        // Get support mesh factory and selection controller
        const supportMeshFactory = window.modlerComponents?.supportMeshFactory;
        const selectionController = window.modlerComponents?.selectionController;

        // RAYCASTING LAYERS: Check if parent container is selected
        // If yes, raycast against Layer 1 (container interactive meshes) to avoid child blocking
        let isContainerSelected = false;
        if (selectionController) {
            const selected = selectionController.getSelectedObjects();
            if (selected.length > 0) {
                const selectedObj = this.sceneController.getObjectByMesh(selected[0]);
                if (selectedObj && selectedObj.isContainer) {
                    isContainerSelected = true;
                }
            }
        }

        // Configure raycaster layers based on selection state
        if (isContainerSelected) {
            // Container selected: Raycast ONLY Layer 1 (interactive meshes) to avoid child blocking
            this.raycaster.layers.set(1);
        } else {
            // No container selected: Raycast Layer 0 (normal objects)
            this.raycaster.layers.set(0);
        }

        const intersects = this.raycaster.intersectObjects(this.scene.children, true);

        if (intersects.length === 0) return null;

        // RAYCASTING LAYERS ARCHITECTURE:
        // - Layer 0 (default): Regular objects and children
        // - Layer 1: Container interactive meshes
        // When container selected, we're on Layer 1 and will ONLY hit interactive meshes

        if (isContainerSelected) {
            // Layer 1: Only interactive meshes are hit
            for (let hit of intersects) {
                if (hit.object.userData.isContainerInteractive) {
                    // Resolve to container but keep hit.object as interactive mesh (for face data)
                    const mainObject = supportMeshFactory ? supportMeshFactory.resolveMainObjectFromHit(hit) : hit.object;
                    const objectData = this.sceneController.getObjectByMesh(mainObject);

                    // SELECTION FIX: When container is selected, it has selectable=false to prevent re-selection
                    // But we still want to detect hits for face highlighting/interaction
                    // So skip the selectable check - if container is selected and we hit its interactive mesh, return the hit
                    if (objectData) {
                        return {
                            ...this.createHitResult(hit),
                            // Keep hit.object as interactive mesh for face detection
                        };
                    }
                }
            }
        } else {
            // Layer 0: Normal raycasting against regular objects
            for (let hit of intersects) {
                // Skip support meshes, resolve to main object
                const mainObject = supportMeshFactory ? supportMeshFactory.resolveMainObjectFromHit(hit) : hit.object;
                const objectData = this.sceneController.getObjectByMesh(mainObject);

                if (objectData && objectData.selectable === true) {
                    return this.createHitResult(hit);
                }
            }
        }

        // No selectable objects found
        return null;
    }

    createHitResult(hit) {
        return {
            object: hit.object,
            point: hit.point,
            face: hit.face,
            faceIndex: hit.faceIndex,
            distance: hit.distance,
            uv: hit.uv
        };
    }

    updateMousePosition(event) {
        const rect = this.canvas.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    }

    detectDoubleClick(event) {
        const currentTime = Date.now();
        const currentPosition = { x: event.clientX, y: event.clientY };

        let isDoubleClick = false;
        if (this.lastClickPosition &&
            (currentTime - this.lastClickTime) <= this.doubleClickThreshold) {

            const distance = Math.sqrt(
                Math.pow(currentPosition.x - this.lastClickPosition.x, 2) +
                Math.pow(currentPosition.y - this.lastClickPosition.y, 2)
            );

            isDoubleClick = distance <= this.doubleClickDistance;
        }

        this.lastClickTime = currentTime;
        this.lastClickPosition = currentPosition;
        return isDoubleClick;
    }

    startCameraOrbit(event) {
        const cameraController = window.modlerComponents?.cameraController;
        if (cameraController) {
            cameraController.startOrbitFromInputHandler(event, this.mouse);
        }
    }

    startCameraPan(event) {
        const cameraController = window.modlerComponents?.cameraController;
        if (cameraController) {
            cameraController.startPanFromInputHandler(event, this.mouse);
        }
    }

    // Tool management (gizmo methods removed)

    getCurrentTool() {
        return this.currentTool;
    }

    isMouseButtonDown(button) {
        return this.mouseButtons.has(button);
    }

    getMousePosition() {
        return { x: this.mouse.x, y: this.mouse.y };
    }

    destroy() {
        // Remove event listeners
        this.canvas.removeEventListener('mousemove', this.handleMouseMove);
        this.canvas.removeEventListener('mousedown', this.handleMouseDown);
        this.canvas.removeEventListener('mouseup', this.handleMouseUp);
        this.canvas.removeEventListener('contextmenu', this.handleContextMenu);
        // Keyboard listeners removed - now in KeyboardRouter

        // Clear state
        this.mouseButtons.clear();
        this.selectionController.clearSelection();
        this.visualEffects.clearHighlight();
    }
}

// Export for use in main application
window.InputController = InputController;