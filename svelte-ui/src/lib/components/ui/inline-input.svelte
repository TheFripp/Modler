<script lang="ts">
	import { cn } from '$lib/utils';
	import { propertyController, type PropertyPath } from '$lib/services/property-controller';
	import { dragScrub } from '$lib/actions/drag-scrub';

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
		// Fill button props
		showFillButton?: boolean;
		fillActive?: boolean;
		fillTitle?: string;
		onFillToggle?: () => void;
		onFillHover?: (hovering: boolean) => void;
		// Lock button props (yard dimension locking)
		showLockButton?: boolean;
		lockActive?: boolean;
		onLockToggle?: () => void;
		// Unit conversion function (optional - for dimensional properties)
		convertToInternal?: (displayValue: number, axis?: string) => number;
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
		// Fill button
		showFillButton = false,
		fillActive = false,
		fillTitle = '',
		onFillToggle,
		onFillHover,
		// Lock button
		showLockButton = false,
		lockActive = false,
		onLockToggle,
		// Unit conversion
		convertToInternal,
		...restProps
	}: Props = $props();

	// Check if this is an opacity field (should display as integer)
	const isOpacity = label?.toLowerCase().includes('opacity');

	// Get constraints from property controller or restProps
	const constraints = property && propertyController ? propertyController?.getConstraints(property) : null;
	const step = constraints?.step || (restProps as any).step || (isOpacity ? 1 : 0.1);
	const min = constraints?.min ?? (restProps as any).min ?? (isOpacity ? 0 : undefined);
	const max = constraints?.max ?? (restProps as any).max ?? (isOpacity ? 100 : undefined);
	const isNumeric = type === 'number';

	// Internal state for the input field
	let inputValue = $state(value);

	// Update internal state when external value changes (but not during drag)
	let isDragging = false;
	// Dedup flag: prevents blur from re-sending after change already sent
	let _justCommitted = $state(false);
	$effect(() => {
		if (!isDragging) {
			inputValue = value;
		}
	});

	// --- Drag-to-scrub integration ---
	// Capture objectId and property at drag start to prevent switching objects mid-drag
	let dragObjectId: string | undefined = undefined;
	let dragProperty: PropertyPath | undefined = undefined;

	function getNumericValue(): number {
		if (typeof value === 'number') return value;
		if (typeof value === 'string' && value === '') return 0;
		const parsed = parseFloat(String(value));
		return isNaN(parsed) ? 0 : parsed;
	}

	function getScrubMin(): number | undefined {
		// Enforce minimum for dimensions
		if (property && property.startsWith('dimensions.')) {
			const propMin = min ?? 0.1;
			return typeof propMin === 'number' ? Math.max(propMin, 0.1) : 0.1;
		}
		if (constraints?.min !== undefined) {
			return min !== undefined ? Math.max(constraints.min, min) : constraints.min;
		}
		return min;
	}

	function handleScrubStart() {
		isDragging = true;
		dragObjectId = objectId;
		dragProperty = property;
	}

	function handleScrub(scrubValue: number) {
		// Display rounded value in input field for clean UI
		const stepValue = typeof step === 'number' ? step : (isOpacity ? 1 : 0.1);
		const displayValue = stepValue >= 1
			? Math.round(scrubValue)
			: Math.round(scrubValue * 10) / 10;

		inputValue = displayValue;

		// Send full-precision value to 3D scene for smooth movement
		if (dragObjectId && dragProperty) {
			const internalValue = convertToInternal && typeof scrubValue === 'number'
				? convertToInternal(scrubValue)
				: scrubValue;
			propertyController?.updatePropertyImmediate(dragObjectId, dragProperty, internalValue, 'drag');
		} else {
			value = scrubValue;
		}
	}

	function handleScrubEnd(finalValue: number) {
		isDragging = false;

		if (dragObjectId && dragProperty) {
			const internalValue = convertToInternal && typeof finalValue === 'number'
				? convertToInternal(finalValue)
				: finalValue;
			propertyController?.updateProperty(dragObjectId, dragProperty, internalValue, 'input');
		} else if (onchange) {
			const syntheticEvent = new Event('change', { bubbles: true });
			Object.defineProperty(syntheticEvent, 'target', {
				writable: false,
				value: { value: String(finalValue) }
			});
			onchange(syntheticEvent);
		}

		dragObjectId = undefined;
		dragProperty = undefined;
	}

	// --- Input event handlers ---

	function handleInputChange(event: Event) {
		const target = event.target as HTMLInputElement;
		let newValue = type === 'number' ? parseFloat(target.value) : target.value;

		if (type === 'number' && typeof newValue === 'number' && !isNaN(newValue)) {
			if (max !== undefined) newValue = Math.min(newValue, max);
			if (min !== undefined) newValue = Math.max(newValue, min);
		}

		if (objectId && property) {
			const internalValue = convertToInternal && typeof newValue === 'number'
				? convertToInternal(newValue)
				: newValue;
			propertyController?.updateProperty(objectId, property, internalValue, 'input');
			_justCommitted = true;
		} else if (onchange) {
			if (type === 'number' && typeof newValue === 'number') {
				target.value = String(newValue);
			}
			onchange(event);
		} else {
			value = newValue;
		}
	}

	function handleInput(event: Event) {
		const target = event.target as HTMLInputElement;
		inputValue = type === 'number' ? parseFloat(target.value) : target.value;

		if (oninput) {
			oninput(event);
		}
	}

	function handleBlur(event: FocusEvent) {
		const target = event.target as HTMLInputElement;
		let newValue = type === 'number' ? parseFloat(String(inputValue)) : inputValue;

		if (type === 'number' && isNaN(newValue)) {
			inputValue = (value === '' || value === undefined) ? 0 : value;
			if (target) target.value = String(inputValue);
			return;
		}

		if (type === 'number' && typeof newValue === 'number') {
			if (max !== undefined) newValue = Math.min(newValue, max);
			if (min !== undefined) newValue = Math.max(newValue, min);
			inputValue = newValue;
			value = newValue;
			if (target) target.value = String(newValue);
		}

		if (objectId && property) {
			if (_justCommitted) {
				_justCommitted = false;
				return;
			}
			const internalValue = convertToInternal && typeof newValue === 'number'
				? convertToInternal(newValue)
				: newValue;
			propertyController?.updateProperty(objectId, property, internalValue, 'input');

			if (window.inputFocusManager) {
				window.inputFocusManager.recordUIEdit(objectId, property);
			}
		}
	}

	function handleInputFocus(event: FocusEvent) {
		_justCommitted = false;
		const target = event.target as HTMLInputElement;
		if (value === '' && target.placeholder === 'Mixed') {
			target.value = '';
			inputValue = '';
		} else {
			target.select();
		}
	}

	function handleKeyDown(event: KeyboardEvent) {
		if (event.key === 'Enter') {
			const target = event.target as HTMLInputElement;
			target.blur();
			if (objectId && property && window.inputFocusManager) {
				window.inputFocusManager.recordUIEdit(objectId, property);
			}
		}
	}
