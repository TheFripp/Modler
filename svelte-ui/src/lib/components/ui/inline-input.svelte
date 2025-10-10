<script lang="ts">
	import { cn } from '$lib/utils';
	import { propertyController, type PropertyPath } from '$lib/services/property-controller';
	import { ChevronUp, ChevronDown } from 'lucide-svelte';

	interface Props {
		label: string;
		value?: string | number;
		type?: string;
		placeholder?: string;
		disabled?: boolean;
		class?: string;
		id?: string;
		suffix?: string;
		// Property controller integration
		objectId?: string;
		property?: PropertyPath;
		// Legacy event handlers (deprecated)
		oninput?: (event: Event) => void;
		onchange?: (event: Event) => void;
		onIncrease?: () => void;
		onDecrease?: () => void;
	}

	let {
		label,
		value = $bindable(),
		type = 'text',
		placeholder = '',
		disabled = false,
		class: className = '',
		id,
		suffix = '',
		objectId,
		property,
		// Legacy handlers
		oninput,
		onchange,
		onIncrease,
		onDecrease,
		...restProps
	}: Props = $props();

	// Check if this is an opacity field (should display as integer)
	const isOpacity = label?.toLowerCase().includes('opacity');

	// Get constraints from property controller or restProps
	const constraints = property && propertyController ? propertyController?.getConstraints(property) : null;
	const step = constraints?.step || (restProps as any).step || (isOpacity ? 1 : 0.1);
	const min = constraints?.min ?? (restProps as any).min ?? (isOpacity ? 0 : undefined);
	const max = constraints?.max ?? (restProps as any).max ?? (isOpacity ? 100 : undefined);
	const showArrows = type === 'number';

	// Internal state for the input field
	let inputValue = $state(value);

	// Update internal state when external value changes
	// BUT: Don't update during drag to prevent flickering from other objects
	$effect(() => {
		if (!isDragging) {
			inputValue = value;
		}
	});

	function handleIncrease() {
		if (onIncrease) {
			// Legacy handler
			onIncrease();
		} else if (objectId && property) {
			// Use property controller - handles mixed values automatically
			const currentValue = getNumericValue();
			const stepValue = typeof step === 'number' ? step : (isOpacity ? 1 : 0.1);
			let newValue = (isOpacity || stepValue === 1)
				? Math.round(currentValue + stepValue)
				: parseFloat((Math.round((currentValue + stepValue) * 10) / 10).toFixed(1));
			// Apply constraints
			if (max !== undefined) newValue = Math.min(newValue, max);
			if (min !== undefined) newValue = Math.max(newValue, min);
			propertyController?.updateProperty(objectId, property, newValue, 'button');
		} else if (type === 'number') {
			// Fallback for non-property-controller usage
			const currentValue = getNumericValue();
			const stepValue = typeof step === 'number' ? step : (isOpacity ? 1 : 0.1);
			let newValue = (isOpacity || stepValue === 1)
				? Math.round(currentValue + stepValue)
				: parseFloat((Math.round((currentValue + stepValue) * 10) / 10).toFixed(1));
			// Apply constraints
			if (max !== undefined) newValue = Math.min(newValue, max);
			if (min !== undefined) newValue = Math.max(newValue, min);
			value = newValue;
		}
	}

	function handleDecrease() {
		if (onDecrease) {
			// Legacy handler
			onDecrease();
		} else if (objectId && property) {
			// Use property controller - handles mixed values automatically
			const currentValue = getNumericValue();
			const stepValue = typeof step === 'number' ? step : (isOpacity ? 1 : 0.1);
			let newValue = (isOpacity || stepValue === 1)
				? Math.round(currentValue - stepValue)
				: parseFloat((Math.round((currentValue - stepValue) * 10) / 10).toFixed(1));
			// Apply constraints
			if (max !== undefined) newValue = Math.min(newValue, max);
			if (min !== undefined) newValue = Math.max(newValue, min);
			propertyController?.updateProperty(objectId, property, newValue, 'button');
		} else if (type === 'number') {
			// Fallback for non-property-controller usage
			const currentValue = getNumericValue();
			const stepValue = typeof step === 'number' ? step : (isOpacity ? 1 : 0.1);
			let newValue = (isOpacity || stepValue === 1)
				? Math.round(currentValue - stepValue)
				: parseFloat((Math.round((currentValue - stepValue) * 10) / 10).toFixed(1));
			// Apply constraints
			if (max !== undefined) newValue = Math.min(newValue, max);
			if (min !== undefined) newValue = Math.max(newValue, min);
			value = newValue;
		}
	}

	function handleInputChange(event: Event) {
		const target = event.target as HTMLInputElement;
		let newValue = type === 'number' ? parseFloat(target.value) : target.value;

		// Apply constraints for number inputs
		if (type === 'number' && typeof newValue === 'number' && !isNaN(newValue)) {
			if (max !== undefined) newValue = Math.min(newValue, max);
			if (min !== undefined) newValue = Math.max(newValue, min);
		}

		if (objectId && property) {
			// Use property controller for immediate update
			propertyController?.updateProperty(objectId, property, newValue, 'input');
		} else if (onchange) {
			// Legacy handler - update target value to constrained value
			if (type === 'number' && typeof newValue === 'number') {
				target.value = String(newValue);
			}
			onchange(event);
		} else {
			// Direct value update
			value = newValue;
		}
	}

	function handleInput(event: Event) {
		const target = event.target as HTMLInputElement;

		// Update internal state for real-time display feedback
		inputValue = type === 'number' ? parseFloat(target.value) : target.value;

		// Only call legacy handler if provided (no PropertyController updates on input)
		if (oninput) {
			oninput(event);
		}
	}

	function handleBlur(event: FocusEvent) {
		const target = event.target as HTMLInputElement;
		let newValue = type === 'number' ? parseFloat(String(inputValue)) : inputValue;

		// Skip NaN values for number inputs
		if (type === 'number' && isNaN(newValue)) {
			// Reset to original value or 0 for mixed values
			inputValue = (value === '' || value === undefined) ? 0 : value;
			if (target) target.value = String(inputValue);
			return;
		}

		// Apply constraints for number inputs
		if (type === 'number' && typeof newValue === 'number') {
			if (max !== undefined) newValue = Math.min(newValue, max);
			if (min !== undefined) newValue = Math.max(newValue, min);
			// Update input display and bound value to constrained value
			inputValue = newValue;
			value = newValue;
			if (target) target.value = String(newValue);
		}

		// Update through property controller if available
		if (objectId && property) {
			propertyController?.updateProperty(objectId, property, newValue, 'input');
		}
	}

	function handleInputFocus(event: FocusEvent) {
		const target = event.target as HTMLInputElement;

		// For mixed values (empty value with "Mixed" placeholder), clear field when focused
		if (value === '' && target.placeholder === 'Mixed') {
			target.value = '';
			inputValue = '';
		} else {
			target.select();
		}
	}

	function handleKeyDown(event: KeyboardEvent) {
		// Blur input field when Enter is pressed (this will trigger handleBlur to submit value)
		if (event.key === 'Enter') {
			const target = event.target as HTMLInputElement;
			target.blur();
		}
	}

	// Arrow button interaction state
	let isDragging = false;
	let dragStartTimeout: NodeJS.Timeout | null = null;
	let startY = 0;
	let startValue = 0;
	let currentDragValue = 0; // Track the final dragged value
	let dragDirection: 'up' | 'down' | null = null;
	// Capture objectId and property at drag start to prevent switching objects mid-drag
	let dragObjectId: string | undefined = undefined;
	let dragProperty: PropertyPath | undefined = undefined;

	function getNumericValue(): number {
		if (typeof value === 'number') return value;
		if (typeof value === 'string' && value === '') return 0; // Default for mixed values (now empty string)
		const parsed = parseFloat(String(value));
		return isNaN(parsed) ? 0 : parsed;
	}

	function startArrowInteraction(event: MouseEvent, direction: 'up' | 'down') {
		if (type !== 'number') return;

		// Capture the current objectId, property, and starting value immediately
		// This prevents reactive updates from changing what we're dragging
		dragObjectId = objectId;
		dragProperty = property;
		const capturedStartValue = getNumericValue();

		// Start a timeout to distinguish between click and drag
		dragStartTimeout = setTimeout(() => {
			// This is a drag operation
			isDragging = true;
			dragDirection = direction;
			startY = event.clientY;
			startValue = capturedStartValue; // Use the captured value
			currentDragValue = capturedStartValue; // Initialize current drag value
			document.addEventListener('mousemove', handleDrag);
			document.addEventListener('mouseup', stopArrowInteraction);
			document.addEventListener('mouseleave', stopArrowInteraction);
			event.preventDefault();
		}, 150); // 150ms delay to distinguish click from drag

		// Set up mouseup to handle both click and drag end
		document.addEventListener('mouseup', stopArrowInteraction);
	}

	function stopArrowInteraction(event: MouseEvent) {
		// Clear the timeout if it hasn't fired yet (this was a click)
		if (dragStartTimeout) {
			clearTimeout(dragStartTimeout);
			dragStartTimeout = null;

			// This was a click - perform single step increment/decrement
			if (!isDragging) {
				if (dragDirection === 'up') {
					handleIncrease();
				} else if (dragDirection === 'down') {
					handleDecrease();
				}
			}
		}

		// Clean up drag state
		if (isDragging) {
			isDragging = false;
			document.removeEventListener('mousemove', handleDrag);

			// Apply final validated update when drag stops - use captured objectId/property
			if (dragObjectId && dragProperty) {
				propertyController?.updateProperty(dragObjectId, dragProperty, currentDragValue, 'input');
			} else if (onchange) {
				// For non-property-controller inputs (like settings), call onchange callback
				// Create a synthetic event with the final drag value
				const syntheticEvent = new Event('change', { bubbles: true });
				Object.defineProperty(syntheticEvent, 'target', {
					writable: false,
					value: { value: String(currentDragValue) }
				});
				onchange(syntheticEvent);
			}
		}

		document.removeEventListener('mouseup', stopArrowInteraction);
		document.removeEventListener('mouseleave', stopArrowInteraction);
		dragDirection = null;
		// Clear captured values
		dragObjectId = undefined;
		dragProperty = undefined;
	}

	function handleDrag(event: MouseEvent) {
		if (!isDragging) return;

		const deltaY = startY - event.clientY; // Invert so dragging up increases value
		const stepValue = typeof step === 'number' ? step : (isOpacity ? 1 : 0.1);
		const sensitivity = isOpacity ? 0.4 : 4; // 10x faster for opacity (smaller divisor = faster)
		const rawValue = startValue + (deltaY / sensitivity) * stepValue;

		// Apply constraints during drag, especially for dimensions
		let constrainedValue = rawValue;
		if (property && property.startsWith('dimensions.')) {
			// Enforce minimum value for dimensions (cannot be 0 or negative)
			constrainedValue = Math.max(rawValue, 0.1);
		} else if (constraints) {
			// Apply general constraints if available from property controller
			if (constraints.min !== undefined) {
				constrainedValue = Math.max(constrainedValue, constraints.min);
			}
			if (constraints.max !== undefined) {
				constrainedValue = Math.min(constrainedValue, constraints.max);
			}
		}

		// Always apply min/max props if they exist (for bind:value usage without property controller)
		if (min !== undefined) {
			constrainedValue = Math.max(constrainedValue, min);
		}
		if (max !== undefined) {
			constrainedValue = Math.min(constrainedValue, max);
		}

		// Keep full precision for the actual value, but round display appropriately
		// Use integer rounding if step is 1 (for repeat counts), otherwise one decimal place
		const actualValue = stepValue === 1
			? Math.round(constrainedValue)
			: Math.round(constrainedValue * 10) / 10;
		const displayValue = actualValue;

		// Track the current dragged value for final update
		currentDragValue = actualValue;

		// Update input value immediately for visual feedback
		// This only updates the local input field, preventing UI flickering
		inputValue = displayValue;

		// Use captured objectId/property to prevent switching objects mid-drag
		if (dragObjectId && dragProperty) {
			// Throttled immediate update for smooth 3D scene feedback without UI flickering
			// Updates 3D scene directly without triggering UI property panel updates
			propertyController?.updatePropertyImmediate(dragObjectId, dragProperty, actualValue, 'drag');
		} else {
			// Fallback direct update with full precision
			value = actualValue;
		}
	}
