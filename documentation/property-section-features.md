# Property Section Features System

## Overview

The Property Section system supports optional features within sections, allowing different object types to show/hide specific UI elements within the same reusable section component.

## Architecture

### Feature Flags

Each section can accept a `features` object with boolean or value-based flags:

```typescript
interface SectionFeatures {
	[key: string]: boolean | string | number | any;
}

interface SectionConfig {
	type: SectionType;
	props?: Record<string, any>;       // Component props (like showFillButtons)
	features?: SectionFeatures;         // Feature flags for optional UI elements
}
```

## Usage Examples

### Example 1: Hide Rotation for Position-Only Objects

```typescript
// Registry configuration
propertySectionRegistry.register('position-only-object', [
	{
		type: 'transform',
		features: {
			position: true,
			rotation: false,    // Hide rotation controls
			dimensions: true
		}
	}
]);
```

### Example 2: Add Randomize Button for Particle Objects

```typescript
// Registry configuration
propertySectionRegistry.register('particle', [
	{
		type: 'transform',
		features: {
			position: true,
			rotation: true,
			dimensions: true,
			randomize: true    // Show randomize button
		}
	}
]);
```

The TransformSection component will automatically show the randomize button:

```svelte
{#if features.randomize}
	<button onclick={handleRandomize}>
		Randomize Transform
	</button>
{/if}
```

### Example 3: 2D Object (No Z-axis)

```typescript
propertySectionRegistry.register('2d-sprite', [
	{
		type: 'transform',
		features: {
			position: true,
			rotation: true,
			dimensions: { axes: ['x', 'y'] }  // Only show width and height
		}
	}
]);
```

### Example 4: Instance with Limited Transform

```typescript
propertySectionRegistry.register('instance', [
	{
		type: 'transform',
		features: {
			position: false,     // Instances inherit position from master
			rotation: true,      // Can rotate independently
			dimensions: false,   // Inherit dimensions from master
			offsetPosition: true // Show position offset instead
		}
	}
]);
```

## Section Component Implementation

### Adding Features to a Section Component

```svelte
<script lang="ts">
	import type { SectionFeatures } from '$lib/services/property-section-registry';

	export let features: SectionFeatures = {
		// Default features (all enabled)
		position: true,
		rotation: true,
		dimensions: true
	};
</script>

<!-- Conditional rendering based on features -->
{#if features.position !== false}
	<div>Position controls...</div>
{/if}

{#if features.rotation !== false}
	<div>Rotation controls...</div>
{/if}

{#if features.customFeature}
	<div>Custom feature UI...</div>
{/if}
```

## Best Practices

1. **Default to Enabled**: Features should default to `true` or enabled state, then specific object types disable them
2. **Use Explicit Checks**: Use `!== false` for boolean features to allow undefined to mean "enabled"
3. **Document Features**: Add comments in section components listing all supported features
4. **Type Safety**: Consider creating specific feature interfaces for each section type

## Supported Sections

### TransformSection Features

- `position: boolean` - Show position controls (default: true)
- `rotation: boolean` - Show rotation controls (default: true)
- `dimensions: boolean` - Show dimension controls (default: true)
- `randomize: boolean` - Show randomize button (default: false)

### MaterialSection Features

(Currently no optional features - could add: `opacity`, `metalness`, `roughness`, etc.)

### LayoutSection Features

(Future: `direction`, `gap`, `padding`, etc.)

### TileSection Features

(Future: `axis`, `repeat`, `gap`, etc.)

## Future Enhancements

### Feature Presets

```typescript
const FEATURE_PRESETS = {
	'full-transform': {
		position: true,
		rotation: true,
		dimensions: true
	},
	'position-only': {
		position: true,
		rotation: false,
		dimensions: false
	}
};

propertySectionRegistry.register('my-object', [
	{
		type: 'transform',
		features: FEATURE_PRESETS['position-only']
	}
]);
```

### Feature Dependencies

```typescript
features: {
	dimensions: true,
	lockAspectRatio: true,  // Only show if dimensions is enabled
}
```

## Migration Guide

When adding new features to existing sections:

1. Add feature to section component with default value
2. Update TypeScript interface documentation
3. Test all existing object types still work
4. Add feature to specific object types that need it
