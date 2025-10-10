/**
 * PropertyFormatConverter - Centralized Property Format Conversion
 *
 * SOLVES: Multiple format inconsistencies between UI and 3D scene
 * - Color format: "8947848" → "#8947848"
 * - Units: User input → Internal meters
 * - Types: String/number/boolean normalization
 * - Validation: ObjectDataFormat schema compliance
 *
 * INTEGRATION POINTS:
 * - UnitConverter for dimensional properties
 * - ObjectDataFormat for schema validation
 * - PropertyController for type constraints
 */

class PropertyFormatConverter {
    constructor() {
        // Get system references
        this.unitConverter = window.unitConverter;
        this.objectDataFormat = window.ObjectDataFormat;

        // Property type definitions based on ObjectDataFormat schema
        this.propertyTypes = {
            // Dimensional properties (require unit conversion)
            'position.x': 'dimension',
            'position.y': 'dimension',
            'position.z': 'dimension',
            'rotation.x': 'angle',
            'rotation.y': 'angle',
            'rotation.z': 'angle',
            'dimensions.x': 'dimension',
            'dimensions.y': 'dimension',
            'dimensions.z': 'dimension',
            'autoLayout.gap': 'dimension',
            'autoLayout.padding.width': 'dimension',
            'autoLayout.padding.height': 'dimension',
            'autoLayout.padding.depth': 'dimension',

            // Color properties
            'material.color': 'color',

            // Numeric properties (no unit conversion)
            'material.opacity': 'number',
            'scale.x': 'number',
            'scale.y': 'number',
            'scale.z': 'number',

            // Boolean properties
            'autoLayout.enabled': 'boolean',
            'material.transparent': 'boolean',
            'isContainer': 'boolean',
            'selected': 'boolean',
            'locked': 'boolean',
            'visible': 'boolean',

            // String properties
            'name': 'string',
            'type': 'string',
            'autoLayout.direction': 'string',
            'layoutMode': 'string',

            // Object properties (pass through as-is)
            'autoLayout.alignment': 'object',
            'autoLayout.reversed': 'boolean',

            // Tile mode properties
            'autoLayout.tileMode.repeat': 'number',
            'autoLayout.tileMode.enabled': 'boolean',
            'autoLayout.tileMode.sourceObjectId': 'string'
        };

        // Color format patterns
        this.colorPatterns = {
            hex6: /^#?([0-9A-Fa-f]{6})$/, // #rrggbb or rrggbb
            hex3: /^#?([0-9A-Fa-f]{3})$/, // #rgb or rgb
            rgb: /^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/,
            hsl: /^hsl\(\s*(\d+)\s*,\s*(\d+)%\s*,\s*(\d+)%\s*\)$/
        };

        // Initialize validation
        this.validateSystemIntegration();
    }

    /**
     * Validate that required systems are available
     * @private
     */
    validateSystemIntegration() {
        if (!this.unitConverter) {
            console.warn('PropertyFormatConverter: UnitConverter not available - unit conversion disabled');
        }
        if (!this.objectDataFormat) {
            console.warn('PropertyFormatConverter: ObjectDataFormat not available - schema validation disabled');
        }
    }

    /**
     * Convert user input to internal format
     * @param {string} property - Property path (e.g., "position.x", "material.color")
     * @param {any} value - User input value
     * @param {string} [inputUnit] - Override unit for dimensional properties
     * @returns {Object} { value: convertedValue, isValid: boolean, error?: string }
     */
    convertToInternal(property, value, inputUnit = null) {
        try {
            // Handle nested autoLayout object
            if (property === 'autoLayout' && typeof value === 'object' && value !== null) {
                return this.convertAutoLayoutToInternal(value);
            }

            const propertyType = this.propertyTypes[property] || 'unknown';

            switch (propertyType) {
                case 'dimension':
                    return this.convertDimensionToInternal(value, inputUnit);

                case 'angle':
                    return this.convertAngleToInternal(value);

                case 'color':
                    return this.convertColorToInternal(value);

                case 'number':
                    return this.convertNumberToInternal(value);

                case 'boolean':
                    return this.convertBooleanToInternal(value);

                case 'string':
                    return this.convertStringToInternal(value);

                case 'object':
                    // Pass objects through as-is (e.g., alignment)
                    return { value, isValid: true };

                default:
                    console.warn(`PropertyFormatConverter: Unknown property type for '${property}', treating as string`);
                    return this.convertStringToInternal(value);
            }

        } catch (error) {
            return {
                value: value,
                isValid: false,
                error: `Conversion failed: ${error.message}`
            };
        }
    }

