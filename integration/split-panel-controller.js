/**
 * Split.js Panel Controller
 * Professional panel resizing using the Split.js library
 */

class SplitPanelController {
    constructor() {
        this.splitInstance = null;
        this.isInitialized = false;
    }

    /**
     * Initialize Split.js for the panel system
     */
    initialize() {
        if (this.isInitialized || !window.Split) {
            console.error('❌ Split.js not available or already initialized');
            return;
        }

        // Check if DOM elements exist
        const leftPanel = document.querySelector('.left-panel');
        const viewportArea = document.querySelector('.viewport-area');
        const propertyPanel = document.querySelector('.property-panel');

        if (!leftPanel || !viewportArea || !propertyPanel) {
            console.warn('⚠️ Required DOM elements not found - retrying in 500ms:', {
                leftPanel: !!leftPanel,
                viewportArea: !!viewportArea,
                propertyPanel: !!propertyPanel
            });

            // Retry once after 500ms
            setTimeout(() => {
                this.initialize();
            }, 500);
            return;
        }

        try {
            console.log('🎯 Initializing Split.js Panel Controller...');

            // Initialize Split.js with 3-panel layout
            this.splitInstance = Split(['.left-panel', '.viewport-area', '.property-panel'], {
                sizes: [20, 60, 20], // Percentage sizes: left, center, right
                minSize: [200, 300, 250], // Minimum sizes in pixels
                gutterSize: 8, // Size of the resize handle
                cursor: 'ew-resize', // Left-right resize cursor
                direction: 'horizontal',
                snapOffset: 0, // Disable snapping to prevent spacing issues
                elementStyle: (dimension, size, gutterSize) => ({
                    'flex-basis': `calc(${size}% - ${gutterSize}px + 8px)`
                }),
                gutterStyle: (dimension, gutterSize) => ({
                    'flex-basis': `${gutterSize}px`
                }),

                // Called during resize
                onDrag: (sizes) => {
                    // Sizes is array of percentages [left%, center%, right%]
                    // Logging removed to reduce console noise
                },

                // Called when resize is complete
                onDragEnd: (sizes) => {
                    // Logging removed to reduce console noise
                }
            });

            this.isInitialized = true;
            console.log('✅ Split.js Panel Controller initialized successfully');


        } catch (error) {
            console.error('❌ Failed to initialize Split.js:', error);
        }
    }

    /**
     * Get current panel sizes as percentages
     */
    getSizes() {
        return this.splitInstance ? this.splitInstance.getSizes() : null;
    }

    /**
     * Set panel sizes programmatically
     * @param {Array} sizes - Array of percentages [left, center, right]
     */
    setSizes(sizes) {
        if (this.splitInstance && Array.isArray(sizes) && sizes.length === 3) {
            this.splitInstance.setSizes(sizes);
        }
    }

    /**
     * Collapse left panel
     */
    collapseLeft() {
        this.setSizes([10, 75, 15]);
    }

    /**
     * Collapse right panel
     */
    collapseRight() {
        this.setSizes([25, 65, 10]);
    }

    /**
     * Reset to default panel sizes
     */
    resetToDefault() {
        this.setSizes([20, 60, 20]);
    }


    /**
     * Destroy the split controller
     */
    destroy() {
        if (this.splitInstance) {
            this.splitInstance.destroy();
            this.splitInstance = null;
        }
        this.isInitialized = false;
        console.log('🧹 Split.js Panel Controller destroyed');
    }
}

// Export for global access
window.SplitPanelController = SplitPanelController;

// Add global debug function to manually trigger Split.js
window.debugInitializeSplit = function() {
    console.log('🔧 Manual Split.js initialization triggered');
    console.log('Available elements:', {
        leftPanel: !!document.querySelector('.left-panel'),
        viewportArea: !!document.querySelector('.viewport-area'),
        propertyPanel: !!document.querySelector('.property-panel'),
        splitJs: !!window.Split
    });

    if (window.splitPanelController) {
        console.log('Existing controller found, destroying first...');
        window.splitPanelController.destroy();
    }

    window.splitPanelController = new SplitPanelController();
    window.splitPanelController.initialize();
};