// Configuration UI management
class ConfigurationUI {
    constructor() {
        this.configManager = null;
        this.initialized = false;
    }

    initialize() {
        this.configManager = window.modlerComponents?.configurationManager;
        if (!this.configManager) {
            console.warn('ConfigurationManager not available for UI initialization');
            return false;
        }

        // Initialize all configuration inputs with current values
        this.updateUIFromValues(this.configManager.getAll());

        // Setup event listeners for all configuration inputs
        this.setupEventListeners();

        // Apply current configuration values to systems
        const backgroundColor = this.configManager.get('scene.backgroundColor');
        if (backgroundColor) {
            this.updateSceneBackground(backgroundColor);
        }

        // Setup enhanced visual feedback system
        this.setupVisualFeedbackSystem();

        // Test subscription system with debug callback
        this.setupDebugSubscriptions();

        this.initialized = true;
        return true;
    }

    setupEventListeners() {
        if (!this.configManager) return;

        // Color inputs - update only on final selection (change event)
        this.bindColorInput('config-selection-color', 'visual.selection.color');
        this.bindColorInput('config-container-color', 'visual.containers.wireframeColor');
        this.bindColorInput('config-box-creation-color', 'visual.boxCreation.color');
        this.bindColorInput('config-snap-color', 'visual.snapping.indicatorColor');
        this.bindColorInput('config-scene-background', 'scene.backgroundColor');
        this.bindColorInput('config-scene-gridmain', 'scene.gridMainColor');
        this.bindColorInput('config-scene-gridsub', 'scene.gridSubColor');
        this.bindColorInput('config-ui-accent', 'ui.accentColor');

        // Visual Effects color inputs with live preview
        this.bindColorInputWithPreview('config-effects-face-color', 'visual.effects.materials.face.color');
        this.bindColorInputWithPreview('config-effects-axis-color', 'visual.effects.materials.axis.color');
        this.bindColorInputWithPreview('config-effects-object-color', 'visual.effects.materials.object.color');
        this.bindColorInputWithPreview('config-effects-guides-color', 'visual.effects.materials.guides.color');

        // Range inputs with value display updates
        this.bindRangeInput('config-selection-linewidth', 'visual.selection.lineWidth');
        this.bindRangeInput('config-selection-opacity', 'visual.selection.opacity');
        this.bindRangeInput('config-container-linewidth', 'visual.containers.lineWidth');
        this.bindRangeInput('config-container-opacity', 'visual.containers.opacity');
        this.bindRangeInput('config-snap-cornersize', 'visual.snapping.cornerSize');
        this.bindRangeInput('config-snap-borderwidth', 'visual.snapping.borderWidth');
        this.bindRangeInput('config-scene-gridsize', 'scene.gridSize');
        this.bindRangeInput('config-scene-griddensity', 'scene.gridDensity');
        this.bindRangeInput('config-ui-toolbaropacity', 'ui.toolbarOpacity');

        // Visual Effects range inputs
        this.bindRangeInput('config-effects-face-opacity', 'visual.effects.materials.face.opacity');
        this.bindRangeInput('config-effects-face-renderorder', 'visual.effects.materials.face.renderOrder');
        this.bindRangeInput('config-effects-axis-opacity', 'visual.effects.materials.axis.opacity');
        this.bindRangeInput('config-effects-object-opacity', 'visual.effects.materials.object.opacity');
        this.bindRangeInput('config-effects-object-linewidth', 'visual.effects.materials.object.lineWidth');
        this.bindRangeInput('config-effects-guides-opacity', 'visual.effects.materials.guides.opacity');
        this.bindRangeInput('config-effects-guides-linewidth', 'visual.effects.materials.guides.lineWidth');
        this.bindRangeInput('config-effects-guides-dashsize', 'visual.effects.materials.guides.dashSize');
        this.bindRangeInput('config-effects-guides-gapsize', 'visual.effects.materials.guides.gapSize');
        this.bindRangeInput('config-effects-animation-fadestep', 'visual.effects.animation.fadeStep');
        this.bindRangeInput('config-effects-animation-maxopacity', 'visual.effects.animation.maxOpacity');
        this.bindRangeInput('config-effects-animation-timeout', 'visual.effects.animation.timeout');
        this.bindRangeInput('config-effects-geometry-normaloffset', 'visual.effects.geometry.normalOffset');
        this.bindRangeInput('config-effects-geometry-boxthreshold', 'visual.effects.geometry.boxDetectionThreshold');
        this.bindRangeInput('config-effects-geometry-duplicatethreshold', 'visual.effects.geometry.duplicateVertexThreshold');
        this.bindRangeInput('config-effects-cache-poolsize', 'visual.effects.cache.geometryPoolSize');
        this.bindRangeInput('config-effects-cache-bboxtime', 'visual.effects.cache.bboxCacheTime');
    }

