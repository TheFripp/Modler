/**
 * Development-time validation for THREE.js object creation
 * Helps detect manual THREE.js creation that should use centralized systems
 */

class DevelopmentValidator {
    constructor() {
        this.enabled = this.isDevelopmentMode();
        this.violations = [];
        this.originalMethods = new Map();
        this.warningThrottle = new Map(); // Track last warning time per violation type
        this.throttleInterval = 60000; // Only warn once per 60 seconds per type
        this.maxWarningsPerType = 3; // Maximum warnings per type before silencing
        this.warningCounts = new Map(); // Track warning count per type

        if (this.enabled) {
            // DevelopmentValidator: Monitoring THREE.js (logging removed to reduce console noise)
            this.initializeValidation();
        }
    }

    /**
     * Check if we're in development mode
     */
    isDevelopmentMode() {
        // Check for development indicators
        return (
            window.location.hostname === 'localhost' ||
            window.location.hostname === '127.0.0.1' ||
            window.location.search.includes('dev=true') ||
            typeof window.modlerComponents?.configurationManager?.get('development.validation', false) !== 'undefined'
        );
    }

    /**
     * Initialize validation by intercepting THREE.js constructors
     */
    initializeValidation() {
        if (typeof THREE === 'undefined') {
            console.warn('DevelopmentValidator: THREE.js not available yet, validation will be limited');
            return;
        }

        // Monitor common geometry creation
        this.interceptConstructor(THREE, 'BoxGeometry', 'GeometryFactory.createBoxGeometry()');
        this.interceptConstructor(THREE, 'CylinderGeometry', 'GeometryFactory.createCylinderGeometry()');
        this.interceptConstructor(THREE, 'SphereGeometry', 'GeometryFactory.createSphereGeometry()');
        this.interceptConstructor(THREE, 'PlaneGeometry', 'GeometryFactory.createPlaneGeometry()');
        this.interceptConstructor(THREE, 'EdgesGeometry', 'GeometryFactory.createEdgeGeometry()');
        this.interceptConstructor(THREE, 'BufferGeometry', 'GeometryFactory (for custom geometry)');

        // Monitor common material creation
        this.interceptConstructor(THREE, 'MeshLambertMaterial', 'MaterialManager.createMeshLambertMaterial()');
        this.interceptConstructor(THREE, 'MeshBasicMaterial', 'MaterialManager.createMeshBasicMaterial()');
        this.interceptConstructor(THREE, 'LineBasicMaterial', 'MaterialManager.createPreviewWireframeMaterial()');
        this.interceptConstructor(THREE, 'LineDashedMaterial', 'MaterialManager (for line materials)');

        // Monitor mesh creation that should use resource pools
        this.interceptConstructor(THREE, 'Mesh', 'VisualizationResourcePool.getMeshHighlight()');
        this.interceptConstructor(THREE, 'LineSegments', 'VisualizationResourcePool.getLineMesh()');
        this.interceptConstructor(THREE, 'Line', 'VisualizationResourcePool.getLineMesh()');

        // Initialize schema and messaging validation
        this.initializeSchemaValidation();
        this.initializeMessagingValidation();
    }

    /**
     * Initialize schema validation for object properties
     */
    initializeSchemaValidation() {
        // Monitor ObjectStateManager updates
        if (window.modlerComponents?.objectStateManager) {
            const osm = window.modlerComponents.objectStateManager;
            const originalUpdate = osm.updateObject;

            osm.updateObject = (objectId, updates) => {
                this.validateObjectSchema(objectId, updates);
                return originalUpdate.call(osm, objectId, updates);
            };
        }

        // Monitor SceneController addObject
        setTimeout(() => {
            const sceneController = window.modlerComponents?.sceneController;
            if (sceneController) {
                const originalAddObject = sceneController.addObject;

                sceneController.addObject = function(geometry, material, options) {
                    developmentValidator.validateObjectCreationOptions(options);
                    return originalAddObject.call(this, geometry, material, options);
                };
            }
        }, 100);

        // Monitor direct mesh.position manipulation (should use ObjectStateManager)
        this.monitorDirectMeshManipulation();

        // Monitor direct geometry vertex manipulation (should use GeometryUtils)
        this.monitorDirectGeometryManipulation();
    }

