/**
 * Direct Store Bridge - Phase 3 Direct Mounting Support
 * 
 * Bridges MainAdapter → Svelte stores for directly mounted components
 * (Bypasses postMessage which only works for iframes)
 * 
 * Version: 1.0.0
 */

class DirectStoreBridge {
    constructor() {
        this.stores = null;
    }

    /**
     * Initialize with Svelte stores
     * Called after Svelte components are mounted
     */
    initialize(stores) {
        this.stores = stores;
        console.log('✅ DirectStoreBridge initialized with stores');
    }

    /**
     * Update selection in Svelte stores
     */
    updateSelection(selectedObjectIds, objectData) {
        if (!this.stores?.selectedObjects) {
            console.warn('⚠️ DirectStoreBridge: selectedObjects store not available');
            return false;
        }

        console.log('🔵 DirectStoreBridge: Updating selectedObjects store', selectedObjectIds, objectData);

        if (selectedObjectIds.length === 0) {
            // Clear selection
            this.stores.selectedObjects.set([]);
        } else if (selectedObjectIds.length === 1 && objectData) {
            // Single selection
            this.stores.selectedObjects.set([objectData]);
        } else {
            // Multi-selection - would need to fetch all object data
            // For now, just set the first one
            this.stores.selectedObjects.set(objectData ? [objectData] : []);
        }

        return true;
    }

    /**
     * Update hierarchy in Svelte stores
     */
    updateHierarchy(objects, rootObjects) {
        if (!this.stores?.objectHierarchy) {
            console.warn('⚠️ DirectStoreBridge: objectHierarchy store not available');
            return false;
        }

        this.stores.objectHierarchy.set(objects || []);
        return true;
    }

    /**
     * Update tool state in Svelte stores
     */
    updateToolState(toolData) {
        if (!this.stores?.toolState) {
            console.warn('⚠️ DirectStoreBridge: toolState store not available');
            return false;
        }

        this.stores.toolState.set(toolData);
        return true;
    }
}

// Export singleton instance
window.DirectStoreBridge = window.DirectStoreBridge || new DirectStoreBridge();
