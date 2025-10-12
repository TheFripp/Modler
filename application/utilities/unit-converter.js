/**
 * UnitConverter - Dimensional Unit Conversion System
 *
 * INTERNAL STANDARD: All dimensional values stored in METERS
 * USER DISPLAY: Convert to user's preferred units at UI boundaries only
 *
 * Best Practices:
 * - Internal consistency (always meters)
 * - User flexibility (any unit preference)
 * - Performance (conversion only at UI boundaries)
 * - CAD-standard precision handling
 */

class UnitConverter {
    constructor() {
        // Internal standard unit is always meters
        this.INTERNAL_UNIT = 'meters';

        // Current user preference (default to meters)
        this.userUnit = 'm';

        // Conversion factors TO meters (internal standard)
        this.conversionToMeters = {
            // Metric
            'mm': 0.001,      // 1mm = 0.001m
            'cm': 0.01,       // 1cm = 0.01m
            'm': 1.0,         // 1m = 1m (identity)
            'km': 1000.0,     // 1km = 1000m

            // Imperial
            'in': 0.0254,     // 1in = 0.0254m
            'ft': 0.3048,     // 1ft = 0.3048m
            'yd': 0.9144,     // 1yd = 0.9144m

            // Engineering
            'mil': 0.0000254, // 1mil = 0.0000254m (1/1000 inch)
        };

        // Conversion factors FROM meters (for display)
        this.conversionFromMeters = {};
        Object.keys(this.conversionToMeters).forEach(unit => {
            this.conversionFromMeters[unit] = 1.0 / this.conversionToMeters[unit];
        });

        // Display precision per unit (decimal places)
        this.unitPrecision = {
            'mm': 1,    // 1.2 mm
            'cm': 1,    // 1.2 cm
            'm': 1,     // 1.2 m
            'km': 1,    // 1.2 km
            'in': 3,    // 1.234 in
            'ft': 3,    // 1.234 ft
            'yd': 3,    // 1.234 yd
            'mil': 0,   // 12 mil (whole numbers)
        };

        // Unit display names
        this.unitNames = {
            'mm': 'Millimeters',
            'cm': 'Centimeters',
            'm': 'Meters',
            'km': 'Kilometers',
            'in': 'Inches',
            'ft': 'Feet',
            'yd': 'Yards',
            'mil': 'Mils'
        };

        // Unit categories for UI organization
        this.unitCategories = {
            metric: ['mm', 'cm', 'm', 'km'],
            imperial: ['in', 'ft', 'yd'],
            engineering: ['mil']
        };
    }

    /**
     * Set user's preferred display unit
     * @param {string} unit - Unit code (mm, cm, m, in, ft, etc.)
     */
    setUserUnit(unit) {
        if (!this.conversionToMeters.hasOwnProperty(unit)) {
            console.warn(`UnitConverter: Unknown unit '${unit}', keeping current unit '${this.userUnit}'`);
            return false;
        }

        const oldUnit = this.userUnit;
        this.userUnit = unit;

        // Emit unit change event for UI updates
        if (window.modlerComponents?.objectEventBus) {
            window.modlerComponents.objectEventBus.emit('unit-preference-changed', {
                oldUnit,
                newUnit: unit
            });
        }

        return true;
    }

    /**
     * Get current user unit preference
     * @returns {string} Current unit code
     */
    getUserUnit() {
        return this.userUnit;
    }

    /**
     * Convert user input to internal meters
     * @param {number|string} value - Value in user's unit or mixed unit string
     * @param {string} [inputUnit] - Override unit (if not using current user unit)
     * @returns {number} Value in meters (internal standard)
     */
    toInternalUnits(value, inputUnit = null) {
        const unit = inputUnit || this.userUnit;

        // Handle mixed unit inputs (e.g., "10ft 6in")
        if (typeof value === 'string') {
            const mixedValue = this.parseMixedUnits(value);
            if (mixedValue !== null) {
                return mixedValue; // Already converted to meters
            }

            // Parse as simple number
            value = parseFloat(value);
        }

        if (typeof value !== 'number' || isNaN(value)) {
            console.warn(`UnitConverter: Invalid value '${value}' for conversion`);
            return 0;
        }

        const conversionFactor = this.conversionToMeters[unit];
        if (!conversionFactor) {
            console.warn(`UnitConverter: Unknown unit '${unit}' for conversion`);
            return value; // Return as-is if unknown unit
        }

        return value * conversionFactor;
    }

    /**
     * Convert internal meters to user's display unit
     * @param {number} metersValue - Value in meters (internal)
     * @param {string} [outputUnit] - Override unit (if not using current user unit)
     * @param {boolean} [formatted] - Return formatted string with unit suffix
     * @returns {number|string} Value in user's unit, optionally formatted
     */
    fromInternalUnits(metersValue, outputUnit = null, formatted = false) {
        const unit = outputUnit || this.userUnit;

        if (typeof metersValue !== 'number' || isNaN(metersValue)) {
            console.warn(`UnitConverter: Invalid meters value '${metersValue}' for conversion`);
            return formatted ? '0 ' + unit : 0;
        }

        const conversionFactor = this.conversionFromMeters[unit];
        if (!conversionFactor) {
            console.warn(`UnitConverter: Unknown unit '${unit}' for conversion`);
            return formatted ? `${metersValue} m` : metersValue;
        }

        const convertedValue = metersValue * conversionFactor;
        const precision = this.unitPrecision[unit] || 3;
        const roundedValue = Math.round(convertedValue * Math.pow(10, precision)) / Math.pow(10, precision);

        if (formatted) {
            return `${roundedValue} ${unit}`;
        }

        return roundedValue;
    }

