import { writable, derived, get } from 'svelte/store';

export type Unit = 'm' | 'cm' | 'mm' | 'in' | 'ft' | 'yd' | 'mil';

// Current user-selected unit
export const currentUnit = writable<Unit>('m');

// Conversion factors TO meters — must match UnitConverter in unit-converter.js
const CONVERSION_TO_METERS: Record<Unit, number> = {
	mm: 0.001,
	cm: 0.01,
	m: 1.0,
	in: 0.0254,
	ft: 0.3048,
	yd: 0.9144,
	mil: 0.0000254
};

// Display precision per unit (decimal places) — must match UnitConverter
const UNIT_PRECISION: Record<Unit, number> = {
	mm: 0,   // integer — "25 mm"
	cm: 1,   // "12.5 cm"
	m: 1,    // "1.2 m"
	in: 3,   // "1.234 in"
	ft: 3,   // "1.234 ft"
	yd: 3,   // "1.094 yd"
	mil: 0   // integer — "984 mil"
};

// Sync currentUnit from main window (iframes get unit changes via postMessage)
if (typeof window !== 'undefined') {
	// If in an iframe, request current unit from main window
	if (window.parent && window.parent !== window) {
		window.parent.postMessage({ type: 'get-unit-settings' }, '*');
	}

	// Listen for unit changes from settings panel (same-window CustomEvent)
	window.addEventListener('unit-changed', ((event: CustomEvent) => {
		currentUnit.set(event.detail.unit);
	}) as EventListener);

	// Listen for unit changes via postMessage (cross-iframe from main window)
	window.addEventListener('message', (event: MessageEvent) => {
		if (event.data?.type === 'unit-changed' && event.data?.data?.unit) {
			currentUnit.set(event.data.data.unit);
		}
		// Handle initial unit response from main window
		if (event.data?.type === 'unit-settings-response' && event.data?.settings?.currentUnit) {
			currentUnit.set(event.data.settings.currentUnit);
		}
	});
}

/**
 * Convert internal meters value to display value in current unit
 */
export function toDisplayValue(metersValue: number, unit?: Unit): number {
	const targetUnit = unit || get(currentUnit);
	const factor = CONVERSION_TO_METERS[targetUnit];
	if (!factor) return parseFloat(metersValue.toFixed(1));

	const convertedValue = metersValue / factor;
	const precision = UNIT_PRECISION[targetUnit] ?? 1;
	return parseFloat(convertedValue.toFixed(precision));
}

/**
 * Convert user input value to internal meters
 */
export function toInternalValue(displayValue: number, unit?: Unit): number {
	const sourceUnit = unit || get(currentUnit);
	const factor = CONVERSION_TO_METERS[sourceUnit];
	if (!factor) return displayValue;

	return displayValue * factor;
}

/**
 * Get precision for current unit
 */
export function getUnitPrecision(unit?: Unit): number {
	return UNIT_PRECISION[unit || get(currentUnit)] ?? 1;
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
