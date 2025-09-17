# Component Template Manager Design

## Overview
The ComponentTemplateManager handles the creation, management, and synchronization of reusable component templates and their instances, enabling design system workflows with master-instance relationships and local override capabilities.

## Core Concepts

### Template Types
```javascript
const TemplateType = {
    COMPONENT: 'component',         // Reusable component (button, card, etc.)
    LAYOUT: 'layout',              // Layout pattern (grid, list, etc.)
    STRUCTURE: 'structure',        // Structural group (header, sidebar, etc.)
    SYMBOL: 'symbol'               // Atomic design element
};
```

### Instance State
```javascript
const InstanceState = {
    CONNECTED: 'connected',        // Receives updates from master
    OVERRIDDEN: 'overridden',      // Has local overrides but still connected
    DISCONNECTED: 'disconnected', // Fully independent from master
    BROKEN: 'broken'               // Master template no longer exists
};
```

### Override Type
```javascript
const OverrideType = {
    PROPERTY: 'property',          // Property value override
    STYLE: 'style',                // Visual style override
    CONTENT: 'content',            // Text/content override
    LAYOUT: 'layout',              // Layout configuration override
    HIERARCHY: 'hierarchy'         // Child structure override
};
```

### Sync Strategy
```javascript
const SyncStrategy = {
    IMMEDIATE: 'immediate',        // Update instances immediately
    MANUAL: 'manual',              // Update only when explicitly triggered
    SCHEDULED: 'scheduled',        // Update on next frame/batch
    CONDITIONAL: 'conditional'     // Update based on conditions
};
```

## Architecture Design

### ComponentTemplateManager Class
```javascript
class ComponentTemplateManager {
    constructor(sceneController, dependencyGraph, propertyUpdateHandler) {
        this.sceneController = sceneController;
        this.dependencyGraph = dependencyGraph;
        this.propertyUpdateHandler = propertyUpdateHandler;

        // Template storage
        this.templates = new Map(); // templateId → TemplateDefinition
        this.instances = new Map(); // instanceId → InstanceData
        this.templateInstances = new Map(); // templateId → Set<instanceId>

        // Override management
        this.overrides = new Map(); // instanceId → Map<property, OverrideData>
        this.conflictResolver = new OverrideConflictResolver();

        // Synchronization
        this.syncQueue = new PriorityQueue();
        this.syncStrategy = SyncStrategy.SCHEDULED;
        this.isSyncing = false;

        // Template library
        this.templateLibrary = new TemplateLibrary();
        this.templateValidator = new TemplateValidator();

        // Events and history
        this.eventEmitter = new EventEmitter();
        this.syncHistory = [];
        this.templateHistory = [];

        // Performance
        this.syncMetrics = {
            totalSyncs: 0,
            avgSyncTime: 0,
            failedSyncs: 0,
            instanceCount: 0
        };
    }
}
```

### TemplateDefinition Class
```javascript
class TemplateDefinition {
    constructor(name, type, rootObjectIds, metadata = {}) {
        this.id = this.generateId();
        this.name = name;
        this.type = type;
        this.version = 1;
        this.createdAt = Date.now();
        this.updatedAt = Date.now();

        // Template structure
        this.rootObjectIds = rootObjectIds; // Top-level objects in template
        this.objectGraph = null; // Full object hierarchy
        this.dependencies = []; // External dependencies

        // Template data
        this.snapshot = null; // Serialized template state
        this.schema = null; // Template property schema
        this.constraints = []; // Validation constraints

        // Instance management
        this.instances = new Set();
        this.defaultOverrides = new Map(); // Default overrideable properties
        this.protectedProperties = new Set(); // Properties that cannot be overridden

        // Metadata
        this.description = metadata.description || '';
        this.tags = metadata.tags || [];
        this.category = metadata.category || 'general';
        this.preview = metadata.preview || null; // Preview image/data

        // Configuration
        this.syncStrategy = metadata.syncStrategy || SyncStrategy.SCHEDULED;
        this.allowHierarchyOverrides = metadata.allowHierarchyOverrides || false;
        this.maxInstances = metadata.maxInstances || null;
    }

    generateId() {
        return `template_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
}
```

### InstanceData Class
```javascript
class InstanceData {
    constructor(templateId, instanceObjectIds, position = null) {
        this.id = this.generateId();
        this.templateId = templateId;
        this.version = 1; // Template version when instance was created
        this.state = InstanceState.CONNECTED;
        this.createdAt = Date.now();
        this.lastSyncAt = null;

        // Instance structure
        this.rootObjectIds = instanceObjectIds; // Root objects of this instance
        this.objectMapping = new Map(); // templateObjectId → instanceObjectId
        this.reverseMapping = new Map(); // instanceObjectId → templateObjectId

        // Override management
        this.overrides = new Map(); // property → OverrideData
        this.appliedOverrides = new Set(); // Currently applied override IDs
        this.pendingOverrides = new Map(); // Overrides waiting to be applied

        // Sync management
        this.lastSyncResult = null;
        this.syncErrors = [];
        this.skipNextSync = false;

        // Position and transform
        this.position = position;
        this.localTransform = { position: [0,0,0], rotation: [0,0,0], scale: [1,1,1] };

        // Metadata
        this.name = null; // Custom instance name
        this.tags = [];
        this.metadata = new Map();
    }

