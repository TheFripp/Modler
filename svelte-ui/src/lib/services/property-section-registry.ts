/**
 * Property Section Registry
 * Maps object types to their property panel sections
 * Enables modular, reusable property UI components
 */

export type SectionType =
	| 'transform'
	| 'material'
	| 'layout';

export interface SectionFeatures {
	[key: string]: boolean | string | number | any;
}

export interface SectionConfig {
	type: SectionType;
	props?: Record<string, any>;
	features?: SectionFeatures; // Optional feature flags for section customization
}

export interface ObjectTypeConfig {
	sections: SectionConfig[];
}

class PropertySectionRegistry {
	private registry = new Map<string, ObjectTypeConfig>();

	/**
	 * Register property sections for an object type
	 */
	register(objectType: string, sections: SectionConfig[]): void {
		this.registry.set(objectType, { sections });
	}

	/**
	 * Get sections for an object type
	 */
	getSections(objectType: string): SectionConfig[] {
		const config = this.registry.get(objectType);
		return config?.sections || [];
	}

	/**
	 * Check if object type has a specific section
	 */
	hasSection(objectType: string, sectionType: SectionType): boolean {
		const sections = this.getSections(objectType);
		return sections.some(s => s.type === sectionType);
	}

	/**
	 * Get all registered object types
	 */
	getRegisteredTypes(): string[] {
		return Array.from(this.registry.keys());
	}
}

// Singleton instance
export const propertySectionRegistry = new PropertySectionRegistry();

// Default registrations with feature flags
propertySectionRegistry.register('box', [
	{
		type: 'transform',
		features: {
			position: false,
			rotation: true,
			dimensions: true
		}
	},
	{ type: 'material' }
]);

propertySectionRegistry.register('container', [
	{
		type: 'transform',
		features: {
			position: false,
			rotation: true,
			dimensions: true
		}
	},
	{ type: 'layout' }
]);

// Note: 'tiled-container' is no longer a separate type.
// Containers always show Layout. Modifiers (like Tile) are detected
// dynamically by PropertyPanel and append additional sections.

propertySectionRegistry.register('multi', [
	{
		type: 'transform',
		features: {
			position: false,
			rotation: true,
			dimensions: true
		}
	},
	{ type: 'material' }
]);
