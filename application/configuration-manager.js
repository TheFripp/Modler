/**
 * Configuration Manager
 * Global configuration system with persistent storage and reactive updates
 * Target: ~300 lines - centralized config, localStorage persistence, component integration
 */

class ConfigurationManager {
    constructor() {
        // Configuration storage
        this.config = {};
        this.defaultConfig = {};
        
        // Reactive system
        this.subscribers = new Map(); // key -> array of callbacks
        this.components = new Map(); // component -> array of config keys
        
        // Storage settings
        this.storageKey = 'modler_v2_config';
        this.configVersion = '1.0.0';
        
        // Initialize with defaults
        this.initializeDefaultConfiguration();
        this.loadFromStorage();

        // Setup system integrations
        this.setupSystemIntegrations();

    }
    
    /**
     * Initialize default configuration schema
     */
    initializeDefaultConfiguration() {
        this.defaultConfig = {
            version: this.configVersion,
            visual: {
                selection: {
                    color: '#ff6600',
                    lineWidth: 2,
                    opacity: 0.8,
                    renderOrder: 999
                },
                containers: {
                    wireframeColor: '#00ff00',
                    opacity: 0.8,
                    lineWidth: 1,
                    renderOrder: 998
                },
                grid: {
                    renderOrder: -100  // Render behind all wireframes to prevent z-fighting
                },
                snapping: {
                    indicatorColor: '#ffffff',
                    cornerSize: 0.1,
                    faceSize: 0.05,
                    borderWidth: 2,
                    proximityThreshold: 8,
                    opacity: 1.0,
                    renderOrder: 1001
                },
                effects: {
                    materials: {
                        face: {
                            color: '#00ffff',
                            opacity: 0.6,
                            renderOrder: 1000
                        },
                        axis: {
                            color: '#00ff88',
                            opacity: 0.3
                        },
                        object: {
                            color: '#ff6600',
                            opacity: 0.9,
                            linewidth: 2
                        },
                        preview: {
                            defaultColor: '#00ff00',
                            opacity: 0.8,
                            linewidth: 1
                        },
                        layoutGuides: {
                            color: '#ff0000',
                            opacity: 0.8,
                            linewidth: 2,
                            dashSize: 0.2,
                            gapSize: 0.1
                        }
                    },
                    animation: {
                        fadeStep: 0.03,
                        maxOpacity: 0.1,
                        timeout: 1000
                    },
                    geometry: {
                        normalOffset: 0.001,
                        boxDetectionThreshold: 0.9,
                        duplicateThreshold: 0.1,
                        minPreviewSize: 0.01
                    },
                    cache: {
                        geometryPoolSize: 10,
                        bboxCacheTime: 5000
                    }
                }
            },
            scene: {
                backgroundColor: '#1a1a1a',
                gridSize: 20,
                gridDensity: 20,
                gridMainColor: '#444444',
                gridSubColor: '#222222'
            },
            ui: {
                accentColor: '#4a9eff',
                toolbarOpacity: 0.95,
                panelBackground: '#252525',
                textColor: '#e0e0e0',
                borderColor: '#404040'
            }
        };
        
        // Set current config to defaults initially
        this.config = JSON.parse(JSON.stringify(this.defaultConfig));
        
        // Setup built-in system integrations
        this.setupSystemIntegrations();
    }
    
    /**
     * Setup built-in system integrations
     */
    setupSystemIntegrations() {
        // Subscribe to scene background changes
        this.subscribe('scene.backgroundColor', (newValue) => {
            if (window.updateSceneBackground) {
                window.updateSceneBackground(newValue);
            }
        });

        // Subscribe to container visual changes for real-time updates
        // Only update existing containers if the system is fully initialized
        this.subscribe('visual.containers.wireframeColor', () => {
            if (window.LayoutGeometry && window.modlerComponents?.sceneController?.getAllObjects) {
                window.LayoutGeometry.updateAllContainerMaterials();
            }
        });

        this.subscribe('visual.containers.opacity', () => {
            if (window.LayoutGeometry && window.modlerComponents?.sceneController?.getAllObjects) {
                window.LayoutGeometry.updateAllContainerMaterials();
            }
        });

        this.subscribe('visual.containers.lineWidth', () => {
            if (window.LayoutGeometry && window.modlerComponents?.sceneController?.getAllObjects) {
                window.LayoutGeometry.updateAllContainerMaterials();
            }
        });

        this.subscribe('visual.containers.renderOrder', () => {
            if (window.LayoutGeometry && window.modlerComponents?.sceneController?.getAllObjects) {
                window.LayoutGeometry.updateAllContainerMaterials();
            }
        });

        // Subscribe to VisualEffects configuration changes
        this.setupVisualEffectsIntegrations();

    }