    /**
     * Convert internal value to user display format
     * @param {string} property - Property path
     * @param {any} internalValue - Internal value (e.g., meters for dimensions)
     * @param {string} [outputUnit] - Override unit for dimensional properties
     * @param {boolean} [formatted] - Return formatted string
     * @returns {any} Value in user's preferred format
     */
    convertFromInternal(property, internalValue, outputUnit = null, formatted = false) {
        try {
            const propertyType = this.propertyTypes[property] || 'unknown';

            switch (propertyType) {
                case 'dimension':
                    return this.convertDimensionFromInternal(internalValue, outputUnit, formatted);

                case 'angle':
                    return this.convertAngleFromInternal(internalValue, formatted);

                case 'color':
                    return this.convertColorFromInternal(internalValue, formatted);

                case 'number':
                    return this.convertNumberFromInternal(internalValue, formatted);

                case 'boolean':
                    return this.convertBooleanFromInternal(internalValue, formatted);

                case 'string':
                    return this.convertStringFromInternal(internalValue, formatted);

                case 'object':
                    // Pass objects through as-is (e.g., alignment)
                    return internalValue;

                default:
                    return formatted ? String(internalValue) : internalValue;
            }

        } catch (error) {
            console.error(`PropertyFormatConverter: Display conversion failed for ${property}:`, error);
            return formatted ? String(internalValue) : internalValue;
        }
    }

    /**
     * Convert dimensional value to internal meters
     * @private
     */
    convertDimensionToInternal(value, inputUnit = null) {
        if (value === '' || value === null || value === undefined) {
            return { value: 0, isValid: true };
        }

        if (!this.unitConverter) {
            // Fallback: assume value is already in correct units
            const numValue = parseFloat(value);
            return {
                value: isNaN(numValue) ? 0 : numValue,
                isValid: !isNaN(numValue),
                error: isNaN(numValue) ? 'Invalid number' : undefined
            };
        }

        try {
            const metersValue = this.unitConverter.toInternalUnits(value, inputUnit);
            return {
                value: metersValue,
                isValid: typeof metersValue === 'number' && !isNaN(metersValue),
                error: (typeof metersValue !== 'number' || isNaN(metersValue)) ? 'Invalid dimensional value' : undefined
            };
        } catch (error) {
            return {
                value: 0,
                isValid: false,
                error: `Unit conversion failed: ${error.message}`
            };
        }
    }

    /**
     * Convert internal meters to user display format
     * @private
     */
    convertDimensionFromInternal(metersValue, outputUnit = null, formatted = false) {
        if (!this.unitConverter) {
            return formatted ? `${metersValue} m` : metersValue;
        }

        return this.unitConverter.fromInternalUnits(metersValue, outputUnit, formatted);
    }

    /**
     * Convert angle from degrees (UI) to radians (Three.js internal)
     * @private
     */
    convertAngleToInternal(value) {
        if (value === '' || value === null || value === undefined) {
            return { value: 0, isValid: true };
        }

        const numValue = parseFloat(value);
        if (isNaN(numValue)) {
            return {
                value: 0,
                isValid: false,
                error: 'Invalid angle value'
            };
        }

        // Convert degrees to radians for Three.js
        const radians = (numValue * Math.PI) / 180;
        return {
            value: radians,
            isValid: true
        };
    }

    /**
     * Convert angle from radians (Three.js internal) to degrees (UI display)
     * @private
     */
    convertAngleFromInternal(radianValue, formatted = false) {
        // Convert radians to degrees for display
        const degrees = (radianValue * 180) / Math.PI;
        const rounded = Math.round(degrees * 10) / 10; // 1 decimal place
        return formatted ? `${rounded}°` : rounded;
    }

