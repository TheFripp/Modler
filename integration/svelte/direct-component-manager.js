/**
 * Direct Svelte Component Manager
 * Replaces iframe-based panel system with direct component mounting
 * Enables native CSS resize functionality and direct communication
 * @version 1.0.1 - Fixed initialization
 */

class DirectComponentManager {
    constructor() {
        this.components = {
            leftPanel: null,
            propertyPanel: null,
            mainToolbar: null
        };
        this.componentInstances = {};
        this.isInitialized = false;
    }

    /**
     * Initialize direct component mounting system
     */
    async initialize() {
        if (this.isInitialized) return;

        try {

            // Import Svelte components dynamically
            await this.loadComponentModules();

            // Mount components directly in DOM containers
            await this.mountAllComponents();

            this.isInitialized = true;

            // Initial data sync handled by Svelte bridge (threejs-bridge.ts)
            // No need for delayed refresh - race condition prone

            return true;
        } catch (error) {
            console.error('❌ Failed to initialize Direct Component Manager:', error);
            return false;
        }
    }

    /**
     * Load Svelte component modules dynamically
     */
    async loadComponentModules() {
        try {
            // In a production setup, these would be built component bundles
            // For now, we'll prepare the mounting points and expect components
            // to be built and served from the Svelte development server

            this.components = {
                leftPanel: 'LeftPanel',
                propertyPanel: 'PropertyPanel',
                mainToolbar: 'MainToolbar'
            };

        } catch (error) {
            console.error('❌ Failed to load component modules:', error);
            throw error;
        }
    }

    /**
     * Mount all Svelte components directly in DOM containers
     */
    async mountAllComponents() {
        const loadStart = performance.now();

        try {
            // Get initial data with error handling
            let leftPanelData, propertyPanelData, toolbarData;

            try {
                leftPanelData = this.getInitialLeftPanelData();
            } catch (error) {
                console.warn('⚠️ Error getting left panel data:', error);
                leftPanelData = { objectHierarchy: [], selectedObjects: [], toolState: 'select' };
            }

            try {
                propertyPanelData = this.getInitialPropertyPanelData();
            } catch (error) {
                console.warn('⚠️ Error getting property panel data:', error);
                propertyPanelData = { selectedObjects: [], properties: {} };
            }

            try {
                toolbarData = this.getInitialToolbarData();
            } catch (error) {
                console.warn('⚠️ Error getting toolbar data:', error);
                toolbarData = { currentTool: 'select', availableTools: ['select', 'box', 'move', 'push'] };
            }

            // Mount all panels in parallel instead of sequential
            await Promise.all([
                this.mountComponent('leftPanel', 'left-panel-container', {
                    initialData: leftPanelData
                }),
                this.mountComponent('propertyPanel', 'property-panel-container', {
                    initialData: propertyPanelData
                }),
                this.mountComponent('mainToolbar', 'main-toolbar-container', {
                    initialData: toolbarData
                })
            ]);

            const loadTime = (performance.now() - loadStart).toFixed(0);
            console.log(`✅ All panels loaded in ${loadTime}ms`);

            // Show resize gutters after panels are loaded
            setTimeout(() => {
                document.querySelectorAll('.gutter').forEach(gutter => {
                    gutter.classList.add('loaded');
                });
            }, 100);

        } catch (error) {
            console.error('❌ Failed to mount components:', error);
            throw error;
        }
    }