    /**
     * Setup VisualEffects system integrations
     */
    setupVisualEffectsIntegrations() {
        // Register VisualEffects with ConfigurationManager when available
        if (window.VisualEffects) {
            this.registerVisualEffects(window.VisualEffects);
        } else {
            // Wait for VisualEffects to be available
            const checkVisualEffects = () => {
                if (window.VisualEffects) {
                    this.registerVisualEffects(window.VisualEffects);
                } else {
                    setTimeout(checkVisualEffects, 100);
                }
            };
            checkVisualEffects();
        }
    }

    /**
     * Register VisualEffects class for configuration updates
     */
    registerVisualEffects(VisualEffectsClass) {
        // Create bidirectional sync between ConfigurationManager and VisualEffects.Config
        const syncConfigToVisualEffects = () => {
            const effectsConfig = this.get('visual.effects');
            if (effectsConfig && VisualEffectsClass.Config) {
                // Update VisualEffects.Config with values from ConfigurationManager
                this.deepMerge(VisualEffectsClass.Config, effectsConfig);

                // Notify any VisualEffects instances of the change
                if (window.modlerComponents?.visualEffects?.onConfigChanged) {
                    window.modlerComponents.visualEffects.onConfigChanged();
                }
            }
        };

        // Subscribe to all visual effects configuration changes
        const effectsPaths = [
            'visual.selection.color',  // Face highlighting now uses selection color
            'visual.effects.materials.face.opacity',
            'visual.effects.materials.face.renderOrder',
            'visual.effects.materials.axis.color',
            'visual.effects.materials.axis.opacity',
            'visual.effects.materials.object.color',
            'visual.effects.materials.object.opacity',
            'visual.effects.materials.object.linewidth',
            'visual.effects.materials.preview.defaultColor',
            'visual.effects.materials.preview.opacity',
            'visual.effects.materials.preview.linewidth',
            'visual.effects.materials.layoutGuides.color',
            'visual.effects.materials.layoutGuides.opacity',
            'visual.effects.materials.layoutGuides.linewidth',
            'visual.effects.materials.layoutGuides.dashSize',
            'visual.effects.materials.layoutGuides.gapSize',
            'visual.effects.animation.fadeStep',
            'visual.effects.animation.maxOpacity',
            'visual.effects.animation.timeout',
            'visual.effects.geometry.normalOffset',
            'visual.effects.geometry.boxDetectionThreshold',
            'visual.effects.geometry.duplicateThreshold',
            'visual.effects.geometry.minPreviewSize',
            'visual.effects.cache.geometryPoolSize',
            'visual.effects.cache.bboxCacheTime'
        ];

        effectsPaths.forEach(path => {
            this.subscribe(path, syncConfigToVisualEffects);
        });

        // Initial sync
        syncConfigToVisualEffects();

        console.log('VisualEffects configuration integration established');
    }

    /**
     * Apply current configuration values to all integrated systems
     */
    applyConfigurationToSystems() {
        // Apply scene background
        const backgroundColor = this.get('scene.backgroundColor');
        if (backgroundColor && window.updateSceneBackground) {
            window.updateSceneBackground(backgroundColor);
        }
        
        // Trigger all subscribers with current values
        this.subscribers.forEach((callbacks, keyPath) => {
            const currentValue = this.get(keyPath);
            if (currentValue !== null) {
                callbacks.forEach(callback => {
                    try {
                        callback(currentValue, null);
                    } catch (error) {
                        console.error(`Error applying config for ${keyPath}:`, error);
                    }
                });
            }
        });
        
        // Refresh configuration UI with current values
        if (window.updateConfigUIFromValues) {
            window.updateConfigUIFromValues(this.getAll());
        }
        
    }
    
    /**
     * Get configuration value by key path
     */
    get(keyPath, defaultValue = null) {
        return this.getNestedValue(this.config, keyPath, defaultValue);
    }
    
    /**
     * Set configuration value by key path
     */
    set(keyPath, value, save = true) {
        const oldValue = this.get(keyPath);
        
        // Update the configuration
        this.setNestedValue(this.config, keyPath, value);
        
        // Save to storage if requested
        if (save) {
            this.saveToStorage();
        }
        
        // Notify subscribers
        this.notifySubscribers(keyPath, value, oldValue);
        
        console.log(`Config updated: ${keyPath} = ${value}`);
        return true;
    }
    
