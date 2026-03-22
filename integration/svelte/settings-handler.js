// Modler V2 - Settings Handler
// Centralized settings update and retrieval logic
// Extracted from main-integration.js for better organization

/**
 * Settings Handler
 * Manages configuration updates and retrieval for all setting types
 */
class SettingsHandler {
    constructor() {
        // Settings handler initialized
        this.panelCommunication = null;
    }

    /**
     * Initialize with panel communication
     */
    initialize(panelCommunication) {
        this.panelCommunication = panelCommunication;
    }

    /**
     * Get ConfigurationManager instance
     */
    getConfigManager() {
        return window.modlerComponents?.configurationManager;
    }

    /**
     * Get PropertyPanelSync instance for communication
     */
    getPropertyPanelSync() {
        return window.modlerComponents?.propertyPanelSync;
    }

    /**
     * Handle CAD wireframe settings update
     */
    handleCadWireframeSettingsUpdate(settings) {
        const configurationManager = this.getConfigManager();
        if (!configurationManager) {
            console.warn('❌ ConfigurationManager not available for CAD wireframe settings');
            return;
        }

        // Update configuration using proper ConfigurationManager methods
        for (const [key, value] of Object.entries(settings)) {
            configurationManager.set(key, value);
        }
    }

    /**
     * Handle request for current CAD wireframe settings
     */
    handleGetCadWireframeSettings(source) {
        const configurationManager = this.getConfigManager();
        if (!configurationManager) {
            console.warn('❌ ConfigurationManager not available for getting CAD wireframe settings');
            return;
        }

        const currentSettings = {
            color: configurationManager.get('visual.cad.wireframe.color') || '#888888',
            opacity: configurationManager.get('visual.cad.wireframe.opacity') || 0.8,
            lineWidth: configurationManager.get('visual.cad.wireframe.lineWidth') || 1
        };

        // Send settings response via centralized panel communication
        if (this.panelCommunication) {
            this.panelCommunication.sendSettingsResponse('cad-wireframe-settings', currentSettings);
        }
    }

    /**
     * Handle visual settings update
     */
    handleVisualSettingsUpdate(settings) {
        const configurationManager = this.getConfigManager();
        if (!configurationManager) {
            console.warn('❌ ConfigurationManager not available for visual settings');
            return;
        }

        for (const [key, value] of Object.entries(settings)) {
            configurationManager.set(key, value);
        }
    }

    /**
     * Handle request for current visual settings
     */
    handleGetVisualSettings(source) {
        const configurationManager = this.getConfigManager();
        if (!configurationManager) {
            console.warn('❌ ConfigurationManager not available for getting visual settings');
            return;
        }

        const currentSettings = {
            wireframe: {
                lineWidth: configurationManager.get('visual.wireframe.lineWidth') || 2
            },
            selection: {
                color: configurationManager.get('visual.selection.color') || '#ff6600',
                opacity: configurationManager.get('visual.selection.opacity') || 0.8,
                faceHighlightOpacity: configurationManager.get('visual.selection.faceHighlightOpacity') || 0.3
            },
            containers: {
                wireframeColor: configurationManager.get('visual.containers.wireframeColor') || '#00ff00',
                opacity: configurationManager.get('visual.containers.opacity') || 0.8,
                faceHighlightOpacity: configurationManager.get('visual.containers.faceHighlightOpacity') || 0.3
            },
            cad: {
                wireframe: {
                    color: configurationManager.get('visual.cad.wireframe.color') || '#888888'
                }
            },
            gizmo: {
                color: configurationManager.get('visual.gizmo.color') || '#ff6600',
                lineWidth: configurationManager.get('visual.gizmo.lineWidth') || 2
            }
        };

        // Send settings response via centralized panel communication
        if (this.panelCommunication) {
            this.panelCommunication.sendSettingsResponse('visual-settings', currentSettings);
        }
    }

    /**
     * Handle scene settings update
     */
    handleSceneSettingsUpdate(settings) {
        const configurationManager = this.getConfigManager();
        if (!configurationManager) {
            console.warn('❌ ConfigurationManager not available for scene settings');
            return;
        }

        for (const [key, value] of Object.entries(settings)) {
            configurationManager.set(key, value);
        }
    }

    /**
     * Handle request for current scene settings
     */
    handleGetSceneSettings(source) {
        const configurationManager = this.getConfigManager();
        if (!configurationManager) {
            console.warn('❌ ConfigurationManager not available for getting scene settings');
            return;
        }

        const currentSettings = {
            backgroundColor: configurationManager.get('scene.backgroundColor') || '#1a1a1a',
            gridMainColor: configurationManager.get('scene.gridMainColor') || '#444444',
            gridSubColor: configurationManager.get('scene.gridSubColor') || '#222222'
        };

        // Send settings response via centralized panel communication
        if (this.panelCommunication) {
            this.panelCommunication.sendSettingsResponse('scene-settings', currentSettings);
        }
    }

    /**
     * Handle interface settings update
     */
    handleInterfaceSettingsUpdate(settings) {
        const configurationManager = this.getConfigManager();
        if (!configurationManager) {
            console.warn('❌ ConfigurationManager not available for interface settings');
            return;
        }

        for (const [key, value] of Object.entries(settings)) {
            configurationManager.set(key, value);
        }
    }

    /**
     * Handle unit settings update
     */
    handleUnitSettingsUpdate(settings) {
        const unitConverter = window.unitConverter;
        if (!unitConverter) {
            console.warn('❌ UnitConverter not available for unit settings');
            return;
        }

        const unit = settings['unit.current'];
        if (unit) {
            unitConverter.setUserUnit(unit);

            // Broadcast to all UI iframes via postMessage (CustomEvents don't cross iframe boundaries)
            const simpleCommunication = window.simpleCommunication;
            if (simpleCommunication) {
                simpleCommunication.sendToAllIframes({
                    type: 'unit-changed',
                    data: { unit }
                });
            }
        }
    }

    /**
     * Handle request for current unit settings
     */
    handleGetUnitSettings(source) {
        const unitConverter = window.unitConverter;
        const currentSettings = {
            currentUnit: unitConverter ? unitConverter.userUnit : 'm'
        };

        // Broadcast to ALL iframes (not just left panel) so property panel gets initial unit
        const simpleCommunication = window.simpleCommunication;
        if (simpleCommunication) {
            simpleCommunication.sendToAllIframes({
                type: 'unit-settings-response',
                settings: currentSettings
            });
        }
    }

    /**
     * Handle request for current interface settings
     */
    handleGetInterfaceSettings(source) {
        const configurationManager = this.getConfigManager();
        if (!configurationManager) {
            console.warn('❌ ConfigurationManager not available for getting interface settings');
            return;
        }

        const currentSettings = {
            accentColor: configurationManager.get('interface.accentColor') || '#4a9eff',
            toolbarOpacity: configurationManager.get('interface.toolbarOpacity') || 0.95
        };

        // Send settings response via centralized panel communication
        if (this.panelCommunication) {
            this.panelCommunication.sendSettingsResponse('interface-settings', currentSettings);
        }
    }
}

// Export for use in main-integration
window.SettingsHandler = SettingsHandler;