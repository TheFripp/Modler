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
		// ID generation for Tab navigation
		idPrefix?: string;
		// Fill button functionality
		showFillButtons?: boolean;
		fillStates?: { x?: boolean; y?: boolean; z?: boolean };
		onFillToggle?: (axis: 'x' | 'y' | 'z') => void;
		onFillHover?: (axis: 'x' | 'y' | 'z' | null) => void;
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
		idPrefix,
		showFillButtons = false,
		fillStates = {},
		onFillToggle,
		onFillHover,
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

	// Fill button handlers
	function handleFillToggle(axis: 'x' | 'y' | 'z') {
		if (onFillToggle) {
			onFillToggle(axis);
		}
	}

	function handleFillHover(axis: 'x' | 'y' | 'z' | null) {
		if (onFillHover) {
			onFillHover(axis);
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
			{@const isFilled = fillStates[axis] || false}
			<div class="flex-1">
				<div class="flex items-center gap-1">
					<div class="flex-1">
						<InlineInput
							id={idPrefix ? `${idPrefix}-${axis}` : undefined}
							label={labels[axis]}
							type="number"
							value={displayValue}
							placeholder={mixedState.isMixed ? 'Mixed' : (isDisabled ? fieldState?.tooltip || 'Disabled' : '')}
							class={cn(
								mixedState.isMixed ? 'text-muted-foreground/60' : '',
								isDisabled ? 'opacity-50' : '',
								isFilled ? 'opacity-70' : ''
							)}
							disabled={isDisabled || isFilled}
							{objectId}
							property={property}
							oninput={onUpdate ? (e) => handleInput(axis, e) : undefined}
							onIncrease={onUpdate ? () => handleIncrease(axis) : undefined}
							onDecrease={onUpdate ? () => handleDecrease(axis) : undefined}
						/>
					</div>
					{#if showFillButtons}
						<button
							type="button"
							class={cn(
								'w-6 h-6 rounded border text-xs font-medium transition-colors',
								'hover:bg-[#212121] border-[#2E2E2E]',
								isFilled
									? 'bg-[#212121] text-white border-[#2E2E2E]'
									: 'bg-[#171717] text-muted-foreground'
							)}
							title={`Toggle fill for ${axis.toUpperCase()}-axis`}
							onclick={() => handleFillToggle(axis)}
							onmouseenter={() => handleFillHover(axis)}
							onmouseleave={() => handleFillHover(null)}
						>
							F
						</button>
					{/if}
				</div>
			</div>
		{/each}
	</div>
</div>