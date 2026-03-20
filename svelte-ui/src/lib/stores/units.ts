import { writable, derived, get } from 'svelte/store';

export type Unit = 'm' | 'cm' | 'mm' | 'in' | 'ft' | 'yd' | 'mil';

// Current user-selected unit
export const currentUnit = writable<Unit>('m');

// Unit converter instance (will be set when available)
let converterInstance: any = null;

// Initialize unit converter when available
if (typeof window !== 'undefined') {
	// Wait for UnitConverter to be available
	const checkConverter = () => {
		if ((window as any).unitConverter) {
			converterInstance = (window as any).unitConverter;
			// Sync initial state
			currentUnit.set(converterInstance.getUserUnit());
		} else {
			// Retry in case it's not loaded yet
			setTimeout(checkConverter, 100);
		}
	};
	checkConverter();

	// Listen for unit changes from settings panel
	window.addEventListener('unit-changed', ((event: CustomEvent) => {
		currentUnit.set(event.detail.unit);
	}) as EventListener);
}

/**
 * Convert internal meters value to display value in current unit
 */
export function toDisplayValue(metersValue: number, unit?: Unit): number {
	if (!converterInstance) {
		// Try to get it from window if not cached
		if (typeof window !== 'undefined' && (window as any).unitConverter) {
			converterInstance = (window as any).unitConverter;
		} else {
			return parseFloat(metersValue.toFixed(1));
		}
	}
	const targetUnit = unit || get(currentUnit);
	const convertedValue = converterInstance.fromInternalUnits(metersValue, targetUnit, false);
	const precision = converterInstance.getPrecision(targetUnit);

	// CRITICAL: Use toFixed to ensure exact decimal places, then parse to number
	// This prevents floating point artifacts like 1.2000000476837158
	const fixed = convertedValue.toFixed(precision);
	return parseFloat(fixed);
}

/**
 * Convert user input value to internal meters
 */
export function toInternalValue(displayValue: number, unit?: Unit): number {
	if (!converterInstance) {
		// Try to get it from window if not cached
		if (typeof window !== 'undefined' && (window as any).unitConverter) {
			converterInstance = (window as any).unitConverter;
		} else {
			return displayValue;
		}
	}
	const sourceUnit = unit || get(currentUnit);
	return converterInstance.toInternalUnits(displayValue, sourceUnit);
}

/**
 * Get precision for current unit
 */
export function getUnitPrecision(unit?: Unit): number {
	if (!converterInstance) {
		// Try to get it from window if not cached
		if (typeof window !== 'undefined' && (window as any).unitConverter) {
			converterInstance = (window as any).unitConverter;
		} else {
			return 1;
		}
	}
	return converterInstance.getPrecision(unit || get(currentUnit));
}

/**
 * Get step value for current unit
 */
export function getUnitStep(unit?: Unit): number {
	const precision = getUnitPrecision(unit);
	return Math.pow(10, -precision);
}

// Derived store for current unit's precision
export const unitPrecision = derived(currentUnit, ($currentUnit) => {
	return getUnitPrecision($currentUnit);
});

// Derived store for current unit's step
export const unitStep = derived(currentUnit, ($currentUnit) => {
	return getUnitStep($currentUnit);
});