    /**
     * Monitor direct mesh property manipulation
     */
    monitorDirectMeshManipulation() {
        // Override THREE.Object3D.position setter to detect direct manipulation
        setTimeout(() => {
            const originalPositionSet = Object.getOwnPropertyDescriptor(THREE.Object3D.prototype, 'position')?.set;
            if (!originalPositionSet) return;

            Object.defineProperty(THREE.Object3D.prototype, 'position', {
                get() {
                    return this._position;
                },
                set(value) {
                    // Check if this is during a drag operation or centralized update
                    const stack = new Error().stack;
                    const isDuringDrag = stack.includes('updateDragMovement') || stack.includes('performPositionUpdate');
                    const isCentralized = stack.includes('ObjectStateManager') || stack.includes('updateObjectDimensions');
                    const isInitialization = stack.includes('addObject') || stack.includes('configureMesh');

                    if (!isDuringDrag && !isCentralized && !isInitialization && this.userData?.id) {
                        developmentValidator.recordViolation({
                            type: 'state-management-violation',
                            message: 'Direct mesh.position manipulation detected',
                            objectId: this.userData.id,
                            stack
                        });
                        console.warn(
                            `🚨 State Management Violation: Direct mesh.position manipulation\n` +
                            `   Object: ${this.userData.id}\n` +
                            `   Use: ObjectStateManager.updateObject(id, { position: {...} })\n` +
                            `   Direct manipulation bypasses state sync and UI updates`
                        );
                    }

                    if (originalPositionSet) {
                        originalPositionSet.call(this, value);
                    } else {
                        this._position = value;
                    }
                }
            });
        }, 200);
    }

    /**
     * Monitor direct geometry manipulation
     */
    monitorDirectGeometryManipulation() {
        setTimeout(() => {
            if (!THREE.BufferGeometry) return;

            const originalSetAttribute = THREE.BufferGeometry.prototype.setAttribute;

            THREE.BufferGeometry.prototype.setAttribute = function(name, attribute) {
                const stack = new Error().stack;
                const isFromGeometryUtils = stack.includes('GeometryUtils') || stack.includes('resizeGeometry');
                const isFromFactory = stack.includes('GeometryFactory');
                const isFromDuplicationMode = stack.includes('enterDuplicationMode') || stack.includes('endFaceDrag');
                const isFromMeasurementTool = stack.includes('MeasurementTool') || stack.includes('createEdgeMeasurementVisual') || stack.includes('createFaceNormalMeasurementVisual');
                const isFromBoxCreation = stack.includes('BoxCreationTool') || stack.includes('updateInvisibleBoxDimensions');
                const isFromSupportMeshFactory = stack.includes('SupportMeshFactory') || stack.includes('updateSupportMeshGeometries');

                if (name === 'position' && !isFromGeometryUtils && !isFromFactory && !isFromDuplicationMode && !isFromMeasurementTool && !isFromBoxCreation && !isFromSupportMeshFactory) {
                    developmentValidator.recordViolation({
                        type: 'geometry-violation',
                        message: 'Direct geometry vertex manipulation detected',
                        stack
                    });
                    console.warn(
                        `🚨 Geometry Violation: Direct vertex manipulation\n` +
                        `   Use: GeometryUtils.resizeGeometry() or GeometryFactory methods\n` +
                        `   Direct manipulation can break support mesh synchronization`
                    );
                }

                return originalSetAttribute.call(this, name, attribute);
            };
        }, 200);
    }

