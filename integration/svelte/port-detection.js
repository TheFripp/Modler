/**
 * Svelte Dev Server Port Detection Module
 * Handles automatic detection and caching of Svelte development server ports
 */

class SveltePortDetector {
    constructor() {
        this.COMMON_PORTS = [5173, 5174, 5175, 5176, 5177];
        this.CACHE_KEY = 'svelte-dev-port';
        this.baseUrl = null;
        this.urls = {
            propertyPanel: null,
            leftPanel: null,
            mainToolbar: null,
            systemToolbar: null
        };
    }

    /**
     * Detect Svelte dev server port with improved reliability and faster detection
     */
    async detectPort() {
        // Try cached port first for instant loading
        const cachedPort = localStorage.getItem(this.CACHE_KEY);
        if (cachedPort && this.COMMON_PORTS.includes(parseInt(cachedPort))) {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 100);

                const response = await fetch(`http://localhost:${cachedPort}/`, {
                    method: 'GET',
                    signal: controller.signal
                });

                clearTimeout(timeoutId);

                if (response.ok) {
                    this._setUrls(cachedPort);
                    console.log('🚀 Svelte server found (cached):', this.baseUrl);
                    return true;
                }
            } catch (error) {
                console.log('⚠️ Cached port failed, detecting...', error.message);
                localStorage.removeItem(this.CACHE_KEY);
            }
        }

        // Parallel port detection for fastest discovery
        try {
            const portPromises = this.COMMON_PORTS.map(port => this._testPort(port));
            const results = await Promise.allSettled(portPromises);

            for (let i = 0; i < results.length; i++) {
                if (results[i].status === 'fulfilled' && results[i].value) {
                    const port = this.COMMON_PORTS[i];
                    this._setUrls(port);
                    localStorage.setItem(this.CACHE_KEY, port.toString());
                    console.log('🚀 Svelte server detected:', this.baseUrl);
                    return true;
                }
            }

            console.log('❌ No Svelte server found on common ports');
            return false;
        } catch (error) {
            console.error('❌ Port detection failed:', error);
            return false;
        }
    }

    /**
     * Test a specific port for Svelte server availability
     */
    async _testPort(port) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 500);

            // Test the root path instead of specific route
            const response = await fetch(`http://localhost:${port}/`, {
                method: 'GET',
                signal: controller.signal
            });

            clearTimeout(timeoutId);
            return response.ok;
        } catch (error) {
            return false;
        }
    }

    /**
     * Set URLs for all Svelte components based on detected port
     */
    _setUrls(port) {
        this.baseUrl = `http://localhost:${port}`;
        this.urls = {
            propertyPanel: `${this.baseUrl}/property-panel`,
            leftPanel: `${this.baseUrl}/left-panel`,
            mainToolbar: `${this.baseUrl}/main-toolbar`,
            systemToolbar: `${this.baseUrl}/system-toolbar`
        };
    }

    /**
     * Get the base URL of the detected Svelte server
     */
    getBaseUrl() {
        return this.baseUrl;
    }

    /**
     * Get all component URLs
     */
    getUrls() {
        return { ...this.urls };
    }

    /**
     * Check if Svelte server has been detected
     */
    isDetected() {
        return this.baseUrl !== null;
    }
}

// Export for use in main integration file
window.SveltePortDetector = SveltePortDetector;