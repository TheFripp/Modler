/**
 * ExportImportHandler - Handles scene/object export and import commands
 *
 * Extracted from CommandRouter to reduce its size.
 * Delegates to ExportImportManager for actual file operations.
 */

class ExportImportHandler {
    handleExportScene(data) {
        const exportImportManager = window.modlerComponents?.exportImportManager;
        if (!exportImportManager) return;
        exportImportManager.exportScene({ fileName: data?.fileName });
    }

    async handleImportScene(data) {
        const exportImportManager = window.modlerComponents?.exportImportManager;
        if (!exportImportManager) return;

        const result = await exportImportManager.importScene();
        if (result.success && data?.sourceWindow) {
            data.sourceWindow.postMessage({
                type: 'scene-imported',
                fileId: result.fileId,
                name: result.name
            }, '*');
        }
    }

    handleExportObject(data) {
        const exportImportManager = window.modlerComponents?.exportImportManager;
        if (!exportImportManager || !data?.objectId) return;
        exportImportManager.exportObject(data.objectId);
    }

    async handleImportObject(data) {
        const exportImportManager = window.modlerComponents?.exportImportManager;
        if (!exportImportManager) return;

        const result = await exportImportManager.importObject();
        if (result.success && data?.sourceWindow) {
            data.sourceWindow.postMessage({
                type: 'object-imported',
                rootId: result.rootId
            }, '*');
        }
    }
}

window.ExportImportHandler = ExportImportHandler;
