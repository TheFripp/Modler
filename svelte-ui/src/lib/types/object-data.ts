/**
 * Object Data Types - Standard Format Definitions
 *
 * TypeScript interfaces matching the central ObjectDataFormat
 * These are the ONLY types that should be used throughout the Svelte UI
 *
 * Version: 1.0.0 (matches ObjectDataFormat.VERSION)
 */

// Core position, rotation, scale interfaces
export interface Position {
    x: number;
    y: number;
    z: number;
}

export interface Rotation {
    x: number; // Always in degrees for UI
    y: number;
    z: number;
}

export interface Scale {
    x: number;
    y: number;
    z: number;
}

export interface Dimensions {
    x: number; // Width
    y: number; // Height
    z: number; // Depth
}

// Material interface
export interface Material {
    color: string; // Hex color string (e.g., "#ff0000")
    opacity: number; // 0.0 to 1.0
    transparent: boolean;
}

// Container layout interfaces
export interface LayoutPadding {
    width: number;   // SCHEMA-FIRST: Match ObjectDataFormat schema
    height: number;  // Changed from top/bottom/left/right/front/back
    depth: number;   // To align with 3D coordinate system
}

export interface LayoutAlignment {
    x: 'left' | 'center' | 'right';
    y: 'bottom' | 'center' | 'top';
    z: 'back' | 'center' | 'front';
}

export interface TileMode {
    enabled: boolean;
    repeat: number;
    sourceObjectId: string;
}

export interface AutoLayout {
    enabled: boolean;
    direction: 'x' | 'y' | 'z' | null;
    gap: number;
    padding: LayoutPadding;
    alignment: LayoutAlignment;  // SCHEMA-FIRST: Added to match schema
    reversed: boolean;            // SCHEMA-FIRST: Added to match schema
    tileMode?: TileMode;
}

// Parametric design interfaces
export interface ParametricProperty {
    value: number | string | boolean;
    unit?: string;
    drives: string[];
    formula?: string;
    exposed: boolean;
    constraints?: {
        min?: number;
        max?: number;
        options?: any[];
    };
}

export interface ParametricData {
    exposed: { [parameterName: string]: ParametricProperty };
    constraints: { [propertyName: string]: 'locked' | 'formula' | 'free' };
    formulas: { [propertyName: string]: string };
    dependencies: string[];
}

// Component instancing interfaces
export interface InstanceData {
    masterId: string;
    instanceType: 'component' | 'parametric' | 'custom';
    canModify: boolean;
    inheritedProperties: string[];
}

export interface MasterData {
    isMaster: boolean;
    instanceCount: number;
    instances: string[];
    componentType: string;
}

/**
 * Standard ObjectData interface
 * This is the ONLY ObjectData interface that should be used
 * All other ObjectData interfaces should be removed
 */
export interface ObjectData {
    // Core identification
    id: string;
    name: string;
    type: string;

    // Hierarchy
    parentContainer: string | null;
    childIds: string[];

    // Transform properties (always nested objects)
    position: Position;
    rotation: Rotation; // Always in degrees
    scale: Scale;

    // Physical properties
    dimensions: Dimensions;
    material: Material;

    // Container properties
    isContainer: boolean;
    containerMode: 'manual' | 'layout' | 'hug' | null;
    layoutMode: 'manual' | 'grid' | 'stack' | null; // LEGACY
    autoLayout: AutoLayout;

    // State flags
    selected: boolean;
    locked: boolean;
    visible: boolean;

    // Advanced features (optional)
    parametric?: ParametricData;
    instance?: InstanceData;
    master?: MasterData;
    constraints?: { [propertyName: string]: 'locked' | 'formula' };

    // Yard (material library) metadata
    yardItemId?: string | null;
    yardFixed?: { x: boolean; y: boolean; z: boolean } | null;

    // Metadata
    formatVersion: string;
    lastModified: number;
}

// Tool state interface
export interface ToolState {
    activeTool: 'select' | 'move' | 'rotate' | 'scale' | 'push' | 'box-creation' | 'tile' | 'measure';
    snapEnabled: boolean;
}

// Container context interface
export interface ContainerContext {
    containerId: string;
    containerName: string;
    steppedIntoAt: number;
}

// Field state management for UI
export interface FieldState {
    disabled: boolean;
    reason?: 'hug-mode' | 'parametric-locked' | 'parametric-formula' | 'instance-restricted' | 'yard-fixed';
    tooltip?: string;
}

export interface FieldStates {
    [fieldPath: string]: FieldState;
}

