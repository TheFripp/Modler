# Property Section System

**Version**: 1.0.0
**Status**: ✅ Current
**Last Updated**: 2025-10-04

## Overview

The Property Section System is a modular, registry-based architecture for rendering property panel UI. It enables different object types to share reusable UI sections while supporting customization through props and feature flags.

## Problem Solved

**Before**: PropertyPanel.svelte contained 462 lines of nested conditionals for different object types:
```svelte
{#if isContainer && tileMode}
  <!-- Tiled container UI -->
{:else if isContainer}
  <!-- Regular container UI -->
{:else if type === 'multi'}
  <!-- Multi-selection UI -->
{:else}
  <!-- Box UI -->
{/if}
```

**After**: PropertyPanel.svelte is 194 lines (58% reduction) with zero object-type conditionals:
```svelte
{#each sections as section}
  <TransformSection {...section.props} features={section.features} />
{/each}
```

## Architecture

### 1. Property Section Registry

**Location**: `/svelte-ui/src/lib/services/property-section-registry.ts`

Central registry that maps object types to their property sections:

```typescript
interface SectionConfig {
	type: SectionType;           // 'transform' | 'material' | 'layout' | 'tile'
	props?: Record<string, any>; // Component props
	features?: SectionFeatures;  // Optional feature flags
}

propertySectionRegistry.register('box', [
	{
		type: 'transform',
		props: { showFillButtons: true },
		features: { position: true, rotation: true, dimensions: true }
	},
	{ type: 'material' }
]);
```

### 2. Section Components

**Location**: `/svelte-ui/src/lib/components/property-sections/`

Reusable, self-contained section components:

- **TransformSection.svelte** - Position, rotation, dimensions
- **MaterialSection.svelte** - Color, opacity
- **LayoutSection.svelte** - Container layout (direction, gap, padding)
- **TileSection.svelte** - Tiled container controls (axis, repeat, gap)

### 3. PropertyPanel Renderer

**Location**: `/svelte-ui/src/lib/components/PropertyPanel.svelte`

Lightweight component that:
1. Determines object type from selected object
2. Fetches sections from registry
3. Renders sections dynamically

```svelte
$: objectType = getObjectType($displayObject);
$: sections = propertySectionRegistry.getSections(objectType);

{#each sections as section}
	{#if section.type === 'transform'}
		<TransformSection {...section.props} features={section.features} />
	{/if}
{/each}
```

## Object Type Mapping

| Object Type | Transform | Material | Layout | Tile |
|-------------|-----------|----------|--------|------|
| `box` | ✓ (fill buttons) | ✓ | - | - |
| `container` | ✓ | - | ✓ | - |
| `tiled-container` | ✓ | - | - | ✓ |
| `multi` | ✓ (fill buttons) | ✓ | - | - |

## Feature Flags System

Sections support optional features for fine-grained control:

```typescript
interface SectionFeatures {
	[key: string]: boolean | string | number | any;
}
```

### TransformSection Features

- `position: boolean` - Show position controls (default: true)
- `rotation: boolean` - Show rotation controls (default: true)
- `dimensions: boolean` - Show dimensions controls (default: true)
- `randomize: boolean` - Show randomize button (default: false)

### Example: Position-Only Object

```typescript
propertySectionRegistry.register('camera-target', [
	{
		type: 'transform',
		features: {
			position: true,
			rotation: false,
			dimensions: false
		}
	}
]);
```

## Adding New Object Types

### Step 1: Define Section Configuration

```typescript
// In property-section-registry.ts
propertySectionRegistry.register('instance', [
	{
		type: 'transform',
		props: { showFillButtons: false },
		features: {
			position: false,      // Instances inherit position
			rotation: true,
			dimensions: false,    // Inherit dimensions
			offsetPosition: true  // Show offset instead
		}
	}
]);
```

### Step 2: Create Section Component (if needed)

```svelte
<!-- /property-sections/InstanceSection.svelte -->
<script lang="ts">
	export let displayObject: any;
	export let objectId: string;
</script>

<PropertyGroup title="Instance">
	<!-- Instance-specific UI -->
</PropertyGroup>
```

### Step 3: Register Section Type

```typescript
// In property-section-registry.ts
export type SectionType =
	| 'transform'
	| 'material'
	| 'layout'
	| 'tile'
	| 'instance'; // Add new type
```

### Step 4: Add to PropertyPanel Renderer

```svelte
<!-- In PropertyPanel.svelte -->
{#if section.type === 'instance'}
	<InstanceSection
		displayObject={$displayObject}
		objectId={getObjectIdForUpdate()}
	/>
{/if}
```

### Step 5: Update Object Type Detection

```svelte
<!-- In PropertyPanel.svelte -->
function getObjectType(obj: any): string {
	if (obj.isInstance) return 'instance';
	// ... other checks
}
```

## Benefits

### 1. Extensibility
Adding new object types requires:
- 1 line in registry (no component changes)
- Optional: new section component for unique features

### 2. Reusability
TransformSection used by:
- Box objects (with fill buttons)
- Containers (without fill buttons)
- Tiled containers (without fill buttons)
- Multi-selection (with fill buttons)

### 3. Maintainability
- Each section is self-contained and testable
- No nested conditionals in PropertyPanel
- Changes to one object type don't affect others

### 4. Type Safety
TypeScript ensures:
- Valid section types
- Valid feature flags
- Correct prop types

