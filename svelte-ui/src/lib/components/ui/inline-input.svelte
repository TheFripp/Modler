<script lang="ts">
	import { cn } from '$lib/utils';
	import { propertyController, type PropertyPath } from '$lib/services/property-controller';

	interface Props {
		label: string;
		value?: string | number;
		type?: string;
		placeholder?: string;
		disabled?: boolean;
		class?: string;
		id?: string;
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
		objectId,
		property,
		// Legacy handlers
		oninput,
		onchange,
		onIncrease,
		onDecrease,
		...restProps
	}: Props = $props();

	// Get constraints from property controller
	const constraints = property && propertyController ? propertyController?.getConstraints(property) : null;
	const step = constraints?.step || 0.1;
	const min = constraints?.min;
	const max = constraints?.max;
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
			const stepValue = typeof step === 'number' ? step : 0.1;
			const newValue = Math.round((currentValue + stepValue) * 10) / 10;
			propertyController?.updateProperty(objectId, property, newValue, 'button');
		} else if (type === 'number') {
			// Fallback for non-property-controller usage
			const currentValue = getNumericValue();
			const stepValue = typeof step === 'number' ? step : 0.1;
			value = Math.round((currentValue + stepValue) * 10) / 10;
		}
	}

	function handleDecrease() {
		if (onDecrease) {
			// Legacy handler
			onDecrease();
		} else if (objectId && property) {
			// Use property controller - handles mixed values automatically
			const currentValue = getNumericValue();
			const stepValue = typeof step === 'number' ? step : 0.1;
			const newValue = Math.round((currentValue - stepValue) * 10) / 10;
			propertyController?.updateProperty(objectId, property, newValue, 'button');
		} else if (type === 'number') {
			// Fallback for non-property-controller usage
			const currentValue = getNumericValue();
			const stepValue = typeof step === 'number' ? step : 0.1;
			value = Math.round((currentValue - stepValue) * 10) / 10;
		}
	}

	function handleInputChange(event: Event) {
		const target = event.target as HTMLInputElement;
		const newValue = type === 'number' ? parseFloat(target.value) : target.value;

		if (objectId && property) {
			// Use property controller for immediate update
			propertyController?.updateProperty(objectId, property, newValue, 'input');
		} else if (onchange) {
			// Legacy handler
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
		// Ensure property controller gets the final value on blur (only place where updates happen)
		if (objectId && property) {
			const newValue = type === 'number' ? parseFloat(String(inputValue)) : inputValue;

			// Skip NaN values for number inputs
			if (type === 'number' && isNaN(newValue)) {
				// Reset to original value or 0 for mixed values
				inputValue = (value === '' || value === undefined) ? 0 : value;
			} else {
				// Always update on blur regardless of whether value changed (handles mixed→single transitions)
				propertyController?.updateProperty(objectId, property, newValue, 'input');
			}
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
		const stepValue = typeof step === 'number' ? step : 0.1;
		const sensitivity = 4; // Improved sensitivity for smoother dragging
		const rawValue = startValue + (deltaY / sensitivity) * stepValue;

		// Apply constraints during drag, especially for dimensions
		let constrainedValue = rawValue;
		if (property && property.startsWith('dimensions.')) {
			// Enforce minimum value for dimensions (cannot be 0 or negative)
			constrainedValue = Math.max(rawValue, 0.1);
		} else if (constraints) {
			// Apply general constraints if available
			if (constraints.min !== undefined) {
				constrainedValue = Math.max(constrainedValue, constraints.min);
			}
			if (constraints.max !== undefined) {
				constrainedValue = Math.min(constrainedValue, constraints.max);
			}
		}

		// Keep full precision for the actual value, but round display to 1 decimal
		const actualValue = constrainedValue;
		const displayValue = Math.round(constrainedValue * 10) / 10;

		// Track the current dragged value for final update
		currentDragValue = actualValue;

		// Update input value immediately for visual feedback (1 decimal for display)
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
		<span class="text-xs text-muted-foreground px-1.5 py-1 flex-shrink-0">
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
			class="flex-1 bg-transparent border-none outline-none text-xs text-foreground pl-0.5 pr-1 py-1 min-w-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
			{...restProps}
		/>

		<!-- Interactive Controls -->
		{#if showArrows && type === 'number'}
			<div class="flex flex-col border-l border-[#2E2E2E] flex-shrink-0">
				<button
					type="button"
					tabindex="-1"
					onmousedown={(e) => startArrowInteraction(e, 'up')}
					class="flex items-center justify-center w-5 h-4 text-xs text-gray-400 hover:text-gray-200 hover:bg-[#171717] transition-colors cursor-ns-resize"
					disabled={disabled}
				>
					▲
				</button>
				<button
					type="button"
					tabindex="-1"
					onmousedown={(e) => startArrowInteraction(e, 'down')}
					class="flex items-center justify-center w-5 h-4 text-xs text-gray-400 hover:text-gray-200 hover:bg-[#171717] transition-colors cursor-ns-resize"
					disabled={disabled}
				>
					▼
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