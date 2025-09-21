/**
 * Modler V2 - Svelte UI Integration Script
 * Add this script to your main index.html to load the Svelte UI as an overlay
 */

(function() {
    'use strict';

    // Configuration
    const SVELTE_PROPERTY_PANEL_URL = 'http://localhost:5173/property-panel';
    const SVELTE_LEFT_PANEL_URL = 'http://localhost:5173/left-panel';
    const INTEGRATION_ENABLED = window.location.hostname === 'localhost' || window.location.protocol === 'file:';

    // Only activate on localhost for development
    if (!INTEGRATION_ENABLED) {
        console.log('Svelte UI integration only available on localhost');
        return;
    }

    let svelteRightOverlay = null;
    let svelteLeftOverlay = null;
    let isOverlayVisible = false;

    /**
     * Create the Svelte UI overlays
     */
    function createSvelteOverlays() {
        // Create RIGHT overlay container (Property Panel)
        svelteRightOverlay = document.createElement('div');
        svelteRightOverlay.id = 'svelte-right-overlay';
        svelteOverlay.style.cssText = `
            position: fixed;
            top: 0;
            right: 0;
            width: 320px;
            height: 100vh;
            background: #1a1a1a;
            border-left: 2px solid #404040;
            z-index: 10000;
            transform: translateX(100%);
            transition: transform 0.3s ease;
            overflow: hidden;
            font-family: Arial, sans-serif;
        `;

        // Force positioning to right side
        svelteOverlay.style.left = 'auto';
        svelteOverlay.style.right = '0px';

        // Create header
        const header = document.createElement('div');
        header.style.cssText = `
            padding: 16px;
            background: #252525;
            border-bottom: 1px solid #404040;
            color: #e0e0e0;
            font-weight: 600;
            display: flex;
            justify-content: space-between;
            align-items: center;
        `;
        header.innerHTML = `
            <span>Properties</span>
            <button id="svelte-close-btn" style="
                background: #333;
                color: #e0e0e0;
                border: none;
                width: 24px;
                height: 24px;
                border-radius: 4px;
                cursor: pointer;
                font-size: 16px;
            ">✕</button>
        `;

        // Create iframe for Svelte app
        const iframe = document.createElement('iframe');
        iframe.src = SVELTE_SERVER_URL;
        iframe.style.cssText = `
            width: 100%;
            height: calc(100vh - 60px);
            border: none;
            background: #1a1a1a;
        `;

        // Add error handling for iframe
        iframe.onerror = () => {
            console.error('Failed to load Svelte UI from:', SVELTE_SERVER_URL);
            showError();
        };

        svelteOverlay.appendChild(header);
        svelteOverlay.appendChild(iframe);
        document.body.appendChild(svelteOverlay);

        // Add event listeners
        document.getElementById('svelte-close-btn').onclick = hideSvelteOverlay;
    }

    /**
     * Show error message if Svelte server is not running
     */
    function showError() {
        if (!svelteOverlay) return;

        const errorDiv = document.createElement('div');
        errorDiv.style.cssText = `
            padding: 20px;
            color: #e0e0e0;
            text-align: center;
            background: #1a1a1a;
        `;
        errorDiv.innerHTML = `
            <h3 style="color: #ff6b6b; margin-bottom: 16px;">Svelte UI Server Not Running</h3>
            <p style="margin-bottom: 12px; line-height: 1.4;">To use the Svelte UI demo:</p>
            <ol style="text-align: left; color: #999; line-height: 1.6;">
                <li>Open terminal in the project directory</li>
                <li>Navigate to svelte-ui: <code>cd svelte-ui</code></li>
                <li>Start dev server: <code>npm run dev</code></li>
                <li>Refresh this page</li>
            </ol>
            <p style="margin-top: 16px; color: #999; font-size: 12px;">
                Expected server: ${SVELTE_SERVER_URL}
            </p>
        `;

        // Replace iframe with error message
        const iframe = svelteOverlay.querySelector('iframe');
        if (iframe) {
            iframe.replaceWith(errorDiv);
        }
    }

    /**
     * Show the Svelte UI overlay
     */
    function showSvelteOverlay() {
        if (!svelteOverlay) {
            createSvelteOverlay();
        }

        svelteOverlay.style.transform = 'translateX(0)';
        isOverlayVisible = true;

        // Hide the vanilla JS property panel and show Svelte UI
        const rightPanel = document.querySelector('.right-panel');
        if (rightPanel) {
            rightPanel.style.display = 'none';
        }

        // Ensure left panel stays visible and positioned correctly on the LEFT
        const leftPanel = document.querySelector('.left-panel');
        if (leftPanel) {
            leftPanel.style.display = 'block';
            leftPanel.style.position = 'relative';
            leftPanel.style.order = '1'; // First in flex order
        }

        // Ensure viewport is in the middle
        const viewport = document.querySelector('.viewport-area');
        if (viewport) {
            viewport.style.order = '2'; // Second in flex order
        }
    }

    /**
     * Hide the Svelte UI overlay
     */
    function hideSvelteOverlay() {
        if (!svelteOverlay) return;

        svelteOverlay.style.transform = 'translateX(100%)';
        isOverlayVisible = false;

        // Show the vanilla JS property panel again
        const rightPanel = document.querySelector('.right-panel');
        if (rightPanel) {
            rightPanel.style.display = 'block';
        }

        // Ensure left panel stays visible and positioned correctly on the LEFT
        const leftPanel = document.querySelector('.left-panel');
        if (leftPanel) {
            leftPanel.style.display = 'block';
            leftPanel.style.position = 'relative';
            leftPanel.style.order = '1'; // First in flex order
        }

        // Ensure viewport is in the middle
        const viewport = document.querySelector('.viewport-area');
        if (viewport) {
            viewport.style.order = '2'; // Second in flex order
        }
    }

    /**
     * Toggle the Svelte UI overlay
     */
    function toggleSvelteOverlay() {
        if (isOverlayVisible) {
            hideSvelteOverlay();
        } else {
            showSvelteOverlay();
        }
    }

    /**
     * Create the toggle button
     */
    function createToggleButton() {
        const button = document.createElement('button');
        button.id = 'svelte-ui-toggle';
        button.innerHTML = 'S';
        button.title = 'Toggle Svelte Property Panel';
        button.style.cssText = `
            position: fixed;
            top: 16px;
            right: 16px;
            width: 48px;
            height: 48px;
            background: #4a9eff;
            color: white;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            font-size: 20px;
            box-shadow: 0 4px 12px rgba(74, 158, 255, 0.3);
            z-index: 9999;
            transition: all 0.2s ease;
        `;

        button.onmouseover = () => {
            button.style.transform = 'scale(1.1)';
            button.style.boxShadow = '0 6px 16px rgba(74, 158, 255, 0.4)';
        };

        button.onmouseout = () => {
            button.style.transform = 'scale(1)';
            button.style.boxShadow = '0 4px 12px rgba(74, 158, 255, 0.3)';
        };

        button.onclick = toggleSvelteOverlay;
        document.body.appendChild(button);
    }

    /**
     * Initialize the integration
     */
    function initialize() {
        // Wait for DOM to be ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initialize);
            return;
        }

        // Create toggle button
        createToggleButton();

        console.log('🎨 Svelte Property Panel integration ready! Click the "S" button in top-right corner.');

        // Auto-show Svelte panel to replace vanilla JS panel
        setTimeout(() => {
            if (!isOverlayVisible) {
                showSvelteOverlay();
            }
        }, 500);
    }

    // Start initialization
    initialize();

})();