</script>

<div class={cn('inline-input-container', className)}>
	<div
		class="relative flex items-center bg-[#212121]/50 rounded-md h-8 border border-[#2E2E2E]/50 focus-within:border-[#6b7280] transition-colors"
		use:dragScrub={isNumeric ? {
			value: getNumericValue(),
			step,
			min: getScrubMin(),
			max,
			sensitivity: isOpacity ? 0.4 : 4,
			onScrubStart: handleScrubStart,
			onScrub: handleScrub,
			onScrubEnd: handleScrubEnd,
			disabled
		} : { value: 0, disabled: true }}
	>
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
			<span class="text-xs text-muted-foreground pl-1 pr-1.5 flex-shrink-0">{suffix}</span>
		{/if}

		<!-- Lock Button (yard dimension locking) -->
		{#if showLockButton}
			<button
				type="button"
				tabindex="-1"
				class={cn(
					'w-5 h-full text-xs transition-colors flex-shrink-0 p-0 flex items-center justify-center border-l border-[#2E2E2E]',
					!showFillButton ? 'rounded-r-[4px]' : '',
					'hover:bg-[#212121]',
					lockActive
						? 'bg-[#212121] text-[#9b59b6]'
						: 'bg-[#171717] text-muted-foreground/40'
				)}
				title={lockActive ? 'Dimension locked (click to unlock)' : 'Dimension unlocked (click to lock)'}
				onclick={onLockToggle}
			>
				{#if lockActive}
					<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
				{:else}
					<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>
				{/if}
			</button>
		{/if}

		<!-- Fill Button -->
		{#if showFillButton}
			<button
				type="button"
				tabindex="-1"
				class={cn(
					'w-5 h-full text-xs font-medium transition-colors flex-shrink-0 p-0 flex items-center justify-center border-l border-[#2E2E2E]',
					'rounded-r-[4px]',
					'hover:bg-[#212121]',
					fillActive
						? 'bg-[#212121] text-[#5eead4]'
						: 'bg-[#171717] text-muted-foreground'
				)}
				title={fillTitle}
				onclick={onFillToggle}
				onmouseenter={() => onFillHover?.(true)}
				onmouseleave={() => onFillHover?.(false)}
				disabled={disabled}
			>
				F
			</button>
		{/if}
	</div>
</div>

<style>
	.inline-input-container {
		@apply mb-2;
	}

	input {
		cursor: inherit;
	}

	input:focus {
		cursor: text;
		outline: none !important;
	}
</style>