    generateId() {
        return `instance_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
}
```

### OverrideData Class
```javascript
class OverrideData {
    constructor(property, value, type = OverrideType.PROPERTY) {
        this.id = this.generateId();
        this.property = property;
        this.value = value;
        this.type = type;
        this.createdAt = Date.now();
        this.appliedAt = null;

        // Conflict resolution
        this.priority = 0; // Higher priority wins conflicts
        this.source = 'user'; // user, system, formula, etc.
        this.condition = null; // Conditional override

        // Sync behavior
        this.preserveOnSync = true; // Keep override during template sync
        this.mergeStrategy = 'override'; // override, merge, append

        // Validation
        this.isValid = true;
        this.validationErrors = [];
    }

    generateId() {
        return `override_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
}
```

## Core Operations

### 1. Create Template
```javascript
async createTemplate(selectedObjectIds, templateConfig) {
    try {
        // Validate selection
        const validationResult = await this.validateTemplateCreation(selectedObjectIds);
        if (!validationResult.isValid) {
            throw new TemplateCreationError(validationResult.errors.join(', '));
        }

        // Create template definition
        const template = new TemplateDefinition(
            templateConfig.name,
            templateConfig.type,
            selectedObjectIds,
            templateConfig.metadata
        );

        // Build object graph
        template.objectGraph = await this.buildObjectGraph(selectedObjectIds);

        // Create template snapshot
        template.snapshot = await this.createTemplateSnapshot(selectedObjectIds);

        // Extract template schema
        template.schema = await this.extractTemplateSchema(selectedObjectIds);

        // Set up default overrides
        this.setupDefaultOverrides(template, templateConfig.overrideableProperties);

        // Store template
        this.templates.set(template.id, template);
        this.templateInstances.set(template.id, new Set());

        // Add to template library
        await this.templateLibrary.addTemplate(template);

        // Notify listeners
        this.eventEmitter.emit('templateCreated', { templateId: template.id, template });

        return template.id;

    } catch (error) {
        console.error('Template creation failed:', error);
        throw error;
    }
}

async buildObjectGraph(rootObjectIds) {
    const graph = {
        nodes: new Map(), // objectId → object data
        edges: new Map(), // parentId → Set<childId>
        roots: new Set(rootObjectIds)
    };

    const processedObjects = new Set();
    const queue = [...rootObjectIds];

    while (queue.length > 0) {
        const objectId = queue.shift();
        if (processedObjects.has(objectId)) continue;

        const objectData = this.sceneController.getObject(objectId);
        if (!objectData) continue;

        // Add object to graph
        graph.nodes.set(objectId, this.serializeObject(objectData));
        processedObjects.add(objectId);

        // Find children and add to queue
        const children = this.sceneController.getObjectChildren(objectId);
        if (children.length > 0) {
            graph.edges.set(objectId, new Set(children.map(child => child.id)));
            queue.push(...children.map(child => child.id));
        }
    }

    return graph;
}

async createTemplateSnapshot(objectIds) {
    const snapshot = {
        version: 1,
        timestamp: Date.now(),
        objects: new Map(),
        relationships: [],
        dependencies: []
    };

    for (const objectId of objectIds) {
        const objectData = this.sceneController.getObject(objectId);
        if (objectData) {
            snapshot.objects.set(objectId, {
                ...this.serializeObject(objectData),
                templateRole: this.determineTemplateRole(objectData)
            });
        }
    }

    // Capture relationships
    snapshot.relationships = this.extractRelationships(objectIds);

    // Capture dependencies
    snapshot.dependencies = this.extractTemplateDependencies(objectIds);

    return snapshot;
}
```

### 2. Instantiate Template
```javascript
async instantiateTemplate(templateId, position = null, overrides = new Map()) {
    const template = this.templates.get(templateId);
    if (!template) {
        throw new Error(`Template not found: ${templateId}`);
    }

    try {
        // Create object instances
        const objectMapping = await this.createObjectInstances(template);

        // Create instance data
        const instance = new InstanceData(
            templateId,
            Array.from(objectMapping.values()).filter(objId =>
                template.rootObjectIds.includes(this.getTemplateObjectId(objId, objectMapping))
            ),
            position
        );

        instance.objectMapping = objectMapping;
        instance.reverseMapping = this.createReverseMapping(objectMapping);

        // Apply position if specified
        if (position) {
            await this.positionInstance(instance, position);
        }

        // Apply initial overrides
        for (const [property, value] of overrides) {
            await this.setInstanceOverride(instance.id, property, value);
        }

        // Register instance
        this.instances.set(instance.id, instance);
        this.templateInstances.get(templateId).add(instance.id);

        // Set up template-instance dependencies
        await this.setupInstanceDependencies(instance);

        // Notify listeners
        this.eventEmitter.emit('instanceCreated', {
            instanceId: instance.id,
            templateId,
            instance
        });

        return instance.id;

    } catch (error) {
        console.error('Template instantiation failed:', error);
        throw error;
    }
}

async createObjectInstances(template) {
    const objectMapping = new Map(); // templateObjectId → instanceObjectId
    const createdObjects = new Set();

    // Process objects in dependency order
    const sortedObjects = this.topologicalSort(template.objectGraph);

    for (const templateObjectId of sortedObjects) {
        const templateObjectData = template.snapshot.objects.get(templateObjectId);
        if (!templateObjectData) continue;

        // Create instance object
        const instanceObjectData = await this.createInstanceObject(
            templateObjectData,
            objectMapping
        );

        objectMapping.set(templateObjectId, instanceObjectData.id);
        createdObjects.add(instanceObjectData.id);
    }

    // Set up parent-child relationships
    await this.establishInstanceRelationships(template, objectMapping);

    return objectMapping;
}

async createInstanceObject(templateObjectData, existingMapping) {
    // Create geometry and material (deep copy)
    const geometry = this.cloneGeometry(templateObjectData.geometry);
    const material = this.cloneMaterial(templateObjectData.material);

    // Prepare object options
    const options = {
        ...templateObjectData.options,
        name: this.generateInstanceObjectName(templateObjectData.name),
        isTemplateInstance: true,
        templateObjectId: templateObjectData.id,
        templateRole: templateObjectData.templateRole
    };

    // Create object in scene
    const instanceObject = this.sceneController.addObject(geometry, material, options);

    // Copy properties from template
    await this.copyTemplateProperties(templateObjectData, instanceObject);

    return instanceObject;
}
```

### 3. Sync Template Updates
```javascript
async syncTemplateToInstances(templateId, changeSet = null) {
    const template = this.templates.get(templateId);
    if (!template) {
        throw new Error(`Template not found: ${templateId}`);
    }

    const instanceIds = this.templateInstances.get(templateId);
    if (!instanceIds || instanceIds.size === 0) {
        return { syncedInstances: 0, errors: [] };
    }

    const syncResults = {
        syncedInstances: 0,
        errors: [],
        conflicts: [],
        skippedInstances: []
    };

    for (const instanceId of instanceIds) {
        try {
            const instance = this.instances.get(instanceId);
            if (!instance || instance.state === InstanceState.DISCONNECTED) {
                syncResults.skippedInstances.push(instanceId);
                continue;
            }

            const syncResult = await this.syncSingleInstance(instance, template, changeSet);

            if (syncResult.success) {
                syncResults.syncedInstances++;
                instance.lastSyncAt = Date.now();
                instance.lastSyncResult = syncResult;
            }

            syncResults.conflicts.push(...syncResult.conflicts);

        } catch (error) {
            syncResults.errors.push({
                instanceId,
                error: error.message
            });
        }
    }

    // Update template version
    template.version++;
    template.updatedAt = Date.now();

    // Notify listeners
    this.eventEmitter.emit('templateSynced', {
        templateId,
        syncResults
    });

    return syncResults;
}

async syncSingleInstance(instance, template, changeSet) {
    const conflicts = [];
    const appliedChanges = [];

    // If specific changeSet provided, only sync those changes
    const changesToApply = changeSet || this.calculateRequiredChanges(instance, template);

    for (const change of changesToApply) {
        const { templateObjectId, property, newValue } = change;
        const instanceObjectId = instance.objectMapping.get(templateObjectId);

        if (!instanceObjectId) continue;

        // Check for override conflicts
        const overrideKey = `${templateObjectId}.${property}`;
        const existingOverride = instance.overrides.get(overrideKey);

        if (existingOverride && existingOverride.preserveOnSync) {
            conflicts.push({
                instanceObjectId,
                property,
                templateValue: newValue,
                overrideValue: existingOverride.value,
                resolution: 'preserve_override'
            });
            continue;
        }

        // Apply the change
        try {
            await this.applyInstanceChange(instanceObjectId, property, newValue);
            appliedChanges.push({ instanceObjectId, property, newValue });

        } catch (error) {
            conflicts.push({
                instanceObjectId,
                property,
                error: error.message,
                resolution: 'failed'
            });
        }
    }

    return {
        success: appliedChanges.length > 0,
        appliedChanges,
        conflicts,
        instanceId: instance.id
    };
}

calculateRequiredChanges(instance, template) {
    const changes = [];
    const currentSnapshot = template.snapshot;

    for (const [templateObjectId, instanceObjectId] of instance.objectMapping) {
        const templateObjectData = currentSnapshot.objects.get(templateObjectId);
        const instanceObjectData = this.sceneController.getObject(instanceObjectId);

        if (!templateObjectData || !instanceObjectData) continue;

        // Compare properties and identify differences
        const differences = this.compareObjectProperties(templateObjectData, instanceObjectData);

        for (const [property, templateValue] of differences) {
            // Skip if property is overridden
            const overrideKey = `${templateObjectId}.${property}`;
            if (instance.overrides.has(overrideKey)) continue;

            changes.push({
                templateObjectId,
                instanceObjectId,
                property,
                newValue: templateValue,
                changeType: 'property_update'
            });
        }
    }

    return changes;
}
```

### 4. Override Management
```javascript
async setInstanceOverride(instanceId, property, value, overrideType = OverrideType.PROPERTY) {
    const instance = this.instances.get(instanceId);
    if (!instance) {
        throw new Error(`Instance not found: ${instanceId}`);
    }

    if (instance.state === InstanceState.DISCONNECTED) {
        // For disconnected instances, just update the property directly
        return await this.updateInstanceProperty(instanceId, property, value);
    }

    const template = this.templates.get(instance.templateId);
    if (!template) {
        throw new Error(`Template not found: ${instance.templateId}`);
    }

    // Validate override is allowed
    if (template.protectedProperties.has(property)) {
        throw new Error(`Property '${property}' cannot be overridden`);
    }

    // Create override data
    const override = new OverrideData(property, value, overrideType);

    // Apply override to all relevant objects in instance
    const applicationResults = await this.applyOverrideToInstance(instance, override);

    if (applicationResults.success) {
        // Store override
        instance.overrides.set(property, override);
        instance.appliedOverrides.add(override.id);

        // Update instance state
        if (instance.state === InstanceState.CONNECTED) {
            instance.state = InstanceState.OVERRIDDEN;
        }

        // Notify listeners
        this.eventEmitter.emit('overrideApplied', {
            instanceId,
            property,
            value,
            overrideId: override.id
        });
    }

    return applicationResults;
}

async removeInstanceOverride(instanceId, property) {
    const instance = this.instances.get(instanceId);
    if (!instance) {
        throw new Error(`Instance not found: ${instanceId}`);
    }

    const override = instance.overrides.get(property);
    if (!override) {
        return { success: false, message: 'Override not found' };
    }

    // Revert to template value
    const template = this.templates.get(instance.templateId);
    const templateValue = await this.getTemplatePropertyValue(template, property);

    if (templateValue !== undefined) {
        await this.applyOverrideToInstance(instance, {
            property,
            value: templateValue,
            type: OverrideType.PROPERTY
        });
    }

    // Remove override
    instance.overrides.delete(property);
    instance.appliedOverrides.delete(override.id);

    // Update instance state
    if (instance.overrides.size === 0) {
        instance.state = InstanceState.CONNECTED;
    }

    // Notify listeners
    this.eventEmitter.emit('overrideRemoved', { instanceId, property });

    return { success: true };
}

async disconnectInstance(instanceId) {
    const instance = this.instances.get(instanceId);
    if (!instance) {
        throw new Error(`Instance not found: ${instanceId}`);
    }

    // Remove template-instance dependencies
    await this.removeInstanceDependencies(instance);

    // Update instance state
    instance.state = InstanceState.DISCONNECTED;

    // Clear override tracking (but keep current values)
    instance.overrides.clear();
    instance.appliedOverrides.clear();

    // Remove from template instances tracking
    const templateInstances = this.templateInstances.get(instance.templateId);
    if (templateInstances) {
        templateInstances.delete(instanceId);
    }

    // Notify listeners
    this.eventEmitter.emit('instanceDisconnected', { instanceId });

    return { success: true };
}
```

### 5. Template Library Management
```javascript
class TemplateLibrary {
    constructor() {
        this.templates = new Map();
        this.categories = new Map();
        this.tags = new Set();
        this.searchIndex = new Map();
    }

