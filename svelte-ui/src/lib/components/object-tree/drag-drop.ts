/**
 * Drag-drop logic for ObjectTree — validation, drop resolution, and utilities.
 * Reactive state (draggedObject, activeDropZone) stays in ObjectTree.svelte.
 */

const MAX_NESTING_DEPTH = 2; // Matches ObjectDataFormat.MAX_NESTING_DEPTH

// --- Types ---

export interface TreeObject {
	id: number;
	name: string;
	isContainer: boolean;
	parentContainer: number | null;
	childrenOrder?: number[];
	children?: TreeObject[];
	autoLayout?: { tileMode?: { enabled: boolean; repeat: number } };
	[key: string]: unknown;
}

export interface DropZone {
	parentId: number | null;
	index: number;
}

export interface DropAction {
	type: 'reorder-children' | 'move-and-reorder';
	objectId: number;
	targetId: number;
	position: 'before' | 'after';
	parentId?: number | null;
	targetParentId?: number | null;
}

// --- Tree search ---

export function findObjectInTree(objectId: number, tree: TreeObject[]): TreeObject | null {
	for (const obj of tree) {
		if (obj.id === objectId) return obj;
		if (obj.children && obj.children.length > 0) {
			const found = findObjectInTree(objectId, obj.children);
			if (found) return found;
		}
	}
	return null;
}

// --- Nesting validation ---

export function isValidContainerNesting(
	childContainer: TreeObject,
	parentContainer: TreeObject,
	flatObjects: TreeObject[]
): boolean {
	if (childContainer.id === parentContainer.id) return false;
	if (isDescendantOf(parentContainer.id, childContainer.id, flatObjects)) return false;

	const currentDepth = getContainerNestingDepth(parentContainer.id, flatObjects);
	return currentDepth < MAX_NESTING_DEPTH;
}

export function isDescendantOf(
	potentialDescendantId: number,
	ancestorId: number,
	flatObjects: TreeObject[]
): boolean {
	let current = flatObjects.find(obj => obj.id === potentialDescendantId);
	const visited = new Set<number>();

	while (current && current.parentContainer) {
		if (visited.has(current.id)) return false;
		visited.add(current.id);

		if (current.parentContainer === ancestorId) return true;
		current = flatObjects.find(obj => obj.id === current!.parentContainer);
	}

	return false;
}

export function getContainerNestingDepth(containerId: number, flatObjects: TreeObject[]): number {
	let depth = 0;
	let current = flatObjects.find(obj => obj.id === containerId);
	const visited = new Set<number>();

	while (current && current.parentContainer) {
		if (visited.has(current.id)) break;
		visited.add(current.id);

		const parent = flatObjects.find(obj => obj.id === current!.parentContainer);
		if (parent && parent.isContainer) depth++;
		current = parent;
	}

	return depth;
}

// --- Drop resolution ---

/**
 * Resolves a drop event into a postMessage action, or null if invalid.
 */
export function resolveDrop(
	draggedObject: TreeObject,
	dropZoneIndex: number,
	parentId: number | null,
	treeStructure: TreeObject[],
	flatObjects: TreeObject[]
): DropAction | null {
	// Get the correct list based on parentId
	let objectList: TreeObject[];
	if (parentId === null) {
		objectList = treeStructure;
	} else {
		const container = findObjectInTree(parentId, treeStructure);
		if (!container || !container.children) return null;
		objectList = container.children;
	}

	let targetObject: TreeObject;
	let position: 'before' | 'after';

	if (dropZoneIndex === 0) {
		targetObject = objectList[0];
		position = 'before';
	} else {
		targetObject = objectList[dropZoneIndex - 1];
		position = 'after';
	}

	if (!targetObject) return null;

	// Cross-level move (different parents)
	if (draggedObject.parentContainer !== targetObject.parentContainer) {
		if (targetObject.parentContainer) {
			const targetContainer = findObjectInTree(targetObject.parentContainer, treeStructure);
			if (targetContainer && draggedObject.isContainer) {
				if (!isValidContainerNesting(draggedObject, targetContainer, flatObjects)) {
					return null;
				}
			}
		}

		return {
			type: 'move-and-reorder',
			objectId: draggedObject.id,
			targetParentId: targetObject.parentContainer || null,
			targetId: targetObject.id,
			position
		};
	}

	// Same parent — reorder
	return {
		type: 'reorder-children',
		objectId: draggedObject.id,
		targetId: targetObject.id,
		position,
		parentId
	};
}

// --- Drag image utility ---

export function createInvisibleDragImage(event: DragEvent): void {
	try {
		const div = document.createElement('div');
		div.style.width = '1px';
		div.style.height = '1px';
		div.style.background = 'transparent';
		div.style.opacity = '0';
		document.body.appendChild(div);
		event.dataTransfer!.setDragImage(div, 0, 0);
		setTimeout(() => document.body.contains(div) && document.body.removeChild(div), 100);
	} catch {
		const canvas = document.createElement('canvas');
		canvas.width = 1;
		canvas.height = 1;
		canvas.style.opacity = '0';
		event.dataTransfer!.setDragImage(canvas, 0, 0);
	}
}

/**
 * Calculate drop zone from drag-over Y position.
 * Top half → before this item, bottom half → after.
 */
export function calcDropZone(
	event: DragEvent,
	objectIndex: number,
	parentId: number | null
): DropZone {
	const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
	const y = event.clientY - rect.top;
	const height = rect.height;

	if (y < height * 0.5) {
		return { parentId, index: objectIndex };
	} else {
		return { parentId, index: objectIndex + 1 };
	}
}
