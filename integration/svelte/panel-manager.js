/**
 * Svelte Panel Management Module
 * Handles creation, styling, and management of Svelte UI overlays
 */

class SveltePanelManager {
    constructor(portDetector) {
        this.portDetector = portDetector;
        this.panels = {
            leftOverlay: null,
            rightOverlay: null,
            mainToolbar: null,
            systemToolbar: null
        };
        this.iframes = {
            left: null,
            right: null,
            mainToolbar: null,
            systemToolbar: null
        };
        this.isVisible = false;
    }

    /**
     * Update the viewport area based on panel sizes (only for side panels, not floating toolbars)
     */
    updateViewportArea() {
        const viewportArea = document.querySelector('.viewport-area');
        if (!viewportArea) return;

        const leftWidth = this.panels.leftOverlay ?
            parseInt(window.getComputedStyle(this.panels.leftOverlay).width, 10) : 0;
        const rightWidth = this.panels.rightOverlay ?
            parseInt(window.getComputedStyle(this.panels.rightOverlay).width, 10) : 0;

        // Only adjust for side panels, floating toolbars don't affect viewport
        viewportArea.style.left = leftWidth + 'px';
        viewportArea.style.right = rightWidth + 'px';
        viewportArea.style.top = '0px'; // Floating toolbars don't need top offset
    }

    /**
     * Create the Svelte left panel overlay
     */
    createLeftOverlay() {
        if (!this.panels.leftOverlay) {
            this.panels.leftOverlay = document.createElement('div');
            this.panels.leftOverlay.id = 'svelte-left-overlay';
            document.body.appendChild(this.panels.leftOverlay);
        }

        // Update container styling for iframe content
        this.panels.leftOverlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 280px;
            height: 100vh;
            background: #171717;
            border-right: 1px solid #2E2E2E;
            z-index: 99999;
            transform: translateX(0);
            overflow: hidden;
            font-family: Arial, sans-serif;
            pointer-events: auto;
            min-width: 200px;
            max-width: 50vw;
        `;

        // Create resize handle for left panel
        this._createLeftResizeHandle();
        this._loadPanelContent('left');
        this.updateViewportArea();
    }

    /**
     * Create resize handle for left panel
     */
    _createLeftResizeHandle() {
        const resizeHandle = document.createElement('div');
        resizeHandle.style.cssText = `
            position: absolute;
            top: 0;
            right: -15px;
            width: 30px;
            height: 100%;
            cursor: ew-resize;
            z-index: 100000;
            background: transparent;
        `;

        // Add visual indicator
        const indicator = document.createElement('div');
        indicator.style.cssText = `
            position: absolute;
            top: 0;
            right: 13px;
            width: 4px;
            height: 100%;
            background: rgba(255, 255, 255, 0.1);
            border-radius: 2px;
            pointer-events: none;
        `;
        resizeHandle.appendChild(indicator);

        resizeHandle.addEventListener('mousedown', (e) => {
            this._initLeftResize(e);
        });

        this.panels.leftOverlay.appendChild(resizeHandle);
    }

    /**
     * Initialize left panel resize
     */
    _initLeftResize(e) {
        e.preventDefault();
        e.stopPropagation();

        const startX = e.clientX;
        const startWidth = parseInt(window.getComputedStyle(this.panels.leftOverlay).width, 10);

        document.documentElement.style.cursor = 'ew-resize';
        document.documentElement.style.userSelect = 'none';

        const doResize = (e) => {
            const currentX = e.clientX;
            const deltaX = currentX - startX;
            const newWidth = Math.max(200, Math.min(window.innerWidth * 0.5, startWidth + deltaX));

            this.panels.leftOverlay.style.width = newWidth + 'px';
            this.updateViewportArea();
        };

        const stopResize = () => {
            document.documentElement.style.cursor = '';
            document.documentElement.style.userSelect = '';
            document.removeEventListener('mousemove', doResize);
            document.removeEventListener('mouseup', stopResize);
        };

        document.addEventListener('mousemove', doResize);
        document.addEventListener('mouseup', stopResize);
    }

    /**
     * Create the Svelte right panel overlay
     */
    createRightOverlay() {
        if (!this.panels.rightOverlay) {
            this.panels.rightOverlay = document.createElement('div');
            this.panels.rightOverlay.id = 'svelte-right-overlay';
            document.body.appendChild(this.panels.rightOverlay);
        }

        this.panels.rightOverlay.style.cssText = `
            position: fixed;
            top: 0;
            right: 0;
            width: 350px;
            height: 100vh;
            background: #171717;
            border-left: 1px solid #2E2E2E;
            z-index: 99999;
            transform: translateX(0);
            overflow: hidden;
            font-family: Arial, sans-serif;
            pointer-events: auto;
            min-width: 250px;
            max-width: 60vw;
        `;

        this._createRightResizeHandle();
        this._loadPanelContent('right');
        this.updateViewportArea();
    }

    /**
     * Create resize handle for right panel
     */
    _createRightResizeHandle() {
        const resizeHandle = document.createElement('div');
        resizeHandle.style.cssText = `
            position: absolute;
            top: 0;
            left: -15px;
            width: 30px;
            height: 100%;
            cursor: ew-resize;
            z-index: 100000;
            background: transparent;
        `;

        const indicator = document.createElement('div');
        indicator.style.cssText = `
            position: absolute;
            top: 0;
            left: 13px;
            width: 4px;
            height: 100%;
            background: rgba(255, 255, 255, 0.1);
            border-radius: 2px;
            pointer-events: none;
        `;
        resizeHandle.appendChild(indicator);

        resizeHandle.addEventListener('mousedown', (e) => {
            this._initRightResize(e);
        });

        this.panels.rightOverlay.appendChild(resizeHandle);
    }

    /**
     * Initialize right panel resize
     */
    _initRightResize(e) {
        e.preventDefault();
        e.stopPropagation();

        const startX = e.clientX;
        const startWidth = parseInt(window.getComputedStyle(this.panels.rightOverlay).width, 10);

        document.documentElement.style.cursor = 'ew-resize';
        document.documentElement.style.userSelect = 'none';

        const doResize = (e) => {
            const currentX = e.clientX;
            const deltaX = startX - currentX;
            const newWidth = Math.max(250, Math.min(window.innerWidth * 0.6, startWidth + deltaX));

            this.panels.rightOverlay.style.width = newWidth + 'px';
            this.updateViewportArea();
        };

        const stopResize = () => {
            document.documentElement.style.cursor = '';
            document.documentElement.style.userSelect = '';
            document.removeEventListener('mousemove', doResize);
            document.removeEventListener('mouseup', stopResize);
        };

        document.addEventListener('mousemove', doResize);
        document.addEventListener('mouseup', stopResize);
    }

    /**
     * Create main toolbar
     */
    createMainToolbar() {
        if (!this.panels.mainToolbar) {
            this.panels.mainToolbar = document.createElement('div');
            this.panels.mainToolbar.id = 'svelte-main-toolbar';
            document.body.appendChild(this.panels.mainToolbar);
        }

        this.panels.mainToolbar.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            width: 400px;
            height: 120px;
            z-index: 100000;
            background: transparent;
            pointer-events: auto;
        `;

        this._loadPanelContent('mainToolbar');
    }