    async addTemplate(template) {
        this.templates.set(template.id, template);

        // Update categories
        if (!this.categories.has(template.category)) {
            this.categories.set(template.category, new Set());
        }
        this.categories.get(template.category).add(template.id);

        // Update tags
        for (const tag of template.tags) {
            this.tags.add(tag);
            if (!this.searchIndex.has(tag)) {
                this.searchIndex.set(tag, new Set());
            }
            this.searchIndex.get(tag).add(template.id);
        }

        // Update search index
        this.updateSearchIndex(template);
    }

    searchTemplates(query, filters = {}) {
        const results = new Set();

        // Text search
        if (query) {
            const queryTerms = query.toLowerCase().split(/\s+/);
            for (const term of queryTerms) {
                for (const [searchTerm, templateIds] of this.searchIndex) {
                    if (searchTerm.toLowerCase().includes(term)) {
                        for (const templateId of templateIds) {
                            results.add(templateId);
                        }
                    }
                }
            }
        }

        // Apply filters
        let filteredResults = query ? Array.from(results) : Array.from(this.templates.keys());

        if (filters.category) {
            const categoryTemplates = this.categories.get(filters.category);
            if (categoryTemplates) {
                filteredResults = filteredResults.filter(id => categoryTemplates.has(id));
            } else {
                filteredResults = [];
            }
        }

        if (filters.tags && filters.tags.length > 0) {
            filteredResults = filteredResults.filter(templateId => {
                const template = this.templates.get(templateId);
                return filters.tags.some(tag => template.tags.includes(tag));
            });
        }

        if (filters.type) {
            filteredResults = filteredResults.filter(templateId => {
                const template = this.templates.get(templateId);
                return template.type === filters.type;
            });
        }

        return filteredResults.map(id => this.templates.get(id));
    }

