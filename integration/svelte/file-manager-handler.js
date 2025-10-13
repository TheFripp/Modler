/**
 * FileManager Handler
 * Handles file operations via PostMessage for cross-origin iframe communication
 *
 * Pattern: Handler functions called FROM main-integration.js (not standalone listener)
 * Follows SettingsHandler pattern for consistent architecture
 */

class FileManagerHandler {
    constructor() {
        this.fileManager = null;
        this.panelCommunication = null;
    }

    /**
     * Initialize with FileManager and PanelCommunication
     */
    initialize(fileManager, panelCommunication) {
        this.fileManager = fileManager;
        this.panelCommunication = panelCommunication;

        // Listen to FileManager events and forward to UI
        if (this.fileManager) {
            this.fileManager.addEventListener('file-saved', (e) => {
                this.sendEventToUI('file-saved', e.detail);
            });
            this.fileManager.addEventListener('file-loaded', (e) => {
                this.sendEventToUI('file-loaded', e.detail);
            });
            this.fileManager.addEventListener('file-deleted', (e) => {
                this.sendEventToUI('file-deleted', e.detail);
            });
            this.fileManager.addEventListener('dirty-state-changed', (e) => {
                this.sendEventToUI('dirty-state-changed', e.detail);
            });
            this.fileManager.addEventListener('unsaved-changes-prompt', (e) => {
                this.sendEventToUI('unsaved-changes-prompt', e.detail);
            });
        }

        // Proactively send ready signal to all UI panels after a brief delay
        // to ensure iframes are fully loaded
        setTimeout(() => this.broadcastReadySignal(), 100);
    }

    /**
     * Broadcast ready signal to all UI iframes
     */
    broadcastReadySignal() {
        if (this.panelCommunication) {
            this.panelCommunication.sendDirectMessage(
                'file-manager-ready',
                { isReady: true },
                ['left'] // Send to left panel where FileBrowser lives
            );
        } else {
            // Fallback: Send to all iframes
            const iframes = document.querySelectorAll('iframe');
            iframes.forEach(iframe => {
                if (iframe.contentWindow) {
                    try {
                        iframe.contentWindow.postMessage({
                            type: 'file-manager-ready',
                            data: { isReady: true }
                        }, '*');
                    } catch (error) {
                        // Cross-origin - expected in Vite dev mode
                    }
                }
            });
        }
    }

    /**
     * Get FileManager instance
     */
    getFileManager() {
        return this.fileManager || window.modlerComponents?.fileManager;
    }

    /**
     * Handle request for FileManager ready state
     * Called from main-integration.js
     */
    handleRequestFileManagerReady(source) {
        const fileManager = this.getFileManager();
        if (fileManager && source && source.postMessage) {
            source.postMessage({
                type: 'file-manager-ready',
                data: { isReady: true }
            }, '*');
        }
    }

    /**
     * Handle file operation request
     * Called from main-integration.js with message data
     */
    async handleFileRequest(messageData, source) {
        const fileManager = this.getFileManager();
        if (!fileManager) {
            this.sendResponse(source, messageData.requestId, {
                success: false,
                error: 'FileManager not initialized'
            });
            return;
        }

        const { requestId, operation, params } = messageData;

        try {
            let result;

            switch (operation) {
                case 'newScene':
                    result = await fileManager.newScene(params);
                    break;

                case 'saveScene':
                    result = await fileManager.saveScene(params);
                    break;

                case 'loadScene':
                    result = await fileManager.loadScene(params?.fileId, params?.options);
                    break;

                case 'deleteScene':
                    result = await fileManager.deleteScene(params?.fileId);
                    break;

                case 'renameCurrentFile':
                    result = await fileManager.renameCurrentFile(params?.newName);
                    break;

                case 'listFiles':
                    const files = await fileManager.listFiles(params);
                    result = { success: true, files: files };
                    break;

                case 'getCurrentFileState':
                    result = { success: true, state: fileManager.getCurrentFileState() };
                    break;

                case 'getLastOpenedFileId':
                    result = { success: true, lastOpenedFileId: fileManager.getLastOpenedFileId() };
                    break;

                case 'unsavedChangesResponse':
                    // User responded to unsaved changes dialog
                    if (params?.callback) {
                        params.callback(params.choice);
                    }
                    result = { success: true };
                    break;

                default:
                    result = { success: false, error: `Unknown operation: ${operation}` };
            }

            this.sendResponse(source, requestId, result);

        } catch (error) {
            console.error(`FileManagerHandler: Error handling ${operation}:`, error);
            this.sendResponse(source, requestId, {
                success: false,
                error: error.message
            });
        }
    }

    /**
     * Send response back to requesting iframe
     */
    sendResponse(source, requestId, result) {
        if (source && source.postMessage) {
            source.postMessage({
                type: 'file-manager-response',
                data: {
                    requestId: requestId,
                    result: result
                }
            }, '*');
        }
    }

    /**
     * Send event to all UI iframes
     */
    sendEventToUI(eventType, data) {
        // Use PanelCommunication if available, otherwise fallback to direct postMessage
        if (this.panelCommunication) {
            this.panelCommunication.sendDirectMessage(
                `file-manager-event:${eventType}`,
                data,
                ['left'] // Send to left panel where FileBrowser lives
            );
        } else {
            // Fallback: Send to all iframes
            const iframes = document.querySelectorAll('iframe');
            iframes.forEach(iframe => {
                if (iframe.contentWindow) {
                    iframe.contentWindow.postMessage({
                        type: `file-manager-event:${eventType}`,
                        data: data
                    }, '*');
                }
            });
        }
    }
}

// Create global instance
if (typeof window !== 'undefined') {
    window.FileManagerHandler = FileManagerHandler;
}