    /**
     * Initialize messaging validation
     */
    initializeMessagingValidation() {
        // Monitor PropertyPanelSync for direct postMessage usage
        setTimeout(() => {
            const propertyPanelSync = window.modlerComponents?.propertyPanelSync;
            if (propertyPanelSync?.iframe?.contentWindow) {
                const originalPostMessage = propertyPanelSync.iframe.contentWindow.postMessage;

                propertyPanelSync.iframe.contentWindow.postMessage = function(...args) {
                    developmentValidator.validatePostMessage(args[0]);
                    return originalPostMessage.apply(this, args);
                };
            }
        }, 500);

        // Monitor ALL window.postMessage calls to catch bypasses
        this.monitorGlobalPostMessage();

        // Monitor ObjectEventBus usage
        this.monitorEventBusUsage();

        // Monitor layout updates
        this.monitorLayoutUpdates();
    }

    /**
     * Monitor ObjectEventBus for proper usage
     */
    monitorEventBusUsage() {
        setTimeout(() => {
            const eventBus = window.objectEventBus;
            if (!eventBus) return;

            const originalEmit = eventBus.emit;

            eventBus.emit = function(eventType, objectId, payload, metadata) {
                const stack = new Error().stack;

                // Check if manual event emission (not from ObjectStateManager or legitimate sources)
                const isFromStateManager = stack.includes('ObjectStateManager');
                const isFromPropertySchema = stack.includes('PropertySchemaRegistry');
                const isFromSelectionController = stack.includes('SelectionController') && eventType.includes('selection');
                const isFromSceneController = stack.includes('SceneController') &&
                    (eventType.includes('lifecycle') || eventType.includes('hierarchy') || eventType.includes('layout'));
                const isFromBoxCreation = stack.includes('BoxCreationTool') && eventType.includes('geometry');
                const isFromTransformationManager = stack.includes('TransformationManager') &&
                    (eventType.includes('transform') || eventType.includes('hierarchy'));
                const isFromMovementUtils = stack.includes('MovementUtils') &&
                    (eventType.includes('geometry') || eventType.includes('transform'));
                const isFromUnitConverter = stack.includes('UnitConverter') && eventType.includes('unit-preference');
                const isLegitimate = isFromStateManager || isFromPropertySchema || isFromSelectionController ||
                    isFromSceneController || isFromBoxCreation || isFromTransformationManager ||
                    isFromMovementUtils || isFromUnitConverter;

                if (!isLegitimate) {
                    developmentValidator.recordViolation({
                        type: 'event-bus-violation',
                        message: 'Direct ObjectEventBus.emit() detected',
                        eventType,
                        stack
                    });
                    console.warn(
                        `🚨 Event Bus Violation: Direct emit() call\n` +
                        `   Event: ${eventType}\n` +
                        `   Use: ObjectStateManager.updateObject() which emits events automatically\n` +
                        `   Manual events can cause synchronization issues`
                    );
                }

                return originalEmit.call(this, eventType, objectId, payload, metadata);
            };
        }, 300);
    }

    /**
     * Monitor layout updates
     */
    monitorLayoutUpdates() {
        setTimeout(() => {
            const sceneController = window.modlerComponents?.sceneController;
            if (!sceneController) return;

            const originalUpdateLayout = sceneController.updateLayout;

            sceneController.updateLayout = function(containerId, pushContext) {
                const containerData = this.getObject(containerId);

                // Check for layout update on non-layout container
                if (containerData && !containerData.autoLayout?.enabled) {
                    developmentValidator.recordViolation({
                        type: 'layout-violation',
                        message: 'updateLayout called on container without layout enabled',
                        containerId,
                        containerData
                    });
                    console.warn(
                        `🚨 Layout Violation: updateLayout on non-layout container\n` +
                        `   Container: ${containerId}\n` +
                        `   autoLayout.enabled: ${containerData.autoLayout?.enabled}\n` +
                        `   Only call updateLayout on containers with layout mode enabled`
                    );
                }

                return originalUpdateLayout.call(this, containerId, pushContext);
            };
        }, 300);
    }

