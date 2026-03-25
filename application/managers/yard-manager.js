/**
 * YardManager — Material Library CRUD + Persistence
 *
 * Manages the Yard library: builtin presets + user-created items.
 * Persists user items to localStorage. Builtins are always available.
 * All dimensions stored in meters (internal standard).
 */

class YardManager {
    constructor() {
        this.STORAGE_KEY = 'modler-yard-library';
        this.userItems = new Map();   // id → YardItem (user-created only)
        this.builtinItems = new Map(); // id → YardItem (from YARD_BUILTIN_ITEMS)

        this.loadBuiltins();
        this.loadFromStorage();
    }

    loadBuiltins() {
        const builtins = window.YARD_BUILTIN_ITEMS || [];
        for (const item of builtins) {
            this.builtinItems.set(item.id, { ...item, createdAt: 0, modifiedAt: 0 });
        }
    }

    // ═══════════════════════════════════════════════════
    // PERSISTENCE
    // ═══════════════════════════════════════════════════

    loadFromStorage() {
        try {
            const stored = localStorage.getItem(this.STORAGE_KEY);
            if (!stored) return;

            const items = JSON.parse(stored);
            if (!Array.isArray(items)) return;

            for (const item of items) {
                if (item.id && item.name) {
                    this.userItems.set(item.id, item);
                }
            }
        } catch (error) {
            console.warn('YardManager: Failed to load from storage:', error);
        }
    }

    saveToStorage() {
        try {
            const items = Array.from(this.userItems.values());
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(items));
        } catch (error) {
            console.warn('YardManager: Failed to save to storage:', error);
        }
    }

    // ═══════════════════════════════════════════════════
    // CRUD
    // ═══════════════════════════════════════════════════

    addItem(itemData) {
        const now = Date.now();
        const item = {
            id: `yard-${now}`,
            name: itemData.name || 'Custom Item',
            category: itemData.category || 'Custom',
            subcategory: itemData.subcategory || '',
            tags: Array.isArray(itemData.tags) ? itemData.tags : [],
            dimensions: itemData.dimensions || { x: 0.1, y: 0.1, z: 0.1 },
            fixedDimensions: itemData.fixedDimensions || { x: false, y: false, z: false },
            material: itemData.material || { color: '#888888', opacity: 1, transparent: false },
            source: 'user',
            createdAt: now,
            modifiedAt: now
        };

        this.userItems.set(item.id, item);
        this.saveToStorage();
        return item;
    }

    updateItem(id, updates) {
        const item = this.userItems.get(id);
        if (!item) {
            console.warn(`YardManager: Cannot update non-existent user item: ${id}`);
            return null;
        }

        const updated = {
            ...item,
            ...updates,
            id: item.id,           // Prevent ID change
            source: item.source,   // Prevent source change
            modifiedAt: Date.now()
        };

        this.userItems.set(id, updated);
        this.saveToStorage();
        return updated;
    }

    removeItem(id) {
        if (this.builtinItems.has(id)) {
            console.warn(`YardManager: Cannot delete builtin item: ${id}`);
            return false;
        }

        const removed = this.userItems.delete(id);
        if (removed) {
            this.saveToStorage();
        }
        return removed;
    }

    getItem(id) {
        return this.userItems.get(id) || this.builtinItems.get(id) || null;
    }

    getAllItems() {
        const all = [];
        for (const item of this.builtinItems.values()) {
            all.push(item);
        }
        for (const item of this.userItems.values()) {
            all.push(item);
        }
        return all;
    }

    getCategories() {
        const categories = new Map(); // category → Set of subcategories

        for (const item of this.getAllItems()) {
            if (!categories.has(item.category)) {
                categories.set(item.category, new Set());
            }
            if (item.subcategory) {
                categories.get(item.category).add(item.subcategory);
            }
        }

        // Convert to serializable format
        const result = [];
        for (const [name, subcats] of categories) {
            result.push({ name, subcategories: Array.from(subcats) });
        }
        return result;
    }

    getLibraryData() {
        return {
            items: this.getAllItems(),
            categories: this.getCategories()
        };
    }
}

window.YardManager = YardManager;
