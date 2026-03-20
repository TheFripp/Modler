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

## UI Component Library

Centralized components in `svelte-ui/src/lib/components/ui/`. All use Svelte 5 `$props()` syntax.

### Primitives
- **button.svelte** — Variant-based button (default, outline, ghost, destructive, secondary, link)
- **badge.svelte** — Status/type badge with variants
- **color-input.svelte** — Hex text input + native color picker with # prefix formatting
- **section-header.svelte** — Divider line with label, `align='left'|'right'`

### Compound Inputs
- **inline-input.svelte** — Core property input with drag-to-adjust, arrow buttons, constraints, fill buttons, PropertyController integration
- **xyz-input.svelte** — 3-axis compound (wraps 3 InlineInputs) with unit conversion and mixed value detection
- **material-input.svelte** — Color (delegates to ColorInput) + Opacity (InlineInput)
- **button-group.svelte** — Mutually exclusive toggle buttons with configurable active/inactive styling
- **axis-selector.svelte** — X/Y/Z axis button grid with hover highlighting, `variant='layout'|'tile'`

### Layout
- **property-group.svelte** — Collapsible section wrapper with title and divider

### Property Sections (`property-sections/`)
Registered via `PropertySectionRegistry` and rendered dynamically by `PropertyPanel.svelte`:
- **TransformSection** — Position, Rotation, Dimensions (uses XyzInput)
- **MaterialSection** — Color + Opacity (uses MaterialInput)
- **LayoutSection** — Container mode, direction, gap, alignment grid, padding
- **TileSection** — Tiled container config (delegates to TileControls)

### Adding New UI
1. Create reusable primitives/compounds in `ui/` directory
2. Create property sections in `property-sections/` directory
3. Register sections in `PropertySectionRegistry` for automatic panel rendering

## Design System
```css
/* Modler theme (CSS custom properties in app.css) */
--modler-panel-bg: #171717       /* Panel background */
--modler-surface-bg: #212121     /* Elevated surfaces */
--modler-separator: #2E2E2E      /* Divider lines */
--modler-selection: #3b82f6      /* Blue - selection */
--modler-container: #22c55e      /* Green - containers */
--modler-object: #9ca3af         /* Gray - objects */

/* Input pattern */
bg-[#212121]/50 rounded-md h-8 border border-[#2E2E2E]/50
focus-within:border-[#6b7280] transition-colors

/* Button pattern */
px-3 py-2 text-xs font-medium border rounded-md transition-all
```

## Communication

### Bi-Directional Selection System ✨
- **Scene → UI**: Objects selected in 3D scene automatically highlight in object list
- **UI → Scene**: Objects clicked in object list automatically select in 3D scene
- **Smart Navigation**: Integrates with NavigationController for container context switching

### Core Communication Patterns
- **Three.js → Svelte**: `syncSelectionFromThreeJS()`, `syncHierarchyFromThreeJS()`, `addObjectToHierarchy()`, `removeObjectFromHierarchy()`
- **Svelte → Three.js**: `selectObjectInScene()`, `updateObjectProperty()`, `activateToolInScene()`
- **Architecture**: iframe + PostMessage with port detection for secure communication

### Hierarchy Update Messages
- **`hierarchy-changed`** — Full rebuild (reparent, reorder). Sends complete flat array + rootChildrenOrder.
- **`hierarchy-object-added`** — Incremental: single new object + rootChildrenOrder. Avoids full rebuild on create.
- **`hierarchy-object-removed`** — Incremental: objectId only. Avoids full rebuild on delete.

### ObjectTree Architecture
- **Component**: `svelte-ui/src/lib/components/ObjectTree.svelte`
- **Drag-drop logic**: `svelte-ui/src/lib/components/object-tree/drag-drop.ts` — validation, drop resolution, utilities
- **Optimistic selection**: Tree clicks show instant highlight via `pendingSelectionId`, confirmed by round-trip

### Object Selection Flow
```typescript
// In Svelte UI (object list click)
function selectObjectInScene(objectId: string) {
    // PostMessage with navigation context
    window.parent.postMessage({
        type: 'object-select',
        data: { objectId, parentContainer, useNavigationController: true }
    }, '*');
}

// In Main Integration (message handler)
function handleObjectSelection(objectId, parentContainer, useNavigationController) {
    if (useNavigationController && navigationController) {
        navigationController.navigateToObject(objectId);
    }
    // Fallback to direct selection
}
```