// Application initialization and startup

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    const canvas = document.getElementById('canvas');

    initializeModlerV2(canvas).then((success) => {
        if (success) {

            // Make components global for testing
            window.modlerComponents = modlerV2Components;

            // Populate object list
            setTimeout(() => {
                if (window.populateObjectList) {
                    window.populateObjectList();
                }
            }, 100);

            // Auto-select the Test Cube to show its properties
            setTimeout(() => {
                if (window.selectObjectFromList) {
                    selectObjectFromList('Test Cube');
                }
            }, 200);

            // Setup keyboard shortcuts
            if (window.setupKeyboardShortcuts) {
                setupKeyboardShortcuts();
            }

            // Initialize configuration UI (delayed to ensure all components are registered)
            setTimeout(() => {
                if (window.modlerComponents?.configurationManager) {
                    if (window.initializeConfigurationUI) {
                        initializeConfigurationUI();
                    }
                } else {
                    setTimeout(() => {
                        if (window.initializeConfigurationUI) {
                            initializeConfigurationUI();
                        }
                    }, 300);
                }
            }, 500);

        } else {
            console.error('❌ Failed to initialize V2 system');
        }
    }).catch((error) => {
        console.error('❌ Error:', error);
    });
});

// Utility functions
function addTestCube() {
    if (window.modlerComponents?.sceneController) {
        const cubeNumber = document.querySelectorAll('.object-item').length - 1; // -1 for ground plane
        const cubeName = `Cube ${cubeNumber}`;

        const geometry = new THREE.BoxGeometry(1, 1, 1);
        const material = new THREE.MeshBasicMaterial({ color: Math.random() * 0xffffff });
        window.modlerComponents.sceneController.addObject(geometry, material, {
            name: cubeName,
            position: [Math.random() * 4 - 2, 0.5, Math.random() * 4 - 2]
        });

    }
}

// Make utility functions global
window.addTestCube = addTestCube;