    /**
     * Convert color to internal hex format
     * @private
     */
    convertColorToInternal(value) {
        if (!value) {
            return { value: '#888888', isValid: true }; // Default gray
        }

        const colorString = String(value).trim();

        // Check if already valid hex with #
        if (colorString.startsWith('#') && /^#([0-9A-Fa-f]{6})$/.test(colorString)) {
            return { value: colorString.toLowerCase(), isValid: true };
        }

        // Handle hex without # prefix (THE MAIN FIX for MaterialInput issue)
        const rawHexMatch = colorString.match(/^([0-9A-Fa-f]{6})$/);
        if (rawHexMatch) {
            const hexValue = '#' + rawHexMatch[1].toLowerCase();
            return { value: hexValue, isValid: true };
        }

        // Handle 3-digit hex
        const hex3Match = colorString.match(this.colorPatterns.hex3);
        if (hex3Match) {
            const hex = hex3Match[1];
            const expandedHex = '#' + hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
            return { value: expandedHex.toLowerCase(), isValid: true };
        }

        // Handle RGB format
        const rgbMatch = colorString.match(this.colorPatterns.rgb);
        if (rgbMatch) {
            const r = parseInt(rgbMatch[1]).toString(16).padStart(2, '0');
            const g = parseInt(rgbMatch[2]).toString(16).padStart(2, '0');
            const b = parseInt(rgbMatch[3]).toString(16).padStart(2, '0');
            return { value: '#' + r + g + b, isValid: true };
        }

        // Named colors (basic set)
        const namedColors = {
            'red': '#ff0000',
            'green': '#008000',
            'blue': '#0000ff',
            'yellow': '#ffff00',
            'cyan': '#00ffff',
            'magenta': '#ff00ff',
            'white': '#ffffff',
            'black': '#000000',
            'gray': '#808080',
            'grey': '#808080'
        };

        const lowerColor = colorString.toLowerCase();
        if (namedColors[lowerColor]) {
            return { value: namedColors[lowerColor], isValid: true };
        }

        return {
            value: '#888888', // Fallback to gray
            isValid: false,
            error: `Invalid color format: ${colorString}`
        };
    }

    /**
     * Convert internal hex color to display format
     * @private
     */
    convertColorFromInternal(hexValue, formatted = false) {
        // Internal is always hex with #, so just return as-is
        return hexValue || '#888888';
    }

    /**
     * Convert number to internal format
     * @private
     */
    convertNumberToInternal(value) {
        if (value === '' || value === null || value === undefined) {
            return { value: 0, isValid: true };
        }

        const numValue = parseFloat(value);
        return {
            value: isNaN(numValue) ? 0 : numValue,
            isValid: !isNaN(numValue),
            error: isNaN(numValue) ? 'Invalid number' : undefined
        };
    }

    /**
     * Convert internal number to display format
     * @private
     */
    convertNumberFromInternal(numValue, formatted = false) {
        if (typeof numValue !== 'number' || isNaN(numValue)) {
            return formatted ? '0' : 0;
        }

        // Round to reasonable precision for display
        const rounded = Math.round(numValue * 1000) / 1000;
        return formatted ? String(rounded) : rounded;
    }

    /**
     * Convert boolean to internal format
     * @private
     */
    convertBooleanToInternal(value) {
        if (typeof value === 'boolean') {
            return { value, isValid: true };
        }

        if (typeof value === 'string') {
            const lowerValue = value.toLowerCase().trim();
            if (lowerValue === 'true' || lowerValue === '1' || lowerValue === 'yes' || lowerValue === 'on') {
                return { value: true, isValid: true };
            }
            if (lowerValue === 'false' || lowerValue === '0' || lowerValue === 'no' || lowerValue === 'off' || lowerValue === '') {
                return { value: false, isValid: true };
            }
        }

        if (typeof value === 'number') {
            return { value: Boolean(value), isValid: true };
        }

        return {
            value: false,
            isValid: false,
            error: `Invalid boolean value: ${value}`
        };
    }

    /**
     * Convert internal boolean to display format
     * @private
     */
    convertBooleanFromInternal(boolValue, formatted = false) {
        return formatted ? String(Boolean(boolValue)) : Boolean(boolValue);
    }

    /**
     * Convert string to internal format
     * @private
     */
    convertStringToInternal(value) {
        if (value === null || value === undefined) {
            return { value: '', isValid: true };
        }

        return { value: String(value).trim(), isValid: true };
    }

    /**
     * Convert internal string to display format
     * @private
     */
    convertStringFromInternal(stringValue, formatted = false) {
        return stringValue || '';
    }

