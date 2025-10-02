/**
 * Schema Validation Test Suite
 *
 * Comprehensive tests for all schema validators:
 * - Message Protocol Schema
 * - Event Payload Schema
 * - Configuration Schema
 * - Command Metadata Schema
 *
 * Run: node tests/schemas/schema-validation.test.js
 */

// Load schemas
const fs = require('fs');
const path = require('path');

// Helper to load and eval JavaScript files
function loadSchema(filePath) {
    const code = fs.readFileSync(filePath, 'utf8');
    const context = {
        window: {},
        module: { exports: {} },
        exports: {}
    };

    // Create a function that executes in our context
    const func = new Function(...Object.keys(context), code);
    func(...Object.values(context));

    // Return what was exported
    return context.module.exports || context.window;
}

// Load all schemas
const messageProtocolPath = path.join(__dirname, '../../application/schemas/message-protocol-schema.js');
const eventPayloadPath = path.join(__dirname, '../../application/schemas/event-payload-schema.js');
const configurationPath = path.join(__dirname, '../../application/schemas/configuration-schema.js');
const commandMetadataPath = path.join(__dirname, '../../application/schemas/command-metadata-schema.js');

const messageProtocol = loadSchema(messageProtocolPath);
const eventPayload = loadSchema(eventPayloadPath);
const configuration = loadSchema(configurationPath);
const commandMetadata = loadSchema(commandMetadataPath);

// Test utilities
let testsRun = 0;
let testsPassed = 0;
let testsFailed = 0;

function test(name, fn) {
    testsRun++;
    try {
        fn();
        testsPassed++;
        console.log(`✅ ${name}`);
    } catch (error) {
        testsFailed++;
        console.error(`❌ ${name}`);
        console.error(`   ${error.message}`);
    }
}

function assertEquals(actual, expected, message = '') {
    if (actual !== expected) {
        throw new Error(`${message}\n  Expected: ${expected}\n  Actual: ${actual}`);
    }
}

function assertTrue(condition, message = '') {
    if (!condition) {
        throw new Error(message || 'Expected condition to be true');
    }
}

function assertFalse(condition, message = '') {
    if (condition) {
        throw new Error(message || 'Expected condition to be false');
    }
}

function assertArrayIncludes(array, value, message = '') {
    if (!array.includes(value)) {
        throw new Error(message || `Expected array to include ${value}`);
    }
}

// ===========================
// MESSAGE PROTOCOL SCHEMA TESTS
// ===========================

console.log('\n🧪 MESSAGE PROTOCOL SCHEMA TESTS\n');

test('MessageProtocolValidator: Validates valid property-update message', () => {
    const validator = new messageProtocol.MessageProtocolValidator();
    const result = validator.validate('property-update', {
        objectId: 'obj123',
        property: 'position.x',
        value: 10
    });

    assertTrue(result.isValid, 'Should be valid');
    assertEquals(result.errors.length, 0, 'Should have no errors');
});

test('MessageProtocolValidator: Rejects property-update with missing objectId', () => {
    const validator = new messageProtocol.MessageProtocolValidator();
    const result = validator.validate('property-update', {
        property: 'position.x',
        value: 10
    });

    assertFalse(result.isValid, 'Should be invalid');
    assertTrue(result.errors.length > 0, 'Should have errors');
});

test('MessageProtocolValidator: Rejects unknown message type', () => {
    const validator = new messageProtocol.MessageProtocolValidator();
    const result = validator.validate('invalid-message-type', {});

    assertFalse(result.isValid, 'Should be invalid');
    assertArrayIncludes(result.errors[0], 'Unknown message type', 'Should report unknown type');
});

test('MessageProtocolValidator: Validates nested schema in fill-button-states-response', () => {
    const validator = new messageProtocol.MessageProtocolValidator();
    const result = validator.validate('fill-button-states-response', {
        objectId: 'obj123',
        states: {
            x: true,
            y: false,
            z: true
        }
    });

    assertTrue(result.isValid, 'Should be valid');
});

