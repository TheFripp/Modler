/**
 * Unified Communication Service
 *
 * Provides Svelte components with access to PropertyPanelSync unified communication methods.
 * Replaces all direct PostMessage calls with centralized, reliable communication.
 */

interface UnifiedCommunicationService {
    sendObjectMovement(operation: string, data: any): Promise<boolean>;
    sendToolActivation(toolName: string, additionalData?: any): Promise<boolean>;
    sendSnapToggle(): Promise<boolean>;
    sendVisualSettings(settingsType: string, settings: any): Promise<boolean>;
    sendNavigationCommand(commandType: string, data: any): Promise<boolean>;
    sendSettingsRequest(requestType: string): Promise<boolean>;
}

class UnifiedCommunication implements UnifiedCommunicationService {
    private propertyPanelSync: any = null;
    private initialized = false;

    constructor() {
        this.initializeConnection();
    }

    /**
     * Initialize connection to PropertyPanelSync
     */
    private initializeConnection() {
        // Browser check for SSR compatibility
        if (typeof window === 'undefined') {
            return;
        }

        // Try to get PropertyPanelSync from various sources
        const tryGetSync = () => {
            // Browser check for SSR compatibility
            if (typeof window === 'undefined') {
                return false;
            }

            // From global window (main application)
            if ((window as any).propertyPanelSync) {
                this.propertyPanelSync = (window as any).propertyPanelSync;
                this.initialized = true;
                return true;
            }

            // From parent window (iframe context) - use PostMessage pattern instead of direct access
            if (window.parent && window.parent !== window) {
                // Don't try direct access as it gets blocked by CORS
                // Will fall through to PostMessage fallback which is the correct approach
            }

            // From modler components
            if ((window as any).modlerComponents?.propertyPanelSync) {
                this.propertyPanelSync = (window as any).modlerComponents.propertyPanelSync;
                this.initialized = true;
                return true;
            }

            return false;
        };

        // Try immediately
        if (tryGetSync()) {
            return;
        }

        // Poll for availability
        const pollInterval = setInterval(() => {
            if (tryGetSync()) {
                clearInterval(pollInterval);
            }
        }, 100);

        // Stop polling after 2 seconds (faster detection for iframe context)
        setTimeout(() => {
            clearInterval(pollInterval);
            if (!this.initialized) {
                // In iframe context, PostMessage fallback is expected behavior
                if (window.parent && window.parent !== window) {
                    console.log('✅ UnifiedCommunication: Using PostMessage fallback (iframe context)');
                } else {
                    console.warn('UnifiedCommunication: PropertyPanelSync not found, using PostMessage fallback');
                }
            }
        }, 2000);
    }

    /**
     * Send object movement/reordering commands
     */
    async sendObjectMovement(operation: string, data: any): Promise<boolean> {
        if (this.propertyPanelSync) {
            return this.propertyPanelSync.sendObjectMovement(operation, data);
        }

        // Fallback to direct PostMessage
        return this.fallbackPostMessage(`object-${operation}`, data);
    }

    /**
     * Send tool activation commands
     */
    async sendToolActivation(toolName: string, additionalData: any = {}): Promise<boolean> {
        if (this.propertyPanelSync) {
            return this.propertyPanelSync.sendToolActivation(toolName, additionalData);
        }

        // Fallback to direct PostMessage
        return this.fallbackPostMessage('tool-activation', { toolName, ...additionalData });
    }

    /**
     * Send snap toggle commands
     */
    async sendSnapToggle(): Promise<boolean> {
        if (this.propertyPanelSync) {
            return this.propertyPanelSync.sendSnapToggle();
        }

        // Fallback to direct PostMessage
        return this.fallbackPostMessage('snap-toggle', {});
    }

    /**
     * Send visual settings updates
     */
    async sendVisualSettings(settingsType: string, settings: any): Promise<boolean> {
        if (this.propertyPanelSync) {
            return this.propertyPanelSync.sendVisualSettings(settingsType, settings);
        }

        // Fallback to direct PostMessage
        return this.fallbackPostMessage(`${settingsType}-settings-changed`, { settings });
    }