    /**
     * Mount individual Svelte component using temporary iframe approach
     * TODO: Replace with proper Svelte component compilation/mounting
     */
    async mountComponent(componentName, containerId, props = {}) {
        const componentStart = performance.now();

        const container = document.getElementById(containerId);
        if (!container) {
            throw new Error(`Container ${containerId} not found`);
        }

        // Temporary solution: Create iframe but prepare for direct mounting
        // This maintains current functionality while we transition
        const iframe = document.createElement('iframe');

        // Map component names to routes
        const routeMap = {
            leftPanel: '/left-panel',
            propertyPanel: '/property-panel',
            mainToolbar: '/main-toolbar'
        };

        const route = routeMap[componentName];
        if (!route) {
            throw new Error(`Unknown component: ${componentName}`);
        }

        // Use Svelte dev server URL
        iframe.src = `http://localhost:5173${route}`;
        iframe.style.cssText = `
            width: 100%;
            height: 100%;
            border: none;
            background: transparent;
        `;

        container.appendChild(iframe);

        // Map component names to their parent container classes
        const parentContainerMap = {
            leftPanel: '.left-panel',
            propertyPanel: '.property-panel',
            mainToolbar: '.floating-toolbar'
        };

        // Return promise that resolves when iframe is loaded
        return new Promise((resolve) => {
            // Expose modlerComponents to iframe window after it loads
            iframe.addEventListener('load', () => {
                const componentTime = (performance.now() - componentStart).toFixed(0);
                console.log(`✅ ${componentName} loaded in ${componentTime}ms`);

                try {
                    // Only works for same-origin iframes
                    if (iframe.contentWindow && window.modlerComponents) {
                        iframe.contentWindow.modlerComponents = window.modlerComponents;
                    }
                } catch (error) {
                    // Cross-origin - can't access iframe contentWindow
                    console.warn(`⚠️ Cannot expose modlerComponents to ${componentName} iframe (cross-origin)`);
                }

                // Trigger slide-in animation by adding 'loaded' class to parent container
                const parentSelector = parentContainerMap[componentName];
                if (parentSelector) {
                    const parentContainer = document.querySelector(parentSelector);
                    if (parentContainer) {
                        parentContainer.classList.add('loaded');
                    }
                }

                resolve();
            });

            // Store reference for communication
            this.componentInstances[componentName] = {
                iframe,
                container,
                props,
                mounted: true
            };
        });
    }

    /**
     * Get component instance for direct communication
     */
    getComponent(componentName) {
        return this.componentInstances[componentName];
    }

    /**
     * Send message directly to component
     * ARCHITECTURE: Uses PropertyPanelSync for all postMessage communication
     */
    sendToComponent(componentName, message) {
        // ARCHITECTURE: Route through PropertyPanelSync (ONLY authorized postMessage source)
        const propertyPanelSync = window.modlerComponents?.propertyPanelSync;
        if (!propertyPanelSync) {
            console.warn('DirectComponentManager: PropertyPanelSync not available');
            return;
        }

        // Map component name to panel name
        const panelMap = {
            'PropertyPanel': 'right',
            'ObjectListPanel': 'left',
            'MainToolbar': 'mainToolbar',
            'SystemToolbar': 'systemToolbar'
        };

        const panelName = panelMap[componentName];
        if (panelName) {
            propertyPanelSync.sendToUI(message.type || 'data-update', [], {
                throttle: false,
                panels: [panelName],
                includeContext: false,
                customData: message.data || message
            });
        } else {
            console.warn(`DirectComponentManager: Unknown component ${componentName}`);
        }
    }

    /**
     * Broadcast message to all components
     * ARCHITECTURE: Uses PropertyPanelSync for all postMessage communication
     */
    broadcastToAll(message) {
        // ARCHITECTURE: Route through PropertyPanelSync (ONLY authorized postMessage source)
        const propertyPanelSync = window.modlerComponents?.propertyPanelSync;
        if (propertyPanelSync) {
            propertyPanelSync.sendToUI(message.type || 'data-update', [], {
                throttle: false,
                panels: ['right', 'left', 'mainToolbar', 'systemToolbar'],
                includeContext: false,
                customData: message.data || message
            });
        } else {
            console.warn('DirectComponentManager: PropertyPanelSync not available for broadcast');
        }
    }