    /**
     * Monitor global window.postMessage to catch bypasses
     */
    monitorGlobalPostMessage() {
        if (typeof window === 'undefined') return;

        const originalPostMessage = window.postMessage;

        window.postMessage = function(message, targetOrigin, transfer) {
            const stack = new Error().stack;

            // Whitelist: PropertyPanelSync, main-integration message handling, DirectComponentManager
            const isFromPropertyPanelSync = stack.includes('PropertyPanelSync');
            const isFromMainIntegration = stack.includes('main-integration.js') || stack.includes('setupUnifiedMessageHandling');
            const isFromDirectComponentManager = stack.includes('DirectComponentManager');
            const isFromPanelCommunication = stack.includes('PanelCommunication');
            const isWhitelisted = isFromPropertyPanelSync || isFromMainIntegration || isFromDirectComponentManager || isFromPanelCommunication;

            if (!isWhitelisted) {
                developmentValidator.recordViolation({
                    type: 'postmessage-bypass-violation',
                    message: 'Direct window.postMessage bypass detected',
                    messageType: message?.type,
                    stack
                });
                console.error(
                    `🚨 PostMessage Bypass Violation: Direct window.postMessage call\n` +
                    `   Message type: ${message?.type || 'unknown'}\n` +
                    `   CRITICAL: Never bypass PropertyPanelSync\n` +
                    `   Use: PropertyPanelSync.sendToUI() for all UI updates\n` +
                    `   Stack trace:\n${stack}`
                );
            }

            return originalPostMessage.call(this, message, targetOrigin, transfer);
        };
    }

    /**
     * Validate object schema against standard format
     */
    validateObjectSchema(objectId, updates) {
        if (!window.ObjectDataFormat) return;

        // Check for schema violations
        const violations = [];

        // Check for mutually exclusive properties
        if (updates.isHug && updates.autoLayout?.enabled) {
            violations.push({
                type: 'schema-violation',
                message: 'isHug and autoLayout.enabled are mutually exclusive',
                objectId,
                updates
            });
            console.warn(
                `🚨 Schema Violation: Object ${objectId}\n` +
                `   isHug and autoLayout.enabled cannot both be true\n` +
                `   See: /documentation/container-properties.md`
            );
        }

        // Check for missing required nested objects
        if (updates.position && typeof updates.position !== 'object') {
            violations.push({
                type: 'schema-violation',
                message: 'position must be an object with x, y, z properties',
                objectId,
                updates
            });
            console.warn(
                `🚨 Schema Violation: Object ${objectId}\n` +
                `   position must be {x, y, z}, got: ${typeof updates.position}`
            );
        }

        if (violations.length > 0) {
            violations.forEach(v => this.recordViolation(v));
        }
    }

    /**
     * Validate object creation options
     */
    validateObjectCreationOptions(options) {
        if (!options) return;

        const violations = [];

        // Check for rotation without proper structure
        if (options.rotation && (!options.rotation.x && options.rotation.x !== 0)) {
            violations.push({
                type: 'schema-violation',
                message: 'rotation must have x, y, z properties',
                options
            });
            console.warn(
                `🚨 Schema Violation: Object creation\n` +
                `   rotation must be {x, y, z}, got: ${JSON.stringify(options.rotation)}`
            );
        }

        // Check for isHug with autoLayout
        if (options.isHug && options.autoLayout?.enabled) {
            violations.push({
                type: 'schema-violation',
                message: 'Cannot create object with both isHug and autoLayout enabled',
                options
            });
            console.warn(
                `🚨 Schema Violation: Object creation\n` +
                `   isHug and autoLayout.enabled are mutually exclusive`
            );
        }

        if (violations.length > 0) {
            violations.forEach(v => this.recordViolation(v));
        }
    }

