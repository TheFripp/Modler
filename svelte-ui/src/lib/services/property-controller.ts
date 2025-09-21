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
	| `sizingMode`
	| `autoLayout.enabled`
	| `autoLayout.direction`
	| `autoLayout.gap`
	| `autoLayout.padding.top`
	| `autoLayout.padding.bottom`
	| `autoLayout.padding.left`
	| `autoLayout.padding.right`
	| `autoLayout.padding.front`
	| `autoLayout.padding.back`;

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
	private pendingUpdates = new Map<string, any>();
	private updateTimeouts = new Map<string, NodeJS.Timeout>();
	private constraints = new Map<PropertyPath, PropertyConstraints>();

	// Event store for property changes
	public propertyChanges: Writable<PropertyChangeEvent | null> = writable(null);

	constructor() {
		this.setupConstraints();
	}

	private setupConstraints() {
		// Position constraints
		this.constraints.set('position.x', { step: 0.1 });
		this.constraints.set('position.y', { step: 0.1 });
		this.constraints.set('position.z', { step: 0.1 });

		// Rotation constraints
		this.constraints.set('rotation.x', { step: 1, min: -180, max: 180 });
		this.constraints.set('rotation.y', { step: 1, min: -180, max: 180 });
		this.constraints.set('rotation.z', { step: 1, min: -180, max: 180 });

		// Dimension constraints
		this.constraints.set('dimensions.x', { step: 0.1, min: 0.1 });
		this.constraints.set('dimensions.y', { step: 0.1, min: 0.1 });
		this.constraints.set('dimensions.z', { step: 0.1, min: 0.1 });

		// Material constraints
		this.constraints.set('material.color', { type: 'color' });
		this.constraints.set('material.opacity', { step: 0.1, min: 0, max: 1 });

		// Container constraints
		this.constraints.set('direction', {
			type: 'string',
			allowedValues: ['x', 'y', 'z']
		});
		this.constraints.set('sizingMode', {
			type: 'string',
			allowedValues: ['hug', 'fixed']
		});

		// Auto Layout constraints
		this.constraints.set('autoLayout.enabled', { type: 'boolean' });
		this.constraints.set('autoLayout.direction', {
			type: 'string',
			allowedValues: ['x', 'y', 'z']
		});
		this.constraints.set('autoLayout.gap', { step: 0.1, min: 0 });

		// Padding constraints
		this.constraints.set('autoLayout.padding.top', { step: 0.1, min: 0 });
		this.constraints.set('autoLayout.padding.bottom', { step: 0.1, min: 0 });
		this.constraints.set('autoLayout.padding.left', { step: 0.1, min: 0 });
		this.constraints.set('autoLayout.padding.right', { step: 0.1, min: 0 });
		this.constraints.set('autoLayout.padding.front', { step: 0.1, min: 0 });
		this.constraints.set('autoLayout.padding.back', { step: 0.1, min: 0 });
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
	 * Validate a property value against constraints
	 */
	private validateValue(property: PropertyPath, value: any): { valid: boolean; value: any; error?: string } {
		const constraints = this.constraints.get(property);
		if (!constraints) return { valid: true, value };

		// Type validation
		if (constraints.type === 'number' && typeof value !== 'number') {
			const numValue = parseFloat(value);
			if (isNaN(numValue)) {
				return { valid: false, value, error: 'Invalid number' };
			}
			value = numValue;
		}

		// Range validation
		if (typeof value === 'number') {
			if (constraints.min !== undefined && value < constraints.min) {
				value = constraints.min;
			}
			if (constraints.max !== undefined && value > constraints.max) {
				value = constraints.max;
			}

			// Step rounding
			if (constraints.step) {
				value = Math.round(value / constraints.step) * constraints.step;
				// Round to avoid floating point precision issues
				value = Math.round(value * 1000) / 1000;
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
	 * Update property with debouncing (for continuous changes like dragging)
	 */
	updatePropertyDebounced(
		objectId: string,
		property: PropertyPath,
		value: any,
		source: PropertyChangeEvent['source'] = 'drag',
		delay: number = 150
	): boolean {
		const oldValue = this.getCurrentValue(objectId, property);
		const validation = this.validateValue(property, value);

		if (!validation.valid) {
			console.warn(`Property validation failed for ${property}:`, validation.error);
			return false;
		}

		const key = `${objectId}.${property}`;

		// Store the pending update
		this.pendingUpdates.set(key, validation.value);

		// Clear existing timeout
		const existingTimeout = this.updateTimeouts.get(key);
		if (existingTimeout) {
			clearTimeout(existingTimeout);
		}

		// Set new timeout
		const timeout = setTimeout(() => {
			const pendingValue = this.pendingUpdates.get(key);
			if (pendingValue !== undefined) {
				updateThreeJSProperty(objectId, property, pendingValue, source);

				// Emit property change event
				this.propertyChanges.set({
					objectId,
					property,
					value: pendingValue,
					oldValue,
					source
				});

				this.pendingUpdates.delete(key);
				this.updateTimeouts.delete(key);
			}
		}, delay);

		this.updateTimeouts.set(key, timeout);
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
	 * Flush all pending debounced updates immediately
	 */
	flushPendingUpdates(): void {
		for (const [key, timeout] of this.updateTimeouts.entries()) {
			clearTimeout(timeout);
			const pendingValue = this.pendingUpdates.get(key);
			if (pendingValue !== undefined) {
				const [objectId, property] = key.split('.', 2) as [string, PropertyPath];
				updateThreeJSProperty(objectId, property, pendingValue, 'flush');
			}
		}

		this.pendingUpdates.clear();
		this.updateTimeouts.clear();
	}

	/**
	 * Clean up resources
	 */
	destroy(): void {
		this.flushPendingUpdates();
		this.propertyChanges.set(null);
	}
}

// Global singleton instance
export const propertyController = new PropertyController();