/**
 * Svelte Dev Server Port Detection Module
 * Handles automatic detection and caching of Svelte development server ports
 */

class SveltePortDetector {
    constructor() {
        this.COMMON_PORTS = [5173, 5174, 5175, 5176, 5177, 5178, 5179, 5180, 5181, 5182];
        this.CACHE_KEY = 'svelte-dev-port';
        this.baseUrl = null;
        this.urls = {
            propertyPanel: null,
            leftPanel: null,
            mainToolbar: null
            // systemToolbar removed - functionality integrated into leftPanel Settings tab
        };
    }

    /**
     * Detect Svelte dev server port with improved reliability and faster detection
     */
    async detectPort() {
        // Try cached port first for instant loading
        const cachedPort = localStorage.getItem(this.CACHE_KEY);
        console.log('🔍 Cached port check:', cachedPort);
        if (cachedPort && this.COMMON_PORTS.includes(parseInt(cachedPort))) {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 1000);

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
            console.log('🔍 Testing ports:', this.COMMON_PORTS);
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

            // Fallback: Try to detect any running server on wider port range
            console.log('🔍 Fallback: Scanning extended port range...');
            const extendedPorts = [5170, 5171, 5172, 5183, 5184, 5185, 5186, 5187, 5188, 5189, 5190];
            const extendedPromises = extendedPorts.map(port => this._testPort(port));
            const extendedResults = await Promise.allSettled(extendedPromises);

            for (let i = 0; i < extendedResults.length; i++) {
                if (extendedResults[i].status === 'fulfilled' && extendedResults[i].value) {
                    const port = extendedPorts[i];
                    this._setUrls(port);
                    localStorage.setItem(this.CACHE_KEY, port.toString());
                    console.log('🚀 Svelte server detected on extended range:', this.baseUrl);
                    return true;
                }
            }

            // No Svelte server found on any tested ports
            console.warn('⚠️ No Svelte dev server found on tested ports');
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
        this.detectedPort = port;
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