    /**
     * Validate PostMessage usage
     */
    validatePostMessage(message) {
        const stack = new Error().stack;

        // Check if PostMessage is being called directly (not through PropertyPanelSync)
        const isFromPropertyPanelSync = stack.includes('PropertyPanelSync');
        const isFromMainIntegration = stack.includes('main-integration') || stack.includes('updateUISystems');
        const isFromPanelCommunication = stack.includes('PanelCommunication');
        const isWhitelisted = isFromPropertyPanelSync || isFromMainIntegration || isFromPanelCommunication;

        if (!isWhitelisted) {
            const violation = {
                type: 'messaging-violation',
                message: 'Direct postMessage detected - use PropertyPanelSync',
                messageType: message?.type,
                stack
            };
            this.recordViolation(violation);

            console.error(
                `🚨 Messaging Violation: Direct postMessage bypass\n` +
                `   Message type: ${message?.type || 'unknown'}\n` +
                `   Use: PropertyPanelSync.sendToUI() for all UI updates\n` +
                `   Direct postMessage bypasses validation and schema serialization`
            );
        }

        // Validate message structure
        if (message && typeof message === 'object') {
            if (!message.type) {
                const violation = {
                    type: 'messaging-violation',
                    message: 'PostMessage missing "type" property',
                    messageData: message
                };
                this.recordViolation(violation);

                console.warn(
                    `🚨 Messaging Violation: Message missing type\n` +
                    `   All messages should have a "type" property\n` +
                    `   See: MessageProtocolSchema for valid types`
                );
            }
        }
    }

    /**
     * Intercept a THREE.js constructor to add validation
     */
    interceptConstructor(namespace, className, suggestedMethod) {
        if (!namespace[className]) {
            console.warn(`DevelopmentValidator: ${className} not found in THREE.js`);
            return;
        }

        const OriginalClass = namespace[className];
        this.originalMethods.set(className, OriginalClass);

        // Capture validator instance for closure
        const validator = this;

        // Create wrapper constructor
        function ValidatedConstructor(...args) {
            // Check stack trace to see if this is called from centralized systems
            const isFromCentralizedSystem = validator.isCallFromCentralizedSystems();

            if (!isFromCentralizedSystem) {
                const violation = {
                    type: className,
                    suggestedMethod: suggestedMethod,
                    stack: new Error().stack,
                    timestamp: Date.now()
                };

                // Throttle console warnings to prevent browser crashes
                const now = Date.now();
                const lastWarning = validator.warningThrottle.get(className) || 0;
                const warningCount = validator.warningCounts.get(className) || 0;

                // Only warn up to maxWarningsPerType times total
                if (warningCount < validator.maxWarningsPerType) {
                    // Check if enough time has passed since last warning
                    if (now - lastWarning > 1000) { // 1 second between warnings
                        validator.warningThrottle.set(className, now);
                        validator.warningCounts.set(className, warningCount + 1);
                        validator.recordViolation(violation);

                        const remaining = validator.maxWarningsPerType - warningCount - 1;
                        const silenceMsg = remaining === 0
                            ? '\n   (This will be the last warning for this type - further warnings silenced)'
                            : `\n   (${remaining} more warnings will be shown before silencing)`;

                        console.warn(
                            `🚨 DevelopmentValidator: Manual ${className} creation detected!\n` +
                            `   Consider using: ${suggestedMethod}\n` +
                            `   This helps with performance optimization and resource pooling.` +
                            silenceMsg
                        );
                    }
                }
            }

            // Call original constructor
            return new OriginalClass(...args);
        }

        // Preserve prototype and static methods
        ValidatedConstructor.prototype = OriginalClass.prototype;
        Object.setPrototypeOf(ValidatedConstructor, OriginalClass);
        Object.defineProperty(ValidatedConstructor, 'name', { value: className });

        // Bind the validation methods to the wrapper
        ValidatedConstructor.prototype.recordViolation = this.recordViolation.bind(this);
        ValidatedConstructor.prototype.isCallFromCentralizedSystems = this.isCallFromCentralizedSystems.bind(this);

        // Replace the original constructor
        namespace[className] = ValidatedConstructor;
    }