// Multi-selection support
export interface MultiSelectionData {
    selectedObjects: ObjectData[];
    commonProperties: Partial<ObjectData>;
    mixedProperties: Set<string>;
}

// Type guards for runtime validation
export function isObjectData(obj: any): obj is ObjectData {
    return obj &&
           typeof obj === 'object' &&
           typeof obj.id === 'string' &&
           typeof obj.name === 'string' &&
           typeof obj.type === 'string' &&
           obj.position && typeof obj.position === 'object' &&
           typeof obj.position.x === 'number' &&
           typeof obj.position.y === 'number' &&
           typeof obj.position.z === 'number' &&
           obj.rotation && typeof obj.rotation === 'object' &&
           typeof obj.rotation.x === 'number' &&
           typeof obj.rotation.y === 'number' &&
           typeof obj.rotation.z === 'number' &&
           obj.dimensions && typeof obj.dimensions === 'object' &&
           typeof obj.dimensions.x === 'number' &&
           typeof obj.dimensions.y === 'number' &&
           typeof obj.dimensions.z === 'number';
}

export function isPosition(obj: any): obj is Position {
    return obj &&
           typeof obj === 'object' &&
           typeof obj.x === 'number' &&
           typeof obj.y === 'number' &&
           typeof obj.z === 'number';
}

export function isRotation(obj: any): obj is Rotation {
    return obj &&
           typeof obj === 'object' &&
           typeof obj.x === 'number' &&
           typeof obj.y === 'number' &&
           typeof obj.z === 'number';
}

export function isDimensions(obj: any): obj is Dimensions {
    return obj &&
           typeof obj === 'object' &&
           typeof obj.x === 'number' &&
           typeof obj.y === 'number' &&
           typeof obj.z === 'number' &&
           obj.x > 0 && obj.y > 0 && obj.z > 0;
}

// Utility functions for working with ObjectData
export function createEmptyObjectData(id?: string): ObjectData {
    return {
        id: id || `object-${Date.now()}`,
        name: 'New Object',
        type: 'object',

        parentContainer: null,
        childIds: [],

        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },

        dimensions: { x: 1, y: 1, z: 1 },
        material: {
            color: '#888888',
            opacity: 1,
            transparent: false
        },

        isContainer: false,
        containerMode: null,
        layoutMode: null,
        autoLayout: {
            enabled: false,
            direction: null,
            gap: 0,
            padding: { width: 0, height: 0, depth: 0 },
            alignment: { x: 'center', y: 'center', z: 'center' },
            reversed: false
        },

        selected: false,
        locked: false,
        visible: true,

        formatVersion: '1.0.0',
        lastModified: Date.now()
    };
}

export function cloneObjectData(objectData: ObjectData): ObjectData {
    return JSON.parse(JSON.stringify(objectData));
}

export function updateObjectProperty(objectData: ObjectData, propertyPath: string, value: any): ObjectData {
    const updated = cloneObjectData(objectData);

    if (propertyPath.includes('.')) {
        const [parent, child] = propertyPath.split('.');
        if (!updated[parent as keyof ObjectData]) {
            (updated as any)[parent] = {};
        }
        (updated as any)[parent][child] = value;
    } else {
        (updated as any)[propertyPath] = value;
    }

    updated.lastModified = Date.now();
    return updated;
}

export function getNestedProperty(objectData: ObjectData, propertyPath: string): any {
    if (!propertyPath.includes('.')) {
        return (objectData as any)[propertyPath];
    }

    const [parent, child] = propertyPath.split('.');
    const parentObj = (objectData as any)[parent];
    return parentObj ? parentObj[child] : undefined;
}

// Property path constants for type safety
export const PROPERTY_PATHS = {
    POSITION: {
        X: 'position.x',
        Y: 'position.y',
        Z: 'position.z'
    },
    ROTATION: {
        X: 'rotation.x',
        Y: 'rotation.y',
        Z: 'rotation.z'
    },
    SCALE: {
        X: 'scale.x',
        Y: 'scale.y',
        Z: 'scale.z'
    },
    DIMENSIONS: {
        X: 'dimensions.x',
        Y: 'dimensions.y',
        Z: 'dimensions.z'
    },
    MATERIAL: {
        COLOR: 'material.color',
        OPACITY: 'material.opacity',
        TRANSPARENT: 'material.transparent'
    },
    AUTO_LAYOUT: {
        ENABLED: 'autoLayout.enabled',
        DIRECTION: 'autoLayout.direction',
        GAP: 'autoLayout.gap'
    }
} as const;