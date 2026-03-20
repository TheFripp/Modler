/**
 * Message Type Definitions
 *
 * TypeScript interfaces for all UI ↔ Main postMessage communication.
 * See `/integration/communication/MESSAGE-PROTOCOL.md` for complete documentation.
 *
 * Version: 1.0.0
 * Date: 2025-10-22
 */

// ═══════════════════════════════════════════════════════════════
// BASE TYPES
// ═══════════════════════════════════════════════════════════════

export type Axis = 'x' | 'y' | 'z';
export type DropPosition = 'before' | 'after';

// ═══════════════════════════════════════════════════════════════
// PROPERTY UPDATE MESSAGES
// ═══════════════════════════════════════════════════════════════

export interface UpdatePropertyMessage {
	type: 'update-property' | 'property-update';
	objectId: number;
	property: string;
	value: any;
	source?: string;
}

export interface UpdateDimensionMessage {
	type: 'update-dimension';
	objectId: number;
	axis: Axis;
	value: number;
	source?: string;
}

export interface UpdatePositionMessage {
	type: 'update-position';
	objectId: number;
	axis: Axis;
	value: number;
	source?: string;
}

export interface UpdateRotationMessage {
	type: 'update-rotation';
	objectId: number;
	axis: Axis;
	value: number; // degrees
	source?: string;
}

export interface UpdateColorMessage {
	type: 'update-color';
	objectId: number;
	value: string; // hex color
	source?: string;
}

export interface UpdateOpacityMessage {
	type: 'update-opacity';
	objectId: number;
	value: number; // 0-1
	source?: string;
}

// ═══════════════════════════════════════════════════════════════
// LAYOUT OPERATION MESSAGES
// ═══════════════════════════════════════════════════════════════

export interface ToggleFillModeMessage {
	type: 'toggle-fill-mode' | 'fill-button-toggle';
	objectId: number;
	axis: Axis;
}

/**
 * Consolidated button hover message (v1.1.0)
 * Replaces fill-button-hover and layout-button-hover
 */
export interface ButtonHoverMessage {
	type: 'button-hover';
	buttonType?: 'fill' | 'layout'; // Optional for backward compatibility
	objectId: number;
	axis: Axis;
	isHovering: boolean;
}

/**
 * @deprecated Use ButtonHoverMessage with buttonType: 'fill' instead
 * Maintained for backward compatibility
 */
export interface FillButtonHoverMessage {
	type: 'fill-button-hover';
	objectId: number;
	axis: Axis;
	isHovering: boolean;
}

/**
 * @deprecated Use ButtonHoverMessage with buttonType: 'layout' instead
 * Maintained for backward compatibility
 */
export interface LayoutButtonHoverMessage {
	type: 'layout-button-hover';
	objectId: number;
	axis: Axis;
	isHovering: boolean;
}

export interface UpdateLayoutPropertyMessage {
	type: 'update-layout-property';
	objectId: number;
	property: string;
	value: any;
}

export interface ToggleHugModeMessage {
	type: 'toggle-hug-mode';
	objectId: number;
}

export interface UpdateLayoutDirectionMessage {
	type: 'update-layout-direction';
	objectId: number;
	direction: Axis;
}

export interface UpdateLayoutGapMessage {
	type: 'update-layout-gap';
	objectId: number;
	gap: number;
}

// ═══════════════════════════════════════════════════════════════
// SELECTION OPERATION MESSAGES
// ═══════════════════════════════════════════════════════════════

export interface SelectObjectMessage {
	type: 'select-object' | 'object-select';
	objectId: number;
	addToSelection?: boolean;
	isShiftClick?: boolean;
	directSelection?: boolean;
}

export interface DeselectAllMessage {
	type: 'deselect-all';
}

export interface MultiSelectMessage {
	type: 'multi-select';
	objectIds: number[];
}

// ═══════════════════════════════════════════════════════════════
// HIERARCHY OPERATION MESSAGES
// ═══════════════════════════════════════════════════════════════

export interface MoveToContainerMessage {
	type: 'move-to-container' | 'object-move-to-container';
	objectId: number;
	targetContainerId: number;
}

export interface MoveToRootMessage {
	type: 'move-to-root' | 'object-move-to-root';
	objectId: number;
}

export interface ReorderChildrenMessage {
	type: 'reorder-children' | 'object-reorder';
	objectId: number;
	targetId: number;
	position: DropPosition;
	parentId: number | null;
}

export interface ReverseChildOrderMessage {
	type: 'reverse-child-order';
	parentId: number | null;
}

// ═══════════════════════════════════════════════════════════════
// OBJECT LIFECYCLE MESSAGES
// ═══════════════════════════════════════════════════════════════

export interface DeleteObjectMessage {
	type: 'delete-object' | 'object-delete';
	objectId?: number;
	objectIds?: number[];
}

export interface DuplicateObjectMessage {
	type: 'duplicate-object';
	objectId: number;
}

export interface RenameObjectMessage {
	type: 'rename-object';
	objectId: number;
	name: string;
}

// ═══════════════════════════════════════════════════════════════
// CONTAINER OPERATION MESSAGES
// ═══════════════════════════════════════════════════════════════

export interface CreateContainerMessage {
	type: 'create-container' | 'create-layout-container';
	objectId: number;
	direction?: Axis;
	gap?: number;
}

