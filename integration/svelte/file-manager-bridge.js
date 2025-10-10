/**
 * FileManager Bridge - PostMessage Interface for File Operations
 *
 * Handles file operations via PostMessage for cross-origin iframe communication.
 * UI panels cannot access window.parent.modlerComponents directly (SecurityError).
 */

class FileManagerBridge {
    constructor() {
        this.fileManager = null;
        this.setupMessageListener();
    }

    /**
     * Initialize with FileManager reference
     */
    initialize(fileManager) {
        this.fileManager = fileManager;

        // Listen to FileManager events and forward to UI
        if (this.fileManager) {
            this.fileManager.addEventListener('file-saved', (e) => {
                this.sendToUI('file-saved', e.detail);
            });
            this.fileManager.addEventListener('file-loaded', (e) => {
                this.sendToUI('file-loaded', e.detail);
            });
            this.fileManager.addEventListener('file-deleted', (e) => {
                this.sendToUI('file-deleted', e.detail);
            });
            this.fileManager.addEventListener('dirty-state-changed', (e) => {
                this.sendToUI('dirty-state-changed', e.detail);
            });
            this.fileManager.addEventListener('unsaved-changes-prompt', (e) => {
                this.sendToUI('unsaved-changes-prompt', e.detail);
            });
        }
    }

    /**
     * Setup message listener for UI requests
     */
    setupMessageListener() {
        window.addEventListener('message', async (event) => {
            const { type, data, requestId } = event.data;

            // Handle file operation requests
            switch (type) {
                case 'file-manager-request':
                    await this.handleFileRequest(data, requestId, event.source);
                    break;

                case 'request-file-manager-ready':
                    // UI is asking if FileManager is ready
                    if (this.fileManager) {
                        this.sendToSource(event.source, 'file-manager-ready', {});
                    }
                    break;
            }
        });
    }

    /**
     * Handle file operation requests from UI
     */
    async handleFileRequest(data, requestId, source) {
        if (!this.fileManager) {
            this.sendResponse(source, requestId, { success: false, error: 'FileManager not initialized' });
            return;
        }

        const { operation, params } = data;

        try {
            let result;

            switch (operation) {
                case 'newScene':
                    result = await this.fileManager.newScene(params);
                    break;

                case 'saveScene':
                    result = await this.fileManager.saveScene(params);
                    break;

                case 'loadScene':
                    result = await this.fileManager.loadScene(params.fileId, params.options);
                    break;

                case 'deleteScene':
                    result = await this.fileManager.deleteScene(params.fileId);
                    break;

                case 'renameCurrentFile':
                    result = await this.fileManager.renameCurrentFile(params.newName);
                    break;

                case 'listFiles':
                    result = await this.fileManager.listFiles(params);
                    // Return as array directly
                    result = { success: true, files: result };
                    break;

                case 'getCurrentFileState':
                    result = { success: true, state: this.fileManager.getCurrentFileState() };
                    break;

                case 'getLastOpenedFileId':
                    result = { success: true, lastOpenedFileId: this.fileManager.getLastOpenedFileId() };
                    break;

                case 'unsavedChangesResponse':
                    // User responded to unsaved changes dialog
                    if (params.callback) {
                        params.callback(params.choice);
                    }
                    result = { success: true };
                    break;

                default:
                    result = { success: false, error: `Unknown operation: ${operation}` };
            }

            this.sendResponse(source, requestId, result);

        } catch (error) {
            console.error(`FileManagerBridge: Error handling ${operation}:`, error);
            this.sendResponse(source, requestId, {
                success: false,
                error: error.message
            });
        }
    }

    /**
     * Send response back to requesting iframe
     */
    sendResponse(source, requestId, data) {
        if (source && source.postMessage) {
            source.postMessage({
                type: 'file-manager-response',
                requestId: requestId,
                data: data
            }, '*');
        }
    }

    /**
     * Send message to specific source
     */
    sendToSource(source, type, data) {
        if (source && source.postMessage) {
            source.postMessage({ type, data }, '*');
        }
    }

    /**
     * Send event to all UI iframes
     */
    sendToUI(eventType, data) {
        // Send to all potential iframe targets
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

// Create global instance
if (typeof window !== 'undefined') {
    window.FileManagerBridge = FileManagerBridge;
}
