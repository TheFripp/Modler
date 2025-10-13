/**
 * Custom ESLint Rules for Modler V2
 *
 * Enforces architectural patterns:
 * - No direct mesh.position/rotation/scale assignments
 * - No direct geometry vertex manipulation
 * - Require ObjectStateManager.updateObject() for state changes
 *
 * Part of: Phase 7 - Event System Audit
 * Version: 1.0.0
 */

module.exports = {
    env: {
        browser: true,
        es2021: true
    },
    extends: 'eslint:recommended',
    parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module'
    },
    rules: {
        // Warn on direct mesh property assignments
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
    },
    overrides: [
        {
            // Whitelist legitimate files
            files: [
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
                '**/panel-communication.js'
            ],
            rules: {
                'no-restricted-syntax': 'off'
            }
        }
    ]
};