    /**
     * Subscribe to configuration changes
     */
    subscribe(keyPath, callback) {

        if (typeof callback !== 'function') {
            console.error('ConfigurationManager.subscribe: callback must be a function');
            return false;
        }

        if (!this.subscribers.has(keyPath)) {
            this.subscribers.set(keyPath, []);
        }

        this.subscribers.get(keyPath).push(callback);

        // Immediately call with current value
        const currentValue = this.get(keyPath);

        if (currentValue !== null) {
            callback(currentValue, null);
        }

        return true;
    }
    
    /**
     * Unsubscribe from configuration changes
     */
    unsubscribe(keyPath, callback) {
        if (!this.subscribers.has(keyPath)) return false;
        
        const callbacks = this.subscribers.get(keyPath);
        const index = callbacks.indexOf(callback);
        
        if (index > -1) {
            callbacks.splice(index, 1);
            return true;
        }
        
        return false;
    }
    
    /**
     * Register a component for automatic config updates
     */
    registerComponent(component, configKeys) {
        if (!component || !Array.isArray(configKeys)) {
            console.error('ConfigurationManager.registerComponent: invalid parameters');
            return false;
        }
        
        this.components.set(component, configKeys);
        
        // Subscribe to all config keys for this component
        configKeys.forEach(keyPath => {
            this.subscribe(keyPath, (newValue, oldValue) => {
                if (component.onConfigChanged && typeof component.onConfigChanged === 'function') {
                    component.onConfigChanged(keyPath, newValue, oldValue);
                }
            });
        });
        
        console.log(`Registered component for config keys:`, configKeys);
        return true;
    }
    
    /**
     * Unregister a component
     */
    unregisterComponent(component) {
        if (!this.components.has(component)) return false;
        
        const configKeys = this.components.get(component);
        
        // Unsubscribe from all config keys
        configKeys.forEach(keyPath => {
            if (component.onConfigChanged) {
                this.unsubscribe(keyPath, component.onConfigChanged);
            }
        });
        
        this.components.delete(component);
        return true;
    }
    
    /**
     * Load configuration from localStorage
     */
    loadFromStorage() {
        try {
            const stored = localStorage.getItem(this.storageKey);
            
            if (stored) {
                const parsedConfig = JSON.parse(stored);
                
                // Version check and migration
                if (parsedConfig.version !== this.configVersion) {
                    console.log('Config version mismatch, migrating...');
                    this.migrateConfig(parsedConfig);
                } else {
                    // Merge stored config with defaults to ensure all keys exist
                    this.config = this.mergeConfigs(this.defaultConfig, parsedConfig);
                }
                
                
                // Apply configuration to systems after loading
                this.applyConfigurationToSystems();
            } else {
                console.log('No stored configuration found, using defaults');
                
                // Apply default configuration to systems
                this.applyConfigurationToSystems();
            }
        } catch (error) {
            console.error('Failed to load configuration from storage:', error);
            console.log('Using default configuration');
            this.config = JSON.parse(JSON.stringify(this.defaultConfig));
        }
    }
    
    /**
     * Save configuration to localStorage
     */
    saveToStorage() {
        try {
            const configToSave = JSON.stringify(this.config, null, 2);
            localStorage.setItem(this.storageKey, configToSave);
            console.log('Configuration saved to storage');
            return true;
        } catch (error) {
            console.error('Failed to save configuration to storage:', error);
            return false;
        }
    }
    
    /**
     * Reset configuration to defaults
     */
    resetToDefaults(category = null) {
        if (category) {
            // Reset specific category
            if (this.defaultConfig[category]) {
                const oldConfig = JSON.parse(JSON.stringify(this.config[category]));
                this.config[category] = JSON.parse(JSON.stringify(this.defaultConfig[category]));
                
                // Notify subscribers for this category
                this.notifySubscribersForCategory(category, this.config[category], oldConfig);
                
                console.log(`Reset ${category} configuration to defaults`);
            }
        } else {
            // Reset all configuration
            const oldConfig = JSON.parse(JSON.stringify(this.config));
            this.config = JSON.parse(JSON.stringify(this.defaultConfig));
            
            // Notify all subscribers
            this.notifyAllSubscribers(this.config, oldConfig);
            
            console.log('Reset all configuration to defaults');
        }
        
        this.saveToStorage();
    }
    
    /**
     * Get all configuration as a deep copy
     */
    getAll() {
        return JSON.parse(JSON.stringify(this.config));
    }
    
    /**
     * Get configuration for a specific category
     */
    getCategory(categoryName) {
        return this.config[categoryName] ? 
               JSON.parse(JSON.stringify(this.config[categoryName])) : 
               {};
    }
    
    // Helper methods
    
    /**
     * Get nested object value by dot notation path
     */
    getNestedValue(obj, path, defaultValue = null) {
        const keys = path.split('.');
        let current = obj;
        
        for (const key of keys) {
            if (current === null || current === undefined || !current.hasOwnProperty(key)) {
                return defaultValue;
            }
            current = current[key];
        }
        
        return current;
    }
    