    /**
     * Parse mixed unit inputs like "10ft 6in" or "1m 25cm"
     * @param {string} input - Mixed unit string
     * @returns {number|null} Value in meters, or null if not parseable
     */
    parseMixedUnits(input) {
        if (typeof input !== 'string') return null;

        // Remove extra whitespace
        input = input.trim();

        // Pattern for number + unit pairs
        const unitPattern = /(\d+(?:\.\d+)?)\s*([a-zA-Z]+)/g;
        const matches = [...input.matchAll(unitPattern)];

        if (matches.length === 0) return null;

        let totalMeters = 0;
        let hasValidUnit = false;

        for (const match of matches) {
            const value = parseFloat(match[1]);
            const unit = match[2].toLowerCase();

            if (this.conversionToMeters.hasOwnProperty(unit)) {
                totalMeters += value * this.conversionToMeters[unit];
                hasValidUnit = true;
            }
        }

        return hasValidUnit ? totalMeters : null;
    }

    /**
     * Get appropriate precision for current user unit
     * @param {string} [unit] - Override unit
     * @returns {number} Decimal places for display
     */
    getPrecision(unit = null) {
        return this.unitPrecision[unit || this.userUnit] || 3;
    }

    /**
     * Get display name for unit
     * @param {string} [unit] - Override unit
     * @returns {string} Human-readable unit name
     */
    getUnitName(unit = null) {
        return this.unitNames[unit || this.userUnit] || 'Unknown';
    }

    /**
     * Get all supported units organized by category
     * @returns {Object} Units organized by metric/imperial/engineering
     */
    getSupportedUnits() {
        return {
            categories: this.unitCategories,
            names: this.unitNames,
            precision: this.unitPrecision
        };
    }

    /**
     * Check if a unit is supported
     * @param {string} unit - Unit code to check
     * @returns {boolean} True if supported
     */
    isValidUnit(unit) {
        return this.conversionToMeters.hasOwnProperty(unit);
    }

    /**
     * Convert between any two units directly
     * @param {number} value - Value to convert
     * @param {string} fromUnit - Source unit
     * @param {string} toUnit - Target unit
     * @returns {number} Converted value
     */
    convert(value, fromUnit, toUnit) {
        if (fromUnit === toUnit) return value;

        // Convert to meters first, then to target unit
        const metersValue = this.toInternalUnits(value, fromUnit);
        return this.fromInternalUnits(metersValue, toUnit);
    }

    /**
     * Get formatted value with appropriate precision and unit suffix
     * @param {number} metersValue - Internal value in meters
     * @param {string} [unit] - Override display unit
     * @returns {string} Formatted value with unit (e.g., "1.23 cm")
     */
    formatValue(metersValue, unit = null) {
        return this.fromInternalUnits(metersValue, unit, true);
    }

    /**
     * Load user preferences from storage
     */
    loadUserPreferences() {
        try {
            const stored = localStorage.getItem('modler-unit-preference');

            // If no stored preference, initialize with current default
            if (!stored) {
                this.saveUserPreferences();
                return;
            }

            // Only load stored preference if it's valid
            if (this.isValidUnit(stored)) {
                this.setUserUnit(stored);
            } else {
                // Invalid stored value, reset to default
                console.warn(`UnitConverter: Invalid stored unit '${stored}', resetting to '${this.userUnit}'`);
                this.saveUserPreferences();
            }
        } catch (error) {
            console.warn('UnitConverter: Failed to load user preferences:', error);
        }
    }

    /**
     * Save user preferences to storage
     */
    saveUserPreferences() {
        try {
            localStorage.setItem('modler-unit-preference', this.userUnit);
        } catch (error) {
            console.warn('UnitConverter: Failed to save user preferences:', error);
        }
    }
}

// Export singleton instance
const unitConverter = new UnitConverter();

// One-time migration: Reset cached 'mm' to new default 'm'
// This ensures users with old cached values get the new default
try {
    const stored = localStorage.getItem('modler-unit-preference');
    if (stored === 'mm') {
        localStorage.setItem('modler-unit-preference', 'm');
        console.log('UnitConverter: Migrated unit preference from mm to m');
    }
} catch (error) {
    console.warn('UnitConverter: Migration check failed:', error);
}

// Load user preferences on startup
unitConverter.loadUserPreferences();

// Auto-save preferences when changed
window.addEventListener('beforeunload', () => {
    unitConverter.saveUserPreferences();
});

// Make available globally
window.UnitConverter = UnitConverter;
window.unitConverter = unitConverter;

// Register with modlerComponents if available
if (window.modlerComponents) {
    window.modlerComponents.unitConverter = unitConverter;
}