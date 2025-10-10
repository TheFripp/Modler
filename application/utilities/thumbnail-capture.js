/**
 * ThumbnailCapture - Scene Thumbnail Generation
 *
 * Captures screenshots of the 3D scene for file thumbnails.
 * Used by FileManager during save operations.
 *
 * Performance considerations:
 * - Uses existing renderer (no additional rendering overhead)
 * - Throttled to avoid performance impact
 * - Only captures when scene is idle
 */

class ThumbnailCapture {
    constructor() {
        // Component references
        this.renderer = null;
        this.canvas = null;

        // Throttle configuration
        this.lastCaptureTime = 0;
        this.minCaptureInterval = 2000; // Minimum 2 seconds between captures

        // Statistics
        this.stats = {
            captures: 0,
            throttled: 0,
            errors: 0
        };
    }

    /**
     * Initialize component references
     */
    initializeComponents() {
        if (!this.renderer) {
            this.renderer = window.modlerComponents?.renderer;
        }
        if (!this.canvas) {
            this.canvas = this.renderer?.domElement;
        }
    }

    /**
     * Capture scene thumbnail
     * @param {number} width - Thumbnail width (default: 320)
     * @param {number} height - Thumbnail height (default: 180)
     * @param {Object} options - Capture options
     * @param {boolean} options.ignoreThrottle - Skip throttle check
     * @returns {Promise<string>} Base64-encoded PNG data URL
     */
    async captureSceneThumbnail(width = 320, height = 180, options = {}) {
        try {
            this.initializeComponents();

            if (!this.renderer || !this.canvas) {
                throw new Error('Renderer not available');
            }

            // Check throttle (skip for manual saves)
            if (!options.ignoreThrottle) {
                const now = Date.now();
                if (now - this.lastCaptureTime < this.minCaptureInterval) {
                    this.stats.throttled++;
                    throw new Error('Thumbnail capture throttled');
                }
                this.lastCaptureTime = now;
            }

            // Capture current canvas content
            const dataUrl = this.canvas.toDataURL('image/png');

            // Resize if needed
            const thumbnail = await this.resizeImage(dataUrl, width, height);

            // Update statistics
            this.stats.captures++;

            return thumbnail;

        } catch (error) {
            this.stats.errors++;
            // Silently fail - thumbnail is optional, don't pollute console
            throw error;
        }
    }

    /**
     * Resize image to specified dimensions
     * @param {string} dataUrl - Source image data URL
     * @param {number} targetWidth - Target width
     * @param {number} targetHeight - Target height
     * @returns {Promise<string>} Resized image data URL
     */
    async resizeImage(dataUrl, targetWidth, targetHeight) {
        return new Promise((resolve, reject) => {
            const img = new Image();

            img.onload = () => {
                // Create canvas for resizing
                const canvas = document.createElement('canvas');
                canvas.width = targetWidth;
                canvas.height = targetHeight;

                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    reject(new Error('Failed to get canvas context'));
                    return;
                }

                // Calculate scaling to maintain aspect ratio
                const scale = Math.min(
                    targetWidth / img.width,
                    targetHeight / img.height
                );

                const scaledWidth = img.width * scale;
                const scaledHeight = img.height * scale;

                // Center image on canvas
                const offsetX = (targetWidth - scaledWidth) / 2;
                const offsetY = (targetHeight - scaledHeight) / 2;

                // Fill background (dark gray to match UI)
                ctx.fillStyle = '#171717';
                ctx.fillRect(0, 0, targetWidth, targetHeight);

                // Draw resized image
                ctx.drawImage(img, offsetX, offsetY, scaledWidth, scaledHeight);

                // Convert to data URL
                const resizedDataUrl = canvas.toDataURL('image/png', 0.8); // 0.8 quality for smaller file size

                resolve(resizedDataUrl);
            };

            img.onerror = () => {
                reject(new Error('Failed to load image for resizing'));
            };

            img.src = dataUrl;
        });
    }

    /**
     * Check if scene is idle (no active tool operations)
     * @returns {boolean} True if scene is idle
     */
    isSceneIdle() {
        const toolController = window.modlerComponents?.toolController;
        if (!toolController) {
            return true; // Assume idle if no tool controller
        }

        // Check if any tool is actively being used
        const activeTool = toolController.activeTool;
        if (!activeTool) {
            return true; // No active tool
        }

        // Check if tool has isActive flag
        if (activeTool.isActive !== undefined) {
            return !activeTool.isActive;
        }

        // Default to idle
        return true;
    }

    /**
     * Capture thumbnail only if scene is idle
     * @param {number} width - Thumbnail width
     * @param {number} height - Thumbnail height
     * @returns {Promise<string|null>} Thumbnail data URL or null if not idle
     */
    async captureIfIdle(width, height) {
        if (!this.isSceneIdle()) {
            return null;
        }

        try {
            return await this.captureSceneThumbnail(width, height);
        } catch (error) {
            return null;
        }
    }

    /**
     * Get statistics
     * @returns {Object} Statistics object
     */
    getStats() {
        return { ...this.stats };
    }

    /**
     * Reset statistics
     */
    resetStats() {
        this.stats = {
            captures: 0,
            throttled: 0,
            errors: 0
        };
    }
}

// Make globally available
if (typeof window !== 'undefined') {
    window.ThumbnailCapture = ThumbnailCapture;
}
