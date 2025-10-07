// Modler V2 - Panel Communication Manager
// Centralized panel communication with consistent message handling
// Replaces scattered postMessage calls with unified interface

/**
 * Panel Communication Manager
 * Provides centralized, consistent communication with all UI panels
 *
 * Design Goals:
 * 1. Single source of truth for panel access
 * 2. Consistent message structure across all communications
 * 3. Type-safe message routing (different message types for different purposes)
 * 4. Clear separation between data updates and control messages
 */
class PanelCommunication {
    constructor(panelManager) {
        this.panelManager = panelManager;
        this.stats = {
            messagesSent: 0,
            messagesFailed: 0
        };
    }

    /**
     * Get iframe reference for a specific panel
     * @param {string} panelName - 'left', 'right', 'mainToolbar', 'systemToolbar'
     * @returns {HTMLIFrameElement|null}
     */
    getPanelIframe(panelName) {
        if (!this.panelManager) {
            console.warn('PanelCommunication: panelManager not available');
            return null;
        }

        let iframe = null;

        // Support both DirectComponentManager and legacy PanelManager
        if (this.panelManager.componentInstances) {
            // DirectComponentManager
            const componentMap = {
                'left': 'leftPanel',
                'right': 'propertyPanel',
                'mainToolbar': 'mainToolbar',
                'systemToolbar': 'systemToolbar'
            };
            const componentKey = componentMap[panelName];
            iframe = this.panelManager.componentInstances[componentKey]?.iframe;
        } else if (typeof this.panelManager.getIframes === 'function') {
            // Legacy PanelManager
            const iframes = this.panelManager.getIframes();
            iframe = iframes[panelName];
        }

        return iframe;
    }

    /**
     * Send a data update to panels (selection changes, object updates, etc.)
     * Uses 'data-update' wrapper for compatibility with existing UI code
     *
     * @param {string} updateType - Type of update (e.g., 'selection-change', 'hierarchy-changed')
     * @param {Object} data - Update data
     * @param {Array<string>} panels - Target panels ['left', 'right', etc.]
     */
    sendDataUpdate(updateType, data, panels = ['right']) {
        for (const panelName of panels) {
            const iframe = this.getPanelIframe(panelName);
            if (!iframe || !iframe.contentWindow) {
                console.warn(`PanelCommunication: ${panelName} panel not available`);
                continue;
            }

            try {
                const message = {
                    type: 'data-update',
                    data: {
                        updateType,
                        timestamp: Date.now(),
                        ...data
                    }
                };

                iframe.contentWindow.postMessage(message, '*');
                this.stats.messagesSent++;
            } catch (error) {
                console.error(`PanelCommunication: Failed to send to ${panelName}:`, error);
                this.stats.messagesFailed++;
            }
        }
    }

    /**
     * Send a direct message to panels (settings responses, tool state, etc.)
     * Message type is NOT wrapped - sent directly as specified
     *
     * @param {string} messageType - Direct message type (e.g., 'visual-settings-response')
     * @param {Object} messageData - Message data
     * @param {Array<string>} panels - Target panels ['left', 'right', etc.]
     */
    sendDirectMessage(messageType, messageData, panels = ['left']) {
        for (const panelName of panels) {
            const iframe = this.getPanelIframe(panelName);
            if (!iframe || !iframe.contentWindow) {
                console.warn(`PanelCommunication: ${panelName} panel not available`);
                continue;
            }

            try {
                const message = {
                    type: messageType,
                    ...messageData
                };

                iframe.contentWindow.postMessage(message, '*');
                this.stats.messagesSent++;
            } catch (error) {
                console.error(`PanelCommunication: Failed to send to ${panelName}:`, error);
                this.stats.messagesFailed++;
            }
        }
    }

    /**
     * Send settings response to left panel
     * Convenience method for settings handler
     */
    sendSettingsResponse(settingsType, settings) {
        this.sendDirectMessage(`${settingsType}-response`, { settings }, ['left']);
    }

    /**
     * Send tool state update to toolbars
     * Convenience method for tool state updates
     */
    sendToolStateUpdate(toolState) {
        this.sendDirectMessage('tool-state-update', { toolState }, ['mainToolbar', 'systemToolbar']);
    }

    /**
     * Get communication statistics
     */
    getStats() {
        return {
            ...this.stats,
            successRate: this.stats.messagesSent + this.stats.messagesFailed > 0
                ? ((this.stats.messagesSent / (this.stats.messagesSent + this.stats.messagesFailed)) * 100).toFixed(1) + '%'
                : '0%'
        };
    }
}

// Export for use in main-integration
window.PanelCommunication = PanelCommunication;
