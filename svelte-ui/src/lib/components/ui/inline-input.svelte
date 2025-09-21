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
	const constraints = property ? propertyController.getConstraints(property) : null;
	const step = constraints?.step || 0.1;
	const min = constraints?.min;
	const max = constraints?.max;
	const showArrows = type === 'number';

	// Internal state for the input field
	let inputValue = $state(value);

	// Update internal state when external value changes
	$effect(() => {
		inputValue = value;
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
			propertyController.updateProperty(objectId, property, newValue, 'button');
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
			propertyController.updateProperty(objectId, property, newValue, 'button');
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
			propertyController.updateProperty(objectId, property, newValue, 'input');
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

		// Clear "Mix" placeholder when user starts typing
		if (target.value !== '' && value === 'Mix') {
			// User is replacing mixed value - clear the field first
			inputValue = '';
		}

		inputValue = type === 'number' ? parseFloat(target.value) : target.value;

		// Real-time PropertyController updates for immediate feedback
		if (objectId && property && !oninput) {
			const newValue = type === 'number' ? parseFloat(target.value) : target.value;

			// Skip NaN values for number inputs during typing
			if (type === 'number' && !isNaN(newValue)) {
				propertyController.updatePropertyDebounced(objectId, property, newValue, 'input', 100);
			} else if (type !== 'number') {
				propertyController.updatePropertyDebounced(objectId, property, newValue, 'input', 100);
			}
		}

		if (oninput) {
			// Legacy handler
			oninput(event);
		}
	}

	function handleBlur(event: FocusEvent) {
		// Ensure property controller gets the final value on blur
		if (objectId && property && inputValue !== value) {
			const newValue = type === 'number' ? parseFloat(String(inputValue)) : inputValue;

			// Skip NaN values for number inputs
			if (type === 'number' && isNaN(newValue)) {
				// Reset to original value or 0 for mixed values
				inputValue = value === 'Mix' ? 0 : value;
			} else {
				propertyController.updateProperty(objectId, property, newValue, 'input');
			}
		}
	}

	function handleInputFocus(event: FocusEvent) {
		const target = event.target as HTMLInputElement;

		// For mixed values, clear the field when focused to allow easy input
		if (value === 'Mix') {
			target.value = '';
			inputValue = '';
		} else {
			target.select();
		}
	}

	// Arrow button interaction state
	let isDragging = false;
	let dragStartTimeout: NodeJS.Timeout | null = null;
	let startY = 0;
	let startValue = 0;
	let dragDirection: 'up' | 'down' | null = null;

	function getNumericValue(): number {
		if (typeof value === 'number') return value;
		if (typeof value === 'string' && value === 'Mix') return 0; // Default for mixed values
		const parsed = parseFloat(String(value));
		return isNaN(parsed) ? 0 : parsed;
	}

	function startArrowInteraction(event: MouseEvent, direction: 'up' | 'down') {
		if (type !== 'number') return;

		// Start a timeout to distinguish between click and drag
		dragStartTimeout = setTimeout(() => {
			// This is a drag operation
			isDragging = true;
			dragDirection = direction;
			startY = event.clientY;
			startValue = getNumericValue();
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

			// Flush any pending updates immediately when drag stops
			if (objectId && property) {
				propertyController.flushPendingUpdates();
			}
		}

		document.removeEventListener('mouseup', stopArrowInteraction);
		document.removeEventListener('mouseleave', stopArrowInteraction);
		dragDirection = null;
	}

	function handleDrag(event: MouseEvent) {
		if (!isDragging) return;

		const deltaY = startY - event.clientY; // Invert so dragging up increases value
		const stepValue = typeof step === 'number' ? step : 0.1;
		const sensitivity = 2; // Adjust sensitivity
		const newValue = startValue + (deltaY / sensitivity) * stepValue;

		if (objectId && property) {
			// Use property controller for debounced updates during drag
			propertyController.updatePropertyDebounced(objectId, property, newValue, 'drag', 50);
		} else {
			// Fallback direct update
			value = newValue;
		}
	}
</script>

<div class={cn('inline-input-container', className)}>
	<div class="relative flex items-center bg-accent rounded-md h-8 border border-transparent focus-within:border-primary transition-colors">
		<!-- Label -->
		<span class="text-xs text-muted-foreground px-2 py-1 flex-shrink-0 min-w-0 truncate">
			{label}
		</span>

		<!-- Input Field -->
		<input
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
			class="flex-1 bg-transparent border-none outline-none text-xs text-foreground px-1 py-1 w-12 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
			{...restProps}
		/>

		<!-- Interactive Controls -->
		{#if showArrows && type === 'number'}
			<div class="flex flex-col border-l border-[#242424]">
				<button
					type="button"
					onmousedown={(e) => startArrowInteraction(e, 'up')}
					class="flex items-center justify-center w-5 h-3 text-xs text-gray-400 hover:text-gray-200 hover:bg-gray-800 transition-colors cursor-ns-resize"
					disabled={disabled}
				>
					▲
				</button>
				<button
					type="button"
					onmousedown={(e) => startArrowInteraction(e, 'down')}
					class="flex items-center justify-center w-5 h-3 text-xs text-gray-400 hover:text-gray-200 hover:bg-gray-800 transition-colors cursor-ns-resize"
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