    bindColorInput(inputId, configPath) {
        const input = document.getElementById(inputId);
        if (input) {
            input.addEventListener('change', (e) => {
                this.configManager.set(configPath, e.target.value);
                // Trigger visual updates after configuration change
                this.updateVisualSystem(configPath, e.target.value);
            });
        }
    }

    bindColorInputWithPreview(inputId, configPath) {
        const input = document.getElementById(inputId);
        if (input) {
            input.addEventListener('input', (e) => {
                this.provideLiveVisualPreview(configPath, e.target.value);
            });
            input.addEventListener('change', (e) => {
                this.configManager.set(configPath, e.target.value);
            });
        }
    }

    bindRangeInput(inputId, configPath) {
        const input = document.getElementById(inputId);
        const valueDisplay = input?.parentElement?.querySelector('.config-value');

        if (!input || !this.configManager) {
            return;
        }

        // Update value display when slider changes
        input.addEventListener('input', (e) => {
            const value = parseFloat(e.target.value);
            if (valueDisplay) {
                valueDisplay.textContent = value.toString();
            }

            // Provide real-time visual feedback during slider movement
            if (configPath.startsWith('visual.effects.')) {
                this.provideLiveVisualPreview(configPath, value);
            }
        });

        // Update configuration when slider changes
        input.addEventListener('change', (e) => {
            const value = parseFloat(e.target.value);
            this.configManager.set(configPath, value);
            // Trigger visual updates after configuration change
            this.updateVisualSystem(configPath, value);
        });
    }

    updateUIFromValues(config) {
        // Update color inputs
        this.updateColorInput('config-selection-color', config.visual?.selection?.color);
        this.updateColorInput('config-container-color', config.visual?.containers?.wireframeColor);
        this.updateColorInput('config-box-creation-color', config.visual?.boxCreation?.color);
        this.updateColorInput('config-snap-color', config.visual?.snapping?.indicatorColor);
        this.updateColorInput('config-scene-background', config.scene?.backgroundColor);
        this.updateColorInput('config-scene-gridmain', config.scene?.gridMainColor);
        this.updateColorInput('config-scene-gridsub', config.scene?.gridSubColor);
        this.updateColorInput('config-ui-accent', config.ui?.accentColor);

        // Update Visual Effects color inputs
        this.updateColorInput('config-effects-face-color', config.visual?.effects?.materials?.face?.color);
        this.updateColorInput('config-effects-axis-color', config.visual?.effects?.materials?.axis?.color);
        this.updateColorInput('config-effects-object-color', config.visual?.effects?.materials?.object?.color);
        this.updateColorInput('config-effects-guides-color', config.visual?.effects?.materials?.guides?.color);

        // Update range inputs
        this.updateRangeInput('config-selection-linewidth', config.visual?.selection?.lineWidth);
        this.updateRangeInput('config-selection-opacity', config.visual?.selection?.opacity);
        this.updateRangeInput('config-container-linewidth', config.visual?.containers?.lineWidth);
        this.updateRangeInput('config-container-opacity', config.visual?.containers?.opacity);
        this.updateRangeInput('config-snap-cornersize', config.visual?.snapping?.cornerSize);
        this.updateRangeInput('config-snap-borderwidth', config.visual?.snapping?.borderWidth);
        this.updateRangeInput('config-scene-gridsize', config.scene?.gridSize);
        this.updateRangeInput('config-scene-griddensity', config.scene?.gridDensity);
        this.updateRangeInput('config-ui-toolbaropacity', config.ui?.toolbarOpacity);

        // Update Visual Effects range inputs
        this.updateRangeInput('config-effects-face-opacity', config.visual?.effects?.materials?.face?.opacity);
        this.updateRangeInput('config-effects-face-renderorder', config.visual?.effects?.materials?.face?.renderOrder);
        this.updateRangeInput('config-effects-axis-opacity', config.visual?.effects?.materials?.axis?.opacity);
        this.updateRangeInput('config-effects-object-opacity', config.visual?.effects?.materials?.object?.opacity);
        this.updateRangeInput('config-effects-object-linewidth', config.visual?.effects?.materials?.object?.lineWidth);
        this.updateRangeInput('config-effects-guides-opacity', config.visual?.effects?.materials?.guides?.opacity);
        this.updateRangeInput('config-effects-guides-linewidth', config.visual?.effects?.materials?.guides?.lineWidth);
        this.updateRangeInput('config-effects-guides-dashsize', config.visual?.effects?.materials?.guides?.dashSize);
        this.updateRangeInput('config-effects-guides-gapsize', config.visual?.effects?.materials?.guides?.gapSize);
        this.updateRangeInput('config-effects-animation-fadestep', config.visual?.effects?.animation?.fadeStep);
        this.updateRangeInput('config-effects-animation-maxopacity', config.visual?.effects?.animation?.maxOpacity);
        this.updateRangeInput('config-effects-animation-timeout', config.visual?.effects?.animation?.timeout);
        this.updateRangeInput('config-effects-geometry-normaloffset', config.visual?.effects?.geometry?.normalOffset);
        this.updateRangeInput('config-effects-geometry-boxthreshold', config.visual?.effects?.geometry?.boxDetectionThreshold);
        this.updateRangeInput('config-effects-geometry-duplicatethreshold', config.visual?.effects?.geometry?.duplicateVertexThreshold);
        this.updateRangeInput('config-effects-cache-poolsize', config.visual?.effects?.cache?.geometryPoolSize);
        this.updateRangeInput('config-effects-cache-bboxtime', config.visual?.effects?.cache?.bboxCacheTime);
    }