    exportTemplate(templateId, format = 'json') {
        const template = this.templates.get(templateId);
        if (!template) {
            throw new Error(`Template not found: ${templateId}`);
        }

        switch (format) {
            case 'json':
                return JSON.stringify(this.serializeTemplate(template), null, 2);

            case 'binary':
                return this.serializeTemplateBinary(template);

            default:
                throw new Error(`Unsupported export format: ${format}`);
        }
    }

    async importTemplate(templateData, format = 'json') {
        let template;

        switch (format) {
            case 'json':
                template = this.deserializeTemplate(JSON.parse(templateData));
                break;

            case 'binary':
                template = this.deserializeTemplateBinary(templateData);
                break;

            default:
                throw new Error(`Unsupported import format: ${format}`);
        }

        // Validate imported template
        const validationResult = await this.templateValidator.validate(template);
        if (!validationResult.isValid) {
            throw new Error(`Invalid template: ${validationResult.errors.join(', ')}`);
        }

        // Add to library
        await this.addTemplate(template);

        return template.id;
    }
}
```

## Integration Points

### Scene Controller Integration
```javascript
class SceneController {
    createComponentFromSelection(selectedObjects, templateConfig) {
        return this.componentTemplateManager.createTemplate(
            selectedObjects.map(obj => obj.id),
            templateConfig
        );
    }

