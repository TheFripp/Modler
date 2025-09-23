<script lang="ts">
	import { cn } from '$lib/utils';
	import InlineInput from './inline-input.svelte';
	import type { PropertyPath } from '$lib/services/property-controller';
	import { getPropertyMixedState, selectedObjects, fieldStates } from '$lib/stores/modler';

	interface Props {
		label?: string;
		values: { x: number; y: number; z: number };
		// Property controller integration
		objectId?: string;
		propertyBase?: 'position' | 'rotation' | 'dimensions';
		// Legacy handler (deprecated)
		onUpdate?: (axis: 'x' | 'y' | 'z', value: number) => void;
		step?: number;
		class?: string;
		labels?: { x?: string; y?: string; z?: string };
	}

	let {
		label,
		values,
		objectId,
		propertyBase,
		onUpdate,
		step = 0.1,
		class: className = '',
		labels = { x: 'X', y: 'Y', z: 'Z' },
		...restProps
	}: Props = $props();

	// Legacy event handlers (for backward compatibility)
	function handleInput(axis: 'x' | 'y' | 'z', event: Event) {
		if (onUpdate) {
			const target = event.target as HTMLInputElement;
			const value = parseFloat(target.value);
			if (!isNaN(value)) {
				onUpdate(axis, value);
			}
		}
	}

	function handleIncrease(axis: 'x' | 'y' | 'z') {
		if (onUpdate) {
			onUpdate(axis, values[axis] + step);
		}
	}

	function handleDecrease(axis: 'x' | 'y' | 'z') {
		if (onUpdate) {
			onUpdate(axis, values[axis] - step);
		}
	}
</script>

<div class={cn('xyz-input-group', className)} {...restProps}>
	<div class="flex gap-2">
		{#each ['x', 'y', 'z'] as axis}
			{@const property = objectId && propertyBase ? `${propertyBase}.${axis}` : undefined}
			{@const mixedState = property ? getPropertyMixedState(property, $selectedObjects) : { isMixed: false, value: values[axis] }}
			{@const displayValue = mixedState.isMixed ? '' : (typeof mixedState.value === 'number' ? Math.round(mixedState.value * 10) / 10 : mixedState.value)}
			{@const fieldState = property ? $fieldStates[property] : undefined}
			{@const isDisabled = fieldState?.disabled || false}
			<div class="flex-1">
				<InlineInput
					label={labels[axis]}
					type="number"
					value={displayValue}
					placeholder={mixedState.isMixed ? 'Mixed' : (isDisabled ? fieldState?.tooltip || 'Disabled' : '')}
					class={cn(
						mixedState.isMixed ? 'text-muted-foreground/60' : '',
						isDisabled ? 'opacity-50' : ''
					)}
					disabled={isDisabled}
					{objectId}
					property={property}
					oninput={onUpdate ? (e) => handleInput(axis, e) : undefined}
					onIncrease={onUpdate ? () => handleIncrease(axis) : undefined}
					onDecrease={onUpdate ? () => handleDecrease(axis) : undefined}
				/>
			</div>
		{/each}
	</div>
</div>