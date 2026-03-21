/**
 * ESLint Flat Config for Modler V2
 *
 * Enforces architectural patterns:
 * - No direct mesh.position/rotation/scale assignments
 * - No direct geometry vertex manipulation
 * - Require ObjectStateManager.updateObject() for state changes
 *
 * Migrated from .eslintrc-modler-custom.js to flat config (ESLint 10+)
 */

import globals from 'globals';

/** Files that legitimately need direct mesh/geometry/postMessage access */
const whitelistedFiles = [
    '**/scene-controller.js',
    '**/scene-lifecycle-manager.js',
    '**/scene-layout-manager.js',
    '**/scene-hierarchy-manager.js',
    '**/scene-deserializer.js',
    '**/visualization-resource-pool.js',
    '**/geometry-utils.js',
    '**/create-object-command.js',
    '**/push-face-command.js',
    '**/update-layout-property-command.js',
    '**/layout-engine.js',
    '**/axis-gizmo.js',
    '**/snap-visualizer.js',
    '**/container-visualizer.js',
    '**/main-adapter.js',
    '**/communication-bridge.js',
    '**/panel-communication.js',
    '**/box-creation-tool.js',
    '**/layout-geometry.js',
    '**/measurement-tool.js',
    '**/camera-controller.js',
    '**/object-visualizer.js',
    '**/support-mesh-factory.js',
    '**/visual-effects.js'
];

export default [
    // Main config for all JS files
    {
        files: ['**/*.js'],
        ignores: ['node_modules/**', 'svelte-ui/**', '**/*.config.js'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: {
                ...globals.browser,
                ...globals.es2021,
                THREE: 'readonly'
            }
        },
        rules: {
            'no-restricted-syntax': [
                'error',
                {
                    selector: 'AssignmentExpression[left.object.property.name=/^(position|rotation|scale)$/][left.property.name=/^(x|y|z)$/]',
                    message: 'Direct mesh.position/rotation/scale assignment detected. Use ObjectStateManager.updateObject() instead.'
                },
                {
                    selector: 'CallExpression[callee.object.property.name=/^(position|rotation|scale)$/][callee.property.name="set"]',
                    message: 'Direct mesh.position/rotation/scale.set() detected. Use ObjectStateManager.updateObject() instead.'
                },
                {
                    selector: 'AssignmentExpression[left.object.object.property.name="attributes"][left.object.property.name="position"][left.property.name="array"]',
                    message: 'Direct geometry vertex manipulation detected. Use GeometryUtils.updateGeometry() instead.'
                },
                {
                    selector: 'CallExpression[callee.object.name="window"][callee.property.name="postMessage"]',
                    message: 'Direct window.postMessage() detected. Use MainAdapter or CommunicationBridge instead.'
                }
            ]
        }
    },
    // Whitelist: disable architectural rules for legitimate low-level files
    {
        files: whitelistedFiles,
        rules: {
            'no-restricted-syntax': 'off'
        }
    }
];