### 5. Consistency
All object types using same section get identical UI and behavior.

## File Structure

```
svelte-ui/src/lib/
├── services/
│   └── property-section-registry.ts    # Registry system
├── components/
│   ├── PropertyPanel.svelte            # Renderer (194 lines)
│   └── property-sections/              # Section components
│       ├── TransformSection.svelte     # Position, rotation, dimensions
│       ├── MaterialSection.svelte      # Color, opacity
│       ├── LayoutSection.svelte        # Container layout
│       └── TileSection.svelte          # Tiled container controls
```

## Usage Patterns

### Pattern 1: Shared Section with Different Props

```typescript
// Boxes show fill buttons
propertySectionRegistry.register('box', [
	{ type: 'transform', props: { showFillButtons: true } }
]);

// Containers don't
propertySectionRegistry.register('container', [
	{ type: 'transform', props: { showFillButtons: false } }
]);
```

### Pattern 2: Shared Section with Different Features

```typescript
// 3D object
propertySectionRegistry.register('box', [
	{
		type: 'transform',
		features: { position: true, rotation: true, dimensions: true }
	}
]);

// 2D sprite
propertySectionRegistry.register('sprite', [
	{
		type: 'transform',
		features: { position: true, rotation: { axes: ['z'] }, dimensions: { axes: ['x', 'y'] } }
	}
]);
```

### Pattern 3: Object-Specific Section

```typescript
propertySectionRegistry.register('tiled-container', [
	{ type: 'transform' },
	{ type: 'tile' }  // Unique to tiled containers
]);
```

### Pattern 4: Feature Presets

```typescript
const TRANSFORM_PRESETS = {
	full: { position: true, rotation: true, dimensions: true },
	positionOnly: { position: true, rotation: false, dimensions: false },
	rotationOnly: { position: false, rotation: true, dimensions: false }
};

propertySectionRegistry.register('my-object', [
	{ type: 'transform', features: TRANSFORM_PRESETS.positionOnly }
]);
```

## Testing

### Test Object Type Registration

```typescript
import { propertySectionRegistry } from '$lib/services/property-section-registry';

// Test section retrieval
const sections = propertySectionRegistry.getSections('box');
expect(sections).toHaveLength(2);
expect(sections[0].type).toBe('transform');
expect(sections[1].type).toBe('material');

// Test feature flags
const transformSection = sections[0];
expect(transformSection.features.position).toBe(true);
expect(transformSection.features.rotation).toBe(true);
```

### Test Section Component

```svelte
<!-- TransformSection.test.svelte -->
<script>
	import { render } from '@testing-library/svelte';
	import TransformSection from './TransformSection.svelte';

	const displayObject = {
		position: { x: 0, y: 0, z: 0 },
		rotation: { x: 0, y: 0, z: 0 },
		dimensions: { x: 1, y: 1, z: 1 }
	};

	// Test with all features enabled
	const { getByText } = render(TransformSection, {
		displayObject,
		objectId: 'test',
		features: { position: true, rotation: true, dimensions: true }
	});

	expect(getByText('Position')).toBeInTheDocument();
	expect(getByText('Rotation')).toBeInTheDocument();
	expect(getByText('Dimensions')).toBeInTheDocument();
</script>
```

## Migration from Legacy PropertyPanel

Old code (462 lines with nested conditionals):
```svelte
{#if $displayObject.isContainer && $displayObject.autoLayout?.tileMode?.enabled}
	<PropertyGroup title="Tile">
		<TileControls ... />
	</PropertyGroup>
{:else if $displayObject.isContainer}
	<PropertyGroup title="Layout">
		<!-- Layout controls -->
	</PropertyGroup>
{/if}
```

New code (194 lines, zero conditionals):
```svelte
{#each sections as section}
	{#if section.type === 'tile'}
		<TileSection {...section.props} />
	{/if}
{/each}
```

## Future Enhancements

### 1. Dynamic Section Loading
```typescript
const sectionComponents = {
	transform: () => import('./property-sections/TransformSection.svelte'),
	material: () => import('./property-sections/MaterialSection.svelte')
};
```

### 2. Section Ordering
```typescript
propertySectionRegistry.register('box', [
	{ type: 'transform', order: 1 },
	{ type: 'material', order: 2 }
]);
```

### 3. Conditional Sections
```typescript
{
	type: 'advanced',
	condition: (obj) => obj.hasAdvancedFeatures
}
```

### 4. Section Validation
```typescript
const validator = propertySectionRegistry.validate('box');
if (!validator.isValid) {
	console.error('Invalid section config:', validator.errors);
}
```

## Related Documentation

- [Property Section Features](./property-section-features.md) - Feature flag system
- [Container Properties](./container-properties.md) - Container-specific sections
- [Component Instancing Roadmap](./roadmap-component-instancing.md) - Future instance sections

## Version History

- **1.0.0** (2025-10-04) - Initial implementation with 4 sections (transform, material, layout, tile)

## Summary

The Property Section System provides a scalable, maintainable architecture for property panel UI that:
- ✅ Reduces PropertyPanel from 462 to 194 lines (58% reduction)
- ✅ Eliminates object-type conditionals entirely
- ✅ Enables section reuse across object types
- ✅ Supports fine-grained customization via features
- ✅ Makes adding new object types trivial
- ✅ Improves testability and type safety
