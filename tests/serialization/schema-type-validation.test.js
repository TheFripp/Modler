/**
 * Schema-TypeScript Validation Test
 *
 * Validates that JavaScript schema (STANDARD_OBJECT_DATA_SCHEMA) matches
 * TypeScript interface (ObjectData) to prevent schema drift.
 *
 * Run: node tests/serialization/schema-type-validation.test.js
 */

// Simulated TypeScript interface structure (extracted from object-data.ts)
// This must be manually kept in sync with the TypeScript interface
const EXPECTED_TYPESCRIPT_INTERFACE = {
    // Core identification
    id: 'string',
    name: 'string',
    type: 'string',

    // Hierarchy
    parentContainer: 'string|null',
    childIds: 'array',

    // Transform (always nested objects)
    position: { x: 'number', y: 'number', z: 'number' },
    rotation: { x: 'number', y: 'number', z: 'number' },
    scale: { x: 'number', y: 'number', z: 'number' },

    // Physical properties
    dimensions: { x: 'number', y: 'number', z: 'number' },
    material: {
        color: 'string',
        opacity: 'number',
        transparent: 'boolean'
    },

    // Container properties
    isContainer: 'boolean',
    containerMode: 'string|null',
    isHug: 'boolean',
    layoutMode: 'string|null',
    autoLayout: {
        enabled: 'boolean',
        direction: 'string|null',
        gap: 'number',
        padding: 'object',
        alignment: 'object|undefined',
        reversed: 'boolean|undefined',
        tileMode: 'object|undefined'
    },
    calculatedGap: 'number|undefined',
    layoutProperties: 'object|undefined',

    // State flags
    selected: 'boolean',
    locked: 'boolean',
    visible: 'boolean',

    // Metadata
    formatVersion: 'string',
    lastModified: 'number',

    // Optional properties (from TypeScript interface)
    // These are intentionally NOT in schema because they're optional
    // parametric: 'optional',
    // instance: 'optional',
    // master: 'optional',
    // constraints: 'optional'
};

// Load the actual schema from object-data-format.js
const fs = require('fs');
const path = require('path');

// Read and eval the object-data-format.js file to get the schema
const objectDataFormatPath = path.join(__dirname, '../../application/serialization/object-data-format.js');
const objectDataFormatContent = fs.readFileSync(objectDataFormatPath, 'utf8');

// Extract STANDARD_OBJECT_DATA_SCHEMA from the file
const schemaMatch = objectDataFormatContent.match(/const STANDARD_OBJECT_DATA_SCHEMA = (\{[\s\S]*?\n\});/);
if (!schemaMatch) {
    console.error('❌ Could not extract STANDARD_OBJECT_DATA_SCHEMA from object-data-format.js');
    process.exit(1);
}

// Parse the schema
const schemaCode = schemaMatch[1];
let ACTUAL_SCHEMA;
try {
    // Use eval to parse the schema object (safe in test environment)
    ACTUAL_SCHEMA = eval(`(${schemaCode})`);
} catch (error) {
    console.error('❌ Failed to parse STANDARD_OBJECT_DATA_SCHEMA:', error);
    process.exit(1);
}

// Validation functions

function compareSchemas(expected, actual, path = '') {
    const errors = [];

    // Check for missing properties in actual schema
    for (const key in expected) {
        if (!actual.hasOwnProperty(key)) {
            errors.push(`Missing property in schema: ${path}${key}`);
            continue;
        }

        const expectedType = expected[key];
        const actualType = actual[key];

        // If both are objects (nested structures), recurse
        if (typeof expectedType === 'object' && typeof actualType === 'object') {
            const nestedErrors = compareSchemas(expectedType, actualType, `${path}${key}.`);
            errors.push(...nestedErrors);
        } else if (expectedType !== actualType) {
            errors.push(`Type mismatch for ${path}${key}: expected "${expectedType}", got "${actualType}"`);
        }
    }

    // Check for extra properties in actual schema
    for (const key in actual) {
        if (!expected.hasOwnProperty(key)) {
            // No special cases needed — all properties should be in expected
            errors.push(`Extra property in schema (not in TypeScript): ${path}${key}`);
        }
    }

    return errors;
}

// Run validation
console.log('🔍 Schema-TypeScript Validation Test\n');
console.log('Comparing JavaScript schema with TypeScript interface...\n');

const errors = compareSchemas(EXPECTED_TYPESCRIPT_INTERFACE, ACTUAL_SCHEMA);

if (errors.length === 0) {
    console.log('✅ Schema and TypeScript interface are in sync!\n');
    console.log('All properties match correctly.');
    process.exit(0);
} else {
    console.log('❌ Schema drift detected!\n');
    console.log('The following mismatches were found:\n');
    errors.forEach(error => {
        console.log(`  - ${error}`);
    });
    console.log('\n📖 To fix this:');
    console.log('  1. Update STANDARD_OBJECT_DATA_SCHEMA in /application/serialization/object-data-format.js');
    console.log('  2. Update ObjectData interface in /svelte-ui/src/lib/types/object-data.ts');
    console.log('  3. Update EXPECTED_TYPESCRIPT_INTERFACE in this test file');
    console.log('  4. See /documentation/SCHEMA_UPDATE_GUIDE.md for details\n');
    process.exit(1);
}
