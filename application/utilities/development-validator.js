/**
 * Development-time validation for THREE.js object creation
 * Helps detect manual THREE.js creation that should use centralized systems
 */

class DevelopmentValidator {
    constructor() {
        this.enabled = this.isDevelopmentMode();
        this.violations = [];
        this.originalMethods = new Map();

        if (this.enabled) {
            console.log('🔍 DevelopmentValidator: Monitoring THREE.js object creation');
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

        // Create wrapper constructor
        function ValidatedConstructor(...args) {
            // Check stack trace to see if this is called from centralized systems
            const isFromCentralizedSystem = this.isCallFromCentralizedSystems();

            if (!isFromCentralizedSystem) {
                const violation = {
                    type: className,
                    suggestedMethod: suggestedMethod,
                    stack: new Error().stack,
                    timestamp: Date.now()
                };

                this.recordViolation(violation);

                // Log warning to console
                console.warn(
                    `🚨 DevelopmentValidator: Manual ${className} creation detected!\n` +
                    `   Consider using: ${suggestedMethod}\n` +
                    `   This helps with performance optimization and resource pooling.`
                );
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
            'createInteractiveFaces',   // Allow interactive face creation
            'updateSupportMeshGeometries', // Allow support mesh updates
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

console.log('🔍 DevelopmentValidator loaded and ready');