    /**
     * Create system toolbar
     */
    createSystemToolbar() {
        if (!this.panels.systemToolbar) {
            this.panels.systemToolbar = document.createElement('div');
            this.panels.systemToolbar.id = 'svelte-system-toolbar';
            document.body.appendChild(this.panels.systemToolbar);
        }

        this.panels.systemToolbar.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 100000;
            background: transparent;
            pointer-events: auto;
        `;

        this._loadPanelContent('systemToolbar');
    }

    /**
     * Load content into panel via iframe
     */
    _loadPanelContent(panelType) {
        const urls = this.portDetector.getUrls();
        let url, containerId, iframeKey;

        switch (panelType) {
            case 'left':
                url = urls.leftPanel;
                containerId = 'svelte-left-overlay';
                iframeKey = 'left';
                break;
            case 'right':
                url = urls.propertyPanel;
                containerId = 'svelte-right-overlay';
                iframeKey = 'right';
                break;
            case 'mainToolbar':
                url = urls.mainToolbar;
                containerId = 'svelte-main-toolbar';
                iframeKey = 'mainToolbar';
                break;
            case 'systemToolbar':
                url = urls.systemToolbar;
                containerId = 'svelte-system-toolbar';
                iframeKey = 'systemToolbar';
                break;
            default:
                return;
        }

        if (!url) return;

        const iframe = document.createElement('iframe');
        iframe.src = url;
        iframe.style.cssText = `
            width: 100%;
            height: 100%;
            border: none;
            background: transparent;
        `;
        // Enable cross-origin requests for iframe content

        const container = document.getElementById(containerId);
        if (container) {
            container.innerHTML = '';
            container.appendChild(iframe);
            this.iframes[iframeKey] = iframe;
        }
    }

    /**
     * Show all panels
     */
    showPanels() {
        if (this.panels.leftOverlay) this.panels.leftOverlay.style.display = 'block';
        if (this.panels.rightOverlay) this.panels.rightOverlay.style.display = 'block';
        if (this.panels.mainToolbar) this.panels.mainToolbar.style.display = 'block';
        if (this.panels.systemToolbar) this.panels.systemToolbar.style.display = 'block';

        this.isVisible = true;
        this.updateViewportArea();
    }

    /**
     * Hide all panels
     */
    hidePanels() {
        if (this.panels.leftOverlay) this.panels.leftOverlay.style.display = 'none';
        if (this.panels.rightOverlay) this.panels.rightOverlay.style.display = 'none';
        if (this.panels.mainToolbar) this.panels.mainToolbar.style.display = 'none';
        if (this.panels.systemToolbar) this.panels.systemToolbar.style.display = 'none';

        this.isVisible = false;
        this.updateViewportArea();
    }

    /**
     * Get iframe references for communication
     */
    getIframes() {
        return { ...this.iframes };
    }

    /**
     * Get panel visibility state
     */
    isVisible() {
        return this.isVisible;
    }
}

// Export for use in main integration file
window.SveltePanelManager = SveltePanelManager;