    /**
     * Convert nested autoLayout object to internal format
     * Handles: { enabled, direction, gap, padding: { width, height, depth } }
     * @private
     */
    convertAutoLayoutToInternal(autoLayoutObj) {
        const converted = {};
        const errors = [];

        for (const [key, val] of Object.entries(autoLayoutObj)) {
            if (key === 'padding' && typeof val === 'object' && val !== null) {
                // Handle nested padding object
                converted.padding = {};
                for (const [side, sideVal] of Object.entries(val)) {
                    const result = this.convertToInternal(`autoLayout.padding.${side}`, sideVal);
                    converted.padding[side] = result.value;
                    if (!result.isValid) {
                        errors.push(`autoLayout.padding.${side}: ${result.error}`);
                    }
                }
            } else {
                // Handle simple properties: enabled, direction, gap
                const result = this.convertToInternal(`autoLayout.${key}`, val);
                converted[key] = result.value;
                if (!result.isValid) {
                    errors.push(`autoLayout.${key}: ${result.error}`);
                }
            }
        }

        return {
            value: converted,
            isValid: errors.length === 0,
            error: errors.length > 0 ? errors.join('; ') : undefined
        };
    }

    /**
     * Batch convert multiple properties for updateProperty operations
     * @param {Object} propertyUpdates - Object with property: value pairs
     * @returns {Object} { convertedUpdates: Object, errors: Array, isValid: boolean }
     */
    convertBatchToInternal(propertyUpdates) {
        const convertedUpdates = {};
        const errors = [];
        let allValid = true;

        Object.entries(propertyUpdates).forEach(([property, value]) => {
            const result = this.convertToInternal(property, value);

            if (result.isValid) {
                convertedUpdates[property] = result.value;
            } else {
                errors.push({ property, error: result.error || 'Conversion failed' });
                convertedUpdates[property] = result.value; // Include fallback value
                allValid = false;
            }
        });

        return {
            convertedUpdates,
            errors,
            isValid: allValid
        };
    }

    /**
     * Get property type for validation
     * @param {string} property - Property path
     * @returns {string} Property type
     */
    getPropertyType(property) {
        return this.propertyTypes[property] || 'unknown';
    }

    /**
     * Check if property requires unit conversion
     * @param {string} property - Property path
     * @returns {boolean} True if dimensional property
     */
    isDimensionalProperty(property) {
        return this.propertyTypes[property] === 'dimension';
    }

    /**
     * Get current user unit for dimensional properties
     * @returns {string} Current unit code
     */
    getCurrentUnit() {
        return this.unitConverter ? this.unitConverter.getUserUnit() : 'm';
    }

    /**
     * Validate converted value against ObjectDataFormat schema
     * @param {string} property - Property path
     * @param {any} value - Converted value
     * @returns {Object} { isValid: boolean, error?: string }
     */
    validateAgainstSchema(property, value) {
        if (!this.objectDataFormat) {
            return { isValid: true }; // Skip validation if schema not available
        }

        // Create a minimal object for validation
        const testObject = this.createTestObjectForProperty(property, value);

        const validation = this.objectDataFormat.validateObjectData(testObject);

        if (validation.isValid) {
            return { isValid: true };
        }

        // Find errors related to this specific property
        const relevantErrors = validation.errors.filter(error =>
            error.includes(property) || error.includes(property.split('.')[0])
        );

        return {
            isValid: relevantErrors.length === 0,
            error: relevantErrors.length > 0 ? relevantErrors[0] : 'Schema validation failed'
        };
    }

    /**
     * Create test object for schema validation
     * @private
     */
    createTestObjectForProperty(property, value) {
        const testObject = {
            id: 'test',
            name: 'Test Object',
            type: 'object',
            position: { x: 0, y: 0, z: 0 },
            rotation: { x: 0, y: 0, z: 0 },
            dimensions: { x: 1, y: 1, z: 1 },
            material: { color: '#888888', opacity: 1, transparent: false }
        };

        // Set the specific property value
        const parts = property.split('.');
        let current = testObject;

        for (let i = 0; i < parts.length - 1; i++) {
            if (!current[parts[i]]) {
                current[parts[i]] = {};
            }
            current = current[parts[i]];
        }

        current[parts[parts.length - 1]] = value;

        return testObject;
    }
}

// Export singleton instance
const propertyFormatConverter = new PropertyFormatConverter();

// Make available globally
window.PropertyFormatConverter = PropertyFormatConverter;
window.propertyFormatConverter = propertyFormatConverter;

// Register with modlerComponents if available
if (window.modlerComponents) {
    window.modlerComponents.propertyFormatConverter = propertyFormatConverter;
}