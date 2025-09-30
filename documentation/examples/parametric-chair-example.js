/**
 * Parametric Chair Example
 *
 * Demonstrates the parametric property system with a simple chair where:
 * - chairHeight parameter drives leg height and seat height
 * - woodThickness parameter constrains component thickness
 * - Position formula places seat at 1/3 of chair height
 *
 * This example shows how the unified notification system supports
 * parametric design workflows and component relationships.
 */

class ParametricChairExample {
    constructor() {
        this.sceneController = null;
        this.propertySchemaRegistry = null;
        this.objectEventBus = null;

        // Chair component IDs
        this.chairId = null;
        this.seatId = null;
        this.legIds = [];

        this.initializeComponents();
    }

    /**
     * Initialize component references
     */
    initializeComponents() {
        this.sceneController = window.modlerComponents?.sceneController;
        this.propertySchemaRegistry = window.propertySchemaRegistry;
        this.objectEventBus = window.objectEventBus;
    }

    /**
     * Create parametric chair demonstration
     */
    createParametricChair() {
        if (!this.sceneController || !this.propertySchemaRegistry) {
            console.error('ParametricChairExample: Required components not available');
            return false;
        }

        try {
            // Create chair container
            this.chairId = this.createChairContainer();

            // Create chair components
            this.seatId = this.createSeat();
            this.legIds = this.createLegs();

            // Set up parametric relationships
            this.setupParametricProperties();

            // Test parametric updates
            this.demonstrateParametricUpdates();


            return true;

        } catch (error) {
            console.error('ParametricChairExample.createParametricChair error:', error);
            return false;
        }
    }

    /**
     * Create chair container
     * @private
     */
    createChairContainer() {
        const chairGeometry = new THREE.BoxGeometry(18, 32, 18); // 18" wide, 32" tall, 18" deep
        const chairMaterial = new THREE.MeshLambertMaterial({
            color: 0x8B4513,
            transparent: true,
            opacity: 0.3
        });

        const objectData = this.sceneController.addObject(chairGeometry, chairMaterial, {
            type: 'container',
            name: 'Parametric Chair',
            isContainer: true,
            position: new THREE.Vector3(0, 16, 0), // Center at half height
            parametricProperties: {
                exposed: {},
                constraints: {},
                formulas: {},
                dependencies: []
            }
        });

        return objectData.id;
    }

    /**
     * Create chair seat
     * @private
     */
    createSeat() {
        const seatGeometry = new THREE.BoxGeometry(16, 0.75, 16); // 16" x 0.75" x 16"
        const seatMaterial = new THREE.MeshLambertMaterial({ color: 0xDEB887 });

        const objectData = this.sceneController.addObject(seatGeometry, seatMaterial, {
            type: 'component',
            name: 'Chair Seat',
            position: new THREE.Vector3(0, 10.67, 0), // 1/3 of chair height
            parentContainer: this.chairId,
            parametricProperties: {
                constraints: {
                    'dimensions.y': 'locked', // Thickness locked to wood thickness
                    'position.y': 'formula'   // Height driven by chair height formula
                },
                formulas: {
                    'position.y': 'chairHeight * 0.33' // 1/3 of chair height
                }
            }
        });

        return objectData.id;
    }

    /**
     * Create chair legs
     * @private
     */
    createLegs() {
        const legIds = [];
        const legPositions = [
            [-7, 5.33, -7],   // Back left
            [7, 5.33, -7],    // Back right
            [-7, 5.33, 7],    // Front left
            [7, 5.33, 7]      // Front right
        ];

        legPositions.forEach((position, index) => {
            const legGeometry = new THREE.BoxGeometry(2, 10.67, 2); // 2" x variable height x 2"
            const legMaterial = new THREE.MeshLambertMaterial({ color: 0x8B4513 });

            const objectData = this.sceneController.addObject(legGeometry, legMaterial, {
                type: 'component',
                name: `Chair Leg ${index + 1}`,
                position: new THREE.Vector3(...position),
                parentContainer: this.chairId,
                parametricProperties: {
                    constraints: {
                        'dimensions.x': 'locked', // Width locked
                        'dimensions.z': 'locked', // Depth locked
                        'dimensions.y': 'formula' // Height driven by formula
                    },
                    formulas: {
                        'dimensions.y': 'chairHeight * 0.33' // 1/3 of chair height
                    }
                }
            });

            legIds.push(objectData.id);
        });

        return legIds;
    }

    /**
     * Set up parametric properties and relationships
     * @private
     */
    setupParametricProperties() {
        // Create chairHeight parameter
        this.propertySchemaRegistry.createParametricProperty(this.chairId, 'chairHeight', {
            value: 32,
            unit: 'inches',
            constraints: { min: 24, max: 48 },
            drives: [
                `${this.seatId}.position.y`,
                ...this.legIds.map(id => `${id}.dimensions.y`)
            ],
            exposed: true
        });

        // Create woodThickness parameter
        this.propertySchemaRegistry.createParametricProperty(this.chairId, 'woodThickness', {
            value: 0.75,
            unit: 'inches',
            constraints: { min: 0.25, max: 2 },
            drives: [
                `${this.seatId}.dimensions.y`
            ],
            exposed: true
        });

    }

    /**
     * Demonstrate parametric updates
     * @private
     */
    demonstrateParametricUpdates() {

        // Test 1: Change chair height
        setTimeout(() => {
            this.propertySchemaRegistry.updateParametricProperty(`${this.chairId}.chairHeight`, 36);
        }, 2000);

        // Test 2: Change wood thickness
        setTimeout(() => {
            this.propertySchemaRegistry.updateParametricProperty(`${this.chairId}.woodThickness`, 1.5);
        }, 4000);

        // Test 3: Try to violate constraints
        setTimeout(() => {
            const success = this.propertySchemaRegistry.updateParametricProperty(`${this.chairId}.chairHeight`, 60);
            if (!success) {
            }
        }, 6000);
    }

    /**
     * Get example statistics
     */
    getStats() {
        return {
            chairId: this.chairId,
            seatId: this.seatId,
            legIds: this.legIds,
            parametricProperties: 2,
            constrainedProperties: 6,
            registryStats: this.propertySchemaRegistry?.getStats()
        };
    }

    /**
     * Clean up example
     */
    dispose() {
        if (this.sceneController && this.chairId) {
            this.sceneController.removeObject(this.chairId);
        }
    }
}

// Export for use in main application
window.ParametricChairExample = ParametricChairExample;

// Auto-create example if in development mode (DISABLED)
// Uncomment the code below to auto-create the parametric chair example
/*
if (window.location.hostname === 'localhost') {
    // Wait for all systems to initialize
    setTimeout(() => {
        const example = new ParametricChairExample();
        window.parametricChairExample = example;

        // Auto-create example after 3 seconds
        setTimeout(() => {
            console.log('🪑 Creating parametric chair example...');
            example.createParametricChair();
        }, 3000);
    }, 1000);
}
*/