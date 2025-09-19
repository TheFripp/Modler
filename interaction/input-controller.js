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
        this.keys = new Set();
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
        this.handleKeyDown = this.onKeyDown.bind(this);
        this.handleKeyUp = this.onKeyUp.bind(this);
        this.handleContextMenu = (e) => e.preventDefault();

        this.setupEventListeners();
    }

    setupEventListeners() {
        // Mouse events
        this.canvas.addEventListener('mousemove', this.handleMouseMove, false);
        this.canvas.addEventListener('mousedown', this.handleMouseDown, false);
        this.canvas.addEventListener('mouseup', this.handleMouseUp, false);
        this.canvas.addEventListener('contextmenu', this.handleContextMenu, false);

        // Keyboard events (document level for global capture)
        document.addEventListener('keydown', this.handleKeyDown, false);
        document.addEventListener('keyup', this.handleKeyUp, false);

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

        // Perform raycast and delegate to current tool
        const hit = this.raycast();
        const tool = this.toolBehaviors[this.currentTool];

        if (tool && tool.onHover) {
            tool.onHover(hit);
        }

        // Tool-specific mouse move handling
        if (tool && tool.onMouseMove) {
            tool.onMouseMove(hit, event);
        }
    }

    onMouseDown(event) {
        this.mouseButtons.add(event.button);
        this.updateMousePosition(event);

        // Store for potential click processing
        const hit = this.raycast();
        this.lastMouseDownEvent = {
            event: event,
            hit: hit,
            time: Date.now()
        };

        // CLICK TRACING: Log what object was hit on mouse down
        const mouseCoords = { x: event.clientX, y: event.clientY };
        if (hit && hit.object) {
            console.log(`[CLICK TRACE] Mouse DOWN hit:`, {
                objectName: hit.object.name || 'unnamed',
                objectType: hit.object.type,
                isContainerInteractive: hit.object.userData?.isContainerInteractive,
                isContainerCollision: hit.object.userData?.isContainerCollision,
                containerType: hit.object.userData?.containerType,
                parentContainer: hit.object.userData?.parentContainer,
                distance: hit.distance,
                worldPosition: hit.point,
                mouseCoords: mouseCoords,
                objectPosition: hit.object.position,
                objectScale: hit.object.scale,
                // COORDINATE DEBUG: Add detailed geometry info
                geometryBounds: hit.object.geometry?.boundingBox,
                geometryParams: hit.object.geometry?.parameters
            });
        } else {
            console.log(`[CLICK TRACE] Mouse DOWN hit: EMPTY SPACE`, {
                mouseCoords: mouseCoords
            });
        }

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

        // CLICK TRACING: Log mouse up position and current hit
        const currentHit = this.raycast();
        const mouseUpCoords = { x: event.clientX, y: event.clientY };

        if (currentHit && currentHit.object) {
            console.log(`[CLICK TRACE] Mouse UP hit:`, {
                objectName: currentHit.object.name || 'unnamed',
                objectType: currentHit.object.type,
                isContainerInteractive: currentHit.object.userData?.isContainerInteractive,
                isContainerCollision: currentHit.object.userData?.isContainerCollision,
                containerType: currentHit.object.userData?.containerType,
                parentContainer: currentHit.object.userData?.parentContainer,
                distance: currentHit.distance,
                worldPosition: currentHit.point,
                mouseCoords: mouseUpCoords,
                objectPosition: currentHit.object.position,
                objectScale: currentHit.object.scale,
                // COORDINATE DEBUG: Add detailed geometry info
                geometryBounds: currentHit.object.geometry?.boundingBox,
                geometryParams: currentHit.object.geometry?.parameters
            });
        } else {
            console.log(`[CLICK TRACE] Mouse UP hit: EMPTY SPACE`, {
                mouseCoords: mouseUpCoords
            });
        }

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

            // CLICK TRACING: Log final click processing
            console.log(`[CLICK TRACE] Processing ${isDoubleClick ? 'DOUBLE-CLICK' : 'CLICK'} for tool: ${this.currentTool}`);
            if (this.lastMouseDownEvent.hit && this.lastMouseDownEvent.hit.object) {
                console.log(`[CLICK TRACE] Click target:`, {
                    objectName: this.lastMouseDownEvent.hit.object.name || 'unnamed',
                    isContainerInteractive: this.lastMouseDownEvent.hit.object.userData?.isContainerInteractive,
                    containerType: this.lastMouseDownEvent.hit.object.userData?.containerType
                });
            } else {
                console.log(`[CLICK TRACE] Click target: EMPTY SPACE`);
            }

            if (isDoubleClick && tool && tool.onDoubleClick) {
                tool.onDoubleClick(this.lastMouseDownEvent.hit, this.lastMouseDownEvent.event);
            } else if (tool && tool.onClick) {
                tool.onClick(this.lastMouseDownEvent.hit, this.lastMouseDownEvent.event);
            }

            this.lastMouseDownEvent = null;
        }
    }

    onKeyDown(event) {
        // Skip if input field is focused
        const activeElement = document.activeElement;
        if (activeElement && (activeElement.tagName === 'INPUT' ||
            activeElement.tagName === 'TEXTAREA' || activeElement.contentEditable === 'true')) {
            return;
        }

        if (!this.keys.has(event.code)) {
            this.keys.add(event.code);

            // Let current tool handle keys first
            const tool = this.toolBehaviors[this.currentTool];
            if (tool && tool.onKeyDown && tool.onKeyDown(event)) {
                return;
            }

            // Tool switching shortcuts
            switch (event.code) {
                case 'KeyQ': if (window.activateTool) window.activateTool('select'); break;
                case 'KeyW': if (window.activateTool) window.activateTool('move'); break;
                case 'KeyE': if (window.activateTool) window.activateTool('push'); break;
                case 'KeyR': if (window.activateTool) window.activateTool('box-creation'); break;
                case 'Escape': this.selectionController.clearSelection(); break;
            }
        }
    }

    onKeyUp(event) {
        this.keys.delete(event.code);
    }

    // Unified raycasting with smart object prioritization
    raycast() {
        this.raycaster.setFromCamera(this.mouse, this.camera);
        const intersects = this.raycaster.intersectObjects(this.scene.children, true);

        if (intersects.length === 0) return null;

        // Prioritize selectable objects over floor/non-selectable objects
        for (let hit of intersects) {
            const objectData = this.sceneController.getObjectByMesh(hit.object);
            if (objectData && objectData.selectable === true) {
                return this.createHitResult(hit);
            }
        }

        // Return first hit if no selectable objects found
        return this.createHitResult(intersects[0]);
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

    // Utility methods
    isKeyDown(keyCode) {
        return this.keys.has(keyCode);
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
        document.removeEventListener('keydown', this.handleKeyDown);
        document.removeEventListener('keyup', this.handleKeyUp);

        // Clear state
        this.keys.clear();
        this.mouseButtons.clear();
        this.selectionController.clearSelection();
        this.visualEffects.clearHighlight();
    }
}

// Export for use in main application
window.InputController = InputController;