    /**
     * Set nested object value by dot notation path
     */
    setNestedValue(obj, path, value) {
        const keys = path.split('.');
        const lastKey = keys.pop();
        let current = obj;
        
        for (const key of keys) {
            if (!current[key] || typeof current[key] !== 'object') {
                current[key] = {};
            }
            current = current[key];
        }
        
        current[lastKey] = value;
    }
    
    /**
     * Deep merge objects (updates target in place)
     */
    deepMerge(target, source) {
        for (const key in source) {
            if (source.hasOwnProperty(key)) {
                if (typeof source[key] === 'object' && source[key] !== null &&
                    typeof target[key] === 'object' && target[key] !== null) {
                    this.deepMerge(target[key], source[key]);
                } else {
                    target[key] = source[key];
                }
            }
        }
    }

    /**
     * Deep merge two configuration objects
     */
    mergeConfigs(defaultConfig, userConfig) {
        const result = JSON.parse(JSON.stringify(defaultConfig));
        
        function merge(target, source) {
            for (const key in source) {
                if (source.hasOwnProperty(key)) {
                    if (typeof source[key] === 'object' && source[key] !== null && 
                        typeof target[key] === 'object' && target[key] !== null) {
                        merge(target[key], source[key]);
                    } else {
                        target[key] = source[key];
                    }
                }
            }
        }
        
        merge(result, userConfig);
        return result;
    }
    
    /**
     * Notify subscribers of configuration changes
     */
    notifySubscribers(keyPath, newValue, oldValue) {
        console.log('🔧 ConfigurationManager: notifySubscribers called', {
            keyPath,
            newValue,
            oldValue,
            hasSubscribers: this.subscribers.has(keyPath),
            subscriberCount: this.subscribers.has(keyPath) ? this.subscribers.get(keyPath).length : 0
        });

        if (this.subscribers.has(keyPath)) {
            const callbacks = this.subscribers.get(keyPath);
            callbacks.forEach((callback, index) => {
                try {
                    console.log(`🔧 ConfigurationManager: calling subscriber ${index} for ${keyPath}`);
                    callback(newValue, oldValue);
                } catch (error) {
                    console.error(`Error in config subscriber for ${keyPath}:`, error);
                }
            });
        } else {
            console.log(`🔧 ConfigurationManager: No subscribers found for ${keyPath}`);
        }
    }
    
    /**
     * Notify subscribers for an entire category
     */
    notifySubscribersForCategory(category, newConfig, oldConfig) {
        this.subscribers.forEach((callbacks, keyPath) => {
            if (keyPath.startsWith(category + '.')) {
                const newValue = this.getNestedValue(newConfig, keyPath.substring(category.length + 1));
                const oldValue = this.getNestedValue(oldConfig, keyPath.substring(category.length + 1));
                
                callbacks.forEach(callback => {
                    try {
                        callback(newValue, oldValue);
                    } catch (error) {
                        console.error(`Error in config subscriber for ${keyPath}:`, error);
                    }
                });
            }
        });
    }
    
    /**
     * Notify all subscribers (used during reset)
     */
    notifyAllSubscribers(newConfig, oldConfig) {
        this.subscribers.forEach((callbacks, keyPath) => {
            const newValue = this.getNestedValue(newConfig, keyPath);
            const oldValue = this.getNestedValue(oldConfig, keyPath);
            
            callbacks.forEach(callback => {
                try {
                    callback(newValue, oldValue);
                } catch (error) {
                    console.error(`Error in config subscriber for ${keyPath}:`, error);
                }
            });
        });
    }
    
    /**
     * Migrate configuration from older versions
     */
    migrateConfig(oldConfig) {
        // Start with defaults and merge compatible settings
        this.config = JSON.parse(JSON.stringify(this.defaultConfig));
        
        // Add migration logic here as needed for future versions
        console.log(`Migrated configuration from version ${oldConfig.version || 'unknown'} to ${this.configVersion}`);
    }
    
    /**
     * Validate configuration structure
     */
    validateConfig(config) {
        // Basic validation - ensure required categories exist
        const requiredCategories = ['visual', 'scene', 'ui'];
        
        for (const category of requiredCategories) {
            if (!config[category]) {
                console.warn(`Missing configuration category: ${category}`);
                return false;
            }
        }
        
        return true;
    }
    
    /**
     * Cleanup
     */
    destroy() {
        this.subscribers.clear();
        this.components.clear();
        console.log('ConfigurationManager destroyed');
    }
}

// Export class for instantiation
window.ConfigurationManager = ConfigurationManager;