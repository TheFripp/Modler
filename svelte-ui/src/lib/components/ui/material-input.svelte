<script lang="ts">
	import { cn } from '$lib/utils';
	import InlineInput from './inline-input.svelte';
	import ColorInput from './color-input.svelte';
	import { propertyController } from '$lib/services/property-controller';

	interface Props {
		color: string;
		opacity: number;
		// Property controller integration
		objectId?: string;
		// Legacy handlers (deprecated)
		onColorChange?: (color: string) => void;
		onOpacityChange?: (opacity: number) => void;
		class?: string;
	}

	let {
		color,
		opacity,
		objectId,
		onColorChange,
		onOpacityChange,
		class: className = '',
		...restProps
	}: Props = $props();

	function handleColorChange(colorValue: string) {
		if (objectId && propertyController) {
			propertyController?.updateProperty(objectId, 'material.color', colorValue, 'input');
		} else if (onColorChange) {
			onColorChange(colorValue);
		}
	}

	function handleOpacityChange(event: Event) {
		const target = event.target as HTMLInputElement;
		const value = parseFloat(target.value);
		if (!isNaN(value)) {
			if (objectId && propertyController) {
				propertyController?.updateProperty(objectId, 'material.opacity', value, 'input');
			} else if (onOpacityChange) {
				onOpacityChange(value);
			}
		}
	}

	function handleOpacityIncrease() {
		const newOpacity = Math.min(1, opacity + 0.1);
		if (objectId && propertyController) {
			propertyController?.updateProperty(objectId, 'material.opacity', newOpacity, 'arrow');
		} else if (onOpacityChange) {
			onOpacityChange(newOpacity);
		}
	}

	function handleOpacityDecrease() {
		const newOpacity = Math.max(0, opacity - 0.1);
		if (objectId && propertyController) {
			propertyController?.updateProperty(objectId, 'material.opacity', newOpacity, 'arrow');
		} else if (onOpacityChange) {
			onOpacityChange(newOpacity);
		}
	}
</script>

<div class={cn('material-input space-y-2', className)} {...restProps}>
	<!-- Color Input (delegates to shared ColorInput component) -->
	<ColorInput
		label="Color"
		value={color}
		onchange={handleColorChange}
	/>

	<!-- Opacity Input -->
	<InlineInput
		label="Opacity"
		type="number"
		value={opacity}
		{objectId}
		property={objectId ? 'material.opacity' : undefined}
		oninput={onOpacityChange ? handleOpacityChange : undefined}
		onIncrease={onOpacityChange ? handleOpacityIncrease : undefined}
		onDecrease={onOpacityChange ? handleOpacityDecrease : undefined}
	/>
</div>