test('MessageProtocolValidator: Gets expected response for request', () => {
    const validator = new messageProtocol.MessageProtocolValidator();
    const response = validator.getExpectedResponse('fill-button-check');

    assertEquals(response, 'fill-button-check-response', 'Should return correct response type');
});

// ===========================
// EVENT PAYLOAD SCHEMA TESTS
// ===========================

console.log('\n🧪 EVENT PAYLOAD SCHEMA TESTS\n');

test('EventPayloadValidator: Validates valid object:transform event', () => {
    const validator = new eventPayload.EventPayloadValidator();
    const result = validator.validate('object:transform', {
        position: { x: 1, y: 2, z: 3 }
    });

    assertTrue(result.isValid, 'Should be valid');
    assertEquals(result.preference, eventPayload.EVENT_PREFERENCES.THROTTLE, 'Should have throttle preference');
});

test('EventPayloadValidator: Validates object:lifecycle with required operation', () => {
    const validator = new eventPayload.EventPayloadValidator();
    const result = validator.validate('object:lifecycle', {
        operation: 'created',
        objectType: 'box'
    });

    assertTrue(result.isValid, 'Should be valid');
});

test('EventPayloadValidator: Rejects object:lifecycle without required operation', () => {
    const validator = new eventPayload.EventPayloadValidator();
    const result = validator.validate('object:lifecycle', {
        objectType: 'box'
    });

    assertFalse(result.isValid, 'Should be invalid');
    assertTrue(result.errors.length > 0, 'Should have errors');
});

test('EventPayloadValidator: Returns emission preference for event type', () => {
    const validator = new eventPayload.EventPayloadValidator();
    const preference = validator.getEmissionPreference('object:geometry');

    assertEquals(preference, eventPayload.EVENT_PREFERENCES.THROTTLE, 'Should have throttle preference');
});

test('EventPayloadValidator: Validates object:selection with nested schema', () => {
    const validator = new eventPayload.EventPayloadValidator();
    const result = validator.validate('object:selection', {
        selected: true,
        selectionContext: {
            isContainer: true,
            containerId: 'container123'
        }
    });

    assertTrue(result.isValid, 'Should be valid');
});

// ===========================
// CONFIGURATION SCHEMA TESTS
// ===========================

console.log('\n🧪 CONFIGURATION SCHEMA TESTS\n');

test('ConfigurationSchemaValidator: Validates valid color setting', () => {
    const validator = new configuration.ConfigurationSchemaValidator();
    const result = validator.validate('visual.selection.color', '#ff6600');

    assertTrue(result.isValid, 'Should be valid');
    assertEquals(result.coercedValue, '#ff6600', 'Should return same value');
});

test('ConfigurationSchemaValidator: Rejects invalid color format', () => {
    const validator = new configuration.ConfigurationSchemaValidator();
    const result = validator.validate('visual.selection.color', 'red');

    assertFalse(result.isValid, 'Should be invalid');
    assertArrayIncludes(result.errors[0], 'not a valid hex color', 'Should report color format error');
});

test('ConfigurationSchemaValidator: Validates min-max constraint', () => {
    const validator = new configuration.ConfigurationSchemaValidator();
    const result = validator.validate('visual.selection.lineWidth', 5);

    assertTrue(result.isValid, 'Should be valid');
});

test('ConfigurationSchemaValidator: Rejects value above max', () => {
    const validator = new configuration.ConfigurationSchemaValidator();
    const result = validator.validate('visual.selection.lineWidth', 15);

    assertFalse(result.isValid, 'Should be invalid');
    assertArrayIncludes(result.errors[0], 'above maximum', 'Should report max exceeded');
});

test('ConfigurationSchemaValidator: Validates range-0-1 constraint', () => {
    const validator = new configuration.ConfigurationSchemaValidator();
    const result = validator.validate('visual.selection.opacity', 0.8);

    assertTrue(result.isValid, 'Should be valid');
});

