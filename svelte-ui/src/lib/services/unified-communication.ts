/**
 * Unified Communication Service (Phase 3)
 *
 * @deprecated Phase 3.5 - Use UIAdapter instead
 * This service is deprecated and will be removed in a future version.
 * New code should use UIAdapter.sendPropertyUpdate() and other UIAdapter methods.
 *
 * Provides Svelte UI components with postMessage communication to Main.
 * All UI→Main communication goes through this service.
 */

interface UnifiedCommunicationService {
    sendObjectMovement(operation: string, data: any): Promise<boolean>;
    sendToolActivation(toolName: string, additionalData?: any): Promise<boolean>;
    sendSnapToggle(): Promise<boolean>;
    sendVisualSettings(settingsType: string, settings: any): Promise<boolean>;
    sendNavigationCommand(commandType: string, data: any): Promise<boolean>;
    sendSelectionChange(objectId: string, isShiftClick?: boolean): Promise<boolean>;
    sendSettingsRequest(requestType: string): Promise<boolean>;
    sendDeleteSelected(): Promise<boolean>;
    sendPropertyUpdate(objectId: string, property: string, value: any): Promise<boolean>;
}

class UnifiedCommunication implements UnifiedCommunicationService {
    private deprecationWarned: boolean = false;

    constructor() {
        // Phase 3: Direct postMessage communication, no initialization needed
        this.showDeprecationWarning();
    }

    private showDeprecationWarning() {
        if (!this.deprecationWarned) {
            console.warn(
                '⚠️ DEPRECATED: UnifiedCommunication is deprecated. ' +
                'Use UIAdapter instead. ' +
                'This service will be removed in a future version.'
            );
            this.deprecationWarned = true;
        }
    }

    /**
     * Send object movement/reordering commands
     */
    async sendObjectMovement(operation: string, data: any): Promise<boolean> {
        return this.sendPostMessage(`object-${operation}`, data);
    }

    /**
     * Send tool activation commands
     */
    async sendToolActivation(toolName: string, additionalData: any = {}): Promise<boolean> {
        return this.sendPostMessage('tool-activation', { toolName, ...additionalData });
    }

    /**
     * Send snap toggle commands
     */
    async sendSnapToggle(): Promise<boolean> {
        return this.sendPostMessage('snap-toggle', {});
    }

    /**
     * Send visual settings updates
     */
    async sendVisualSettings(settingsType: string, settings: any): Promise<boolean> {
        return this.sendPostMessage(`${settingsType}-settings-changed`, { settings });
    }

    /**
     * Send navigation/selection commands
     */
    async sendNavigationCommand(commandType: string, data: any): Promise<boolean> {
        return this.sendPostMessage(commandType, data);
    }

    /**
     * Send selection change (convenience wrapper for object-select command)
     */
    async sendSelectionChange(objectId: string, isShiftClick: boolean = false): Promise<boolean> {
        return this.sendNavigationCommand('object-select', {
            objectId,
            useNavigationController: true,
            isShiftClick
        });
    }

    /**
     * Send settings request commands
     */
    async sendSettingsRequest(requestType: string): Promise<boolean> {
        return this.sendPostMessage(requestType, {});
    }

    /**
     * Send delete selected objects command
     */
    async sendDeleteSelected(): Promise<boolean> {
        return this.sendPostMessage('delete-selected', {});
    }

    /**
     * Send property update command (e.g., for renaming objects)
     */
    async sendPropertyUpdate(objectId: string, property: string, value: any): Promise<boolean> {
        return this.sendPostMessage('property-update', {
            objectId,
            property,
            value
        });
    }

    /**
     * Phase 3: Direct PostMessage to Main window
     */
    private sendPostMessage(type: string, data: any): Promise<boolean> {
        return new Promise((resolve) => {
            try {
                if (window.parent && window.parent !== window) {
                    const message = {
                        type,
                        data,
                        timestamp: Date.now(),
                        source: 'UnifiedCommunication'
                    };

                    window.parent.postMessage(message, '*');
                    resolve(true);
                } else {
                    resolve(false);
                }
            } catch (error) {
                console.error('UnifiedCommunication error:', error);
                resolve(false);
            }
        });
    }

    /**
     * Phase 3: Service is always initialized
     */
    isInitialized(): boolean {
        return true;
    }

    /**
     * Get connection status for debugging
     */
    getStatus(): { initialized: boolean } {
        return {
            initialized: true
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
                sendDeleteSelected: async () => false,
                sendPropertyUpdate: async () => false,
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
    sendSelectionChange: async (objectId: string, isShiftClick?: boolean) => unifiedCommunication.instance.sendSelectionChange(objectId, isShiftClick),
    sendSettingsRequest: async (requestType: string) => unifiedCommunication.instance.sendSettingsRequest(requestType),
    sendDeleteSelected: async () => unifiedCommunication.instance.sendDeleteSelected(),
    sendPropertyUpdate: async (objectId: string, property: string, value: any) => unifiedCommunication.instance.sendPropertyUpdate(objectId, property, value),
    isInitialized: () => unifiedCommunication.instance.isInitialized(),
    getStatus: () => unifiedCommunication.instance.getStatus()
};

// Export for manual instantiation if needed
export { UnifiedCommunication };

// Export types
export type { UnifiedCommunicationService };