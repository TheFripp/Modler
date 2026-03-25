import { writable, type Writable } from 'svelte/store';
import { selectedObject, updateThreeJSProperty } from '$lib/stores/modler';
import { get } from 'svelte/store';

export type PropertyPath =
	| `position.${keyof { x: number; y: number; z: number }}`
	| `rotation.${keyof { x: number; y: number; z: number }}`
	| `dimensions.${keyof { x: number; y: number; z: number }}`
	| `material.color`
	| `material.opacity`
	| `direction`
	| `autoLayout.enabled`
	| `autoLayout.direction`
	| `autoLayout.gap`
	| `autoLayout.padding.width`
	| `autoLayout.padding.height`
	| `autoLayout.padding.depth`
	| `autoLayout.tileMode.repeat`;

export interface PropertyConstraints {
	min?: number;
	max?: number;
	step?: number;
	type?: 'number' | 'string' | 'color';
	allowedValues?: string[];
}

export interface PropertyChangeEvent {
	objectId: string;
	property: PropertyPath;
	value: any;
	oldValue: any;
	source: 'input' | 'arrow' | 'drag' | 'scene';
}

class PropertyController {
	private updateTimeouts = new Map<string, NodeJS.Timeout>();
	private constraints = new Map<PropertyPath, PropertyConstraints>();

	// Event store for property changes
	public propertyChanges: Writable<PropertyChangeEvent | null> = writable(null);

	constructor() {
		this.setupConstraints();
	}

	private setupConstraints() {
		// Position constraints (no step — UI handles stepping via getUnitStep)
		this.constraints.set('position.x', {});
		this.constraints.set('position.y', {});
		this.constraints.set('position.z', {});

		// Rotation constraints - 1 degree step in radians, no min/max for continuous rotation
		const degreeInRadians = Math.PI / 180;
		this.constraints.set('rotation.x', { step: degreeInRadians });
		this.constraints.set('rotation.y', { step: degreeInRadians });
		this.constraints.set('rotation.z', { step: degreeInRadians });

		// Dimension constraints (no step — UI handles stepping; min 0.001m = 1mm)
		this.constraints.set('dimensions.x', { min: 0.001 });
		this.constraints.set('dimensions.y', { min: 0.001 });
		this.constraints.set('dimensions.z', { min: 0.001 });

		// Material constraints
		this.constraints.set('material.color', { type: 'color' });
		this.constraints.set('material.opacity', { step: 0.1, min: 0, max: 1 });

		// Container constraints
		this.constraints.set('direction', {
			type: 'string',
			allowedValues: ['x', 'y', 'z']
		});
		this.constraints.set('containerMode', {
			type: 'string',
			allowedValues: ['manual', 'layout', 'hug']
		});
		// Auto Layout constraints
		this.constraints.set('autoLayout.enabled', { type: 'boolean' });
		this.constraints.set('autoLayout.direction', {
			type: 'string',
			allowedValues: ['x', 'y', 'z']
		});
		this.constraints.set('autoLayout.gap', { min: 0 });

		// Padding constraints (no step — UI handles stepping via getUnitStep)
		this.constraints.set('autoLayout.padding.width', { min: 0 });
		this.constraints.set('autoLayout.padding.height', { min: 0 });
		this.constraints.set('autoLayout.padding.depth', { min: 0 });

		// Tile mode constraints
		this.constraints.set('autoLayout.tileMode.repeat', { step: 1, min: 2, max: 20 });
	}

	/**
	 * Get property constraints for validation and UI hints
	 */
	getConstraints(property: PropertyPath): PropertyConstraints | undefined {
		return this.constraints.get(property);
	}

	/**
	 * Get current value for a property path
	 */
	getCurrentValue(objectId: string, property: PropertyPath): any {
		const object = get(selectedObject);
		if (!object || object.id !== objectId) return undefined;

		const parts = property.split('.');
		let value: any = object;

		for (const part of parts) {
			value = value?.[part];
		}

		return value;
	}