test('ConfigurationSchemaValidator: Rejects opacity > 1.0', () => {
    const validator = new configuration.ConfigurationSchemaValidator();
    const result = validator.validate('visual.selection.opacity', 1.5);

    assertFalse(result.isValid, 'Should be invalid');
    assertArrayIncludes(result.errors[0], 'between 0.0 and 1.0', 'Should report range error');
});

test('ConfigurationSchemaValidator: Coerces string numbers to number type', () => {
    const validator = new configuration.ConfigurationSchemaValidator();
    const result = validator.validate('visual.selection.lineWidth', '3');

    assertTrue(result.isValid, 'Should be valid after coercion');
    assertEquals(result.coercedValue, 3, 'Should coerce to number');
    assertEquals(typeof result.coercedValue, 'number', 'Should be number type');
});

test('ConfigurationSchemaValidator: Generates default config object', () => {
    const validator = new configuration.ConfigurationSchemaValidator();
    const defaultConfig = validator.generateDefaultConfig();

    assertTrue(defaultConfig.visual !== undefined, 'Should have visual config');
    assertEquals(defaultConfig.visual.selection.color, '#ff6600', 'Should have correct default');
});

// ===========================
// COMMAND METADATA SCHEMA TESTS
// ===========================

console.log('\n🧪 COMMAND METADATA SCHEMA TESTS\n');

test('CommandMetadataValidator: Validates create-object command', () => {
    const validator = new commandMetadata.CommandMetadataValidator();
    const result = validator.validate('create-object', {
        objectType: 'box',
        position: { x: 0, y: 0, z: 0 },
        dimensions: { x: 1, y: 1, z: 1 }
    });

    assertTrue(result.isValid, 'Should be valid');
    assertTrue(result.metadata.serializable, 'Should be serializable');
    assertTrue(result.metadata.undoable, 'Should be undoable');
});

test('CommandMetadataValidator: Rejects create-object without position', () => {
    const validator = new commandMetadata.CommandMetadataValidator();
    const result = validator.validate('create-object', {
        objectType: 'box',
        dimensions: { x: 1, y: 1, z: 1 }
    });

    assertFalse(result.isValid, 'Should be invalid');
    assertArrayIncludes(result.errors[0], 'Missing required parameter "position"', 'Should report missing position');
});

test('CommandMetadataValidator: Validates update-property command', () => {
    const validator = new commandMetadata.CommandMetadataValidator();
    const result = validator.validate('update-property', {
        objectId: 'obj123',
        property: 'position.x',
        oldValue: 5,
        newValue: 10
    });

    assertTrue(result.isValid, 'Should be valid');
});

test('CommandMetadataValidator: Serializes command', () => {
    const validator = new commandMetadata.CommandMetadataValidator();
    const serialized = validator.serialize('move-object', {
        objectId: 'obj123',
        oldPosition: { x: 0, y: 0, z: 0 },
        newPosition: { x: 5, y: 0, z: 0 }
    });

    assertTrue(serialized !== null, 'Should serialize successfully');
    assertEquals(serialized.type, 'move-object', 'Should have correct type');
    assertTrue(serialized.metadata.timestamp > 0, 'Should have timestamp');
});

test('CommandMetadataValidator: Deserializes command', () => {
    const validator = new commandMetadata.CommandMetadataValidator();
    const serialized = {
        type: 'update-property',
        params: {
            objectId: 'obj123',
            property: 'color',
            oldValue: '#ff0000',
            newValue: '#00ff00'
        },
        metadata: { timestamp: Date.now() }
    };

    const deserialized = validator.deserialize(serialized);

    assertTrue(deserialized !== null, 'Should deserialize successfully');
    assertEquals(deserialized.type, 'update-property', 'Should have correct type');
});

