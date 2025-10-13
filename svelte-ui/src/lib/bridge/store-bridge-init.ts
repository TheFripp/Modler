/**
 * Store Bridge Initialization
 * Exposes Svelte stores to Main window for DirectStoreBridge
 */

import { selectedObjects, objectHierarchy, toolState } from '$lib/stores/modler';

// Export stores to global window for DirectStoreBridge
if (typeof window !== 'undefined') {
    (window as any).modlerStores = {
        selectedObjects,
        objectHierarchy,
        toolState
    };
    
    // Initialize DirectStoreBridge if available
    if ((window as any).DirectStoreBridge) {
        (window as any).DirectStoreBridge.initialize({
            selectedObjects,
            objectHierarchy,
            toolState
        });
    }
}

export { selectedObjects, objectHierarchy, toolState };