export interface CreateTiledContainerMessage {
	type: 'create-tiled-container';
	objectId: number;
	axis?: Axis;
	repeat?: number;
	gap?: number;
}

// ═══════════════════════════════════════════════════════════════
// TOOL OPERATION MESSAGES
// ═══════════════════════════════════════════════════════════════

export interface ActivateToolMessage {
	type: 'activate-tool' | 'tool-activate';
	toolId: string;
}

// ═══════════════════════════════════════════════════════════════
// HISTORY OPERATION MESSAGES
// ═══════════════════════════════════════════════════════════════

export interface UndoMessage {
	type: 'undo';
}

export interface RedoMessage {
	type: 'redo';
}

// ═══════════════════════════════════════════════════════════════
// SYSTEM OPERATION MESSAGES
// ═══════════════════════════════════════════════════════════════

export interface UIPanelReadyMessage {
	type: 'ui-panel-ready' | 'left-panel-ready';
}

export interface KeyboardEventMessage {
	type: 'keyboard-event';
	key: string;
	code: string;
}

export interface RequestFileManagerReadyMessage {
	type: 'request-file-manager-ready';
}

export interface FileManagerRequestMessage {
	type: 'file-manager-request';
	data: any;
}

// ═══════════════════════════════════════════════════════════════
// SETTINGS OPERATION MESSAGES
// ═══════════════════════════════════════════════════════════════

export interface GetSettingsMessage {
	type: 'get-cad-wireframe-settings' | 'get-visual-settings' | 'get-scene-settings' | 'get-interface-settings';
}

export interface SettingsChangedMessage {
	type: 'cad-wireframe-settings-changed' | 'visual-settings-changed' | 'scene-settings-changed' | 'interface-settings-changed';
	settings?: any;
	data?: {
		settings: any;
	};
}

// ═══════════════════════════════════════════════════════════════
// UNION TYPE - ALL UI → MAIN MESSAGES
// ═══════════════════════════════════════════════════════════════

export type UIToMainMessage =
	// Property updates
	| UpdatePropertyMessage
	| UpdateDimensionMessage
	| UpdatePositionMessage
	| UpdateRotationMessage
	| UpdateColorMessage
	| UpdateOpacityMessage
	// Layout operations
	| ToggleFillModeMessage
	| ButtonHoverMessage
	| FillButtonHoverMessage // Legacy - deprecated
	| LayoutButtonHoverMessage // Legacy - deprecated
	| UpdateLayoutPropertyMessage
	| ToggleHugModeMessage
	| UpdateLayoutDirectionMessage
	| UpdateLayoutGapMessage
	// Selection operations
	| SelectObjectMessage
	| DeselectAllMessage
	| MultiSelectMessage
	// Hierarchy operations
	| MoveToContainerMessage
	| MoveToRootMessage
	| ReorderChildrenMessage
	| ReverseChildOrderMessage
	// Object lifecycle
	| DeleteObjectMessage
	| DuplicateObjectMessage
	| RenameObjectMessage
	// Container operations
	| CreateContainerMessage
	| CreateTiledContainerMessage
	// Tool operations
	| ActivateToolMessage
	// History operations
	| UndoMessage
	| RedoMessage
	// System operations
	| UIPanelReadyMessage
	| KeyboardEventMessage
	| RequestFileManagerReadyMessage
	| FileManagerRequestMessage
	// Settings operations
	| GetSettingsMessage
	| SettingsChangedMessage;

// ═══════════════════════════════════════════════════════════════
// MAIN → UI MESSAGES (For completeness)
// ═══════════════════════════════════════════════════════════════

import type { ObjectData } from './object-data';

export interface ObjectChangedMessage {
	type: 'object-changed';
	data: {
		objectId: number;
		eventType: string;
		object: ObjectData;
	};
}

export interface SelectionChangedMessage {
	type: 'selection-changed';
	data: {
		selectedObjectIds: number[];
		selectedObjects: ObjectData[];
	};
}

export interface HierarchyChangedMessage {
	type: 'hierarchy-changed';
	data: {
		hierarchy: {
			objects: ObjectData[];
			rootChildrenOrder: number[];
		} | ObjectData[]; // Support both formats
	};
}

export interface ObjectsBatchChangedMessage {
	type: 'objects-batch-changed';
	data: {
		changes: Array<{
			objectId: number;
			eventType: string;
			object: ObjectData;
		}>;
	};
}

export interface ToolChangedMessage {
	type: 'tool-changed';
	data: {
		toolName: string;
		active: boolean;
		toolState: any;
	};
}

export type MainToUIMessage =
	| ObjectChangedMessage
	| ObjectsBatchChangedMessage
	| SelectionChangedMessage
	| HierarchyChangedMessage
	| ToolChangedMessage;

// ═══════════════════════════════════════════════════════════════
// HELPER TYPE GUARDS
// ═══════════════════════════════════════════════════════════════

export function isUIToMainMessage(message: any): message is UIToMainMessage {
	return message && typeof message === 'object' && typeof message.type === 'string';
}

export function isMainToUIMessage(message: any): message is MainToUIMessage {
	return (
		message &&
		typeof message === 'object' &&
		typeof message.type === 'string' &&
		(message.type === 'object-changed' ||
			message.type === 'objects-batch-changed' ||
			message.type === 'selection-changed' ||
			message.type === 'hierarchy-changed' ||
			message.type === 'tool-changed')
	);
}
