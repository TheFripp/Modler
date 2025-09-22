# Svelte UI Integration

Quick reference for UI development.

## Key Files

- **ThreeJSBridge**: `svelte-ui/src/lib/bridge/threejs-bridge.ts`
- **Stores**: `svelte-ui/src/lib/stores/modler.ts`
- **PropertyPanel**: `svelte-ui/src/lib/components/PropertyPanel.svelte`

## Common Patterns

### Store Usage
```typescript
import { selectedObjects, objectHierarchy, toolState } from '$lib/stores/modler';

// Auto-updates when Three.js selection changes
$: currentSelection = $selectedObjects;
```

### Property Updates
```typescript
import { updateObjectProperty } from '$lib/services/property-controller';

async function handlePropertyChange(objectId: string, property: string, value: any) {
    await updateObjectProperty(objectId, property, value);
    // Store updates automatically via bridge
}
```

### Tool Activation
```typescript
import { activateToolInScene } from '$lib/bridge/threejs-bridge';

function handleToolChange(toolName: string) {
    activateToolInScene(toolName);
}
```

## ObjectData Interface
```typescript
interface ObjectData {
    id: string;
    name: string;
    type: string;
    isContainer?: boolean;
    position: { x: number; y: number; z: number };
    rotation: { x: number; y: number; z: number };
    dimensions: { x: number; y: number; z: number };
    autoLayout?: {
        enabled: boolean;
        direction: string | null;
        gap: number;
        padding: { top: number; bottom: number; left: number; right: number; front: number; back: number };
    };
    sizingMode?: 'hug' | 'fixed';
    parentContainer?: string;
}
```

## Design System
```css
/* Use these classes */
.bg-gray-800    /* Main panels */
.bg-gray-900    /* Input fields */
.bg-gray-600 .hover:bg-gray-500    /* Buttons */
.text-gray-50   /* Primary text */
.text-gray-400  /* Secondary text */
.border-gray-700    /* Borders */
```

## Communication

- **Three.js → Svelte**: `syncSelectionFromThreeJS()`, `syncHierarchyFromThreeJS()`
- **Svelte → Three.js**: `activateToolInScene()`, `updateObjectProperty()`
- **Architecture**: iframe + PostMessage for isolation