test('CommandMetadataValidator: Gets commands by category', () => {
    const validator = new commandMetadata.CommandMetadataValidator();
    const creationCommands = validator.getCommandsByCategory(commandMetadata.COMMAND_CATEGORIES.CREATION);

    assertTrue(creationCommands.length > 0, 'Should have creation commands');
    assertArrayIncludes(creationCommands, 'create-object', 'Should include create-object');
});

// ===========================
// CROSS-SCHEMA INTEGRATION TESTS
// ===========================

console.log('\n🧪 CROSS-SCHEMA INTEGRATION TESTS\n');

test('All schemas export validator classes', () => {
    assertTrue(typeof messageProtocol.MessageProtocolValidator === 'function', 'MessageProtocolValidator should be exported');
    assertTrue(typeof eventPayload.EventPayloadValidator === 'function', 'EventPayloadValidator should be exported');
    assertTrue(typeof configuration.ConfigurationSchemaValidator === 'function', 'ConfigurationSchemaValidator should be exported');
    assertTrue(typeof commandMetadata.CommandMetadataValidator === 'function', 'CommandMetadataValidator should be exported');
});

test('All schemas have schema objects', () => {
    assertTrue(typeof messageProtocol.MESSAGE_PROTOCOL_SCHEMA === 'object', 'Should export MESSAGE_PROTOCOL_SCHEMA');
    assertTrue(typeof eventPayload.EVENT_PAYLOAD_SCHEMA === 'object', 'Should export EVENT_PAYLOAD_SCHEMA');
    assertTrue(typeof configuration.CONFIGURATION_SCHEMA === 'object', 'Should export CONFIGURATION_SCHEMA');
    assertTrue(typeof commandMetadata.COMMAND_METADATA_SCHEMA === 'object', 'Should export COMMAND_METADATA_SCHEMA');
});

test('All validators track statistics', () => {
    const msgValidator = new messageProtocol.MessageProtocolValidator();
    msgValidator.validate('property-update', { objectId: 'test', property: 'test', value: 1 });
    const stats = msgValidator.getStats();

    assertTrue(stats.messagesValidated > 0, 'Should track validations');
    assertTrue(stats.validationSuccessRate !== undefined, 'Should calculate success rate');
});

test('All validators can generate documentation', () => {
    const msgValidator = new messageProtocol.MessageProtocolValidator();
    const eventValidator = new eventPayload.EventPayloadValidator();
    const configValidator = new configuration.ConfigurationSchemaValidator();
    const cmdValidator = new commandMetadata.CommandMetadataValidator();

    const msgDocs = msgValidator.generateDocumentation();
    const eventDocs = eventValidator.generateDocumentation();
    const configDocs = configValidator.generateDocumentation();
    const cmdDocs = cmdValidator.generateDocumentation();

    assertTrue(msgDocs.includes('# PostMessage Protocol Documentation'), 'Should generate message docs');
    assertTrue(eventDocs.includes('# ObjectEventBus Event Documentation'), 'Should generate event docs');
    assertTrue(configDocs.includes('# Configuration Schema Documentation'), 'Should generate config docs');
    assertTrue(cmdDocs.includes('# Command Pattern Documentation'), 'Should generate command docs');
});

// ===========================
// SUMMARY
// ===========================

console.log('\n' + '='.repeat(60));
console.log('TEST SUMMARY');
console.log('='.repeat(60));
console.log(`Total tests: ${testsRun}`);
console.log(`✅ Passed: ${testsPassed}`);
console.log(`❌ Failed: ${testsFailed}`);
console.log(`Success rate: ${((testsPassed / testsRun) * 100).toFixed(1)}%`);
console.log('='.repeat(60));

if (testsFailed === 0) {
    console.log('\n🎉 All schema validation tests passed!\n');
    process.exit(0);
} else {
    console.log(`\n⚠️  ${testsFailed} test(s) failed\n`);
    process.exit(1);
}