    updateColorInput(inputId, value) {
        const input = document.getElementById(inputId);
        if (input && value) {
            input.value = value;
        }
    }

    updateRangeInput(inputId, value) {
        const input = document.getElementById(inputId);
        const valueDisplay = input?.parentElement?.querySelector('.config-value');

        if (input && value !== undefined) {
            input.value = value;
            if (valueDisplay) {
                valueDisplay.textContent = value.toString();
            }
        }
    }

    updateSceneBackground(color) {
        if (!window.modlerComponents?.sceneFoundation?.renderer) {
            return;
        }

        // Convert hex to Three.js color
        const colorHex = parseInt(color.replace('#', ''), 16);
        window.modlerComponents.sceneFoundation.renderer.setClearColor(colorHex);
    }

    // Central visual system update dispatcher
    updateVisualSystem(configPath, value) {
        // Handle scene background changes
        if (configPath === 'scene.backgroundColor') {
            this.updateSceneBackground(value);
        }

        // Handle visual effects changes
        if (configPath.startsWith('visual.effects.')) {
            const visualEffects = window.modlerComponents?.visualEffects;
            if (visualEffects && visualEffects.onConfigChanged) {
                visualEffects.onConfigChanged();
            }
        }

        // Note: Selection and container colors are handled by their respective
        // subscription systems in SelectionVisualizer and other components
        // No additional action needed here as the ConfigurationManager.set()
        // call will trigger the subscriptions automatically
    }

    // Live visual preview for real-time configuration feedback
    provideLiveVisualPreview(configPath, value) {
        // Apply the configuration change immediately
        this.configManager.set(configPath, value);

        // Handle specific configuration updates
        if (configPath === 'scene.backgroundColor') {
            this.updateSceneBackground(value);
        }

        // Handle visual effects updates
        const visualEffects = window.modlerComponents?.visualEffects;
        if (visualEffects && configPath.startsWith('visual.effects.')) {
            // Create a temporary configuration update for live preview
            const pathParts = configPath.split('.');
            const tempConfig = {};

            // Build nested object structure from dot notation path
            let current = tempConfig;
            for (let i = 0; i < pathParts.length - 1; i++) {
                current[pathParts[i]] = {};
                current = current[pathParts[i]];
            }
            current[pathParts[pathParts.length - 1]] = value;

            // Apply the live preview update to VisualEffects
            visualEffects.updateConfiguration(tempConfig);

            // Trigger visual updates for immediate feedback
            if (visualEffects.onConfigChanged) {
                visualEffects.onConfigChanged();
            }
        }
    }

    // Enhanced visual feedback system
    setupVisualFeedbackSystem() {
        const configManager = this.configManager;
        const visualEffects = window.modlerComponents?.visualEffects;

        if (configManager && visualEffects) {
            // Set up observer for configuration changes
            const originalSet = configManager.set.bind(configManager);
            configManager.set = function(path, value) {
                const result = originalSet(path, value);

                // Provide immediate visual feedback for effects changes
                if (path.startsWith('visual.effects.')) {
                    setTimeout(() => {
                        if (visualEffects.onConfigChanged) {
                            visualEffects.onConfigChanged();
                        }
                    }, 0);
                }

                return result;
            };
        }
    }

    // Debug subscription system to verify it's working
    setupDebugSubscriptions() {
        if (!this.configManager) return;

        // Subscribe to selection color changes for debugging
        this.configManager.subscribe('visual.selection.color', (newValue, oldValue) => {
            console.log('🎨 ConfigurationUI: Selection color changed', { newValue, oldValue });
        });

        // Subscribe to container color changes for debugging
        this.configManager.subscribe('visual.containers.wireframeColor', (newValue, oldValue) => {
            console.log('🎨 ConfigurationUI: Container color changed', { newValue, oldValue });
        });
    }
}

// Initialize configuration UI
window.configurationUI = new ConfigurationUI();

// Global functions for backward compatibility
window.initializeConfigurationUI = function() {
    return window.configurationUI.initialize();
};

window.updateConfigUIFromValues = function(config) {
    if (window.configurationUI.initialized) {
        window.configurationUI.updateUIFromValues(config);
    }
};