    /**
     * Check if the current call stack includes centralized systems
     */
    isCallFromCentralizedSystems() {
        const stack = new Error().stack;
        if (!stack) return false;

        // Check for calls from centralized systems
        const centralizedSystemPatterns = [
            'GeometryFactory',
            'MaterialManager',
            'VisualizationResourcePool',
            'addObject',                // Allow main object creation in SceneController
            'showRectanglePreview',     // Allow visual effects preview geometries
            'createPreview',           // Allow tool preview creation
            'showEdgeIndicator',       // Allow snap visualization edge indicators
            'updateSnapIndicator',     // Allow snap visualization updates
            'createLayoutAwareWireframe', // Allow layout wireframe creation
            'updateContainerGeometry', // Allow container geometry updates
            'createFloorGrid',          // Allow floor grid creation
            'createDemoObjects',        // Allow demo object creation
            'restoreObjectFromSnapshot', // Allow object restoration
            'restoreContainer',         // Allow container restoration
            'createContainerGeometry',  // Allow container geometry creation
            'MeasurementTool',          // Allow measurement tool temporary geometry
            'createEdgeMeasurementVisual', // Allow measurement visuals
            'createFaceNormalMeasurementVisual', // Allow measurement visuals
            'createInteractiveFaces',   // Allow interactive face creation
            'updateSupportMeshGeometries', // Allow support mesh updates
            'enterDuplicationMode',     // Allow temporary ghost visualization in move tool
        ];

        return centralizedSystemPatterns.some(pattern =>
            stack.includes(pattern)
        );
    }

    /**
     * Record a validation violation
     */
    recordViolation(violation) {
        this.violations.push(violation);

        // Limit violation history to prevent memory issues
        if (this.violations.length > 100) {
            this.violations.shift();
        }
    }

    /**
     * Get violation report
     */
    getViolationReport() {
        if (!this.enabled) {
            return { enabled: false, message: 'Development validation not enabled' };
        }

        const violationsByType = {};
        this.violations.forEach(violation => {
            if (!violationsByType[violation.type]) {
                violationsByType[violation.type] = {
                    count: 0,
                    suggestedMethod: violation.suggestedMethod
                };
            }
            violationsByType[violation.type].count++;
        });

        return {
            enabled: true,
            totalViolations: this.violations.length,
            violationsByType: violationsByType,
            suggestions: Object.entries(violationsByType).map(([type, data]) =>
                `${type}: Use ${data.suggestedMethod} (${data.count} violations)`
            )
        };
    }

    /**
     * Print violation report to console
     */
    printReport() {
        const report = this.getViolationReport();

        if (!report.enabled) {
            console.log('DevelopmentValidator:', report.message);
            return;
        }

        if (report.totalViolations === 0) {
            console.log('✅ DevelopmentValidator: No THREE.js creation violations detected!');
            return;
        }

        console.group('🔍 DevelopmentValidator Report');
        console.log(`Total violations: ${report.totalViolations}`);
        console.log('Suggestions for centralized system usage:');
        report.suggestions.forEach(suggestion => {
            console.log(`  • ${suggestion}`);
        });
        console.groupEnd();
    }

    /**
     * Disable validation and restore original THREE.js constructors
     */
    disable() {
        if (!this.enabled) return;

        this.originalMethods.forEach((OriginalClass, className) => {
            THREE[className] = OriginalClass;
        });

        this.enabled = false;
        this.violations = [];
        console.log('🔍 DevelopmentValidator: Disabled and restored original THREE.js constructors');
    }

    /**
     * Check if validation is enabled
     */
    isEnabled() {
        return this.enabled;
    }
}

// Create and export singleton instance
const developmentValidator = new DevelopmentValidator();

// Add global access for debugging
window.developmentValidator = developmentValidator;

// Add method to window for easy access
window.checkThreeJSValidation = () => developmentValidator.printReport();

// Export for module usage
window.DevelopmentValidator = DevelopmentValidator;

// DevelopmentValidator loaded and ready (logging removed to reduce console noise)