	/**
	 * Validate a property value against constraints (min/max/step/type)
	 */
	private validateValue(property: PropertyPath, value: any, skipStepRounding: boolean = false): { valid: boolean; value: any; error?: string } {
		const constraints = this.constraints.get(property);
		if (!constraints) return { valid: true, value };

		// Range validation for numeric values
		if (typeof value === 'number') {
			if (constraints.min !== undefined && value < constraints.min) {
				value = constraints.min;
			}
			if (constraints.max !== undefined && value > constraints.max) {
				value = constraints.max;
			}

			// Step rounding - skip for drag operations to enable smooth movement
			if (constraints.step && !skipStepRounding) {
				value = Math.round(value / constraints.step) * constraints.step;
				// Round to avoid floating point precision issues
				value = Math.round(value * 1000) / 1000;
			} else if (typeof value === 'number') {
				// Still round to reasonable precision for non-stepped values
				value = Math.round(value * 10000) / 10000;
			}
		}

		// Allowed values validation
		if (constraints.allowedValues && !constraints.allowedValues.includes(value)) {
			return { valid: false, value, error: `Must be one of: ${constraints.allowedValues.join(', ')}` };
		}

		return { valid: true, value };
	}

	/**
	 * Update property with immediate application (for discrete changes)
	 */
	updateProperty(
		objectId: string,
		property: PropertyPath,
		value: any,
		source: PropertyChangeEvent['source'] = 'input'
	): boolean {
		// For multi-selection, delegate directly to updateThreeJSProperty which handles the multi-selection logic
		if (objectId === 'multi-selection') {
			updateThreeJSProperty(objectId, property, value, source);
			return true;
		}

		const oldValue = this.getCurrentValue(objectId, property);
		const validation = this.validateValue(property, value);

		if (!validation.valid) {
			console.warn(`PropertyController: Property validation failed for ${property}:`, validation.error);
			return false;
		}

		// Clear any pending debounced update for this property
		const key = `${objectId}.${property}`;
		const timeout = this.updateTimeouts.get(key);
		if (timeout) {
			clearTimeout(timeout);
			this.updateTimeouts.delete(key);
		}

		// Apply the update immediately
		updateThreeJSProperty(objectId, property, validation.value, source);

		// Emit property change event
		this.propertyChanges.set({
			objectId,
			property,
			value: validation.value,
			oldValue,
			source
		});

		return true;
	}

	/**
	 * Increment/decrement a numeric property by its step value
	 */
	incrementProperty(objectId: string, property: PropertyPath, direction: 1 | -1 = 1): boolean {
		const currentValue = this.getCurrentValue(objectId, property);
		if (typeof currentValue !== 'number') return false;

		const constraints = this.constraints.get(property);
		const step = constraints?.step || 0.1;
		const newValue = currentValue + (step * direction);

		return this.updateProperty(objectId, property, newValue, 'arrow');
	}

	/**
	 * Update property immediately during drag for real-time feedback
	 * Bypasses debouncing for smooth 60fps arrow drag operations
	 * Applies critical constraints (min/max) for safety
	 */
	updatePropertyImmediate(
		objectId: string,
		property: PropertyPath,
		value: any,
		source: PropertyChangeEvent['source'] = 'drag'
	): boolean {
		const oldValue = this.getCurrentValue(objectId, property);

		// Apply critical constraints during immediate updates for safety
		const constraints = this.constraints.get(property);
		let constrainedValue = value;

		if (constraints && typeof value === 'number') {
			// Apply min/max constraints for safety (especially dimensions)
			if (constraints.min !== undefined && value < constraints.min) {
				constrainedValue = constraints.min;
			}
			if (constraints.max !== undefined && value > constraints.max) {
				constrainedValue = constraints.max;
			}
			// Skip step rounding for smooth drag operations
		}

		// For multi-selection, delegate directly to updateThreeJSProperty
		if (objectId === 'multi-selection') {
			updateThreeJSProperty(objectId, property, constrainedValue, source);
			return true;
		}

		// Apply immediate update without debouncing
		updateThreeJSProperty(objectId, property, constrainedValue, source);

		// Emit property change event for immediate UI feedback
		this.propertyChanges.set({
			objectId,
			property,
			value: constrainedValue,
			oldValue,
			source
		});

		return true;
	}

	/**
	 * Clean up resources
	 */
	destroy(): void {
		this.propertyChanges.set(null);
	}
}

// Global singleton instance (browser only)
export const propertyController = typeof window !== 'undefined' ? new PropertyController() : null;