    /**
     * Send navigation/selection commands
     */
    async sendNavigationCommand(commandType: string, data: any): Promise<boolean> {
        if (this.propertyPanelSync) {
            return this.propertyPanelSync.sendNavigationCommand(commandType, data);
        }

        // Fallback to direct PostMessage
        return this.fallbackPostMessage(commandType, data);
    }

    /**
     * Send settings request commands
     */
    async sendSettingsRequest(requestType: string): Promise<boolean> {
        if (this.propertyPanelSync) {
            return this.propertyPanelSync.sendSettingsRequest(requestType);
        }

        // Fallback to direct PostMessage
        return this.fallbackPostMessage(requestType, {});
    }

    /**
     * Fallback to direct PostMessage when PropertyPanelSync is not available
     * Attempts to authorize through global PropertyPanelSync if available
     */
    private fallbackPostMessage(type: string, data: any): Promise<boolean> {
        return new Promise((resolve) => {
            try {
                if (window.parent && window.parent !== window) {
                    const message = {
                        type,
                        data,
                        timestamp: Date.now(),
                        source: 'UnifiedCommunication_Fallback'
                    };

                    // Try to authorize through global PropertyPanelSync if available
                    const globalPropertyPanelSync = (window as any).propertyPanelSync;

                    if (globalPropertyPanelSync && globalPropertyPanelSync.authorizePostMessage) {
                        // Authorize the message before sending
                        globalPropertyPanelSync.authorizePostMessage(message);
                        console.log('📤 UnifiedCommunication: Authorized fallback PostMessage for', type);
                    } else {
                        // No local PropertyPanelSync available, send message anyway
                        // The parent window PropertyPanelSync will handle authorization on receipt
                    }

                    window.parent.postMessage(message, '*');
                    resolve(true);
                } else {
                    console.warn('UnifiedCommunication: No parent window available for fallback');
                    resolve(false);
                }
            } catch (error) {
                console.error('UnifiedCommunication fallback error:', error);
                resolve(false);
            }
        });
    }

    /**
     * Check if the service is properly initialized
     */
    isInitialized(): boolean {
        return this.initialized;
    }

    /**
     * Get connection status for debugging
     */
    getStatus(): { initialized: boolean; hasPropertyPanelSync: boolean } {
        return {
            initialized: this.initialized,
            hasPropertyPanelSync: !!this.propertyPanelSync
        };
    }
}

// Lazy-loaded singleton instance for SSR compatibility
let _unifiedCommunication: UnifiedCommunication | null = null;

export const unifiedCommunication = {
    get instance(): UnifiedCommunication {
        if (typeof window === 'undefined') {
            // Return a mock instance during SSR that fails gracefully
            return {
                sendObjectMovement: async () => false,
                sendToolActivation: async () => false,
                sendSnapToggle: async () => false,
                sendVisualSettings: async () => false,
                sendNavigationCommand: async () => false,
                sendSettingsRequest: async () => false,
                isInitialized: () => false,
                getStatus: () => ({ initialized: false, hasPropertyPanelSync: false })
            } as UnifiedCommunication;
        }

        if (!_unifiedCommunication) {
            _unifiedCommunication = new UnifiedCommunication();
        }
        return _unifiedCommunication;
    },

    // Proxy methods for convenience
    sendObjectMovement: async (operation: string, data: any) => unifiedCommunication.instance.sendObjectMovement(operation, data),
    sendToolActivation: async (toolName: string, additionalData?: any) => unifiedCommunication.instance.sendToolActivation(toolName, additionalData),
    sendSnapToggle: async () => unifiedCommunication.instance.sendSnapToggle(),
    sendVisualSettings: async (settingsType: string, settings: any) => unifiedCommunication.instance.sendVisualSettings(settingsType, settings),
    sendNavigationCommand: async (commandType: string, data: any) => unifiedCommunication.instance.sendNavigationCommand(commandType, data),
    sendSettingsRequest: async (requestType: string) => unifiedCommunication.instance.sendSettingsRequest(requestType),
    isInitialized: () => unifiedCommunication.instance.isInitialized(),
    getStatus: () => unifiedCommunication.instance.getStatus()
};

// Export for manual instantiation if needed
export { UnifiedCommunication };

// Export types
export type { UnifiedCommunicationService };