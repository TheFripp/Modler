<script lang="ts">
	import { cn } from '$lib/utils';
	import InlineInput from './inline-input.svelte';
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

	function handleColorChange(event: Event) {
		const target = event.target as HTMLInputElement;
		if (objectId) {
			propertyController.updateProperty(objectId, 'material.color', target.value, 'input');
		} else if (onColorChange) {
			onColorChange(target.value);
		}
	}

	function handleOpacityChange(event: Event) {
		const target = event.target as HTMLInputElement;
		const value = parseFloat(target.value);
		if (!isNaN(value)) {
			if (objectId) {
				propertyController.updateProperty(objectId, 'material.opacity', value, 'input');
			} else if (onOpacityChange) {
				onOpacityChange(value);
			}
		}
	}

	function handleOpacityIncrease() {
		const newOpacity = Math.min(1, opacity + 0.1);
		if (objectId) {
			propertyController.updateProperty(objectId, 'material.opacity', newOpacity, 'arrow');
		} else if (onOpacityChange) {
			onOpacityChange(newOpacity);
		}
	}

	function handleOpacityDecrease() {
		const newOpacity = Math.max(0, opacity - 0.1);
		if (objectId) {
			propertyController.updateProperty(objectId, 'material.opacity', newOpacity, 'arrow');
		} else if (onOpacityChange) {
			onOpacityChange(newOpacity);
		}
	}

	function handleColorFocus(event: FocusEvent) {
		const target = event.target as HTMLInputElement;
		target.select();
	}
</script>

<div class={cn('material-input space-y-2', className)} {...restProps}>
	<!-- Color Input with Color Picker -->
	<div class="relative">
		<div class="flex items-center bg-[#212121] rounded-md h-8 border border-[#2E2E2E] focus-within:border-[#6b7280] transition-colors">
			<span class="text-xs text-muted-foreground px-2 py-1 flex-shrink-0">Color</span>
			<input
				type="text"
				value={color}
				onchange={handleColorChange}
				onfocus={handleColorFocus}
				class="flex-1 bg-transparent border-none outline-none text-xs text-foreground px-1 py-1 font-mono"
				placeholder="#ffffff"
			/>
			<div class="border-l border-[#2E2E2E] px-1">
				<input
					type="color"
					value={color}
					onchange={handleColorChange}
					class="w-5 h-5 rounded border-none cursor-pointer bg-transparent"
				/>
			</div>
		</div>
	</div>

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