    /**
     * Get initial data for left panel
     */
    getInitialLeftPanelData() {
        try {
            const components = window.modlerComponents;
            return {
                objectHierarchy: this.safeGetAllObjects(components),
                selectedObjects: this.safeGetSelectedObjects(components),
                toolState: this.safeGetActiveTool(components)
            };
        } catch (error) {
            console.warn('⚠️ DirectComponentManager: Error getting left panel data, using defaults:', error);
            return {
                objectHierarchy: [],
                selectedObjects: [],
                toolState: 'select'
            };
        }
    }

    /**
     * Get initial data for property panel
     */
    getInitialPropertyPanelData() {
        try {
            const selectedObjects = this.safeGetSelectedObjects(window.modlerComponents);
            return {
                selectedObjects,
                properties: selectedObjects.length > 0 ? (selectedObjects[0].properties || {}) : {}
            };
        } catch (error) {
            console.warn('⚠️ DirectComponentManager: Error getting property panel data, using defaults:', error);
            return {
                selectedObjects: [],
                properties: {}
            };
        }
    }

    /**
     * Get initial data for toolbar
     */
    getInitialToolbarData() {
        try {
            return {
                currentTool: this.safeGetActiveTool(window.modlerComponents),
                availableTools: ['select', 'box', 'move', 'push']
            };
        } catch (error) {
            console.warn('⚠️ DirectComponentManager: Error getting toolbar data, using defaults:', error);
            return {
                currentTool: 'select',
                availableTools: ['select', 'box', 'move', 'push']
            };
        }
    }

    /**
     * Safe helper methods for component access
     */
    safeGetAllObjects(components) {
        try {
            // Try ObjectStateManager first
            let objects = components?.objectStateManager?.getAllObjects?.() || [];

            // If no objects from ObjectStateManager, try SceneController
            if (objects.length === 0) {
                objects = components?.sceneController?.getAllObjects?.() || [];
            }

            return objects;
        } catch (error) {
            console.warn('DirectComponentManager: getAllObjects failed:', error);
            return [];
        }
    }

    safeGetSelectedObjects(components) {
        try {
            return components?.selectionController?.getSelectedObjects?.() || [];
        } catch (error) {
            console.warn('DirectComponentManager: getSelectedObjects failed:', error);
            return [];
        }
    }

    safeGetActiveTool(components) {
        try {
            // Try getActiveToolName first (correct method name)
            if (components?.toolController?.getActiveToolName) {
                return components.toolController.getActiveToolName() || 'select';
            }
            // Fallback to accessing activeToolName property directly
            if (components?.toolController?.activeToolName) {
                return components.toolController.activeToolName;
            }
            return 'select';
        } catch (error) {
            console.warn('DirectComponentManager: getActiveTool failed:', error);
            return 'select';
        }
    }

    /**
     * Refresh object data for all components (delayed initialization fix)
     */
    refreshObjectData() {

        try {
            const components = window.modlerComponents;
            const refreshedData = {
                objectHierarchy: this.safeGetAllObjects(components),
                selectedObjects: this.safeGetSelectedObjects(components),
                toolState: this.safeGetActiveTool(components)
            };


            // Send updated data to left panel
            this.sendToComponent('leftPanel', {
                type: 'OBJECT_UPDATE',
                data: refreshedData
            });

            // Send updated data to property panel
            this.sendToComponent('propertyPanel', {
                type: 'OBJECT_UPDATE',
                data: {
                    selectedObjects: refreshedData.selectedObjects,
                    properties: refreshedData.selectedObjects.length > 0 ?
                        (refreshedData.selectedObjects[0].properties || {}) : {}
                }
            });

        } catch (error) {
            console.warn('⚠️ RefreshObjectData failed:', error);
        }
    }

    /**
     * Clean up all mounted components
     */
    destroy() {
        Object.values(this.componentInstances).forEach(instance => {
            if (instance.container && instance.iframe) {
                instance.container.removeChild(instance.iframe);
            }
        });

        this.componentInstances = {};
        this.isInitialized = false;
    }
}

// Export for use in main integration
window.DirectComponentManager = DirectComponentManager;