import { writable, derived, get } from 'svelte/store';

// Types
export interface YardItem {
	id: string;
	name: string;
	category: string;
	subcategory: string;
	tags: string[];
	dimensions: { x: number; y: number; z: number };
	fixedDimensions: { x: boolean; y: boolean; z: boolean };
	material: { color: string; opacity: number; transparent: boolean };
	source: 'builtin' | 'user';
	createdAt?: number;
	modifiedAt?: number;
}

export interface YardCategory {
	name: string;
	subcategories: string[];
}

// Stores
export const yardItems = writable<YardItem[]>([]);
export const yardCategories = writable<YardCategory[]>([]);
export const yardSearchQuery = writable('');
export const showAddToYardDialog = writable(false);
export const addToYardObjectData = writable<any>(null);

// Derived: filtered items based on search
export const filteredYardItems = derived(
	[yardItems, yardSearchQuery],
	([$items, $query]) => {
		if (!$query.trim()) return $items;

		const q = $query.toLowerCase();
		return $items.filter(
			(item) =>
				item.name.toLowerCase().includes(q) ||
				item.category.toLowerCase().includes(q) ||
				item.subcategory.toLowerCase().includes(q) ||
				item.tags.some((tag) => tag.toLowerCase().includes(q))
		);
	}
);

// Derived: items grouped by category/subcategory
export const groupedYardItems = derived(filteredYardItems, ($items) => {
	const groups: Record<string, Record<string, YardItem[]>> = {};

	for (const item of $items) {
		const cat = item.category || 'Uncategorized';
		const sub = item.subcategory || 'General';

		if (!groups[cat]) groups[cat] = {};
		if (!groups[cat][sub]) groups[cat][sub] = [];
		groups[cat][sub].push(item);
	}

	return groups;
});

// Sync from main thread
export function syncYardLibrary(data: { items: YardItem[]; categories: YardCategory[] }) {
	if (data.items) yardItems.set(data.items);
	if (data.categories) yardCategories.set(data.categories);
}

// Request library data from main
export function requestYardLibrary() {
	if (window.parent && window.parent !== window) {
		window.parent.postMessage({ type: 'yard-get-library' }, '*');
	}
}

// Place item from yard
export function placeYardItem(itemId: string) {
	if (window.parent && window.parent !== window) {
		window.parent.postMessage({ type: 'yard-place-item', itemId }, '*');
	}
}

// Add item to yard
export function addItemToYard(item: Partial<YardItem>) {
	if (window.parent && window.parent !== window) {
		window.parent.postMessage({ type: 'yard-add-item', item }, '*');
	}
}

// Remove item from yard
export function removeItemFromYard(itemId: string) {
	if (window.parent && window.parent !== window) {
		window.parent.postMessage({ type: 'yard-remove-item', itemId }, '*');
	}
}

// Materials list (yard items in use in the scene)
export interface MaterialsListItem {
	yardItemId: string;
	name: string;
	category: string;
	subcategory: string;
	count: number;
	dimensions: { x: number; y: number; z: number };
}

export const yardMaterialsList = writable<MaterialsListItem[]>([]);

export function syncMaterialsList(data: MaterialsListItem[]) {
	yardMaterialsList.set(data || []);
}

export function requestMaterialsList() {
	if (window.parent && window.parent !== window) {
		window.parent.postMessage({ type: 'yard-get-materials-list' }, '*');
	}
}