    instantiateComponent(templateId, position) {
        return this.componentTemplateManager.instantiateTemplate(templateId, position);
    }

    updateComponentProperty(instanceId, property, value) {
        return this.componentTemplateManager.setInstanceOverride(instanceId, property, value);
    }
}
```

### Property Panel Integration
```javascript
class PropertyPanelHandler {
    handleTemplatePropertyUpdate(instanceId, property, value) {
        const instance = this.componentTemplateManager.getInstance(instanceId);

        if (instance.state === InstanceState.CONNECTED) {
            // Offer to create override
            this.showOverrideDialog(instanceId, property, value);
        } else {
            // Apply override directly
            this.componentTemplateManager.setInstanceOverride(instanceId, property, value);
        }
    }

    showOverrideDialog(instanceId, property, value) {
        // UI dialog for override confirmation
        const dialog = {
            message: `This will override the template property '${property}'. Continue?`,
            options: ['Create Override', 'Update Template', 'Cancel'],
            onSelect: (option) => {
                switch (option) {
                    case 'Create Override':
                        this.componentTemplateManager.setInstanceOverride(instanceId, property, value);
                        break;
                    case 'Update Template':
                        this.updateTemplateAndSync(instanceId, property, value);
                        break;
                }
            }
        };

        this.uiManager.showDialog(dialog);
    }
}
```

## File Structure
```
/application/systems/
├── component-template-manager.js    # Main manager class
├── template-definition.js           # Template structure
├── instance-data.js                 # Instance management
├── override-data.js                 # Override system
├── template-library.js              # Template storage and search
├── template-validator.js            # Template validation
└── template-serializer.js           # Import/export functionality
```

## Usage Examples

### Create Component Template
```javascript
// Create button component from selected objects
const templateId = await componentTemplateManager.createTemplate(
    ['button_bg', 'button_text', 'button_icon'],
    {
        name: 'Button Component',
        type: TemplateType.COMPONENT,
        metadata: {
            description: 'Reusable button with icon and text',
            category: 'ui_elements',
            tags: ['button', 'interactive'],
            overrideableProperties: ['text', 'color', 'size']
        }
    }
);
```

### Instantiate Template
```javascript
// Create instance of button component
const instanceId = await componentTemplateManager.instantiateTemplate(
    templateId,
    { x: 100, y: 50, z: 0 },
    new Map([
        ['text', 'Click Me'],
        ['color', '#007ACC']
    ])
);
```

### Update Template and Sync
```javascript
// Update template master and sync to all instances
await componentTemplateManager.updateTemplate(templateId, {
    'button_bg.material.color': '#FF6B6B'
});

await componentTemplateManager.syncTemplateToInstances(templateId);
```

### Override Instance Property
```javascript
// Override specific instance without affecting template
await componentTemplateManager.setInstanceOverride(
    instanceId,
    'button_text.content',
    'Custom Button Text'
);
```

### Disconnect Instance
```javascript
// Make instance independent of template
await componentTemplateManager.disconnectInstance(instanceId);
```

This component template system provides the foundation for sophisticated design system workflows while maintaining the flexibility needed for complex parametric design scenarios.