</script>

<div class={cn('inline-input-container', className)}>
	<div class="relative flex items-center bg-[#212121]/50 rounded-md h-8 border border-[#2E2E2E]/50 focus-within:border-[#6b7280] transition-colors">
		<!-- Label -->
		<span class="modler-property-label px-1.5 py-1 flex-shrink-0">
			{label}
		</span>

		<!-- Input Field -->
		<input
			{id}
			{type}
			value={inputValue}
			{placeholder}
			{disabled}
			{step}
			{min}
			{max}
			oninput={handleInput}
			onchange={handleInputChange}
			onblur={handleBlur}
			onfocus={handleInputFocus}
			onkeydown={handleKeyDown}
			class="modler-input-value flex-1 bg-transparent border-none outline-none text-xs pl-0.5 py-1 min-w-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
			style="padding-right: {suffix ? '0' : '0.5rem'};"
			{...restProps}
		/>

		<!-- Suffix -->
		{#if suffix}
			<span class="text-xs text-muted-foreground pr-1 flex-shrink-0">{suffix}</span>
		{/if}

		<!-- Interactive Controls -->
		{#if showArrows && type === 'number'}
			<div class="flex flex-col border-l border-[#2E2E2E] flex-shrink-0" style="padding-left: 0.25rem; padding-right: 0.25rem;">
				<button
					type="button"
					tabindex="-1"
					onmousedown={(e) => startArrowInteraction(e, 'up')}
					class="flex items-center justify-center w-4 h-4 text-gray-400 hover:text-white transition-colors cursor-ns-resize group"
					disabled={disabled}
				>
					<ChevronUp class="w-3.5 h-3.5 transition-colors" strokeWidth={1.5} />
				</button>
				<button
					type="button"
					tabindex="-1"
					onmousedown={(e) => startArrowInteraction(e, 'down')}
					class="flex items-center justify-center w-4 h-4 text-gray-400 hover:text-white transition-colors cursor-ns-resize group"
					disabled={disabled}
				>
					<ChevronDown class="w-3.5 h-3.5 transition-colors" strokeWidth={1.5} />
				</button>
			</div>
		{/if}
	</div>
</div>

<style>
	.inline-input-container {
		@apply mb-2;
	}

	input:focus {
		outline: none !important;
	}
</style>