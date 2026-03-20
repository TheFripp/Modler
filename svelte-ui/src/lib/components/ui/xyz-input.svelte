<script lang="ts">
	import { onMount } from 'svelte';
	import { cn } from '$lib/utils';
	import InlineInput from './inline-input.svelte';
	import type { PropertyPath } from '$lib/services/property-controller';
	import { getPropertyMixedState, selectedObjects, fieldStates } from '$lib/stores/modler';
	import { currentUnit, toDisplayValue, toInternalValue, getUnitStep } from '$lib/stores/units';


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
		// Disable all inputs (for layout mode)
		disableAll?: boolean;
		// Hide values (for empty state)
		hideValues?: boolean;
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
		disableAll = false,
		hideValues = false,
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

	// Fill button handlers
	function handleFillToggle(axis: 'x' | 'y' | 'z') {
		if (onFillToggle) {
			onFillToggle(axis);
		}
	}

	function handleFillHover(axis: 'x' | 'y' | 'z', isHovering: boolean = true) {
		if (onFillHover) {
			onFillHover(axis, isHovering);
		}
	}

	// Convert internal value to display value (if applicable to this property)
	function getDisplayValue(internalValue: number, axis: 'x' | 'y' | 'z'): number {
		// Only convert dimensional properties (position, dimensions), not rotation
		if (propertyBase === 'rotation') {
			return internalValue; // Rotation is always in degrees
		}
		return toDisplayValue(internalValue, $currentUnit);
	}

	// Convert display value back to internal value
	function fromDisplayValue(displayValue: number, axis: 'x' | 'y' | 'z'): number {
		if (propertyBase === 'rotation') {
			return displayValue; // Rotation is always in degrees
		}
		return toInternalValue(displayValue, $currentUnit);
	}

	// Listen for focus requests from tools (Tab key)
	onMount(() => {
		const focusInput = (requestedObjectId: any, property: string) => {
			// Check if this is our object and property base matches
			// Use loose equality (==) to handle string vs number comparison
			if (String(requestedObjectId) === String(objectId) && property.startsWith(`${propertyBase}.`)) {
				const axis = property.split('.')[1] as 'x' | 'y' | 'z';
				const inputId = idPrefix ? `${idPrefix}-${axis}` : `${propertyBase}-${axis}`;
				const inputElement = document.getElementById(inputId);

				if (inputElement) {
					inputElement.focus();
					(inputElement as HTMLInputElement).select();
				}
			}
		};

		// Listen for CustomEvent (for same-window communication)
		const handleCustomEvent = (event: CustomEvent) => {
			const { objectId: requestedObjectId, property } = event.detail;
			focusInput(requestedObjectId, property);
		};

		// Listen for PostMessage (for iframe communication)
		const handlePostMessage = (event: MessageEvent) => {
			// Handle both message formats:
			// 1. New format from KeyboardRouter: { type: 'focus-input', objectId, property }
			// 2. Legacy format: { type: 'data-update', data: { updateType: 'focus-input', objectId, property } }

			if (event.data?.type === 'focus-input') {
				// New format from KeyboardRouter
				const { objectId: requestedObjectId, property } = event.data;
				focusInput(requestedObjectId, property);
			} else if (event.data?.type === 'data-update' && event.data?.data?.updateType === 'focus-input') {
				// Legacy format
				const { objectId: requestedObjectId, property } = event.data.data;
				focusInput(requestedObjectId, property);
			}
		};

		window.addEventListener('modler:focus-input', handleCustomEvent as EventListener);
		window.addEventListener('message', handlePostMessage);

		return () => {
			window.removeEventListener('modler:focus-input', handleCustomEvent as EventListener);
			window.removeEventListener('message', handlePostMessage);
		};
	});
</script>

<div class={cn('xyz-input-group', className)} {...restProps}>
	<div class="flex gap-2">
		{#each ['x', 'y', 'z'] as axis}
			{@const property = objectId && propertyBase ? `${propertyBase}.${axis}` : undefined}
			{@const mixedState = property ? getPropertyMixedState(property, $selectedObjects) : { isMixed: false, value: values[axis] }}
			{@const internalValue = mixedState.isMixed ? 0 : (typeof mixedState.value === 'number' ? mixedState.value : values[axis])}
			{@const displayValue = hideValues ? '' : (mixedState.isMixed ? '' : (propertyBase === 'rotation' ? internalValue : toDisplayValue(internalValue, $currentUnit)))}
			{@const fieldState = property ? $fieldStates[property] : undefined}
			{@const isDisabled = disableAll || fieldState?.disabled || false}
			{@const isFilled = fillStates[axis] || false}
			{@const unitSuffix = propertyBase !== 'rotation' ? $currentUnit : '°'}
			<div class="flex-1 min-w-0">
				{#key `${axis}-${$currentUnit}`}
					<InlineInput
						id={idPrefix ? `${idPrefix}-${axis}` : undefined}
						label={labels[axis]}
						type="number"
						value={displayValue}
						step={getUnitStep($currentUnit)}
						suffix={unitSuffix}
						placeholder={hideValues ? '' : (mixedState.isMixed ? 'Mixed' : (disableAll ? 'Layout Mode' : (isDisabled ? fieldState?.tooltip || 'Disabled' : '')))}
						class={cn(
							mixedState.isMixed ? 'text-muted-foreground/60' : '',
							isDisabled ? 'opacity-50' : '',
							isFilled ? 'opacity-50' : ''
						)}
						disabled={isDisabled}
						{objectId}
						property={property}
						oninput={onUpdate ? (e) => handleInput(axis, e) : undefined}
						showFillButton={showFillButtons}
						fillActive={isFilled}
						fillTitle={`Toggle fill for ${axis.toUpperCase()}-axis`}
						onFillToggle={() => handleFillToggle(axis)}
						onFillHover={(hovering) => handleFillHover(axis, hovering)}
						convertToInternal={propertyBase !== 'rotation' ? fromDisplayValue : undefined}
					/>
				{/key}
			</div>
		{/each}
	</div>
</div>